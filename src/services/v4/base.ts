/** Shared plumbing for the V4 workbench services: lazy `v4` state, gated reviews and derived hashes. */
import type { ProjectState } from '../../domain/state.ts'
import { emptyV4 } from '../../domain/v4.ts'
import type { BoundReview, DocDraft, ModelRoute, V4State } from '../../domain/v4.ts'
import { hashOf } from '../../domain/v4-text.ts'
import { ensure } from '../../domain/common.ts'
import type { ModelStructuredOutputAdapter } from '../../adapters/contracts.ts'
import type { ServiceContext } from '../project.ts'
import { decisionBlocker } from './discovery-context.ts'

/** Live dependencies of one model-backed run, resolved by the harness per execution. */
export interface RunDeps {
  readonly model?: ModelStructuredOutputAdapter
  readonly route: ModelRoute
  readonly signal: AbortSignal
  readonly web?: WebLike
}
/** Structural subset of the DSH web runtime (search + fetch). */
export interface WebLike {
  search(input: { query: string; maxResults?: number }, signal?: AbortSignal): Promise<{ sources: { url: string; title?: string }[] }>
  fetch(input: { url: string }, signal?: AbortSignal): Promise<{ url: string; statusCode: number; truncated?: boolean; body: { content: string } }>
}

export function v4Of(state: ProjectState): V4State { return state.v4 ?? emptyV4() }

/** Zod applies defaults even inside `.partial()`; a patch must only carry the keys the caller actually sent. */
export function sentOnly<T extends object>(raw: unknown, parsed: T): Partial<T> {
  const keys = raw && typeof raw === 'object' ? Object.keys(raw) : []
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => keys.includes(k))) as Partial<T>
}

export class V4Base {
  constructor(protected readonly ctx: ServiceContext) {}
  /** Mutate the project with `s.v4` guaranteed to exist. */
  protected async mutate(projectId: string, fn: (s: ProjectState & { v4: V4State }) => void): Promise<ProjectState> {
    return this.ctx.repository.update(projectId, s => {
      s.v4 ??= emptyV4()
      const frozen = s.v4.baselines.map(b => [b.id, hashOf(b)] as const)
      fn(s as ProjectState & { v4: V4State })
      // Published baselines are immutable: none may be changed or removed by any V4 mutation.
      for (const [bid, h] of frozen) {
        const b = s.v4.baselines.find(x => x.id === bid)
        ensure(b && hashOf(b) === h, 'BASELINE_IMMUTABLE', '已发布版本不可修改或删除。')
      }
    })
  }
  protected v4(projectId: string): V4State { return v4Of(this.ctx.state(projectId)) }
  protected today(): string { return this.ctx.now().slice(0, 10) }
  /** Ask the human gate and return a review bound to `hash`; caller rechecks freshness on commit. */
  protected async bound(projectId: string, action: string, proposal: unknown, hash: string): Promise<{ revision: number; bound: BoundReview }> {
    const { revision, review } = await this.ctx.review(projectId, action, { ...proposal as object, contentHash: hash })
    return { revision, bound: { review, hash } }
  }
  protected requireModel(deps: RunDeps): ModelStructuredOutputAdapter {
    ensure(deps.model, 'MODEL_ADAPTER_UNAVAILABLE', '当前未连接可用模型，无法执行该 AI 步骤。')
    return deps.model
  }
}

/** Route state: the draft choice vs. the latest human-confirmed decision. */
export function routeState(state: ProjectState) {
  const decision = state.decisions.find(d => d.id === state.project.activeDecisionId)
  const draft = state.v4?.draftRoute?.alternativeId ?? decision?.alternativeId
  const confirmed = decision !== undefined && draft === decision.alternativeId && !decisionBlocker(state, draft)
  return { draftAlternativeId: draft, confirmedAlternativeId: decision?.alternativeId, decision, confirmed }
}

/** Everything a cost review approves: lines, active config, settings and the route they price. */
export function costHash(state: ProjectState): string {
  const v4 = v4Of(state)
  return hashOf({ lines: v4.costLines, settings: v4.costSettings, route: routeState(state).draftAlternativeId ?? null,
    config: v4.configItems.filter(c => c.status === 'active').map(c => ({ id: c.id, name: c.name, model: c.model, params: c.params, quantity: c.quantity, unit: c.unit })) })
}

/** Everything a document review approves: title, template and section text. */
export function docHash(doc: DocDraft): string {
  return hashOf({ kind: doc.kind, title: doc.title, templateId: doc.templateId ?? null,
    sections: doc.sections.map(s => ({ key: s.key, title: s.title, content: s.content })) })
}

export type ReviewStatus = 'none' | 'valid' | 'stale'
export function reviewStatus(review: BoundReview | undefined, hash: string): ReviewStatus {
  return review === undefined ? 'none' : review.hash === hash ? 'valid' : 'stale'
}

export function truncate(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…` }

export type RunKind = 'chat' | 'research' | 'deep_change' | 'section_revision' | 'discovery' | 'brainstorm' | 'document_draft'
export type RunMode = 'local' | 'web' | 'both'

/** Run bookkeeping shared by every model-backed V4 action; the actual route is recorded on the run. */
export class V4RunBase extends V4Base {
  protected async startRun(projectId: string, kind: RunKind, mode: RunMode, route: ModelRoute, questionId?: string): Promise<string> {
    const fields = this.ctx.fields(projectId)
    await this.mutate(projectId, s => {
      s.v4.runs.push({ ...fields, kind, mode, status: 'running', modelRoute: route, startedAt: fields.createdAt,
        webStatus: mode === 'local' ? 'not_requested' : 'unavailable', sourceIds: [], ...questionId === undefined ? {} : { questionId } })
    })
    return fields.id
  }
  /** Settle a run; aborted signals settle as cancelled regardless of the requested status. */
  protected async finishRun(projectId: string, runId: string, signal: AbortSignal, patch: {
    status: 'completed' | 'failed'; error?: string; note?: string; webStatus?: 'not_requested' | 'unavailable' | 'fetched' | 'partial' | 'failed'; sourceIds?: string[]
  }, extra?: (s: ProjectState & { v4: V4State }) => void): Promise<void> {
    await this.mutate(projectId, s => {
      const run = s.v4.runs.find(r => r.id === runId)
      ensure(run, 'RECORD_NOT_FOUND', '运行记录不存在。')
      const now = this.ctx.now()
      run.status = signal.aborted ? 'cancelled' : patch.status
      run.completedAt = now
      run.updatedAt = now
      if (patch.error !== undefined) run.error = patch.error.slice(0, 4000)
      else if (signal.aborted) run.error = '用户已取消。'
      if (patch.note !== undefined) run.note = patch.note.slice(0, 4000)
      if (patch.webStatus !== undefined) run.webStatus = patch.webStatus
      if (patch.sourceIds !== undefined) run.sourceIds = [...new Set([...run.sourceIds, ...patch.sourceIds])]
      if (!signal.aborted && patch.status === 'completed') extra?.(s)
    })
  }
  /** Runs left `running` by a crash or restart are settled as failed so the UI can offer a retry. */
  async recoverInterrupted(projectId: string): Promise<number> {
    const stale = this.v4(projectId).runs.filter(r => r.status === 'running').length
    if (!stale) return 0
    await this.mutate(projectId, s => {
      const now = this.ctx.now()
      for (const run of s.v4.runs) if (run.status === 'running') Object.assign(run, { status: 'failed', error: '服务重启或中断，运行未完成，可重新发起。', completedAt: now, updatedAt: now })
      for (const b of s.v4.intakeBatches) if (b.status === 'analyzing') Object.assign(b, { status: 'failed', error: '深度分析被中断，可重新发起。', updatedAt: now })
      for (const q of s.v4.questions) if (q.status === 'researching') Object.assign(q, { status: 'open', updatedAt: now })
    })
    return stale
  }
}

export function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error) }
