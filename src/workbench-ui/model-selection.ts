import { useCallback, useEffect, useState } from 'react'
import { get, type Selection } from './api.ts'

export const MODEL_KEY = 'marketpilot.v4.model-selection'
export interface ModelCatalog { providers: { id: string; name: string }[]; initial: Selection | null }
export function readSelection(): Selection | undefined {
  const raw = localStorage.getItem(MODEL_KEY)
  if (!raw) return undefined
  try {
    const value = JSON.parse(raw) as Selection
    if (value && typeof value.provider === 'string' && value.provider && typeof value.model === 'string' && value.model &&
      (value.reasoningEffort === undefined || typeof value.reasoningEffort === 'string')) return value
  } catch { /* A corrupt browser preference is replaced by the host's initial selection. */ }
  return undefined
}

/** One browser/workbench selection shared by all projects, persisted only when initialized or changed. */
export function useModelSelection() {
  const [selection, setSelection] = useState<Selection | undefined>(readSelection)
  const [catalog, setCatalog] = useState<ModelCatalog>()
  const [catalogError, setCatalogError] = useState('')
  const selectModel = useCallback((next: Selection) => {
    localStorage.setItem(MODEL_KEY, JSON.stringify(next))
    setSelection(next)
  }, [])
  const reloadModels = useCallback(async () => {
    try {
      const data = await get<ModelCatalog>('v4/model-catalog')
      setCatalog(data); setCatalogError('')
      if (!readSelection() && data.initial) selectModel(data.initial)
    } catch (e) { setCatalogError(e instanceof Error ? e.message : String(e)) }
  }, [selectModel])
  useEffect(() => { void reloadModels() }, [reloadModels])
  useEffect(() => {
    const onStorage = (e: StorageEvent) => { if (e.key === MODEL_KEY) setSelection(readSelection()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return { selection, selectModel, catalog, catalogError, reloadModels }
}
