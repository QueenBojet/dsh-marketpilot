import type { ProjectState } from '../domain/state.ts'
import { buildShortCodeIndex, renderCodeAppendix } from '../domain/shortcodes.ts'

function cell(value: string | undefined) { return (value ?? '—').replaceAll('|', '\\|').replaceAll('\n', '<br>') }

/** Baseline renders saved human-reviewed records, never a second model interpretation. */
export function renderBaseline(state: ProjectState, requirementIds: string[]): string {
  const index = buildShortCodeIndex(state)
  const code = (id: string): string => index.codeOf(id) ?? id
  const selected = state.requirements.filter(r => requirementIds.includes(r.id))
  const unknowns = state.evidence.filter(e => e.kind === 'UNKNOWN' && !['rejected', 'superseded'].includes(e.status))
  return [
    `# Requirement Baseline — ${state.project.name}`, '',
    '| 编号 | 标准化需求 | 类型 | 优先级 | 状态 | 来源 |', '|---|---|---|---|---|---|',
    ...selected.map(r => `| ${code(r.id)} | ${cell(r.normalizedText)} | ${r.type} | ${r.priority} | ${r.status} | ${cell(r.sourceDocumentId === undefined ? undefined : code(r.sourceDocumentId))} ${cell(r.sourceLocator)} |`),
    '', '## UNKNOWN / 待确认条件', '',
    ...(unknowns.length ? unknowns.map(e => `- [${code(e.id)}] ${e.title}：${e.statement}（来源 ${e.sourceDocumentId === undefined ? '未提供' : code(e.sourceDocumentId)} ${e.sourceLocator ?? ''}）`) : ['本批次没有提取到 UNKNOWN；这不代表所有现场条件均已明确。']),
    '', '## 需求原文与审核记录', '',
    ...selected.flatMap(r => [`### ${code(r.id)} ${cell(r.normalizedText)}`, '', r.originalText, '',
      `状态：${r.status}；审核人：${r.confirmation?.reviewer ?? '待人工处理'}；澄清：${r.clarificationQuestion ?? '—'}`, '']),
    renderCodeAppendix(index),
  ].join('\n')
}
