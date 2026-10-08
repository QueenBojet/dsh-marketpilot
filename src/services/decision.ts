import { decisionInput } from '../domain/decision.ts'
import { ensure } from '../domain/common.ts'
import { requiredRecord } from './records.ts'
import type { ServiceContext } from './project.ts'

/** Decisions are append-only human records; generic CRUD cannot select an Alternative. */
export class DecisionService {
  constructor(private readonly ctx: ServiceContext) {}
  list(projectId: string) { return this.ctx.state(projectId).decisions }
  async confirm(projectId: string, input: unknown) {
    const request = decisionInput.parse(input)
    const candidate = requiredRecord(this.ctx.state(projectId), 'alternatives', request.alternativeId)
    ensure(candidate.status === 'candidate', 'NOT_CANDIDATE', '请先提交候选技术路线。')
    const { revision, review } = await this.ctx.review(projectId, 'confirm_decision', { request, candidate })
    const decision = { ...request, ...this.ctx.fields(projectId), confirmedBy: review.reviewer, confirmedAt: review.reviewedAt, review }
    await this.ctx.repository.update(projectId, s => {
      this.ctx.assertFresh(s, revision)
      for (const id of request.requirementIds) ensure(requiredRecord(s, 'requirements', id).status === 'confirmed',
        'UNCONFIRMED_REQUIREMENT', '决策只能引用已确认需求。')
      for (const old of s.alternatives) if (old.status === 'selected') old.status = 'candidate'
      requiredRecord(s, 'alternatives', request.alternativeId).status = 'selected'
      s.decisions.push(decision)
      s.project.activeDecisionId = decision.id
      s.project.status = 'decision_confirmed'
      s.project.updatedAt = this.ctx.now()
      s.evidence.push({ ...this.ctx.fields(projectId), kind: 'DECISION', title: request.decision,
        statement: request.rationale, sourceType: 'human', sourceName: review.reviewer, status: 'verified',
        supportingEvidenceIds: request.evidenceIds, relatedRequirementIds: request.requirementIds,
        relatedAlternativeIds: [request.alternativeId], relatedCompetitorIds: [], decisionId: decision.id,
        verification: { method: 'human', fromKind: 'DECISION', previousStatement: request.rationale, supportingEvidenceIds: request.evidenceIds, review } })
    })
    return decision
  }
}
