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

/** Minimal request double; object bodies are JSON-wrapped, strings/buffers stay raw. */
function fakeRequest(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): IncomingMessage {
  const buffer = body === undefined ? undefined
    : Buffer.isBuffer(body) || typeof body === 'string' ? Buffer.from(body as string)
      : Buffer.from(JSON.stringify(body))
  const payload = buffer === undefined ? [] : [buffer]
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

async function phase2Harness(overrides: Partial<Record<'maxDocumentBytes' | 'modelTimeoutMs', number>> = {},
  extras: { agents?: unknown; defaultModel?: unknown } = {}) {
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
  root.provide('webServer', { register(route: FakeRoute) { routes.push(route); return () => {} } })
  const config = new Plugin.Config({ maxDocumentBytes: overrides.maxDocumentBytes ?? 512, structuredProvider: 'spawn', modelTimeoutMs: overrides.modelTimeoutMs ?? 10000 })
  await root.plugin(Plugin, config)
  addCleanup(async () => { await root.fiber.dispose() })
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

describe('MarketPilot Phase 2 routes', () => {
  it('uploads .md/.txt through the controlled route and lists metadata without text', async () => {
    const { call, project } = await phase2Harness({ maxDocumentBytes: 4096 })
    const uploaded = await call('POST', `/marketpilot/api/projects/${project.id}/documents/upload?name=${encodeURIComponent('客户简报.md')}&kind=customer_requirement`, '# 标题\n\n正文内容。')
    expect(uploaded.status).toBe(201)
    const document = (uploaded.body as { document: Record<string, unknown> }).document
    expect(document).toMatchObject({ name: '客户简报.md', kind: 'customer_requirement', hasText: true })
    expect(JSON.stringify(document)).not.toContain('正文内容')
    const txt = await call('POST', `/marketpilot/api/projects/${project.id}/documents/upload?name=notes.txt&kind=meeting_note`, '会议记录。')
    expect(txt.status).toBe(201)
    const list = await call('GET', `/marketpilot/api/projects/${project.id}/documents`)
    expect(list.status).toBe(200)
    const documents = (list.body as { documents: Record<string, unknown>[] }).documents
    expect(documents).toHaveLength(2)
    expect(JSON.stringify(documents)).not.toContain('会议记录')
  })

  it('rejects wrong extensions, invalid UTF-8, empty bodies, oversize and unknown projects', async () => {
    const { call, project } = await phase2Harness({ maxDocumentBytes: 64 })
    const badExtension = await call('POST', `/marketpilot/api/projects/${project.id}/documents/upload?name=doc.docx&kind=report`, 'x')
    expect(badExtension.status).toBe(400)
    expect(badExtension.body).toMatchObject({ code: 'UNSUPPORTED_FORMAT' })
    const invalidUtf8 = await call('POST', `/marketpilot/api/projects/${project.id}/documents/upload?name=bin.md&kind=report`, Buffer.from([0xff, 0xfe, 0xfa]))
    expect(invalidUtf8.status).toBe(400)
    expect(invalidUtf8.body).toMatchObject({ code: 'INVALID_DOCUMENT' })
    const empty = await call('POST', `/marketpilot/api/projects/${project.id}/documents/upload?name=empty.md&kind=report`, '   ')
    expect(empty.status).toBe(400)
    const oversized = await call('POST', `/marketpilot/api/projects/${project.id}/documents/upload?name=big.md&kind=report`, 'x'.repeat(80))
    expect(oversized.status).toBe(413)
    expect(oversized.body).toMatchObject({ code: 'UPLOAD_TOO_LARGE' })
    const badKind = await call('POST', `/marketpilot/api/projects/${project.id}/documents/upload?name=a.md&kind=secret`, 'x')
    expect(badKind.status).toBe(400)
    expect(badKind.body).toMatchObject({ code: 'UNSUPPORTED_KIND' })
    const missingId = `${'0'.repeat(8)}-${'0'.repeat(4)}-${'0'.repeat(4)}-${'0'.repeat(4)}-${'0'.repeat(12)}`
    const missing = await call('POST', `/marketpilot/api/projects/${missingId}/documents/upload?name=a.md&kind=report`, 'x')
    expect(missing.status).toBe(404)
  })

  it('projects requirements with counts, filters, search and source names', async () => {
    const { call, project, services } = await phase2Harness()
    const [doc] = await Promise.all([services.documents.add(project.id, { name: 'brief.md', kind: 'customer_requirement', textContent: '需求原文' })])
    await services.requirements.addMany(project.id, [
      { ...requirement, sourceDocumentId: doc!.id, normalizedText: '系统应支持单点系泊监测', status: 'proposed' },
      { ...requirement, sourceDocumentId: doc!.id, normalizedText: '系统应支持夜间作业', status: 'unknown' },
      { ...requirement, sourceDocumentId: doc!.id, normalizedText: '系统应支持深海作业', status: 'conflict' },
    ])
    const all = await call('GET', `/marketpilot/api/projects/${project.id}/requirements`)
    expect(all.status).toBe(200)
    const page = all.body as { total: number; counts: Record<string, number>; requirements: Record<string, unknown>[] }
    expect(page.total).toBe(3)
    expect(page.counts).toMatchObject({ proposed: 1, unknown: 1, conflict: 1 })
    expect(page.requirements[0]).toMatchObject({ sourceDocumentName: 'brief.md' })
    expect(page.requirements[0]!.shortId).toHaveLength(8)
    expect(JSON.stringify(page.requirements)).toContain('连续监测')
    const filtered = await call('GET', `/marketpilot/api/projects/${project.id}/requirements?status=proposed`)
    expect((filtered.body as { total: number; requirements: unknown[] }).total).toBe(1)
    const searched = await call('GET', `/marketpilot/api/projects/${project.id}/requirements?q=${encodeURIComponent('夜间')}`)
    expect((searched.body as { total: number }).total).toBe(1)
  })

  it('exposes the run timeline, batch output, and per-execution runId binding', async () => {
    const harness = await phase2Harness({ maxDocumentBytes: 2097152 })
    const { call, root, services } = harness
    root.provide('marketpilotModel', offlineModel)
    const input = fileURLToPath(new URL('../fixtures/calm/input/', import.meta.url))
    const created = await runTool(call, 'marketpilot_project_create', { name: '执行索引项目' })
    const projectId = (created.view.value as { data: { id: string } }).data.id
    await runTool(call, 'marketpilot_document_import', { projectId, path: join(input, 'brief.md'), kind: 'customer_requirement' })
    const extraction = await runTool(call, 'marketpilot_requirement_extract', { projectId, documentIds: [services.documents.list(projectId)[0]!.id] })
    expect(extraction.view.status).toBe('completed')
    // The execution view carries the exact runId of the batch it produced.
    const runId = extraction.view.runId as string
    expect(runId).toBe((extraction.view.value as { data: { id: string } }).data.id)
    const active = await call('GET', `/marketpilot/api/projects/${projectId}/runs?active=1&type=requirement_analysis`)
    expect(active.status).toBe(200)
    const runs = (active.body as { runs: Record<string, unknown>[] }).runs
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ id: runId, status: 'waiting_human' })
    expect((runs[0]!.steps as string[]).length).toBeGreaterThan(0)
    expect((runs[0]!.output as { requirementIds: string[] }).requirementIds.length).toBeGreaterThan(0)
    const index = await call('GET', `/marketpilot/api/executions?projectId=${projectId}`)
    expect(index.status).toBe(200)
    const executions = (index.body as { executions: Record<string, unknown>[] }).executions
    expect(executions.some(execution => execution.runId === runId)).toBe(true)
    expect(executions.every(execution => execution.projectId === projectId)).toBe(true)
    const otherProject = await call('GET', `/marketpilot/api/executions?projectId=${'0'.repeat(8)}-${'0'.repeat(4)}`)
    expect((otherProject.body as { executions: unknown[] }).executions).toHaveLength(0)
  })

  it('rejects confirming with another project runId at the tool boundary', async () => {
    const harness = await phase2Harness({ maxDocumentBytes: 2097152 })
    const { call, root, services, project } = harness
    root.provide('marketpilotModel', offlineModel)
    const input = fileURLToPath(new URL('../fixtures/calm/input/', import.meta.url))
    await runTool(call, 'marketpilot_document_import', { projectId: project.id, path: join(input, 'brief.md'), kind: 'customer_requirement' })
    await runTool(call, 'marketpilot_requirement_extract', { projectId: project.id, documentIds: [services.documents.list(project.id)[0]!.id] })
    const foreignRunId = services.workflows.list(project.id).at(-1)!.id
    const created = await runTool(call, 'marketpilot_project_create', { name: '另一个项目' })
    const otherProjectId = (created.view.value as { data: { id: string } }).data.id
    const [row] = await services.requirements.addMany(otherProjectId, [{ ...requirement, status: 'proposed' }])
    const cross = await runTool(call, 'marketpilot_requirement_confirm',
      { projectId: otherProjectId, requirementIds: [row!.id], runId: foreignRunId })
    expect(cross.view.status).toBe('failed')
    expect(String(cross.view.error)).toContain('记录不存在')
    expect(services.requirements.get(otherProjectId, row!.id).status).toBe('proposed')
  })

  it('parks the human gate on the workbench even with a live agent context (production routing)', async () => {
    // Production creates a headless agent for workbench executions; the gate
    // question must reach the workbench's root-waterfall listener (parked on
    // the execution), never the agent's session-UI forwarder.
    const fakeAgent = { id: 'fake-workbench-agent' }
    const agents = {
      async create(options: { setup?: (ctx: unknown) => void }) {
        options.setup?.({ on: () => () => {} })
        return { agent: fakeAgent, async dispose() {} }
      },
    }
    const defaultModel = { currentSelection: () => ({ provider: 'zai', model: 'glm-5.3', reasoningEffort: 'max' }) }
    const { call, services, project } = await phase2Harness({}, { agents, defaultModel })
    const [row] = await services.requirements.addMany(project.id, [requirement])
    const started = await call('POST', '/marketpilot/api/tools',
      { name: 'marketpilot_requirement_confirm', args: { projectId: project.id, requirementIds: [row!.id] } })
    expect(started.status).toBe(202)
    const callId = (started.body as { callId: string }).callId
    let view = (await call('GET', `/marketpilot/api/executions/${callId}`)).body as Record<string, unknown>
    for (let i = 0; i < 100 && view.status === 'running'; i++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      view = (await call('GET', `/marketpilot/api/executions/${callId}`)).body as Record<string, unknown>
    }
    expect(view.status).toBe('waiting_human')
    expect(view.question).toMatchObject({ options: ['确认', '退回修改'] })
    expect((await call('POST', `/marketpilot/api/executions/${callId}/answer`, { selected: '确认' })).status).toBe(200)
    let done = (await call('GET', `/marketpilot/api/executions/${callId}`)).body as Record<string, unknown>
    for (let i = 0; i < 100 && done.status === 'running'; i++) {
      await new Promise(resolve => setTimeout(resolve, 5))
      done = (await call('GET', `/marketpilot/api/executions/${callId}`)).body as Record<string, unknown>
    }
    expect(done.status).toBe('completed')
    expect(services.requirements.get(project.id, row!.id).status).toBe('confirmed')
  })
})
