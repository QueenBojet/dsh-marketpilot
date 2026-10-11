import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import type { ProjectWorkflowOverview } from '../../domain/project-workflow.ts'
import { errorMessage } from './useProjects.ts'

/** Poll an atomic server projection, including executions started outside this browser. */
export function useProjectWorkflow(projectId: string) {
  const [snapshot, setSnapshot] = useState<ProjectWorkflowOverview | null>(null)
  const [error, setError] = useState('')
  const refreshRef = useRef<() => void>(() => {})
  const refresh = useCallback(() => { refreshRef.current() }, [])
  useEffect(() => {
    let stopped = false, pending = false
    setSnapshot(null)
    setError('')
    const tick = async () => {
      if (pending) return
      pending = true
      try {
        const result = await api.workflow(projectId)
        if (result.projectId !== projectId || !Array.isArray(result.stages) || result.stages.length !== 8
          || result.capabilities === undefined) throw new Error('项目工作流快照不完整，请检查宿主插件版本。')
        if (!stopped) { setSnapshot(result); setError('') }
      } catch (e) {
        if (!stopped) setError(errorMessage(e))
      } finally { pending = false }
    }
    refreshRef.current = () => { void tick() }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 3000)
    return () => { stopped = true; window.clearInterval(timer); refreshRef.current = () => {} }
  }, [projectId])
  return { snapshot, error, refresh }
}
