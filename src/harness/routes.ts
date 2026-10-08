import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { MarketPilotService } from './service.ts'
import { WorkbenchManager } from './workbench.ts'
import { ensure, MarketPilotError } from '../domain/common.ts'

const API_PREFIX = '/marketpilot/api'
const MAX_BODY_BYTES = 1024 * 1024

/** The webServer-service subset the workbench routes use. */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix'
    path: string
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>
  }): () => void
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) })
  response.end(payload)
}

/** Same-origin policy: absent Origin (same-origin GET, some clients) passes; a present Origin must name this host. */
function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (origin === undefined || origin === 'null') return true
  const host = request.headers.host
  if (typeof host !== 'string' || host.length === 0) return false
  try { return new URL(origin).host === host } catch { return false }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).byteLength
    if (size > MAX_BODY_BYTES) throw new MarketPilotError('WORKBENCH_BODY_TOO_LARGE', '请求体超过 1 MiB 限制。')
    chunks.push(chunk as Buffer)
  }
  if (chunks.length === 0) return {}
  const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  ensure(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'WORKBENCH_BAD_BODY', '请求体必须是 JSON 对象。')
  return parsed as Record<string, unknown>
}

/** The service-family surface the read routes project. */
interface MarketPilotServices {
  readonly services: {
    projects: { get(id: string): unknown; list(): unknown[]; getContext(id: string): unknown }
    documents: { list(projectId: string): unknown[] }
    requirements: { list(projectId: string): unknown[] }
    evidence: { list(projectId: string): unknown[] }
    competitors: { list(projectId: string): unknown[] }
    policies: { list(projectId: string): unknown[] }
    alternatives: { list(projectId: string): unknown[] }
    decisions: { list(projectId: string): unknown[] }
    tender: { list(projectId: string): unknown[] }
    artifacts: { list(projectId: string): unknown[] }
    workflows: { list(projectId: string): unknown[]; summary(projectId: string): unknown }
  }
}

/** Full workbench detail: every collection of one project in one payload. */
function projectDetail(marketpilot: MarketPilotServices, projectId: string): Record<string, unknown> {
  const s = marketpilot.services
  return {
    project: s.projects.get(projectId),
    context: s.projects.getContext(projectId),
    documents: s.documents.list(projectId),
    requirements: s.requirements.list(projectId),
    evidence: s.evidence.list(projectId),
    competitors: s.competitors.list(projectId),
    policies: s.policies.list(projectId),
    alternatives: s.alternatives.list(projectId),
    decisions: s.decisions.list(projectId),
    tenderItems: s.tender.list(projectId),
    artifacts: s.artifacts.list(projectId),
    workflowRuns: s.workflows.list(projectId),
  }
}

/**
 * Mount the MarketPilot workbench HTTP API on the host webServer. Read routes
 * project service state; the tool route drives guarded Tool executions whose
 * human questions the UI answers through the execution routes. Mounts only in
 * compositions that provide `webServer`; headless profiles never see it.
 * @param ctx - the plugin context owning the MarketPilot service.
 * @param workbench - the shared execution manager.
 */
export function mountWorkbenchRoutes(ctx: Context, workbench: WorkbenchManager): void {
  ctx.inject(['webServer'], webCtx => {
    const webServer = (webCtx as Context & { webServer: WebServerLike }).webServer
    webCtx.effect(() => webServer.register({
      kind: 'prefix', path: API_PREFIX,
      handler: async (request, response) => {
        try {
          if (!sameOrigin(request)) return sendJson(response, 403, { error: '已拒绝跨域请求。' })
          const marketpilot = ctx.get('marketpilot') as (MarketPilotService & MarketPilotServices) | undefined
          if (marketpilot === undefined) return sendJson(response, 503, { error: 'MarketPilot 服务尚未就绪。' })
          const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
          const segments = pathname.slice(API_PREFIX.length).split('/').filter(Boolean)
          const method = request.method ?? 'GET'
          // POST /tools → start one click-driven execution.
          if (method === 'POST' && segments.length === 1 && segments[0] === 'tools') {
            const body = await readJsonBody(request)
            ensure(typeof body.name === 'string' && body.name.length > 0, 'WORKBENCH_BAD_TOOL', '缺少工具名称。')
            const started = await workbench.start(body.name, body.args ?? {})
            return sendJson(response, 202, started)
          }
          // GET /executions/<callId> → poll one execution.
          if (method === 'GET' && segments.length === 2 && segments[0] === 'executions') {
            const view = workbench.view(segments[1]!)
            if (view === undefined) return sendJson(response, 404, { error: '工作台执行不存在。' })
            return sendJson(response, 200, view)
          }
          // POST /executions/<callId>/answer | /cancel
          if (method === 'POST' && segments.length === 3 && segments[0] === 'executions') {
            const body = await readJsonBody(request)
            if (segments[2] === 'answer') {
              ensure(typeof body.selected === 'string' && body.selected.length > 0, 'WORKBENCH_BAD_ANSWER', '缺少审核选项。')
              workbench.answer(segments[1]!, body.selected, typeof body.custom === 'string' ? body.custom : undefined)
              return sendJson(response, 200, { answered: true })
            }
            if (segments[2] === 'cancel') {
              workbench.cancel(segments[1]!)
              return sendJson(response, 200, { cancelled: true })
            }
          }
          // Read routes below.
          if (method === 'GET' && segments.length === 1 && segments[0] === 'tools') {
            return sendJson(response, 200, { tools: workbench.allowedTools() })
          }
          if (method === 'GET' && segments.length === 1 && segments[0] === 'projects') {
            return sendJson(response, 200, { projects: marketpilot.services.projects.list() })
          }
          if (method === 'GET' && segments.length === 2 && segments[0] === 'projects') {
            return sendJson(response, 200, projectDetail(marketpilot, segments[1]!))
          }
          if (method === 'GET' && segments.length === 2 && segments[0] === 'summary') {
            return sendJson(response, 200, marketpilot.services.workflows.summary(segments[1]!))
          }
          return sendJson(response, 404, { error: `未知的工作台请求：${method} ${pathname}` })
        } catch (error) {
          if (error instanceof MarketPilotError) {
            const missing = error.code === 'PROJECT_NOT_FOUND' || error.code.endsWith('_NOT_FOUND')
            return sendJson(response, missing ? 404 : 400, { error: error.message, code: error.code })
          }
          const message = error instanceof Error ? error.message : String(error)
          return sendJson(response, 500, { error: message })
        }
      },
    }))
  })
}
