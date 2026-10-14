import type { Overview } from './types.ts'

/** Match the synthesis gate: answered reports for current initial routes, grouped by direction. */
export function currentResearchDirections(ov: Pick<Overview, 'discoveryStatus'> & {
  v4: Pick<Overview['v4'], 'questions' | 'explorations'>
}): number {
  if (!ov.discoveryStatus?.initialCurrent) return 0
  const routes = new Set(ov.v4.explorations?.filter(e => e.phase === 'initial').at(-1)?.routes.map(r => r.alternativeId) ?? [])
  const reports = ov.v4.questions.filter(q => q.status === 'answered' && q.report && q.direction?.trim()
    && q.alternativeIds?.length && q.alternativeIds.every(id => routes.has(id)))
  return new Set(reports.map(q => q.direction!.trim())).size
}
