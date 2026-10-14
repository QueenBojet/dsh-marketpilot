import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import * as Plugin from '../src/harness/plugin.ts'
import { setup, addCleanup } from './helpers.ts'

interface FakeRoute { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }
interface Reply { status: number; headers: Record<string, unknown>; raw: Buffer; body: Record<string, unknown> }

const CSRF = { 'x-marketpilot-request': '1' }

function fakeRequest(method: string, path: string, body: unknown, headers: Record<string, string>): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return { method, url: path, headers, async *[Symbol.asyncIterator]() { for (const c of payload) yield c } } as unknown as IncomingMessage
}

async function harness() {
  const storage = await setup()
  await storage.repository.close()
  const { root } = storage
  await root.plugin(SystemPrompt)
  await root.plugin(Tools)
  await root.plugin(LocalFs, { cwd: storage.directory })
  await root.plugin(UserQuestions)
  const routes: FakeRoute[] = []
  root.provide('webServer', { register(route: FakeRoute) { routes.push(route); return () => {} } })
  await root.plugin(Plugin, new Plugin.Config({ maxDocumentBytes: 1024 * 1024, structuredProvider: 'spawn', modelTimeoutMs: 10000 }))
  addCleanup(() => root.fiber.dispose())
  const api = routes.find(r => r.path === '/marketpilot/api')!
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = method === 'GET' ? {} : CSRF): Promise<Reply> => {
    let status = 0
    let hdrs: Record<string, unknown> = {}
    const chunks: Buffer[] = []
    const res = {
      writeHead(code: number, h?: Record<string, unknown>) { status = code; hdrs = h ?? {} },
      setHeader(k: string, v: unknown) { hdrs[k.toLowerCase()] = v },
      end(data?: string | Buffer) { if (data !== undefined) chunks.push(Buffer.from(data)) },
    }
    await api.handler(fakeRequest(method, `/marketpilot/api/${path}`, body, headers), res as unknown as ServerResponse)
    const raw = Buffer.concat(chunks)
    const isJson = !String(hdrs['content-type'] ?? 'json').includes('wordprocessingml')
    return { status, headers: hdrs, raw, body: isJson && raw.length ? JSON.parse(raw.toString('utf8')) : {} }
  }
  return { ...storage, root, call, services: root.marketpilot.services }
}

/** Start a gated V4 run, approve the human question, and wait for completion. */
async function run(call: Awaited<ReturnType<typeof harness>>['call'], pid: string, tool: string, args: Record<string, unknown>) {
  const started = await call('POST', `projects/${pid}/v4/run`, { tool, args })
  expect(started.status, JSON.stringify(started.body)).toBe(202)
  const callId = started.body.callId as string
  let view: Record<string, unknown> = {}
  for (let i = 0; i < 200; i++) {
    view = (await call('GET', `executions/${callId}`)).body
    if (view.status === 'waiting_human') expect((await call('POST', `executions/${callId}/answer`, { selected: '确认' })).status).toBe(200)
    else if (view.status !== 'running') break
    await new Promise(r => setTimeout(r, 5))
  }
  expect(view.status, String(view.error ?? '')).toBe('completed')
  return view
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')

describe('V4 workbench routes', () => {
  it('requires the request header for mutations and maps validation errors to 400', async () => {
    const { call, project } = await harness()
    expect((await call('POST', `projects/${project.id}/v4/questions`, { title: 'x' }, {})).status).toBe(403)
    const bad = await call('POST', `projects/${project.id}/v4/cost-lines`, { category: 'other', name: '负数', unit: '项', quantity: -1 })
    expect(bad.status).toBe(400)
    expect(bad.body.code).toBe('INVALID_INPUT')
    expect((await call('GET', `projects/${project.id}/v4/nope`)).status).toBe(404)
  })

  it('uploads base64 files, rejects unsupported formats, and keeps text out of the overview', async () => {
    const { call, project } = await harness()
    const ok = await call('POST', `projects/${project.id}/v4/intake`, { label: '第一批', files: [{ name: '需求.txt', kind: 'customer_requirement', dataBase64: b64('系统应连续监测厂界甲烷浓度。\n报警响应时间不超过 5 秒。') }] })
    expect(ok.status, JSON.stringify(ok.body)).toBe(201)
    expect((await call('POST', `projects/${project.id}/v4/intake`, { files: [{ name: 'x.exe', dataBase64: b64('abc') }] })).body.code).toBe('UNSUPPORTED_FORMAT')
    const ov = (await call('GET', `projects/${project.id}/v4/overview`)).body as { documents: Record<string, unknown>[]; checks: { technical: string[] } }
    expect(ov.documents).toHaveLength(1)
    expect(ov.documents[0]).not.toHaveProperty('textContent')
    expect(ov.checks.technical.length).toBeGreaterThan(0)
    const doc = (await call('GET', `projects/${project.id}/v4/documents/${ov.documents[0]!.id}`)).body
    expect(doc.textContent).toContain('甲烷')
  })

  it('forbids non-V4 tools on the run endpoint and records the project model preference', async () => {
    const { call, project } = await harness()
    expect((await call('POST', `projects/${project.id}/v4/run`, { tool: 'marketpilot_project_create', args: {} })).body.code).toBe('WORKBENCH_TOOL_FORBIDDEN')
    const pref = await call('PUT', `projects/${project.id}/v4/model-preference`, { provider: 'p', model: 'm' })
    expect(pref.body.preference).toEqual({ provider: 'p', model: 'm' })
    expect(((await call('GET', `projects/${project.id}/v4/overview`)).body.model as { preference: unknown }).preference).toEqual({ provider: 'p', model: 'm' })
    expect((await call('PUT', `projects/${project.id}/v4/model-preference`, { clear: true })).body.preference).toBeNull()
  })

  it('runs config → cost → review → DOCX download end to end over HTTP', async () => {
    const { call, project, services } = await harness()
    const pid = project.id
    const [r] = await services.requirements.addMany(pid, [{ originalText: '连续监测', normalizedText: '系统连续监测甲烷', type: 'functional', priority: 'must' }])
    await run(call, pid, 'marketpilot_requirement_confirm', { requirementIds: [r!.id] })
    const altRes = await call('POST', `projects/${pid}/v4/alternatives`, { name: '开路激光路线', summary: '激光对射覆盖厂界。', components: ['激光监测仪'] })
    expect(altRes.status, JSON.stringify(altRes.body)).toBe(201)
    const alt = altRes.body as unknown as { id: string }[]
    await run(call, pid, 'marketpilot_v4_route_confirm', { input: { alternativeId: alt[0]!.id, decision: 'selected', rationale: '人工比较。', requirementIds: [r!.id], evidenceIds: [] } })
    expect((await call('GET', `projects/${pid}/v4/route`)).body.confirmed).toBe(true)
    const item = (await call('POST', `projects/${pid}/v4/config`, { group: '感知层', name: '激光监测仪', quantity: 4, unit: '台' })).body
    await call('POST', `projects/${pid}/v4/cost-lines`, { category: 'equipment', name: '激光监测仪', configItemIds: [item.id], quantityMode: 'follow_config', unit: '台', unitPrice: '1000', sourceType: 'test_data' })
    const cost = (await call('GET', `projects/${pid}/v4/cost`)).body as { result: { lines: { quantity: number }[] } }
    expect(cost.result.lines[0]!.quantity).toBe(4)
    await run(call, pid, 'marketpilot_v4_cost_review', { input: { kind: 'cost_draft' } })
    const created = (await call('POST', `projects/${pid}/v4/docs`, { kind: 'technical' })).body as { doc: { id: string } }
    const unreviewed = await call('GET', `projects/${pid}/v4/docs/${created.doc.id}/docx`)
    expect(unreviewed.headers['x-marketpilot-reviewed']).toBe('false')
    await run(call, pid, 'marketpilot_v4_doc_review', { docId: created.doc.id })
    const dl = await call('GET', `projects/${pid}/v4/docs/${created.doc.id}/docx`)
    expect(dl.status).toBe(200)
    expect(dl.raw.subarray(0, 2).toString()).toBe('PK')
    expect(dl.headers['x-marketpilot-reviewed']).toBe('true')
    expect(String(dl.headers['content-disposition'])).toContain("filename*=UTF-8''")
    const checks = (await call('GET', `projects/${pid}/v4/checks?type=technical`)).body
    expect(checks.blockers).toEqual([])
    await run(call, pid, 'marketpilot_v4_baseline_publish', { input: { type: 'technical' } })
    const list = (await call('GET', `projects/${pid}/v4/baselines`)).body.baselines as Record<string, unknown>[]
    expect(list).toHaveLength(1)
    expect(list[0]).not.toHaveProperty('snapshot')
  })
})
