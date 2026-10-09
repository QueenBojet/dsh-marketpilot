/**
 * Shared workflow surface for the Phase 4 pages: real step progress, the
 * human-gate dialog of whichever tool is waiting, and the execution error.
 * Every action leaves through the guarded tool routes — this component never
 * settles a gate itself.
 */
import { HumanReviewDialog } from './HumanReviewDialog.tsx'
import { TaskProgress } from './TaskProgress.tsx'
import { useState } from 'react'
import type { TrackedExecution } from '../hooks/executionStore.ts'
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
  const visible = busy || run !== null || error !== ''
  if (!visible) return null
  return (
    <>
      <TaskProgress
        t={t} run={run} active={busy}
        startedAt={execution?.startedAt ?? run?.startedAt ?? new Date().toISOString()}
        {...label === undefined ? {} : { label }}
      />
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