import { basename } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { register, projectIdParam, stringIds } from './register.ts'
import { RequirementAnalysisWorkflow } from '../workflows/requirement-analysis.ts'
import { ensure, MarketPilotError } from '../domain/common.ts'

export function registerProjectTools(ctx: Context) {
  register(ctx, 'marketpilot_project_create', '创建 MarketPilot 项目。', {
    name: { type: 'string', required: true }, description: { type: 'string' },
    customer: { type: 'string' }, industry: { type: 'string' }, scenario: { type: 'string' },
  }, async (args, s) => s.projects.create(args))
  register(ctx, 'marketpilot_project_get', '读取项目及需求、证据和人工决策上下文。', {
    projectId: projectIdParam,
  }, async (args, s) => {
    const { selectedDecision, ...context } = s.projects.getContext(args.projectId)
    return { ...context, selectedDecision: selectedDecision ?? null }
  })
  register(ctx, 'marketpilot_document_import', '导入完整的 UTF-8 Markdown/TXT 文档，保留来源与校验和。', {
    projectId: projectIdParam, path: { type: 'string', required: true, description: 'Absolute path to .md or .txt' },
    kind: { type: 'string', required: true, enum: ['customer_requirement', 'tender', 'meeting_note', 'internal_reference', 'competitor_datasheet', 'standard', 'report', 'other'] },
  }, async (args, s, signal, parser) => {
    const result = await parser.parse({ path: args.path, signal })
    return s.documents.add(args.projectId, { name: basename(args.path), kind: args.kind, originalPath: args.path,
      textContent: result.text, mimeType: result.mimeType, checksum: result.checksum })
  })
  register(ctx, 'marketpilot_requirement_list', '列出项目的需求与待确认状态。', {
    projectId: projectIdParam,
  }, async (args, s) => s.requirements.list(args.projectId))
  register(ctx, 'marketpilot_requirement_extract', '分析选定文档，保存需求与 UNKNOWN，并进入人工审核等待状态。', {
    projectId: projectIdParam, documentIds: stringIds,
  }, async (args, s, signal, _parser, exec) => new RequirementAnalysisWorkflow(
    s, ctx.marketpilot.modelFor(exec), ctx.marketpilot.services.workflows,
  ).start(args.projectId, args.documentIds, signal))
  register(ctx, 'marketpilot_requirement_confirm', '提交需求给真实用户审核；只有明确人工确认后才更新状态。', {
    projectId: projectIdParam, requirementIds: stringIds, runId: { type: 'string', description: '需求提取返回的 WorkflowRun ID；提供后在本批审核完成时生成 Baseline。' },
  }, async (args, s) => {
    if (args.runId) {
      const run = s.workflows.get(args.projectId, args.runId)
      ensure(run.type === 'requirement_analysis' && run.status === 'waiting_human', 'INVALID_RUN', '指定需求工作流并未等待审核。')
      const batch = run.output?.requirementIds
      ensure(Array.isArray(batch) && args.requirementIds.every(id => batch.includes(id)), 'INVALID_REVIEW_BATCH', '只能确认本批工作流产生的需求。')
    }
    const requirements = await s.requirements.confirm(args.projectId, args.requirementIds)
    if (!args.runId) return { requirements }
    try { return { requirements, run: await s.requirements.finalizeAnalysis(args.projectId, args.runId) } }
    catch (error) {
      if (error instanceof MarketPilotError && error.code === 'WAITING_HUMAN') return { requirements, run: s.workflows.get(args.projectId, args.runId), nextAction: error.message }
      throw error
    }
  })
  register(ctx, 'marketpilot_decision_confirm', '向真实用户提交候选路线，明确确认后生成 Decision。', {
    projectId: projectIdParam, alternativeId: { type: 'string', required: true }, decision: { type: 'string', required: true },
    rationale: { type: 'string', required: true }, evidenceIds: stringIds, requirementIds: stringIds,
  }, async ({ projectId, ...data }, s) => s.decisions.confirm(projectId, data))
}
