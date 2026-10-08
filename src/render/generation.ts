import type { Alternative } from '../domain/decision.ts'
import type { ProjectState } from '../domain/state.ts'
import type { SolutionSection } from '../domain/generation.ts'

export function renderAlternatives(rows: Alternative[]): string {
  return ['# 技术路线对比', '', '以下均为候选路线，等待人工 Decision。', '', ...rows.flatMap(a => [
    `## ${a.name} (${a.id})`, '', a.summary, '', `组成：${a.components.join('；')}`,
    `优势：${a.strengths.join('；')}`, `局限：${a.limitations.join('；')}`, `风险：${a.risks.join('；')}`,
    `UNKNOWN：${a.unknowns.join('；')}`, `证据：${a.evidenceIds.join('、') || '未提供'}`, '',
    ...Object.entries(a.requirementCoverage).map(([id, coverage]) => `- ${id}：${coverage}`), '',
  ])].join('\n')
}

/** Human Decision and open UNKNOWN are rendered from persisted records outside model prose. */
export function renderSolution(s: ProjectState, sections: SolutionSection[]): string {
  const decision = s.decisions.find(d => d.id === s.project.activeDecisionId)!
  const route = s.alternatives.find(a => a.id === decision.alternativeId)!
  const requirements = s.requirements.filter(r => r.status === 'confirmed')
  const unknowns = s.evidence.filter(e => e.kind === 'UNKNOWN' && !['rejected', 'superseded'].includes(e.status))
  const labels = { confirmed: '证据支持', suggested: '建议，待验证', unknown: 'UNKNOWN，待确认' }
  return ['# 项目概述', '', s.project.name, '', '本文件为方案草稿，正式导出须经人工审核。', '',
    '# 客户需求与建设目标', '', ...requirements.map(r => `- [${r.id}] ${r.normalizedText}`), '',
    '# 设计边界与待确认条件', '', '## UNKNOWN / 待确认条件', '',
    ...(unknowns.length ? unknowns.map(e => `- [${e.id}] ${e.title}：${e.statement}`) : ['暂无已登记 UNKNOWN；现场验收条件仍需核查。']),
    ...s.requirements.filter(r => ['unknown', 'conflict'].includes(r.status)).map(r => `- [${r.status}] ${r.normalizedText}`),
    ...route.unknowns.map(u => `- [路线待确认] ${u}`), '', '## 假设', '',
    ...s.evidence.filter(e => e.kind === 'ASSUMPTION').map(e => `- [${e.id}] ${e.statement}`), '',
    '# 技术路线', '', `人工 Decision：${decision.id}；审核人：${decision.confirmedBy}`, '',
    `选定路线：${route.name} (${route.id})`, '', route.summary, '', `决策理由：${decision.rationale}`, '',
    ...sections.flatMap(section => [`# ${section.title}`, '', ...section.claims.flatMap(c => [
      `- **${labels[c.status]}${c.kind === 'parameter' ? ' / 参数' : ''}**：${c.text}`,
      `  需求：${c.requirementIds.join('、') || '—'}；证据：${c.evidenceIds.join('、') || '未提供'}`, '',
    ])]), '# 需求响应与证据索引', '',
    ...requirements.map(r => `- ${r.id} → ${sections.filter(s => s.claims.some(c => c.requirementIds.includes(r.id))).map(s => s.title).join('、')}`), '',
    ...s.evidence.map(e => `- [${e.id}] ${e.kind}/${e.status}：${e.statement}；来源 ${e.sourceDocumentId ?? e.sourceUrl ?? e.sourceName ?? '未提供'} ${e.sourceLocator ?? ''}`), '',
  ].join('\n')
}
