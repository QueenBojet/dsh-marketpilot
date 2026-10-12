/** Display-only mapping of the existing backend stages to five business steps. */
import type { ProjectWorkflowOverview, ProjectWorkflowStage, WorkflowStageId } from '../domain/project-workflow.ts'
import type { MarketPilotText, MarketPilotTextKey } from './locales.ts'
import type { ProjectSection } from './stores.ts'

export const GUIDED_STEPS = [
  { id: 'S0', section: 'documents', key: 'upload' },
  { id: 'S1', section: 'requirements', key: 'requirements' },
  { id: 'S2', section: 'research', key: 'research' },
  { id: 'S4', section: 'alternatives', key: 'routes' },
  { id: 'S5', section: 'solution', key: 'solution' },
] as const satisfies readonly { id: WorkflowStageId; section: ProjectSection; key: string }[]
export type GuidedStep = typeof GUIDED_STEPS[number]
export function guidedText(t: MarketPilotText, key: string): string { return t(`guided.${key}` as MarketPilotTextKey) }
export function guidedStage(snapshot: ProjectWorkflowOverview, step: GuidedStep): ProjectWorkflowStage {
  return snapshot.stages.find(stage => stage.id === step.id)!
}
/** Navigation priority only: never marks a step done or changes a backend action. */
export function guidedCurrentStep(snapshot: ProjectWorkflowOverview): GuidedStep {
  const urgent = GUIDED_STEPS.find(step => ['waiting_human', 'running', 'failed'].includes(guidedStage(snapshot, step).status))
  if (urgent !== undefined) return urgent
  // An existing solution stays the main outcome even if optional tender work remains.
  if (guidedStage(snapshot, GUIDED_STEPS[4]).results > 0) return GUIDED_STEPS[4]
  if (guidedStage(snapshot, GUIDED_STEPS[4]).inputs > 0) return GUIDED_STEPS[4]
  if (guidedStage(snapshot, GUIDED_STEPS[3]).results > 0) return GUIDED_STEPS[3]
  return GUIDED_STEPS.find(step => guidedStage(snapshot, step).status !== 'completed') ?? GUIDED_STEPS[4]
}
export function guidedResult(t: MarketPilotText, step: GuidedStep, stage: ProjectWorkflowStage): string {
  if (stage.results === 0) return guidedText(t, `empty.${step.key}`)
  const result = `${stage.results} ${guidedText(t, `unit.${step.key}`)}`
  return step.id === 'S4' ? `${result} · ${guidedText(t, stage.review === 0 ? 'routeConfirmed' : 'routeNeedsReview')}` : result
}
export function guidedAction(t: MarketPilotText, step: GuidedStep, stage: ProjectWorkflowStage, execute = false): string {
  if (['locateTask', 'locateReview', 'reviewRequirements', 'chooseRoute', 'resumeSolution'].includes(stage.action.key)) {
    return guidedText(t, stage.action.key)
  }
  return guidedText(t, `${stage.results > 0 && !execute ? 'view' : 'action'}.${step.key}`)
}
