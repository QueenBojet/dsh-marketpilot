import type { ProjectState } from '../../domain/state.ts'
import { hashOf } from '../../domain/v4-text.ts'

export const fixedNotes = (s: ProjectState) => (s.v4?.supportNotes ?? []).filter(n => n.status === 'fixed')
export const briefHash = (s: ProjectState) => hashOf(s.v4?.discovery?.brief ?? null)
export const briefConfirmed = (s: ProjectState) => !!s.v4?.discovery?.review && s.v4.discovery.review.hash === briefHash(s)
export function routeContents(s: ProjectState, ids: string[]) {
  return ids.map(id => { const a = s.alternatives.find(a => a.id === id); if (!a) return null
    const { status: _status, createdAt: _created, updatedAt: _updated, ...content } = a; return content })
}
export function explorationHash(s: ProjectState, phase: 'initial' | 'synthesis') {
  return hashOf({ brief: s.v4?.discovery?.brief, notes: fixedNotes(s),
    requirements: s.requirements.filter(r => r.status === 'confirmed'),
    ...(phase === 'synthesis' ? {
      initial: s.v4?.explorations?.filter(e => e.phase === 'initial'),
      alternatives: routeContents(s, s.v4?.explorations?.filter(e => e.phase === 'initial').at(-1)?.routes.map(r => r.alternativeId) ?? []),
      questions: s.v4?.questions.map(q => ({ id: q.id, title: q.title, direction: q.direction, alternativeIds: q.alternativeIds,
        decisionUse: q.decisionUse, status: q.status, plan: q.plan, report: q.report, reportRunId: q.reportRunId })),
      findings: s.v4?.findings,
    } : {}),
  })
}
export function latestExploration(s: ProjectState, phase: 'initial' | 'synthesis') {
  const e = s.v4?.explorations?.filter(e => e.phase === phase).at(-1)
  return e?.inputHash === explorationHash(s, phase) && e.routesHash === hashOf(routeContents(s, e.routes.map(r => r.alternativeId))) ? e : undefined
}
export function currentReports(s: ProjectState) {
  const initialIds = latestExploration(s, 'initial')?.routes.map(r => r.alternativeId) ?? []
  return (s.v4?.questions ?? []).filter(q => q.status === 'answered' && q.report && q.direction?.trim()
    && q.alternativeIds?.length && q.alternativeIds.every(a => initialIds.includes(a)))
}
export function interviewContext(s: ProjectState, documentIds: string[]) {
  return {
    support: supportContext(s), proposal: s.v4?.discovery?.proposal ?? s.v4?.discovery?.brief,
    documents: documentIds.map(id => s.documents.find(d => d.id === id)),
    messages: s.v4?.messages.filter(m => m.thread === 'discovery' && m.status === 'done').slice(-20),
  }
}
export function decisionBlocker(s: ProjectState, alternativeId?: string): string | undefined {
  if (!s.v4?.discovery) return
  if (!briefConfirmed(s)) return '请先人工确认当前需求简报。'
  const final = latestExploration(s, 'synthesis')
  if (!final) return '请先基于当前研究结果进行综合判断与二次头脑风暴。'
  if (alternativeId && !final.routes.some(r => r.alternativeId === alternativeId)) return '请选择最新综合判断中的最终候选路线。'
}
export function supportContext(s: ProjectState): string {
  return JSON.stringify({ project: { name: s.project.name, customer: s.project.customer, description: s.project.description, scenario: s.project.scenario }, brief: s.v4?.discovery?.brief,
    confirmedRequirements: s.requirements.filter(r => r.status === 'confirmed'),
    supportNotes: fixedNotes(s).map(({ title, category, content, relevance, documentId, quote, locator }) =>
      ({ title, category, content, relevance, documentId, quote, locator })),
  })
}
