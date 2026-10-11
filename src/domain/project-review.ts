import type { ProjectState } from './state.ts'
import { markSupersededWaits } from './runs.ts'
import { buildShortCodeIndex } from './shortcodes.ts'

export type EvidenceReviewGroup = 'pending' | 'needs_support' | 'verified' | 'rejected' | 'superseded'
export function evidenceReviewGroup(row: { kind: string; status: string }): EvidenceReviewGroup {
  if (row.status === 'rejected' || row.status === 'superseded') return row.status
  if (row.kind === 'UNKNOWN') return 'needs_support'
  return row.status === 'verified' ? 'verified' : 'pending'
}
export interface ProjectReviewOverview {
  projectId: string; revision: number
  batches: { id: string; startedAt: string; status: string; superseded: boolean; requirementIds: string[]; proposedIds: string[]; counts: Record<string, number> }[]
  evidenceCounts: Record<EvidenceReviewGroup, number>
  recordCodes: Record<string, string>
  links: Record<string, { id: string; code: string; title: string; kind: string; status: string }[]>
  issues: { id: string; code: string; title: string; reason: string; evidenceIds: string[]; requirementIds: string[]; origin: 'evidence' | 'tender' }[]
  impacts: { id: string; code: string; name: string; section: 'alternatives' | 'solution' | 'artifacts'; possiblyStale: boolean }[]
}
/** Atomic, read-only review projection. No inference upgrades or record invalidation. */
export function projectReviewOverview(state: ProjectState): ProjectReviewOverview {
  const codes = buildShortCodeIndex(state)
  const code = (id: string) => codes.codeOf(id) ?? id.slice(0, 8)
  const requirements = new Map(state.requirements.map(r => [r.id, r]))
  const batches = markSupersededWaits(state.workflowRuns).filter(r => r.type === 'requirement_analysis')
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id)).map(r => {
      const outputIds = r.output?.requirementIds
      const requirementIds = Array.isArray(outputIds) ? outputIds.filter((id): id is string => typeof id === 'string' && requirements.has(id)) : []
      const rows = requirementIds.map(id => requirements.get(id)!)
      const counts: Record<string, number> = {}
      rows.forEach(row => { counts[row.status] = (counts[row.status] ?? 0) + 1 })
      return { id: r.id, startedAt: r.startedAt, status: r.status, superseded: r.supersededWait === true,
        requirementIds, proposedIds: rows.filter(row => row.status === 'proposed').map(row => row.id), counts }
    })
  const evidenceCounts: ProjectReviewOverview['evidenceCounts'] = { pending: 0, needs_support: 0, verified: 0, rejected: 0, superseded: 0 }
  const links: ProjectReviewOverview['links'] = {}
  const issues: ProjectReviewOverview['issues'] = []
  for (const e of state.evidence) {
    const group = evidenceReviewGroup(e); evidenceCounts[group] += 1
    for (const id of e.relatedRequirementIds) {
      if (!requirements.has(id)) continue
      ;(links[id] ??= []).push({ id: e.id, code: code(e.id), title: e.title, kind: e.kind, status: e.status })
    }
    if (group === 'needs_support') issues.push({ id: e.id, code: code(e.id), title: e.title,
      reason: e.statement, evidenceIds: [e.id], requirementIds: e.relatedRequirementIds.filter(id => requirements.has(id)), origin: 'evidence' })
  }
  for (const item of state.tenderItems) {
    if (['compliant', 'not_applicable'].includes(item.status)) continue
    issues.push({ id: item.id, code: code(item.id), title: item.normalizedRequirement,
      reason: item.action ?? item.risk ?? item.status, evidenceIds: item.evidenceIds.filter(id => state.evidence.some(e => e.id === id)),
      requirementIds: item.requirementIds.filter(id => requirements.has(id)), origin: 'tender' })
  }
  const latestInput = [...state.documents, ...state.requirements, ...state.evidence].reduce((max, r) => r.updatedAt > max ? r.updatedAt : max, '')
  const latestDecision = state.decisions.reduce((max, d) => d.updatedAt > max ? d.updatedAt : max, latestInput)
  const active = state.decisions.find(d => d.id === state.project.activeDecisionId)
  const impacts: ProjectReviewOverview['impacts'] = [...state.artifacts].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map(a => ({ id: a.id, code: code(a.id), name: a.name,
    section: a.type === 'solution' ? 'solution' : 'artifacts', possiblyStale: latestDecision > a.createdAt }))
  if (active) impacts.unshift({ id: active.id, code: code(active.id), name: state.alternatives.find(a => a.id === active.alternativeId)?.name ?? active.decision,
    section: 'alternatives', possiblyStale: latestInput > active.confirmedAt })
  const recordCodes = Object.fromEntries([...state.requirements, ...state.evidence].map(r => [r.id, code(r.id)]))
  return { projectId: state.project.id, revision: state.revision, batches, evidenceCounts, recordCodes, links, issues, impacts }
}
