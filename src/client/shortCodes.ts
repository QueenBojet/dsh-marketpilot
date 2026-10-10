/**
 * Client bridge to the shared short-code index: the same deterministic
 * mapping the server renderers use, built from the workbench detail payload.
 * Readers apply `replace` for display only — artifact records keep their
 * original content, and all persisted references stay full UUIDs.
 */
import { useMemo } from 'react'
import { buildShortCodeIndex, type ShortCodeIndex } from '../domain/shortcodes.ts'
import type { ProjectDetail } from './api.ts'
import { useProjectDetail } from './hooks/useProjects.ts'

/** Build the project's short-code index from the full workbench detail. */
export function projectShortCodeIndex(detail: ProjectDetail): ShortCodeIndex {
  const rows = (value: unknown): unknown[] => Array.isArray(value) ? value : []
  return buildShortCodeIndex({
    requirements: rows(detail.requirements) as ProjectDetail['requirements'],
    evidence: rows(detail.evidence) as ProjectDetail['evidence'],
    alternatives: rows(detail.alternatives) as ProjectDetail['alternatives'],
    decisions: rows(detail.decisions) as ProjectDetail['decisions'],
    tenderItems: rows(detail.tenderItems) as ProjectDetail['tenderItems'],
    documents: rows(detail.documents) as ProjectDetail['documents'],
    artifacts: rows(detail.artifacts) as ProjectDetail['artifacts'],
  })
}

/**
 * Detail-backed short-code index hook for drawers and cross-module links.
 * Tolerates the loading window (`null` index → callers degrade gracefully).
 */
export function useCodeIndex(projectId: string): { index: ShortCodeIndex | null; refresh: () => void } {
  const detailState = useProjectDetail(projectId)
  const index = useMemo(
    () => detailState.detail === null ? null : projectShortCodeIndex(detailState.detail),
    [detailState.detail])
  return { index, refresh: detailState.refresh }
}
