import { z } from 'zod'
import { ids, ensure } from '../domain/common.ts'
import { requirementInput } from '../domain/requirement.ts'
import { assertEditable } from '../domain/state.ts'
import { RecordService, requiredRecord } from './records.ts'
import type { ServiceContext } from './project.ts'
import { requirementExtractionSchema } from '../domain/requirement-analysis.ts'
import { renderBaseline } from '../render/baseline.ts'

export class RequirementService extends RecordService<'requirements'> {
  constructor(ctx: ServiceContext) { super(ctx, 'requirements') }
  async addMany(projectId: string, input: unknown) {
    const rows = z.array(requirementInput).min(1).parse(input).map(data => ({ ...data, ...this.ctx.fields(projectId) }))
    await this.ctx.repository.update(projectId, s => { s.requirements.push(...rows) })
    return rows
  }
  async update(projectId: string, id: string, input: unknown) {
    const patch = requirementInput.partial().parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      assertEditable(s, id)
      const row = requiredRecord(s, 'requirements', id)
      Object.assign(row, patch, { updatedAt: this.ctx.now() })
      if (row.confirmation) { row.status = 'proposed'; delete row.confirmation }
    })
    return requiredRecord(state, 'requirements', id)
  }
  async confirm(projectId: string, input: unknown) {
    const selected = ids.min(1).parse(input)
    const proposal = selected.map(id => this.get(projectId, id))
    ensure(proposal.every(r => r.status === 'proposed'), 'REQUIREMENT_NOT_PROPOSED', '请先澄清 UNKNOWN/冲突，再提交需求确认。')
    const { revision, review } = await this.ctx.review(projectId, 'confirm_requirements', proposal)
    const state = await this.ctx.repository.update(projectId, s => {
      this.ctx.assertFresh(s, revision)
      for (const id of selected) Object.assign(requiredRecord(s, 'requirements', id), {
        status: 'confirmed', confirmation: review, updatedAt: this.ctx.now(),
      })
      s.project.status = 'requirements_ready'
    })
    return state.requirements.filter(r => selected.includes(r.id))
  }

  /** Commit one validated extraction and its UNKNOWN ledger atomically with the human wait. */
  async saveAnalysis(projectId: string, runId: string, input: unknown) {
    const data = requirementExtractionSchema.parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.status === 'running' && run.type === 'requirement_analysis', 'RUN_NOT_RUNNING', '需求分析已停止。')
      const documents = s.documents
      for (const row of data.requirements) {
        const source = documents.find(d => d.id === row.sourceDocumentId)
        ensure(source?.textContent.includes(row.originalText), 'SOURCE_MISMATCH', '需求原文必须可在指定文档中找到。')
      }
      for (const row of data.unknowns) ensure(documents.some(d => d.id === row.sourceDocumentId), 'SOURCE_MISMATCH', 'UNKNOWN 来源不存在。')
      const requirements = data.requirements.map(({ risk, clarificationQuestion, ...row }) => ({ ...row,
        ...(risk ? { risk } : {}), ...(clarificationQuestion ? { clarificationQuestion } : {}), ...this.ctx.fields(projectId) }))
      const unknowns = data.unknowns.map(row => ({ ...row, ...this.ctx.fields(projectId), kind: 'UNKNOWN' as const,
        sourceType: 'model' as const, status: 'draft' as const, supportingEvidenceIds: [],
        relatedRequirementIds: requirements.filter(r => r.status === 'unknown' && r.sourceDocumentId === row.sourceDocumentId).map(r => r.id),
        relatedCompetitorIds: [], relatedAlternativeIds: [] }))
      s.requirements.push(...requirements)
      s.evidence.push(...unknowns)
      run.output = { requirementIds: requirements.map(r => r.id), unknownIds: unknowns.map(e => e.id) }
      run.status = 'waiting_human'
      run.currentStep = 'WAITING_HUMAN'
      run.waitingSince = this.ctx.now()
      run.updatedAt = this.ctx.now()
      run.steps.push({ step: 'WAITING_HUMAN', at: this.ctx.now() })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }

  /** Resume exactly the saved candidate batch; incomplete review remains waiting. */
  async finalizeAnalysis(projectId: string, runId: string) {
    const state = await this.ctx.repository.update(projectId, s => {
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.type === 'requirement_analysis' && ['waiting_human', 'completed'].includes(run.status), 'INVALID_TRANSITION', '需求工作流尚未到达人工审核步骤。')
      if (run.status === 'completed') return
      const selected = ids.min(1).parse(run.output?.requirementIds)
      const rows = selected.map(id => requiredRecord(s, 'requirements', id))
      ensure(rows.some(r => r.status === 'confirmed') && rows.every(r => ['confirmed', 'unknown', 'conflict', 'superseded'].includes(r.status)),
        'WAITING_HUMAN', '本批次仍有 proposed 需求待确认，或尚无已确认需求。')
      const now = this.ctx.now()
      const artifact = { ...this.ctx.fields(projectId), name: 'Requirement Baseline.md', type: 'requirement_baseline' as const,
        content: renderBaseline(s, selected), format: 'markdown' as const, workflowRunId: runId, reviewStatus: 'draft' as const }
      s.artifacts.push(artifact)
      run.humanWaitMs += Math.max(0, Date.parse(now) - Date.parse(run.waitingSince!))
      delete run.waitingSince
      Object.assign(run, { status: 'completed', currentStep: 'COMPLETED', completedAt: now, updatedAt: now,
        durationMs: Math.max(0, Date.parse(now) - Date.parse(run.startedAt)), output: { ...run.output, artifactId: artifact.id } })
      run.steps.push({ step: 'GENERATE_BASELINE_ARTIFACT', at: now }, { step: 'COMPLETED', at: now })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }
}
