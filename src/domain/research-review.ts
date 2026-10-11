import type { ProjectState } from './state.ts'
import type { Competitor } from './research.ts'
import type { Evidence } from './evidence.ts'
import { buildShortCodeIndex } from './shortcodes.ts'

/** One repository revision supplies results, provenance and real research history. */
export function researchOverview(state: ProjectState) {
  const linked = new Set([...state.competitors, ...state.policies].flatMap(row => row.evidenceIds))
  const codes = buildShortCodeIndex(state)
  return {
    projectId: state.project.id, revision: state.revision,
    competitors: state.competitors, policies: state.policies,
    evidence: state.evidence.filter(row => linked.has(row.id)),
    documents: state.documents.map(({ id, name, kind, importedAt }) => ({ id, name, kind, importedAt })),
    runs: state.workflowRuns.filter(row => ['competitor_analysis', 'policy_analysis'].includes(row.type)),
    recordCodes: Object.fromEntries([...state.documents, ...state.evidence].map(row => [row.id, codes.codeOf(row.id) ?? row.id.slice(0, 8)])),
  }
}
export type ResearchOverview = ReturnType<typeof researchOverview>

type Product = Pick<Competitor, 'id' | 'product' | 'performance' | 'parameterContexts' | 'evidenceIds'>
/** Exact name/unit/conditions only. No unit conversion, series inheritance or ranking. */
export function parameterComparison(products: readonly Product[], sources: readonly Pick<Evidence, 'id' | 'kind' | 'status' | 'statement' | 'relatedCompetitorIds'>[] = []) {
  const groups = new Map<string, { name: string; unit: string | null; conditions: string | null;
    cells: Record<string, { value: string | number | boolean | null; evidenceId: string | null; supported: boolean }> }>()
  for (const product of products) for (const [name, value] of Object.entries(product.performance)) {
    const context = product.parameterContexts?.[name]
    const unit = context?.unit ?? null, conditions = context?.conditions ?? null
    const key = JSON.stringify([name, unit, conditions])
    const group = groups.get(key) ?? { name, unit, conditions, cells: {} }
    const evidenceId = context && product.evidenceIds.includes(context.evidenceId) ? context.evidenceId : null
    const source = sources.find(row => row.id === evidenceId)
    const supported = source !== undefined && ['SOURCE', 'FACT'].includes(source.kind) && !['rejected', 'superseded'].includes(source.status)
      && source.relatedCompetitorIds.includes(product.id) && product.product !== undefined && value !== null
      && [product.product, String(value), unit, conditions].every(part => part !== null && source.statement.includes(part))
    group.cells[product.id] = { value, evidenceId, supported }
    groups.set(key, group)
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group,
    comparable: group.unit !== null && group.conditions !== null
      && Object.values(group.cells).filter(cell => cell.supported).length >= 2,
  }))
}
