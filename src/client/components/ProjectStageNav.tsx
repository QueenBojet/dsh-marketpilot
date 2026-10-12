/**
 * The single vertical stage navigation for one project: eight sections in
 * workflow order, with the six business stages carrying live run-derived
 * state (done/current/pending/running/waiting/error). Replaces the former
 * duplicate pair of the horizontal phase bar and the plain section list —
 * navigation selection and business stage state stay separately modeled.
 */
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import type { ProjectSection, WorkflowMode } from '../stores.ts'
import type { ProjectWorkflowOverview } from '../../domain/project-workflow.ts'
import { workflowText } from './ProjectWorkflowOverview.tsx'
import { GUIDED_STEPS, guidedCurrentStep, guidedText } from '../guidedWorkflow.ts'

/** Which six-phase stage each project status maps to (0-5; 6 = archived/complete).
 * The baseline marks the stage the user should work in NEXT — requirements_ready
 * points at research (2), solution_ready at tender (5) — so a finished stage
 * never lingers as the stale "current" one. */
export const STAGE_BY_STATUS: Record<string, number> = {
  draft: 0,
  requirements_ready: 2,
  researching: 2,
  alternatives_ready: 3,
  decision_confirmed: 4,
  solution_ready: 5,
  tender_review: 5,
  archived: 6,
}

/** Workflow-run types feeding each stage's live state (1—5). */
const STAGE_RUN_TYPES: readonly (readonly string[])[] = [
  [], ['requirement_analysis'], ['competitor_analysis', 'policy_analysis'],
  ['alternative_generation'], ['solution_generation'], ['tender_review'],
]

/** Live stage state: run truth first (running/waiting/error), status baseline otherwise. */
export type StageState = 'done' | 'current' | 'pending' | 'running' | 'waiting' | 'error'

/** Derive one stage's live state from the project-status baseline and runs. */
export function stageState(index: number, currentStage: number,
  runs: readonly { type: string; status: string }[] | null): StageState {
  if (index > 0) {
    const types = STAGE_RUN_TYPES[index]!
    const latest = runs?.find(run => types.includes(run.type))
    if (latest !== undefined) {
      if (latest.status === 'running') return 'running'
      if (latest.status === 'waiting_human') return 'waiting'
      if (latest.status === 'failed') return 'error'
    }
  }
  return index < currentStage ? 'done' : index === currentStage ? 'current' : 'pending'
}

const STAGE_STATE_TITLE: Record<StageState, MarketPilotTextKey> = {
  done: 'phaseDone', current: 'phaseCurrent', pending: 'phasePending',
  running: 'runStatus.running', waiting: 'runStatus.waiting_human', error: 'runStatus.failed',
}

/** The nav rows: two plain sections wrapping the six business stages. */
const NAV_ROWS: readonly { readonly section: ProjectSection; readonly key: MarketPilotTextKey; readonly stageIndex: number | undefined }[] = [
  { section: 'overview', key: 'sectionOverview', stageIndex: undefined },
  { section: 'requirements', key: 'sectionRequirements', stageIndex: 1 },
  { section: 'research', key: 'sectionResearch', stageIndex: 2 },
  { section: 'evidence', key: 'sectionEvidence', stageIndex: undefined },
  { section: 'alternatives', key: 'sectionAlternatives', stageIndex: 3 },
  { section: 'solution', key: 'sectionSolution', stageIndex: 4 },
  { section: 'tender', key: 'sectionTender', stageIndex: 5 },
  { section: 'artifacts', key: 'sectionArtifacts', stageIndex: undefined },
]

/**
 * Render the stage navigation.
 * @param props.t - the locale-bound text function.
 * @param props.status - the project status (the stage baseline).
 * @param props.runs - live workflow-run snapshots for run-derived state.
 * @param props.section - the currently selected section.
 * @param props.onSelect - switches the project section.
 */
export function ProjectStageNav({ t, status, runs, section, onSelect, workflow, mode = 'professional' }: {
  t: MarketPilotText
  status: string
  runs: readonly { type: string; status: string }[] | null
  section: ProjectSection
  onSelect: (section: ProjectSection) => void
  workflow?: ProjectWorkflowOverview | null
  mode?: WorkflowMode
}) {
  if (mode === 'guided') {
    const current = workflow == null ? undefined : guidedCurrentStep(workflow)
    return <nav className="mp-stageNav mp-guidedNav" aria-label={guidedText(t, 'fiveSteps')}>
      <button type="button" className="mp-stageItem" aria-current={section === 'overview' ? 'page' : undefined}
        onClick={() => { onSelect('overview') }}>{guidedText(t, 'overview')}</button>
      <p className="mp-guidedNavLabel">{guidedText(t, 'fiveSteps')}</p>
      <div className="mp-guidedNavSteps">
        {GUIDED_STEPS.map((step, index) => {
          const fact = workflow?.stages.find(s => s.id === step.id)
          const state = fact === undefined ? undefined : ({ completed: 'done', waiting_human: 'waiting',
            needs_attention: 'waiting', unavailable: 'waiting', running: 'running', failed: 'error' } as Record<string, StageState>)[fact.status]
              ?? (current?.id === step.id ? 'current' : 'pending')
          return <button type="button" key={step.id} className="mp-stageItem mp-guidedNavStep"
            aria-current={section === step.section ? 'page' : undefined} data-stage={fact?.id} data-status={fact?.status} data-state={state}
            title={fact === undefined ? undefined : guidedText(t, `status.${fact.status}`)} onClick={() => { onSelect(step.section) }}>
            <span className="mp-guidedNavNumber" aria-hidden="true">{fact?.status === 'completed' ? '✓' : index + 1}</span>
            <span>{guidedText(t, `title.${step.key}`)}</span>
          </button>
        })}
      </div>
      <div className="mp-guidedNavSupport">
        {(['evidence', 'artifacts', 'tender'] as const).map(target => <button type="button" key={target} className="mp-stageItem"
          aria-current={section === target ? 'page' : undefined} onClick={() => { onSelect(target) }}>{guidedText(t, `nav.${target}`)}</button>)}
      </div>
    </nav>
  }
  const currentStage = STAGE_BY_STATUS[status] ?? 0
  return (
    <nav className="mp-stageNav" aria-label={t('stageNavLabel')}>
      {NAV_ROWS.map(({ section: rowSection, key, stageIndex }) => {
        const projected = workflow?.stages.find(s => s.section === rowSection && (s.id !== 'S0' || workflow.currentStage === 'S0'))
        const state = workflow === null ? undefined : projected === undefined ? stageIndex === undefined ? undefined : stageState(stageIndex, currentStage, runs)
          : ({ completed: 'done', waiting_human: 'waiting', needs_attention: 'waiting', unavailable: 'waiting', running: 'running', failed: 'error' } as Record<string, StageState>)[projected.status]
            ?? (projected.id === workflow?.currentStage ? 'current' : 'pending')
        return (
          <button
            key={rowSection} type="button" className="mp-stageItem"
            aria-current={(section === 'documents' ? 'requirements' : section) === rowSection ? 'page' : undefined}
            {...state === undefined ? {} : { 'data-state': state, title: t(STAGE_STATE_TITLE[state]) }}
            {...projected === undefined ? {} : { 'data-stage': projected.id, 'data-status': projected.status, title: workflowText(t, `status.${projected.status}`) }}
            onClick={() => { onSelect(rowSection) }}
          >
            <span className="mp-stageDot" data-state={state ?? 'none'} aria-hidden="true" />
            {t(key)}
          </button>
        )
      })}
    </nav>
  )
}
