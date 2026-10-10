import { createHash } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type { MarketPilotService } from './service.ts'
import { WorkbenchManager } from './workbench.ts'
import { ensure, MarketPilotError } from '../domain/common.ts'
import { buildShortCodeIndex } from '../domain/shortcodes.ts'

const API_PREFIX = '/marketpilot/api'
const MAX_BODY_BYTES = 1024 * 1024
const DOCUMENT_KINDS = ['customer_requirement', 'tender', 'meeting_note', 'internal_reference',
  'competitor_datasheet', 'standard', 'report', 'other'] as const
type DocumentKind = typeof DOCUMENT_KINDS[number]

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

/** Stream one raw request body, rejecting anything above the byte ceiling. */
async function readRawBody(request: IncomingMessage, limitBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).byteLength
    if (size > limitBytes) throw new MarketPilotError('UPLOAD_TOO_LARGE', `文件超过 ${String(Math.floor(limitBytes / 1024))} KiB 上限。`)
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

/** The service-family surface the read routes project. */
interface MarketPilotServices {
  readonly services: {
    projects: { get(id: string): unknown; list(): unknown[]; getContext(id: string): unknown }
    documents: { list(projectId: string): unknown[]; add(projectId: string, input: unknown): Promise<unknown> }
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

interface DocumentRow { id: string; name: string; kind: string; textContent: string; importedAt: string }
interface RequirementRow {
  id: string; originalText: string; normalizedText: string; type: string; priority: string
  status: string; sourceDocumentId: string; sourceLocator?: string
  clarificationQuestion?: string; risk?: string; updatedAt: string
}
interface WorkflowRunRow {
  id: string; type: string; status: string; currentStep: string; steps: { step: string; at: string }[]
  startedAt: string; updatedAt: string; error?: string; durationMs?: number; modelCalls?: number
  output?: { requirementIds?: string[]; unknownIds?: string[]; artifactId?: string } | null
}

/** One persisted workflow run with its owning project, for the task center history. */
interface ProjectRunRow extends WorkflowRunRow {
  projectId: string
  projectName: string
}

interface ArtifactRow {
  id: string; name: string; type: string; format: string; content: string
  reviewStatus: string; workflowRunId?: string; createdAt: string; updatedAt: string
}

interface CompetitorRow {
  id: string; company: string; product?: string; technology?: string; targetScenario?: string
  performance: Record<string, string | number | boolean | null>
  interfaces: string[]; certifications: string[]; cases: string[]
  strengths: string[]; limitations: string[]; evidenceIds: string[]; updatedAt: string
}

interface PolicyRow {
  id: string; title: string; issuer?: string; documentNumber?: string; version?: string
  scope?: string; mandatoryLevel: string; keyRequirements: string[]
  impact?: string; gap?: string; evidenceIds: string[]; updatedAt: string
}

interface EvidenceRecordRow {
  id: string; kind: string; status: string; title: string; statement: string; sourceType: string
  sourceName?: string; sourceDocumentId?: string; sourceLocator?: string; sourceUrl?: string
  confidence?: number; supportingEvidenceIds: string[]
  relatedRequirementIds: string[]; relatedCompetitorIds: string[]; updatedAt: string
}

interface AlternativeRow {
  id: string; name: string; summary: string; components: string[]
  strengths: string[]; limitations: string[]; risks: string[]; unknowns: string[]
  requirementCoverage: Record<string, string>; evidenceIds: string[]
  status: string; updatedAt: string
}

interface TenderItemRow {
  id: string; clauseId?: string; originalText: string; normalizedRequirement: string
  sourceDocumentId?: string; sourceLocator?: string; claimKinds: string[]
  responseDraft?: string; status: string; requirementIds: string[]
  evidenceIds: string[]; risk?: string; action?: string; updatedAt: string
}

/** Artifact list projection: metadata only — content arrives via the detail route. */
function artifactProjection(row: ArtifactRow): Record<string, unknown> {
  return {
    id: row.id, name: row.name, type: row.type, format: row.format, reviewStatus: row.reviewStatus,
    ...row.workflowRunId === undefined ? {} : { workflowRunId: row.workflowRunId },
    createdAt: row.createdAt, updatedAt: row.updatedAt,
  }
}

/** Full workbench detail of one project in one payload. */
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

/** Document list projection: metadata only, never the full text payload. */
function documentProjection(row: DocumentRow): Record<string, unknown> {
  return {
    id: row.id, name: row.name, kind: row.kind, importedAt: row.importedAt,
    bytes: row.textContent.length, hasText: row.textContent.trim().length > 0,
  }
}

/** Requirement list projection with the source document name resolved for the drawer. */
function requirementProjection(row: RequirementRow, documentName: string | undefined,
  codeOf: (id: string) => string | undefined): Record<string, unknown> {
  return {
    id: row.id, shortId: codeOf(row.id) ?? row.id.slice(0, 8), originalText: row.originalText, normalizedText: row.normalizedText,
    type: row.type, priority: row.priority, status: row.status,
    sourceDocumentId: row.sourceDocumentId,
    ...documentName === undefined ? {} : { sourceDocumentName: documentName },
    ...row.sourceLocator === undefined ? {} : { sourceLocator: row.sourceLocator },
    ...row.clarificationQuestion === undefined ? {} : { clarificationQuestion: row.clarificationQuestion },
    ...row.risk === undefined ? {} : { risk: row.risk },
    updatedAt: row.updatedAt,
  }
}

/**
 * Mount the MarketPilot workbench HTTP API on the host webServer. Read routes
 * project service state; the tool route drives guarded Tool executions whose
 * human questions the UI answers through the execution routes; the upload
 * route validates and stores browser file content through DocumentService.
 * Mounts only in compositions that provide `webServer`; headless profiles
 * never see it.
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
          const parsedUrl = new URL(request.url ?? '/', 'http://localhost')
          const pathname = parsedUrl.pathname
          const segments = pathname.slice(API_PREFIX.length).split('/').filter(Boolean)
          const method = request.method ?? 'GET'
          // POST /tools → start one click-driven execution.
          if (method === 'POST' && segments.length === 1 && segments[0] === 'tools') {
            const body = await readJsonBody(request)
            ensure(typeof body.name === 'string' && body.name.length > 0, 'WORKBENCH_BAD_TOOL', '缺少工具名称。')
            const started = await workbench.start(body.name, body.args ?? {})
            return sendJson(response, 202, started)
          }
          // GET /executions?projectId= → per-project execution index.
          if (method === 'GET' && segments.length === 1 && segments[0] === 'executions') {
            return sendJson(response, 200, { executions: workbench.list(parsedUrl.searchParams.get('projectId') ?? undefined) })
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
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'documents') {
            const projectId = segments[1]!
            const rows = (marketpilot.services.documents.list(projectId) as DocumentRow[]).map(documentProjection)
            return sendJson(response, 200, { documents: rows })
          }
          // POST /projects/:id/documents/upload?name=<file>&kind=<kind> — raw UTF-8 .md/.txt body.
          if (method === 'POST' && segments.length === 4 && segments[0] === 'projects' && segments[2] === 'documents' && segments[3] === 'upload') {
            const projectId = segments[1]!
            // Existence probe through a state-backed list (throws PROJECT_NOT_FOUND).
            void (marketpilot.services.documents.list(projectId) as DocumentRow[]).length
            const name = (parsedUrl.searchParams.get('name') ?? '').split(/[\\/]/).pop() ?? ''
            const kind = parsedUrl.searchParams.get('kind') ?? 'customer_requirement'
            const extension = name.slice(name.lastIndexOf('.')).toLowerCase()
            ensure(extension === '.md' || extension === '.txt', 'UNSUPPORTED_FORMAT',
              '当前仅支持 .md/.txt 文本文件；DOCX/PDF 请先转换为 Markdown。')
            ensure((DOCUMENT_KINDS as readonly string[]).includes(kind), 'UNSUPPORTED_KIND', '未知文档类型。')
            const bytes = await readRawBody(request, marketpilot.maxDocumentBytes)
            let text: string
            try {
              text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
            } catch {
              throw new MarketPilotError('INVALID_DOCUMENT', '文件不是有效的 UTF-8 文本。')
            }
            ensure(text.trim() !== '' && !text.includes('\0'), 'INVALID_DOCUMENT', '文件必须包含有效 UTF-8 文本。')
            const added = await marketpilot.services.documents.add(projectId, {
              name, kind: kind as DocumentKind, textContent: text,
              mimeType: extension === '.md' ? 'text/markdown' : 'text/plain',
              checksum: createHash('sha256').update(bytes).digest('hex'),
            }) as DocumentRow
            return sendJson(response, 201, { document: documentProjection(added) })
          }
          // GET /projects/:id/requirements?status=&q=&page=&pageSize=
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'requirements') {
            const projectId = segments[1]!
            const all = marketpilot.services.requirements.list(projectId) as RequirementRow[]
            const nameOf = new Map((marketpilot.services.documents.list(projectId) as DocumentRow[])
              .map(row => [row.id, row.name] as const))
            const reqCodes = buildShortCodeIndex({ requirements: all })
            const status = parsedUrl.searchParams.get('status')
            const query = (parsedUrl.searchParams.get('q') ?? '').trim().toLowerCase()
            const filtered = all
              .filter(row => status === null || status === 'all' || row.status === status)
              .filter(row => query === '' || row.normalizedText.toLowerCase().includes(query))
            const pageSize = Math.min(Math.max(Number(parsedUrl.searchParams.get('pageSize') ?? 50) || 50, 1), 200)
            const page = Math.max(Number(parsedUrl.searchParams.get('page') ?? 1) || 1, 1)
            const start = (page - 1) * pageSize
            const counts: Record<string, number> = {}
            for (const row of all) counts[row.status] = (counts[row.status] ?? 0) + 1
            return sendJson(response, 200, {
              total: filtered.length, page, pageSize, counts,
              requirements: filtered.slice(start, start + pageSize)
                .map(row => requirementProjection(row, nameOf.get(row.sourceDocumentId), id => reqCodes.codeOf(id))),
            })
          }
          // GET /runs?limit= → persisted runs across projects (task-center history
          // that survives host restarts), newest first.
          if (method === 'GET' && segments.length === 1 && segments[0] === 'runs') {
            const limit = Math.min(Math.max(Number(parsedUrl.searchParams.get('limit') ?? 40) || 40, 1), 100)
            const projects = marketpilot.services.projects.list() as { id: string; name: string }[]
            const rows: ProjectRunRow[] = []
            for (const project of projects) {
              const runs = marketpilot.services.workflows.list(project.id) as WorkflowRunRow[]
              for (const run of runs.slice(-20)) {
                rows.push({ ...run, projectId: project.id, projectName: project.name })
              }
            }
            rows.sort((left, right) => right.startedAt.localeCompare(left.startedAt)
              || right.updatedAt.localeCompare(left.updatedAt))
            return sendJson(response, 200, { runs: rows.slice(0, limit) })
          }
          // GET /projects/:id/runs?type=&active=1 → workflow-run timeline snapshots.
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'runs') {
            const projectId = segments[1]!
            let runs = marketpilot.services.workflows.list(projectId) as WorkflowRunRow[]
            const type = parsedUrl.searchParams.get('type')
            if (type !== null) runs = runs.filter(run => run.type === type)
            if (parsedUrl.searchParams.get('active') === '1') {
              runs = runs.filter(run => run.status === 'running' || run.status === 'waiting_human')
            }
            return sendJson(response, 200, { runs: runs.slice(-20).reverse() })
          }
          // GET /projects/:id/artifacts → list projection (no content payload).
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'artifacts') {
            const projectId = segments[1]!
            const rows = (marketpilot.services.artifacts.list(projectId) as ArtifactRow[]).map(artifactProjection)
            return sendJson(response, 200, { artifacts: rows })
          }
          // GET /projects/:id/artifacts/:artifactId → one full artifact (content included).
          if (method === 'GET' && segments.length === 4 && segments[0] === 'projects' && segments[2] === 'artifacts') {
            const projectId = segments[1]!
            const artifact = (marketpilot.services.artifacts.list(projectId) as ArtifactRow[])
              .find(row => row.id === segments[3])
            if (artifact === undefined) return sendJson(response, 404, { error: '成果不存在。', code: 'ARTIFACT_NOT_FOUND' })
            return sendJson(response, 200, { artifact })
          }
          // GET /projects/:id/competitors → competitor matrix projection.
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'competitors') {
            const projectId = segments[1]!
            return sendJson(response, 200, { competitors: marketpilot.services.competitors.list(projectId) })
          }
          // GET /projects/:id/policies → policy/standard projection.
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'policies') {
            const projectId = segments[1]!
            return sendJson(response, 200, { policies: marketpilot.services.policies.list(projectId) })
          }
          // GET /projects/:id/evidence?status=&kind=&q=&page=&pageSize= → ledger projection.
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'evidence') {
            const projectId = segments[1]!
            const all = marketpilot.services.evidence.list(projectId) as EvidenceRecordRow[]
            const status = parsedUrl.searchParams.get('status')
            const kind = parsedUrl.searchParams.get('kind')
            const query = (parsedUrl.searchParams.get('q') ?? '').trim().toLowerCase()
            const filtered = all
              .filter(row => status === null || status === 'all' || row.status === status)
              .filter(row => kind === null || kind === 'all' || row.kind === kind)
              .filter(row => query === '' || row.statement.toLowerCase().includes(query)
                || row.title.toLowerCase().includes(query))
            const pageSize = Math.min(Math.max(Number(parsedUrl.searchParams.get('pageSize') ?? 50) || 50, 1), 200)
            const page = Math.max(Number(parsedUrl.searchParams.get('page') ?? 1) || 1, 1)
            const start = (page - 1) * pageSize
            const counts: Record<string, number> = {}
            for (const row of all) {
              counts[row.status] = (counts[row.status] ?? 0) + 1
              counts[row.kind] = (counts[row.kind] ?? 0) + 1
            }
            return sendJson(response, 200, {
              total: filtered.length, page, pageSize, counts,
              evidence: filtered.slice(start, start + pageSize).map(row => ({
                id: row.id, kind: row.kind, status: row.status, title: row.title, statement: row.statement,
                sourceType: row.sourceType,
                ...row.sourceName === undefined ? {} : { sourceName: row.sourceName },
                ...row.sourceDocumentId === undefined ? {} : { sourceDocumentId: row.sourceDocumentId },
                ...row.sourceLocator === undefined ? {} : { sourceLocator: row.sourceLocator },
                ...row.sourceUrl === undefined ? {} : { sourceUrl: row.sourceUrl },
                ...row.confidence === undefined ? {} : { confidence: row.confidence },
                supportingEvidenceIds: row.supportingEvidenceIds,
                relatedRequirementIds: row.relatedRequirementIds,
                relatedCompetitorIds: row.relatedCompetitorIds,
                updatedAt: row.updatedAt,
              })),
            })
          }
          // GET /projects/:id/alternatives → candidates with requirement coverage.
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'alternatives') {
            const projectId = segments[1]!
            return sendJson(response, 200, { alternatives: marketpilot.services.alternatives.list(projectId) })
          }
          // GET /projects/:id/tender-items → clause/response/compliance projection.
          if (method === 'GET' && segments.length === 3 && segments[0] === 'projects' && segments[2] === 'tender-items') {
            const projectId = segments[1]!
            return sendJson(response, 200, { tenderItems: marketpilot.services.tender.list(projectId) })
          }
          if (method === 'GET' && segments.length === 2 && segments[0] === 'summary') {
            return sendJson(response, 200, marketpilot.services.workflows.summary(segments[1]!))
          }
          return sendJson(response, 404, { error: `未知的工作台请求：${method} ${pathname}` })
        } catch (error) {
          if (error instanceof MarketPilotError) {
            const missing = error.code === 'PROJECT_NOT_FOUND' || error.code.endsWith('_NOT_FOUND')
            const tooLarge = error.code === 'UPLOAD_TOO_LARGE'
            return sendJson(response, missing ? 404 : tooLarge ? 413 : 400, { error: error.message, code: error.code })
          }
          const message = error instanceof Error ? error.message : String(error)
          return sendJson(response, 500, { error: message })
        }
      },
    }))
  })
}
