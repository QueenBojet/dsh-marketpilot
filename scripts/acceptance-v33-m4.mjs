/** M4 real Desktop-hosted design acceptance. Read-only existing projects;
 * no fixture injection, model calls, gate answers or persisted writes.
 * The local Desktop session token stays in memory and out of artifacts.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import assert from 'node:assert/strict'
const output = resolve('docs/gui-acceptance/v3.3-m4')
mkdirSync(output, { recursive: true })
const log = readFileSync(join(process.env.APPDATA, 'dsh-desktop/logs/harness.log'), 'utf8')
const line = log.split('\n').filter(l => l.includes('dsh web: http://127.0.0.1')).at(-1)
const endpoint = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=([A-Za-z0-9_-]+)/.exec(line ?? '')
if (!endpoint) throw new Error('Start the installed DSH Desktop first')
const port = 9256
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(tmpdir(), `marketpilot-m4-${Date.now()}`)}`,
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
  const states = await Promise.all(projects.map(async project => ({project,design:await get(`/marketpilot/api/projects/${project.id}/design`)})))
  const empty=states.find(row=>row.project.name==='V3.3 M1 GUI 空项目 · synthetic QA')
  const calm=states.filter(row=>row.project.name.includes('CALM') && row.design.alternatives.length>=2 && row.design.artifacts.some(a=>a.type==='solution'))
    .sort((a,b)=>b.design.artifacts.length-a.design.artifacts.length)[0]
  assert.ok(empty && calm,'Need existing empty and complete CALM projects')
  const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'), originals=new Map()
  for(const row of [empty,calm]) originals.set(row.project.id,digest(await get(`/marketpilot/api/projects/${row.project.id}`)))
  const executionsBefore=(await get('/marketpilot/api/executions')).executions.map(e=>e.callId).sort()
  facts.capabilities=(await get(`/marketpilot/api/projects/${calm.project.id}/workflow`)).capabilities
  facts.projects=[empty,calm].map(row=>({name:row.project.name,revision:row.design.revision,artifactContexts:row.design.artifacts.map(a=>({code:row.design.recordCodes[a.id],type:a.type,status:a.context.status}))}))
  await theme('浅色'); await openProject(empty.project); await click('04 技术路线','.mp-stageItem')
  await wait(`!!document.querySelector('.mp-altPage')`,'empty routes')
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='生成候选路线').disabled`),true)
  await shot('m4-empty-routes-light-1440.png',1440,900,'.mp-altPage')
  await click('05 方案生成','.mp-stageItem'); await wait(`document.querySelector('#mp-stage-controls')?.textContent.includes('尚未确认技术路线')`,'missing Decision')
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].find(e=>e.textContent==='生成技术方案').disabled`),true)
  await shot('m4-empty-solution-light-1440.png')
  await click('06 投标检查','.mp-stageItem'); await wait(`!!document.querySelector('[data-status="skipped_optional"]')`,'optional tender')
  await shot('m4-optional-tender-light-1440.png',1440,900,'[data-status="skipped_optional"]')
  await theme('深色'); await shot('m4-optional-tender-dark-1024.png',1024,768); await theme('浅色')
  await openProject(calm.project); await click('04 技术路线','.mp-stageItem')
  await wait(`document.querySelectorAll('.mp-altCard').length>=2`,'route candidates')
  await shot('m4-calm-summary-light-1440.png',1440,900,'.mp-altPage')
  await click('矩阵视图'); await wait(`!!document.querySelector('.mp-routeMatrix')`,'route matrix')
  assert.ok(await evaluate(`[...document.querySelectorAll('.mp-routeMatrix th')].every(e=>getComputedStyle(e).whiteSpace==='normal')`),'Long route headings must wrap within their matrix columns')
  await shot('m4-calm-matrix-light-1366.png',1366,768,'.mp-routeMatrix')
  await theme('深色'); await shot('m4-calm-matrix-dark-1024.png',1024,768,'.mp-routeMatrix'); await theme('浅色')
  const route=calm.design.alternatives.find(row=>row.status==='candidate')
  assert.ok(route,'Need an unselected real candidate for a non-submitted preview')
  await evaluate(`document.querySelector('input[aria-label='+${JSON.stringify(JSON.stringify(route.name))}+']').click()`)
  await evaluate(`(()=>{const e=document.querySelector('textarea[aria-label="选择理由（必填）"]');if(!e)throw new Error('Missing rationale');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'GUI 预览验收：保留不确定性，未提交人工 Decision。');e.dispatchEvent(new Event('input',{bubbles:true}))})()`)
  await click('提交路线决策'); await wait(`!!document.querySelector('[aria-label="人工决策摘要"]')`,'Decision preview')
  const must=calm.design.requirements.filter(r=>r.priority==='must'&&r.status==='confirmed'), full=must.filter(r=>route.requirementCoverage[r.id]==='full')
  assert.ok(await evaluate(`document.querySelector('[aria-label="人工决策摘要"]').textContent.includes(${JSON.stringify(`${full.length} / ${must.length}`)})`))
  await shot('m4-calm-decision-preview-light-1440.png')
  await click('关闭','.mp-dialog button')
  await click('05 方案生成','.mp-stageItem'); await wait(`!!document.querySelector('.mp-artifactContext')`,'solution versions')
  const solutions=calm.design.artifacts.filter(a=>a.type==='solution').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id)), latest=solutions[0]
  assert.ok(latest)
  assert.equal(await evaluate(`document.querySelector('.mp-artifactContext').getAttribute('data-context')`),latest.context.status)
  await shot('m4-calm-solution-versions-light-1440.png',1440,900,'#mp-stage-controls')
  await click('预览','#mp-stage-controls button'); await wait(`!!document.querySelector('.mp-solutionMarkdown')`,'solution reader')
  const stored=(await get(`/marketpilot/api/projects/${calm.project.id}/artifacts/${latest.id}`)).artifact
  assert.ok(await evaluate(`document.querySelector('.mp-solutionMarkdown').textContent.includes('UNKNOWN')`))
  const traceCount=await evaluate(`document.querySelector('[aria-label="本版本正文引用"]')?.querySelectorAll('button').length??0`)
  assert.ok(traceCount>0,'Need real body citations')
  await shot('m4-calm-solution-reader-light-1440.png')
  await shot('m4-calm-solution-reader-light-1366.png',1366,768)
  await click('关闭','.mp-reader button')
  await theme('深色')
  await click('预览','#mp-stage-controls button'); await wait(`!!document.querySelector('.mp-solutionMarkdown')`,'dark solution reader')
  await shot('m4-calm-solution-reader-dark-1024.png',1024,768)
  await click('关闭','.mp-reader button')
  await theme('浅色')
  await click('预览','#mp-stage-controls button'); await wait(`!!document.querySelector('.mp-solutionMarkdown')`,'solution reader restored')
  const issue=calm.design.evidence.find(e=>!['rejected','superseded'].includes(e.status)&&(e.kind==='UNKNOWN'||e.status!=='verified'))
  assert.ok(issue,'Need real project review issue')
  const issueCode=calm.design.recordCodes[issue.id]
  await click(issueCode,'[aria-label="当前项目待复核事项"] button')
  await wait(`!!document.querySelector('.mp-drawer .mp-sourcePreview')`,'solution to evidence')
  assert.ok(await evaluate(`document.querySelector('.mp-drawer').textContent.includes(${JSON.stringify(issue.title)})`))
  await shot('m4-solution-to-evidence-light-1440.png',1440,900)
  await click('关闭','.mp-drawer button'); await click('06 投标检查','.mp-stageItem')
  await wait(`!!document.querySelector('#mp-stage-controls .mp-table')`,'tender clauses')
  await shot('m4-calm-tender-light-1440.png',1440,900,'#mp-stage-controls')
  await evaluate(`document.querySelector('#mp-stage-controls .mp-table tbody input')?.click()`)
  await select('条款状态','unknown')
  assert.equal(await evaluate(`document.querySelectorAll('#mp-stage-controls .mp-table input:checked').length`),0)
  await select('条款状态','all')
  const matrix=calm.design.artifacts.filter(a=>a.type==='compliance_matrix').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id))[0]
  assert.ok(matrix)
  await click('导出符合性矩阵'); await wait(`!!document.querySelector('.mp-reader .mp-exportBar')`,'focused compliance export')
  assert.ok(await evaluate(`document.querySelector('.mp-reader .mp-drawerTitle').textContent.includes(${JSON.stringify(matrix.name)})`))
  assert.equal(await evaluate(`[...document.querySelectorAll('.mp-exportBar button')].find(e=>e.textContent==='导出成果').disabled`),true)
  await shot('m4-compliance-export-reader-light-1440.png',1440,900)
  await click('关闭','.mp-reader button')
  facts.checks.push({mustResponseCoverage:{full:full.length,total:must.length},previewRoute:route.name,previewOnlyNoGateAnswer:true,legacyContentKept:stored.content.length>0,bodyTraceLinks:traceCount,issueJumpCode:issueCode,tenderFilterClearsSelection:true,complianceFocusCode:calm.design.recordCodes[matrix.id]})
  for(const[id,hash]of originals)assert.equal(digest(await get(`/marketpilot/api/projects/${id}`)),hash,'Stored records must remain unchanged')
  assert.deepEqual((await get('/marketpilot/api/executions')).executions.map(e=>e.callId).sort(),executionsBefore)
  facts.checks.push({persistedSnapshotsUnchanged:true,noNewExecution:true,pageOverflow:false})
  facts.gaps.push('No real GLM/search/fetch invocation or Human Gate answer. Stored CALM artifacts predate dependency snapshots and honestly show untracked; new snapshots, stale rejection, version switching and real gated writes are proved by regression tests and the isolated offline CALM smoke.')
  assert.equal(errors.length,0);facts.pageErrors=errors
  writeFileSync(join(output,'m4-facts.json'),JSON.stringify(facts,null,2))
  console.log(`Accepted ${facts.screenshots.length} screenshots; no stored record changes or new model calls.`)
} finally {socket?.close();chrome.kill()}
