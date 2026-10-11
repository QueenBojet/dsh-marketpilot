/** Read-only navigation projection. Never advances Project or writes Run status. */
import type { ProjectState } from './state.ts'
import { markSupersededWaits } from './runs.ts'

export type WorkflowStageId = 'S0' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7'
export type WorkflowSection = 'overview' | 'requirements' | 'research' | 'evidence' | 'alternatives' | 'solution' | 'tender' | 'artifacts'
export type WorkflowStageStatus = 'not_started' | 'ready' | 'running' | 'waiting_human' | 'completed' | 'needs_attention' | 'failed' | 'skipped_optional' | 'unavailable'
export interface WorkflowCapability {
  available: boolean
  mode: 'live' | 'offline' | 'unavailable' | 'unverified'
  reason: string
  provider?: string
  model?: string
  reasoningEffort?: string
}
export interface WorkflowCapabilities { model: WorkflowCapability; research: WorkflowCapability }
export interface WorkflowExecutionFact {
  callId: string; tool: string; status: string; startedAt: string; projectId?: string; runId?: string
  question: unknown; error?: string; value?: unknown
}
export interface WorkflowPrerequisite { key: string; section: WorkflowSection }
export interface ProjectWorkflowStage {
  id: WorkflowStageId
  section: WorkflowSection
  status: WorkflowStageStatus
  inputs: number
  results: number
  review: number
  prerequisites: WorkflowPrerequisite[]
  action: { key: string; enabled: boolean; section: WorkflowSection; tool?: string; args?: Record<string, unknown> }
  run?: { id: string; type: string; status: string; currentStep: string; steps: { step: string; at: string }[]; error?: string }
  execution?: { callId: string; status: string; error?: string }
}
export interface ProjectWorkflowOverview {
  projectId: string
  revision: number
  currentStage: WorkflowStageId
  stages: ProjectWorkflowStage[]
  waiting: number
  unknowns: number
  capabilities: WorkflowCapabilities
  latestArtifact?: { id: string; name: string; type: string; reviewStatus: string; createdAt: string; workflowRunId?: string }
  issues: WorkflowPrerequisite[]
}

const STAGES: readonly { id: WorkflowStageId; section: WorkflowSection; types: string[]; tools: string[] }[] = [
  { id: 'S0', section: 'requirements', types: [], tools: ['marketpilot_document_import'] },
  { id: 'S1', section: 'requirements', types: ['requirement_analysis'], tools: ['marketpilot_requirement_extract', 'marketpilot_requirement_confirm'] },
  { id: 'S2', section: 'research', types: ['competitor_analysis', 'policy_analysis'], tools: ['marketpilot_competitor_extract', 'marketpilot_policy_extract', 'marketpilot_research_search'] },
  { id: 'S3', section: 'evidence', types: [], tools: ['marketpilot_evidence_verify'] },
  { id: 'S4', section: 'alternatives', types: ['alternative_generation'], tools: ['marketpilot_alternative_generate', 'marketpilot_decision_confirm'] },
  { id: 'S5', section: 'solution', types: ['solution_generation'], tools: ['marketpilot_solution_generate'] },
  { id: 'S6', section: 'tender', types: ['tender_review'], tools: ['marketpilot_tender_extract', 'marketpilot_tender_review'] },
  { id: 'S7', section: 'artifacts', types: [], tools: ['marketpilot_artifact_export'] },
]

export function projectWorkflowOverview(state: ProjectState, capabilities: WorkflowCapabilities,
  executionFacts: readonly WorkflowExecutionFact[]): ProjectWorkflowOverview {
  const executions = executionFacts.filter(e => e.projectId === state.project.id)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.callId.localeCompare(a.callId))
  const runs = markSupersededWaits(state.workflowRuns)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id))
  const latestRuns = runs.filter((r, i) => runs.findIndex(other => other.type === r.type) === i)
  const documents = state.documents.filter(d => d.textContent.trim() !== '')
  const confirmed = state.requirements.filter(r => r.status === 'confirmed')
  const proposed = state.requirements.filter(r => r.status === 'proposed')
  const activeEvidence = state.evidence.filter(e => !['rejected', 'superseded'].includes(e.status))
  const unknowns = activeEvidence.filter(e => e.kind === 'UNKNOWN').length
  const evidenceReview = activeEvidence.filter(e => e.status !== 'verified').length
  const decision = state.decisions.find(d => d.id === state.project.activeDecisionId)
  const artifacts = [...state.artifacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  const solution = artifacts.find(a => a.type === 'solution')
  const tenderDocs = documents.filter(d => d.kind === 'tender')
  const tenderReview = state.tenderItems.filter(t => t.responseDraft === undefined || !['compliant', 'not_applicable'].includes(t.status)).length
  const needsModel: WorkflowStageId[] = ['S1', 'S2', 'S4', 'S5', 'S6']
  const issue = (key: string, section: WorkflowSection): WorkflowPrerequisite => ({ key, section })
  const stages: ProjectWorkflowStage[] = STAGES.map(def => {
    const { id, section } = def
    let status: WorkflowStageStatus = 'not_started'
    let inputs = 0, results = 0, review = 0
    const prerequisites: WorkflowPrerequisite[] = []
    let action: ProjectWorkflowStage['action'] = { key: `action.${id}`, enabled: true, section }
    if (id === 'S0') {
      inputs = documents.length; results = documents.length
      status = documents.length > 0 ? 'completed' : 'ready'
    } else if (id === 'S1') {
      inputs = documents.length; results = confirmed.length; review = proposed.length
      status = confirmed.length > 0 ? 'completed' : documents.length > 0 ? 'ready' : 'not_started'
      if (!documents.length) prerequisites.push(issue('needDocuments', 'requirements'))
      if (proposed.length) status = 'needs_attention'
    } else if (id === 'S2') {
      inputs = documents.length; results = state.competitors.length + state.policies.length
      status = results > 0 ? 'completed' : documents.length > 0 ? 'ready' : 'not_started'
      if (!documents.length) prerequisites.push(issue('needResearchDocuments', 'requirements'))
    } else if (id === 'S3') {
      inputs = activeEvidence.length; results = activeEvidence.filter(e => e.status === 'verified').length
      review = evidenceReview + activeEvidence.filter(e => e.kind === 'UNKNOWN' && e.status === 'verified').length
      status = review > 0 ? 'needs_attention' : results > 0 ? 'completed' : 'not_started'
      if (!activeEvidence.length) prerequisites.push(issue('needEvidence', 'requirements'))
    } else if (id === 'S4') {
      inputs = confirmed.length; results = state.alternatives.length; review = decision === undefined ? results : 0
      status = decision !== undefined ? 'completed' : results > 0 ? 'needs_attention' : inputs > 0 ? 'ready' : 'not_started'
      if (!inputs) prerequisites.push(issue('needConfirmed', 'requirements'))
      if (results > 0 && decision === undefined) action.key = 'chooseRoute'
      else action = { ...action, tool: 'marketpilot_alternative_generate', args: {} }
    } else if (id === 'S5') {
      inputs = decision === undefined ? 0 : 1; results = artifacts.filter(a => a.type === 'solution').length
      review = solution?.reviewStatus === 'draft' ? 1 : 0
      status = solution !== undefined ? 'completed' : inputs > 0 ? 'ready' : 'not_started'
      if (!confirmed.length) prerequisites.push(issue('needConfirmed', 'requirements'))
      if (!decision) prerequisites.push(issue('needDecision', 'alternatives'))
      action = { ...action, tool: 'marketpilot_solution_generate', args: {} }
    } else if (id === 'S6') {
      inputs = tenderDocs.length; results = state.tenderItems.length; review = tenderReview
      status = inputs === 0 ? 'skipped_optional' : results === 0 ? 'ready' : tenderReview > 0 ? 'needs_attention' : 'completed'
      if (!inputs) prerequisites.push(issue('optionalTender', 'requirements'))
    } else {
      inputs = artifacts.length; results = artifacts.filter(a => a.reviewStatus === 'approved').length
      review = artifacts.filter(a => a.reviewStatus === 'draft').length
      // Artifact approval proves review, not export. Export history is currently host-memory only.
      const exported = executions.some(e => {
        if (e.tool !== 'marketpilot_artifact_export' || e.status !== 'completed') return false
        const value = e.value as { data?: { artifactId?: string }; artifactId?: string } | undefined
        const artifactId = value?.data?.artifactId ?? value?.artifactId
        return artifacts.some(a => a.id === artifactId && a.reviewStatus === 'approved')
      })
      status = exported && results > 0 ? 'completed' : inputs > 0 ? 'ready' : 'not_started'
      if (!inputs) prerequisites.push(issue('needArtifact', 'solution'))
    }
    if (needsModel.includes(id) && !capabilities.model.available && status !== 'skipped_optional') {
      prerequisites.push(issue('needModel', section))
      if (status !== 'completed' && status !== 'needs_attention') status = 'unavailable'
    }
    action.enabled = prerequisites.length === 0
      || (id === 'S4' && results > 0 && decision === undefined && prerequisites.every(p => p.key === 'needModel'))
    const relevant = latestRuns.filter(r => def.types.includes(r.type))
    const run = relevant.find(r => r.status === 'waiting_human' && r.supersededWait !== true)
      ?? relevant.find(r => r.status === 'running' || r.status === 'failed' || r.status === 'cancelled') ?? relevant[0]
    const latestExecution = executions.find(e => def.tools.includes(e.tool))
    const execution = executions.find(e => def.tools.includes(e.tool) && (e.status === 'waiting_human' || e.status === 'running'))
      ?? (latestExecution !== undefined && (latestExecution.status === 'failed' || latestExecution.status === 'cancelled')
        && (run === undefined || latestExecution.startedAt >= run.startedAt) ? latestExecution : undefined)
    if (run !== undefined) {
      action.args = { ...action.args }
      if (run.status === 'waiting_human' && run.supersededWait !== true) {
        const requirementIds = Array.isArray(run.output?.requirementIds) ? run.output.requirementIds : []
        const recoverable = id === 'S1' && proposed.some(r => requirementIds.includes(r.id))
          || id === 'S5'
        status = recoverable ? 'waiting_human' : 'needs_attention'
        if (id === 'S5') {
          if (decision === undefined) action = { key: 'needDecision', enabled: true, section: 'alternatives' }
          else action = { ...action, key: 'resumeSolution', args: { runId: run.id } }
        }
        if (id === 'S1' && recoverable) action = { key: 'reviewRequirements', enabled: true, section }
      } else if (run.status === 'running') status = execution === undefined ? 'needs_attention' : 'running'
      else if (run.status === 'failed') status = 'failed'
      else if (run.status === 'cancelled') status = 'needs_attention'
    }
    if (execution !== undefined) {
      status = execution.status === 'waiting_human' ? 'waiting_human' : execution.status === 'running' ? 'running'
        : execution.status === 'failed' ? 'failed' : 'needs_attention'
      if (execution.status === 'waiting_human' || execution.status === 'running') {
        action = { key: execution.status === 'waiting_human' ? 'locateReview' : 'locateTask', enabled: true, section }
      }
    } else if (run?.status === 'running') {
      prerequisites.push(issue('interruptedRun', section))
    }
    return { id, section, status, inputs, results, review, prerequisites, action,
      ...run === undefined ? {} : { run: { id: run.id, type: run.type, status: run.status, currentStep: run.currentStep,
        steps: run.steps, ...run.error === undefined ? {} : { error: run.error } } },
      ...execution === undefined ? {} : { execution: { callId: execution.callId, status: execution.status,
        ...execution.error === undefined ? {} : { error: execution.error } } } }
  })
  const urgent = stages.find(s => s.status === 'waiting_human') ?? stages.find(s => s.status === 'running')
    ?? stages.find(s => s.status === 'failed')
  const next = urgent ?? (confirmed.length === 0 ? stages[documents.length === 0 ? 0 : 1]!
    : decision === undefined ? stages[4]! : solution === undefined ? stages[5]!
      : tenderDocs.length > 0 && stages[6]!.status !== 'completed' ? stages[6]! : stages[7]!)
  const issues: WorkflowPrerequisite[] = []
  if (unknowns > 0 || evidenceReview > 0) issues.push(issue('openEvidence', 'evidence'))
  if (solution !== undefined && [...state.documents, ...state.requirements, ...state.evidence, ...state.decisions]
    .some(record => record.updatedAt > solution.createdAt)) issues.push(issue('possiblyStale', 'solution'))
  if (!capabilities.research.available) issues.push(issue('researchUnavailable', 'research'))
  return { projectId: state.project.id, revision: state.revision, currentStage: next.id, stages,
    waiting: stages.filter(s => s.status === 'waiting_human').length, unknowns, capabilities, issues,
    ...artifacts[0] === undefined ? {} : { latestArtifact: { id: artifacts[0].id, name: artifacts[0].name,
      type: artifacts[0].type, reviewStatus: artifacts[0].reviewStatus, createdAt: artifacts[0].createdAt,
      ...artifacts[0].workflowRunId === undefined ? {} : { workflowRunId: artifacts[0].workflowRunId } } } }
}
