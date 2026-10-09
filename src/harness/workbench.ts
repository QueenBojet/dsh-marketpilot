import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolCallId } from '@deepseek-ai/dsh-llm'
import type { AskUserQuestionAnswer, AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
import { ensure } from '../domain/common.ts'

/**
 * The agents-service subset the workbench uses. Structural on purpose: the
 * real registry comes from `ctx.get('agents')` and is absent in headless
 * compositions (tests, demo), where workbench runs stay agentless and the
 * offline model fixture answers model steps without a spawn parent.
 */
interface AgentsLike {
  create(options: {
    sessionId: string
    meta?: { cwd?: string }
    agentOptions?: { provider?: string; model?: string; reasoningEffort?: string; maxTokens?: number }
    signal?: AbortSignal
    setup?: (agentCtx: Context) => void
  }): Promise<{ agent: Agent; dispose(): Promise<void> }>
}

/** The default-model service subset: the system prompt's persona prefix needs a model route before the first request. */
interface AgentDefaultModelLike {
  currentSelection(): { provider: string; model: string; reasoningEffort?: string }
}

/** One question a workbench execution is currently blocked on. */
export interface WorkbenchQuestion {
  readonly header: string
  readonly question: string
  readonly detail: string
  readonly options: readonly string[]
}

/** Public projection of one click-driven tool execution. */
export interface WorkbenchExecutionView {
  readonly callId: string
  readonly tool: string
  readonly status: 'running' | 'waiting_human' | 'completed' | 'failed' | 'cancelled'
  readonly startedAt: string
  readonly projectId?: string
  readonly runId?: string
  readonly question: WorkbenchQuestion | null
  readonly value?: unknown
  readonly error?: string
}

interface WorkbenchExecution {
  readonly callId: ToolCallId
  readonly tool: string
  readonly startedAt: string
  readonly projectId?: string
  runId?: string
  readonly controller: AbortController
  status: WorkbenchExecutionView['status']
  question: WorkbenchQuestion | null
  value?: unknown
  error?: string
  settle?: ((answer: { selected: string; custom?: string }) => void) | undefined
  rejectQuestion?: ((reason: unknown) => void) | undefined
}

/** Extract a workflow-run id from a completed tool value ({summary,data} envelope or bare run). */
function runIdOf(tool: string, value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const envelope = value as { data?: unknown }
  const data = typeof envelope.data === 'object' && envelope.data !== null ? envelope.data : undefined
  const candidates = [data, value]
  for (const node of candidates) {
    if (typeof node !== 'object' || node === null) continue
    const record = node as { id?: unknown; run?: { id?: unknown } }
    if (typeof record.id === 'string' && typeof (node as { steps?: unknown }).steps === 'object') return record.id
    if (typeof record.run === 'object' && record.run !== null && typeof record.run.id === 'string') return record.run.id
  }
  void tool
  return undefined
}

const MAX_RETAINED_EXECUTIONS = 50

/** Drives click-driven Tool executions for the workbench routes. */
export class WorkbenchManager {
  private readonly executions = new Map<string, WorkbenchExecution>()
  private readonly globalOff: () => void

  constructor(private readonly ctx: Context) {
    // Agentless executions ask through the root user-questions waterfall; a
    // global listener claims exactly the calls this manager started (keyed by
    // the gate's `wait.callId`) and delegates every other request untouched.
    this.globalOff = ctx.on('user-questions/request', async (request, next) => {
      const callId = request.wait?.callId
      const record = callId === undefined ? undefined : this.executions.get(callId)
      if (record === undefined) return next()
      return this.ask(record, request)
    })
    ctx.effect(() => () => {
      this.globalOff()
      for (const record of this.executions.values()) {
        record.controller.abort(new Error('MarketPilot workbench 已随插件卸载'))
        record.rejectQuestion?.(new Error('MarketPilot workbench 已随插件卸载'))
      }
      this.executions.clear()
    })
  }

  /** Tool names this manager may execute, resolved from the live registry. */
  allowedTools(): readonly string[] {
    return this.ctx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('marketpilot_'))
  }

  /** Whether this manager started (and still tracks) the given execution. */
  owns(callId: string): boolean {
    return this.executions.has(callId)
  }

  /**
   * Start one guarded tool execution and return immediately; poll
   * {@link view} for the question, the result, or the failure.
   * @param name - a `marketpilot_*` tool name registered on this host.
   * @param args - lossless-JSON arguments for that tool.
   * @returns the execution identity used for polling and answering.
   */
  async start(name: string, args: unknown): Promise<{ callId: string }> {
    ensure(this.allowedTools().includes(name), 'WORKBENCH_TOOL_FORBIDDEN', `工作台不允许执行工具：${name}`)
    const services = this.ctx.get('marketpilot')
    ensure(services !== undefined, 'WORKBENCH_NOT_READY', 'MarketPilot 服务尚未就绪。')
    const callId = randomUUID() as ToolCallId
    const projectId = typeof (args as { projectId?: unknown } | null)?.projectId === 'string'
      ? (args as { projectId: string }).projectId
      : undefined
    const record: WorkbenchExecution = {
      callId, tool: name, startedAt: new Date().toISOString(),
      ...projectId === undefined ? {} : { projectId },
      controller: new AbortController(), status: 'running', question: null,
    }
    this.retain(record)
    // A live spawn parent exists only where the agent loop runs; without it
    // model tools fail inside the adapter while confirm tools still work.
    const agents = this.ctx.get('agents') as AgentsLike | undefined
    let handle: { agent: Agent; dispose(): Promise<void> } | undefined
    if (agents !== undefined) {
      // A root agent with no route fails before its first request (the persona
      // prefix cannot render {{model}}), so the default selection is applied
      // here exactly as the headless bundle does for its own agents.
      const defaultModel = this.ctx.get('agentDefaultModel') as AgentDefaultModelLike | undefined
      ensure(defaultModel !== undefined, 'WORKBENCH_NO_MODEL', '工作台需要默认模型配置（agentDefaultModel）才能运行模型步骤。')
      const selection = defaultModel.currentSelection()
      handle = await agents.create({
        sessionId: randomUUID(),
        meta: await this.sessionMeta(),
        agentOptions: {
          provider: selection.provider, model: selection.model,
          ...selection.reasoningEffort === undefined ? {} : { reasoningEffort: selection.reasoningEffort },
        },
        signal: record.controller.signal,
        // Scoped to the workbench agent: questions raised by tools executing
        // with this agent reach this listener and nobody else.
        setup: agentCtx => { agentCtx.on('user-questions/request', async request => this.ask(record, request)) },
      })
    }
    void this.drive(record, handle, name, args)
    return { callId }
  }

  /** Stamp the workspace cwd on the workbench agent's session when the fs service can resolve it. */
  private async sessionMeta(): Promise<{ cwd?: string }> {
    try {
      const fs = this.ctx.get('fs') as { resolve(path: string): Promise<unknown>; processPath(target: unknown): string } | undefined
      if (fs === undefined) return {}
      return { cwd: fs.processPath(await fs.resolve('.')) }
    } catch {
      return {}
    }
  }

  private async drive(
    record: WorkbenchExecution,
    handle: { agent: Agent; dispose(): Promise<void> } | undefined,
    name: string,
    args: unknown,
  ): Promise<void> {
    try {
      const result = await this.ctx.tools.execute({
        callId: record.callId, name, arguments: args, signal: record.controller.signal,
        ...handle === undefined ? {} : { agent: handle.agent },
      })
      record.question = null
      if (result.isError) {
        record.status = 'failed'
        record.error = result.content.map(block => block.type === 'text' ? block.text : '').join('').trim() || `工具 ${name} 执行失败。`
      } else {
        record.status = 'completed'
        record.value = result.value
        const runId = runIdOf(name, result.value)
        if (runId !== undefined) record.runId = runId
      }
    } catch (error) {
      record.question = null
      record.status = record.controller.signal.aborted ? 'cancelled' : 'failed'
      record.error = error instanceof Error ? error.message : String(error)
    } finally {
      await handle?.dispose().catch(() => {})
    }
  }

  /** Park one execution on its human question until answered or aborted. */
  private ask(record: WorkbenchExecution, request: AskUserQuestionRequest): Promise<AskUserQuestionAnswer> {
    const first = request.questions[0]
    ensure(first !== undefined, 'WORKBENCH_EMPTY_QUESTION', '人工审核请求没有携带问题。')
    record.status = 'waiting_human'
    record.question = {
      header: first.header ?? 'MarketPilot 人工审核',
      question: first.question,
      detail: first.detail ?? '',
      options: (first.options ?? []).map((option: { label: string }) => option.label),
    }
    return new Promise<AskUserQuestionAnswer>((resolve, reject) => {
      record.settle = answer => {
        record.question = null
        record.status = 'running'
        record.settle = undefined
        record.rejectQuestion = undefined
        resolve({ answers: [{ id: first.id, selected: [answer.selected], ...answer.custom === undefined ? {} : { custom: answer.custom } }] })
      }
      record.rejectQuestion = reason => {
        record.question = null
        record.settle = undefined
        record.rejectQuestion = undefined
        reject(reason instanceof Error ? reason : new Error(String(reason)))
      }
      request.signal?.addEventListener('abort', () => record.rejectQuestion?.(request.signal?.reason), { once: true })
    })
  }

  /** Answer the pending human question of one execution (a real user gesture). */
  answer(callId: string, selected: string, custom?: string): void {
    const record = this.executions.get(callId)
    ensure(record !== undefined, 'WORKBENCH_EXECUTION_NOT_FOUND', '工作台执行不存在。')
    ensure(record.settle !== undefined, 'WORKBENCH_NOT_WAITING', '该执行当前没有等待人工审核。')
    ensure(record.question?.options.includes(selected) ?? false, 'WORKBENCH_BAD_ANSWER', `无效的审核选项：${selected}`)
    record.settle({ selected, ...custom === undefined ? {} : { custom } })
  }

  /** Abort one execution; its record settles as cancelled. */
  cancel(callId: string): void {
    const record = this.executions.get(callId)
    ensure(record !== undefined, 'WORKBENCH_EXECUTION_NOT_FOUND', '工作台执行不存在。')
    record.controller.abort(new Error('用户在 MarketPilot 工作台取消了该执行。'))
    record.rejectQuestion?.(record.controller.signal.reason)
  }

  /** Public projection for polling, or undefined when unknown. */
  view(callId: string): WorkbenchExecutionView | undefined {
    const record = this.executions.get(callId)
    if (record === undefined) return undefined
    return {
      callId: record.callId, tool: record.tool, status: record.status, startedAt: record.startedAt,
      ...record.projectId === undefined ? {} : { projectId: record.projectId },
      ...record.runId === undefined ? {} : { runId: record.runId },
      question: record.question,
      ...record.value === undefined ? {} : { value: record.value },
      ...record.error === undefined ? {} : { error: record.error },
    }
  }

  /** Execution index: active first (oldest first), then recently settled, optionally per project. */
  list(projectId?: string): WorkbenchExecutionView[] {
    const rows = [...this.executions.values()]
      .filter(record => projectId === undefined || record.projectId === projectId)
      .map(record => this.view(record.callId))
      .filter((view): view is WorkbenchExecutionView => view !== undefined)
    const rank = (view: WorkbenchExecutionView): number =>
      view.status === 'running' || view.status === 'waiting_human' ? 0 : 1
    return rows
      .map((view, index) => ({ view, index }))
      .sort((left, right) => rank(left.view) - rank(right.view)
        || left.view.startedAt.localeCompare(right.view.startedAt)
        || left.index - right.index)
      .map(entry => entry.view)
  }

  /** Keep a bounded tail of settled executions for late polling. */
  private retain(record: WorkbenchExecution): void {
    this.executions.set(record.callId, record)
    if (this.executions.size <= MAX_RETAINED_EXECUTIONS) return
    for (const [key, candidate] of this.executions) {
      if (candidate.status === 'running' || candidate.status === 'waiting_human') continue
      this.executions.delete(key)
      if (this.executions.size <= MAX_RETAINED_EXECUTIONS) return
    }
  }
}
