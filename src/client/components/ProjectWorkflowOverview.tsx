import { createContext, useContext, useState } from 'react'
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ProjectWorkflowOverview as Overview, ProjectWorkflowStage, WorkflowSection, WorkflowStageStatus } from '../../domain/project-workflow.ts'
import { executionStore } from '../hooks/executionStore.ts'
import type { TrackedExecution } from '../hooks/executionStore.ts'
import { errorMessage } from '../hooks/useProjects.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import { formatTime } from '../format.ts'
import { guidedText, type GuidedStep } from '../guidedWorkflow.ts'
import { GUIDED_STEPS } from '../guidedWorkflow.ts'
import type { WorkflowMode } from '../stores.ts'

export const WorkflowContext = createContext<{ snapshot: Overview | null; error: string; executions?: readonly TrackedExecution[]; mode?: WorkflowMode }>({ snapshot: null, error: '' })
export function useGuidedMode(): boolean { return useContext(WorkflowContext).mode === 'guided' }
export function useStageAccess(id: ProjectWorkflowStage['id']) {
  const { snapshot, error } = useContext(WorkflowContext)
  const stage = snapshot?.stages.find(s => s.id === id)
  return { stage, allowed: error === '' && (stage === undefined || stage.prerequisites.every(p => p.key === 'interruptedRun')),
    reviewAllowed: error === '' && (stage === undefined || stage.prerequisites.every(p => ['interruptedRun', 'needModel'].includes(p.key))),
    modelAvailable: snapshot?.capabilities.model.available ?? true }
}
export function workflowText(t: MarketPilotText, key: string): string { return t(`workflow.${key}` as MarketPilotTextKey) }
function tone(status: WorkflowStageStatus): 'neutral' | 'success' | 'warning' | 'danger' {
  return status === 'completed' ? 'success' : status === 'failed' ? 'danger'
    : ['needs_attention', 'waiting_human', 'unavailable'].includes(status) ? 'warning' : 'neutral'
}
export function PrerequisiteHint({ t, items, onGo }: {
  t: MarketPilotText; items: readonly { key: string; section: WorkflowSection }[]; onGo(section: WorkflowSection): void
}) {
  if (items.length === 0) return null
  return <ul className="mp-prerequisites" aria-label={workflowText(t, 'prerequisites')}>
    {items.map(item => <li key={item.key}><span>{workflowText(t, item.key)}</span>{' '}
      <button className="mp-link" type="button" onClick={() => { onGo(item.section) }}>{workflowText(t, 'completeInput')}</button>
    </li>)}
  </ul>
}
export function ProjectStepCard({ t, stage, current, onGo }: {
  t: MarketPilotText; stage: ProjectWorkflowStage; current: boolean; onGo(section: WorkflowSection): void
}) {
  return <button type="button" className="mp-stepCard" data-stage={stage.id} data-status={stage.status}
    data-current={current} onClick={() => { onGo(stage.section) }}>
    <span className="mp-stepHead"><strong>{stage.id}</strong><Tag tone={tone(stage.status)}>{workflowText(t, `status.${stage.status}`)}</Tag></span>
    <strong>{workflowText(t, `title.${stage.id}`)}</strong>
    <span className="mp-caption">{workflowText(t, `summary.${stage.id}`)}</span>
    <span className="mp-caption">{`${workflowText(t, 'input')} ${stage.inputs} · ${workflowText(t, 'result')} ${stage.results} · ${workflowText(t, 'review')} ${stage.review}`}</span>
    {stage.prerequisites[0] === undefined ? null : <span className="mp-caption">{workflowText(t, stage.prerequisites[0].key)}</span>}
  </button>
}
/** The same projected action is used on the landing page and in the owning section. */
export function StageActionBar({ t, stage, onGo, inSection = false, guidedStep }: {
  t: MarketPilotText; stage: ProjectWorkflowStage; onGo(section: WorkflowSection): void; inSection?: boolean; guidedStep?: GuidedStep | undefined
}) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const act = () => {
    if (!stage.action.enabled || starting) return
    if (!inSection || stage.action.section !== stage.section) { onGo(stage.action.section); return }
    if (stage.action.tool !== undefined) {
      setStarting(true); setError('')
      void executionStore.start(stage.action.tool, { ...stage.action.args, projectId: stageProjectId })
        .catch(e => { setError(errorMessage(e)) }).finally(() => { setStarting(false) })
    } else {
      document.getElementById('mp-stage-controls')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }
  const { snapshot, error: snapshotError, executions } = useContext(WorkflowContext)
  const stageProjectId = snapshot?.projectId
  const live = executions?.some(e => e.projectId === stageProjectId && e.tool === stage.action.tool
    && !e.lost && ['running', 'waiting_human'].includes(e.status)) ?? false
  const runnable = stage.action.enabled && !starting && snapshotError === '' && !(inSection && live)
  if (guidedStep !== undefined) return <section className="mp-stageAction mp-businessStageHeader" data-stage={stage.id} data-status={stage.status}>
    <span className="mp-businessStepNumber" aria-hidden="true">{GUIDED_STEPS.findIndex(step => step.id === guidedStep.id) + 1}</span>
    <div className="mp-businessStageCopy"><span className="mp-guidedEyebrow">{guidedText(t, 'currentTask')}</span>
      <h2>{guidedText(t, `title.${guidedStep.key}`)}</h2><p>{guidedText(t, `task.${guidedStep.key}`)}</p></div>
    <button type="button" className="mp-link mp-caption" onClick={() => { onGo('overview') }}>{guidedText(t, 'overview')}</button>
    {stage.prerequisites.length === 0 ? null : <details className="mp-businessAccess"><summary>{guidedText(t, 'prerequisites')}</summary><PrerequisiteHint t={t} items={stage.prerequisites} onGo={onGo} /></details>}
    {stage.run?.error === undefined ? null : <p className="mp-errorText" role="alert">{stage.run.error}</p>}
    {stage.execution?.error === undefined || stage.execution.error === stage.run?.error ? null : <p className="mp-errorText" role="alert">{stage.execution.error}</p>}
  </section>
  return <section className="mp-stageAction" data-stage={stage.id} data-status={stage.status}>
    <div className="mp-stageActionHead">
      <div><span className="mp-caption">{inSection ? workflowText(t, 'stage') : workflowText(t, 'currentStage')}</span>
        <h2>{`${stage.id} · ${workflowText(t, `title.${stage.id}`)}`}</h2></div>
      <Tag tone={tone(stage.status)}>{workflowText(t, `status.${stage.status}`)}</Tag>
    </div>
    <p className="mp-caption">{workflowText(t, `summary.${stage.id}`)}</p>
    <div className="mp-stageFacts">
      <div><strong>{workflowText(t, 'input')}</strong><span>{stage.inputs}</span></div>
      <div><strong>{workflowText(t, 'execute')}</strong><span>{stage.run?.currentStep ?? workflowText(t, `status.${stage.status}`)}</span></div>
      <div><strong>{workflowText(t, 'result')}</strong><span>{stage.results}</span></div>
      <div><strong>{workflowText(t, 'review')}</strong><span>{stage.review}</span></div>
    </div>
    <div className="mp-stageButtons">
      <button type="button" className="mp-primaryAction mp-headerNavItem" disabled={!runnable} onClick={act}>
        {workflowText(t, stage.action.key)}
      </button>
      <button type="button" className="mp-link" onClick={() => { onGo(stage.section) }}>{workflowText(t, 'workspace')}</button>
      {inSection ? <button type="button" className="mp-link" onClick={() => { onGo('overview') }}>{workflowText(t, 'allStages')}</button> : null}
      {inSection && snapshot !== null && snapshot.currentStage !== stage.id ? <button type="button" className="mp-link"
        onClick={() => { onGo(snapshot.stages.find(s => s.id === snapshot.currentStage)!.action.section) }}>{t('nextStepLabel')}</button> : null}
    </div>
    <PrerequisiteHint t={t} items={stage.prerequisites} onGo={onGo} />
    {stage.run?.error === undefined ? null : <p className="mp-errorText" role="alert">{stage.run.error}</p>}
    {stage.execution?.error === undefined || stage.execution.error === stage.run?.error ? null : <p className="mp-errorText" role="alert">{stage.execution.error}</p>}
    {stage.run === undefined ? null : <details className="mp-caption"><summary>{workflowText(t, 'recordedSteps')}</summary>
      <ol>{stage.run.steps.map((step, i) => <li key={`${step.at}-${i}`}>{`${step.step} · ${formatTime(step.at)}`}</li>)}</ol>
    </details>}
    {error === '' ? null : <p className="mp-errorText" role="alert">{error}</p>}
  </section>
}
export function ProjectWorkflowOverview({ t, snapshot, onGo, collapsed = false }: {
  t: MarketPilotText; snapshot: Overview; onGo(section: WorkflowSection): void; collapsed?: boolean
}) {
  const current = snapshot.stages.find(s => s.id === snapshot.currentStage)!
  const cards = <div className="mp-workflowGrid">{snapshot.stages.map(stage => <ProjectStepCard key={stage.id} t={t} stage={stage} current={stage.id === snapshot.currentStage} onGo={onGo} />)}</div>
  return <>
    <StageActionBar t={t} stage={current} onGo={onGo} />
    <div className="mp-flowSummary">
      <div><strong>{workflowText(t, 'latestArtifact')}</strong><p className="mp-caption">{snapshot.latestArtifact?.name ?? workflowText(t, 'noArtifact')}</p>
        {snapshot.latestArtifact === undefined ? null : <button type="button" className="mp-link" onClick={() => { onGo(snapshot.latestArtifact?.type === 'solution' ? 'solution' : 'artifacts') }}>{workflowText(t, 'readArtifact')}</button>}
      </div>
      <div><strong>{workflowText(t, 'humanTodo')}</strong><p className="mp-caption">{`${t('statWaiting')} ${snapshot.waiting} · ${workflowText(t, 'evidenceUnknown')} ${snapshot.unknowns}`}</p>
        <PrerequisiteHint t={t} items={snapshot.issues.filter(i => i.key !== 'researchUnavailable')} onGo={onGo} />
      </div>
    </div>
    {collapsed ? <details><summary>{workflowText(t, 'allStages')}</summary>{cards}</details>
      : <><h3 className="mp-subTitle">{workflowText(t, 'allStages')}</h3>{cards}</>}
  </>
}
