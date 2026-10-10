/**
 * One task card in the task center: an execution with live state, elapsed
 * time, cancel for in-flight work, a project jump for follow-up, and an
 * expandable real step timeline. The timeline binds to the execution's exact
 * runId only — a missing id shows 暂无对应运行记录, never a lookalike run of
 * the same type. RunHistoryCard renders one persisted workflow-run record
 * (the history section that survives host restarts).
 */
import { useEffect, useState } from 'react'
import { StateDot, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { api, type HistoryRunRow, type WorkflowRunView } from '../api.ts'
import { formatDuration, formatTime } from '../format.ts'
import { useElapsed } from '../hooks/useExecution.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import type { TrackedExecution } from '../hooks/executionStore.ts'
import { executionStore } from '../hooks/executionStore.ts'

/** Map a tool name to its workflow-run type for the display label. */
export const RUN_TYPE_BY_TOOL: Record<string, string> = {
  marketpilot_requirement_extract: 'requirement_analysis',
  marketpilot_competitor_extract: 'competitor_analysis',
  marketpilot_policy_extract: 'policy_analysis',
  marketpilot_alternative_generate: 'alternative_generation',
  marketpilot_solution_generate: 'solution_generation',
  marketpilot_tender_extract: 'tender_review',
  marketpilot_tender_review: 'tender_review',
}

/** Localized run-type label with the raw fallback for unknown types. */
export function runTypeLabel(t: MarketPilotText, type: string): string {
  return t(`runType.${type}` as MarketPilotTextKey)
}

/** Exact-runId lookup outcome for the step timeline. */
type RunLookup = 'loading' | 'found' | 'missing'

/** Render one task card. */
export function TaskCard({ t, execution, projectName, onOpenProject }: {
  t: MarketPilotText
  execution: TrackedExecution
  projectName?: string | undefined
  onOpenProject: (projectId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [run, setRun] = useState<WorkflowRunView | null>(null)
  const [lookup, setLookup] = useState<RunLookup>('loading')
  const active = execution.status === 'running' || execution.status === 'waiting_human'
  const elapsed = useElapsed(execution.startedAt, active)
  const runType = RUN_TYPE_BY_TOOL[execution.tool]
  const elapsedText = `${t('elapsedLabel')} ${formatDuration(elapsed)}`

  useEffect(() => {
    if (!expanded) {
      setRun(null)
      setLookup('loading')
      return
    }
    // No precise runId → there is nothing to look up; never guess by type.
    if (execution.projectId === undefined || execution.runId === undefined) {
      setRun(null)
      setLookup('missing')
      return
    }
    let cancelled = false
    setLookup('loading')
    api.runs(execution.projectId)
      .then(result => {
        if (cancelled) return
        // Exact id match only: a same-type run is NOT this execution's log.
        const exact = result.runs.find(candidate => candidate.id === execution.runId) ?? null
        setRun(exact)
        setLookup(exact === null ? 'missing' : 'found')
      })
      .catch(() => { if (!cancelled) { setRun(null); setLookup('missing') } })
    return () => { cancelled = true }
  }, [expanded, execution.projectId, execution.runId, execution.callId])

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
      </div>      <div className="mp-taskMeta">
        <Tag tone={execution.status === 'completed' ? 'success'
          : execution.status === 'failed' ? 'danger'
            : execution.status === 'waiting_human' ? 'warning' : 'neutral'}>
          {t(`runStatus.${execution.status}` as MarketPilotTextKey)}
        </Tag>
        {run?.durationMs !== undefined && !active ? (
          <span className="mp-caption">{`${t('elapsedLabel')} ${formatDuration(run.durationMs)}`}</span>
        ) : null}
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
        lookup === 'loading'
          ? <div className="mp-caption">{t('loading')}</div>
          : run === null
            ? <div className="mp-caption">{t('runNotAvailable')}</div>
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

/**
 * One persisted workflow-run record in the task center's history section:
 * real recorded state and steps from storage — this is what remains visible
 * after a host restart, when the in-memory execution registry is empty.
 */
export function RunHistoryCard({ t, run, onOpenProject }: {
  t: MarketPilotText
  run: HistoryRunRow
  onOpenProject: (projectId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  // A waiting record a newer same-type run replaced is leftover interruption
  // history: keep it visible, but never present it as a live approval.
  const staleWait = run.status === 'waiting_human' && run.supersededWait === true
  return (
    <div className="mp-taskCard" data-status={run.status}>
      <div className="mp-taskHead">
        <StateDot state={run.status === 'completed' ? 'done'
          : run.status === 'failed' ? 'error'
            : staleWait ? 'idle'
              : run.status === 'waiting_human' ? 'warning'
                : run.status === 'cancelled' ? 'idle' : 'ongoing'} />
        <span className="mp-cellMain">{runTypeLabel(t, run.type)}</span>
        <span className="mp-caption">{run.projectName}</span>
        <span className="mp-toolbarSpacer" />
        <span className="mp-caption">{formatTime(run.startedAt)}</span>
      </div>
      <div className="mp-taskMeta">
        <Tag tone={staleWait ? 'quiet'
          : run.status === 'completed' ? 'success'
            : run.status === 'failed' ? 'danger'
              : run.status === 'waiting_human' ? 'warning' : 'neutral'}>
          {staleWait ? t('runStatus.superseded_wait') : t(`runStatus.${run.status}` as MarketPilotTextKey)}
        </Tag>
        {staleWait ? <span className="mp-caption">{t('supersededWaitHint')}</span> : null}
        {run.durationMs !== undefined ? (
          <span className="mp-caption">{`${t('elapsedLabel')} ${formatDuration(run.durationMs)}`}</span>
        ) : null}
        {run.error === undefined || run.error === '' ? null : <span className="mp-errorText">{run.error}</span>}
      </div>
      <div className="mp-taskActions">
        <button type="button" className="mp-link" onClick={() => { onOpenProject(run.projectId) }}>
          {t('taskOpenProject')}
        </button>
        {run.steps.length === 0 ? null : (
          <button type="button" className="mp-link" onClick={() => { setExpanded(current => !current) }}>
            {expanded ? t('taskHideSteps') : t('taskShowSteps')}
          </button>
        )}
      </div>
      {expanded && run.steps.length > 0 ? (
        <ol className="mp-steps">
          {run.steps.map((step, index) => (
            <li key={`${step.step}-${String(index)}`} className="mp-step"
              data-state={index === run.steps.length - 1 && run.status !== 'completed' ? 'current' : 'done'}>
              {t(`step.${step.step}` as MarketPilotTextKey)}
              <span className="mp-caption">{formatTime(step.at)}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
