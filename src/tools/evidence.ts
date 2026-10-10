import type { Context } from '@deepseek-ai/cordis'
import { register, projectIdParam, recordIdParam, stringIds } from './register.ts'

export function registerEvidenceTools(ctx: Context) {
  register(ctx, 'marketpilot_evidence_add', '添加草稿证据；模型提供的声明不会自动成为已核验事实。', {
    projectId: projectIdParam,
    kind: { type: 'string', required: true, enum: ['FACT', 'SOURCE', 'ASSUMPTION', 'INFERENCE', 'UNKNOWN'] },
    title: { type: 'string', required: true }, statement: { type: 'string', required: true },
    sourceType: { type: 'string', required: true, enum: ['customer', 'internal', 'official', 'vendor', 'standard', 'paper', 'web', 'model', 'human', 'unknown'] },
    sourceName: { type: 'string' }, sourceDocumentId: { type: 'string' }, sourceLocator: { type: 'string' },
    sourceUrl: { type: 'string' }, confidence: { type: 'number' }, supportingEvidenceIds: { type: 'array', items: { type: 'string' } },
  }, async ({ projectId, ...data }, s) => s.evidence.add(projectId, data))
  register(ctx, 'marketpilot_evidence_list', '列出项目 Evidence Ledger，保留 UNKNOWN 和审核状态。', {
    projectId: projectIdParam,
  }, async (args, s) => s.evidence.list(args.projectId))
  register(ctx, 'marketpilot_evidence_verify', '以人工审核或明确的新证据核验声明，不自动填补 UNKNOWN。targetKind 可选 FACT/SOURCE/ASSUMPTION/INFERENCE（升级分类）、UNKNOWN（人工确认保持未知）或 REJECT（人工驳回）。', {
    projectId: projectIdParam, evidenceId: recordIdParam,
    method: { type: 'string', required: true, enum: ['human', 'new_evidence'] },
    targetKind: { type: 'string', required: true, enum: ['FACT', 'SOURCE', 'ASSUMPTION', 'INFERENCE', 'UNKNOWN', 'REJECT'] },
    statement: { type: 'string', required: true }, supportingEvidenceIds: stringIds,
  }, async ({ projectId, evidenceId, ...data }, s) => s.evidence.verify(projectId, evidenceId, data))
  register(ctx, 'marketpilot_evidence_link', '将证据关联到同一项目的需求、竞品或技术路线。', {
    projectId: projectIdParam, evidenceId: recordIdParam,
    relatedRequirementIds: stringIds, relatedCompetitorIds: stringIds, relatedAlternativeIds: stringIds,
  }, async ({ projectId, evidenceId, ...data }, s) => s.evidence.link(projectId, evidenceId, data))
}
