import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-subagent'
import { assertObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import { z } from 'zod'
import type { ModelStructuredOutputAdapter } from './contracts.ts'
import { ensure } from '../domain/common.ts'
import { StructuredOutputError } from './structured-error.ts'

/** Project Zod constraints onto Harness's narrower schema vocabulary; Zod remains the final validator. */
export function harnessOutputSchema(schema: z.ZodType) {
  const drop = new Set(['$schema', 'minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'minItems', 'maxItems'])
  const keep = new Set(['type', 'enum', 'const', 'required', 'additionalProperties', 'description', 'title', 'default'])
  function visit(node: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      if (drop.has(key)) continue
      if (key === 'properties') out[key] = Object.fromEntries(Object.entries(z.record(z.string(), z.record(z.string(), z.unknown())).parse(value)).map(([name, child]) => [name, visit(child)]))
      else if (key === 'items') out[key] = visit(z.record(z.string(), z.unknown()).parse(value))
      else if (key === 'anyOf' || key === 'oneOf') out.oneOf = z.array(z.record(z.string(), z.unknown())).parse(value).map(visit)
      else if (keep.has(key)) out[key] = value
      else throw new Error(`模型 Schema 暂不支持关键字：${key}`)
    }
    return out
  }
  const output = visit(z.toJSONSchema(schema))
  assertObjectJsonSchema(output)
  return output
}

/** One bounded structured child uses Harness LLM routing, guarded tools and durable Session logs. */
export class HarnessStructuredModel implements ModelStructuredOutputAdapter {
  constructor(private readonly ctx: Context, private readonly parent: Agent,
    private readonly provider: string, private readonly timeoutMs: number) {}

  async generate<T>(request: { prompt: string; schema: z.ZodType<T>; signal: AbortSignal }): Promise<T> {
    const subagents = this.ctx.get('subagents')
    ensure(subagents, 'MODEL_ADAPTER_UNAVAILABLE', 'Harness subagents 服务未加载；需要结构化 spawn provider。')
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(this.timeoutMs)])
    const run = await subagents.start(this.provider, {
      parent: this.parent, signal, label: 'MarketPilot structured step',
      prompt: [{ type: 'text', text: request.prompt }], outputSchema: harnessOutputSchema(request.schema),
      toolFilter: { allow: [] },
    })
    try {
      const result = await run.result
      signal.throwIfAborted()
      ensure(result.stopReason === 'completed', 'MODEL_STEP_FAILED', result.diagnostic ?? `模型步骤结束：${result.stopReason}`)
      const parsed = request.schema.safeParse(result.structured)
      if (!parsed.success) throw new StructuredOutputError(result.structured ?? null, { cause: parsed.error })
      return parsed.data
    } finally { await run.dispose() }
  }
}
