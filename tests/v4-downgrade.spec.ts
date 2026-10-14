import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonPlugin from '@deepseek-ai/dsh-storage-json'
import * as DomainPlugin from '@deepseek-ai/dsh-storage-domain'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, it, describe } from 'vitest'
import { stateSchema as legacySchema } from '../src/storage/v34-schema/state.ts'
import { storageAt, addCleanup, approved } from './helpers.ts'
import { legacyFixture, populatedV4, uid, at } from './downgrade-fixture.ts'
import { convertStorage, validateBundle } from '../src/storage/downgrade.ts'
import { createServices } from '../src/services/index.ts'
import { defaultTemplate } from '../src/render/docx.ts'
import { hashOf } from '../src/domain/v4-text.ts'

const legacyDomain = defineDomain({ name: 'marketpilot', version: 1, tables: { projects: domainTable<string, ReturnType<typeof legacySchema.parse>>(legacySchema) } })
async function legacyAt(directory: string) {
  const root = new Context()
  await root.plugin(Storage)
  await root.plugin(JsonPlugin, { root: directory })
  await root.plugin(DomainPlugin, { backend: 'json' })
  try {
    const domain = await root.storageDomain.open(legacyDomain)
    return { table: domain.table('projects'), close: async () => { await domain.close(); await root.fiber.dispose() } }
  } catch (error) { await root.fiber.dispose(); throw error }
}
const sha = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex')

it('reproduces unknown v4 rejection by the original V3.4 schema and official domain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'marketpilot-test-downgrade-'))
  try {
    const v3 = await legacyAt(directory)
    for (const state of legacyFixture()) await v3.table.put(state.project.id, legacySchema.parse(state))
    await v3.close()
    const v4 = await storageAt(directory, 'json')
    expect(v4.repository.list()).toEqual(legacyFixture())
    await v4.repository.update(uid(1), state => { state.v4 = populatedV4() })
    await v4.close()
    const sourceHash = await sha(join(directory, 'marketpilot.json'))
    const raw = JSON.parse(await readFile(join(directory, 'marketpilot.json'), 'utf8')).tables.projects[uid(1)]
    const parsed = legacySchema.safeParse(raw)
    expect(parsed.success).toBe(false)
    if (!parsed.success) expect(parsed.error.issues).toContainEqual(expect.objectContaining({ code: 'unrecognized_keys', keys: ['v4'] }))
    await expect(legacyAt(directory)).rejects.toMatchObject({ code: 'invalid-record', cause: expect.objectContaining({ issues: expect.arrayContaining([expect.objectContaining({ code: 'unrecognized_keys', keys: ['v4'] })]) }) })
    expect(await sha(join(directory, 'marketpilot.json'))).toBe(sourceHash)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

async function isolated() {
  const root = await mkdtemp(join(tmpdir(), 'marketpilot-test-downgrade-'))
  addCleanup(async () => {
    if (!root.startsWith(join(tmpdir(), 'marketpilot-test-downgrade-'))) throw new Error('Unsafe cleanup')
    await rm(root, { recursive: true, force: true })
  })
  const sourceDir = join(root, 'source')
  await mkdir(sourceDir)
  const v3 = await legacyAt(sourceDir)
  for (const state of legacyFixture()) await v3.table.put(state.project.id, legacySchema.parse(state))
  await v3.close()
  const v4 = await storageAt(sourceDir, 'json')
  await v4.repository.update(uid(1), state => { state.v4 = populatedV4() })
  await v4.close()
  return { root, source: join(sourceDir, 'marketpilot.json'), output: join(root, 'downgrade') }
}
async function cloneV3(root: string, output: string, name = 'v3-work') {
  const directory = join(root, name)
  await mkdir(directory)
  const source = join(directory, 'marketpilot.json')
  await copyFile(join(output, 'v3/marketpilot.json'), source)
  return { directory, source }
}

it('pins all original V3.4 schema source bytes to their recorded SHA-256', async () => {
  const provenance = JSON.parse(await readFile(new URL('../src/storage/v34-schema/provenance.json', import.meta.url), 'utf8'))
  expect(provenance.commit).toBe('9aae1d851346d41d191f447e4f7282ddf285771d')
  expect(Object.keys(provenance.files)).toHaveLength(10)
  for (const [file, stamp] of Object.entries(provenance.files)) {
    expect(createHash('sha256').update(await readFile(new URL(`../src/storage/v34-schema/${file}`, import.meta.url))).digest('hex')).toBe((stamp as { sha256: string }).sha256)
  }
})

it('runs two V3 → V4 → V3 → V4 cycles with durable writes, exact records, V1/V2 and DOCX recovery', async () => {
  const { root, source: firstSource } = await isolated()
  let source = firstSource
  const trace = []
  for (const round of [1, 2]) {
    const v4 = await storageAt(join(source, '..'), 'json')
    const services = createServices(v4.repository, approved, () => new Date(at))
    if (round === 1) {
      const template = await services.v4.docs.uploadTemplate(uid(1), { name: 'Synthetic template', fileName: 'synthetic.docx', dataBase64: Buffer.from(defaultTemplate()).toString('base64') })
      await services.v4.docs.update(uid(1), uid(35), { templateId: template.id })
    } else {
      await v4.repository.update(uid(1), state => { state.v4!.costLines[0]!.unitPrice = '1200' })
    }
    const docBefore = await services.v4.docs.exportDocx(uid(1), uid(35))
    expect(Buffer.from(docBefore.bytes).subarray(0, 2).toString()).toBe('PK')
    const before = v4.repository.list()
    const baselineHash = hashOf(before[0]!.v4!.baselines)
    await v4.close()
    const originalSha = await sha(source)
    const output = join(root, `bundle-${round}`)
    const result = await convertStorage({ mode: 'downgrade', source, output })
    expect(await sha(source)).toBe(originalSha)
    expect(await readFile(join(output, 'backup/marketpilot.json'))).toEqual(await readFile(source))
    expect((await convertStorage({ mode: 'downgrade', source, output })).reused).toBe(true)
    const work = await cloneV3(root, output, `v3-work-${round}`)
    const v3 = await legacyAt(work.directory)
    expect(v3.table.size).toBe(2)
    for (const state of before) {
      const { v4: _omit, ...legacy } = state
      expect(v3.table.get(state.project.id)).toEqual(legacy)
    }
    await v3.table.update(uid(1), current => legacySchema.parse({ ...current, revision: current.revision + 1,
      project: { ...current.project, description: `V3 durable write, round ${round}` } }))
    const afterV3 = [...v3.table.entries()].map(([, state]) => structuredClone(state))
    await v3.close()
    const v3Sha = await sha(work.source)
    const restored = join(root, `restored-${round}`)
    await convertStorage({ mode: 'restore', source: work.source, output: restored, bundle: output })
    expect(await sha(work.source)).toBe(v3Sha)
    expect((await convertStorage({ mode: 'restore', source: work.source, output: restored, bundle: output })).reused).toBe(true)
    const workV4 = join(root, `v4-work-${round}`)
    await mkdir(workV4)
    await copyFile(join(restored, 'v4/marketpilot.json'), join(workV4, 'marketpilot.json'))
    const back = await storageAt(workV4, 'json')
    const recovered = back.repository.list()
    for (const state of recovered) {
      const { v4: extra, ...legacy } = state
      expect(legacy).toEqual(afterV3.find(s => s.project.id === state.project.id))
      expect(extra).toEqual(before.find(s => s.project.id === state.project.id)!.v4)
    }
    expect(hashOf(recovered[0]!.v4!.baselines)).toBe(baselineHash)
    for (const baseline of recovered[0]!.v4!.baselines) expect(hashOf(baseline.snapshot)).toBe(baseline.snapshotHash)
    const docAfter = await createServices(back.repository, approved, () => new Date(at)).v4.docs.exportDocx(uid(1), uid(35))
    expect(docAfter.bytes).toEqual(docBefore.bytes)
    await back.close()
    await validateBundle(output)
    await validateBundle(restored)
    trace.push({ round, originalSha, v3Sha, v4Hash: result.manifest.summary[uid(1)]!.v4Hash,
      baselineHash, docxSha: createHash('sha256').update(docBefore.bytes).digest('hex'), summary: result.manifest.summary })
    source = join(workV4, 'marketpilot.json')
  }
  process.stdout.write('DOWNGRADE_TWO_ROUNDS_EVIDENCE ' + JSON.stringify(trace) + '\n')
})

it('dry-run leaves the source and filesystem unchanged', async () => {
  const { root, source, output } = await isolated()
  const before = await sha(source)
  const listing = await readdir(root)
  expect((await convertStorage({ mode: 'downgrade', source, output, dryRun: true })).dryRun).toBe(true)
  expect(await readdir(root)).toEqual(listing)
  expect(await sha(source)).toBe(before)
})

describe.each(['backup', 'validated', 'before-publish'] as const)('interruption at %s', stage => {
  it('publishes no partial bundle, preserves source, and permits a clean retry', async () => {
    const { root, source, output } = await isolated()
    const before = await sha(source)
    await expect(convertStorage({ mode: 'downgrade', source, output, checkpoint: async current => {
      if (current === stage) throw new Error('Synthetic interruption')
    } })).rejects.toThrow('Synthetic interruption')
    expect(await sha(source)).toBe(before)
    expect(await readdir(root)).toEqual(['source'])
    await convertStorage({ mode: 'downgrade', source, output })
    await validateBundle(output)
  })
})

it('blocks source changes detected before publication', async () => {
  const { root, source, output } = await isolated()
  const changed = Buffer.concat([await readFile(source), Buffer.from(' ')])
  await expect(convertStorage({ mode: 'downgrade', source, output, checkpoint: async stage => {
    if (stage === 'before-publish') await writeFile(source, changed)
  } })).rejects.toMatchObject({ code: 'SOURCE_CHANGED' })
  expect(await readFile(source)).toEqual(changed)
  expect(await readdir(root)).toEqual(['source'])
})

it('does not overwrite a completed bundle when two converters race for one output', async () => {
  const { source, output } = await isolated()
  const before = await sha(source)
  const results = await Promise.allSettled([
    convertStorage({ mode: 'downgrade', source, output }),
    convertStorage({ mode: 'downgrade', source, output }),
  ])
  expect(results.some(r => r.status === 'fulfilled')).toBe(true)
  await validateBundle(output)
  expect(await sha(source)).toBe(before)
})

it.each(['backup', 'validated', 'before-publish'] as const)('restore interrupted at %s preserves both sources and supports retry', async stage => {
  const { root, source, output } = await isolated()
  await convertStorage({ mode: 'downgrade', source, output })
  const work = await cloneV3(root, output)
  const before = await sha(work.source)
  const restored = join(root, 'restored')
  await expect(convertStorage({ mode: 'restore', source: work.source, output: restored, bundle: output, checkpoint: async current => {
    if (current === stage) throw new Error('Synthetic restore interruption')
  } })).rejects.toThrow('Synthetic restore interruption')
  expect(await sha(work.source)).toBe(before)
  expect(await readdir(root)).toEqual(['downgrade', 'source', 'v3-work'])
  await validateBundle(output)
  await convertStorage({ mode: 'restore', source: work.source, output: restored, bundle: output })
  await validateBundle(restored)
})

it('rejects checksum tampering and incomplete bundles without writing source', async () => {
  const { root, source, output } = await isolated()
  await convertStorage({ mode: 'downgrade', source, output })
  const before = await sha(source)
  await writeFile(join(output, 'v4-sidecar.json'), '{}')
  await expect(validateBundle(output)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' })
  const orphan = join(root, 'orphan.pending-test')
  await mkdir(orphan)
  await writeFile(join(orphan, 'marketpilot.json'), await readFile(source))
  await expect(validateBundle(orphan)).rejects.toThrow()
  expect(await sha(source)).toBe(before)
})

it('blocks deleted projects and V3 edits that break preserved V4 references', async () => {
  const { root, source, output } = await isolated()
  await convertStorage({ mode: 'downgrade', source, output })
  const work = await cloneV3(root, output)
  const raw = JSON.parse(await readFile(work.source, 'utf8'))
  delete raw.tables.projects[uid(20)]
  await writeFile(work.source, JSON.stringify(raw))
  await expect(convertStorage({ mode: 'restore', source: work.source, output: join(root, 'restore-deleted'), bundle: output })).rejects.toMatchObject({ code: 'MISSING_PROJECT' })
  raw.tables.projects[uid(20)] = legacyFixture()[1]
  await writeFile(work.source, JSON.stringify(raw))
  // The empty project has no V3 references to this added document. V4 alone refers to it.
  const extra = { ...raw.tables.projects[uid(1)].documents[0], id: uid(99) }
  const full = JSON.parse(await readFile(source, 'utf8'))
  full.tables.projects[uid(1)].documents.push(extra)
  full.tables.projects[uid(1)].v4.findings[0].source.documentId = uid(99)
  await writeFile(source, JSON.stringify(full))
  const bundle2 = join(root, 'bundle2')
  await convertStorage({ mode: 'downgrade', source, output: bundle2 })
  await expect(convertStorage({ mode: 'restore', source: work.source, output: join(root, 'restore-broken'), bundle: bundle2 })).rejects.toMatchObject({ code: 'INVALID_DATA' })
})

it('retains new V3 projects on recovery without attaching another project V4 data', async () => {
  const { root, source, output } = await isolated()
  await convertStorage({ mode: 'downgrade', source, output })
  const work = await cloneV3(root, output)
  const v3 = await legacyAt(work.directory)
  const added = legacySchema.parse({ ...legacyFixture()[1], project: { ...legacyFixture()[1]!.project, id: uid(100) } })
  await v3.table.put(uid(100), added)
  await v3.close()
  const restored = join(root, 'restored')
  await convertStorage({ mode: 'restore', source: work.source, output: restored, bundle: output })
  const v4 = await storageAt(join(restored, 'v4'), 'json')
  expect(v4.repository.list()).toHaveLength(3)
  expect(v4.repository.get(uid(100))).toEqual(added)
  await v4.close()
})

it('refuses existing foreign outputs, input aliases, and writes inside source storage', async () => {
  const { root, source, output } = await isolated()
  await mkdir(output)
  await writeFile(join(output, 'user-data.txt'), 'Keep me')
  await expect(convertStorage({ mode: 'downgrade', source, output })).rejects.toThrow()
  expect(await readFile(join(output, 'user-data.txt'), 'utf8')).toBe('Keep me')
  await expect(convertStorage({ mode: 'downgrade', source, output: join(root, 'source/output') })).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT' })
  await expect(convertStorage({ mode: 'downgrade', source, output: join(root, 'source/../source') })).rejects.toMatchObject({ code: 'UNSAFE_OUTPUT' })
})

it.each(['unknown-field', 'wrong-key', 'wrong-version', 'unknown-table', 'invalid-json', 'lossy-trim'])('fails closed for %s', async kind => {
  const { root, source, output } = await isolated()
  const raw = JSON.parse(await readFile(source, 'utf8'))
  if (kind === 'unknown-field') raw.tables.projects[uid(1)].future = true
  if (kind === 'wrong-key') { raw.tables.projects[uid(99)] = raw.tables.projects[uid(1)]; delete raw.tables.projects[uid(1)] }
  if (kind === 'wrong-version') raw.unit.version = 2
  if (kind === 'unknown-table') raw.tables.unknown = { preserve: 'me' }
  if (kind === 'lossy-trim') raw.tables.projects[uid(1)].project.name = ' padded '
  await writeFile(source, kind === 'invalid-json' ? '{' : JSON.stringify(raw))
  const before = await sha(source)
  await expect(convertStorage({ mode: 'downgrade', source, output })).rejects.toThrow()
  expect(await sha(source)).toBe(before)
  expect(await readdir(root)).toEqual(['source'])
})

it.skipIf(!process.env.MARKETPILOT_LEGACY_STORE)('round-trips a copy of the old production backup without changing any old project or the backup bytes', async () => {
  const original = join(process.env.MARKETPILOT_LEGACY_STORE!, 'marketpilot.json')
  const beforeSha = await sha(original)
  const root = await mkdtemp(join(tmpdir(), 'marketpilot-test-downgrade-'))
  try {
    const sourceDir = join(root, 'backup-copy')
    await mkdir(sourceDir)
    const source = join(sourceDir, 'marketpilot.json')
    await copyFile(original, source)
    expect(await sha(source)).toBe(beforeSha)
    const old = await legacyAt(sourceDir)
    const oldHashes = Object.fromEntries([...old.table.entries()].map(([id, state]) => [id, hashOf(state)]))
    const oldCount = old.table.size
    expect(oldCount).toBeGreaterThan(0)
    await old.close()
    const v4 = await storageAt(sourceDir, 'json')
    for (const state of legacyFixture()) await v4.repository.create(state)
    await v4.repository.update(uid(1), state => { state.v4 = populatedV4() })
    await v4.close()
    const output = join(root, 'bundle')
    await convertStorage({ mode: 'downgrade', source, output })
    const work = await cloneV3(root, output)
    const v3 = await legacyAt(work.directory)
    expect(v3.table.size).toBe(oldCount + 2)
    for (const [id, hash] of Object.entries(oldHashes)) expect(hashOf(v3.table.get(id))).toBe(hash)
    await v3.close()
    const restored = join(root, 'restored')
    await convertStorage({ mode: 'restore', source: work.source, output: restored, bundle: output })
    const reopened = await storageAt(join(restored, 'v4'), 'json')
    expect(reopened.repository.list()).toHaveLength(oldCount + 2)
    for (const [id, hash] of Object.entries(oldHashes)) expect(hashOf(reopened.repository.get(id))).toBe(hash)
    expect(hashOf(reopened.repository.get(uid(1))!.v4)).toBe(hashOf(populatedV4()))
    await reopened.close()
    process.stdout.write('REAL_BACKUP_COPY_EVIDENCE ' + JSON.stringify({ originalSha256: beforeSha, originalProjects: oldCount,
      trialProjects: oldCount + 2, allOriginalProjectHashesUnchanged: true, sourceUnchanged: (await sha(original)) === beforeSha }) + '\n')
  } finally {
    expect(await sha(original)).toBe(beforeSha)
    if (!root.startsWith(join(tmpdir(), 'marketpilot-test-downgrade-'))) throw new Error('Unsafe cleanup')
    await rm(root, { recursive: true, force: true })
  }
}, 60_000)
