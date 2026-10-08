import type { createServices } from '../services/index.ts'
import type { ModelStructuredOutputAdapter } from '../adapters/contracts.ts'
import { ids } from '../domain/common.ts'
import { competitorExtraction, policyExtraction } from '../domain/research-analysis.ts'
import { WorkflowExecution } from './execution.ts'

export class ResearchWorkflow {
  constructor(private readonly services: ReturnType<typeof createServices>, private readonly model: ModelStructuredOutputAdapter,
    private readonly lifecycle = services.workflows) {}
  async start(projectId: string, documentIds: string[], kind: 'competitor' | 'policy', signal: AbortSignal) {
    const selected = ids.min(1).parse(documentIds)
    const run = await this.lifecycle.start(projectId, { type: kind === 'competitor' ? 'competitor_analysis' : 'policy_analysis', input: { documentIds: selected } })
    const exec = new WorkflowExecution(projectId, run.id, this.lifecycle, this.model, signal)
    try {
      await exec.step('LOAD_DOCUMENTS')
      const { version } = this.services.generation.snapshot(projectId)
      const documents = selected.map(id => this.services.documents.get(projectId, id))
      await exec.step('EXTRACT_CANDIDATES')
      if (kind === 'competitor') {
        const result = await exec.generate('competitor-extract', competitorExtraction, { documents })
        await exec.step('VALIDATE_SOURCES_AND_SAVE')
        return await this.services.research.competitors(projectId, run.id, version, result)
      }
      const result = await exec.generate('policy-extract', policyExtraction, { documents })
      await exec.step('VALIDATE_SOURCES_AND_SAVE')
      return await this.services.research.policies(projectId, run.id, version, result)
    } catch (error) { return exec.failed(error) }
  }
}
