import type { Context } from '@deepseek-ai/cordis'
import { expect, it, vi } from 'vitest'
import { modelCatalog } from '../src/harness/model-catalog.ts'

it('exposes DSH models and exact-route efforts without exposing provider configuration', async () => {
  const llm = {
    listProviders: () => [{ id: 'configured', name: 'Configured', apiKey: 'must-not-leak' }],
    listModels: vi.fn(async () => [{ id: 'model-a', name: 'Model A', secret: 'must-not-leak' }]),
    resolveModelInfo: vi.fn(async () => ({ reasoning: { efforts: [{ id: 'low', name: 'Low', internal: true }], defaultEffort: 'low' }, apiKey: 'must-not-leak' })),
  }
  const ctx = { get: (name: string) => name === 'llm' ? llm : { currentSelection: () => ({ provider: 'configured', model: 'model-a', apiKey: 'must-not-leak' }) } } as unknown as Context
  expect(await modelCatalog(ctx)).toEqual({ providers: [{ id: 'configured', name: 'Configured' }], initial: { provider: 'configured', model: 'model-a' } })
  expect(await modelCatalog(ctx, 'configured')).toEqual({ models: [{ id: 'model-a', name: 'Model A' }] })
  expect(await modelCatalog(ctx, 'configured', 'model-a')).toEqual({ efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' })
  expect(llm.resolveModelInfo).toHaveBeenCalledWith('configured', 'model-a')
  await expect(modelCatalog(ctx, 'unregistered')).rejects.toThrow('未在 DSH 配置')
})
