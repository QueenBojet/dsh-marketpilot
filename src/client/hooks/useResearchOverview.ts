import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import type { ResearchOverview } from '../../domain/research-review.ts'
import { errorMessage } from './useProjects.ts'

export function useResearchOverview(projectId: string) {
  const [snapshot, setSnapshot] = useState<ResearchOverview | null>(null), [error, setError] = useState('')
  const refreshRef = useRef<() => void>(() => {})
  const refresh = useCallback(() => { refreshRef.current() }, [])
  useEffect(() => {
    let stopped = false, pending = false
    setSnapshot(null); setError('')
    const tick = async () => {
      if (pending) return
      pending = true
      try {
        const result = await api.research(projectId)
        if (result.projectId !== projectId || !Number.isInteger(result.revision) || !Array.isArray(result.competitors)
          || !Array.isArray(result.policies) || !Array.isArray(result.evidence) || !Array.isArray(result.documents)
          || !Array.isArray(result.runs) || result.recordCodes == null) throw new Error('RESEARCH_SNAPSHOT_INVALID')
        if (!stopped) { setSnapshot(result); setError('') }
      } catch (e) { if (!stopped) setError(errorMessage(e)) }
      finally { pending = false }
    }
    refreshRef.current = () => { void tick() }; void tick()
    const timer = window.setInterval(() => { void tick() }, 3000)
    return () => { stopped = true; window.clearInterval(timer); refreshRef.current = () => {} }
  }, [projectId])
  return { snapshot: snapshot?.projectId === projectId ? snapshot : null, error, refresh }
}
