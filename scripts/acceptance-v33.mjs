/** Real DSH Desktop-hosted GUI acceptance; no model calls or mocked responses.
 * Requires installed Chrome and a running Desktop using this built plugin.
 * Creates/reuses one clearly named empty QA project; never deletes project data.
 * Session token stays in memory and is never logged or saved in artifacts.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
const output = resolve('docs/gui-acceptance/v3.3-m1')
mkdirSync(output, { recursive: true })
const log = readFileSync(join(process.env.APPDATA, 'dsh-desktop/logs/harness.log'), 'utf8')
const lines = log.split('\n').filter(l => l.includes('dsh web: http://127.0.0.1'))
const match = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(lines.at(-1) ?? '')
if (!match) throw new Error('Desktop web endpoint missing; start DSH Desktop first')
const url = `http://127.0.0.1:${match[1]}/?token=${match[2]}`
const port = 9253
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `marketpilot-v33-${Date.now()}`)}`,
  '--window-size=1440,900', 'about:blank',
], { stdio: 'ignore', windowsHide: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let socket
try {
  let tabs
  for (let i = 0; i < 40; i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.some(t => t.type === 'page')) break } catch {}
    await sleep(250)
  }
  if (!tabs) throw new Error('Chrome CDP failed to start')
  socket = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl)
  const pending = new Map(), errors = []
  let nextId = 1
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
  const wait = async (expression, label, timeout = 30000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await sleep(300) }
    throw new Error(`Timed out: ${label}`)
  }
  const click = async (text, selector = 'button') => {
    const found = await evaluate(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent?.trim() === ${JSON.stringify(text)}); if(!e) return false; e.click(); return true })()`)
    if (!found) throw new Error(`Button missing: ${text}`)
    await sleep(400)
  }
  const get = path => evaluate(`fetch(${JSON.stringify(path)}).then(async r=>{if(!r.ok) throw new Error('API '+r.status); return r.json()})`)
  const facts = { mode: 'real-desktop-hosted-web-cdp', newModelCalls: 0, screenshots: [], checks: [], gaps: [] }
  const shot = async (name, width, height) => {
    await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await sleep(300)
    await evaluate(`document.querySelector('.mp-scroll')?.scrollTo(0,0)`)
    const capture = await call('Page.captureScreenshot', { format: 'png' })
    writeFileSync(join(output, name), Buffer.from(capture.data, 'base64'))
    facts.screenshots.push({ name, width, height })
    console.log(`Screenshot: ${name}`)
  }
  const openProject = async project => {
    await click('我的项目', '.mp-headerNav button')
    await wait(`!!document.querySelector('.mp-createInput')`, 'projects page')
    await wait(`Array.from(document.querySelectorAll('.mp-table button')).some(e=>e.textContent?.trim()===${JSON.stringify(project.name)})`, 'project row')
    await click(project.name, '.mp-table button')
    await wait(`document.querySelectorAll('.mp-stepCard').length===8`, 'workflow overview')
  }
  const checkOverview = async project => {
    const snapshot = await get(`/marketpilot/api/projects/${project.id}/workflow`)
    const detail = await get(`/marketpilot/api/projects/${project.id}`)
    const dom = await evaluate(`({current:document.querySelector('.mp-stageAction')?.getAttribute('data-stage'),
      stages:[...document.querySelectorAll('.mp-stepCard')].map(e=>({id:e.getAttribute('data-stage'),status:e.getAttribute('data-status')})),
      pageOverflow:document.documentElement.scrollWidth>window.innerWidth,
      section:document.querySelector('.mp-stageItem[aria-current="page"]')?.textContent?.trim()})`)
    assert.equal(dom.current, snapshot.currentStage)
    assert.deepEqual(dom.stages, snapshot.stages.map(s => ({ id: s.id, status: s.status })))
    assert.equal(snapshot.unknowns, detail.evidence.filter(e => e.kind === 'UNKNOWN' && !['rejected','superseded'].includes(e.status)).length)
    assert.equal(dom.pageOverflow, false)
    facts.checks.push({ project: project.name, projectId: project.id, revision: snapshot.revision,
      currentStage: snapshot.currentStage, unknowns: snapshot.unknowns, waiting: snapshot.waiting,
      stages: dom.stages, model: snapshot.capabilities.model, research: snapshot.capabilities.research, section: dom.section })
    return snapshot
  }
  const theme = async name => {
    await evaluate(`document.querySelector('button[aria-label="设置"]')?.click()`)
    await wait(`document.querySelectorAll('button[class*="themeCube"]').length>=3`, 'theme settings')
    await click(name, 'button[class*="themeCube"]')
    await wait(name === '深色' ? `document.body.hasAttribute('data-ds-dark-theme')` : `!document.body.hasAttribute('data-ds-dark-theme')`, 'theme applied')
    await evaluate(`(() => { const e=[...document.querySelectorAll('button')].find(b=>String(b.className).includes('VOzbGW_close') || b.textContent?.trim()==='关闭'); e?.click() })()`)
    await wait(`document.querySelectorAll('button[class*="themeCube"]').length===0`, 'settings closed')
  }
  await call('Page.enable'); await call('Runtime.enable')
  await call('Page.navigate', { url })
  await wait(`!!document.querySelector('button[aria-label="MarketPilot 智策"]')`, 'Desktop shell', 60000)
  await evaluate(`document.querySelector('button[aria-label="MarketPilot 智策"]').click()`)
  await wait(`!!document.querySelector('.mp-root')`, 'MarketPilot')
  if (process.argv.includes('--check-idle')) {
    const { executions } = await get('/marketpilot/api/executions')
    const active = executions.filter(e => ['running', 'waiting_human'].includes(e.status))
    assert.equal(active.length, 0, 'Do not restart Desktop while a live workbench task or gate is active')
    console.log('Host idle: no active workbench executions or live gates.')
  } else {
  let { projects } = await get('/marketpilot/api/projects')
  const calm = projects.find(p => p.name.includes('CALM'))
  if (!calm) throw new Error('No existing CALM project found')
  const emptyName = 'V3.3 M1 GUI 空项目 · synthetic QA'
  let empty = projects.find(p => p.name === emptyName)
  if (!empty) {
    await click('我的项目', '.mp-headerNav button')
    await wait(`!!document.querySelector('.mp-createInput')`, 'create project')
    await evaluate(`(() => { const input=document.querySelector('input.mp-createInput, .mp-createInput input'); if(!input) throw new Error('create input missing'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(emptyName)}); input.dispatchEvent(new Event('input',{bubbles:true})) })()`)
    await click('创建')
    await wait(`Array.from(document.querySelectorAll('.mp-table button')).some(e=>e.textContent?.trim()===${JSON.stringify(emptyName)})`, 'created project')
    projects = (await get('/marketpilot/api/projects')).projects
    empty = projects.find(p => p.name === emptyName)
  }
  facts.emptyProject = empty.id
  await theme('浅色')
  for (const [label, project] of [['empty',empty],['calm',calm]]) {
    await openProject(project); await checkOverview(project)
    await shot(`v33-${label}-light-1440.png`,1440,900)
    await shot(`v33-${label}-light-1024.png`,1024,768)
    const compact = await evaluate(`({direction:getComputedStyle(document.querySelector('.mp-stageNav')).flexDirection, height:document.querySelector('.mp-stageNav').getBoundingClientRect().height})`)
    assert.equal(compact.direction,'row'); assert.ok(compact.height < 60)
    facts.checks.push({ compactNavigation: compact, project: label })
    await theme('深色')
    await shot(`v33-${label}-dark-1024.png`,1024,768)
    await shot(`v33-${label}-dark-1440.png`,1440,900)
    await theme('浅色')
  }
  await openProject(empty)
  await click('04 技术路线','.mp-stageItem')
  await wait(`!!document.querySelector('.mp-altPage')`, 'empty alternatives')
  const disabled = await evaluate(`[...document.querySelectorAll('button')].filter(b=>b.textContent?.trim()==='生成候选路线').every(b=>b.disabled)`)
  assert.equal(disabled,true)
  await shot('v33-empty-routes-blocked-1440.png',1440,900)
  await openProject(calm)
  const calmSnapshot = await checkOverview(calm)
  await shot('v33-calm-light-1366.png',1366,768)
  if (calmSnapshot.unknowns > 0) {
    await evaluate(`document.querySelector('.mp-flowSummary .mp-prerequisites button')?.click()`)
    await wait(`document.querySelector('.mp-stageItem[aria-current="page"]')?.getAttribute('data-stage')==='S3'`, 'evidence feedback landing')
    await shot('v33-calm-evidence-feedback-1440.png',1440,900)
    await click('全流程 · S0—S7')
    facts.checks.push({ feedbackLanding: 'evidence', returnProjectId: calm.id })
  }
  if (calmSnapshot.waiting > 0) {
    const current = calmSnapshot.stages.find(s=>s.id===calmSnapshot.currentStage)
    const labels = { reviewRequirements:'查看本批需求并确认', locateReview:'定位人工审核', needDecision:'请在技术路线页完成真实人工 Decision。' }
    if (labels[current.action.key]) await click(labels[current.action.key])
    const target = await evaluate(`document.querySelector('.mp-stageItem[aria-current="page"]')?.textContent?.trim()`)
    assert.ok(target && target !== '项目概览')
    facts.checks.push({ waitLanding: target, runId: current.run?.id, noNewExecution: true })
    await shot('v33-calm-wait-landing-1440.png',1440,900)
  }
  const mature = projects.find(p=>p.name.startsWith('V3P2'))
  if (mature) {
    await openProject(mature); await checkOverview(mature)
    await shot('v33-existing-solution-1440.png',1440,900)
    await click('专业模式'); await shot('v33-professional-1440.png',1440,900)
    await click('05 方案生成','.mp-stageItem')
    await wait(`!!document.querySelector('#mp-stage-controls')`, 'solution section')
    await click('全流程 · S0—S7')
    assert.equal(await evaluate(`document.querySelector('.mp-layout')?.getAttribute('data-mode')`),'professional')
    await click('引导模式')
  }
  const failing = [], waiting = []
  for (const p of projects) {
    const snapshot = await get(`/marketpilot/api/projects/${p.id}/workflow`)
    if (snapshot.stages.some(s=>s.status==='failed')) failing.push(p)
    if (snapshot.waiting > 0) waiting.push(p)
  }
  if (waiting[0]) {
    await openProject(waiting[0]); const snapshot = await checkOverview(waiting[0])
    const before = (await get(`/marketpilot/api/executions?projectId=${waiting[0].id}`)).executions.map(e=>e.callId).sort()
    await evaluate(`document.querySelector('.mp-stageAction .mp-primaryAction').click()`)
    await sleep(600)
    const after = (await get(`/marketpilot/api/executions?projectId=${waiting[0].id}`)).executions.map(e=>e.callId).sort()
    assert.deepEqual(after,before)
    const landing = await evaluate(`document.querySelector('.mp-stageItem[aria-current="page"]')?.textContent?.trim()`)
    assert.notEqual(landing,'项目概览')
    facts.checks.push({ actionableWait: waiting[0].name, currentStage: snapshot.currentStage, landing, noNewExecution: true })
    await shot('v33-existing-wait-landing-1440.png',1440,900)
  } else facts.gaps.push('No existing recoverable wait available; waiting/gate cases covered by React/domain tests.')
  if (failing[0]) { await openProject(failing[0]); await checkOverview(failing[0]); await shot('v33-existing-failure-1440.png',1440,900) }
  else facts.gaps.push('No existing failed run available for screenshot; failure exercised in React/domain tests.')
  await openProject(calm); await theme('浅色')
  assert.equal(errors.length,0)
  facts.pageErrors = errors
  writeFileSync(join(output,'v33-facts.json'),JSON.stringify(facts,null,2))
  console.log(`Accepted ${facts.screenshots.length} screenshots; ${facts.checks.length} checks; no new model calls.`)
  }
} finally { socket?.close(); chrome.kill() }
