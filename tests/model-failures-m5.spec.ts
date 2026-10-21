import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { HarnessStructuredModel } from '../src/adapters/harness-model.ts'

const parent = { id: 'isolated-test-parent' } as Agent
const schema = z.object({ answer: z.string() }).strict()
const request = (signal = new AbortController().signal) => ({ prompt: 'M5 test input', schema, signal })

describe('M5 official structured-model failure boundary (no network)', () => {
  it('reports an unavailable official subagent service before producing a result', async () => {
    const model = new HarnessStructuredModel(new Context(), parent, 'spawn', 1000)
    await expect(model.generate(request())).rejects.toMatchObject({ code: 'MODEL_ADAPTER_UNAVAILABLE' })
  })

  it('propagates a provider failure and disposes the child', async () => {
    const ctx = new Context(), dispose = vi.fn()
    ctx.provide('subagents', { start: async () => ({ result: Promise.resolve({ stopReason: 'error', diagnostic: 'M5 upstream unavailable' }), dispose }) })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 1000)
    await expect(model.generate(request())).rejects.toMatchObject({ code: 'MODEL_STEP_FAILED', message: 'M5 upstream unavailable' })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('rejects invalid completed output instead of silently accepting it', async () => {
    const ctx = new Context(), dispose = vi.fn()
    ctx.provide('subagents', { start: async () => ({ result: Promise.resolve({ stopReason: 'completed', structured: { answer: 42 } }), dispose }) })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 1000)
    await expect(model.generate(request())).rejects.toMatchObject({ name: 'StructuredOutputError', raw: { answer: 42 } })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('passes a bounded timeout to the official child and disposes after abort', async () => {
    const ctx = new Context(), dispose = vi.fn()
    ctx.provide('subagents', { start: async (_provider: string, options: { signal: AbortSignal; toolFilter: unknown }) => {
      expect(options.toolFilter).toEqual({ allow: [] })
      return { result: new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })), dispose }
    } })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 10)
    await expect(model.generate(request())).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('refuses valid late output after cancellation and still disposes', async () => {
    const ctx = new Context(), controller = new AbortController(), dispose = vi.fn()
    ctx.provide('subagents', { start: async () => {
      controller.abort(new Error('M5 user cancelled'))
      return { result: Promise.resolve({ stopReason: 'completed', structured: { answer: 'late' } }), dispose }
    } })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 1000)
    await expect(model.generate(request(controller.signal))).rejects.toThrow('M5 user cancelled')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('rescues plain-text JSON a provider emitted without calling structured_output', async () => {
    const ctx = new Context(), dispose = vi.fn()
    // Observed live: glm-5.3-flash finished its turn with the whole answer as a text
    // block; the spawn driver settles that as stopReason 'error' with empty `structured`.
    ctx.provide('subagents', { start: async () => ({ result: Promise.resolve({
      stopReason: 'error', output: [
        { type: 'reasoning', text: '内部思考…' },
        { type: 'text', text: '{"answer":"本轮先问三个问题"}' },
      ] }), dispose }) })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 1000)
    await expect(model.generate(request())).resolves.toEqual({ answer: '本轮先问三个问题' })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('rescues JSON embedded in prose or code fences', async () => {
    const ctx = new Context(), dispose = vi.fn()
    ctx.provide('subagents', { start: async () => ({ result: Promise.resolve({
      stopReason: 'error', output: [{ type: 'text', text: '以下是简报建议：\n```json\n{"answer":"wrapped {brace} in string"}\n```' }] }), dispose }) })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 1000)
    await expect(model.generate(request())).resolves.toEqual({ answer: 'wrapped {brace} in string' })
  })

  it('keeps the provider failure when the text answer does not satisfy the schema', async () => {
    const ctx = new Context(), dispose = vi.fn()
    ctx.provide('subagents', { start: async () => ({ result: Promise.resolve({
      stopReason: 'error', diagnostic: 'M5 upstream unavailable',
      output: [{ type: 'text', text: '抱歉，我无法完成该任务。' }] }), dispose }) })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 1000)
    await expect(model.generate(request())).rejects.toMatchObject({ code: 'MODEL_STEP_FAILED', message: 'M5 upstream unavailable' })
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('prefers a valid structured tool call over any text output', async () => {
    const ctx = new Context(), dispose = vi.fn()
    ctx.provide('subagents', { start: async () => ({ result: Promise.resolve({
      stopReason: 'completed', structured: { answer: 'from tool' },
      output: [{ type: 'text', text: '{"answer":"from text"}' }] }), dispose }) })
    const model = new HarnessStructuredModel(ctx, parent, 'spawn', 1000)
    await expect(model.generate(request())).resolves.toEqual({ answer: 'from tool' })
  })
})
