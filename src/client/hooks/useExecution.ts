/**
 * React bindings over the shared execution registry plus the Phase 2 data
 * hooks (documents, requirements, active run timeline). Components stay
 * props-driven; these hooks own only fetch/poll plumbing.
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { api, type ArtifactFullRow, type ArtifactMetaRow, type DocumentMeta, type ProjectRow, type RequirementsPage, type RequirementsQuery, type WorkflowRunView } from '../api.ts'
import { executionStore, type TrackedExecution } from './executionStore.ts'

/** All tracked executions, newest first; in-flight host executions started
 * elsewhere (another browser, or before a reload) are adopted on mount —
 * scoped to one project when an id is given, across all projects otherwise
 * (home + task center truth). */
export function useExecutions(projectId?: string): readonly TrackedExecution[] {
  const all = useSyncExternalStore(executionStore.subscribe, executionStore.getSnapshot, executionStore.getSnapshot)
  useEffect(() => {
    let cancelled = false
    api.executions(projectId)
      .then(result => { if (!cancelled) for (const view of result.executions) executionStore.adopt(view) })
      .catch(() => { /* the index is an enhancement, not a prerequisite */ })
    return () => { cancelled = true }
  }, [projectId])
  const filtered = projectId === undefined ? all : all.filter(execution => execution.projectId === projectId)
  return [...filtered].sort((left, right) => right.startedAt.localeCompare(left.startedAt))
}

/** Document metadata list with manual refresh. */
export function useDocuments(projectId: string) {
  const [documents, setDocuments] = useState<DocumentMeta[] | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    api.documents(projectId)
      .then(result => { setDocuments(result.documents); setError('') })
      .catch(e => { setError(e instanceof Error && e.message !== '' ? e.message : String(e)) })
  }, [projectId])
  useEffect(() => refresh(), [refresh])
  return { documents, error, refresh, loading: documents === null && error === '' }
}

/** Requirements projection with server-side filter/search. */
export function useRequirements(projectId: string, query: RequirementsQuery) {
  const [page, setPage] = useState<RequirementsPage | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    api.requirements(projectId, query)
      .then(result => { setPage(result); setError('') })
      .catch(e => { setError(e instanceof Error && e.message !== '' ? e.message : String(e)) })
  }, [projectId, query.status, query.q, query.page, query.pageSize])
  useEffect(() => refresh(), [refresh])
  return { page, error, refresh, loading: page === null && error === '' }
}

/**
 * The active workflow run of one type, polled only while an execution of the
 * same project is in flight; null when none exists.
 */
export function useActiveRun(projectId: string, type: string, active: boolean): WorkflowRunView | null {
  const [run, setRun] = useState<WorkflowRunView | null>(null)
  useEffect(() => {
    if (!active) {
      setRun(null)
      return
    }
    let stopped = false
    const tick = (): void => {
      api.runs(projectId, { type, active: true })
        .then(result => { if (!stopped) setRun(result.runs[0] ?? null) })
        .catch(() => { if (!stopped) setRun(null) })
    }
    tick()
    const timer = window.setInterval(tick, 3000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [projectId, type, active])
  return run
}

/** Elapsed milliseconds since an ISO start, recomputed on a light interval. */
export function useElapsed(startedAt: string, active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => { setNow(Date.now()) }, 1000)
    return () => { window.clearInterval(timer) }
  }, [active])
  return Math.max(0, now - Date.parse(startedAt))
}

/** Artifact list metadata (content arrives only through useArtifact). */
export function useArtifacts(projectId: string) {
  const [artifacts, setArtifacts] = useState<ArtifactMetaRow[] | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    api.requestArtifacts(projectId)
      .then(result => { setArtifacts(result.artifacts); setError('') })
      .catch(e => { setError(e instanceof Error && e.message !== '' ? e.message : String(e)) })
  }, [projectId])
  useEffect(() => { refresh() }, [refresh])
  return { artifacts, error, refresh, loading: artifacts === null && error === '' }
}

/** One artifact's full record, fetched on demand for the reader view. */
export function useArtifact(projectId: string, artifactId: string | null) {
  const [artifact, setArtifact] = useState<ArtifactFullRow | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (artifactId === null) {
      setArtifact(null)
      setError('')
      return
    }
    let cancelled = false
    setArtifact(null)
    setError('')
    api.artifact(projectId, artifactId)
      .then(result => { if (!cancelled) setArtifact(result.artifact) })
      .catch(e => { if (!cancelled) setError(e instanceof Error && e.message !== '' ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [projectId, artifactId])
  return { artifact, error, loading: artifact === null && error === '' }
}

/** Recent workflow-run snapshots for one project (phase-state derivation). */
export function useProjectRuns(projectId: string) {
  const [runs, setRuns] = useState<readonly WorkflowRunView[] | null>(null)
  const refresh = useCallback(() => {
    api.runs(projectId)
      .then(result => { setRuns(result.runs) })
      .catch(() => { setRuns([]) })
  }, [projectId])
  useEffect(() => { refresh() }, [refresh])
  return { runs, refresh }
}

/**
 * Home statistics over real data only: the global in-flight execution count
 * and each project's waiting-for-human runs. No synthetic values — a failed
 * lookup yields `null` so the page can show 暂无数据 instead of a fake 0.
 * @param projects - the loaded project rows (stats load once per id set).
 */
export function useHomeStats(projects: readonly ProjectRow[] | null) {
  const [stats, setStats] = useState<{ running: number; waitingTotal: number; waitingByProject: Record<string, number> } | null>(null)
  const ids = (projects ?? []).map(row => row.id).join(',')
  useEffect(() => {
    if (projects === null) return
    let cancelled = false
    const projectIds = ids === '' ? [] : ids.split(',')
    const load = async (): Promise<void> => {
      try {
        const [executions, ...runLists] = await Promise.all([
          api.executions(),
          ...projectIds.map(id => api.runs(id, { active: true }).catch(() => null)),
        ] as const)
        if (cancelled) return
        // Attribute waiting runs to their requesting project by request order.
        const waitingByProject: Record<string, number> = {}
        let waitingTotal = 0
        runLists.forEach((result, index) => {
          if (result === null || projectIds[index] === undefined) return
          const count = result.runs.filter(run => run.status === 'waiting_human').length
          if (count > 0) {
            waitingByProject[projectIds[index]!] = count
            waitingTotal += count
          }
        })
        const running = executions.executions
          .filter(view => view.status === 'running' || view.status === 'waiting_human').length
        setStats({ running, waitingTotal, waitingByProject })
      } catch {
        if (!cancelled) setStats(null)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [projects, ids])
  return stats
}
