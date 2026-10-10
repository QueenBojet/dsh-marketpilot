/**
 * Workflow-run waiting semantics shared by the server projections and the
 * client surfaces. A persisted `waiting_human` run is only a live, actionable
 * approval while it is the LATEST run of its type: once a newer run of the
 * same type exists (the user re-ran extraction, regenerated the solution…),
 * the old wait can never be actioned again — it is a leftover interruption
 * record that must be reported as history, never counted as 待办.
 */

/** The minimal run shape every caller already has. */
export interface RunWaitShape {
  readonly id: string
  readonly type: string
  readonly status: string
  readonly startedAt: string
}

/**
 * True when `run` is a waiting record superseded by a later run of the same
 * type (later `startedAt`, id as the deterministic tie-break). Runs that are
 * simply the current batch's review wait are NOT superseded — they are the
 * recoverable human approval the todo lists are for.
 */
export function isSupersededWait(runs: readonly RunWaitShape[], run: RunWaitShape): boolean {
  if (run.status !== 'waiting_human') return false
  return runs.some(other => other.id !== run.id && other.type === run.type
    && (other.startedAt > run.startedAt
      || (other.startedAt === run.startedAt && other.id > run.id)))
}

/** Stamp each waiting run whose wait has been superseded (pure projection). */
export function markSupersededWaits<R extends RunWaitShape>(runs: readonly R[]): (R & { supersededWait?: boolean })[] {
  return runs.map(run => isSupersededWait(runs, run) ? { ...run, supersededWait: true } : run)
}
