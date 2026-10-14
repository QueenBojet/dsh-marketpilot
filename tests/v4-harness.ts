/** Shared V4 HTTP harness for the acceptance story and the screenshot preview: real plugin, isolated storage. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { expect } from 'vitest'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools from '@deepseek-ai/dsh-tools'
import UserQuestions from '@deepseek-ai/dsh-user-questions'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import * as Plugin from '../src/harness/plugin.ts'
import { setup, addCleanup } from './helpers.ts'

export interface FakeRoute { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }
export interface Reply { status: number; headers: Record<string, unknown>; raw: Buffer; body: Record<string, unknown> }
export type Json = Record<string, any>
export type Call = (method: string, path: string, body?: unknown, headers?: Record<string, string>) => Promise<Reply>

const CSRF = { 'x-marketpilot-request': '1' }
export const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64')
export const BATCH1 = '系统应连续监测厂界甲烷浓度。\n报警响应时间不超过 5 秒。\n监测点位不少于 4 个。'
export const BATCH2 = '系统应连续监测厂界甲烷浓度。\n报警响应时间不超过 2 秒。\n监测点位不少于 4 个。\n新增：数据需上传至园区平台。'

function fakeRequest(method: string, path: string, body: unknown, headers: Record<string, string>): IncomingMessage {
  const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return { method, url: path, headers, async *[Symbol.asyncIterator]() { for (const c of payload) yield c } } as unknown as IncomingMessage
}
export async function harness() {
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
  const call: Call = async (method, path, body, headers = method === 'GET' ? {} : CSRF) => {
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
  return { ...storage, root, call, routes, services: root.marketpilot.services }
}

async function poll(call: Call, pid: string, tool: string, args: Record<string, unknown>) {
  const started = await call('POST', `projects/${pid}/v4/run`, { tool, args })
  expect(started.status, JSON.stringify(started.body)).toBe(202)
  const callId = started.body.callId as string
  let view: Json = {}
  for (let i = 0; i < 200; i++) {
    view = (await call('GET', `executions/${callId}`)).body
    if (view.status === 'waiting_human') expect((await call('POST', `executions/${callId}/answer`, { selected: '确认' })).status).toBe(200)
    else if (view.status !== 'running') break
    await new Promise(r => setTimeout(r, 5))
  }
  return view
}
/** Start a gated V4 run, approve the human question, and wait for completion. */
export async function run(call: Call, pid: string, tool: string, args: Record<string, unknown>) {
  const view = await poll(call, pid, tool, args)
  expect(view.status, String(view.error ?? '')).toBe('completed')
  return view
}
/** Start a run that must end without completing (e.g. no model available) and return the execution view. */
export const runExpectingFailure = poll

export async function intakeAndAdopt(call: Call, pid: string, label: string, text: string) {
  const up = await call('POST', `projects/${pid}/v4/intake`, { label, sourceNote: '合成样例（非真实客户资料）', files: [{ name: `${label}.txt`, kind: 'customer_requirement', dataBase64: b64(text) }] })
  expect(up.status, JSON.stringify(up.body)).toBe(201)
  const ov = (await call('GET', `projects/${pid}/v4/overview`)).body as Json
  const pending = (ov.v4.changes as Json[]).filter(c => c.status === 'pending' && c.batchId === up.body.batchId)
  expect(pending).toEqual([])
  // HTTP upload now retains source only. Explicit human-authored requirements preserve the legacy story.
  const existing = new Set((ov.requirements as Json[]).map(r => r.normalizedText))
  for (const line of text.split('\n').filter(line => line.trim() && !existing.has(line))) {
    const out = await call('POST', `projects/${pid}/v4/requirements`, { originalText: line, normalizedText: line, type: 'functional', priority: 'must', sourceDocumentId: (up.body.documentIds as string[])[0] })
    expect(out.status).toBe(201)
  }
  const after = (await call('GET', `projects/${pid}/v4/overview`)).body as Json
  // adopting only proposes requirements; a separate human confirmation is needed
  const reqIds = (after.requirements as Json[]).filter(r => r.status === 'proposed').map(r => r.id as string)
  expect(reqIds.length).toBeGreaterThan(0)
  await run(call, pid, 'marketpilot_requirement_confirm', { requirementIds: reqIds })
  return { batchId: up.body.batchId as string, documentId: (up.body.documentIds as string[])[0]!, reqIds }
}
