/** Typed same-origin client for the MarketPilot workbench HTTP API. */

/** One project row as the list route returns it. */
export interface ProjectRow { id: string; name: string; status: string; customer?: string; industry?: string; scenario?: string; updatedAt: string }

/** One requirement record. */
export interface RequirementRow { id: string; originalText: string; normalizedText: string; type: string; priority: string; status: string }

/** One evidence record. */
export interface EvidenceRow { id: string; kind: string; status: string; title: string; statement: string }

/** One source document. */
export interface DocumentRow { id: string; name: string; kind: string }

/** One candidate route. */
export interface AlternativeRow { id: string; name: string; summary: string }

/** One human decision. */
export interface DecisionRow { id: string; rationale: string; createdAt: string }

/** One tender clause record. */
export interface TenderItemRow { id: string; originalText: string; normalizedRequirement: string; status: string }

/** One generated artifact. */
export interface ArtifactRow { id: string; name: string; status: string; content?: string }

/** One workflow run record. */
export interface WorkflowRunRow { id: string; type: string; status: string; currentStep: string; updatedAt: string; error?: string }

/** The complete workbench detail of one project. */
export interface ProjectDetail {
  project: ProjectRow
  documents: DocumentRow[]
  requirements: RequirementRow[]
  evidence: EvidenceRow[]
  alternatives: AlternativeRow[]
  decisions: DecisionRow[]
  tenderItems: TenderItemRow[]
  artifacts: ArtifactRow[]
  workflowRuns: WorkflowRunRow[]
}

/** Polling projection of one click-driven execution. */
export interface ExecutionView {
  callId: string
  tool: string
  status: 'running' | 'waiting_human' | 'completed' | 'failed' | 'cancelled'
  question: { header: string; question: string; detail: string; options: string[] } | null
  value?: { summary?: string; data?: unknown }
  error?: string
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
  summary: (id: string) => request<Record<string, unknown>>('GET', `/marketpilot/api/summary/${id}`),
  start: (name: string, args: Record<string, unknown>) => request<{ callId: string }>('POST', '/marketpilot/api/tools', { name, args }),
  execution: (callId: string) => request<ExecutionView>('GET', `/marketpilot/api/executions/${callId}`),
  answer: (callId: string, selected: string, custom?: string) => request<{ answered: boolean }>('POST', `/marketpilot/api/executions/${callId}/answer`, { selected, custom }),
  cancel: (callId: string) => request<{ cancelled: boolean }>('POST', `/marketpilot/api/executions/${callId}/cancel`, {}),
}
