import type { ProjectWorkflowOverview, ProjectWorkflowStage } from '../../domain/project-workflow.ts'
import type { ProjectDetail } from '../api.ts'
import type { MarketPilotText } from '../locales.ts'
import type { ProjectSection } from '../stores.ts'
import { formatTime } from '../format.ts'
import { projectShortCodeIndex } from '../shortCodes.ts'
import { GUIDED_STEPS, guidedAction, guidedCurrentStep, guidedResult, guidedStage, guidedText, type GuidedStep } from '../guidedWorkflow.ts'
import { workflowText } from './ProjectWorkflowOverview.tsx'

/** The section header only navigates. Execution and Human Gates remain in the existing page. */
export function GuidedTask({ t, step, stage, onGo }: {
  t: MarketPilotText; step: GuidedStep; stage: ProjectWorkflowStage; onGo(section: ProjectSection): void
}) {
  const blocked = stage.prerequisites.find(p => p.key !== 'needModel')
  const target = blocked?.section ?? step.section
  return <section className="mp-guidedTask" data-stage={stage.id} data-status={stage.status}>
    <p className="mp-guidedEyebrow">{guidedText(t, 'currentTask')}</p>
    <h2>{guidedText(t, `title.${step.key}`)}</h2>
    <p>{guidedText(t, `task.${step.key}`)}</p>
    <p className="mp-guidedResult"><span>{guidedText(t, 'mainResult')}</span><strong>{guidedResult(t, step, stage)}</strong></p>
    <div className="mp-stageButtons">
      <button type="button" className="mp-primaryAction mp-headerNavItem" onClick={() => { onGo(target) }}>
        {blocked === undefined ? guidedAction(t, step, stage) : guidedText(t, `complete.${target}`)}
      </button>
      {stage.status === 'completed' ? null : <span className="mp-caption">{guidedText(t, `status.${stage.status}`)}</span>}
    </div>
    {stage.run?.error === undefined ? null : <p role="alert" className="mp-errorText">{stage.run.error}</p>}
    {stage.execution?.error === undefined || stage.execution.error === stage.run?.error ? null : <p role="alert" className="mp-errorText">{stage.execution.error}</p>}
    {stage.run === undefined ? null : <details className="mp-caption"><summary>{workflowText(t, 'recordedSteps')}</summary>
      <ol>{stage.run.steps.map((item, index) => <li key={`${item.at}-${index}`}>{`${item.step} · ${formatTime(item.at)}`}</li>)}</ol>
    </details>}
  </section>
}

export function GuidedWorkflowOverview({ t, snapshot, detail, onGo }: {
  t: MarketPilotText; snapshot: ProjectWorkflowOverview; detail: ProjectDetail; onGo(section: ProjectSection): void
}) {
  const current = guidedCurrentStep(snapshot)
  const stage = guidedStage(snapshot, current)
  const solutions = detail.artifacts.filter(a => a.type === 'solution')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.id.localeCompare(a.id))
  const solution = solutions[0]
  const codes = projectShortCodeIndex(detail)
  const humanStage = snapshot.stages.find(s => s.status === 'waiting_human')
  return <div className="mp-guidedOverview">
    {solution === undefined ? <GuidedTask t={t} step={current} stage={stage} onGo={onGo} /> : <>
      <section className="mp-guidedArtifact" aria-label={guidedText(t, 'solutionOutcome')}>
        <p className="mp-guidedEyebrow">{guidedText(t, 'solutionOutcome')}</p>
        <h2>{guidedText(t, 'solutionAvailable')}</h2>
        <p>{guidedText(t, 'solutionHint')}</p>
        <p className="mp-guidedVersion"><strong>{codes.codeOf(solution.id)}</strong><span>{solution.name}</span>
          <span>{solution.createdAt === undefined ? '' : formatTime(solution.createdAt)}</span>
          <span>{guidedText(t, solution.reviewStatus === 'approved' ? 'approved' : 'draft')}</span></p>
        <div className="mp-stageButtons">
          <button type="button" className="mp-primaryAction mp-headerNavItem" onClick={() => { onGo('solution') }}>{guidedText(t, 'readSolution')}</button>
          <button type="button" className="mp-link" onClick={() => { onGo('artifacts') }}>{guidedText(t, 'reviewExport')}</button>
        </div>
      </section>
      {stage.status === 'completed' ? null : <GuidedTask t={t} step={current} stage={stage} onGo={onGo} />}
    </>}
    <h3 className="mp-subTitle">{guidedText(t, 'fiveSteps')}</h3>
    <div className="mp-guidedGrid">
      {GUIDED_STEPS.map((step, index) => {
        const fact = guidedStage(snapshot, step)
        return <article key={step.id} className="mp-guidedStepCard" data-stage={fact.id} data-status={fact.status} data-current={step.id === current.id}>
          <span className="mp-guidedNumber" aria-label={guidedText(t, `status.${fact.status}`)}>{fact.status === 'completed' ? '✓' : index + 1}</span>
          <h4>{guidedText(t, `title.${step.key}`)}</h4>
          <p>{guidedText(t, `task.${step.key}`)}</p>
          <strong className="mp-guidedCardResult">{guidedResult(t, step, fact)}</strong>
          <button type="button" className="mp-link" onClick={() => { onGo(step.section) }}>{guidedAction(t, step, fact)} <span aria-hidden="true">→</span></button>
        </article>
      })}
    </div>
    <section className="mp-guidedQuality" aria-label={guidedText(t, 'quality')}>
      <div><strong>{guidedText(t, 'quality')}</strong><p className="mp-caption">{guidedText(t, 'qualityHint')}</p></div>
      <div className="mp-guidedLinks">
        <button type="button" className="mp-link" onClick={() => { onGo('evidence') }}>{guidedText(t, 'viewEvidence')}</button>
        <button type="button" className="mp-link" onClick={() => { onGo('evidence') }}>{guidedText(t, 'addEvidence')}</button>
        <button type="button" className="mp-link" onClick={() => { onGo(humanStage?.action.section ?? 'evidence') }}>{guidedText(t, 'humanReview')}</button>
      </div>
      <details><summary>{guidedText(t, 'qualityDetails')}{snapshot.unknowns > 0 || snapshot.issues.length > 0 ? ` · ${guidedText(t, 'hasReminders')}` : ''}</summary>
        <p>{`${snapshot.unknowns} ${guidedText(t, 'unknowns')} · ${snapshot.waiting} ${guidedText(t, 'humanWaiting')}`}</p>
        {snapshot.issues.map(item => <p key={item.key}>{workflowText(t, item.key)}</p>)}
        {humanStage === undefined ? null : <button type="button" className="mp-link" onClick={() => { onGo(humanStage.action.section) }}>{guidedText(t, 'locateReview')}</button>}
      </details>
    </section>
    <section className="mp-guidedOptional"><div><strong>{guidedText(t, 'tender')}</strong><p className="mp-caption">{guidedText(t, 'tenderHint')}</p></div>
      <button type="button" className="mp-link" onClick={() => { onGo('tender') }}>{guidedText(t, 'openTender')}</button>
    </section>
  </div>
}
