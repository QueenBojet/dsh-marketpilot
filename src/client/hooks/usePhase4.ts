/**
 * Phase 4 data hooks: research, evidence, alternatives and tender projections
 * plus the shared tool-execution helper every workflow page uses to start a
 * guarded tool run, watch its real steps, and surface its human gate.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  api, type AlternativeItem, type CompetitorItem, type EvidencePage, type PolicyItem,
  type TenderItemProjection,
} from '../api.ts'
import { executionStore, type TrackedExecution } from './executionStore.ts'
import { useActiveRun, useExecutions } from './useExecution.ts'
import type { MarketPilotText } from '../locales.ts'

/** Normalize a rejection into a non-empty display message. */
export function describeError(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  const text = String(error)
  return text === '' ? 'UnknownError' : text
}

function useList<T>(load: () => Promise<T[]>, deps: readonly unknown[]) {
  const [rows, setRows] = useState<T[] | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    load()
      .then(result => { setRows(result); setError('') })
      .catch(e => { setError(describeError(e)) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  useEffect(() => { refresh() }, [refresh])
  return { rows, error, refresh, loading: rows === null && error === '' }
}

/** Competitor matrix rows. */
export function useCompetitors(projectId: string) {
  return useList<CompetitorItem>(() => api.competitors(projectId).then(result => result.competitors), [projectId])
}

/** Policy/standard rows. */
export function usePolicies(projectId: string) {
  return useList<PolicyItem>(() => api.policies(projectId).then(result => result.policies), [projectId])
}

/** Evidence-ledger page with server-side filter and search. */
export function useEvidencePage(projectId: string, query: { status?: string; kind?: string; q?: string; review?: string; page?: number }) {
  const [page, setPage] = useState<EvidencePage | null>(null)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(() => {
    const request = ++generation.current
    api.evidence(projectId, query)
      .then(result => { if (request === generation.current) { setPage(result); setError('') } })
      .catch(e => { if (request === generation.current) setError(describeError(e)) })
  }, [projectId, query.status, query.kind, query.q, query.review, query.page])
  useEffect(() => { setPage(null); setError(''); refresh(); return () => { generation.current += 1 } }, [refresh])
  return { page, error, refresh, loading: page === null && error === '' }
}

/** Candidate routes with requirement coverage. */
export function useAlternatives(projectId: string) {
  return useList<AlternativeItem>(() => api.alternatives(projectId).then(result => result.alternatives), [projectId])
}

/** Tender clauses with response drafts and compliance status. */
export function useTenderItems(projectId: string) {
  return useList<TenderItemProjection>(() => api.tenderItems(projectId).then(result => result.tenderItems), [projectId])
}

/**
 * One page's guarded tool runs: start a tool, follow its live state, expose
 * the pending human gate, and refresh data when it settles.
 * @param projectId - the project the tools run against.
 * @param tools - the tool names this page owns.
 * @param runType - the workflow-run type shown in the step timeline.
 * @param t - the locale-bound text function (error fallback copy).
 * @param onSettled - called after every settled execution of these tools.
 * @returns the page's executions, busy flag, gate execution, start, and data refresh.
 */
export function useToolWorkflow(projectId: string, tools: readonly string[], runType: string,
  t: MarketPilotText, onSettled?: () => void) {
  const executions = useExecutions(projectId)
  const toolSet = useMemo(() => new Set(tools), [tools])
  const mine = useMemo(() => executions.filter(execution => toolSet.has(execution.tool)),
    [executions, toolSet])
  const busy = mine.some(execution => !execution.lost && (execution.status === 'running' || execution.status === 'waiting_human'))
  const gating = mine.find(execution => !execution.lost && execution.status === 'waiting_human')
  const run = useActiveRun(projectId, runType, busy)
  const latest = mine.find(execution => !execution.lost && execution.status === 'running')
    ?? gating ?? mine[0]
  const [error, setError] = useState('')

  const settleRef = useCallbackRef(onSettled)
  const settledMarker = mine
    .filter(execution => ['completed', 'failed', 'cancelled'].includes(execution.status))
    .map(execution => `${execution.callId}:${execution.status}`)
    .join('|')
  const [seenMarker, setSeenMarker] = useState('')
  useEffect(() => {
    if (settledMarker === '' || settledMarker === seenMarker) return
    setSeenMarker(settledMarker)
    settleRef.current?.()
  }, [settledMarker, seenMarker, settleRef])

  const start = useCallback((tool: string, args: Record<string, unknown>) => {
    setError('')
    return executionStore.start(tool, { projectId, ...args })
      .catch(e => { setError(describeError(e)); throw e })
  }, [projectId])

  const answer = useCallback((selected: string, custom?: string) => {
    if (gating === undefined) return Promise.resolve()
    return executionStore.answer(gating.callId, selected, custom)
      .catch(e => { setError(describeError(e)) })
  }, [gating])
  const cancel = useCallback(() => {
    if (gating === undefined) return Promise.resolve()
    return executionStore.cancel(gating.callId).catch(e => { setError(describeError(e)) })
  }, [gating])

  return { executions: mine, busy, gating, run, latest, error, clearError: () => { setError('') }, start, answer, cancel, t }
}

/** Keep a latest callback ref without re-running effects on identity change. */
function useCallbackRef<T>(value: T | undefined) {
  const ref = useState<{ current: T | undefined }>(() => ({ current: value }))[0]
  ref.current = value
  return ref
}

/** One execution's display helpers shared by the workflow pages. */
export function executionLabelKey(status: TrackedExecution['status']): string {
  return status === 'waiting_human' ? 'execQuestion' : `runStatus.${status}`
}
