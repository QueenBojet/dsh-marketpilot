/** V4 workbench HTTP surface: read models, draft CRUD, uploads, DOCX download and gated tool runs. */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { ensure } from '../domain/common.ts'
import { extractDocument, SUPPORTED_EXTENSIONS } from '../adapters/extract.ts'
import { sha256 } from '../domain/v4-text.ts'
import { v4Of } from '../services/v4/base.ts'
import type { MarketPilotService } from './service.ts'
import type { WorkbenchManager } from './workbench.ts'
import { readJsonBody, readRawBody, sendJson } from './routes.ts'

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** Tools the V4 run endpoint may start; every Human Gate goes through these tracked executions. */
const RUN_TOOLS = /^marketpilot_v4_[a-z_]+$|^marketpilot_requirement_confirm$|^marketpilot_alternative_generate$/

interface Selection { provider: string; model: string; reasoningEffort?: string }
export interface V4RouteInput {
  ctx: Context
  workbench: WorkbenchManager
  marketpilot: MarketPilotService
  request: IncomingMessage
  response: ServerResponse
  method: string
  segments: readonly string[]
  parsedUrl: URL
}

async function readLargeJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const raw = await readRawBody(request, MAX_UPLOAD_BYTES)
  if (!raw.byteLength) return {}
  const parsed: unknown = JSON.parse(raw.toString('utf8'))
  ensure(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), 'WORKBENCH_BAD_BODY', '请求体必须是 JSON 对象。')
  return parsed as Record<string, unknown>
}

function parseSelection(raw: unknown): Selection | undefined {
  if (raw === undefined || raw === null) return undefined
  ensure(typeof raw === 'object' && !Array.isArray(raw), 'WORKBENCH_INVALID_MODEL', '模型选择参数不合法。')
  const v = raw as Record<string, unknown>
  ensure(typeof v.provider === 'string' && v.provider.length > 0 && typeof v.model === 'string' && v.model.length > 0 &&
    (v.reasoningEffort === undefined || typeof v.reasoningEffort === 'string'), 'WORKBENCH_INVALID_MODEL', '模型 Provider、名称或思考强度格式不合法。')
  return { provider: v.provider, model: v.model, ...v.reasoningEffort === undefined ? {} : { reasoningEffort: v.reasoningEffort as string } }
}

function defaultSelection(ctx: Context): Selection | undefined {
  return (ctx.get('agentDefaultModel') as { currentSelection(): Selection } | undefined)?.currentSelection()
}

/** Decode one uploaded file and extract its text the same way for every supported format. */
function decodeFile(raw: unknown) {
  ensure(raw !== null && typeof raw === 'object', 'INVALID_INPUT', '文件格式不合法。')
  const f = raw as Record<string, unknown>
  ensure(typeof f.name === 'string' && f.name.trim().length > 0 && f.name.length <= 255, 'INVALID_INPUT', '缺少文件名。')
  ensure(typeof f.dataBase64 === 'string' && f.dataBase64.length > 0, 'INVALID_INPUT', `文件 ${f.name} 内容为空。`)
  const ext = (/\.[a-z0-9]+$/i.exec(f.name)?.[0] ?? '').toLowerCase()
  ensure((SUPPORTED_EXTENSIONS as readonly string[]).includes(ext), 'UNSUPPORTED_FORMAT', `不支持的文件类型：${f.name}（支持 ${SUPPORTED_EXTENSIONS.join(' ')}）`)
  const bytes = new Uint8Array(Buffer.from(f.dataBase64, 'base64'))
  const out = extractDocument(f.name, bytes)
  ensure(out.text.trim().length > 0, 'EMPTY_DOCUMENT', `未能从 ${f.name} 提取到文本。`)
  return { name: f.name, kind: typeof f.kind === 'string' ? f.kind : 'other', mimeType: out.mimeType,
    textContent: out.text, checksum: sha256(bytes), ...out.warnings.length ? { warnings: out.warnings.slice(0, 50) } : {} }
}

/** The whole V4 read model for one project; template bytes never leave the server. */
function overview(input: V4RouteInput, projectId: string) {
  const { marketpilot, workbench, ctx } = input
  const state = marketpilot.projectState(projectId)
  const v4 = v4Of(state)
  const s = marketpilot.services
  return {
    project: state.project,
    revision: state.revision,
    documents: state.documents.map(({ textContent, ...d }) => ({ ...d, length: textContent.length })),
    requirements: state.requirements,
    alternatives: state.alternatives,
    decisions: state.decisions,
    evidence: state.evidence,
    v4: { ...v4, templates: s.v4.docs.templates(projectId), docs: undefined },
    route: s.v4.solution.route(projectId),
    cost: s.v4.solution.cost(projectId),
    docs: s.v4.docs.list(projectId),
    baselines: s.v4.baselines.list(projectId).map(({ snapshot: _s, ...b }) => b),
    checks: { technical: s.v4.baselines.checks(projectId, 'technical'), full: s.v4.baselines.checks(projectId, 'full') },
    executions: workbench.list(projectId),
    model: { preference: v4.modelPreference ?? null, default: defaultSelection(ctx) ?? null },
    capabilities: marketpilot.capabilities(),
  }
}

type Handler = (input: V4RouteInput, params: string[]) => Promise<unknown> | unknown
interface Route { method: string; pattern: string[]; handler: Handler; status?: number }
const routes: Route[] = []
/** Register `METHOD path` where `:x` segments are captured in order (`projects/:pid/v4/...`). */
function on(method: string, path: string, handler: Handler, status?: number) {
  routes.push({ method, pattern: path.split('/'), handler, ...status === undefined ? {} : { status } })
}
const svc = (i: V4RouteInput) => i.marketpilot.services
const body = (i: V4RouteInput) => readJsonBody(i.request)

on('GET', 'v4/projects', i => ({ projects: svc(i).projects.list() }))
on('POST', 'v4/projects', async i => svc(i).projects.create(await body(i)), 201)
on('GET', 'projects/:pid/v4/overview', (i, [p]) => overview(i, p!))
on('GET', 'projects/:pid/v4/cost', (i, [p]) => svc(i).v4.solution.cost(p!))
on('GET', 'projects/:pid/v4/route', (i, [p]) => svc(i).v4.solution.route(p!))
on('GET', 'projects/:pid/v4/documents/:did', (i, [p, d]) => {
  const doc = i.marketpilot.projectState(p!).documents.find(x => x.id === d)
  ensure(doc, 'DOCUMENT_NOT_FOUND', '资料不存在。')
  return doc
})
// 资料与变更
on('POST', 'projects/:pid/v4/intake', async (i, [p]) => {
  const raw = await readLargeJson(i.request)
  ensure(Array.isArray(raw.files) && raw.files.length > 0 && raw.files.length <= 20, 'INVALID_INPUT', '请选择 1-20 个文件。')
  const { files, ...rest } = raw
  return svc(i).v4.intake.intake(p!, { ...rest, files: (files as unknown[]).map(decodeFile) })
}, 201)
on('POST', 'projects/:pid/v4/changes/act', async (i, [p]) => svc(i).v4.intake.act(p!, await body(i)))
on('POST', 'projects/:pid/v4/requirements', async (i, [p]) => svc(i).requirements.addMany(p!, [await body(i)]), 201)
on('PATCH', 'projects/:pid/v4/requirements/:rid', async (i, [p, r]) => svc(i).requirements.update(p!, r!, await body(i)))
// 智能研究
on('POST', 'projects/:pid/v4/questions', async (i, [p]) => svc(i).v4.research.addQuestion(p!, await body(i)), 201)
on('PATCH', 'projects/:pid/v4/questions/:qid', async (i, [p, q]) => svc(i).v4.research.updateQuestion(p!, q!, await body(i)))
on('PUT', 'projects/:pid/v4/questions/:qid/plan', async (i, [p, q]) => {
  const { by, ...plan } = await body(i)
  return svc(i).v4.research.savePlan(p!, q!, plan, typeof by === 'string' ? by : '用户')
})
on('POST', 'projects/:pid/v4/findings', async (i, [p]) => svc(i).v4.research.addFinding(p!, await body(i)), 201)
on('PATCH', 'projects/:pid/v4/findings/:fid', async (i, [p, f]) => svc(i).v4.research.updateFinding(p!, f!, await body(i)))
// 方案与决策
on('POST', 'projects/:pid/v4/alternatives', async (i, [p]) => {
  const b = await body(i)
  return svc(i).alternatives.addMany(p!, [{ strengths: [], limitations: [], risks: [], unknowns: [], requirementCoverage: {}, evidenceIds: [], ...b }])
}, 201)
on('PUT', 'projects/:pid/v4/route/draft', async (i, [p]) => svc(i).v4.solution.selectDraftRoute(p!, await body(i)))
on('POST', 'projects/:pid/v4/config', async (i, [p]) => svc(i).v4.solution.addConfig(p!, await body(i)), 201)
on('PATCH', 'projects/:pid/v4/config/:cid', async (i, [p, c]) => svc(i).v4.solution.updateConfig(p!, c!, await body(i)))
on('DELETE', 'projects/:pid/v4/config/:cid', (i, [p, c]) => svc(i).v4.solution.removeConfig(p!, c!))
// 成本与报价
on('POST', 'projects/:pid/v4/cost-lines', async (i, [p]) => svc(i).v4.solution.addCostLine(p!, await body(i)), 201)
on('PATCH', 'projects/:pid/v4/cost-lines/:lid', async (i, [p, l]) => svc(i).v4.solution.updateCostLine(p!, l!, await body(i)))
on('DELETE', 'projects/:pid/v4/cost-lines/:lid', (i, [p, l]) => svc(i).v4.solution.removeCostLine(p!, l!))
on('PUT', 'projects/:pid/v4/cost-settings', async (i, [p]) => svc(i).v4.solution.updateCostSettings(p!, await body(i)))
on('PUT', 'projects/:pid/v4/model-preference', async (i, [p]) => {
  const b = await body(i)
  return { preference: await svc(i).v4.solution.setModelPreference(p!, b.clear === true ? null : b) }
})
// 文档与交付
on('GET', 'projects/:pid/v4/docs/:did', (i, [p, d]) => svc(i).v4.docs.view(p!, d!))
on('POST', 'projects/:pid/v4/docs', async (i, [p]) => svc(i).v4.docs.create(p!, await body(i)), 201)
on('PATCH', 'projects/:pid/v4/docs/:did', async (i, [p, d]) => svc(i).v4.docs.update(p!, d!, await body(i)))
on('PUT', 'projects/:pid/v4/docs/:did/sections/:key', async (i, [p, d, k]) => svc(i).v4.docs.editSection(p!, d!, k!, await body(i)))
on('POST', 'projects/:pid/v4/docs/:did/refresh', (i, [p, d]) => svc(i).v4.docs.refresh(p!, d!))
on('POST', 'projects/:pid/v4/docs/:did/proposals', async (i, [p, d]) => svc(i).v4.docs.decideProposals(p!, d!, await body(i)))
on('GET', 'projects/:pid/v4/templates', (i, [p]) => ({ templates: svc(i).v4.docs.templates(p!) }))
on('POST', 'projects/:pid/v4/templates', async (i, [p]) => svc(i).v4.docs.uploadTemplate(p!, await readLargeJson(i.request)), 201)
on('DELETE', 'projects/:pid/v4/templates/:tid', (i, [p, t]) => svc(i).v4.docs.removeTemplate(p!, t!))
// Version baselines (publishing itself is a gated tool run)
on('GET', 'projects/:pid/v4/baselines', (i, [p]) => ({ baselines: svc(i).v4.baselines.list(p!).map(({ snapshot: _s, ...b }) => b) }))
on('GET', 'projects/:pid/v4/baselines/:bid', (i, [p, b]) => svc(i).v4.baselines.get(p!, b!))
on('GET', 'projects/:pid/v4/checks', (i, [p]) => {
  const type = i.parsedUrl.searchParams.get('type')
  ensure(type === 'technical' || type === 'full', 'INVALID_INPUT', '基线类型必须是 technical 或 full。')
  return { type, blockers: svc(i).v4.baselines.checks(p!, type) }
})
on('GET', 'projects/:pid/v4/diff', (i, [p]) => {
  const a = i.parsedUrl.searchParams.get('a'), b = i.parsedUrl.searchParams.get('b')
  ensure(a && b, 'INVALID_INPUT', '需要指定两个版本。')
  return svc(i).v4.baselines.diff(p!, a, b)
})
/** Start a tracked tool run; model route precedence is per-run override → project preference → DSH default. */
on('POST', 'projects/:pid/v4/run', async (i, [p]) => {
  const b = await body(i)
  ensure(typeof b.tool === 'string' && RUN_TOOLS.test(b.tool), 'WORKBENCH_TOOL_FORBIDDEN', '该工具不能从 V4 工作台启动。')
  i.marketpilot.projectState(p!)
  const override = parseSelection(b.modelSelection)
  const pref = v4Of(i.marketpilot.projectState(p!)).modelPreference
  const fallback = defaultSelection(i.ctx)
  const [selection, source] = override ? [override, 'override' as const] : pref ? [pref as Selection, 'project' as const]
    : fallback ? [fallback, 'default' as const] : [undefined, 'none' as const]
  const args: Record<string, unknown> = { ...(b.args !== null && typeof b.args === 'object' ? b.args as Record<string, unknown> : {}), projectId: p! }
  if (selection) args.modelRoute = { provider: selection.provider, model: selection.model,
    ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort }, source }
  return i.workbench.start(b.tool, args, selection)
}, 202)

function match(route: Route, method: string, segments: readonly string[]): string[] | undefined {
  if (route.method !== method || route.pattern.length !== segments.length) return undefined
  const params: string[] = []
  for (let k = 0; k < segments.length; k++) {
    const part = route.pattern[k]!
    if (part.startsWith(':')) params.push(decodeURIComponent(segments[k]!))
    else if (part !== segments[k]) return undefined
  }
  return params
}

/**
 * Serve a V4 request if it matches; returns false to let the legacy V3.4 routes continue.
 * Mutations require the `x-marketpilot-request: 1` header on top of the same-origin check.
 */
export async function handleV4(input: V4RouteInput): Promise<boolean> {
  const { method, segments, response, request } = input
  // DOCX download is binary, so it bypasses the JSON route table.
  if (method === 'GET' && segments.length === 6 && segments[0] === 'projects' && segments[2] === 'v4' && segments[3] === 'docs' && segments[5] === 'docx') {
    const out = await input.marketpilot.services.v4.docs.exportDocx(segments[1]!, segments[4]!)
    const ascii = out.fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
    response.writeHead(200, {
      'content-type': DOCX_MIME, 'content-length': out.bytes.byteLength, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
      'content-disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(out.fileName)}`,
      'x-marketpilot-sha256': out.sha256, 'x-marketpilot-reviewed': String(out.reviewed),
    })
    response.end(Buffer.from(out.bytes))
    return true
  }
  for (const route of routes) {
    const params = match(route, method, segments)
    if (!params) continue
    if (method !== 'GET' && request.headers['x-marketpilot-request'] !== '1') {
      sendJson(response, 403, { error: '缺少工作台请求标识。', code: 'WORKBENCH_CSRF' })
      return true
    }
    sendJson(response, route.status ?? 200, await route.handler(input, params))
    return true
  }
  return false
}


