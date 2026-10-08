import type { Context } from '@deepseek-ai/cordis'
import { register, projectIdParam } from './register.ts'
import { AlternativeWorkflow, SolutionWorkflow } from '../workflows/generation.ts'
import type { ModelStructuredOutputAdapter } from '../adapters/contracts.ts'

export function registerGenerationTools(ctx: Context) {
  register(ctx, 'marketpilot_alternative_generate', '生成 2—3 条候选技术路线和对比成果，等待人工选择。', {
    projectId: projectIdParam,
  }, async (args, s, signal, _parser, exec) => new AlternativeWorkflow(s, ctx.marketpilot.modelFor(exec),
    ctx.marketpilot.services.workflows).start(args.projectId, signal))
  register(ctx, 'marketpilot_solution_generate', '基于已确认需求与人工 Decision 生成方案；缺少 Decision 时等待人工。', {
    projectId: projectIdParam, runId: { type: 'string', description: '恢复之前 waiting_human 的方案工作流。' },
  }, async (args, s, signal, _parser, exec) => {
    // Delay model resolution until prerequisites are satisfied, including in headless calls.
    const model: ModelStructuredOutputAdapter = { generate: request => ctx.marketpilot.modelFor(exec).generate(request) }
    return new SolutionWorkflow(s, model, ctx.marketpilot.services.workflows).start(args.projectId, signal, args.runId)
  })
}
