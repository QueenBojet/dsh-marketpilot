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

/** Parse the first complete JSON object embedded in `text`, tolerating surrounding prose. */
function embeddedJson(text: string): unknown {
  const trimmed = text.trim()
  try { return JSON.parse(trimmed) } catch { /* fall through to a brace scan */ }
  for (let start = trimmed.indexOf('{'); start >= 0; start = trimmed.indexOf('{', start + 1)) {
    let depth = 0, inString = false, escaped = false
    for (let end = start; end < trimmed.length; end++) {
      const ch = trimmed[end]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
      } else if (ch === '"') inString = true
      else if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          try { return JSON.parse(trimmed.slice(start, end + 1)) } catch { break }
        }
      }
    }
  }
  return undefined
}

/** The live SubagentResult also exposes the child's final assistant blocks. */
interface ResultWithTextOutput { readonly output?: readonly unknown[] }

/**
 * Rescue a structured answer some providers emit as plain assistant text instead of a
 * `structured_output` tool call (observed with reasoning-heavy routes that finish the
 * turn without invoking the tool). The schema stays the authoritative validator.
 */
function rescueTextOutput<T>(output: readonly unknown[] | undefined, schema: z.ZodType<T>): T | undefined {
  for (const block of output ?? []) {
    if (!block || typeof block !== 'object') continue
    const { type, text } = block as { type?: unknown; text?: unknown }
    if (type !== 'text' || typeof text !== 'string' || !text.includes('{')) continue
    const parsed = schema.safeParse(embeddedJson(text))
    if (parsed.success) return parsed.data
  }
  return undefined
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
      const parsed = request.schema.safeParse(result.structured)
      if (parsed.success) return parsed.data
      // A provider that answers with plain text instead of calling `structured_output`
      // settles with empty `structured` and stopReason 'error'; accept that answer only
      // when the embedded JSON fully satisfies the schema.
      const rescued = rescueTextOutput((result as ResultWithTextOutput).output, request.schema)
      if (rescued !== undefined) return rescued
      ensure(result.stopReason === 'completed', 'MODEL_STEP_FAILED', result.diagnostic ?? `模型步骤结束：${result.stopReason}`)
      throw new StructuredOutputError(result.structured ?? null, { cause: parsed.error })
    } finally { await run.dispose() }
  }
}
