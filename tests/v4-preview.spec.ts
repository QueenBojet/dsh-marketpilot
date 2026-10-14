/**
 * Opt-in screenshot preview of the V4 workbench (MARKETPILOT_PREVIEW=1). Boots the real plugin on isolated
 * temporary storage, seeds the synthetic §7.1 story, serves it on 127.0.0.1 only and captures pages with
 * headless Chrome over CDP. Never touches real MarketPilot storage.
 */
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { addCleanup } from './helpers.ts'
import { BATCH1, BATCH2, harness, intakeAndAdopt, run, runExpectingFailure } from './v4-harness.ts'
import type { Json } from './v4-harness.ts'

const OUT = 'docs/v4/acceptance/screenshots'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

async function seed(call: Awaited<ReturnType<typeof harness>>['call'], pid: string) {
  const first = await intakeAndAdopt(call, pid, '第一批资料', BATCH1)
  const q = (await call('POST', `projects/${pid}/v4/questions`, { title: '厂界甲烷监测点位如何布设？' })).body
  await runExpectingFailure(call, pid, 'marketpilot_v4_research_run', { questionId: q.id, mode: 'both' })
  await call('POST', `projects/${pid}/v4/findings`, { statement: '监测点位至少 4 个', source: { type: 'document', documentId: first.documentId, quote: '监测点位不少于 4 个' } })
  const a = ((await call('POST', `projects/${pid}/v4/alternatives`, { name: '开路激光路线', summary: '激光对射覆盖厂界。', components: ['激光监测仪', '数据采集单元'], risks: ['雾天衰减'], unknowns: ['光程上限待核实'] })).body as unknown as Json[])[0]!
  await call('POST', `projects/${pid}/v4/alternatives`, { name: '点式传感器路线', summary: '点式传感器网格布设。', components: ['点式传感器'], risks: ['覆盖盲区'] })
  await call('PUT', `projects/${pid}/v4/route/draft`, { alternativeId: a.id })
  const confirm = async () => {
    const reqs = ((await call('GET', `projects/${pid}/v4/overview`)).body.requirements as Json[]).filter(r => r.status === 'confirmed').map(r => r.id)
    await run(call, pid, 'marketpilot_v4_route_confirm', { input: { alternativeId: a.id, decision: '选定路线：开路激光路线', rationale: '合成样例中的人工比选。', requirementIds: reqs, evidenceIds: [] } })
  }
  await confirm()
  const item = (await call('POST', `projects/${pid}/v4/config`, { group: '感知层', name: '激光监测仪', quantity: 4, unit: '台' })).body
  const line = (await call('POST', `projects/${pid}/v4/cost-lines`, { category: 'equipment', name: '激光监测仪', configItemIds: [item.id], quantityMode: 'follow_config', unit: '台', unitPrice: '1000', sourceType: 'test_data' })).body
  await call('POST', `projects/${pid}/v4/cost-lines`, { category: 'installation', name: '安装调试', unit: '项', quantity: 1, unitPrice: '300', sourceType: 'test_data' })
  await run(call, pid, 'marketpilot_v4_cost_review', { input: { kind: 'cost_draft' } })
  const docs: string[] = []
  for (const kind of ['technical', 'cost']) {
    const d = (await call('POST', `projects/${pid}/v4/docs`, { kind })).body as Json
    docs.push(d.doc.id); await run(call, pid, 'marketpilot_v4_doc_review', { docId: d.doc.id })
  }
  await run(call, pid, 'marketpilot_v4_baseline_publish', { input: { type: 'full', note: 'V1（合成样例）' } })
  await intakeAndAdopt(call, pid, '第二批资料', BATCH2)
  await call('PATCH', `projects/${pid}/v4/cost-lines/${line.id as string}`, { unitPrice: '1200' })
  if (!((await call('GET', `projects/${pid}/v4/overview`)).body as Json).route.confirmed) await confirm()
  await run(call, pid, 'marketpilot_v4_cost_review', { input: { kind: 'cost_draft' } })
  for (const id of docs) { await call('POST', `projects/${pid}/v4/docs/${id}/refresh`); await run(call, pid, 'marketpilot_v4_doc_review', { docId: id }) }
  await run(call, pid, 'marketpilot_v4_baseline_publish', { input: { type: 'full', note: 'V2（合成样例）' } })
}

async function cdp(port: number) {
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(tmpdir(), `marketpilot-v4-preview-${Date.now()}`)}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore', windowsHide: true })
  addCleanup(async () => { chrome.kill() })
  let tabs: Json[] = []
  for (let i = 0; i < 60 && !tabs.some(t => t.type === 'page'); i++) {
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json() as Json[] } catch { /* bounded CDP startup retry */ }
    if (!tabs.some(t => t.type === 'page')) await pause(250)
  }
  const socket = new WebSocket(tabs.find(t => t.type === 'page')!.webSocketDebuggerUrl)
  addCleanup(async () => socket.close())
  const pending = new Map<number, { resolve: (v: Json) => void; reject: (e: Error) => void }>()
  const errors: string[] = []
  let next = 1
  socket.addEventListener('message', ev => {
    const m = JSON.parse(String(ev.data)) as Json
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id)!; pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
  })
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }) })
  const call = (method: string, params: Json = {}) => new Promise<Json>((resolve, reject) => {
    const id = next++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
  const evaluate = async (expression: string) => {
    const r = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const wait = async (expression: string, label: string, timeout = 20000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) { if (await evaluate(expression)) return; await pause(150) }
    throw new Error(`Timed out: ${label}`)
  }
  await call('Page.enable'); await call('Runtime.enable')
  return { call, evaluate, wait, errors }
}

const PAGES = ['home', 'projects', 'overview', 'change', 'research', 'solution', 'cost', 'deliver', 'library', 'runs', 'settings']
const SIZES = [{ name: '1440', width: 1440, height: 900, mobile: false }, { name: '1024', width: 1024, height: 768, mobile: false }, { name: 'mobile', width: 390, height: 844, mobile: true }]

describe('V4 workbench screenshot preview (opt-in)', () => {
  it.skipIf(!process.env.MARKETPILOT_PREVIEW)('renders every page at 1440, 1024 and mobile widths without overflow or errors', async () => {
    const { call, routes, project } = await harness()
    const pid = project.id
    await seed(call, pid)
    const page = routes.find(r => r.kind === 'exact' && r.path === '/marketpilot/workbench')!
    const api = routes.find(r => r.kind === 'prefix' && r.path === '/marketpilot/api')!
    const server = createServer((req, res) => {
      const path = (req.url ?? '').split('?')[0]!
      const route = path === page.path ? page : path === api.path || path.startsWith(`${api.path}/`) ? api : undefined
      if (!route) { res.writeHead(404); res.end(); return }
      void Promise.resolve(route.handler(req, res)).catch(() => { if (!res.headersSent) res.writeHead(500); res.end() })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    addCleanup(() => new Promise<void>(r => server.close(() => r())))
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/marketpilot/workbench`
    const b = await cdp(9300 + Math.floor(Math.random() * 500))
    mkdirSync(OUT, { recursive: true })
    const written: string[] = []
    for (const size of SIZES) {
      await b.call('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile })
      for (const name of PAGES) {
        await b.call('Page.navigate', { url: `${base}#/${name}?p=${encodeURIComponent(pid)}` })
        await b.wait(`!!document.querySelector('.pagehead h1')`, `${name}@${size.name}`)
        await b.wait(`!document.body.innerText.includes('正在加载')`, `${name}@${size.name} loaded`)
        await pause(400)
        expect(await b.evaluate('document.documentElement.scrollWidth>window.innerWidth'), `${name}@${size.name} overflows`).toBe(false)
        const shot = await b.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
        const file = `${OUT}/${size.name}-${name}.png`
        writeFileSync(file, Buffer.from(shot.data, 'base64'))
        written.push(file)
      }
    }
    expect(b.errors).toEqual([])
    expect(written).toHaveLength(PAGES.length * SIZES.length)
  }, 240_000)
})
