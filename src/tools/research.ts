import type { Context } from '@deepseek-ai/cordis'
import { register, projectIdParam, stringIds } from './register.ts'
import { ResearchWorkflow } from '../workflows/research.ts'
import { HarnessResearch } from '../adapters/harness-research.ts'

export function registerResearchTools(ctx: Context) {
  for (const kind of ['competitor', 'policy'] as const) {
    register(ctx, `marketpilot_${kind}_extract`, `从本地报告/Datasheet 提取 ${kind} 与引用证据；缺失数据保留 UNKNOWN。`, {
      projectId: projectIdParam, documentIds: stringIds,
    }, async (args, s, signal, _parser, exec) => new ResearchWorkflow(s, ctx.marketpilot.modelFor(exec),
      ctx.marketpilot.services.workflows).start(args.projectId, args.documentIds, kind, signal))
    register(ctx, `marketpilot_${kind}_list`, `列出项目 ${kind} 记录及证据关联。`, { projectId: projectIdParam },
      async (args, s) => kind === 'competitor' ? s.competitors.list(args.projectId) : s.policies.list(args.projectId))
  }
}
export const researchSearchPlugin = {
  name: 'marketpilot-research-search', inject: ['marketpilot', 'tools', 'web'],
  apply(ctx: Context) {
    register(ctx, 'marketpilot_research_search', '搜索并读取正文，保存为未核验 SOURCE 与文档；需已配置 Harness Web provider。', {
      projectId: projectIdParam, query: { type: 'string', required: true },
    }, async (args, s, signal) => s.research.importSearch(args.projectId, await new HarnessResearch(ctx.web).search(args.query, signal)))
  },
}
