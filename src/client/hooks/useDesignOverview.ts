import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.ts'
import type { DesignOverview } from '../../services/design-overview.ts'
import { errorMessage } from './useProjects.ts'

export function useDesignOverview(projectId: string) {
  const [snapshot, setSnapshot] = useState<DesignOverview | null>(null)
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
        const result = await api.design(projectId)
        const collections = [result.alternatives, result.requirements, result.evidence, result.decisions, result.tenderItems, result.artifacts]
        if (result.projectId !== projectId || !Number.isInteger(result.revision) || typeof result.reviewVersion !== 'string'
          || !collections.every(rows => Array.isArray(rows) && rows.every(row => row.projectId === projectId))
          || !Array.isArray(result.documents) || !Array.isArray(result.runs) || result.recordCodes == null) throw new Error('DESIGN_SNAPSHOT_INVALID')
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
