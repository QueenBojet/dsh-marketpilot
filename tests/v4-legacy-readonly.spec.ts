/**
 * §7.1 step 9: open a copy of a real V3.4 JSON store and check that every V4 read model loads.
 * Opt-in (MARKETPILOT_LEGACY_STORE=<dir containing marketpilot.json>). The source directory is
 * never written: the file is copied to a temp directory and its hash is compared afterwards.
 * Only counts and names are printed; no document content leaves the process.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { storageAt, approved } from './helpers.ts'
import { createServices } from '../src/services/index.ts'

const source = process.env.MARKETPILOT_LEGACY_STORE
const hash = async (p: string) => createHash('sha256').update(await readFile(p)).digest('hex')

describe('V4 over legacy V3.4 data (read-only copy)', () => {
  it.skipIf(!source)('loads every legacy project through the V4 read models', async () => {
    const original = join(source!, 'marketpilot.json')
    const before = await hash(original)
    const directory = await mkdtemp(join(tmpdir(), 'marketpilot-test-legacy-'))
    try {
      await copyFile(original, join(directory, 'marketpilot.json'))
      const storage = await storageAt(directory, 'json')
      try {
        const s = createServices(storage.repository, approved)
        const projects = storage.repository.list()
        expect(projects.length).toBeGreaterThan(0)
        for (const p of projects) {
          const id = p.project.id
          const row = {
            name: p.project.name, documents: p.documents.length, requirements: p.requirements.length,
            evidence: p.evidence.length, alternatives: p.alternatives.length, decisions: p.decisions.length,
            v4: p.v4 ? 'present' : 'absent', route: s.v4.solution.route(id).confirmed ? 'confirmed' : 'none',
            costLines: s.v4.solution.cost(id).result.lines.length, docs: s.v4.docs.list(id).length,
            baselines: s.v4.baselines.list(id).length, fullBlockers: s.v4.baselines.checks(id, 'full').length,
          }
          console.log(JSON.stringify(row))
        }
      } finally { await storage.close() }
    } finally { await rm(directory, { recursive: true, force: true }) }
    expect(await hash(original)).toBe(before)
  }, 60_000)
})
