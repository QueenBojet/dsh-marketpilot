/** 资料与变更: intake batches, rule hints (1C light hint), human-started deep analysis and gated change handling. */
import { z } from 'zod'
import { ensure, id, ids, text } from '../../domain/common.ts'
import { documentInput } from '../../domain/project.ts'
import { requirementInput } from '../../domain/requirement.ts'
import type { ChangeProposal } from '../../domain/v4.ts'
import { compareLines, guessPriority, guessRequirementType, sha256, splitLines } from '../../domain/v4-text.ts'
import type { CorpusLine } from '../../domain/v4-text.ts'
import { requiredRecord } from '../records.ts'
import { V4RunBase, errorText, truncate } from './base.ts'
import type { RunDeps } from './base.ts'

export const intakeInput = z.strictObject({
  label: text.max(200), sourceNote: z.string().trim().max(4000).optional(), receivedOn: z.iso.date().optional(),
  manualSummary: z.string().trim().max(4000).optional(),
  files: z.array(documentInput.extend({ warnings: z.array(z.string()).max(50).optional() })).min(1).max(20),
})
export const changeActionInput = z.strictObject({
  changeIds: ids.min(1).max(100),
  action: z.enum(['adopt', 'ignore', 'clarify', 'to_research', 'no_change']),
  edits: z.strictObject({
    normalizedText: text.max(4000).optional(), priority: requirementInput.shape.priority.optional(),
    type: requirementInput.shape.type.optional(),
  }).optional(),
  note: z.string().trim().max(2000).optional(),
})
const deepOutput = z.strictObject({
  changes: z.array(z.strictObject({
    kind: z.enum(['added', 'modified', 'conflict', 'background']), newText: text.max(2000), summary: text.max(400),
    locator: z.string().max(80).optional(), oldRequirementId: id.optional(), impactNote: z.string().max(1000).optional(),
  })).max(80),
})

const squash = (value: string) => value.replace(/\s+/g, '')
const LABELS = { added: '可能新增要求', modified: '可能修改', conflict: '可能冲突', background: '背景信息' } as const

export class IntakeService extends V4RunBase {
  /** Import one batch. Same-checksum files are reported, not re-imported; rules only propose candidate changes. */
  async intake(projectId: string, input: unknown) {
    const data = intakeInput.parse(input)
    const state = this.ctx.state(projectId)
    const batch = this.ctx.fields(projectId)
    const duplicates: string[] = []
    const warnings: string[] = []
    const docs: (z.infer<typeof documentInput> & { checksum: string; id: string; projectId: string; createdAt: string; updatedAt: string; importedAt: string })[] = []
    for (const file of data.files) {
      const { warnings: fileWarnings, ...doc } = file
      const checksum = doc.checksum ?? sha256(doc.textContent)
      const existing = state.documents.find(d => d.checksum === checksum) ?? docs.find(d => d.checksum === checksum)
      if (existing) { duplicates.push(`${doc.name}（与已导入「${existing.name}」内容相同）`); continue }
      for (const w of fileWarnings ?? []) warnings.push(`${doc.name}：${w}`)
      docs.push({ ...doc, checksum, ...this.ctx.fields(projectId), importedAt: batch.createdAt })
    }
    const corpus: CorpusLine[] = []
    for (const d of state.documents) for (const l of splitLines(d.textContent)) corpus.push({ ...l, documentId: d.id })
    for (const r of state.requirements) if (r.status !== 'superseded')
      corpus.push({ text: r.originalText, locator: r.sourceLocator ?? '需求', requirementId: r.id, confirmed: r.status === 'confirmed' })
    const changes: ChangeProposal[] = []
    for (const d of docs) for (const c of compareLines(splitLines(d.textContent), corpus, 200)) {
      const reqId = c.old?.requirementId
      const summary = c.old ? `${LABELS[c.kind]}：${c.old.text} → ${c.text}` : `${LABELS[c.kind]}：${c.text}`
      changes.push({ ...this.ctx.fields(projectId), batchId: batch.id, kind: c.kind, newText: truncate(c.text, 2000),
        summary: truncate(summary, 400), documentId: d.id, locator: `${d.name} ${c.locator}`,
        ...c.old ? { oldText: truncate(c.old.text, 4000) } : {}, ...reqId ? { requirementId: reqId } : {},
        origin: 'direct', detectedBy: 'rule', status: 'pending',
        ...c.similarity !== undefined ? { impactNote: `规则相似度 ${c.similarity}，需人工判断是否为同一要求` } : {} })
    }
    const count = (k: ChangeProposal['kind']) => changes.filter(c => c.kind === k).length
    const notes = ['轻量识别仅基于文本规则比对，结果是“可能的变化”；请人工启动深度分析或逐条审阅。']
    if (!docs.length) notes.push('本批次文件均与已有资料重复，未新增文档。')
    if (!data.sourceNote) notes.push('来源未填写：请补充资料来源以便追溯。')
    await this.mutate(projectId, s => {
      s.documents.push(...docs)
      s.v4.intakeBatches.push({ ...batch, label: data.label, ...data.sourceNote ? { sourceNote: data.sourceNote } : {},
        ...data.receivedOn ? { receivedOn: data.receivedOn } : {}, ...data.manualSummary ? { manualSummary: data.manualSummary } : {},
        documentIds: docs.map(d => d.id), status: 'hinted', warnings,
        hint: { added: count('added'), modified: count('modified'), conflict: count('conflict'), background: count('background'), duplicates, notes } })
      s.v4.changes.push(...changes)
    })
    return { batchId: batch.id, documentIds: docs.map(d => d.id), changes: changes.length, duplicates, warnings }
  }

  /** Human-started deep analysis. Model output is kept only when its text can be located in the batch documents. */
  async deepAnalyze(projectId: string, batchId: string, deps: RunDeps) {
    const model = this.requireModel(deps)
    const state = this.ctx.state(projectId)
    const batch = state.v4?.intakeBatches.find(b => b.id === batchId)
    ensure(batch, 'RECORD_NOT_FOUND', '资料批次不存在。')
    ensure(batch.status !== 'analyzing', 'RUN_IN_PROGRESS', '该批次正在深度分析。')
    ensure(batch.documentIds.length > 0, 'NOTHING_TO_ANALYZE', '该批次没有新增文档（可能均为重复文件）。')
    const docs = batch.documentIds.map(d => requiredRecord(state, 'documents', d))
    const reqs = state.requirements.filter(r => r.status !== 'superseded')
    const runId = await this.startRun(projectId, 'deep_change', 'local', deps.route)
    await this.mutate(projectId, s => {
      const b = s.v4.intakeBatches.find(x => x.id === batchId)!
      Object.assign(b, { status: 'analyzing', analysisRunId: runId, updatedAt: this.ctx.now() })
      delete b.error
    })
    const prompt = [
      '你是工程需求变更分析员。比较“新资料”与“已有需求”，列出新增、修改、冲突或仅属背景的信息。',
      '规则：newText 必须逐字摘自新资料原文；不得编造；修改/冲突必须给出 oldRequirementId（取自已有需求列表）；impactNote 说明可能影响的方案、配置或成本。仅输出 JSON。',
      '已有需求：', ...reqs.map(r => `- [${r.id}] (${r.status}) ${truncate(r.originalText, 300)}`),
      '新资料：', ...docs.map(d => `### ${d.name}\n${truncate(d.textContent, 24000)}`),
    ].join('\n')
    try {
      const out = await model.generate({ prompt, schema: deepOutput, signal: deps.signal })
      const corpus = docs.map(d => ({ id: d.id, name: d.name, flat: squash(d.textContent) }))
      const rows: ChangeProposal[] = []
      let rejected = 0
      for (const c of out.changes) {
        const doc = corpus.find(d => d.flat.includes(squash(c.newText)))
        const old = c.oldRequirementId ? reqs.find(r => r.id === c.oldRequirementId) : undefined
        if (!doc || (c.oldRequirementId && !old)) { rejected++; continue }
        rows.push({ ...this.ctx.fields(projectId), batchId, kind: c.kind, newText: c.newText, summary: c.summary,
          documentId: doc.id, locator: c.locator ? `${doc.name} ${c.locator}` : doc.name,
          ...old ? { oldText: truncate(old.originalText, 4000), requirementId: old.id } : {},
          origin: old || c.kind === 'added' ? 'direct' : 'inferred', detectedBy: 'model', status: 'pending',
          ...c.impactNote ? { impactNote: c.impactNote } : {} })
      }
      const note = `模型提出 ${out.changes.length} 条，${rows.length} 条可在原文定位${rejected ? `，${rejected} 条无法定位已丢弃` : ''}。`
      await this.finishRun(projectId, runId, deps.signal, { status: 'completed', note }, s => {
        // Pending rule hints of this batch are replaced by the model pass; already-reviewed ones stay.
        s.v4.changes = s.v4.changes.filter(c => !(c.batchId === batchId && c.detectedBy === 'rule' && c.status === 'pending'))
        s.v4.changes.push(...rows)
        Object.assign(s.v4.intakeBatches.find(x => x.id === batchId)!, { status: 'analyzed', updatedAt: this.ctx.now() })
      })
      if (deps.signal.aborted) await this.settleBatch(projectId, batchId, '深度分析已取消。')
      return { runId, changes: rows.length, rejected }
    } catch (error) {
      await this.finishRun(projectId, runId, deps.signal, { status: 'failed', error: errorText(error) })
      await this.settleBatch(projectId, batchId, truncate(errorText(error), 2000))
      throw error
    }
  }

  private async settleBatch(projectId: string, batchId: string, error: string) {
    await this.mutate(projectId, s => {
      Object.assign(s.v4.intakeBatches.find(x => x.id === batchId)!, { status: 'failed', error, updatedAt: this.ctx.now() })
    })
  }

  /**
   * Human handling of candidate changes (gated). `adopt` turns the text into a *proposed* Requirement
   * (confirmation stays a separate gate); a replaced requirement is superseded unless the active
   * decision still references it, in which case an open impact link flags the decision for review.
   * `clarify` / `to_research` open a research question; `ignore` / `no_change` only record the review.
   */
  async act(projectId: string, input: unknown) {
    const data = changeActionInput.parse(input)
    const state = this.ctx.state(projectId)
    const changes = data.changeIds.map(cid => {
      const c = state.v4?.changes.find(x => x.id === cid)
      ensure(c, 'RECORD_NOT_FOUND', '变更不存在。')
      ensure(c.status === 'pending', 'CHANGE_HANDLED', `变更已处理：${truncate(c.summary, 60)}`)
      return c
    })
    ensure(!data.edits || changes.length === 1, 'INVALID_INPUT', '编辑采纳内容时一次只能处理一条变更。')
    const { revision, review } = await this.ctx.review(projectId, `v4_change_${data.action}`,
      { action: data.action, changes: changes.map(c => ({ id: c.id, kind: c.kind, newText: c.newText, oldText: c.oldText, locator: c.locator })), edits: data.edits, note: data.note })
    const decision = state.decisions.find(d => d.id === state.project.activeDecisionId)
    const result: { requirementIds: string[]; questionIds: string[] } = { requirementIds: [], questionIds: [] }
    await this.mutate(projectId, s => {
      this.ctx.assertFresh(s, revision)
      const now = this.ctx.now()
      for (const c of changes) {
        const row = s.v4.changes.find(x => x.id === c.id)!
        Object.assign(row, { status: data.action === 'adopt' ? 'adopted' : data.action === 'ignore' ? 'ignored' : data.action, review, updatedAt: now })
        if (data.action === 'adopt') {
          const reqFields = this.ctx.fields(projectId)
          const normalized = data.edits?.normalizedText ?? c.newText
          s.requirements.push({ ...reqFields, originalText: c.newText, normalizedText: normalized,
            type: data.edits?.type ?? guessRequirementType(normalized), priority: data.edits?.priority ?? guessPriority(normalized),
            status: 'proposed', ...c.documentId ? { sourceDocumentId: c.documentId } : {},
            ...c.locator ? { sourceLocator: truncate(c.locator, 400) } : {},
            rationale: `由资料变更采纳（${review.reviewer}）${data.note ? `：${data.note}` : ''}` })
          row.resultRequirementId = reqFields.id
          result.requirementIds.push(reqFields.id)
          s.v4.impacts.push({ ...this.ctx.fields(projectId), fromType: 'change', fromId: c.id, toType: 'requirement', toId: reqFields.id,
            origin: 'direct', status: 'confirmed', review })
          if (c.requirementId) {
            const old = s.requirements.find(r => r.id === c.requirementId)
            if (old && decision?.requirementIds.includes(old.id)) {
              s.v4.impacts.push({ ...this.ctx.fields(projectId), fromType: 'requirement', fromId: old.id, toType: 'decision', toId: decision.id,
                origin: 'inferred', status: 'open', note: `需求被新资料修改，请复核路线决策：${truncate(c.newText, 300)}` })
            } else if (old && old.status !== 'superseded') {
              old.status = 'superseded'
              delete old.confirmation
              old.updatedAt = now
            }
          }
        } else if (data.action === 'clarify' || data.action === 'to_research') {
          const q = this.ctx.fields(projectId)
          s.v4.questions.push({ ...q, title: truncate(`${data.action === 'clarify' ? '待澄清' : '待研究'}：${c.newText}`, 200),
            description: [c.summary, c.locator ? `来源：${c.locator}` : '', data.note ?? ''].filter(Boolean).join('\n'),
            status: 'open', requirementIds: c.requirementId ? [c.requirementId] : [], documentIds: c.documentId ? [c.documentId] : [] })
          row.resultQuestionId = q.id
          result.questionIds.push(q.id)
        }
      }
    })
    return result
  }
}
