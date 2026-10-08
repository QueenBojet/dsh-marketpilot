import { z } from 'zod'
import { id, ids, text, ensure } from './common.ts'
import type { ProjectState } from './state.ts'

export const alternativesOutput = z.strictObject({ alternatives: z.array(z.strictObject({
  name: text, summary: text, components: z.array(text).min(1), strengths: z.array(text), limitations: z.array(text),
  risks: z.array(text), unknowns: z.array(text), evidenceIds: ids,
  requirementCoverage: z.array(z.strictObject({ requirementId: id, coverage: z.enum(['full', 'partial', 'none', 'unknown']) })),
})).min(2).max(3) })

export const sectionTitles = ['系统组成', '工作原理', '数据与报警流程', '安装与实施建议', '测试验证建议', '风险与后续工作'] as const
export const outlineOutput = z.strictObject({ sections: z.array(z.strictObject({
  title: z.enum(sectionTitles), purpose: text,
})).length(sectionTitles.length) }).refine(o => new Set(o.sections.map(s => s.title)).size === sectionTitles.length, '每个章节必须恰好出现一次')

export const sectionOutput = z.strictObject({
  decisionId: id, title: z.enum(sectionTitles),
  claims: z.array(z.strictObject({ text, kind: z.enum(['narrative', 'parameter']),
    status: z.enum(['confirmed', 'suggested', 'unknown']), requirementIds: ids, evidenceIds: ids })).min(1),
})
export type SolutionSection = z.infer<typeof sectionOutput>

/**
 * Model-boundary variants: id fields accept short handles (R1/E1/D1), which
 * the workflow resolves back to real UUIDs before the strict schemas above
 * re-validate them. Inventing a handle leaves it unresolved and fails the
 * strict parse, preserving the fail-fast guarantee.
 */
const handle = z.string().min(1)
export const alternativesModelOutput = z.strictObject({ alternatives: z.array(z.strictObject({
  name: text, summary: text, components: z.array(text).min(1), strengths: z.array(text), limitations: z.array(text),
  risks: z.array(text), unknowns: z.array(text), evidenceIds: z.array(handle),
  requirementCoverage: z.array(z.strictObject({ requirementId: handle, coverage: z.enum(['full', 'partial', 'none', 'unknown']) })),
})).min(2).max(3) })
export const sectionModelOutput = z.strictObject({
  decisionId: handle, title: z.enum(sectionTitles),
  claims: z.array(z.strictObject({ text, kind: z.enum(['narrative', 'parameter']),
    status: z.enum(['confirmed', 'suggested', 'unknown']), requirementIds: z.array(handle), evidenceIds: z.array(handle) })).min(1),
})

/** Evidence and requirement references are checked against the frozen business context. */
export function validateSection(section: SolutionSection, state: ProjectState) {
  ensure(section.decisionId === state.project.activeDecisionId, 'DECISION_MISMATCH', '生成内容引用了非当前人工 Decision。')
  for (const claim of section.claims) {
    ensure(claim.requirementIds.every(id => state.requirements.some(r => r.id === id && r.status === 'confirmed')),
      'UNCONFIRMED_REQUIREMENT', '方案只能引用已确认需求。')
    ensure(claim.evidenceIds.every(id => state.evidence.some(e => e.id === id)), 'SOURCE_MISMATCH', '方案引用了不存在的证据。')
    if (claim.status === 'confirmed' || (claim.kind === 'parameter' && claim.status !== 'unknown')) {
      ensure(claim.evidenceIds.some(id => state.evidence.some(e => e.id === id && e.status === 'verified' && ['FACT', 'SOURCE'].includes(e.kind))),
        'UNSUPPORTED_CLAIM', '已确认声明与具体参数必须关联已核验 FACT/SOURCE；否则保留 unknown。')
    }
  }
}
