import { artifactInput, type Artifact } from '../domain/artifact.ts'
import { captureArtifactDependencies } from './artifact-context.ts'
import { ensure } from '../domain/common.ts'
import { solutionPrerequisites } from '../domain/state.ts'
import { RecordService, requiredRecord } from './records.ts'
import type { ServiceContext } from './project.ts'

export class ArtifactService extends RecordService<'artifacts'> {
  constructor(ctx: ServiceContext) { super(ctx, 'artifacts') }
  async save(projectId: string, input: unknown) {
    const row: Artifact = { ...artifactInput.parse(input), ...this.ctx.fields(projectId), reviewStatus: 'draft' }
    await this.ctx.repository.update(projectId, s => {
      if (row.type === 'solution') {
        const gate = solutionPrerequisites(s)
        ensure(gate.status === 'ready', gate.status, gate.reason)
      }
      row.dependencies = captureArtifactDependencies(s, row.type)
      s.artifacts.push(row)
    })
    return row
  }
  async update(projectId: string, id: string, input: unknown) {
    const patch = artifactInput.omit({ type: true }).partial().parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      const row = requiredRecord(s, 'artifacts', id)
      Object.assign(row, patch, { reviewStatus: 'draft', updatedAt: this.ctx.now() })
      delete row.review
      // Manual edits have no provable generation snapshot; retain the content, report the gap.
      delete row.dependencies
    })
    return requiredRecord(state, 'artifacts', id)
  }
  async approve(projectId: string, id: string) {
    const { revision, review } = await this.ctx.review(projectId, 'approve_artifact', this.get(projectId, id))
    const state = await this.ctx.repository.update(projectId, s => {
      this.ctx.assertFresh(s, revision)
      Object.assign(requiredRecord(s, 'artifacts', id), { reviewStatus: 'approved', review, updatedAt: this.ctx.now() })
    })
    return requiredRecord(state, 'artifacts', id)
  }
}
