/**
 * Shared workflow surface for the Phase 4 pages: real step progress, the
 * human-gate dialog of whichever tool is waiting, and the execution error.
 * Every action leaves through the guarded tool routes — this component never
 * settles a gate itself. The answer/cancel busy flag re-enables whenever the
 * execution moves (status transition, gate swap, or a page-level error), so a
 * rejected answer can never leave the dialog permanently disabled.
 */
import { HumanReviewDialog } from './HumanReviewDialog.tsx'
import { TaskProgress } from './TaskProgress.tsx'
import { useEffect, useState } from 'react'
import type { TrackedExecution } from '../hooks/executionStore.ts'
import { executionStore } from '../hooks/executionStore.ts'
import type { MarketPilotText } from '../locales.ts'
import type { WorkflowRunView } from '../api.ts'

/** Render progress, the pending gate, and errors for one workflow page. */
export function WorkflowSurface({ t, run, execution, busy, error, onAnswer, onCancel, label }: {
  t: MarketPilotText
  run: WorkflowRunView | null
  execution: TrackedExecution | undefined
  busy: boolean
  error: string
  onAnswer: (selected: string, custom?: string) => void
  onCancel: () => void
  label?: string | undefined
}) {
  const [answerBusy, setAnswerBusy] = useState(false)
  // Re-arm the dialog after any gate movement: the execution left the
  // waiting state (answer landed), a different gate took over, or the page
  // reported an error while the same gate still waits (retry must work).
  useEffect(() => {
    setAnswerBusy(false)
  }, [execution?.callId, execution?.status, error])
  const visible = busy || run !== null || error !== ''
  if (!visible) return null
  // In-flight executions expose a real cancel here (the guarded cancel
  // route aborts the host execution); settled ones offer nothing.
  const running = execution !== undefined && execution.status === 'running'
  return (
    <>
      <TaskProgress
        t={t} run={run} active={busy}
        startedAt={execution?.startedAt ?? run?.startedAt ?? new Date().toISOString()}
        {...label === undefined ? {} : { label }}
      />
      {running ? (
        <div className="mp-taskActions">
          <button type="button" className="mp-link" onClick={() => { void executionStore.cancel(execution!.callId) }}>
            {t('cancelTask')}
          </button>
        </div>
      ) : null}
      {error === '' ? null : <p className="mp-errorText" role="alert">{error}</p>}
      {execution !== undefined && execution.status === 'waiting_human' ? (
        <HumanReviewDialog
          t={t} execution={execution} busy={answerBusy}
          onAnswer={(selected, custom) => { setAnswerBusy(true); onAnswer(selected, custom) }}
          onCancel={() => { setAnswerBusy(true); onCancel() }}
        />
      ) : null}
    </>
  )
}
