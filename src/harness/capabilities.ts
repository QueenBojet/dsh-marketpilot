import type { Context } from '@deepseek-ai/cordis'
import type { WorkflowCapabilities, WorkflowCapability } from '../domain/project-workflow.ts'

/** Capability inspection uses public registries only; no credentials or network probes. */
export function workflowCapabilities(ctx: Context, structuredProvider: string): WorkflowCapabilities {
  let model: WorkflowCapability = { available: false, mode: 'unavailable', reason: 'MODEL_ADAPTER_UNAVAILABLE：请配置 Harness subagents 和默认模型。' }
  if (ctx.get('marketpilotModel') !== undefined) {
    model = { available: true, mode: 'offline', reason: '显式注入的测试/离线 adapter；不代表真实模型。' }
  } else {
    const subagents = ctx.get('subagents') as { getProvider(name: string): unknown } | undefined
    const defaults = ctx.get('agentDefaultModel') as { currentSelection(): { provider: string; model: string; reasoningEffort?: string } } | undefined
    const llm = ctx.get('llm') as { listProviders(): { id: string }[] } | undefined
    if (ctx.get('agents') !== undefined && subagents?.getProvider(structuredProvider) !== undefined && defaults !== undefined) {
      const selection = defaults.currentSelection()
      model = llm?.listProviders().some(p => p.id === selection.provider)
        ? { available: true, mode: 'live', reason: '已注册模型路由；调用可用性仍以实际任务为准。', ...selection }
        : { available: false, mode: 'unavailable', reason: 'WORKBENCH_NO_MODEL：默认模型 Provider 未注册。' }
    }
  }
  // This frozen DSH revision has no public read-only search/fetch selection API.
  // The presence of ctx.web or a tool is insufficient proof of usable providers.
  const research: WorkflowCapability = ctx.get('web') === undefined
    ? { available: false, mode: 'unavailable', reason: 'WEB_PROVIDER_UNAVAILABLE：当前 Profile 未启用 Harness Web 服务与 search/fetch Provider；可使用本地资料研究。' }
    : { available: false, mode: 'unverified', reason: 'Harness Web 已加载，但此宿主无只读 Provider 检测接口；联网能力未验证，可使用本地资料研究。' }
  return { model, research }
}
