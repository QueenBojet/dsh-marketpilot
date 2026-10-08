import { Service, type Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-fs'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { HarnessProjectRepository } from '../storage/harness-repository.ts'
import { createServices } from '../services/index.ts'
import { harnessHumanGate } from '../adapters/human-gate.ts'
import { HarnessDocumentParser } from '../adapters/document-parser.ts'
import { HarnessStructuredModel } from '../adapters/harness-model.ts'
import type { ModelStructuredOutputAdapter } from '../adapters/contracts.ts'
import { ensure } from '../domain/common.ts'

export interface Config { maxDocumentBytes: number; structuredProvider: string; modelTimeoutMs: number }
export const Config: Schema<Config> = Schema.object({
  maxDocumentBytes: Schema.number().step(1).min(1).default(2 * 1024 * 1024),
  structuredProvider: Schema.string().default('spawn'), modelTimeoutMs: Schema.number().step(1).min(1).default(120000),
})

declare module '@deepseek-ai/cordis' {
  interface Context { marketpilot: MarketPilotService; marketpilotModel: ModelStructuredOutputAdapter
    marketpilotLiveModel: (exec: ToolRunContext) => ModelStructuredOutputAdapter }
}

/** Owns one project repository and drains foreground calls before closing it. */
export class MarketPilotService extends Service {
  static inject = ['storageDomain', 'fs', 'userQuestions']
  private repository!: HarnessProjectRepository
  private readonly shutdown = new AbortController()
  private readonly calls = new Set<Promise<unknown>>()
  private parser!: HarnessDocumentParser
  services!: ReturnType<typeof createServices>

  constructor(ctx: Context, private readonly config: Config) { super(ctx, 'marketpilot') }

  protected async [Service.init]() {
    this.repository = await HarnessProjectRepository.open(this.ctx.storageDomain)
    this.services = createServices(this.repository)
    this.parser = new HarnessDocumentParser(this.ctx.fs, this.config.maxDocumentBytes)
    this.ctx.inject(['subagents'], ctx => {
      ctx.provide('marketpilotLiveModel', (exec: ToolRunContext) => {
        ensure(exec.agent, 'MODEL_AGENT_REQUIRED', '实时模型 Workflow 需要当前 Harness Agent 会话。')
        return new HarnessStructuredModel(ctx, exec.agent, this.config.structuredProvider, this.config.modelTimeoutMs)
      })
    })
    this.ctx.effect(() => async () => {
      this.shutdown.abort(new Error('MarketPilot plugin unloaded'))
      await Promise.allSettled([...this.calls])
      await this.repository.close()
    })
  }

  /** Optional explicitly mounted adapter supports keyless tests/offline replay. */
  modelFor(exec: ToolRunContext): ModelStructuredOutputAdapter {
    const supplied = this.ctx.get('marketpilotModel')
    if (supplied) return supplied
    const live = this.ctx.get('marketpilotLiveModel')
    ensure(live, 'MODEL_ADAPTER_UNAVAILABLE', '请启用 Harness subagents/spawn，或明确配置离线测试 adapter。')
    return live(exec)
  }

  /** The active execution owns cancellation and human authority, never model arguments. */
  async run<T>(exec: ToolRunContext, action: (services: ReturnType<typeof createServices>, signal: AbortSignal, parser: HarnessDocumentParser) => Promise<T>): Promise<T> {
    const signal = AbortSignal.any([exec.signal, this.shutdown.signal])
    signal.throwIfAborted()
    const guarded = {
      create: async (...args: Parameters<HarnessProjectRepository['create']>) => { signal.throwIfAborted(); return this.repository.create(...args) },
      get: this.repository.get.bind(this.repository), list: this.repository.list.bind(this.repository),
      update: async (id: string, change: Parameters<HarnessProjectRepository['update']>[1]) => this.repository.update(id, draft => { signal.throwIfAborted(); change(draft) }),
      delete: async (id: string) => { signal.throwIfAborted(); return this.repository.delete(id) },
      close: async () => { throw new Error('A Tool cannot close the shared repository') },
    }
    const services = createServices(guarded, harnessHumanGate(this.ctx, exec, signal))
    const pending = action(services, signal, this.parser)
    this.calls.add(pending)
    try { return await pending }
    finally { this.calls.delete(pending) }
  }
}
