/**
 * Project workspace shell: summary header, the single vertical stage
 * navigation, and the active section. The overview itself leads with the
 * next action and a focused summary — the count wall moved to secondary
 * chips. Sections without a dedicated workflow UI render an explicit
 * "planned" state — never fake actions.
 */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState } from 'react'
import type { ProjectDetail } from '../api.ts'
import { NextActionCard } from '../components/NextActionCard.tsx'
import { ProjectActivity } from '../components/ProjectActivity.tsx'
import { ProjectHeader } from '../components/ProjectHeader.tsx'
import { ProjectStageNav } from '../components/ProjectStageNav.tsx'
import { ErrorState, LoadingState } from '../components/States.tsx'
import { useProjectDetail } from '../hooks/useProjects.ts'
import { useExecutions, useProjectRuns } from '../hooks/useExecution.ts'
import type { MarketPilotText } from '../locales.ts'
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

/** The detail route also returns competitor/policy rows the V2 type omits. */
type FullDetail = ProjectDetail & { competitors?: unknown[]; policies?: unknown[] }

/**
 * Render the project workspace.
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
  const executions = useExecutions(view.projectId)
  // Invalidate the run snapshots when a tracked execution settles, so the
  // stage states and waiting badges follow reality instead of the mount-time
  // snapshot. One refresh per settle marker (callId:status), never a timer.
  const settledMarker = executions
    .filter(execution => ['completed', 'failed', 'cancelled'].includes(execution.status))
    .map(execution => `${execution.callId}:${execution.status}`)
    .join('|')
  const [seenSettled, setSeenSettled] = useState('')
  useEffect(() => {
    if (settledMarker === '' || settledMarker === seenSettled) return
    setSeenSettled(settledMarker)
    runsQuery.refresh()
  }, [settledMarker, seenSettled, runsQuery.refresh])
  if (error !== '') return <ErrorState t={t} message={error} onRetry={refresh} />
  if (loading || detail === null) return <LoadingState t={t} />
  const full = detail as FullDetail
  const { project } = detail
  // Wire boundary: a missing or renamed collection must degrade to zero, not
  // crash the page on `.length`.
  const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : []
  const requirements = rows(detail.requirements) as ProjectDetail['requirements']
  // Only recoverable waits count as 待办: superseded waiting records (a newer
  // run of the same type exists) are leftover interruption history.
  const pendingWaits = (runsQuery.runs ?? [])
    .filter(run => run.status === 'waiting_human' && run.supersededWait !== true)
  const waiting = pendingWaits.length
  const latestWait = pendingWaits[pendingWaits.length - 1]
  const counts = {
    documents: rows(detail.documents).length,
    confirmed: requirements.filter(r => r.status === 'confirmed').length,
    requirements: requirements.length,
    evidence: rows(detail.evidence).length,
    competitors: rows(full.competitors).length + rows(full.policies).length,
    artifacts: rows(detail.artifacts).length,
    tenderItems: rows(detail.tenderItems).length,
  }
  const setSection = (section: ProjectSection): void => { actions.setSection(section) }
  return (
    <div>
      <ProjectHeader t={t} detail={detail} waiting={waiting} onBack={actions.goProjects} />
      <div className="mp-layout">
        <ProjectStageNav t={t} status={project.status} runs={runsQuery.runs} section={view.section} onSelect={setSection} />
        <div className="mp-workspace">
          {view.section === 'overview' ? (
            <>
              <NextActionCard
                t={t} status={project.status} waiting={waiting}
                waitingType={latestWait?.type}
                activeDecisionId={project.activeDecisionId}
                onGo={setSection}
              />
              <div className="mp-overviewGrid">
                <div className="mp-card"><div className="mp-cardValue">{`${String(counts.confirmed)} / ${String(counts.requirements)}`}</div><div className="mp-cardLabel">{t('countRequirements')}</div></div>
                <div className="mp-card"><div className="mp-cardValue">{String(requirements.filter(r => r.status === 'unknown').length)}</div><div className="mp-cardLabel">{t('countUnknown')}</div></div>
                <div className="mp-card"><div className="mp-cardValue">{String(counts.evidence)}</div><div className="mp-cardLabel">{t('countEvidence')}</div></div>
                <div className="mp-card"><div className="mp-cardValue">{String(counts.documents)}</div><div className="mp-cardLabel">{t('countDocuments')}</div></div>
                <div className="mp-card"><div className="mp-cardValue">{String(counts.competitors)}</div><div className="mp-cardLabel">{t('sectionResearch')}</div></div>
                <div className="mp-card"><div className="mp-cardValue">{String(counts.artifacts)}</div><div className="mp-cardLabel">{t('countArtifacts')}</div></div>
              </div>
              <ProjectActivity t={t} detail={detail} />
            </>
          ) : view.section === 'requirements' ? (
            <RequirementsPage t={t} projectId={view.projectId} focus={view.focus} />
          ) : view.section === 'artifacts' ? (
            <ArtifactsPage t={t} projectId={view.projectId} />
          ) : view.section === 'research' ? (
            <ResearchPage t={t} projectId={view.projectId} />
          ) : view.section === 'evidence' ? (
            <EvidencePage t={t} projectId={view.projectId} actions={actions} focus={view.focus} />
          ) : view.section === 'alternatives' ? (
            <AlternativesPage t={t} projectId={view.projectId} />
          ) : view.section === 'solution' ? (
            <SolutionPage t={t} projectId={view.projectId} />
          ) : view.section === 'tender' ? (
            <TenderPage t={t} projectId={view.projectId} actions={actions} onGoEvidence={() => { setSection('evidence') }} />
          ) : (
            <div className="mp-planned">
              <p className="mp-plannedTitle">{t('plannedTitle')}</p>
              <p className="mp-plannedBody">{t('plannedBody')}</p>
              <Button size="sm" variant="ghost" onClick={actions.goProjects}>{t('back')}</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
