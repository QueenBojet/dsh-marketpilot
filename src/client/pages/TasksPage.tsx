/**
 * Task center: every tracked execution across projects — active first — with
 * real state, cancel, and project jumps. Executions live in the shared
 * registry, so switching pages never interrupts or loses a task.
 */
import { useEffect, useState } from 'react'
import type { ProjectRow } from '../api.ts'
import { TaskCard } from '../components/TaskCard.tsx'
import { EmptyState, LoadingState } from '../components/States.tsx'
import { api } from '../api.ts'
import { useExecutions } from '../hooks/useExecution.ts'
import type { MarketPilotText } from '../locales.ts'
import type { MarketPilotActions } from '../stores.ts'

/** Render the task center page. */
export function TasksPage({ t, actions }: { t: MarketPilotText; actions: MarketPilotActions }) {
  const executions = useExecutions()
  const [projects, setProjects] = useState<Record<string, string> | null>(null)
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
  const rank = (status: string): number => (status === 'running' || status === 'waiting_human' ? 0 : 1)
  const ordered = [...executions].sort((left, right) =>
    rank(left.status) - rank(right.status) || right.startedAt.localeCompare(left.startedAt))
  return (
    <div>
      <h1 className="mp-pageTitle">{t('tasksTitle')}</h1>
      <p className="mp-pageDesc">{t('tasksHint')}</p>
      {projects === null && ordered.length > 0 ? <LoadingState t={t} />
        : ordered.length === 0 ? (
          <EmptyState title={t('tasksEmpty')} body={t('tasksHint')} />
        ) : (
          <div className="mp-taskList">
            {ordered.map(execution => (
              <TaskCard
                key={execution.callId} t={t} execution={execution}
                projectName={projects === null ? undefined : projects[execution.projectId ?? '']}
                onOpenProject={projectId => { actions.openProject(projectId) }}
              />
            ))}
          </div>
        )}
    </div>
  )
}
