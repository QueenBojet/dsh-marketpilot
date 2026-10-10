/**
 * Task center: live tracked executions (active first) plus the persisted
 * workflow-run history across all projects — records survive host restarts,
 * so the center never looks empty after one. Executions live in the shared
 * registry, so switching pages never interrupts or loses a task; a run already
 * represented by a live execution is not repeated in the history list.
 */
import { useCallback, useEffect, useState } from 'react'
import type { HistoryRunRow, ProjectRow } from '../api.ts'
import { api } from '../api.ts'
import { RunHistoryCard, TaskCard } from '../components/TaskCard.tsx'
import { EmptyState, LoadingState } from '../components/States.tsx'
import { useExecutions } from '../hooks/useExecution.ts'
import type { MarketPilotText } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'

/** Render the task center page. */
export function TasksPage({ t, actions }: { t: MarketPilotText; actions: MarketPilotActions }) {
  const executions = useExecutions()
  const [projects, setProjects] = useState<Record<string, string> | null>(null)
  const [history, setHistory] = useState<HistoryRunRow[] | null>(null)
  useEffect(() => {
    let cancelled = false
    api.projects()
      .then(result => {
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const project of result.projects as ProjectRow[]) map[project.id] = project.name
        setProjects(map)
      })
      .catch(() => { if (!cancelled) setProjects({}) })
    return () => { cancelled = true }
  }, [])
  const refreshHistory = useCallback(() => {
    // Preferred: one cross-project route. Fallback (older host build): fan out
    // over the known projects and merge — history must never depend on the
    // newest server being live.
    const fallback = async (): Promise<HistoryRunRow[]> => {
      const result = await api.projects()
      const projects = result.projects as ProjectRow[]
      const perProject = await Promise.all(projects.map(async project => {
        const view = await api.runs(project.id)
        return view.runs.map(run => ({ ...run, projectId: project.id, projectName: project.name }))
      }))
      return perProject.flat() as HistoryRunRow[]
    }
    api.recentRuns()
      .then(result => { setHistory(result.runs) })
      .catch(() => { fallback().then(runs => { setHistory(runs) }).catch(() => { setHistory([]) }) })
  }, [])
  useEffect(() => { refreshHistory() }, [refreshHistory])
  // Refresh the persisted history once per settled execution, so a just
  // finished run shows up without waiting for the next mount.
  const settledMarker = executions
    .filter(execution => ['completed', 'failed', 'cancelled'].includes(execution.status))
    .map(execution => `${execution.callId}:${execution.status}`)
    .join('|')
  const [seenSettled, setSeenSettled] = useState('')
  useEffect(() => {
    if (settledMarker === '' || settledMarker === seenSettled) return
    setSeenSettled(settledMarker)
    refreshHistory()
  }, [settledMarker, seenSettled, refreshHistory])

  const rank = (status: string, supersededWait?: boolean): number =>
    status === 'running' || (status === 'waiting_human' && supersededWait !== true) ? 0 : 1
  const ordered = [...executions].sort((left, right) =>
    rank(left.status) - rank(right.status) || right.startedAt.localeCompare(left.startedAt))
  const liveRunIds = new Set(executions.map(execution => execution.runId).filter((id): id is string => id !== undefined))
  const historyRows = (history ?? [])
    .filter(run => !liveRunIds.has(run.id))
    .sort((left, right) => rank(left.status, left.supersededWait) - rank(right.status, right.supersededWait)
      || right.startedAt.localeCompare(left.startedAt))
  if (projects === null && ordered.length > 0) return <LoadingState t={t} />
  return (
    <div>
      <h1 className="mp-pageTitle">{t('tasksTitle')}</h1>
      <p className="mp-pageDesc">{t('tasksHint')}</p>
      {ordered.length === 0 ? null : (
        <>
          <h2 className="mp-subTitle" style={{ marginTop: 0 }}>{t('tasksLiveTitle')}</h2>
          <div className="mp-taskList">
            {ordered.map(execution => (
              <TaskCard
                key={execution.callId} t={t} execution={execution}
                projectName={projects === null ? undefined : projects[execution.projectId ?? '']}
                onOpenProject={projectId => { actions.openProject(projectId) }}
              />
            ))}
          </div>
        </>
      )}
      <h2 className="mp-subTitle" style={{ marginTop: ordered.length === 0 ? 0 : undefined }}>{t('tasksHistoryTitle')}</h2>
      {history === null ? <LoadingState t={t} />
        : historyRows.length === 0 ? (
          ordered.length === 0
            ? <EmptyState title={t('tasksEmpty')} body={t('tasksHint')} />
            : <p className="mp-caption">{t('tasksHistoryEmpty')}</p>
        ) : (
          <div className="mp-taskList">
            {historyRows.map(run => (
              <RunHistoryCard
                key={run.id} t={t} run={run}
                onOpenProject={projectId => { actions.openProject(projectId) }}
              />
            ))}
          </div>
        )}
    </div>
  )
}
