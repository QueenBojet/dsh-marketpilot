import type { TenderItem } from '../domain/tender.ts'

const cell = (value: string | undefined) => (value ?? '—').replaceAll('|', '\\|').replaceAll('\n', '<br>')
export function renderCompliance(items: TenderItem[]): string {
  return ['# Tender Compliance Matrix', '', '符合性为证据关联后的草稿判断，正式响应须人工复核。', '',
    '| 条款 | 原文及来源 | 响应草稿 | 状态 | 需求 | 证据 | 风险与 Action |', '|---|---|---|---|---|---|---|',
    ...items.map(t => `| ${cell(t.clauseId ?? t.id)} | ${cell(t.originalText)} (${cell(t.sourceDocumentId)} ${cell(t.sourceLocator)}) | ${cell(t.responseDraft)} | ${t.status} | ${t.requirementIds.join('、')} | ${t.evidenceIds.join('、') || '无'} | ${cell(t.risk)} ${cell(t.action)} |`), '',
  ].join('\n')
}
