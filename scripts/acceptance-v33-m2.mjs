/** M2 real Desktop-hosted React/API acceptance. Read-only existing projects;
 * no fixture injection, model calls, gate answers or persisted writes.
 * The local Desktop session token stays in memory and out of artifacts.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const output = resolve('docs/gui-acceptance/v3.3-m2')
mkdirSync(output, { recursive: true })
const log = readFileSync(join(process.env.APPDATA, 'dsh-desktop/logs/harness.log'), 'utf8')
const line = log.split('\n').filter(l => l.includes('dsh web: http://127.0.0.1')).at(-1)
const endpoint = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(line ?? '')
if (!endpoint) throw new Error('Start the installed DSH Desktop first')
const port = 9254
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `marketpilot-m2-${Date.now()}`)}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore', windowsHide: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let socket
try {
  let tabs
  for (let i = 0; i < 40; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.some(t => t.type === 'page')) break } catch { /* CDP startup retry */ }
    await sleep(250)
  }
  if (!tabs) throw new Error('Chrome CDP failed to start')
  socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(), errors = []; let nextId = 1
  socket.addEventListener('message', e => {
    const message = JSON.parse(e.data)
    if (message.id && pending.has(message.id)) {
      const p = pending.get(message.id); pending.delete(message.id)
      message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result)
    } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  })
  await new Promise((r, j) => { socket.addEventListener('open', r, { once: true }); socket.addEventListener('error', j, { once: true }) })
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const wait = async (expression, label) => {
    const start = Date.now()
    while (Date.now() - start < 30000) { if (await evaluate(expression)) return; await sleep(250) }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (text, selector = 'button') => {
    assert.ok(await evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent?.trim()===${JSON.stringify(text)}); if(!e)return false; e.click(); return true })()`), `Missing ${text}`)
    await sleep(300)
  }
  const get = path => evaluate(`fetch(${JSON.stringify(path)}).then(async r=>{if(!r.ok)throw new Error('API '+r.status);return r.json()})`)
  const select = async (label, value) => {
    await evaluate(`(() => {const e=document.querySelector('select[aria-label='+${JSON.stringify(JSON.stringify(label))}+']'); if(!e)throw new Error('Select missing');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await sleep(350)
  }
  const facts = { mode: 'real-desktop-hosted-web-cdp', date: new Date().toISOString(), newModelCalls: 0, screenshots: [], checks: [], gaps: [] }
  const shot = async (name, width = 1440, height = 900, anchor = null) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await sleep(250)
    await evaluate(anchor ? `document.querySelector(${JSON.stringify(anchor)})?.scrollIntoView({block:'start'})` : `document.querySelector('.mp-scroll')?.scrollTo(0,0)`)
    await sleep(250)
    assert.equal(await evaluate('document.documentElement.scrollWidth>window.innerWidth'), false)
    const capture = await call('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(output, name), Buffer.from(capture.data, 'base64')); facts.screenshots.push({ name, width, height }); console.log(`Screenshot: ${name}`)
  }
  const theme = async name => {
    await evaluate(`document.querySelector('button[aria-label="设置"]')?.click()`)
    await wait(`document.querySelectorAll('button[class*="themeCube"]').length>=3`, 'theme settings')
    await click(name, 'button[class*="themeCube"]')
    await wait(name === '深色' ? `document.body.hasAttribute('data-ds-dark-theme')` : `!document.body.hasAttribute('data-ds-dark-theme')`, 'theme applied')
    await evaluate(`(() => {const e=[...document.querySelectorAll('button')].find(b=>String(b.className).includes('VOzbGW_close')||b.textContent?.trim()==='关闭');e?.click()})()`)
    await wait(`document.querySelectorAll('button[class*="themeCube"]').length===0`, 'settings closed')
  }
  const openProject = async project => {
    await click('我的项目', '.mp-headerNav button')
    await wait(`Array.from(document.querySelectorAll('.mp-table button')).some(e=>e.textContent?.trim()===${JSON.stringify(project.name)})`, 'project list')
    await click(project.name, '.mp-table button'); await wait(`document.querySelectorAll('.mp-stepCard').length===8`, 'overview')
  }
  await call('Page.enable'); await call('Runtime.enable')
  await call('Page.navigate', { url: `http://127.0.0.1:${endpoint[1]}/?token=${endpoint[2]}` })
  await wait(`!!document.querySelector('button[aria-label="MarketPilot 智策"]')`, 'Desktop shell')
  await evaluate(`document.querySelector('button[aria-label="MarketPilot 智策"]').click()`)
  await wait(`!!document.querySelector('.mp-root')`, 'MarketPilot')
  const projects = (await get('/marketpilot/api/projects')).projects
  const empty = projects.find(p => p.name === 'V3.3 M1 GUI 空项目 · synthetic QA')
  const projectFacts = await Promise.all(projects.filter(p => p.name.includes('CALM')).map(async p => ({ project: p, review: await get(`/marketpilot/api/projects/${p.id}/review`) })))
  const waiting = projectFacts.find(p => p.review.batches.some(b => b.status === 'waiting_human' && !b.superseded))
  const mature = [...projectFacts].sort((a, b) => b.review.evidenceCounts.needs_support - a.review.evidenceCounts.needs_support)[0]
  assert.ok(empty && waiting && mature, 'Expected existing empty/CALM waiting/CALM mature projects')
  assert.ok(mature.review.recordCodes?.[mature.review.issues[0]?.id], 'Desktop must load the final review projection with stable link codes')
  const originals = new Map()
  const digest = state => createHash('sha256').update(JSON.stringify(state)).digest('hex')
  for (const p of [empty, waiting.project, mature.project]) originals.set(p.id, digest(await get(`/marketpilot/api/projects/${p.id}`)))
  const executionsBefore = (await get('/marketpilot/api/executions')).executions.map(e => e.callId).sort()
  await theme('浅色')
  await openProject(empty); await click('01 资料与需求', '.mp-stageItem')
  await wait(`!!document.querySelector('.mp-reviewBlock')`, 'empty input section')
  assert.equal(await evaluate(`document.querySelector('.mp-reviewBlock').open`), true)
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent?.startsWith('确认所选需求')).disabled`), true)
  await shot('m2-empty-inputs-light-1440.png')
  await theme('深色'); await shot('m2-empty-inputs-dark-1024.png', 1024, 768); await theme('浅色')
  await openProject(waiting.project); await click('01 资料与需求', '.mp-stageItem')
  const batch = waiting.review.batches.find(b => b.status === 'waiting_human' && !b.superseded)
  await wait(`document.querySelector('select[aria-label="需求批次"]')?.value===${JSON.stringify(batch.id)}&&!!document.querySelector('.mp-table')`, 'exact waiting batch')
  const page = await get(`/marketpilot/api/projects/${waiting.project.id}/requirements?runId=${batch.id}&pageSize=25`)
  await click('① 上传与选择资料', '.mp-reviewBlock summary')
  await shot('m2-waiting-batch-light-1440.png', 1440, 900, '.mp-reviewBlock')
  const checkboxLabels = await evaluate(`[...document.querySelectorAll('.mp-table input[type=checkbox]')].map(e=>({label:e.getAttribute('aria-label'),disabled:e.disabled}))`)
  assert.deepEqual(checkboxLabels.filter(e => !e.disabled).map(e => e.label).sort(), page.requirements.filter(r => batch.proposedIds.includes(r.id) && r.status === 'proposed').map(r => r.normalizedText).sort())
  await evaluate(`document.querySelector('button[title="全选待审核"]').click()`)
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent?.startsWith('确认所选需求')).disabled`), false)
  await select('优先级', 'should')
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent?.startsWith('确认所选需求')).disabled`), true)
  await shot('m2-priority-selection-cleared-1024.png', 1024, 768, '.mp-reviewBlock')
  await select('优先级', 'all'); await select('需求批次', '')
  assert.equal(await evaluate(`[...document.querySelectorAll('.mp-table input[type=checkbox]')].every(e=>e.disabled)`), true)
  facts.checks.push({ waitingProject: waiting.project.name, runId: batch.id, pageRows: page.requirements.length, batchProposed: batch.proposedIds.length, historicalReadOnly: true, filterClearsSelection: true })
  await openProject(mature.project); await click('03 证据审查', '.mp-stageItem')
  await wait(`!!document.querySelector('.mp-reviewFilters')&&!!document.querySelector('.mp-table')`, 'evidence ledger')
  const needs = await get(`/marketpilot/api/projects/${mature.project.id}/evidence?review=needs_support&pageSize=50`)
  await click(`需补证 ${mature.review.evidenceCounts.needs_support}`, '.mp-reviewFilters button')
  await wait(`!!document.querySelector('.mp-table')`, 'needs support rows')
  assert.ok(needs.evidence.every(e => e.kind === 'UNKNOWN' && !['rejected', 'superseded'].includes(e.status)))
  await shot('m2-calm-needs-support-light-1440.png')
  await shot('m2-calm-needs-support-light-1024.png', 1024, 768)
  await theme('深色'); await shot('m2-calm-needs-support-dark-1024.png', 1024, 768); await theme('浅色')
  await click(`补证行动清单 · ${mature.review.issues.length}`, '.mp-reviewBlock summary')
  await shot('m2-calm-backlog-1366.png', 1366, 768, '.mp-backlogList')
  const target = needs.evidence.find(e => e.relatedRequirementIds.length > 0 && e.sourceDocumentId)
  assert.ok(target, 'Expected linked UNKNOWN with a source document')
  await evaluate(`(() => {const rows=[...document.querySelectorAll('.mp-table tbody tr')]; const row=rows.find(r=>r.querySelector('.mp-cellMain')?.textContent===${JSON.stringify(target.statement)}); if(!row)throw new Error('Target row missing');row.querySelector('button').click()})()`)
  await wait(`!!document.querySelector('.mp-drawer')`, 'evidence drawer')
  await click('查看来源原文', '.mp-drawer button')
  await wait(`!!document.querySelector('.mp-sourcePreview pre')`, 'source text')
  const source = await get(`/marketpilot/api/projects/${mature.project.id}/documents/${target.sourceDocumentId}`)
  assert.equal(await evaluate(`document.querySelector('.mp-sourcePreview pre').textContent`), source.document.textContent)
  await shot('m2-evidence-source-light-1440.png')
  await evaluate(`document.querySelector('.mp-drawer .mp-relatedLinks button').click()`)
  await wait(`!!document.querySelector('.mp-drawer .mp-quote')`, 'linked requirement')
  await shot('m2-evidence-to-requirement-1440.png')
  await click('查看相关证据', '.mp-drawer button')
  await wait(`!!document.querySelector('.mp-drawer .mp-sourcePreview')`, 'return to evidence')
  await click('补充来源资料', '.mp-drawer button')
  await wait(`document.querySelector('.mp-reviewBlock')?.open&&!!document.querySelector('input[type=file]')`, 'add source landing')
  await shot('m2-add-source-return-1440.png')
  await evaluate(`document.querySelector('.mp-reviewBlock summary').click()`)
  await click('④ 补充资料与下游复核', '.mp-reviewBlock summary')
  await shot('m2-downstream-impact-1440.png', 1440, 900, '.mp-secondaryDetails')
  facts.checks.push({ matureProject: mature.project.name, revision: mature.review.revision, evidenceCounts: mature.review.evidenceCounts,
    issues: mature.review.issues.length, impactRecords: mature.review.impacts.length, evidenceId: target.id, requirementId: target.relatedRequirementIds[0], sourceMatchesBackend: true, bidirectionalJump: true, uploadExpanded: true })
  for (const [id, hash] of originals) assert.equal(digest(await get(`/marketpilot/api/projects/${id}`)), hash, 'GUI must preserve persisted records')
  assert.deepEqual((await get('/marketpilot/api/executions')).executions.map(e => e.callId).sort(), executionsBefore)
  facts.checks.push({ persistedSnapshotsUnchanged: true, noNewExecution: true, pageOverflow: false })
  facts.gaps.push('Two-batch confirmation, pagination, cancellation and read-failure recovery use React and real Cordis/SQLite route tests; GUI does not write to existing CALM records or spend model credits.')
  assert.equal(errors.length, 0); facts.pageErrors = errors
  await theme('浅色')
  writeFileSync(join(output, 'm2-facts.json'), JSON.stringify(facts, null, 2))
  console.log(`Accepted ${facts.screenshots.length} screenshots; ${facts.checks.length} check groups; no new executions or model calls.`)
} finally { socket?.close(); chrome.kill() }
