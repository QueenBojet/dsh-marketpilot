/**
 * Real step progress for one workflow run: the run's recorded steps with
 * timestamps and a live elapsed counter — never an invented percentage.
 */
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { WorkflowRunView } from '../api.ts'
import { formatDuration, formatTime } from '../format.ts'
import type { MarketPilotText, MarketPilotTextKey } from '../locales.ts'
import { useElapsed } from '../hooks/useExecution.ts'

/** Render the run timeline, or a plain activity indicator while steps are absent. */
export function TaskProgress({ t, run, startedAt, active, label }: {
  t: MarketPilotText
  run: WorkflowRunView | null
  startedAt: string
  active: boolean
  label?: string | undefined
}) {
  const elapsed = useElapsed(startedAt, active)
  const activity = label ?? t('extractRunning')
  // A settled run's duration is the recorded durationMs — a fixed fact that
  // must never keep ticking. Live runs show the running elapsed counter.
  const settledDuration = !active && run !== null && run.durationMs !== undefined
  const elapsedText = settledDuration
    ? `${t('elapsedLabel')} ${formatDuration(run.durationMs!)}`
    : active || run !== null
      ? `${t('elapsedLabel')} ${formatDuration(elapsed)}`
      : ''
  if (run === null) {
    return (
      <div className="mp-progress" role="status">
        <StateDot state={active ? 'ongoing' : 'idle'} />
        <span>{active ? activity : ''}</span>
        <span className="mp-caption">{elapsedText}</span>
        {active ? <span className="mp-caption">{t('extractHint')}</span> : null}
      </div>
    )
  }
  return (
    <div className="mp-progress" role="group" aria-label={activity}>
      <StateDot state={run.status === 'failed' ? 'error' : run.status === 'waiting_human' ? 'warning'
        : run.status === 'completed' ? 'done' : 'ongoing'} />
      <ol className="mp-steps">
        {run.steps.map((step, index) => (
          <li key={`${step.step}-${String(index)}`} className="mp-step"
            data-state={index === run.steps.length - 1 && run.status !== 'completed' ? 'current' : 'done'}>
            {t(`step.${step.step}` as MarketPilotTextKey)}
            <span className="mp-caption">{formatTime(step.at)}</span>
          </li>
        ))}
      </ol>
      {run.error === undefined ? null : <span className="mp-errorText">{run.error}</span>}
      <span className="mp-caption">{elapsedText}</span>
    </div>
  )
}
