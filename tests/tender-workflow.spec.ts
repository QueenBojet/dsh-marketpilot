import { expect, it } from 'vitest'
import { setup, evidence } from './helpers.ts'
import { TenderWorkflow } from '../src/workflows/tender.ts'
import { tenderExtraction, tenderReview } from '../src/domain/tender-analysis.ts'
import { harnessOutputSchema } from '../src/adapters/harness-model.ts'
import type { ModelStructuredOutputAdapter } from '../src/adapters/contracts.ts'

const signal = () => new AbortController().signal
const model = (data: unknown): ModelStructuredOutputAdapter => ({ async generate({ schema }) { return schema.parse(data) } })

it('does not mark parameter clause compliant without evidence', async () => {
  const { services: s, project: p } = await setup()
  const doc = await s.documents.add(p.id, { name: 'tender.md', kind: 'tender', textContent: '须提供最小检漏率检测报告和型号认证。' })
  const extraction = { clauses: [{ clauseId: 'T-01', originalText: doc.textContent, normalizedRequirement: '须证明最小检漏率与认证',
    sourceDocumentId: doc.id, sourceLocator: '第 1 条', claimKinds: ['technical_parameter', 'certification'] }] }
  expect((await new TenderWorkflow(s, model(extraction)).extract(p.id, [doc.id], signal())).status).toBe('completed')
  const clause = s.tender.list(p.id)[0]!
  const draft = { items: [{ id: clause.id, responseDraft: '完全符合', status: 'compliant', requirementIds: [], evidenceIds: [], risk: null, action: null }] }
  const run = await new TenderWorkflow(s, model(draft)).review(p.id, [clause.id], signal())
  expect(run.status).toBe('completed')
  expect(s.tender.get(p.id, clause.id)).toMatchObject({ status: 'unknown', action: expect.stringContaining('证据') })
  expect(s.artifacts.list(p.id)[0]?.content).toContain('unknown')
  const source = await s.evidence.add(p.id, evidence)
  const cited = { items: draft.items.map(item => ({ ...item, evidenceIds: [source.id] })) }
  await new TenderWorkflow(s, model(cited)).review(p.id, [clause.id], signal())
  expect(s.tender.get(p.id, clause.id).status).toBe('unknown')
  await s.evidence.verify(p.id, source.id, { method: 'human', targetKind: 'SOURCE', statement: source.statement })
  await new TenderWorkflow(s, model(cited)).review(p.id, [clause.id], signal())
  expect(s.tender.get(p.id, clause.id).status).toBe('compliant')
})

it('rejects fabricated clauses and incomplete review batches without partial updates', async () => {
  const { services: s, project: p } = await setup()
  const doc = await s.documents.add(p.id, { name: 'tender.txt', kind: 'tender', textContent: '真实条款' })
  const fabricated = { clauses: [{ clauseId: '1', originalText: '不存在的条款', normalizedRequirement: '不存在',
    sourceDocumentId: doc.id, sourceLocator: '第 1 条', claimKinds: ['general'] }] }
  await expect(new TenderWorkflow(s, model(fabricated)).extract(p.id, [doc.id], signal())).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' })
  expect(s.tender.list(p.id)).toEqual([])
  const a = await s.tender.add(p.id, { originalText: '条款 A', normalizedRequirement: '条款 A', claimKinds: ['general'], status: 'unknown', requirementIds: [], evidenceIds: [] })
  const b = await s.tender.add(p.id, { originalText: '条款 B', normalizedRequirement: '条款 B', claimKinds: ['general'], status: 'unknown', requirementIds: [], evidenceIds: [] })
  const partial = { items: [{ id: a.id, responseDraft: '无须响应', status: 'not_applicable', requirementIds: [], evidenceIds: [], risk: null, action: null }] }
  await expect(new TenderWorkflow(s, model(partial)).review(p.id, [a.id, b.id], signal())).rejects.toMatchObject({ code: 'INCOMPLETE_REVIEW' })
  expect(s.tender.get(p.id, a.id).status).toBe('unknown')
})

it('supports real Harness schemas for tender output', () => {
  expect(() => harnessOutputSchema(tenderExtraction)).not.toThrow()
  expect(() => harnessOutputSchema(tenderReview)).not.toThrow()
})
