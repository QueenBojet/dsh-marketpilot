import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { InferArgs, ParameterSchemaSpec, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { createServices } from '../services/index.ts'
import type { HarnessDocumentParser } from '../adapters/document-parser.ts'
import type {} from '../harness/service.ts'

export const projectIdParam = { type: 'string', required: true, description: 'MarketPilot Project UUID' } as const
export const recordIdParam = { type: 'string', required: true, description: 'Record UUID' } as const
export const stringIds = { type: 'array', items: { type: 'string' }, required: true } as const

/** Canonical JSON and model/UI text are projections of the same validated service result. */
export function register<const S extends ParameterSchemaSpec>(
  ctx: Context, name: string, description: string, parameters: S,
  action: (args: InferArgs<S>, services: ReturnType<typeof createServices>, signal: AbortSignal,
    parser: HarnessDocumentParser, exec: ToolRunContext) => Promise<unknown>,
) {
  ctx.tools.register(defineTool({ name, description, parameters,
    output: {
      schema: { type: 'object', additionalProperties: false, properties: {
        summary: { type: 'string', required: true }, data: { type: 'json', required: true },
      } },
      render: (_args, value) => [{ type: 'text', text: `${value.summary}\n\n${JSON.stringify(value.data, null, 2)}` }],
    },
    presentCall: () => ({ card: 'generic', title: name }),
    async execute(args, exec) {
      return ctx.marketpilot.run(exec, async (services, signal, parser) => {
        const input: Record<string, unknown> = args
        const projectId = typeof input.projectId === 'string' ? input.projectId : undefined
        let data = await action(args, services, signal, parser, exec)
        // Refresh the returned run so canonical output includes execution accounting.
        if (projectId && data && typeof data === 'object' && 'id' in data && 'steps' in data && typeof data.id === 'string') {
          data = await ctx.marketpilot.services.workflows.recordToolCall(projectId, data.id)
        } else if (projectId && data && typeof data === 'object' && 'run' in data && data.run && typeof data.run === 'object'
          && 'id' in data.run && typeof data.run.id === 'string') {
          data = { ...data, run: await ctx.marketpilot.services.workflows.recordToolCall(projectId, data.run.id) }
        }
        return { summary: description, data: z.json().parse(data) }
      })
    },
  }))
}
