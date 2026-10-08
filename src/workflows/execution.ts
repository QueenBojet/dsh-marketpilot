import { z } from 'zod'
import type { ModelStructuredOutputAdapter } from '../adapters/contracts.ts'
import type { WorkflowService } from '../services/workflow.ts'
import { StructuredOutputError } from '../adapters/structured-error.ts'
import { loadPrompt, renderPrompt } from '../prompts/template.ts'
import type { PromptName } from '../prompts/template.ts'

/** Shared execution accounting and bounded validation retry; never owns storage or provider SDKs. */
export class WorkflowExecution {
  constructor(readonly projectId: string, readonly runId: string, readonly lifecycle: WorkflowService,
    readonly model: ModelStructuredOutputAdapter, readonly signal: AbortSignal) {}
  async step(step: string) {
    this.signal.throwIfAborted()
    await this.lifecycle.step(this.projectId, this.runId, { step })
  }
  async generate<T>(name: PromptName, schema: z.ZodType<T>, variables: Record<string, unknown>) {
    const values = Object.fromEntries(Object.entries(variables).map(([key, value]) => [key, JSON.stringify(value)]))
    const prompt = renderPrompt(await loadPrompt(name), { ...values, schema: JSON.stringify(z.toJSONSchema(schema)) })
    for (let attempt = 0; ; attempt++) {
      this.signal.throwIfAborted()
      await this.lifecycle.step(this.projectId, this.runId, { step: name, modelCalls: 1 })
      try {
        const result = schema.parse(await this.model.generate({ prompt, schema, signal: this.signal }))
        this.signal.throwIfAborted()
        return result
      } catch (error) {
        if (attempt === 0 && (error instanceof z.ZodError || error instanceof StructuredOutputError)) continue
        throw error
      }
    }
  }
  async failed(error: unknown): Promise<never> {
    const run = this.lifecycle.get(this.projectId, this.runId)
    if (['running', 'waiting_human'].includes(run.status)) {
      if (this.signal.aborted) await this.lifecycle.cancel(this.projectId, this.runId)
      else if (run.status === 'running') await this.lifecycle.fail(this.projectId, this.runId, error instanceof Error ? error.message : String(error))
    }
    throw error
  }
}
