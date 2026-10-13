import type { Context } from '@deepseek-ai/cordis'
import { ensure } from '../domain/common.ts'

interface CatalogRuntime {
  listProviders(): { id: string; name?: string }[]
  listModels(provider: string): Promise<{ id: string; name: string }[]>
  resolveModelInfo?(provider: string, model: string): Promise<{ reasoning?: { efforts: { id: string; name: string }[]; defaultEffort?: string } }>
}

/** Read only public catalog metadata from the host; never serialize adapter configuration. */
export async function modelCatalog(ctx: Context, provider?: string, model?: string) {
  const llm = ctx.get('llm') as CatalogRuntime | undefined
  const providers = llm?.listProviders().map(p => ({ id: p.id, name: p.name || p.id })) ?? []
  const initial = (ctx.get('agentDefaultModel') as { currentSelection(): { provider: string; model: string; reasoningEffort?: string } } | undefined)?.currentSelection()
  if (!provider) return { providers, initial: initial ? { provider: initial.provider, model: initial.model, reasoningEffort: initial.reasoningEffort } : null }
  ensure(llm && providers.some(p => p.id === provider), 'WORKBENCH_PROVIDER_UNAVAILABLE', '该供应商未在 DSH 配置。')
  if (!model) return { models: (await llm.listModels(provider)).map(m => ({ id: m.id, name: m.name })) }
  ensure(model.length <= 128, 'WORKBENCH_INVALID_MODEL', '模型名称过长。')
  const info = await llm.resolveModelInfo?.(provider, model)
  return { efforts: info?.reasoning?.efforts.map(e => ({ id: e.id, name: e.name })) ?? [], defaultEffort: info?.reasoning?.defaultEffort ?? null }
}
