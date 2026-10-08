import type { Context } from '@deepseek-ai/cordis'
import { register, projectIdParam, stringIds } from './register.ts'
import { TenderWorkflow } from '../workflows/tender.ts'

export function registerTenderTools(ctx: Context) {
  register(ctx, 'marketpilot_tender_extract', '抽取招标条款，保留原文、定位及参数/认证等声明类别。', {
    projectId: projectIdParam, documentIds: stringIds,
  }, async (args, s, signal, _parser, exec) => new TenderWorkflow(s, ctx.marketpilot.modelFor(exec),
    ctx.marketpilot.services.workflows).extract(args.projectId, args.documentIds, signal))
  register(ctx, 'marketpilot_tender_review', '生成符合性矩阵；无已核验证据不能判为 compliant，并列出补证 Action。', {
    projectId: projectIdParam, tenderItemIds: stringIds,
  }, async (args, s, signal, _parser, exec) => new TenderWorkflow(s, ctx.marketpilot.modelFor(exec),
    ctx.marketpilot.services.workflows).review(args.projectId, args.tenderItemIds, signal))
}
