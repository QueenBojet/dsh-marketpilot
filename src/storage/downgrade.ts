/** Offline, copy-only JSON rollback. Never writes a source or a live storage root. */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { z } from 'zod'
import { stateSchema, type ProjectState } from '../domain/state.ts'
import { v4StateSchema } from '../domain/v4.ts'
import { hashOf } from '../domain/v4-text.ts'
import { stateSchema as v34Schema } from './v34-schema/state.ts'

export const V34_COMMIT = '9aae1d851346d41d191f447e4f7282ddf285771d'
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const keySchema = z.string().regex(/^[a-zA-Z0-9_-]+$/)
const envelopeSchema = z.strictObject({
  unit: z.strictObject({ name: z.literal('marketpilot'), version: z.literal(1) }),
  global: z.null(), tables: z.strictObject({ projects: z.record(keySchema, z.unknown()) }),
})
const sidecarSchema = z.strictObject({
  format: z.literal(1), sourceSha256: hashSchema,
  projects: z.record(keySchema, z.strictObject({ legacyHash: hashSchema, v4: v4StateSchema.optional() })),
})
const manifestSchema = z.strictObject({
  format: z.literal(1), mode: z.enum(['downgrade', 'restore']), schemaCommit: z.literal(V34_COMMIT),
  source: z.strictObject({ sha256: hashSchema, bytes: z.number().int().nonnegative(), modifiedAt: z.string() }),
  files: z.record(z.string(), z.strictObject({ sha256: hashSchema, bytes: z.number().int().nonnegative() })),
  summary: z.record(keySchema, z.strictObject({ legacyHash: hashSchema, v4Hash: hashSchema.optional(),
    counts: z.record(z.string(), z.number().int().nonnegative()) })),
})
type Manifest = z.infer<typeof manifestSchema>
type Envelope = z.infer<typeof envelopeSchema>
export class DowngradeError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'DowngradeError' }
}
function requireCondition(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new DowngradeError(code, message)
}
function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  requireCondition(result.success, 'INVALID_DATA', `${label} failed schema validation; no output was published.`)
  return result.data
}
function json(bytes: Buffer, label: string): unknown {
  try { return JSON.parse(bytes.toString('utf8')) }
  catch { throw new DowngradeError('INVALID_JSON', `${label} is not valid JSON.`) }
}
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const encode = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n')
function legacyOf(state: ProjectState) { const { v4: _v4, ...legacy } = state; return legacy }
function statesOf(envelope: Envelope, legacyOnly = false): Record<string, ProjectState> {
  return Object.fromEntries(Object.entries(envelope.tables.projects).map(([id, raw]) => {
    const state = parse(legacyOnly ? v34Schema : stateSchema, raw, `Project ${id}`)
    requireCondition(state.project.id === id, 'KEY_MISMATCH', `Project ${id} does not match its storage key.`)
    // Schema transforms/defaults must never silently alter preserved source data.
    requireCondition(hashOf(state) === hashOf(raw), 'LOSSY_PARSE', `Project ${id} requires an explicit migration.`)
    return [id, state]
  }))
}
function summary(states: Record<string, ProjectState>): Manifest['summary'] {
  return Object.fromEntries(Object.entries(states).map(([id, state]) => [id, {
    legacyHash: hashOf(legacyOf(state)), ...state.v4 ? { v4Hash: hashOf(state.v4) } : {},
    counts: Object.fromEntries([
      ...Object.entries(state).filter(([, rows]) => Array.isArray(rows)).map(([kind, rows]) => [kind, (rows as unknown[]).length]),
      ...Object.entries(state.v4 ?? {}).filter(([, rows]) => Array.isArray(rows)).map(([kind, rows]) => [`v4_${kind}`, (rows as unknown[]).length]),
    ]),
  }]))
}
async function exists(path: string) {
  try { await stat(path); return true }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
}
/** Resolve junctions/symlinks even for an output that does not exist yet. */
async function canonical(path: string): Promise<string> {
  const absolute = resolve(path)
  if (await exists(absolute)) return realpath(absolute)
  const parent = dirname(absolute)
  requireCondition(parent !== absolute, 'INVALID_PATH', 'Cannot resolve output path.')
  return join(await canonical(parent), basename(absolute))
}
function inside(path: string, root: string) {
  const rel = relative(root, path)
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))
}
const filesFor = (mode: Manifest['mode']) => ['backup/marketpilot.json', `${mode === 'downgrade' ? 'v3' : 'v4'}/marketpilot.json`, 'v4-sidecar.json']

/** Check every archived byte before reuse/restoration; paths are a fixed allowlist. */
export async function validateBundle(directory: string) {
  const manifest = parse(manifestSchema, json(await readFile(join(directory, 'manifest.json')), 'Manifest'), 'Manifest')
  const expected = filesFor(manifest.mode)
  requireCondition(Object.keys(manifest.files).sort().join('|') === [...expected].sort().join('|'), 'INVALID_BUNDLE', 'Unexpected bundle file list.')
  const files: Record<string, Buffer> = {}
  for (const name of expected) {
    const bytes = await readFile(join(directory, name))
    const stamp = manifest.files[name]!
    requireCondition(bytes.length === stamp.bytes && sha(bytes) === stamp.sha256, 'CHECKSUM_MISMATCH', `Checksum mismatch: ${name}.`)
    files[name] = bytes
  }
  requireCondition(sha(files['backup/marketpilot.json']!) === manifest.source.sha256, 'INVALID_BUNDLE', 'Backup does not match source checksum.')
  const backup = parse(envelopeSchema, json(files['backup/marketpilot.json']!, 'Backup'), 'Backup')
  const projected = parse(envelopeSchema, json(files[expected[1]!]!, 'Projection'), 'Projection')
  const sidecar = parse(sidecarSchema, json(files['v4-sidecar.json']!, 'Sidecar'), 'Sidecar')
  const saved = statesOf(backup, manifest.mode === 'restore')
  const output = statesOf(projected, manifest.mode === 'downgrade')
  if (manifest.mode === 'downgrade') {
    requireCondition(sidecar.sourceSha256 === manifest.source.sha256, 'INVALID_BUNDLE', 'Sidecar source checksum differs.')
    requireCondition(hashOf(summary(saved)) === hashOf(manifest.summary), 'INVALID_BUNDLE', 'Summary differs from backup.')
    requireCondition(Object.keys(saved).sort().join('|') === Object.keys(sidecar.projects).sort().join('|'), 'INVALID_BUNDLE', 'Sidecar project set differs.')
    for (const [id, state] of Object.entries(saved)) {
      requireCondition(hashOf(output[id]) === hashOf(legacyOf(state)), 'INVALID_BUNDLE', `Legacy projection differs: ${id}.`)
      requireCondition(sidecar.projects[id]?.legacyHash === hashOf(legacyOf(state)) && hashOf(sidecar.projects[id]?.v4) === hashOf(state.v4), 'INVALID_BUNDLE', `Sidecar differs: ${id}.`)
    }
    requireCondition(Object.keys(saved).length === Object.keys(output).length, 'INVALID_BUNDLE', 'Projection project count differs.')
  } else {
    requireCondition(hashOf(summary(output)) === hashOf(manifest.summary), 'INVALID_BUNDLE', 'Restored summary differs.')
    requireCondition(Object.keys(saved).sort().join('|') === Object.keys(output).sort().join('|'), 'INVALID_BUNDLE', 'Restored project set differs.')
    for (const [id, state] of Object.entries(output)) {
      requireCondition(hashOf(legacyOf(state)) === hashOf(saved[id]) && hashOf(state.v4) === hashOf(sidecar.projects[id]?.v4), 'INVALID_BUNDLE', `Restored state differs: ${id}.`)
    }
  }
  return { manifest, sidecar, files }
}

export interface ConvertOptions {
  mode: 'downgrade' | 'restore'
  source: string
  output: string
  bundle?: string
  dryRun?: boolean
  /** Test seam for failures before commit; production CLI never exposes it. */
  checkpoint?: (stage: 'backup' | 'validated' | 'before-publish') => Promise<void>
}

export async function convertStorage(options: ConvertOptions) {
  const source = await realpath(resolve(options.source))
  const output = await canonical(options.output)
  requireCondition(!inside(output, dirname(source)) && !inside(source, output), 'UNSAFE_OUTPUT', 'Output must be outside the source storage directory.')
  const bytes = await readFile(source)
  const sourceHash = sha(bytes)
  const sourceStat = await stat(source)
  const envelope = parse(envelopeSchema, json(bytes, 'Source'), 'Source')
  const states = statesOf(envelope, options.mode === 'restore')
  let sidecar: z.infer<typeof sidecarSchema>
  let projected: Record<string, ProjectState>
  if (options.mode === 'downgrade') {
    sidecar = { format: 1, sourceSha256: sourceHash, projects: Object.fromEntries(Object.entries(states).map(([id, state]) => [id, {
      legacyHash: hashOf(legacyOf(state)), ...state.v4 ? { v4: state.v4 } : {},
    }])) }
    projected = Object.fromEntries(Object.entries(states).map(([id, state]) => [id, parse(v34Schema, legacyOf(state), `V3.4 project ${id}`)]))
  } else {
    requireCondition(options.bundle, 'BUNDLE_REQUIRED', 'Restore requires the original downgrade bundle.')
    const bundle = await realpath(resolve(options.bundle))
    requireCondition(!inside(output, bundle) && !inside(bundle, output), 'UNSAFE_OUTPUT', 'Output must be outside the original bundle.')
    const validated = await validateBundle(bundle)
    requireCondition(validated.manifest.mode === 'downgrade', 'INVALID_BUNDLE', 'Restore requires a downgrade bundle.')
    sidecar = validated.sidecar
    for (const id of Object.keys(sidecar.projects)) requireCondition(states[id], 'MISSING_PROJECT', `Original project ${id} was deleted; restore blocked.`)
    projected = Object.fromEntries(Object.entries(states).map(([id, state]) => [id, parse(stateSchema, {
      ...state, ...sidecar.projects[id]?.v4 ? { v4: sidecar.projects[id]!.v4 } : {},
    }, `Restored project ${id}; retained V4 references must remain valid`)]))
  }
  const serialized = encode({ ...envelope, tables: { projects: projected } })
  // Verify exact legacy preservation and full V4 identity, including baseline snapshots.
  for (const [id, state] of Object.entries(states)) requireCondition(hashOf(legacyOf(projected[id]!)) === hashOf(legacyOf(state)), 'LOSSY_CONVERSION', `Legacy state differs: ${id}.`)
  const fileNames = filesFor(options.mode)
  const files = { 'backup/marketpilot.json': bytes, [fileNames[1]!]: serialized, 'v4-sidecar.json': encode(sidecar) }
  const manifest: Manifest = { format: 1, mode: options.mode, schemaCommit: V34_COMMIT,
    source: { sha256: sourceHash, bytes: bytes.length, modifiedAt: sourceStat.mtime.toISOString() },
    files: Object.fromEntries(Object.entries(files).map(([name, data]) => [name, { sha256: sha(data), bytes: data.length }])),
    summary: summary(options.mode === 'downgrade' ? states : projected),
  }
  if (await exists(output)) {
    const previous = await validateBundle(output)
    requireCondition(hashOf(previous.manifest) === hashOf(manifest), 'OUTPUT_EXISTS', 'Output already exists for different inputs; choose a new directory.')
    return { dryRun: !!options.dryRun, reused: true, output, manifest }
  }
  requireCondition(await exists(dirname(output)), 'OUTPUT_PARENT_MISSING', 'Create the output parent directory first.')
  if (options.dryRun) return { dryRun: true, reused: false, output, manifest }
  const pending = join(dirname(output), `${basename(output)}.pending-${randomUUID()}`)
  await mkdir(pending, { mode: 0o700 })
  try {
    for (const [name, data] of Object.entries(files)) {
      const path = join(pending, name)
      await mkdir(dirname(path), { recursive: true, mode: 0o700 })
      const handle = await open(path, 'wx', 0o600)
      try { await handle.writeFile(data); await handle.sync() } finally { await handle.close() }
      if (name === 'backup/marketpilot.json') await options.checkpoint?.('backup')
    }
    const handle = await open(join(pending, 'manifest.json'), 'wx', 0o600)
    try { await handle.writeFile(encode(manifest)); await handle.sync() } finally { await handle.close() }
    await validateBundle(pending)
    await options.checkpoint?.('validated')
    await options.checkpoint?.('before-publish')
    requireCondition(sha(await readFile(source)) === sourceHash, 'SOURCE_CHANGED', 'Source changed during conversion; output was not published. Stop its writer and retry.')
    requireCondition(!(await exists(output)), 'OUTPUT_EXISTS', 'Output appeared during conversion; refusing to replace it.')
    await rename(pending, output)
    return { dryRun: false, reused: false, output, manifest }
  } finally {
    // Only the exact randomly-created staging directory is eligible for cleanup.
    requireCondition(dirname(pending) === dirname(output) && basename(pending).startsWith(`${basename(output)}.pending-`), 'UNSAFE_CLEANUP', 'Unsafe staging path.')
    await rm(pending, { recursive: true, force: true })
  }
}
