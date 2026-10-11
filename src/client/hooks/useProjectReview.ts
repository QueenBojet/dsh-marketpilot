import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import type { ProjectReviewOverview } from '../../domain/project-review.ts'
import { errorMessage } from './useProjects.ts'

export function useProjectReview(projectId: string) {
  const [snapshot, setSnapshot] = useState<ProjectReviewOverview | null>(null)
  const [error, setError] = useState('')
  const refreshRef = useRef<() => void>(() => {})
  const refresh = useCallback(() => { refreshRef.current() }, [])
  useEffect(() => {
    let stopped = false, pending = false
    setSnapshot(null); setError('')
    const tick = async () => {
      if (pending) return
      pending = true
      try {
        const result = await api.review(projectId)
        if (result.projectId !== projectId || !Array.isArray(result.batches) || !Array.isArray(result.issues)
          || !Array.isArray(result.impacts) || !Number.isInteger(result.revision)
          || result.evidenceCounts == null || result.links == null) throw new Error('REVIEW_SNAPSHOT_INVALID')
        if (!stopped) { setSnapshot(result); setError('') }
      } catch (e) { if (!stopped) setError(errorMessage(e)) }
      finally { pending = false }
    }
    refreshRef.current = () => { void tick() }
    void tick()
    const timer = window.setInterval(() => { void tick() }, 3000)
    return () => { stopped = true; window.clearInterval(timer); refreshRef.current = () => {} }
  }, [projectId])
  return { snapshot: snapshot?.projectId === projectId ? snapshot : null, error, refresh }
}
