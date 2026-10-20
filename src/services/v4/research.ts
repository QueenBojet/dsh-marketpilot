/** 智能研究: questions & plans, multi-turn chat, local/web research runs with honest source status, findings. */
import { z } from 'zod'
import { ensure, id, ids, text } from '../../domain/common.ts'
import { sourceRefSchema } from '../../domain/v4.ts'
import type { Finding } from '../../domain/v4.ts'
import { hashOf, sha256 } from '../../domain/v4-text.ts'
import type { ProjectState } from '../../domain/state.ts'
import { V4RunBase, errorText, sentOnly, truncate } from './base.ts'
import type { RunDeps, RunMode } from './base.ts'
import { researchSkill } from './research-skill.ts'
import { briefConfirmed, fixedNotes, latestExploration, supportContext } from './discovery-context.ts'

const optText = (max: number) => z.string().trim().max(max).optional()
export const questionInput = z.strictObject({
  title: text.max(200), description: optText(4000), requirementIds: ids.default([]), documentIds: ids.default([]),
  alternativeIds: ids.default([]), direction: optText(4000), decisionUse: optText(4000),
})
export const questionPatch = questionInput.partial().extend({ status: z.enum(['open', 'answered', 'closed']).optional(), report: z.string().max(200_000).optional() })
export const planInput = z.strictObject({
  steps: z.array(text.max(400)).min(1).max(12), mode: z.enum(['local', 'web', 'both']), queries: z.array(text.max(200)).max(6),
})
export const chatInput = z.strictObject({ thread: z.string().trim().min(1).max(80), questionId: id.optional(), content: text.max(8000) })
export const findingInput = z.strictObject({
  questionId: id.optional(), statement: text.max(2000), conditions: optText(2000), origin: z.enum(['ai', 'manual']).default('manual'),
  source: sourceRefSchema, requirementIds: ids.default([]), alternativeIds: ids.default([]), decisionIds: ids.default([]), configItemIds: ids.default([]),
})
export const findingPatch = z.strictObject({
  statement: text.max(2000).optional(), conditions: optText(2000), requirementIds: ids.optional(), alternativeIds: ids.optional(),
  decisionIds: ids.optional(), configItemIds: ids.optional(), by: text.max(80).default('用户'),
})
export const findingReviewInput = z.strictObject({
  findingIds: ids.min(1).max(50), kind: z.enum(['adoption', 'verification']),
  value: z.enum(['adopted', 'rejected', 'verified', 'disputed']), note: optText(1000),
})

const planOutput = z.strictObject({ steps: z.array(text.max(400)).min(1).max(8), queries: z.array(text.max(200)).max(4) })
const reportOutput = z.strictObject({
  report: text.max(60_000),
  findings: z.array(z.strictObject({
    statement: text.max(1000), conditions: z.string().max(1000).optional(),
    sourceKind: z.enum(['document', 'web', 'none']), sourceIndex: z.number().int().nonnegative().optional(), quote: z.string().max(1000).optional(),
  })).max(12),
})
const chatOutput = z.strictObject({ answer: text.max(20_000) })

const squash = (value: string) => value.replace(/\s+/g, '')
function researchInputHash(state: ProjectState, questionId: string) {
  const q = state.v4?.questions.find(q => q.id === questionId)
  return hashOf({ support: supportContext(state), initial: latestExploration(state, 'initial'),
    question: q && { title: q.title, description: q.description, direction: q.direction, decisionUse: q.decisionUse,
      alternativeIds: q.alternativeIds, documentIds: q.documentIds, requirementIds: q.requirementIds, plan: q.plan } })
}
/** Strip markup so a stored snapshot is readable text, never executable HTML. */
export function htmlToText(body: string): string {
  return body.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}

interface Material { kind: 'document' | 'web'; refId: string; name: string; url?: string; text: string }

export class ResearchV4Service extends V4RunBase {
  async addQuestion(projectId: string, input: unknown) {
    const data = questionInput.parse(input)
    this.checkDirection(projectId, data)
    const row = { ...this.ctx.fields(projectId), ...data, status: 'open' as const }
    await this.mutate(projectId, s => { s.v4.questions.push(row) })
    return row
  }
  async updateQuestion(projectId: string, questionId: string, input: unknown) {
    const patch = sentOnly(input, questionPatch.parse(input))
    this.checkDirection(projectId, { ...this.question(projectId, questionId), ...patch }, questionId)
    await this.mutate(projectId, s => {
      const q = s.v4.questions.find(x => x.id === questionId)
      ensure(q, 'RECORD_NOT_FOUND', '研究问题不存在。')
      ensure(q.status !== 'researching', 'RUN_IN_PROGRESS', '研究进行中，请稍后修改。')
      if (['title', 'description', 'direction', 'decisionUse', 'alternativeIds', 'documentIds', 'requirementIds'].some(k =>
        k in patch && JSON.stringify(patch[k as keyof typeof patch]) !== JSON.stringify(q[k as keyof typeof q]))) {
        delete q.plan
        q.status = q.report ? 'needs_review' : 'open'
        q.reviewReason = '研究范围已变化，请重新确认计划并研究；旧报告保留供追溯。'
      }
      Object.assign(q, patch, { updatedAt: this.ctx.now() })
    })
    return this.question(projectId, questionId)
  }
  private checkDirection(projectId: string, q: { direction?: string | undefined; decisionUse?: string | undefined; alternativeIds?: string[] | undefined }, except?: string) {
    const s = this.ctx.state(projectId)
    if (!s.v4?.discovery) return
    ensure(briefConfirmed(s) && latestExploration(s, 'initial'), 'INITIAL_REQUIRED', '请先确认需求并完成当前多路线初筛。')
    ensure(q.direction?.trim() && q.decisionUse?.trim() && q.alternativeIds?.length, 'DIRECTION_REQUIRED', '每项研究需指定候选路线、具体方向及对路线决策的用途。')
    const initial = latestExploration(s, 'initial')!
    ensure(q.alternativeIds!.every(a => initial.routes.some(r => r.alternativeId === a)), 'ROUTE_SCOPE_CHANGED', '研究关联路线不属于当前初筛，请更新研究范围和计划。')
    ensure(!s.v4.questions.some(x => x.id !== except && x.status !== 'closed' && x.direction?.trim() === q.direction!.trim()), 'DUPLICATE_DIRECTION', '已有同方向研究，请编辑原问题或使用不同的具体方向。')
  }
  private question(projectId: string, questionId: string) {
    const q = this.v4(projectId).questions.find(x => x.id === questionId)
    ensure(q, 'RECORD_NOT_FOUND', '研究问题不存在。')
    return q
  }
  /** The plan is a human-reviewed artefact: saving it records who confirmed it. */
  async savePlan(projectId: string, questionId: string, input: unknown, by: string) {
    const plan = planInput.parse(input)
    await this.mutate(projectId, s => {
      const q = s.v4.questions.find(x => x.id === questionId)
      ensure(q, 'RECORD_NOT_FOUND', '研究问题不存在。')
      ensure(q.status !== 'researching', 'RUN_IN_PROGRESS', '研究进行中，请稍后修改计划。')
      q.plan = { ...plan, confirmedBy: truncate(by || '用户', 80), confirmedAt: this.ctx.now() }
      if (q.report) { q.status = 'needs_review'; q.reviewReason = '研究计划已更新，请重新执行。' }
      q.updatedAt = this.ctx.now()
    })
    return this.question(projectId, questionId)
  }
  /** Model-drafted plan, returned for human review only (not saved). */
  async draftPlan(projectId: string, questionId: string, deps: RunDeps) {
    const model = this.requireModel(deps)
    const q = this.question(projectId, questionId)
    const state = this.ctx.state(projectId)
    const skill = await researchSkill()
    const prompt = [skill.text, '为以下工程技术问题拟定简明研究计划（3-6 步）和至多 4 条联网检索关键词。仅输出 JSON。',
      `问题：${q.title}`, q.description ?? '', `具体方向：${q.direction ?? q.title}；决策用途：${q.decisionUse ?? '技术比较'}`,
      `候选路线：${state.alternatives.filter(a => q.alternativeIds?.includes(a.id)).map(a => `${a.name}：${a.summary}`).join('\n')}`,
      supportContext(state), '相关需求：', ...state.requirements.filter(r => q.requirementIds.includes(r.id)).map(r => `- ${r.normalizedText}`)].join('\n')
    return model.generate({ prompt, schema: planOutput, signal: deps.signal })
  }

  private materials(projectId: string, questionId?: string): Material[] {
    const state = this.ctx.state(projectId)
    const q = questionId ? this.question(projectId, questionId) : undefined
    const docs = q?.documentIds.length ? state.documents.filter(d => q.documentIds.includes(d.id)) : state.documents
    const out: Material[] = state.v4?.discovery
      ? fixedNotes(state).filter(n => n.documentId && (!q?.documentIds.length || q.documentIds.includes(n.documentId)))
        .map(n => ({ kind: 'document', refId: n.documentId!, name: n.title, text: `${n.content}\n用途：${n.relevance}\n原文摘录：${n.quote ?? ''}` }))
      : docs.map(d => ({ kind: 'document', refId: d.id, name: d.name, text: d.textContent }))
    for (const src of state.v4?.sources ?? []) if (src.status === 'fetched' && src.snapshot && (!questionId || src.questionId === questionId))
      out.push({ kind: 'web', refId: src.id, name: src.title, url: src.url, text: src.snapshot })
    return out
  }

  /**
   * Fetch every search hit individually. A source is `fetched` only when a non-empty body
   * really came back; every failure is recorded as `failed` with its reason.
   */
  private async webPass(projectId: string, runId: string, questionId: string, queries: readonly string[], deps: RunDeps) {
    const web = deps.web
    if (!web) return { status: 'unavailable' as const, sourceIds: [] as string[], note: '联网能力不可用（DSH 未提供 web 运行时），本次仅使用本地资料。' }
    const sourceIds: string[] = []
    let fetched = 0, failed = 0
    const searchErrors: string[] = []
    const seen = new Set<string>()
    for (const query of queries.slice(0, 4)) {
      let hits: { url: string; title?: string }[] = []
      try { hits = (await web.search({ query, maxResults: 5 }, deps.signal)).sources.slice(0, 3) }
      catch (e) { searchErrors.push(`${query}：${truncate(errorText(e), 200)}`); continue }
      for (const hit of hits) {
        if (seen.has(hit.url) || deps.signal.aborted) continue
        seen.add(hit.url)
        const fields = this.ctx.fields(projectId)
        let row
        try {
          const res = await web.fetch({ url: hit.url }, deps.signal)
          const body = htmlToText(res.body.content)
          ensure(res.statusCode >= 200 && res.statusCode < 300, 'FETCH_FAILED', `HTTP ${res.statusCode}`)
          ensure(body.length >= 40, 'FETCH_FAILED', '正文为空或过短')
          const snapshot = truncate(body, 100_000)
          row = { ...fields, questionId, runId, url: hit.url, title: truncate(hit.title?.trim() || hit.url, 300), status: 'fetched' as const,
            fetchedAt: fields.createdAt, contentHash: sha256(snapshot), snapshot }
          fetched++
        } catch (e) {
          row = { ...fields, questionId, runId, url: hit.url, title: truncate(hit.title?.trim() || hit.url, 300), status: 'failed' as const,
            fetchedAt: fields.createdAt, error: truncate(errorText(e), 1000) }
          failed++
        }
        // Validate the URL shape the schema expects; skip malformed hits instead of failing the run.
        if (!z.url().safeParse(row.url).success) continue
        await this.mutate(projectId, s => { s.v4.sources.push(row) })
        sourceIds.push(row.id)
      }
    }
    const status = fetched && !failed ? 'fetched' as const : fetched ? 'partial' as const : 'failed' as const
    const note = `联网检索：获取正文 ${fetched} 个，失败 ${failed} 个${searchErrors.length ? `；检索失败 ${searchErrors.join('；')}` : ''}。`
    return { status, sourceIds, note }
  }

  /**
   * Multi-turn chat. The assistant only answers; it cannot confirm, adopt or publish anything —
   * those stay behind the Human Gate. Both turns are persisted with the actual model route.
   */
  async chat(projectId: string, input: unknown, deps: RunDeps) {
    const skill = await researchSkill()
    const data = chatInput.parse(input)
    const model = this.requireModel(deps)
    if (data.questionId) this.question(projectId, data.questionId)
    const runId = await this.startRun(projectId, 'chat', 'local', deps.route, data.questionId)
    const user = { ...this.ctx.fields(projectId), thread: data.thread, role: 'user' as const, content: data.content, runId, status: 'done' as const }
    await this.mutate(projectId, s => { s.v4.messages.push(user) })
    const state = this.ctx.state(projectId)
    const history = (state.v4?.messages ?? []).filter(m => m.thread === data.thread && m.status === 'done').slice(-12)
    const q = data.questionId ? this.question(projectId, data.questionId) : undefined
    const materials = this.materials(projectId, data.questionId)
    const prompt = [
      '你是工程方案研究助手。基于给定资料回答；资料没有的内容要明确说“资料未提及”，不得编造数据、引用或价格。',
      '你不能替用户确认需求、决策、成本或发布版本，只能给出建议。仅输出 JSON {"answer": "..."}。',
      q ? `当前研究问题：${q.title}\n${q.report ? `现有报告摘要：${truncate(q.report, 4000)}` : ''}` : '',
      '已确认需求：', ...state.requirements.filter(r => r.status === 'confirmed').map(r => `- ${truncate(r.normalizedText, 300)}`),
      supportContext(state),
      '资料摘录：', ...materials.slice(0, 8).map(m => `### ${m.name}\n${truncate(m.text, 6000)}`),
      '对话：', ...history.map(m => `${m.role === 'user' ? '用户' : '助手'}：${truncate(m.content, 4000)}`),
    ].filter(Boolean).join('\n')
    try {
      const out = await model.generate({ prompt: `${skill.text}\n\n${prompt}`, schema: chatOutput, signal: deps.signal })
      const reply = { ...this.ctx.fields(projectId), thread: data.thread, role: 'assistant' as const, content: out.answer, runId,
        modelRoute: deps.route, status: deps.signal.aborted ? 'cancelled' as const : 'done' as const }
      await this.finishRun(projectId, runId, deps.signal, { status: 'completed' }, s => { s.v4.messages.push(reply) })
      return { runId, messageId: reply.id, answer: out.answer, cancelled: deps.signal.aborted }
    } catch (error) {
      await this.finishRun(projectId, runId, deps.signal, { status: 'failed', error: errorText(error) })
      await this.mutate(projectId, s => {
        const m = s.v4.messages.find(x => x.id === user.id)
        if (m) m.status = deps.signal.aborted ? 'cancelled' : 'failed'
      })
      throw error
    }
  }

  /**
   * Report-centred research run. Web mode fetches real bodies only; the model then writes a
   * report and candidate findings. A finding's quote must be found verbatim (whitespace-insensitive)
   * in the material it cites, otherwise it is stored without a source and flagged for review.
   */
  async research(projectId: string, questionId: string, deps: RunDeps, modeOverride?: RunMode) {
    const skill = await researchSkill()
    const model = this.requireModel(deps)
    const q = this.question(projectId, questionId)
    ensure(q.status !== 'researching', 'RUN_IN_PROGRESS', '该问题正在研究中。')
    this.checkDirection(projectId, q, questionId)
    if (this.ctx.state(projectId).v4?.discovery) ensure(q.plan?.confirmedAt, 'PLAN_REQUIRED', '请先人工确认本方向研究计划。')
    const mode: RunMode = modeOverride ?? q.plan?.mode ?? 'local'
    const inputState = this.ctx.state(projectId), inputHash = researchInputHash(inputState, questionId)
    const runId = await this.startRun(projectId, 'research', mode, deps.route, questionId)
    await this.mutate(projectId, s => { Object.assign(s.v4.questions.find(x => x.id === questionId)!, { status: 'researching', updatedAt: this.ctx.now() }) })
    let web: Awaited<ReturnType<ResearchV4Service['webPass']>> | undefined
    try {
      if (mode !== 'local') web = await this.webPass(projectId, runId, questionId, q.plan?.queries.length ? q.plan.queries : [q.title], deps)
      const state = this.ctx.state(projectId)
      const materials = this.materials(projectId, questionId).filter(m => mode !== 'web' || m.kind === 'web' && web?.sourceIds.includes(m.refId))
      ensure(materials.length > 0, 'NO_MATERIAL', web?.note ?? '没有可用于研究的资料：请先导入资料或启用联网。')
      const prompt = [
        skill.text,
        '你是工程方案研究员。针对研究问题，仅依据下列编号资料撰写结构化研究报告（Markdown，含结论、依据、不确定性与待确认事项）。',
        '同时提炼至多 8 条候选发现：每条给出 sourceKind（document/web/none）、sourceIndex（资料编号）和 quote（逐字摘自该资料的原文片段，≤200字）。',
        '找不到原文依据的发现必须 sourceKind=none。不得编造引用、数据或价格。仅输出 JSON。',
        `研究问题：${q.title}`, q.description ?? '',
        `具体方向：${q.direction ?? q.title}；本次研究必须解决的决策问题：${q.decisionUse ?? '技术可行性'}`,
        '分别写出支持/反对各关联路线的证据、适用条件、工业可行性、试验验证建议和信息缺口，不要重复其他研究方向的泛化报告。',
        `关联路线：${state.alternatives.filter(a => q.alternativeIds?.includes(a.id)).map(a => `${a.id} ${a.name}：${a.summary}`).join('\n')}`,
        supportContext(state),
        q.plan ? `已确认研究计划：\n${q.plan.steps.map((x, i) => `${i + 1}. ${x}`).join('\n')}` : '',
        '相关需求：', ...state.requirements.filter(r => q.requirementIds.includes(r.id) || r.status === 'confirmed').slice(0, 40).map(r => `- ${truncate(r.normalizedText, 300)}`),
        '资料：', ...materials.slice(0, 12).map((m, i) => `[${i}] (${m.kind}) ${m.name}${m.url ? ` ${m.url}` : ''}\n${truncate(m.text, 12000)}`),
      ].filter(Boolean).join('\n')
      const out = await model.generate({ prompt, schema: reportOutput, signal: deps.signal })
      const findings: Finding[] = []
      let unlocated = 0
      for (const f of out.findings) {
        const m = f.sourceIndex !== undefined ? materials[f.sourceIndex] : undefined
        const original = m?.kind === 'document' ? state.documents.find(d => d.id === m.refId)?.textContent : m?.text
        const located = f.sourceKind !== 'none' && m && f.quote && squash(f.quote).length >= 4 && squash(m.text).includes(squash(f.quote)) && original && squash(original).includes(squash(f.quote))
        if (f.sourceKind !== 'none' && !located) unlocated++
        const source = located && m && f.quote
          ? { type: m.kind, ...m.kind === 'document' ? { documentId: m.refId } : { sourceId: m.refId }, quote: f.quote, quoteHash: sha256(squash(f.quote)) }
          : { type: 'none' as const }
        findings.push({ ...this.ctx.fields(projectId), questionId, statement: f.statement, ...f.conditions ? { conditions: f.conditions } : {},
          origin: 'ai', source, adoption: 'candidate', verification: 'unverified',
          needsReview: !located, ...located ? {} : { reviewReason: f.sourceKind === 'none' ? '无资料依据，需人工核实' : '模型引用无法在原文中定位，已移除来源' },
          history: [], requirementIds: [...q.requirementIds], alternativeIds: [...q.alternativeIds ?? []], decisionIds: [], configItemIds: [] })
      }
      const note = [skill.receipt, web?.note, `生成候选发现 ${findings.length} 条${unlocated ? `，其中 ${unlocated} 条引用无法定位` : ''}。`].filter(Boolean).join(' ')
      await this.finishRun(projectId, runId, deps.signal, { status: 'completed', note, webStatus: web?.status ?? 'not_requested', sourceIds: web?.sourceIds ?? [] }, s => {
        ensure(!inputState.v4?.discovery || researchInputHash(s, questionId) === inputHash, 'STALE_CONTEXT', '需求、路线或支撑资料在研究期间已变化，请更新研究范围后重新运行。')
        Object.assign(s.v4.questions.find(x => x.id === questionId)!, { report: out.report, reportRunId: runId, status: 'answered', updatedAt: this.ctx.now() })
        delete s.v4.questions.find(x => x.id === questionId)!.reviewReason
        s.v4.findings.push(...findings)
      })
      if (deps.signal.aborted) await this.reopen(projectId, questionId)
      return { runId, findings: findings.length, webStatus: web?.status ?? 'not_requested', note }
    } catch (error) {
      await this.finishRun(projectId, runId, deps.signal, { status: 'failed', error: errorText(error),
        note: [skill.receipt, web?.note].filter(Boolean).join(' '), webStatus: web?.status ?? 'not_requested', sourceIds: web?.sourceIds ?? [] })
      await this.reopen(projectId, questionId)
      throw error
    }
  }
  private async reopen(projectId: string, questionId: string) {
    await this.mutate(projectId, s => {
      const q = s.v4.questions.find(x => x.id === questionId)
      if (q?.status === 'researching') Object.assign(q, { status: 'open', updatedAt: this.ctx.now() })
    })
  }

  /** Save a Finding from manually selected text; the quote must exist in the cited material. */
  async addFinding(projectId: string, input: unknown) {
    const data = findingInput.parse(input)
    const state = this.ctx.state(projectId)
    const src = { ...data.source }
    if (src.type !== 'none') {
      ensure(src.quote && squash(src.quote).length > 0, 'INVALID_INPUT', '有来源的发现需要原文摘录。')
      let body: string | undefined
      if (src.type === 'document') body = state.documents.find(d => d.id === src.documentId)?.textContent
      else if (src.type === 'web') body = state.v4?.sources.find(x => x.id === src.sourceId && x.status === 'fetched')?.snapshot
      else body = data.questionId ? state.v4?.questions.find(x => x.id === data.questionId)?.report : undefined
      ensure(body !== undefined, 'RECORD_NOT_FOUND', '引用的资料不存在或未获取正文。')
      ensure(squash(body).includes(squash(src.quote)), 'QUOTE_NOT_FOUND', '摘录文本在所选资料中找不到，请重新选择。')
      src.quoteHash = sha256(squash(src.quote))
    }
    // A quote taken from an AI report is not primary evidence: it stays flagged until a human checks it.
    const fromReport = src.type === 'report'
    const row: Finding = { ...this.ctx.fields(projectId), ...data.questionId ? { questionId: data.questionId } : {}, statement: data.statement,
      ...data.conditions ? { conditions: data.conditions } : {}, origin: data.origin, source: src, adoption: 'candidate', verification: 'unverified',
      needsReview: fromReport || src.type === 'none', ...fromReport ? { reviewReason: '摘自 AI 报告，需回溯原始资料' } : src.type === 'none' ? { reviewReason: '无资料依据' } : {},
      history: [], requirementIds: data.requirementIds, alternativeIds: data.alternativeIds, decisionIds: data.decisionIds, configItemIds: data.configItemIds }
    await this.mutate(projectId, s => { s.v4.findings.push(row) })
    return row
  }

  /** Edits keep history. Changing an adopted or verified statement flags it for re-review. */
  async updateFinding(projectId: string, findingId: string, input: unknown) {
    const { by, ...patch } = findingPatch.parse(input)
    await this.mutate(projectId, s => {
      const f = s.v4.findings.find(x => x.id === findingId)
      ensure(f, 'RECORD_NOT_FOUND', '发现不存在。')
      const now = this.ctx.now()
      if (patch.statement !== undefined && patch.statement !== f.statement) {
        f.history.push({ statement: f.statement, at: now, by })
        if (f.adoption !== 'candidate' || f.verification !== 'unverified') { f.needsReview = true; f.reviewReason = '内容已修改，需重新审核' }
      }
      for (const [k, v] of Object.entries(patch)) if (v !== undefined) (f as Record<string, unknown>)[k] = v
      f.updatedAt = now
    })
    return this.v4(projectId).findings.find(x => x.id === findingId)!
  }

  /** Gated adoption / verification — two independent human judgements. */
  async reviewFindings(projectId: string, input: unknown) {
    const data = findingReviewInput.parse(input)
    const valid = data.kind === 'adoption' ? ['adopted', 'rejected'] : ['verified', 'disputed']
    ensure(valid.includes(data.value), 'INVALID_INPUT', '审核结果与审核类型不匹配。')
    const all = this.v4(projectId).findings
    const rows = data.findingIds.map(fid => {
      const f = all.find(x => x.id === fid)
      ensure(f, 'RECORD_NOT_FOUND', '发现不存在。')
      ensure(!(data.value === 'verified' && f.source.type === 'none'), 'SOURCE_REQUIRED', `无来源的发现不能标记为已核实：${truncate(f.statement, 60)}`)
      return f
    })
    const { revision, review } = await this.ctx.review(projectId, `v4_finding_${data.kind}`,
      { kind: data.kind, value: data.value, note: data.note, findings: rows.map(f => ({ id: f.id, statement: f.statement, source: f.source })) })
    await this.mutate(projectId, s => {
      this.ctx.assertFresh(s, revision)
      for (const f of s.v4.findings) if (data.findingIds.includes(f.id)) {
        if (data.kind === 'adoption') Object.assign(f, { adoption: data.value, adoptionReview: review })
        else Object.assign(f, { verification: data.value, verificationReview: review })
        f.needsReview = false
        delete f.reviewReason
        f.updatedAt = this.ctx.now()
      }
    })
    return { updated: rows.length }
  }

}
