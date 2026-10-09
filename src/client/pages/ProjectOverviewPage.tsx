/**
 * Project overview: header, six-phase bar derived from the project status,
 * section navigation, and read-only summaries. Sections without a dedicated
 * workflow UI yet render an explicit "planned" state — never fake actions.
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectDetail } from '../api.ts'
import { ErrorState, LoadingState } from '../components/States.tsx'
import { StatusTag } from '../components/StatusTag.tsx'
import { formatTime } from '../format.ts'
import { useProjectDetail } from '../hooks/useProjects.ts'
import { useProjectRuns } from '../hooks/useExecution.ts'
import { marketpilotLocales, type MarketPilotText, type MarketPilotTextKey } from '../locales.ts'
import { ArtifactsPage } from './ArtifactsPage.tsx'
import { AlternativesPage } from './AlternativesPage.tsx'
import { EvidencePage } from './EvidencePage.tsx'
import { RequirementsPage } from './RequirementsPage.tsx'
import { ResearchPage } from './ResearchPage.tsx'
import { SolutionPage } from './SolutionPage.tsx'
import { TenderPage } from './TenderPage.tsx'
import type { MarketPilotActions, MarketPilotView, ProjectSection } from '../stores.ts'

/** The project branch of the navigation view. */
type ProjectView = Extract<MarketPilotView, { kind: 'project' }>

/** Which six-phase stage each project status maps to (0-5; 6 = archived/complete). */
const STAGE_BY_STATUS: Record<string, number> = {
  draft: 0,
  requirements_ready: 1,
  researching: 2,
  alternatives_ready: 3,
  decision_confirmed: 4,
  solution_ready: 4,
  tender_review: 5,
  archived: 6,
}

const STAGES: readonly MarketPilotTextKey[] = [
  'phasePrepare', 'phaseRequirement', 'phaseResearch', 'phaseCompare', 'phaseSolution', 'phaseTender',
]

/** The panel section each phase chip jumps to. */
const STAGE_SECTIONS: readonly ProjectSection[] = ['overview', 'requirements', 'research', 'alternatives', 'solution', 'tender']

/** Workflow-run types feeding each phase's live state (1—5). */
const STAGE_RUN_TYPES: readonly (readonly string[])[] = [
  [], ['requirement_analysis'], ['competitor_analysis', 'policy_analysis'],
  ['alternative_generation'], ['solution_generation'], ['tender_review'],
]

/** Live phase state: run truth first (running/waiting/error), project-status baseline otherwise. */
type PhaseState = 'done' | 'current' | 'pending' | 'running' | 'waiting' | 'error'

function phaseState(index: number, currentStage: number,
  runs: readonly { type: string; status: string }[] | null): PhaseState {
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

const PHASE_STATE_TITLE: Record<PhaseState, MarketPilotTextKey> = {
  done: 'phaseDone', current: 'phaseCurrent', pending: 'phasePending',
  running: 'runStatus.running', waiting: 'runStatus.waiting_human', error: 'runStatus.failed',
}

const SECTIONS: readonly { readonly section: ProjectSection; readonly key: MarketPilotTextKey }[] = [
  { section: 'overview', key: 'sectionOverview' },
  { section: 'requirements', key: 'sectionRequirements' },
  { section: 'research', key: 'sectionResearch' },
  { section: 'evidence', key: 'sectionEvidence' },
  { section: 'alternatives', key: 'sectionAlternatives' },
  { section: 'solution', key: 'sectionSolution' },
  { section: 'tender', key: 'sectionTender' },
  { section: 'artifacts', key: 'sectionArtifacts' },
]

/** The detail route also returns competitor/policy rows the V2 type omits. */
type FullDetail = ProjectDetail & { competitors?: unknown[]; policies?: unknown[] }

/** Read-only counts over the detail payload. */
interface Counts {
  documents: number
  requirements: number
  confirmed: number
  unknown: number
  evidence: number
  competitors: number
  policies: number
  alternatives: number
  decisions: number
  artifacts: number
  tenderItems: number
  runs: number
}

/** Existing-data count per non-overview section, shown beside the planned notice. */
function existingCount(section: ProjectSection, counts: Counts): number | undefined {
  switch (section) {
    case 'requirements': return counts.requirements
    case 'research': return counts.competitors + counts.policies
    case 'evidence': return counts.evidence
    case 'alternatives': return counts.alternatives + counts.decisions
    case 'solution': return counts.artifacts
    case 'tender': return counts.tenderItems
    case 'artifacts': return counts.artifacts
    default: return undefined
  }
}

/**
 * Render the project overview page.
 * @param props.t - the locale-bound text function.
 * @param props.actions - bound store actions.
 * @param props.view - the active project view (projectId + section).
 * @returns the page.
 */
export function ProjectOverviewPage({ t, actions, view }: {
  t: MarketPilotText
  actions: MarketPilotActions
  view: ProjectView
}) {
  const { detail, error, refresh, loading } = useProjectDetail(view.projectId)
  const runsQuery = useProjectRuns(view.projectId)
  if (error !== '') return <ErrorState t={t} message={error} onRetry={refresh} />
  if (loading || detail === null) return <LoadingState t={t} />
  const full = detail as FullDetail
  const { project } = detail
  // Wire boundary: a missing or renamed collection must degrade to zero, not
  // crash the page on `.length`.
  const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : []
  const requirements = rows(detail.requirements) as ProjectDetail['requirements']
  const counts: Counts = {
    documents: rows(detail.documents).length,
    requirements: requirements.length,
    confirmed: requirements.filter(r => r.status === 'confirmed').length,
    unknown: requirements.filter(r => r.status === 'unknown').length,
    evidence: rows(detail.evidence).length,
    competitors: rows(full.competitors).length,
    policies: rows(full.policies).length,
    alternatives: rows(detail.alternatives).length,
    decisions: rows(detail.decisions).length,
    artifacts: rows(detail.artifacts).length,
    tenderItems: rows(detail.tenderItems).length,
    runs: rows(detail.workflowRuns).length,
  }
  const currentStage = STAGE_BY_STATUS[project.status] ?? 0
  const nextKey = `next.${project.status}` as MarketPilotTextKey
  const hasNext = nextKey in marketpilotLocales.zh
  return (
    <div>
      <div className="mp-pageActions" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="mp-pageTitle">{project.name}</h1>
          <div style={{ margin: '4px 0 8px' }}><StatusTag t={t} kind="project" value={project.status} /></div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => { actions.goProjects() }}>{t('back')}</Button>
      </div>
      <dl className="mp-kv">
        <dt>{t('fieldIndustry')}</dt><dd>{project.industry ?? t('valueUnset')}</dd>
        <dt>{t('fieldScenario')}</dt><dd>{project.scenario ?? t('valueUnset')}</dd>
        <dt>{t('fieldCustomer')}</dt><dd>{project.customer ?? t('valueUnset')}</dd>
        <dt>{t('fieldUpdated')}</dt><dd>{formatTime(project.updatedAt)}</dd>
      </dl>
      <div className="mp-phaseBar" role="group" aria-label={t('phaseCurrent')}>
        {STAGES.map((stage, index) => {
          const state = phaseState(index, currentStage, runsQuery.runs)
          return (
            <button
              key={stage} type="button" className="mp-phase" data-state={state}
              title={t(PHASE_STATE_TITLE[state])}
              onClick={() => { actions.setSection(STAGE_SECTIONS[index]!) }}
            >
              {t(stage)}
            </button>
          )
        })}
      </div>
      <div className="mp-nextHint">
        <strong>{t('nextStepLabel')}</strong>
        <span>{hasNext ? t(nextKey) : project.status}</span>
      </div>
      <div className="mp-layout">
        <nav className="mp-sidenav" aria-label={project.name}>
          {SECTIONS.map(({ section, key }) => (
            <button
              key={section} type="button" className="mp-navItem"
              aria-current={view.section === section ? 'page' : undefined}
              onClick={() => { actions.setSection(section) }}
            >
              {t(key)}
            </button>
          ))}
        </nav>
        <div>
          {view.section === 'overview' ? (
            <div className="mp-countGrid">
              <div className="mp-card"><div className="mp-cardValue">{String(counts.documents)}</div><div className="mp-cardLabel">{t('countDocuments')}</div></div>
              <div className="mp-card"><div className="mp-cardValue">{`${String(counts.confirmed)} / ${String(counts.requirements)}`}</div><div className="mp-cardLabel">{t('countRequirements')}</div></div>
              <div className="mp-card"><div className="mp-cardValue">{String(counts.unknown)}</div><div className="mp-cardLabel">{t('countUnknown')}</div></div>
              <div className="mp-card"><div className="mp-cardValue">{String(counts.evidence)}</div><div className="mp-cardLabel">{t('countEvidence')}</div></div>
              <div className="mp-card"><div className="mp-cardValue">{String(counts.alternatives)}</div><div className="mp-cardLabel">{t('countAlternatives')}</div></div>
              <div className="mp-card"><div className="mp-cardValue">{String(counts.artifacts)}</div><div className="mp-cardLabel">{t('countArtifacts')}</div></div>
              <div className="mp-card"><div className="mp-cardValue">{String(counts.tenderItems)}</div><div className="mp-cardLabel">{t('sectionTender')}</div></div>
              <div className="mp-card"><div className="mp-cardValue">{String(counts.runs)}</div><div className="mp-cardLabel">{t('countRuns')}</div></div>
            </div>
          ) : view.section === 'requirements' ? (
            <RequirementsPage t={t} projectId={view.projectId} />
          ) : view.section === 'artifacts' ? (
            <ArtifactsPage t={t} projectId={view.projectId} />
          ) : view.section === 'research' ? (
            <ResearchPage t={t} projectId={view.projectId} />
          ) : view.section === 'evidence' ? (
            <EvidencePage t={t} projectId={view.projectId} />
          ) : view.section === 'alternatives' ? (
            <AlternativesPage t={t} projectId={view.projectId} />
          ) : view.section === 'solution' ? (
            <SolutionPage t={t} projectId={view.projectId} />
          ) : view.section === 'tender' ? (
            <TenderPage t={t} projectId={view.projectId} />
          ) : (
            <div className="mp-planned">
              <p className="mp-plannedTitle">{t('plannedTitle')}</p>
              <p className="mp-plannedBody">{t('plannedBody')}</p>
              {(() => {
                const existing = existingCount(view.section, counts)
                const sectionKey = SECTIONS.find(entry => entry.section === view.section)?.key
                return existing === undefined || sectionKey === undefined ? null : (
                  <p className="mp-caption">{`${t(sectionKey)}: ${String(existing)}`}</p>
                )
              })()}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
