/**
 * One task card in the task center: an execution with live state, elapsed
 * time, cancel for in-flight work, a project jump for follow-up, and an
 * expandable real step timeline from the related workflow run.
 */
import { useEffect, useState } from 'react'
import { StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { api, type WorkflowRunView } from '../api.ts'
import { formatTime } from '../format.ts'
import { useElapsed } from '../hooks/useExecution.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import type { TrackedExecution } from '../hooks/executionStore.ts'
import { executionStore } from '../hooks/executionStore.ts'

/** Map a tool name to its workflow-run type for the timeline lookup. */
const RUN_TYPE_BY_TOOL: Record<string, string> = {
  marketpilot_requirement_extract: 'requirement_analysis',
  marketpilot_competitor_extract: 'competitor_analysis',
  marketpilot_policy_extract: 'policy_analysis',
  marketpilot_alternative_generate: 'alternative_generation',
  marketpilot_solution_generate: 'solution_generation',
  marketpilot_tender_extract: 'tender_review',
  marketpilot_tender_review: 'tender_review',
}

/** Render one task card. */
export function TaskCard({ t, execution, projectName, onOpenProject }: {
  t: MarketPilotText
  execution: TrackedExecution
  projectName?: string | undefined
  onOpenProject: (projectId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [run, setRun] = useState<WorkflowRunView | null>(null)
  const active = execution.status === 'running' || execution.status === 'waiting_human'
  const elapsed = useElapsed(execution.startedAt, active)
  const runType = RUN_TYPE_BY_TOOL[execution.tool]
  const elapsedText = `${t('elapsedLabel')} ${String(Math.floor(elapsed / 60000))}:${String(Math.floor(elapsed / 1000) % 60).padStart(2, '0')}`

  useEffect(() => {
    if (!expanded || execution.projectId === undefined) {
      setRun(null)
      return
    }
    let cancelled = false
    api.runs(execution.projectId)
      .then(result => {
        if (cancelled) return
        const all = result.runs
        setRun(all.find(candidate => candidate.id === execution.runId)
          ?? (runType !== undefined ? all.find(candidate => candidate.type === runType) ?? null : null))
      })
      .catch(() => { if (!cancelled) setRun(null) })
    return () => { cancelled = true }
  }, [expanded, execution.projectId, execution.runId, execution.callId, runType])

  return (
    <div className="mp-taskCard" data-status={execution.status}>
      <div className="mp-taskHead">
        <StateDot state={execution.status === 'completed' ? 'done'
          : execution.status === 'failed' ? 'error'
            : execution.status === 'waiting_human' ? 'warning'
              : execution.status === 'cancelled' ? 'idle' : 'ongoing'} />
        <span className="mp-cellMain">{runType !== undefined ? t(`runType.${runType}` as MarketPilotTextKey) : execution.tool}</span>
        {projectName === undefined ? null : <span className="mp-caption">{projectName}</span>}
        <span className="mp-toolbarSpacer" />
        <span className="mp-caption">{active ? elapsedText : formatTime(execution.startedAt)}</span>
      </div>
      <div className="mp-taskMeta">
        <Tag tone={execution.status === 'completed' ? 'success'
          : execution.status === 'failed' ? 'danger'
            : execution.status === 'waiting_human' ? 'warning' : 'neutral'}>
          {t(`runStatus.${execution.status}` as MarketPilotTextKey)}
        </Tag>
        {execution.error === undefined ? null : <span className="mp-errorText">{execution.error}</span>}
        {execution.lost === true ? <span className="mp-errorText">{t('interruptBody')}</span> : null}
      </div>
      {run !== null && run.currentStep !== '' ? (
        <div className="mp-caption">{`${t(`runStatus.${run.status}` as MarketPilotTextKey)} · ${run.currentStep}`}</div>
      ) : null}
      <div className="mp-taskActions">
        {active ? (
          <button type="button" className="mp-link" onClick={() => { void executionStore.cancel(execution.callId) }}>
            {t('cancelTask')}
          </button>
        ) : null}
        {execution.projectId !== undefined ? (
          <button type="button" className="mp-link" onClick={() => { onOpenProject(execution.projectId!) }}>
            {t('taskOpenProject')}
          </button>
        ) : null}
        <button type="button" className="mp-link" onClick={() => { setExpanded(current => !current) }}>
          {expanded ? t('taskHideSteps') : t('taskShowSteps')}
        </button>
      </div>
      {expanded ? (
        run === null
          ? <div className="mp-caption">{t('loading')}</div>
          : (
            <ol className="mp-steps">
              {run.steps.map((step, index) => (
                <li key={`${step.step}-${String(index)}`} className="mp-step"
                  data-state={index === run.steps.length - 1 && run.status !== 'completed' ? 'current' : 'done'}>
                  {t(`step.${step.step}` as MarketPilotTextKey)}
                  <span className="mp-caption">{formatTime(step.at)}</span>
                </li>
              ))}
            </ol>
          )
      ) : null}
    </div>
  )
}
