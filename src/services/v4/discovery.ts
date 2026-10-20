import { z } from 'zod'
import { ensure, id, ids, text } from '../../domain/common.ts'
import { briefSchema, supportNoteSchema } from '../../domain/v4.ts'
import { loadPrompt } from '../../prompts/template.ts'
import { hashOf } from '../../domain/v4-text.ts'
import { V4RunBase, errorText, truncate } from './base.ts'
import type { RunDeps } from './base.ts'
import { briefHash, briefConfirmed, explorationHash, latestExploration, supportContext, routeContents, currentReports, interviewContext } from './discovery-context.ts'

const chatInput = z.strictObject({ content: text.max(8000), documentIds: ids.max(8).default([]) })
const chatOutput = z.strictObject({ answer: text.max(20000), brief: briefSchema })
const noteInput = supportNoteSchema.omit({ id: true, projectId: true, createdAt: true, updatedAt: true, status: true, review: true })
const routeOutput = z.strictObject({
  name: text.max(200), summary: text.max(3000), components: z.array(text.max(500)).min(1).max(15),
  strengths: z.array(text.max(1000)).max(12), limitations: z.array(text.max(1000)).max(12), risks: z.array(text.max(1000)).max(12),
  industrialSupport: text.max(3000), feasibility: text.max(3000), evidenceGaps: z.array(text.max(1000)).max(12),
  researchDirections: z.array(text.max(500)).min(1).max(8), sourceAlternativeIds: ids.max(10),
})
const brainstormOutput = z.strictObject({ summary: text.max(20000), routes: z.array(routeOutput).min(1).max(5) })
const initialOutput = brainstormOutput.extend({ routes: z.array(routeOutput.omit({ sourceAlternativeIds: true })).min(3).max(5) })

export class DiscoveryService extends V4RunBase {
  async enable(projectId: string) {
    await this.mutate(projectId, s => { s.v4.discovery ??= { brief: { objective: '', scenario: s.project.scenario ?? '', scope: '', constraints: '', acceptance: [], openQuestions: [] }, requirementIds: [] } })
    return this.v4(projectId).discovery!
  }
  async saveBrief(projectId: string, input: unknown) {
    const brief = briefSchema.parse(input)
    await this.mutate(projectId, s => {
      ensure(s.v4.discovery, 'DISCOVERY_REQUIRED', '请先开启需求访谈。')
      s.v4.discovery.brief = brief
      delete s.v4.discovery.proposal
    })
    return this.v4(projectId).discovery!
  }
  async chat(projectId: string, input: unknown, deps: RunDeps) {
    const data = chatInput.parse(input), model = this.requireModel(deps)
    const state = this.ctx.state(projectId)
    ensure(state.v4?.discovery, 'DISCOVERY_REQUIRED', '请先开启需求访谈。')
    const docs = data.documentIds.map(did => {
      const d = state.documents.find(d => d.id === did)
      ensure(d, 'RECORD_NOT_FOUND', '所选资料不存在。'); return d
    })
    const prompt = await loadPrompt('discovery')
    const runId = await this.startRun(projectId, 'discovery', 'local', deps.route)
    const user = { ...this.ctx.fields(projectId), thread: 'discovery', role: 'user' as const, content: data.content, status: 'done' as const, runId }
    await this.mutate(projectId, s => { s.v4.messages.push(user) })
    const context = interviewContext(this.ctx.state(projectId), data.documentIds)
    try {
      const out = await model.generate({ schema: chatOutput, signal: deps.signal, prompt: [prompt, context.support,
        '当前简报建议：', JSON.stringify(context.proposal),
        '本轮用户选取的辅助资料（不是已确认需求）：', ...docs.map(d => `${d.name}\n${truncate(d.textContent, 16000)}`),
        '访谈历史：', ...(context.messages ?? []).map(m => `${m.role}: ${m.content}`),
      ].join('\n') })
      await this.finishRun(projectId, runId, deps.signal, { status: 'completed' }, s => {
        ensure(hashOf(interviewContext(s, data.documentIds)) === hashOf(context), 'STALE_CONTEXT', '对话、简报或辅助资料在访谈期间已变化，请重新发起。')
        s.v4.discovery!.proposal = out.brief
        s.v4.messages.push({ ...this.ctx.fields(projectId), thread: 'discovery', role: 'assistant', content: out.answer, status: 'done', runId, modelRoute: deps.route })
      })
      if (deps.signal.aborted) await this.mutate(projectId, s => { s.v4.messages.find(m => m.id === user.id)!.status = 'cancelled' })
      return { runId }
    } catch (error) {
      await this.finishRun(projectId, runId, deps.signal, { status: 'failed', error: errorText(error) })
      await this.mutate(projectId, s => { s.v4.messages.find(m => m.id === user.id)!.status = deps.signal.aborted ? 'cancelled' : 'failed' })
      throw error
    }
  }
  async confirmBrief(projectId: string) {
    const state = this.ctx.state(projectId), d = state.v4?.discovery
    ensure(d, 'DISCOVERY_REQUIRED', '请先完成需求访谈。')
    ensure(d.brief.objective && d.brief.scenario && d.brief.scope && d.brief.constraints && d.brief.acceptance.length,
      'BRIEF_INCOMPLETE', '请填写目标、场景、范围、约束及至少一条可检验需求。')
    ensure(!d.brief.openQuestions.length, 'BRIEF_INCOMPLETE', '请先解决简报中的待澄清问题，或将明确接受的不确定性写入约束。')
    ensure(!d.proposal, 'BRIEF_PROPOSAL_PENDING', '请先审阅并保存最新简报建议。')
    const retired = d.requirementIds.filter(rid => !d.brief.acceptance.includes(state.requirements.find(r => r.id === rid)?.normalizedText ?? ''))
    const { revision, bound } = await this.bound(projectId, 'v4_brief_confirm', { brief: d.brief,
      replacedRequirements: state.requirements.filter(r => retired.includes(r.id)).map(r => r.normalizedText),
      note: retired.length ? '被移出简报的旧需求将标记已替代；引用它们的当前路线需重新决策，历史决策保留。' : '确认简报内验收需求。' }, briefHash(state))
    await this.mutate(projectId, s => {
      this.ctx.assertFresh(s, revision)
      const current = s.v4.discovery!
      current.review = bound
      if (s.decisions.find(d => d.id === s.project.activeDecisionId)?.requirementIds.some(r => retired.includes(r))) {
        delete s.project.activeDecisionId
        for (const a of s.alternatives) if (a.status === 'selected') a.status = 'candidate'
      }
      for (const r of s.requirements) if (retired.includes(r.id)) r.status = 'superseded'
      current.requirementIds = []
      for (const body of new Set(current.brief.acceptance)) {
        let req = s.requirements.find(r => r.normalizedText === body && r.status !== 'superseded')
        if (!req) {
          req = { ...this.ctx.fields(projectId), originalText: body, normalizedText: body, type: 'functional', priority: 'must', status: 'confirmed', confirmation: bound.review, sourceLocator: '人工确认需求简报' }
          s.requirements.push(req)
        }
        if (req.status !== 'confirmed') { req.status = 'confirmed'; req.confirmation = bound.review }
        if (!current.requirementIds.includes(req.id)) current.requirementIds.push(req.id)
      }
      s.project.status = s.project.activeDecisionId ? s.project.status : 'requirements_ready'
    })
    return this.v4(projectId).discovery!
  }
  async saveNote(projectId: string, input: unknown, noteId?: string) {
    const data = noteInput.parse(input)
    if (data.documentId) {
      const doc = this.ctx.state(projectId).documents.find(d => d.id === data.documentId)
      ensure(doc && data.quote && doc.textContent.replace(/\s/g, '').includes(data.quote.replace(/\s/g, '')), 'QUOTE_NOT_FOUND', '资料摘要必须附上可在原文定位的摘录。')
    }
    let savedId = noteId
    await this.mutate(projectId, s => {
      s.v4.supportNotes ??= []
      if (noteId) {
        const n = s.v4.supportNotes.find(n => n.id === noteId)
        ensure(n, 'RECORD_NOT_FOUND', '支撑摘要不存在。')
        delete n.documentId; delete n.quote; delete n.locator
        Object.assign(n, data, { status: 'draft', updatedAt: this.ctx.now() }); delete n.review
      } else {
        const n = { ...this.ctx.fields(projectId), ...data, status: 'draft' as const }
        s.v4.supportNotes.push(n); savedId = n.id
      }
    })
    return this.v4(projectId).supportNotes!.find(n => n.id === savedId)!
  }
  async fixNote(projectId: string, noteId: string) {
    const n = this.v4(projectId).supportNotes?.find(n => n.id === id.parse(noteId))
    ensure(n, 'RECORD_NOT_FOUND', '支撑摘要不存在。')
    const { revision, review } = await this.ctx.review(projectId, 'v4_support_fix', n)
    await this.mutate(projectId, s => { this.ctx.assertFresh(s, revision); Object.assign(s.v4.supportNotes!.find(n => n.id === noteId)!, { status: 'fixed', review }) })
    return { fixed: noteId }
  }
  async brainstorm(projectId: string, phase: 'initial' | 'synthesis', deps: RunDeps) {
    z.enum(['initial', 'synthesis']).parse(phase)
    const model = this.requireModel(deps), state = this.ctx.state(projectId)
    ensure(briefConfirmed(state), 'BRIEF_UNCONFIRMED', '请先人工确认当前需求简报。')
    const initialIds = latestExploration(state, 'initial')?.routes.map(r => r.alternativeId) ?? []
    const reports = currentReports(state)
    if (phase === 'synthesis') {
      ensure(latestExploration(state, 'initial'), 'INITIAL_REQUIRED', '需求或支撑资料已变化，请先更新多路线初筛。')
      ensure(reports.length >= 2 && new Set(reports.map(q => q.direction?.trim())).size >= 2, 'RESEARCH_REQUIRED', '综合判断至少需要两个不同具体方向的有效研究报告。')
    }
    const inputHash = explorationHash(state, phase)
    const prompt = await loadPrompt('brainstorm')
    const runId = await this.startRun(projectId, 'brainstorm', 'local', deps.route)
    try {
      const request = { signal: deps.signal, prompt: [prompt,
        `阶段：${phase === 'initial' ? '广泛路线初筛，至少 3 条路线' : '综合判断与二次重组，1–3 条最终候选'}`,
        phase === 'initial' ? '只执行初筛，不执行综合阶段；此时尚无已有候选路线 ID，不输出 sourceAlternativeIds。' : '仅根据本轮提供的有效研究报告综合；sourceAlternativeIds 必须是输入中的完整 UUID。',
        supportContext(state), phase === 'synthesis' ? JSON.stringify({ alternatives: state.alternatives.filter(a => initialIds.includes(a.id)),
          exploration: latestExploration(state, 'initial'), research: reports,
          findings: state.v4!.findings.filter(f => reports.some(q => q.id === f.questionId)) }) : '',
      ].join('\n') }
      let out: z.infer<typeof brainstormOutput>
      if (phase === 'initial') {
        const result = await model.generate({ ...request, schema: initialOutput })
        out = { ...result, routes: result.routes.map(r => ({ ...r, sourceAlternativeIds: [] })) }
      } else out = await model.generate({ ...request, schema: brainstormOutput })
      ensure(out.routes.length >= (phase === 'initial' ? 3 : 1), 'INSUFFICIENT_ROUTES', '初筛需要至少三条实质不同的技术路线。')
      ensure(new Set(out.routes.map(r => r.name.trim())).size === out.routes.length, 'DUPLICATE_ROUTE', '候选路线名称重复，请重新生成。')
      for (const r of out.routes) ensure(r.sourceAlternativeIds.every(a => state.alternatives.some(x => x.id === a)), 'INVALID_REFERENCE', '重组路线引用了不存在的候选。')
      if (phase === 'synthesis') for (const r of out.routes) ensure(r.sourceAlternativeIds.length && r.sourceAlternativeIds.every(a => initialIds.includes(a)), 'INVALID_REFERENCE', '最终候选必须说明由本轮初筛中的哪些路线保留或重组。')
      await this.finishRun(projectId, runId, deps.signal, { status: 'completed', note: phase === 'initial' ? '多路线工业可行性初筛' : '基于研究的综合判断与二次重组' }, s => {
        ensure(explorationHash(s, phase) === inputHash, 'STALE_CONTEXT', '项目依据在生成期间发生变化，请重新生成。')
        const routes = out.routes.map(r => {
          const alt = { ...this.ctx.fields(projectId), name: r.name, summary: r.summary, components: r.components, strengths: r.strengths,
            limitations: r.limitations, risks: r.risks, unknowns: r.evidenceGaps, requirementCoverage: {}, evidenceIds: [], status: 'candidate' as const }
          s.alternatives.push(alt)
          return { alternativeId: alt.id, industrialSupport: r.industrialSupport, feasibility: r.feasibility,
            evidenceGaps: r.evidenceGaps, researchDirections: r.researchDirections, sourceAlternativeIds: r.sourceAlternativeIds }
        })
        s.v4.explorations ??= []
        s.v4.explorations.push({ ...this.ctx.fields(projectId), phase, inputHash, runId, summary: out.summary, routes, routesHash: hashOf(routeContents(s, routes.map(r => r.alternativeId))),
          questionIds: phase === 'synthesis' ? reports.map(q => q.id) : [] })
      })
      return { runId }
    } catch (error) {
      await this.finishRun(projectId, runId, deps.signal, { status: 'failed', error: errorText(error) }); throw error
    }
  }
}
