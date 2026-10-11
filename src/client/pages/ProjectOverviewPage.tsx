import { useEffect, useState } from 'react'
import { ProjectActivity } from '../components/ProjectActivity.tsx'
import { ProjectHeader } from '../components/ProjectHeader.tsx'
import { ProjectStageNav } from '../components/ProjectStageNav.tsx'
import { ProjectWorkflowOverview, StageActionBar, WorkflowContext, workflowText } from '../components/ProjectWorkflowOverview.tsx'
import { ErrorState, LoadingState } from '../components/States.tsx'
import { useProjectDetail } from '../hooks/useProjects.ts'
import { useExecutions } from '../hooks/useExecution.ts'
import { useProjectWorkflow } from '../hooks/useProjectWorkflow.ts'
import type { MarketPilotText } from '../locales.ts'
import { ArtifactsPage } from './ArtifactsPage.tsx'
import { AlternativesPage } from './AlternativesPage.tsx'
import { EvidencePage } from './EvidencePage.tsx'
import { RequirementsPage } from './RequirementsPage.tsx'
import { ResearchPage } from './ResearchPage.tsx'
import { SolutionPage } from './SolutionPage.tsx'
import { TenderPage } from './TenderPage.tsx'
import type { MarketPilotActions, MarketPilotView, ProjectSection, WorkflowMode } from '../stores.ts'

export function ProjectOverviewPage({ t, actions, view, mode = 'guided' }: {
  t: MarketPilotText; actions: MarketPilotActions
  view: Extract<MarketPilotView, { kind: 'project' }>; mode?: WorkflowMode
}) {
  const detailQuery = useProjectDetail(view.projectId)
  const workflow = useProjectWorkflow(view.projectId)
  const executions = useExecutions(view.projectId)
  const [localMode, setLocalMode] = useState(mode)
  useEffect(() => { setLocalMode(mode) }, [mode])
  const marker = executions.map(e => `${e.callId}:${e.status}`).join('|')
  useEffect(() => { workflow.refresh() }, [marker, workflow.refresh])
  const settled = executions.filter(e => ['completed', 'failed', 'cancelled'].includes(e.status))
    .map(e => `${e.callId}:${e.status}`).join('|')
  useEffect(() => { if (settled !== '') detailQuery.refresh() }, [settled, detailQuery.refresh])
  useEffect(() => { if (workflow.snapshot !== null) detailQuery.refresh() }, [workflow.snapshot?.revision, detailQuery.refresh])
  if (detailQuery.error !== '') return <ErrorState t={t} message={detailQuery.error} onRetry={detailQuery.refresh} />
  if (detailQuery.detail === null) return <LoadingState t={t} />
  const detail = detailQuery.detail
  const snapshot = workflow.snapshot
  const onGo = (section: ProjectSection) => { actions.setSection(section) }
  const activeStage = snapshot?.stages.find(s => s.section === view.section
    && (s.id !== 'S0' || snapshot.currentStage === 'S0'))
  return <WorkflowContext.Provider value={{ snapshot, error: workflow.error, executions }}>
    <ProjectHeader t={t} detail={detail} waiting={workflow.error === '' ? snapshot?.waiting : undefined} onBack={actions.goProjects} />
    <div className="mp-modeBar" aria-label={workflowText(t, 'mode')}>
      {(['guided', 'professional'] as const).map(value => <button key={value} type="button" className="mp-headerNavItem"
        aria-pressed={localMode === value} onClick={() => { setLocalMode(value); actions.setWorkflowMode?.(value) }}>
        {workflowText(t, `mode.${value}`)}
      </button>)}
      <span className="mp-toolbarSpacer" />
      {snapshot === null ? null : <span className="mp-caption">{snapshot.capabilities.model.mode === 'offline'
        ? workflowText(t, 'providerOffline') : [snapshot.capabilities.model.provider, snapshot.capabilities.model.model, snapshot.capabilities.model.reasoningEffort].filter(Boolean).join(' · ')}</span>}
      <button type="button" className="mp-link" onClick={workflow.refresh}>{workflowText(t, 'refresh')}</button>
    </div>
    {workflow.error === '' ? null : <div className="mp-nextHint" role="alert"><strong>{workflowText(t, 'readFailed')}</strong>
      <span>{workflow.error}</span><button className="mp-link" type="button" onClick={workflow.refresh}>{t('retry')}</button></div>}
    <div className="mp-layout" data-mode={localMode}>
      <ProjectStageNav t={t} status={detail.project.status} runs={null} workflow={snapshot} section={view.section} onSelect={onGo} />
      <div className="mp-workspace">
        {snapshot === null ? workflow.error === '' ? <LoadingState t={t} /> : null : <>
          {view.section === 'overview' ? <>
            <ProjectWorkflowOverview t={t} snapshot={snapshot} onGo={onGo} collapsed={localMode === 'professional'} />
            <details className="mp-secondaryDetails"><summary>{workflowText(t, 'history')}</summary><ProjectActivity t={t} detail={detail} /></details>
          </> : <>
            {activeStage === undefined ? null : <StageActionBar key={activeStage.id} t={t} stage={activeStage} onGo={onGo} inSection />}
            {view.section === 'research' ? <p className="mp-capability" role="note">{snapshot.capabilities.research.reason}</p> : null}
            {snapshot.capabilities.model.available ? null : <p className="mp-capability" role="note">{snapshot.capabilities.model.reason}</p>}
            <div id="mp-stage-controls" tabIndex={-1}>
              {view.section === 'requirements' ? <RequirementsPage t={t} projectId={view.projectId} focus={view.focus} actions={actions} /> : null}
              {view.section === 'research' ? <ResearchPage t={t} projectId={view.projectId} /> : null}
              {view.section === 'evidence' ? <EvidencePage t={t} projectId={view.projectId} actions={actions} focus={view.focus} /> : null}
              {view.section === 'alternatives' ? <AlternativesPage t={t} projectId={view.projectId} /> : null}
              {view.section === 'solution' ? <SolutionPage t={t} projectId={view.projectId} /> : null}
              {view.section === 'tender' ? <TenderPage t={t} projectId={view.projectId} actions={actions} onGoEvidence={() => { onGo('evidence') }} /> : null}
              {view.section === 'artifacts' ? <ArtifactsPage t={t} projectId={view.projectId} /> : null}
            </div>
          </>}
        </>}
      </div>
    </div>
  </WorkflowContext.Provider>
}
