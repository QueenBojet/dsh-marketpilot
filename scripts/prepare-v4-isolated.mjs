/** Prepare, without launching, a sanitized clone for Desktop-hosted GUI acceptance. */
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { convertStorage } from '../lib/storage/downgrade.js'

const { values } = parseArgs({ options: { profile: { type: 'string' }, backup: { type: 'string' } } })
if (!values.profile || !values.backup) throw new Error('Use --profile <existing profile directory> --backup <old marketpilot.json backup>.')
const profileSource = await realpath(values.profile)
const backupSource = await realpath(values.backup)
const original = await readFile(backupSource)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const repo = fileURLToPath(new URL('..', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'marketpilot-v4-gui-isolated-'))
const profile = join(root, 'harness/profiles/web')
const storage = join(root, 'harness/storages')
const plugin = join(root, 'plugin')
await mkdir(profile, { recursive: true, mode: 0o700 })
await mkdir(storage, { recursive: true, mode: 0o700 })
await mkdir(plugin, { mode: 0o700 })
for (const name of ['lib', 'client', 'cordis.patch.yml', 'package.json']) await cp(join(repo, name), join(plugin, name), { recursive: true, errorOnExist: true, force: false })
await symlink(join(repo, 'node_modules'), join(plugin, 'node_modules'), 'junction')
const modules = join(profile, 'node_modules')
await mkdir(modules)
// Existing dependencies are reused read-only; the plugin itself is a frozen build copy.
for (const entry of await readdir(join(profileSource, 'node_modules'), { withFileTypes: true })) {
  if (entry.name === 'dsh-marketpilot' || entry.name === 'dshmarket' || entry.name === '.bin') continue
  if (entry.isDirectory() || entry.isSymbolicLink()) await symlink(join(profileSource, 'node_modules', entry.name), join(modules, entry.name), 'junction')
}
await symlink(plugin, join(modules, 'dsh-marketpilot'), 'junction')
const sourcePackage = JSON.parse(await readFile(join(profileSource, 'package.json'), 'utf8'))
const permitted = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', 'dsh-marketpilot']
if (!permitted.every(name => sourcePackage.dsh?.profile?.bundles?.includes(name))) throw new Error('Unexpected source profile bundle shape; isolated clone left unlaunched.')
await writeFile(join(profile, 'package.json'), JSON.stringify({ name: 'marketpilot-v4-gui-isolated', private: true,
  dependencies: { 'dsh-marketpilot': 'file:../../../plugin' }, dsh: { profile: { bundles: permitted } } }, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
await writeFile(join(profile, 'cordis.yml'), '[]\n', { flag: 'wx', mode: 0o600 })
await writeFile(join(profile, 'cordis.patch.yml'), `# Isolated storage; no user provider patch or credentials copied.\n- id: storage-json\n  config:\n    root: ${JSON.stringify(storage)}\n- id: storage-domain\n  config:\n    backend: json\n`, { flag: 'wx', mode: 0o600 })
const destination = join(storage, 'marketpilot.json')
await writeFile(destination, original, { flag: 'wx', mode: 0o600 })
if (sha(await readFile(destination)) !== sha(original) || sha(await readFile(backupSource)) !== sha(original)) throw new Error('Backup changed or clone checksum differs.')
await convertStorage({ mode: 'downgrade', source: destination, output: join(root, 'validated-backup'), dryRun: true })
const report = { prepared: true, launched: false, root, profile, storage, plugin,
  sourceProfile: profileSource, backupSha256: sha(original), sourceUnchanged: true,
  credentialsCopied: false, userProviderPatchCopied: false, sharedDependencies: true, dependencyWritesForbidden: true,
  next: 'Set DSH_HOME to <root>/harness and launch this cloned web profile through the installed Harness launcher on a distinct loopback port. Do not install/update dependencies through these shared links. Native Desktop window and live providers still require acceptance.' }
await writeFile(join(root, 'preflight.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
console.log(JSON.stringify(report, null, 2))
