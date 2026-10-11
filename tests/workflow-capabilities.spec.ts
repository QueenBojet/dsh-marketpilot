import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { workflowCapabilities } from '../src/harness/capabilities.ts'

describe('V3.3 capability read projection', () => {
  it('reports missing services instead of pretending model/search are available', () => {
    const result = workflowCapabilities(new Context(), 'spawn')
    expect(result.model.available).toBe(false)
    expect(result.research.available).toBe(false)
  })
  it('labels explicitly supplied adapters as offline/test, not GLM validation', () => {
    const ctx = new Context(); ctx.provide('marketpilotModel', {})
    expect(workflowCapabilities(ctx, 'spawn').model.mode).toBe('offline')
  })
  it('requires the actual subagent and model provider registries', () => {
    const ctx = new Context()
    ctx.provide('agents', {})
    ctx.provide('subagents', { getProvider: (name: string) => name === 'spawn' ? {} : undefined })
    ctx.provide('agentDefaultModel', { currentSelection: () => ({ provider: 'zai', model: 'glm-5.3', reasoningEffort: 'max' }) })
    ctx.provide('llm', { listProviders: () => [{ id: 'zai' }] })
    expect(workflowCapabilities(ctx, 'spawn').model).toMatchObject({ available: true, mode: 'live', model: 'glm-5.3', reasoningEffort: 'max' })
    expect(workflowCapabilities(ctx, 'missing').model.available).toBe(false)
  })
  it('loaded Web/tool does not prove provider selection or perform a network request', () => {
    const ctx = new Context()
    ctx.provide('web', { search: () => { throw new Error('must not search') } })
    expect(workflowCapabilities(ctx, 'spawn').research).toMatchObject({ available: false, mode: 'unverified' })
  })
})
