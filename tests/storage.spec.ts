import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createServices } from '../src/services/index.ts'
import { setup, storageAt, requirement, evidence } from './helpers.ts'

describe.each(['sqlite', 'json'] as const)('%s durable storage', medium => {
  it('rejects concurrent duplicate project creation instead of overwriting', async () => {
    const { repository, project: p } = await setup(medium)
    const first = repository.get(p.id)!
    first.project.id = randomUUID()
    first.project.name = 'first'
    const duplicate = structuredClone(first)
    duplicate.project.name = 'second'
    const results = await Promise.allSettled([repository.create(first), repository.create(duplicate)])
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
    expect(repository.get(first.project.id)?.project.name).toBe('first')
  })
  it('reopens persisted projects and records through a new provider', async () => {
    const { close, directory, services: s, project: p } = await setup(medium)
    await s.requirements.addMany(p.id, [requirement])
    await s.evidence.add(p.id, evidence)
    await close()
    const reopened = await storageAt(directory, medium)
    try {
      const services = createServices(reopened.repository)
      expect(services.projects.get(p.id)?.name).toBe(p.name)
      expect(services.requirements.list(p.id)).toHaveLength(1)
      expect(services.evidence.list(p.id)).toHaveLength(1)
    } finally { await reopened.close() }
  })
  it('serializes concurrent project changes without losing additions', async () => {
    const { services: s, project: p } = await setup(medium)
    await Promise.all(Array.from({ length: 16 }, (_, i) => s.requirements.addMany(p.id, [{ ...requirement, normalizedText: `需求 ${i}` }])))
    expect(s.requirements.list(p.id)).toHaveLength(16)
    expect(new Set(s.requirements.list(p.id).map(r => r.normalizedText)).size).toBe(16)
  })
  it('keeps durable state unchanged when validation rejects a mutation', async () => {
    const { services: s, repository, project: p, directory, close } = await setup(medium)
    const before = repository.get(p.id)
    await expect(repository.update(p.id, state => { state.project.name = '' })).rejects.toThrow()
    expect(repository.get(p.id)).toEqual(before)
    await s.projects.update(p.id, { description: 'write queue remains usable' })
    await close()
    const reopened = await storageAt(directory, medium)
    try { expect(reopened.repository.get(p.id)?.project.name).toBe(p.name) }
    finally { await reopened.close() }
  })
  it('drains queued writes on close and rejects later use', async () => {
    const { services: s, repository, project: p, close, directory } = await setup(medium)
    const pending = s.requirements.addMany(p.id, [requirement])
    await close()
    await pending
    expect(() => repository.get(p.id)).toThrow(/closed/)
    const reopened = await storageAt(directory, medium)
    try { expect(reopened.repository.get(p.id)?.requirements).toHaveLength(1) }
    finally { await reopened.close() }
  })
  it('pins a persisted code book without growing it on no-op writes', async () => {
    const { services: s, repository, project: p } = await setup(medium)
    await s.requirements.addMany(p.id, [requirement])
    const book = repository.get(p.id)?.codeBook
    expect(book?.codes).toHaveProperty([s.requirements.list(p.id)[0]!.id], 'REQ-01')
    const revision = repository.get(p.id)!.revision
    // A write that adds no records must not touch the book or reorder codes.
    await s.projects.update(p.id, { description: 'no new records' })
    expect(repository.get(p.id)!.codeBook).toEqual(book)
    expect(repository.get(p.id)!.revision).toBe(revision + 1)
  })
  it('never renumbers a code after a sibling record is deleted', async () => {
    const { services: s, repository, project: p, advance } = await setup(medium)
    const [first] = await s.requirements.addMany(p.id, [requirement])
    advance(1000)
    const [second] = await s.requirements.addMany(p.id, [{ ...requirement, normalizedText: '第二条需求' }])
    const codeOfSecond = repository.get(p.id)!.codeBook?.codes[second!.id]
    expect(codeOfSecond).toBe('REQ-02')
    await s.requirements.delete(p.id, first!.id)
    // The survivor keeps REQ-02; a new record continues at REQ-03.
    expect(repository.get(p.id)!.codeBook?.codes[second!.id]).toBe('REQ-02')
    advance(1000)
    const [third] = await s.requirements.addMany(p.id, [{ ...requirement, normalizedText: '第三条需求' }])
    expect(repository.get(p.id)!.codeBook?.codes[third!.id]).toBe('REQ-03')
  })
})

it('rejects corrupt JSON data on reopen instead of silently resetting the store', async () => {
  const { close, directory, repository, project: p } = await setup('json')
  const state = repository.get(p.id)!
  await close()
  const path = join(directory, 'marketpilot.json')
  const original = await readFile(path, 'utf8')
  const broken = original.replace(state.project.name, '')
  await writeFile(path, broken)
  await expect(storageAt(directory, 'json')).rejects.toThrow(/invalid|validation|record/i)
  expect(await readFile(path, 'utf8')).toBe(broken)
})

it('retains the previous SQLite record when the backend rejects a write', async () => {
  const { services: s, repository, project: p, directory } = await setup('sqlite')
  const before = repository.get(p.id)
  const other = new DatabaseSync(join(directory, 'marketpilot.db'))
  try {
    other.exec('BEGIN IMMEDIATE')
    await expect(s.projects.update(p.id, { name: 'must not land' })).rejects.toThrow(/locked|busy/)
    expect(repository.get(p.id)).toEqual(before)
    other.exec('ROLLBACK')
    await s.projects.update(p.id, { name: 'retry works' })
    expect(s.projects.get(p.id)?.name).toBe('retry works')
  } finally { other.close() }
})
