import type { ProjectState } from '../src/domain/state.ts'
import type { WorkflowCapabilities } from '../src/domain/project-workflow.ts'

export const now = '2026-10-11T01:00:00.000Z'
export const fields = (id: string) => ({ id, projectId: 'p1', createdAt: now, updatedAt: now })
export const capabilities: WorkflowCapabilities = {
  model: { available: true, mode: 'offline', reason: 'Explicit offline test fixture' },
  research: { available: false, mode: 'unavailable', reason: 'WEB_PROVIDER_UNAVAILABLE' },
}
export function workflowState(): ProjectState {
  return { project: { id: 'p1', name: 'CALM synthetic / test', status: 'draft', createdAt: now, updatedAt: now }, revision: 0,
    documents: [], requirements: [], evidence: [], competitors: [], policies: [], alternatives: [], decisions: [], tenderItems: [], artifacts: [], workflowRuns: [] }
}
export function withInputs(s: ProjectState) {
  s.documents.push({ ...fields('doc1'), name: 'customer.md', kind: 'customer_requirement', textContent: 'Test source', importedAt: now })
  s.requirements.push({ ...fields('req1'), originalText: 'Test requirement', normalizedText: 'Test requirement', type: 'functional', priority: 'must', status: 'confirmed',
    confirmation: { reviewer: 'test human', reviewedAt: now, reason: 'Test only' } })
  return s
}
export function withDecision(s = withInputs(workflowState())) {
  s.alternatives.push({ ...fields('alt1'), name: 'Test route', summary: 'Test route', components: ['Test'], strengths: [], limitations: [], risks: [], unknowns: [], requirementCoverage: {}, evidenceIds: [], status: 'selected' })
  s.decisions.push({ ...fields('dec1'), alternativeId: 'alt1', decision: 'selected', rationale: 'Test only', evidenceIds: [], requirementIds: ['req1'], confirmedBy: 'test human', confirmedAt: now,
    review: { reviewer: 'test human', reviewedAt: now, reason: 'Test only' } })
  s.project.activeDecisionId = 'dec1'
  return s
}
export function withSolution(s = withDecision()) {
  s.artifacts.push({ ...fields('art1'), name: 'Solution.md', type: 'solution', format: 'markdown', content: '# Synthetic test solution', reviewStatus: 'draft' })
  return s
}
export function run(id: string, type: ProjectState['workflowRuns'][number]['type'], status: ProjectState['workflowRuns'][number]['status']) {
  return { ...fields(id), type, status, currentStep: status.toUpperCase(), startedAt: now, steps: [{ step: status.toUpperCase(), at: now }],
    input: {}, durationMs: 0, modelCalls: 0, toolCalls: 0, humanWaitMs: 0,
    ...status === 'waiting_human' ? { waitingSince: now } : {},
    ...['completed', 'failed', 'cancelled'].includes(status) ? { completedAt: now } : {},
    ...status === 'failed' ? { error: 'MODEL_TIMEOUT: test failure' } : {} }
}
