import type { Alternative } from './decision.ts'
import type { Requirement } from './requirement.ts'
import type { Evidence } from './evidence.ts'

/** Coverage is the stored model response, never a performance score. */
export function routeReview(route: Alternative, requirements: readonly Requirement[], evidence: readonly Evidence[]) {
  const must = requirements.filter(row => row.status === 'confirmed' && row.priority === 'must')
  return {
    must, full: must.filter(row => route.requirementCoverage[row.id] === 'full'),
    gaps: must.filter(row => route.requirementCoverage[row.id] !== 'full'),
    unconfirmedMust: requirements.filter(row => row.priority === 'must' && ['proposed', 'unknown', 'conflict'].includes(row.status)),
    verified: evidence.filter(row => route.evidenceIds.includes(row.id) && row.status === 'verified' && ['FACT', 'SOURCE'].includes(row.kind)),
  }
}
