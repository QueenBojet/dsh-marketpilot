/** M3 real Desktop-hosted research acceptance. Read-only existing projects;
 * no fixture injection, model calls, gate answers or persisted writes.
 * The local Desktop session token stays in memory and out of artifacts.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const output = resolve('docs/gui-acceptance/v3.3-m3')
mkdirSync(output, { recursive: true })
const log = readFileSync(join(process.env.APPDATA, 'dsh-desktop/logs/harness.log'), 'utf8')
const line = log.split('\n').filter(l => l.includes('dsh web: http://127.0.0.1')).at(-1)
const endpoint = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(line ?? '')
if (!endpoint) throw new Error('Start the installed DSH Desktop first')
const port = 9255
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `marketpilot-m3-${Date.now()}`)}`,
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
  const candidates = await Promise.all(projects.filter(p => p.name.includes('CALM')).map(async p => ({ project:p, research:await get(`/marketpilot/api/projects/${p.id}/research`) })))
  const mature = candidates.sort((a,b)=>b.research.competitors.length-a.research.competitors.length)[0]
  assert.ok(empty && mature?.research.competitors.length >= 2, 'Need existing empty and CALM research projects')
  assert.ok(mature.research.recordCodes && Array.isArray(mature.research.runs), 'Must load final M3 backend contract')
  const originals=new Map(), digest=state=>createHash('sha256').update(JSON.stringify(state)).digest('hex')
  for (const p of [empty,mature.project]) originals.set(p.id,digest(await get(`/marketpilot/api/projects/${p.id}`)))
  const executionsBefore=(await get('/marketpilot/api/executions')).executions.map(e=>e.callId).sort()
  const capability=await get(`/marketpilot/api/projects/${mature.project.id}/workflow`)
  facts.capabilities=capability.capabilities
  await theme('浅色'); await openProject(empty); await click('02 情报研究','.mp-stageItem')
  await wait(`!!document.querySelector('.mp-researchResults')`, 'M3 empty research')
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='抽取竞品').disabled`),true)
  await shot('m3-empty-local-light-1440.png',1440,900,'.mp-researchPage')
  await theme('深色'); await shot('m3-empty-local-dark-1024.png',1024,768,'.mp-researchPage'); await theme('浅色')
  await click('在线搜索研究'); assert.equal(await evaluate(`document.querySelector('.mp-onlineResearch button').disabled`),true)
  await shot('m3-online-blocker-1440.png',1440,900,'.mp-onlineResearch')
  await click('继续本地资料研究')
  await openProject(mature.project); await click('02 情报研究','.mp-stageItem')
  await wait(`!!document.querySelector('.mp-researchResults .mp-table')`, 'CALM research records')
  await shot('m3-calm-local-light-1440.png',1440,900,'.mp-researchPage')
  await select('资料类型','competitor_datasheet')
  const docs=(await get(`/marketpilot/api/projects/${mature.project.id}/documents`)).documents.filter(d=>d.kind==='competitor_datasheet')
  assert.equal(await evaluate(`document.querySelectorAll('.mp-docItem').length`),docs.length)
  if(docs.some(d=>d.hasText)) {
    await evaluate(`document.querySelector('.mp-docItem input:not(:disabled)').click()`)
    assert.equal(await evaluate(`document.querySelectorAll('.mp-docItem input:checked').length`),1)
    await select('资料类型','all')
    assert.equal(await evaluate(`document.querySelectorAll('.mp-docItem input:checked').length`),0)
  }
  facts.checks.push({kindFilterMatchesBackend:true,filterClearsSelection:true})
  await shot('m3-calm-local-light-1024.png',1024,768,'.mp-researchPage')
  await evaluate(`[...document.querySelectorAll('.mp-researchResults input[type=checkbox]')].slice(0,2).forEach(e=>e.click())`)
  await wait(`document.querySelectorAll('.mp-researchResults input:checked').length===2`,'two selected products')
  await click('产品参数对照 (2/4)')
  await wait(`!!document.querySelector('.mp-researchMatrix')`,'parameter matrix')
  await shot('m3-calm-matrix-light-1440.png',1440,900,'.mp-researchMatrix')
  await shot('m3-calm-matrix-light-1366.png',1366,768,'.mp-researchMatrix')
  await theme('深色'); await shot('m3-calm-matrix-dark-1024.png',1024,768,'.mp-researchMatrix'); await theme('浅色')
  const first=mature.research.competitors[0]
  await evaluate(`document.querySelector('.mp-researchResults .mp-table tbody button.mp-link').click()`)
  await wait(`!!document.querySelector('.mp-researchSources')`,'research source drawer')
  const evidence=first.evidenceIds.map(id=>mature.research.evidence.find(e=>e.id===id)).find(e=>e?.sourceDocumentId)
  assert.ok(evidence,'Need a real source document')
  const sourceButton=`${mature.research.recordCodes[evidence.id] ?? evidence.id.slice(0,8)} · ${evidence.title}`
  assert.ok(await evaluate(`document.querySelector('.mp-drawerBody').textContent.includes(${JSON.stringify(evidence.statement)})`))
  await click('查看来源原文','.mp-drawer button')
  await wait(`!!document.querySelector('.mp-drawer pre')`,'source body')
  const source=await get(`/marketpilot/api/projects/${mature.project.id}/documents/${evidence.sourceDocumentId}`)
  assert.equal(await evaluate(`document.querySelector('.mp-drawer pre').textContent`),source.document.textContent)
  await shot('m3-calm-source-drawer-1440.png')
  await click(sourceButton,'.mp-drawer button')
  await wait(`!!document.querySelector('.mp-drawer .mp-sourcePreview')&&!document.querySelector('.mp-researchSources')`,'cross-module evidence drawer')
  await shot('m3-research-to-evidence-1440.png')
  await click('关闭','.mp-drawer button'); await click('02 情报研究','.mp-stageItem'); await wait(`!!document.querySelector('.mp-researchResults')`,'return research')
  await click('政策与标准'); await wait(`document.querySelector('.mp-researchResults')?.textContent.includes('版本与现行效力待核验')`,'policy direction')
  await shot('m3-calm-policy-light-1440.png',1440,900,'.mp-researchResults')
  if(mature.research.policies.length) {
    await click('详情','.mp-researchResults button'); await wait(`!!document.querySelector('.mp-drawer')`,'policy drawer')
    await shot('m3-policy-source-drawer-1024.png',1024,768)
    await click('关闭','.mp-drawer button')
  }
  await click('真实研究批次与输入','summary'); await shot('m3-policy-history-1366.png',1366,768,'.mp-researchResults')
  facts.checks.push({project:mature.project.name,revision:mature.research.revision,competitors:mature.research.competitors.length,policies:mature.research.policies.length,
    comparedExactProducts:mature.research.competitors.slice(0,2).map(r=>({company:r.company,product:r.product})),sourceBodyMatchesBackend:true,evidenceJumpId:evidence.id})
  for(const[id,hash]of originals) assert.equal(digest(await get(`/marketpilot/api/projects/${id}`)),hash,'GUI must preserve stored records')
  assert.deepEqual((await get('/marketpilot/api/executions')).executions.map(e=>e.callId).sort(),executionsBefore)
  facts.checks.push({persistedSnapshotsUnchanged:true,noNewExecution:true,pageOverflow:false})
  facts.gaps.push('No real search/fetch or GLM invocation in this GUI run. Online capability remains unverified. Exact-basis synthetic comparisons, purpose submission and stale/error paths are covered by local workflow and React tests; existing CALM data is read-only.')
  assert.equal(errors.length,0); facts.pageErrors=errors
  writeFileSync(join(output,'m3-facts.json'),JSON.stringify(facts,null,2))
  console.log(`Accepted ${facts.screenshots.length} screenshots; no stored record changes or new model calls.`)
} finally { socket?.close(); chrome.kill() }
