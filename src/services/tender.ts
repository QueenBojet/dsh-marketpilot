import { tenderInput, validateTenderStatus } from '../domain/tender.ts'
import { RecordService, requiredRecord } from './records.ts'
import type { ServiceContext } from './project.ts'
import { tenderExtraction, tenderReview } from '../domain/tender-analysis.ts'
import { advanceProjectStatus } from '../domain/state.ts'
import { ensure, ids } from '../domain/common.ts'
import { businessVersion } from './generation.ts'
import { completeRun } from './workflow.ts'
import { renderCompliance } from '../render/compliance.ts'

export class TenderService extends RecordService<'tenderItems'> {
  constructor(ctx: ServiceContext) { super(ctx, 'tenderItems') }
  async add(projectId: string, input: unknown) {
    const data = tenderInput.parse(input)
    const fields = this.ctx.fields(projectId)
    const state = await this.ctx.repository.update(projectId, s => {
      s.tenderItems.push({ ...validateTenderStatus(data, s.evidence), ...fields })
    })
    return requiredRecord(state, 'tenderItems', fields.id)
  }
  async update(projectId: string, id: string, input: unknown) {
    const patch = tenderInput.partial().parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      const row = requiredRecord(s, 'tenderItems', id)
      Object.assign(row, patch)
      Object.assign(row, validateTenderStatus(row, s.evidence), { updatedAt: this.ctx.now() })
    })
    return requiredRecord(state, 'tenderItems', id)
  }
  async saveExtraction(projectId: string, runId: string, version: string, input: unknown) {
    const data = tenderExtraction.parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      ensure(businessVersion(s) === version, 'STALE_CONTEXT', '条款输入已变化，请重试。')
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.type === 'tender_review' && run.status === 'running', 'RUN_NOT_RUNNING', '条款提取工作流已停止。')
      const documents = ids.min(1).parse(run.input.documentIds)
      for (const item of data.clauses) ensure(documents.includes(item.sourceDocumentId)
        && s.documents.some(d => d.id === item.sourceDocumentId && d.textContent.includes(item.originalText)),
      'SOURCE_MISMATCH', '条款原文必须来自本批输入文档。')
      const rows = data.clauses.map(c => ({ ...c, ...this.ctx.fields(projectId), status: 'unknown' as const,
        requirementIds: [], evidenceIds: [], action: '匹配需求与已核验证据，并复核符合性。' }))
      s.tenderItems.push(...rows)
      advanceProjectStatus(s, 'tender_review', this.ctx.now())
      completeRun(run, this.ctx.now(), { tenderItemIds: rows.map(r => r.id) })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }
  async saveReview(projectId: string, runId: string, version: string, input: unknown) {
    const data = tenderReview.parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      ensure(businessVersion(s) === version, 'STALE_CONTEXT', '证据或招标条款已变化，请重新审核。')
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.type === 'tender_review' && run.status === 'running', 'RUN_NOT_RUNNING', '投标审核工作流已停止。')
      const selected = ids.min(1).parse(run.input.tenderItemIds)
      ensure(data.items.length === selected.length && new Set(data.items.map(r => r.id)).size === selected.length
        && data.items.every(r => selected.includes(r.id)), 'INCOMPLETE_REVIEW', '必须逐项审核本批全部条款。')
      for (const { id, risk, action, ...item } of data.items) {
        const row = requiredRecord(s, 'tenderItems', id)
        Object.assign(row, item, { updatedAt: this.ctx.now() })
        delete row.risk
        delete row.action
        if (risk) row.risk = risk
        if (action) row.action = action
        Object.assign(row, validateTenderStatus(row, s.evidence))
        if (row.status !== 'compliant' && row.status !== 'not_applicable' && !row.action) row.action = '补齐证据并人工复核本条款。'
      }
      const rows = selected.map(id => requiredRecord(s, 'tenderItems', id))
      const artifact = { ...this.ctx.fields(projectId), name: 'Compliance Matrix.md', type: 'compliance_matrix' as const,
        format: 'markdown' as const, content: renderCompliance(s, rows), workflowRunId: run.id, reviewStatus: 'draft' as const }
      s.artifacts.push(artifact)
      advanceProjectStatus(s, 'tender_review', this.ctx.now())
      completeRun(run, this.ctx.now(), { tenderItemIds: selected, artifactId: artifact.id })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }
}
