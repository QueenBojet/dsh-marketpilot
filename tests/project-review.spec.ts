import { describe, expect, it } from 'vitest'
import { evidenceReviewGroup, projectReviewOverview } from '../src/domain/project-review.ts'
import { fields, run, withInputs, withSolution, workflowState } from './workflow-fixtures.ts'
describe('M2 read-only review', () => {
  it('separates two batches and marks the older wait as history', () => {
    const s = withInputs(workflowState()); s.requirements[0]!.status = 'proposed'
    s.requirements.push({ ...s.requirements[0]!, id: 'req2' })
    s.workflowRuns.push({ ...run('b1', 'requirement_analysis', 'waiting_human'), output: { requirementIds: ['req1'] } },
      { ...run('b2', 'requirement_analysis', 'waiting_human'), startedAt: '2026-10-11T02:00:00.000Z', output: { requirementIds: ['req2', 'foreign'] } })
    const p = projectReviewOverview(s)
    expect(p.batches[0]).toMatchObject({ id: 'b2', requirementIds: ['req2'], proposedIds: ['req2'], superseded: false })
    expect(p.batches[1]).toMatchObject({ id: 'b1', superseded: true, proposedIds: ['req1'] })
  })
  it('keeping UNKNOWN verified is still a supplementation action; rejection stays rejected', () => {
    expect(evidenceReviewGroup({ kind: 'UNKNOWN', status: 'verified' })).toBe('needs_support')
    expect(evidenceReviewGroup({ kind: 'UNKNOWN', status: 'rejected' })).toBe('rejected')
    expect(evidenceReviewGroup({ kind: 'SOURCE', status: 'draft' })).toBe('pending')
  })
  it('preserves codeBook, UNKNOWN, Decisions and artifacts while reporting possible impact', () => {
    const s = withSolution(); s.codeBook = { codes: { req1: 'REQ-47', e1: 'EVD-82' }, seq: {} }
    s.evidence.push({ ...fields('e1'), updatedAt: '2026-10-11T03:00:00.000Z', kind: 'UNKNOWN', status: 'verified', title: 'Test', statement: 'Test only', sourceType: 'model', supportingEvidenceIds: [], relatedRequirementIds: ['req1', 'foreign'], relatedCompetitorIds: [], relatedAlternativeIds: [] })
    const before = structuredClone(s); const p = projectReviewOverview(s)
    expect(p.evidenceCounts.needs_support).toBe(1)
    expect(p.links.req1?.[0]?.code).toBe('EVD-82'); expect(p.links.foreign).toBeUndefined()
    expect(p.recordCodes).toMatchObject({ req1: 'REQ-47', e1: 'EVD-82' })
    expect(p.impacts.every(i => i.possiblyStale)).toBe(true); expect(s).toEqual(before)
  })
})
