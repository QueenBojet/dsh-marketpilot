/** Typed same-origin client for the MarketPilot workbench HTTP API. */
import type { ShortCodeBook } from '../domain/shortcodes.ts'
import type { ProjectWorkflowOverview } from '../domain/project-workflow.ts'
import type { ProjectReviewOverview } from '../domain/project-review.ts'

/** One project row as the list route returns it. */
export interface ProjectRow {
  id: string
  name: string
  status: string
  customer?: string
  industry?: string
  scenario?: string
  activeDecisionId?: string
  updatedAt: string
}

/** One requirement record (full rows carry createdAt; projections may omit it). */
export interface RequirementRow { id: string; originalText: string; normalizedText: string; type: string; priority: string; status: string; createdAt?: string }

/** One evidence record (full rows carry createdAt; projections may omit it). */
export interface EvidenceRow { id: string; kind: string; status: string; title: string; statement: string; createdAt?: string }

/** One source document (full record, detail route only). */
export interface DocumentRow { id: string; name: string; kind: string; importedAt?: string }

/** One candidate route (full rows carry createdAt; projections may omit it). */
export interface AlternativeRow { id: string; name: string; summary: string; createdAt?: string }

/** One human decision. */
export interface DecisionRow { id: string; rationale: string; createdAt: string }

/** One tender clause record (full rows carry timestamps; projections may omit them). */
export interface TenderItemRow { id: string; originalText: string; normalizedRequirement: string; status: string; clauseId?: string; createdAt?: string }

/**
 * One generated artifact. The review state is `reviewStatus`
 * ('draft' | 'approved') — the backend field name, not `status`.
 */
export interface ArtifactRow { id: string; name: string; reviewStatus: string; type?: string; content?: string; createdAt?: string }

/** Artifact list metadata (no content payload). */
export interface ArtifactMetaRow {
  id: string
  name: string
  type: string
  format: string
  reviewStatus: string
  workflowRunId?: string
  createdAt: string
  updatedAt: string
}

/** One full artifact record (content included). */
export interface ArtifactFullRow extends ArtifactMetaRow { content: string }

/** One workflow run record. */
export interface WorkflowRunRow { id: string; type: string; status: string; currentStep: string; updatedAt: string; error?: string }

/**
 * One persisted run with its owning project — the task-center history rows.
 * `supersededWait` marks a waiting record a newer same-type run has replaced:
 * it stays visible as history but never counts as an actionable approval.
 */
export interface HistoryRunRow extends WorkflowRunRow {
  projectId: string
  projectName: string
  startedAt: string
  steps: { step: string; at: string }[]
  durationMs?: number
  supersededWait?: boolean
}

/** One workflow-run timeline snapshot from the runs route. */
export interface WorkflowRunView {
  id: string
  type: string
  status: string
  currentStep: string
  steps: { step: string; at: string }[]
  startedAt: string
  updatedAt: string
  error?: string
  durationMs?: number
  modelCalls?: number
  supersededWait?: boolean
  output?: { requirementIds?: string[]; unknownIds?: string[]; artifactId?: string } | null
}

/** Document metadata from the documents route (no text payload). */
export interface DocumentMeta { id: string; name: string; kind: string; importedAt: string; bytes: number; hasText: boolean }

/** Requirement projection from the requirements route. */
export interface RequirementItem {
  id: string
  shortId: string
  originalText: string
  normalizedText: string
  type: string
  priority: string
  status: string
  sourceDocumentId: string
  sourceDocumentName?: string
  sourceLocator?: string
  clarificationQuestion?: string
  risk?: string
  updatedAt: string
}

/** Requirements page envelope from the requirements route. */
export interface RequirementsPage {
  total: number
  page: number
  pageSize: number
  counts: Record<string, number>
  requirements: RequirementItem[]
}

/** The complete workbench detail of one project. */
export interface ProjectDetail {
  project: ProjectRow
  documents: DocumentRow[]
  requirements: RequirementRow[]
  evidence: EvidenceRow[]
  competitors?: unknown[]
  policies?: unknown[]
  alternatives: AlternativeRow[]
  decisions: DecisionRow[]
  tenderItems: TenderItemRow[]
  artifacts: ArtifactRow[]
  workflowRuns: WorkflowRunRow[]
  /** Persisted short-code assignments; JSON `null` on legacy projects. */
  codeBook?: ShortCodeBook | null
}

/** Polling projection of one click-driven execution. */
export interface ExecutionView {
  callId: string
  tool: string
  status: 'running' | 'waiting_human' | 'completed' | 'failed' | 'cancelled'
  startedAt: string
  projectId?: string
  runId?: string
  question: { header: string; question: string; detail: string; options: string[] } | null
  value?: { summary?: string; data?: unknown }
  error?: string
}

/** Options for the requirements list route. */
export interface RequirementsQuery { status?: string; q?: string; page?: number; pageSize?: number; priority?: string; runId?: string }

/** One competitor row (competitor matrix projection). */
export interface CompetitorItem {
  id: string
  company: string
  product?: string | undefined
  technology?: string | undefined
  targetScenario?: string | undefined
  performance: Record<string, string | number | boolean | null>
  parameterContexts?: Record<string, { unit: string | null; conditions: string | null; evidenceId: string }> | undefined
  interfaces: string[]
  certifications: string[]
  cases: string[]
  strengths: string[]
  limitations: string[]
  evidenceIds: string[]
  updatedAt: string
}

/** One policy/standard row. */
export interface PolicyItem {
  id: string
  title: string
  issuer?: string
  documentNumber?: string
  version?: string
  scope?: string
  mandatoryLevel: string
  keyRequirements: string[]
  impact?: string
  gap?: string
  evidenceIds: string[]
  updatedAt: string
}

/** One evidence-ledger row (list projection). */
export interface EvidenceItem {
  id: string
  kind: string
  status: string
  title: string
  statement: string
  sourceType: string
  sourceName?: string
  sourceDocumentId?: string
  sourceLocator?: string
  sourceUrl?: string
  confidence?: number
  supportingEvidenceIds: string[]
  relatedRequirementIds: string[]
  relatedCompetitorIds: string[]
  updatedAt: string
}

/** Evidence page envelope with status/kind tallies. */
export interface EvidencePage {
  total: number
  page: number
  pageSize: number
  counts: Record<string, number>
  evidence: EvidenceItem[]
}

/** One candidate route with requirement coverage. */
export interface AlternativeItem {
  id: string
  name: string
  summary: string
  components: string[]
  strengths: string[]
  limitations: string[]
  risks: string[]
  unknowns: string[]
  requirementCoverage: Record<string, string>
  evidenceIds: string[]
  status: string
  updatedAt: string
}

/** One tender clause with response draft and compliance status. */
export interface TenderItemProjection {
  id: string
  clauseId?: string
  originalText: string
  normalizedRequirement: string
  sourceDocumentId?: string
  sourceLocator?: string
  claimKinds: string[]
  responseDraft?: string
  status: string
  requirementIds: string[]
  evidenceIds: string[]
  risk?: string
  action?: string
  updatedAt: string
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const response = await fetch(path, init)
  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null
  if (payload === null) throw new Error(`工作台请求无响应：${method} ${path}`)
  if (!response.ok) throw new Error(payload.error ?? `工作台请求失败（${String(response.status)}）：${method} ${path}`)
  return payload
}

export const api = {
  projects: () => request<{ projects: ProjectRow[] }>('GET', '/marketpilot/api/projects'),
  project: (id: string) => request<ProjectDetail>('GET', `/marketpilot/api/projects/${id}`),
  workflow: (id: string) => request<ProjectWorkflowOverview>('GET', `/marketpilot/api/projects/${id}/workflow`),
  review: (id: string) => request<ProjectReviewOverview>('GET', `/marketpilot/api/projects/${id}/review`),
  document: (projectId: string, documentId: string) => request<{ document: DocumentMeta & { textContent: string } }>('GET', `/marketpilot/api/projects/${projectId}/documents/${documentId}`),
  summary: (id: string) => request<Record<string, unknown>>('GET', `/marketpilot/api/summary/${id}`),
  documents: (projectId: string) => request<{ documents: DocumentMeta[] }>('GET', `/marketpilot/api/projects/${projectId}/documents`),
  upload: async (projectId: string, name: string, kind: string, text: string): Promise<{ document: DocumentMeta }> => {
    const response = await fetch(`/marketpilot/api/projects/${projectId}/documents/upload?name=${encodeURIComponent(name)}&kind=${encodeURIComponent(kind)}`, {
      method: 'POST', headers: { 'content-type': 'text/plain; charset=utf-8' }, body: text,
    })
    const payload = await response.json().catch(() => null) as ({ document: DocumentMeta } & { error?: string }) | null
    if (payload === null) throw new Error('上传无响应。')
    if (!response.ok) throw new Error(payload.error ?? `上传失败（${String(response.status)}）。`)
    return payload
  },
  requirements: (projectId: string, query: RequirementsQuery = {}) => {
    const params = new URLSearchParams()
    if (query.priority !== undefined && query.priority !== 'all') params.set('priority', query.priority)
    if (query.runId !== undefined && query.runId !== '') params.set('runId', query.runId)
    if (query.status !== undefined && query.status !== 'all') params.set('status', query.status)
    if (query.q !== undefined && query.q !== '') params.set('q', query.q)
    if (query.page !== undefined) params.set('page', String(query.page))
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
    const suffix = params.size === 0 ? '' : `?${params.toString()}`
    return request<RequirementsPage>('GET', `/marketpilot/api/projects/${projectId}/requirements${suffix}`)
  },
  /** One requirement by id, independent of any list filter/pagination. */
  requirement: (projectId: string, requirementId: string) =>
    request<{ requirement: RequirementItem }>('GET', `/marketpilot/api/projects/${projectId}/requirements/${requirementId}`),
  runs: (projectId: string, options: { type?: string; active?: boolean } = {}) => {
    const params = new URLSearchParams()
    if (options.type !== undefined) params.set('type', options.type)
    if (options.active === true) params.set('active', '1')
    const suffix = params.size === 0 ? '' : `?${params.toString()}`
    return request<{ runs: WorkflowRunView[] }>('GET', `/marketpilot/api/projects/${projectId}/runs${suffix}`)
  },
  /** Persisted runs across all projects, newest first — survives host restarts. */
  recentRuns: (limit = 40) => request<{ runs: HistoryRunRow[] }>('GET', `/marketpilot/api/runs?limit=${String(limit)}`),
  requestArtifacts: (projectId: string) => request<{ artifacts: ArtifactMetaRow[] }>('GET', `/marketpilot/api/projects/${projectId}/artifacts`),
  artifact: (projectId: string, artifactId: string) => request<{ artifact: ArtifactFullRow }>('GET', `/marketpilot/api/projects/${projectId}/artifacts/${artifactId}`),
  competitors: (projectId: string) => request<{ competitors: CompetitorItem[] }>('GET', `/marketpilot/api/projects/${projectId}/competitors`),
  research: (projectId: string) => request<import('../domain/research-review.ts').ResearchOverview>('GET', `/marketpilot/api/projects/${projectId}/research`),
  policies: (projectId: string) => request<{ policies: PolicyItem[] }>('GET', `/marketpilot/api/projects/${projectId}/policies`),
  evidence: (projectId: string, query: { status?: string; kind?: string; q?: string; pageSize?: number; page?: number; review?: string } = {}) => {
    const params = new URLSearchParams()
    if (query.review !== undefined && query.review !== 'all') params.set('review', query.review)
    if (query.page !== undefined) params.set('page', String(query.page))
    if (query.status !== undefined && query.status !== 'all') params.set('status', query.status)
    if (query.kind !== undefined && query.kind !== 'all') params.set('kind', query.kind)
    if (query.q !== undefined && query.q !== '') params.set('q', query.q)
    if (query.pageSize !== undefined) params.set('pageSize', String(query.pageSize))
    const suffix = params.size === 0 ? '' : `?${params.toString()}`
    return request<EvidencePage>('GET', `/marketpilot/api/projects/${projectId}/evidence${suffix}`)
  },
  /** One evidence record by id, independent of any ledger filter/page. */
  evidenceOne: (projectId: string, evidenceId: string) =>
    request<{ evidence: EvidenceItem }>('GET', `/marketpilot/api/projects/${projectId}/evidence/${evidenceId}`),
  alternatives: (projectId: string) => request<{ alternatives: AlternativeItem[] }>('GET', `/marketpilot/api/projects/${projectId}/alternatives`),
  tenderItems: (projectId: string) => request<{ tenderItems: TenderItemProjection[] }>('GET', `/marketpilot/api/projects/${projectId}/tender-items`),
  executions: (projectId?: string) => request<{ executions: ExecutionView[] }>('GET',
    `/marketpilot/api/executions${projectId === undefined ? '' : `?projectId=${encodeURIComponent(projectId)}`}`),
  start: (name: string, args: Record<string, unknown>) => request<{ callId: string }>('POST', '/marketpilot/api/tools', { name, args }),
  execution: (callId: string) => request<ExecutionView>('GET', `/marketpilot/api/executions/${callId}`),
  answer: (callId: string, selected: string, custom?: string) => request<{ answered: boolean }>('POST', `/marketpilot/api/executions/${callId}/answer`, { selected, custom }),
  cancel: (callId: string) => request<{ cancelled: boolean }>('POST', `/marketpilot/api/executions/${callId}/cancel`, {}),
}
