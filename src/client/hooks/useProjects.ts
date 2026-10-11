/**
 * Data hooks over the same-origin workbench API. Component-internal
 * behavioral hooks: they own plain React state around `fetch` calls and
 * subscribe to nothing external. Creation still goes through the guarded
 * `marketpilot_project_create` tool, never a direct service call.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type ProjectDetail, type ProjectRow } from '../api.ts'
import type { MarketPilotText } from '../locales.ts'

/** Normalize any rejection into a non-empty display message (an empty
 * `Error.message` must not collapse into the "no error" sentinel ''). */
export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  const text = String(error)
  return text === '' ? 'UnknownError' : text
}

/** Project list with load/error state and a manual refresh. */
export function useProjects() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null)
  const [error, setError] = useState('')
  const refresh = useCallback(() => {
    api.projects()
      .then(result => { setProjects(result.projects); setError('') })
      .catch(e => { setError(errorMessage(e)) })
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return { projects, error, refresh, loading: projects === null && error === '' }
}

/** One project's full detail (existing V2 read route), refetched per id.
 * Stale data drops before each fetch so a retry or id switch never renders
 * the previous project under the new identity. */
export function useProjectDetail(projectId: string) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const refresh = useCallback(() => {
    const request = ++generation.current
    api.project(projectId)
      .then(result => { if (request === generation.current) { setDetail(result); setError('') } })
      .catch(e => { if (request === generation.current) setError(errorMessage(e)) })
  }, [projectId])
  useEffect(() => {
    setDetail(null); setError(''); refresh()
    return () => { generation.current += 1 }
  }, [refresh])
  const current = detail?.project.id === projectId ? detail : null
  return { detail: current, error, refresh, loading: current === null && error === '' }
}

/**
 * Create a project through the guarded tool and poll the execution to a
 * terminal state. Only `completed` triggers the settled callback; `cancelled`
 * is not a success. The interval clears on unmount and settlement, and a
 * resolve racing an unmount must not spawn an orphan interval.
 * @param t - the locale-bound text function (error fallback copy).
 * @param onSettled - called once the execution completes successfully.
 * @returns the creating flag, error text, and the start callback.
 */
export function useCreateProject(t: MarketPilotText, onSettled?: () => void) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef<number>(0)
  const mountedRef = useRef(true)
  const onSettledRef = useRef(onSettled)
  useEffect(() => { onSettledRef.current = onSettled })
  useEffect(() => () => {
    mountedRef.current = false
    window.clearInterval(timerRef.current)
  }, [])
  const create = useCallback((name: string) => {
    const trimmed = name.trim()
    if (creating || trimmed === '') return
    setCreating(true)
    setError('')
    api.start('marketpilot_project_create', { name: trimmed })
      .then(({ callId }) => {
        if (!mountedRef.current) return
        timerRef.current = window.setInterval(() => {
          api.execution(callId).then(view => {
            if (view.status === 'running' || view.status === 'waiting_human') return
            window.clearInterval(timerRef.current)
            if (!mountedRef.current) return
            setCreating(false)
            if (view.status === 'failed') {
              setError(view.error === undefined || view.error === '' ? t('createFailed') : view.error)
            } else if (view.status === 'completed') {
              onSettledRef.current?.()
            }
            // cancelled: not a success — stay quiet without refreshing.
          }).catch(e => {
            window.clearInterval(timerRef.current)
            if (!mountedRef.current) return
            setCreating(false)
            setError(errorMessage(e))
          })
        }, 1200)
      })
      .catch(e => {
        if (!mountedRef.current) return
        setCreating(false)
        setError(errorMessage(e))
      })
  }, [creating, t])
  return { creating, error, create }
}

/** Sort projects by recency (newest updatedAt first). */
export function byRecent(a: ProjectRow, b: ProjectRow): number {
  return b.updatedAt.localeCompare(a.updatedAt)
}
