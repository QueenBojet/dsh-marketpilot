import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import * as Plugin from '../src/harness/plugin.ts'
import { setup, addCleanup, requirement } from './helpers.ts'
import { offlineModel } from '../fixtures/calm/offline-model.ts'

interface FakeRoute { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }

type ApiCall = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: Record<string, unknown> }>

/** Minimal request double: method/url/headers plus an async-iterable JSON body. */
function fakeRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method, url: path, headers,
    async *[Symbol.asyncIterator]() { for (const chunk of payload) yield chunk },
  } as unknown as IncomingMessage
}

/** Minimal response double capturing status and the JSON payload. */
function fakeResponse(): ServerResponse & { statusCode: number; body(): unknown } {
  let status = 0
  let payload = ''
  const res = {
    writeHead(code: number) { status = code },
    end(text?: string) { payload += text ?? '' },
    get statusCode() { return status },
    body: () => JSON.parse(payload || 'null'),
  }
  return res as unknown as ServerResponse & { statusCode: number; body(): unknown }
}

async function workbenchHarness(overrides: Partial<Record<'maxDocumentBytes' | 'modelTimeoutMs', number>> = {}, extras: { agents?: unknown; defaultModel?: unknown } = {}) {
  const storage = await setup()
  await storage.repository.close()
  const { root } = storage
  await root.plugin(SystemPrompt)
  await root.plugin(Tools)
  await root.plugin(LocalFs, { cwd: storage.directory })
  await root.plugin(UserQuestions)
  if (extras.agents !== undefined) root.provide('agents', extras.agents)
  if (extras.defaultModel !== undefined) root.provide('agentDefaultModel', extras.defaultModel)
  const routes: FakeRoute[] = []
  root.provide('webServer', {
    register(route: FakeRoute) { routes.push(route); return () => {} },
  })
  const config = new Plugin.Config({ maxDocumentBytes: overrides.maxDocumentBytes ?? 512, structuredProvider: 'spawn', modelTimeoutMs: overrides.modelTimeoutMs ?? 10000 })
  await root.plugin(Plugin, config)
  addCleanup(() => root.fiber.dispose())
  const api = routes.find(route => route.path === '/marketpilot/api')
  expect(api).toBeDefined()
  const call: ApiCall = async (method, path, body, headers) => {
    const response = fakeResponse()
    await api!.handler(fakeRequest(method, path, body, headers), response)
    return { status: response.statusCode, body: response.body() as Record<string, unknown> }
  }
  return { ...storage, call, root, services: root.marketpilot.services }
}

/** POST /tools then poll the execution until it leaves the running state. */
async function runTool(call: ApiCall, name: string, args: Record<string, unknown>) {
  const started = await call('POST', '/marketpilot/api/tools', { name, args })
  expect(started.status).toBe(202)
  const callId = (started.body as { callId: string }).callId
  let view = (await call('GET', `/marketpilot/api/executions/${callId}`)).body as Record<string, unknown>
  for (let i = 0; i < 100 && view.status === 'running'; i++) {
    await new Promise(resolve => setTimeout(resolve, 5))
    view = (await call('GET', `/marketpilot/api/executions/${callId}`)).body as Record<string, unknown>
  }
  return { callId, view }
}

/** One full click step: run, answer the human question when asked, return the tool's canonical data. */
async function click(call: ApiCall, name: string, args: Record<string, unknown>, answer = '确认') {
  const first = await runTool(call, name, args)
  if (first.view.status === 'waiting_human') {
    expect(first.view.question).toMatchObject({ options: ['确认', '退回修改'] })
    expect((await call('POST', `/marketpilot/api/executions/${first.callId}/answer`, { selected: answer })).status).toBe(200)
    first.view = (await call('GET', `/marketpilot/api/executions/${first.callId}`)).body as Record<string, unknown>
    for (let i = 0; i < 100 && first.view.status === 'running'; i++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      first.view = (await call('GET', `/marketpilot/api/executions/${first.callId}`)).body as Record<string, unknown>
    }
  }
  expect(first.view.status, `${name}: ${String(first.view.error ?? '')}`).toBe('completed')
  return first.view.value as { summary: string; data: Record<string, unknown> }
}

describe('MarketPilot workbench routes', () => {
  it('serves the tool whitelist, project list, detail and run summary', async () => {
    const { call } = await workbenchHarness()
    const tools = await call('GET', '/marketpilot/api/tools')
    expect(tools.status).toBe(200)
    expect((tools.body as { tools: string[] }).tools).toContain('marketpilot_project_create')
    expect((tools.body as { tools: string[] }).tools.every(name => name.startsWith('marketpilot_'))).toBe(true)
    const created = await runTool(call, 'marketpilot_project_create', { name: '工作台路由项目' })
    expect(created.view.status).toBe('completed')
    const projects = (await call('GET', '/marketpilot/api/projects')).body as { projects: { id: string; name: string }[] }
    const project = projects.projects.find(p => p.name === '工作台路由项目')
    expect(project).toBeDefined()
    const detail = await call('GET', `/marketpilot/api/projects/${project!.id}`)
    expect(detail.status).toBe(200)
    expect(detail.body).toMatchObject({ project: { id: project!.id }, requirements: [], workflowRuns: [] })
    const summary = await call('GET', `/marketpilot/api/summary/${project!.id}`)
    expect(summary.status).toBe(200)
    expect(summary.body).toMatchObject({ documents: 0, requirements: 0 })
  })

  it('runs the human gate through question polling, decline and confirm', async () => {
    const { call, services, project } = await workbenchHarness()
    const [row] = await services.requirements.addMany(project.id, [requirement])
    const declined = await runTool(call, 'marketpilot_requirement_confirm', { projectId: project.id, requirementIds: [row!.id] })
    expect(declined.view.status).toBe('waiting_human')
    expect(declined.view.question).toMatchObject({ options: ['确认', '退回修改'] })
    const reject = await call('POST', `/marketpilot/api/executions/${declined.callId}/answer`, { selected: '退回修改' })
    expect(reject.status).toBe(200)
    let settled = (await call('GET', `/marketpilot/api/executions/${declined.callId}`)).body as Record<string, unknown>
    for (let i = 0; i < 100 && settled.status === 'running'; i++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      settled = (await call('GET', `/marketpilot/api/executions/${declined.callId}`)).body as Record<string, unknown>
    }
    expect(settled.status).toBe('failed')
    expect(String(settled.error)).toContain('人工审核未确认')
    expect(services.requirements.get(project.id, row!.id).status).toBe('proposed')
    const confirmed = await runTool(call, 'marketpilot_requirement_confirm', { projectId: project.id, requirementIds: [row!.id] })
    const approve = await call('POST', `/marketpilot/api/executions/${confirmed.callId}/answer`, { selected: '确认' })
    expect(approve.status).toBe(200)
    let done = (await call('GET', `/marketpilot/api/executions/${confirmed.callId}`)).body as Record<string, unknown>
    for (let i = 0; i < 100 && done.status === 'running'; i++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      done = (await call('GET', `/marketpilot/api/executions/${confirmed.callId}`)).body as Record<string, unknown>
    }
    expect(done.status).toBe('completed')
    expect(services.requirements.get(project.id, row!.id).status).toBe('confirmed')
  })

  it('enforces same-origin, the tool whitelist and unknown paths', async () => {
    const { call } = await workbenchHarness()
    expect((await call('POST', '/marketpilot/api/tools', { name: 'marketpilot_project_create', args: { name: 'x' } }, { origin: 'https://evil.example', host: '127.0.0.1:43129' })).status).toBe(403)
    expect((await call('POST', '/marketpilot/api/tools', { name: 'run_shell', args: {} })).status).toBe(400)
    expect((await call('GET', '/marketpilot/api/executions/missing')).status).toBe(404)
    expect((await call('GET', '/marketpilot/api/nonsense')).status).toBe(404)
    expect((await call('GET', `/marketpilot/api/projects/${'0'.repeat(8)}-${'0'.repeat(4)}`)).status).toBe(404)
  })

  it('runs the whole CALM Golden Case through workbench clicks with real questions', async () => {
    const { call, root, services } = await workbenchHarness({ maxDocumentBytes: 2097152 })
    root.provide('marketpilotModel', offlineModel)
    const input = fileURLToPath(new URL('../fixtures/calm/input/', import.meta.url))
    const created = await click(call, 'marketpilot_project_create', { name: 'CALM 工作台点击演示', description: '离线模型；工作台路由全流程验证。' })
    const projectId = created.data.id as string
    for (const [file, kind] of [['brief.md', 'customer_requirement'], ['technology-notes.md', 'internal_reference'],
      ['tender.md', 'tender'], ['synthetic-datasheet.md', 'competitor_datasheet']] as const) {
      await click(call, 'marketpilot_document_import', { projectId, path: join(input, file), kind })
    }
    const detail = () => services.documents.list(projectId)
    const doc = (name: string) => detail().find(d => d.name === name)!
    await click(call, 'marketpilot_requirement_extract', { projectId, documentIds: [doc('brief.md').id] })
    await click(call, 'marketpilot_requirement_confirm', {
      projectId, runId: services.workflows.list(projectId).at(-1)!.id,
      requirementIds: services.requirements.list(projectId).filter(r => r.status === 'proposed').map(r => r.id),
    })
    const notes = doc('technology-notes.md')
    for (const statement of notes.textContent.split('\n').filter(line => line.startsWith('水面路线') || line.startsWith('水下路线'))) {
      await click(call, 'marketpilot_evidence_add', { projectId, kind: 'SOURCE', title: '候选技术摘录', statement,
        sourceType: 'internal', sourceDocumentId: notes.id, sourceLocator: '候选方法段落' })
      await click(call, 'marketpilot_evidence_verify', { projectId, evidenceId: services.evidence.list(projectId).at(-1)!.id,
        method: 'human', targetKind: 'SOURCE', statement, supportingEvidenceIds: [] })
    }
    await click(call, 'marketpilot_competitor_extract', { projectId, documentIds: [doc('synthetic-datasheet.md').id] })
    await click(call, 'marketpilot_alternative_generate', { projectId })
    const firstSolution = await click(call, 'marketpilot_solution_generate', { projectId })
    expect((firstSolution.data as { status?: string }).status).toBe('waiting_human')
    const route = services.alternatives.list(projectId)[0]!
    await click(call, 'marketpilot_decision_confirm', { projectId, alternativeId: route.id, decision: `工作台选择：${route.name}`,
      rationale: '工作台人工确认；保留未冻结参数。', evidenceIds: route.evidenceIds,
      requirementIds: services.requirements.list(projectId).filter(r => r.status === 'confirmed').map(r => r.id) })
    await click(call, 'marketpilot_solution_generate', { projectId, runId: services.workflows.list(projectId).at(-1)!.id })
    await click(call, 'marketpilot_tender_extract', { projectId, documentIds: [doc('tender.md').id] })
    await click(call, 'marketpilot_tender_review', { projectId, tenderItemIds: services.tender.list(projectId).map(t => t.id) })
    const summary = (await call('GET', `/marketpilot/api/summary/${projectId}`)).body as Record<string, number>
    expect(summary).toMatchObject({ documents: 4, requirements: 10, evidence: 18, unknowns: 10, artifacts: 5, modelCalls: 12, toolCalls: 8 })
    expect(services.tender.list(projectId).map(t => t.status)).toEqual(['unknown', 'unknown', 'unknown'])
    expect(services.artifacts.list(projectId).find(a => a.type === 'solution')?.content).toContain('UNKNOWN / 待确认条件')
    const fetched = (await call('GET', `/marketpilot/api/projects/${projectId}`)).body as Record<string, unknown[]>
    expect(fetched.requirements).toHaveLength(10)
    expect(fetched.workflowRuns!.length).toBeGreaterThanOrEqual(6)
  })

  it('creates the headless agent with the default model selection when agents exist', async () => {
    const created: { agentOptions?: Record<string, unknown>; meta?: { cwd?: string }; setupCalled: boolean }[] = []
    const fakeAgent = { id: 'fake-workbench-agent' }
    const agents = {
      async create(options: { agentOptions?: Record<string, unknown>; meta?: { cwd?: string }; setup?: (ctx: unknown) => void }) {
        options.setup?.({ on: () => () => {} })
        created.push({ ...options, setupCalled: true })
        return { agent: fakeAgent, async dispose() {} }
      },
    }
    const defaultModel = { currentSelection: () => ({ provider: 'zai', model: 'glm-5.3', reasoningEffort: 'max' }) }
    const { call } = await workbenchHarness({}, { agents, defaultModel })
    const done = await click(call, 'marketpilot_project_create', { name: '带模型路由的执行' })
    expect((done.data as { name: string }).name).toBe('带模型路由的执行')
    expect(created).toHaveLength(1)
    expect(created[0]!.agentOptions).toEqual({ provider: 'zai', model: 'glm-5.3', reasoningEffort: 'max' })
    expect(created[0]!.meta?.cwd).toBeTypeOf('string')
  })
})
