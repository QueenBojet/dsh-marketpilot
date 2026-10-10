import type { ProjectState } from '../domain/state.ts'
import type { TenderItem } from '../domain/tender.ts'
import { buildShortCodeIndex, renderCodeAppendix } from '../domain/shortcodes.ts'

const cell = (value: string | undefined) => (value ?? '—').replaceAll('|', '\\|').replaceAll('\n', '<br>')

export function renderCompliance(state: ProjectState, items: TenderItem[]): string {
  const index = buildShortCodeIndex(state)
  const code = (id: string): string => index.codeOf(id) ?? id
  return ['# Tender Compliance Matrix', '', '符合性为证据关联后的草稿判断，正式响应须人工复核。', '',
    '| 条款 | 原文及来源 | 响应草稿 | 状态 | 需求 | 证据 | 风险与 Action |', '|---|---|---|---|---|---|---|',
    ...items.map(t => `| ${cell(t.clauseId ?? code(t.id))} | ${cell(t.originalText)} (${cell(t.sourceDocumentId === undefined ? undefined : code(t.sourceDocumentId))} ${cell(t.sourceLocator)}) | ${cell(t.responseDraft)} | ${t.status} | ${t.requirementIds.map(id => code(id)).join('、')} | ${t.evidenceIds.map(id => code(id)).join('、') || '无'} | ${cell(t.risk)} ${cell(t.action)} |`),
    renderCodeAppendix(index),
  ].join('\n')
}
