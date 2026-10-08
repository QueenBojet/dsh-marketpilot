import { expect, it, vi } from 'vitest'
import { setup } from './helpers.ts'
import { ResearchWorkflow } from '../src/workflows/research.ts'
import { competitorExtraction, policyExtraction } from '../src/domain/research-analysis.ts'
import { harnessOutputSchema } from '../src/adapters/harness-model.ts'
import { HarnessResearch } from '../src/adapters/harness-research.ts'
import type { ModelStructuredOutputAdapter } from '../src/adapters/contracts.ts'

const model = (raw: unknown): ModelStructuredOutputAdapter => ({ async generate({ schema }) { return schema.parse(raw) } })
const signal = () => new AbortController().signal

it('stores exact-model quotations as draft SOURCE and missing parameters as UNKNOWN', async () => {
  const { services: s, project: p } = await setup()
  const doc = await s.documents.add(p.id, { name: 'synthetic.md', kind: 'competitor_datasheet',
    textContent: '合成厂家 A 型号 A-1。A-1 接口为以太网。A-2 量程为 100 m。' })
  const raw = { competitors: [{ company: '合成厂家 A', product: 'A-1', sourceDocumentId: doc.id, sourceLocator: '身份', quote: '合成厂家 A 型号 A-1。',
    claims: [{ category: 'interface', name: '接口', value: '以太网', quote: 'A-1 接口为以太网。', sourceDocumentId: doc.id, sourceLocator: '接口' },
      { category: 'performance', name: '量程', value: null, quote: null, sourceDocumentId: doc.id, sourceLocator: '全文未列出' }] }], gaps: [] }
  const run = await new ResearchWorkflow(s, model(raw)).start(p.id, [doc.id], 'competitor', signal())
  expect(run.status).toBe('completed')
  expect(s.competitors.list(p.id)[0]).toMatchObject({ product: 'A-1', interfaces: ['以太网'], performance: { 量程: null } })
  expect(s.evidence.list(p.id).map(e => [e.kind, e.status])).toEqual([['SOURCE', 'draft'], ['SOURCE', 'draft'], ['UNKNOWN', 'draft']])
  const bad = structuredClone(raw)
  Object.assign(bad.competitors[0]!.claims[1]!, { value: '100 m', quote: 'A-2 量程为 100 m。' })
  await expect(new ResearchWorkflow(s, model(bad)).start(p.id, [doc.id], 'competitor', signal())).rejects.toMatchObject({ code: 'MODEL_PARAMETER_INHERITANCE' })
  expect(s.competitors.list(p.id)).toHaveLength(1)
  expect(s.evidence.list(p.id)).toHaveLength(3)
})

it('allows an honest empty report and extracts policy requirements with source evidence', async () => {
  const { services: s, project: p } = await setup()
  const doc = await s.documents.add(p.id, { name: 'example.md', kind: 'standard', textContent: '演示标准：事件应留存。' })
  await new ResearchWorkflow(s, model({ competitors: [], gaps: ['报告没有具体厂家型号。'] })).start(p.id, [doc.id], 'competitor', signal())
  expect(s.competitors.list(p.id)).toEqual([])
  expect(s.evidence.list(p.id)[0]?.kind).toBe('UNKNOWN')
  const raw = { policies: [{ title: '演示标准', issuer: null, documentNumber: null, version: null,
    mandatoryLevel: 'unknown', keyRequirements: ['事件应留存'], sourceDocumentId: doc.id, sourceLocator: '全文', quote: doc.textContent }], gaps: [] }
  await new ResearchWorkflow(s, model(raw)).start(p.id, [doc.id], 'policy', signal())
  expect(s.policies.list(p.id)[0]).toMatchObject({ mandatoryLevel: 'unknown', evidenceIds: [expect.any(String)] })
})

it('fetches search result bodies and never treats titles or generated summaries as facts', async () => {
  const fetch = vi.fn(async () => ({ url: 'https://example.com/datasheet', statusCode: 200,
    body: { kind: 'text' as const, content: '厂家原始正文' }, truncated: false }))
  const adapter = new HarnessResearch({ search: async () => ({ sources: [{ url: 'https://example.com', title: '搜索标题' }],
    content: '搜索模型生成的结论', truncated: false }), fetch })
  const hits = await adapter.search('型号', signal())
  expect(hits[0]?.text).toBe('厂家原始正文')
  const { services: s, project: p } = await setup()
  await s.research.importSearch(p.id, hits)
  expect(s.evidence.list(p.id)[0]).toMatchObject({ kind: 'SOURCE', status: 'draft', statement: '厂家原始正文' })
  fetch.mockResolvedValueOnce({ url: 'https://example.com', statusCode: 403, body: { kind: 'text', content: 'Denied' }, truncated: false })
  await expect(adapter.search('型号', signal())).rejects.toMatchObject({ code: 'RESEARCH_FETCH_FAILED' })
})

it('projects research schemas through Harness', () => {
  expect(() => harnessOutputSchema(competitorExtraction)).not.toThrow()
  expect(() => harnessOutputSchema(policyExtraction)).not.toThrow()
})
