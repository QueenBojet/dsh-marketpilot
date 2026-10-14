/** Build-dependent CLI acceptance, exclusively on synthetic temp files. */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const repo = fileURLToPath(new URL('..', import.meta.url))
const root = await mkdtemp(join(tmpdir(), 'marketpilot-test-cli-downgrade-'))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const script = join(repo, 'scripts/v4-storage.ps1')
let cliChecks = 0
function run(args, expected = 0) {
  cliChecks++
  let status = 0, stdout
  try { stdout = execFileSync('pwsh', ['-NoProfile', '-File', script, ...args], { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }) }
  catch (error) { status = error.status; stdout = error.stdout; assert.equal(status, expected, String(error.stderr)) }
  assert.equal(status, expected)
  return status === 0 ? JSON.parse(stdout) : { status }
}
try {
  const compiled = await build({ entryPoints: [join(repo, 'tests/downgrade-fixture.ts')], bundle: true, write: false, platform: 'node', format: 'esm', target: 'node24' })
  const { legacyFixture, populatedV4 } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`)
  const states = legacyFixture(); states[0].v4 = populatedV4()
  const sourceDir = join(root, 'source'); await mkdir(sourceDir)
  const source = join(sourceDir, 'marketpilot.json')
  await writeFile(source, JSON.stringify({ unit: { name: 'marketpilot', version: 1 }, global: null,
    tables: { projects: Object.fromEntries(states.map(s => [s.project.id, s])) } }, null, 2) + '\n')
  const original = await readFile(source)
  const output = join(root, 'bundle')
  assert.equal(run(['-Mode', 'downgrade', '-Source', source, '-Output', output, '-DryRun']).dryRun, true)
  assert.deepEqual(await readdir(root), ['source'])
  const converted = run(['-Mode', 'downgrade', '-Source', source, '-Output', output])
  assert.equal(run(['-Mode', 'validate', '-Bundle', output]).valid, true)
  assert.equal(run(['-Mode', 'downgrade', '-Source', source, '-Output', output]).reused, true)
  const workDir = join(root, 'v3-work'); await mkdir(workDir)
  const work = join(workDir, 'marketpilot.json')
  await writeFile(work, await readFile(join(output, 'v3/marketpilot.json')))
  const restored = join(root, 'restored')
  run(['-Mode', 'restore', '-Source', work, '-Output', restored, '-Bundle', output, '-DryRun'])
  run(['-Mode', 'restore', '-Source', work, '-Output', restored, '-Bundle', output])
  assert.equal(run(['-Mode', 'validate', '-Bundle', restored]).valid, true)
  assert.deepEqual(JSON.parse(await readFile(join(restored, 'v4/marketpilot.json'), 'utf8')), JSON.parse(original))
  run(['-Mode', 'downgrade'], 2)
  run(['-Mode', 'downgrade', '-Source', source, '-Output', join(sourceDir, 'unsafe')], 1)

  // Kill an actual worker at the last pre-publication checkpoint, without cleanup.
  const crashOutput = join(root, 'crash-bundle')
  const moduleUrl = pathToFileURL(join(repo, 'lib/storage/downgrade.js')).href
  const childCode = `import { convertStorage } from ${JSON.stringify(moduleUrl)};
    await convertStorage({ mode: 'downgrade', source: ${JSON.stringify(source)}, output: ${JSON.stringify(crashOutput)},
    checkpoint: async stage => { if (stage === 'before-publish') { process.stdout.write('READY\\n'); await new Promise(() => { setInterval(() => {}, 1000); }); } } });`
  const child = spawn(process.execPath, ['--input-type=module', '-e', childCode], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  const closed = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })))
  await new Promise((resolveReady, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Crash worker did not reach checkpoint')) }, 15000)
    child.stdout.on('data', chunk => { if (String(chunk).includes('READY')) { clearTimeout(timer); resolveReady() } })
    child.once('error', error => { clearTimeout(timer); reject(error) })
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Worker exited before checkpoint')) })
  })
  assert.equal(child.kill(), true)
  const termination = await closed
  const entries = await readdir(root)
  assert.equal(entries.includes('crash-bundle'), false)
  assert.equal(entries.filter(name => name.startsWith('crash-bundle.pending-')).length, 1)
  assert.deepEqual(await readFile(source), original)
  run(['-Mode', 'downgrade', '-Source', source, '-Output', crashOutput])
  assert.equal(run(['-Mode', 'validate', '-Bundle', crashOutput]).valid, true)
  assert.deepEqual(await readFile(source), original)
  console.log(JSON.stringify({ ok: true, root, cliChecks, sourceSha256: digest(original),
    projects: states.length, hardTermination: termination, originalUnchanged: true,
    downgradeSummary: converted.manifest.summary, profilePrepared: false }, null, 2))
} finally {
  const target = resolve(root)
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && dirname(target) === resolve(tmpdir()) && target.split(sep).at(-1).startsWith('marketpilot-test-cli-downgrade-'))
  await rm(target, { recursive: true, force: true })
}
