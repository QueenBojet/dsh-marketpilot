import type { Alternative } from '../domain/decision.ts'
import type { ProjectState } from '../domain/state.ts'
import type { SolutionSection } from '../domain/generation.ts'
import { buildShortCodeIndex, renderCodeAppendix, type ShortCodeIndex } from '../domain/shortcodes.ts'

/** The shared code index for one project snapshot; formal prose never shows a raw UUID. */
export function projectCodeIndex(state: ProjectState): ShortCodeIndex {
  return buildShortCodeIndex(state)
}

function code(index: ShortCodeIndex, id: string): string {
  return index.codeOf(id) ?? id
}

export function renderAlternatives(rows: Alternative[], index: ShortCodeIndex): string {
  return ['# 技术路线对比', '', '以下均为候选路线，等待人工 Decision。', '', ...rows.flatMap(a => [
    `## ${a.name}（${code(index, a.id)}）`, '', a.summary, '', `组成：${a.components.join('；')}`,
    `优势：${a.strengths.join('；')}`, `局限：${a.limitations.join('；')}`, `风险：${a.risks.join('；')}`,
    `UNKNOWN：${a.unknowns.join('；')}`, `证据：${a.evidenceIds.map(id => code(index, id)).join('、') || '未提供'}`, '',
    ...Object.entries(a.requirementCoverage).map(([id, coverage]) => `- ${code(index, id)}：${coverage}`), '',
  ]), renderCodeAppendix(index)].join('\n')
}

/** Human Decision and open UNKNOWN are rendered from persisted records outside model prose. */
export function renderSolution(s: ProjectState, sections: SolutionSection[]): string {
  const index = projectCodeIndex(s)
  const decision = s.decisions.find(d => d.id === s.project.activeDecisionId)!
  const route = s.alternatives.find(a => a.id === decision.alternativeId)!
  const requirements = s.requirements.filter(r => r.status === 'confirmed')
  const unknowns = s.evidence.filter(e => e.kind === 'UNKNOWN' && !['rejected', 'superseded'].includes(e.status))
  const labels = { confirmed: '证据支持', suggested: '建议，待验证', unknown: 'UNKNOWN，待确认' }
  const sourceOf = (e: typeof s.evidence[number]): string => {
    const locator = e.sourceDocumentId !== undefined ? `资料 ${code(index, e.sourceDocumentId)}` : undefined
    return [locator ?? e.sourceUrl ?? e.sourceName ?? '未提供', e.sourceLocator].filter(Boolean).join(' ')
  }
  const coveredIds = requirements.filter(r => sections.some(section => section.claims.some(c => c.requirementIds.includes(r.id))))
  return [`# ${s.project.name}：技术方案（草稿）`, '',
    '> 本文件为方案草稿，正式导出须经人工审核；所有编号可在文末「附录：编号对照」回溯到具体记录。', '',
    '## 方案摘要', '',
    `- 人工 Decision：${code(index, decision.id)}（审核人：${decision.confirmedBy}）`,
    `- 选定路线：${route.name}（${code(index, route.id)}）`,
    `- 覆盖确认需求：${String(coveredIds.length)} / ${String(requirements.length)} 项`,
    `- 未决 UNKNOWN：${String(unknowns.length)} 项（见「设计边界与待确认条件」）`, '',
    '# 客户需求与建设目标', '', ...requirements.map(r => `- [${code(index, r.id)}] ${r.normalizedText}`), '',
    '# 设计边界与待确认条件', '', '## UNKNOWN / 待确认条件', '',
    ...(unknowns.length ? unknowns.map(e => `- [${code(index, e.id)}] ${e.title}：${e.statement}`) : ['暂无已登记 UNKNOWN；现场验收条件仍需核查。']),
    ...s.requirements.filter(r => ['unknown', 'conflict'].includes(r.status)).map(r => `- [${r.status}] ${r.normalizedText}`),
    ...route.unknowns.map(u => `- [路线待确认] ${u}`), '', '## 假设', '',
    ...s.evidence.filter(e => e.kind === 'ASSUMPTION').map(e => `- [${code(index, e.id)}] ${e.statement}`), '',
    '# 技术路线', '', route.summary, '', `决策理由（${code(index, decision.id)}）：${decision.rationale}`, '',
    ...sections.flatMap(section => [`# ${section.title}`, '', ...section.claims.flatMap(c => [
      `- **${labels[c.status]}${c.kind === 'parameter' ? ' / 参数' : ''}**：${c.text}`,
      `  需求：${c.requirementIds.map(id => code(index, id)).join('、') || '—'}；证据：${c.evidenceIds.map(id => code(index, id)).join('、') || '未提供'}`, '',
    ])]), '# 需求响应与证据索引', '',
    ...requirements.map(r => `- ${code(index, r.id)} → ${sections.filter(s => s.claims.some(c => c.requirementIds.includes(r.id))).map(s => s.title).join('、')}`), '',
    ...s.evidence.map(e => `- [${code(index, e.id)}] ${e.kind}/${e.status}：${e.statement}；来源 ${sourceOf(e)}`), '',
    renderCodeAppendix(index),
  ].join('\n')
}
