import type { Context } from '@deepseek-ai/cordis'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { register, projectIdParam, recordIdParam } from './register.ts'
import { modelRouteSchema } from '../domain/v4.ts'
import type { ModelRoute } from '../domain/v4.ts'
import type { RunDeps, WebLike } from '../services/v4/base.ts'

const inputParam = { type: 'json', required: true, description: 'Validated by the service schema' } as const
const routeParam = { type: 'json', description: 'Model route the workbench resolved for this run (override/project/default)' } as const

interface SelectionLike { provider: string; model: string; reasoningEffort?: string }

/**
 * Resolve the live model and the route actually recorded on the run. The workbench passes the
 * route it resolved; otherwise the DSH default selection is used. No model → `source: 'none'`.
 */
function runDeps(ctx: Context, exec: ToolRunContext, signal: AbortSignal, rawRoute: unknown): RunDeps {
  let model: RunDeps['model']
  try { model = ctx.marketpilot.modelFor(exec) } catch { model = undefined }
  const parsed = modelRouteSchema.safeParse(rawRoute)
  let route: ModelRoute
  if (parsed.success) route = parsed.data
  else {
    const sel = (ctx.get('agentDefaultModel') as { currentSelection(): SelectionLike } | undefined)?.currentSelection()
    route = sel ? { provider: sel.provider, model: sel.model, ...sel.reasoningEffort === undefined ? {} : { reasoningEffort: sel.reasoningEffort }, source: 'default' }
      : { provider: 'none', model: 'none', source: 'none' }
  }
  if (!model) route = { ...route, source: 'none' }
  const web = ctx.get('web') as WebLike | undefined
  return { ...model ? { model } : {}, route, signal, ...web ? { web } : {} }
}

/** V4 workbench tools: every Human Gate and every model-backed step runs as a tracked execution. */
export function registerV4Tools(ctx: Context) {
  register(ctx, 'marketpilot_v4_discovery_chat', '需求访谈：持续澄清用户需求并给出待人工保存的简报建议。', {
    projectId: projectIdParam, input: inputParam, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.discovery.chat(args.projectId, args.input, runDeps(ctx, exec, signal, args.modelRoute)))
  register(ctx, 'marketpilot_v4_discovery_confirm', '人工确认当前需求简报及验收需求。', {
    projectId: projectIdParam,
  }, async (args, s) => s.v4.discovery.confirmBrief(args.projectId))
  register(ctx, 'marketpilot_v4_support_fix', '人工固化精选支撑资料摘要，作为后续研究与方案依据。', {
    projectId: projectIdParam, noteId: recordIdParam,
  }, async (args, s) => s.v4.discovery.fixNote(args.projectId, args.noteId))
  register(ctx, 'marketpilot_v4_brainstorm', '工业可行性多路线初筛，或基于定向研究进行综合判断与二次重组。', {
    projectId: projectIdParam, phase: { type: 'string', required: true, enum: ['initial', 'synthesis'] }, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.discovery.brainstorm(args.projectId, args.phase, runDeps(ctx, exec, signal, args.modelRoute)))
  register(ctx, 'marketpilot_v4_intake_deep_analyze', '对一批新资料做模型深度变更分析（人工发起）；只保存可在原文定位的候选变更。', {
    projectId: projectIdParam, batchId: recordIdParam, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.intake.deepAnalyze(args.projectId, args.batchId, runDeps(ctx, exec, signal, args.modelRoute)))
  register(ctx, 'marketpilot_v4_intake_act', '人工处理候选变更（采纳/忽略/待澄清/转研究/无变化）；采纳只生成待确认需求。', {
    projectId: projectIdParam, input: inputParam,
  }, async (args, s) => s.v4.intake.act(args.projectId, args.input))

  register(ctx, 'marketpilot_v4_research_run', '按已确认计划执行本地/联网研究，生成报告与候选发现；联网仅在真实获取正文后标记已获取。', {
    projectId: projectIdParam, questionId: recordIdParam, mode: { type: 'string', enum: ['local', 'web', 'both'] }, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.research.research(args.projectId, args.questionId, runDeps(ctx, exec, signal, args.modelRoute), args.mode))
  register(ctx, 'marketpilot_v4_research_chat', '研究多轮对话；助手只给建议，不能确认、采纳或发布。', {
    projectId: projectIdParam, input: inputParam, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.research.chat(args.projectId, args.input, runDeps(ctx, exec, signal, args.modelRoute)))
  register(ctx, 'marketpilot_v4_research_draft_plan', '由模型起草研究计划供人工修改；不会自动保存。', {
    projectId: projectIdParam, questionId: recordIdParam, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.research.draftPlan(args.projectId, args.questionId, runDeps(ctx, exec, signal, args.modelRoute)))
  register(ctx, 'marketpilot_v4_findings_review', '人工审核发现：采纳与来源核实是两个独立判断。', {
    projectId: projectIdParam, input: inputParam,
  }, async (args, s) => s.v4.research.reviewFindings(args.projectId, args.input))

  register(ctx, 'marketpilot_v4_route_confirm', '人工确认技术路线决策（复用 V3.4 决策门）。', {
    projectId: projectIdParam, input: inputParam,
  }, async (args, s) => s.v4.route.confirmRoute(args.projectId, args.input))
  register(ctx, 'marketpilot_v4_cost_review', '成本审核：成本草稿审核 / 供应商报价已核验 / 对外报价已批准，三者独立且绑定当前成本。', {
    projectId: projectIdParam, input: inputParam,
  }, async (args, s) => s.v4.solution.reviewCost(args.projectId, args.input))

  register(ctx, 'marketpilot_v4_doc_draft_template', '根据上传的 Word 模板章节与已确认项目依据撰写整篇交付建议，等待人工采纳。', {
    projectId: projectIdParam, docId: recordIdParam, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.docs.draftFromTemplate(args.projectId, args.docId, runDeps(ctx, exec, signal, args.modelRoute)))
  register(ctx, 'marketpilot_v4_doc_revise_section', '由模型对单个章节提出修改建议；不会覆盖现有内容。', {
    projectId: projectIdParam, docId: recordIdParam, input: inputParam, modelRoute: routeParam,
  }, async (args, s, signal, _p, exec) => s.v4.docs.reviseSection(args.projectId, args.docId, args.input, runDeps(ctx, exec, signal, args.modelRoute)))
  register(ctx, 'marketpilot_v4_doc_review', '人工审核文档当前版本；之后任何编辑都会使审核失效。', {
    projectId: projectIdParam, docId: recordIdParam, note: { type: 'string' },
  }, async (args, s) => s.v4.docs.review(args.projectId, args.docId, args.note))
  register(ctx, 'marketpilot_v4_doc_mark_sent', '人工确认已对外发送（仅限已审核且已导出的当前版本）。', {
    projectId: projectIdParam, docId: recordIdParam, input: inputParam,
  }, async (args, s) => s.v4.docs.markSent(args.projectId, args.docId, args.input))

  register(ctx, 'marketpilot_v4_baseline_publish', '人工发布正式基线（技术方案基线 / 含成本完整方案包）；发布后冻结不可修改。', {
    projectId: projectIdParam, input: inputParam,
  }, async (args, s) => s.v4.baselines.publish(args.projectId, args.input))
}
