import type { createServices } from '../services/index.ts'
import type { ModelStructuredOutputAdapter } from '../adapters/contracts.ts'
import { ids } from '../domain/common.ts'
import { tenderExtraction, tenderReview } from '../domain/tender-analysis.ts'
import { WorkflowExecution } from './execution.ts'

export class TenderWorkflow {
  constructor(private readonly services: ReturnType<typeof createServices>, private readonly model: ModelStructuredOutputAdapter,
    private readonly lifecycle = services.workflows) {}
  async extract(projectId: string, documentIds: string[], signal: AbortSignal) {
    const selected = ids.min(1).parse(documentIds)
    const run = await this.lifecycle.start(projectId, { type: 'tender_review', input: { documentIds: selected, phase: 'extract' } })
    const exec = new WorkflowExecution(projectId, run.id, this.lifecycle, this.model, signal)
    try {
      await exec.step('PARSE_CLAUSES')
      const { version } = this.services.generation.snapshot(projectId)
      const documents = selected.map(id => this.services.documents.get(projectId, id))
      const output = await exec.generate('tender-extract', tenderExtraction, { documents })
      await exec.step('NORMALIZE')
      await exec.step('SAVE')
      return await this.services.tender.saveExtraction(projectId, run.id, version, output)
    } catch (error) { return exec.failed(error) }
  }
  async review(projectId: string, tenderItemIds: string[], signal: AbortSignal) {
    const selected = ids.min(1).parse(tenderItemIds)
    const run = await this.lifecycle.start(projectId, { type: 'tender_review', input: { tenderItemIds: selected, phase: 'review' } })
    const exec = new WorkflowExecution(projectId, run.id, this.lifecycle, this.model, signal)
    try {
      const { version } = this.services.generation.snapshot(projectId)
      const items = selected.map(id => this.services.tender.get(projectId, id))
      const context = this.services.projects.getContext(projectId)
      await exec.step('MATCH_REQUIREMENTS')
      await exec.step('MATCH_EVIDENCE')
      await exec.step('DRAFT_RESPONSE')
      const output = await exec.generate('tender-review', tenderReview, { items, context })
      await exec.step('SET_STATUS')
      await exec.step('VALIDATE_STATUS')
      await exec.step('SAVE')
      return await this.services.tender.saveReview(projectId, run.id, version, output)
    } catch (error) { return exec.failed(error) }
  }
}
