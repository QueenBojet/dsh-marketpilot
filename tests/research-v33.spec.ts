import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { setup } from './helpers.ts'
import { ResearchWorkflow } from '../src/workflows/research.ts'
import { parameterComparison, researchOverview } from '../src/domain/research-review.ts'
import { offlineModel } from '../fixtures/calm/offline-model.ts'
import type { ModelStructuredOutputAdapter } from '../src/adapters/contracts.ts'

const signal = () => new AbortController().signal
const model = (raw: unknown): ModelStructuredOutputAdapter => ({ async generate({ schema }) { return schema.parse(raw) } })
async function comparisonFixture() {
  const test = await setup(), { services: s, project: p } = test
  const doc = await s.documents.add(p.id, { name: 'synthetic comparison.md', kind: 'competitor_datasheet',
    textContent: 'synthetic QA，仅测试，非工程指标。\n演示厂家 A，型号 A-1。\n演示厂家 B，型号 B-1。\nA-1 量程为 25 m，测试条件为静水/水面目标。\nB-1 量程为 35 m，测试条件为静水/水面目标。' })
  const raw = { competitors: ['A', 'B'].map((company, i) => ({ company: `演示厂家 ${company}`, product: `${company}-1`,
    sourceDocumentId: doc.id, sourceLocator: '身份', quote: `演示厂家 ${company}，型号 ${company}-1。`,
    claims: [{ category: 'performance', name: '量程', value: i === 0 ? '25 m' : '35 m', unit: 'm', conditions: '静水/水面目标',
      sourceDocumentId: doc.id, sourceLocator: '合成参数', quote: `${company}-1 量程为 ${i === 0 ? '25' : '35'} m，测试条件为静水/水面目标。` }] })), gaps: [] }
  return { ...test, doc, raw }
}
it('persists the purpose, exact parameter basis and SOURCE references in a real workflow', async () => {
  const { services: s, project: p, repository, doc, raw } = await comparisonFixture()
  const prompts: string[] = []
  const capturing: ModelStructuredOutputAdapter = { async generate({ prompt, schema }) { prompts.push(prompt); return schema.parse(raw) } }
  const run = await new ResearchWorkflow(s, capturing).start(p.id, [doc.id], 'competitor', signal(), '比较准确型号量程与条件')
  expect(run).toMatchObject({ status: 'completed', input: { purpose: '比较准确型号量程与条件', documentIds: [doc.id] } })
  expect(prompts[0]).toContain('比较准确型号量程与条件')
  const state = repository.get(p.id)!, overview = researchOverview(state)
  expect(parameterComparison(overview.competitors, overview.evidence)).toMatchObject([{ comparable: true, unit: 'm', conditions: '静水/水面目标' }])
  expect(overview.evidence.every(e => e.kind === 'SOURCE' && e.status === 'draft')).toBe(true)
  for (const product of overview.competitors) {
    const id = product.parameterContexts!.量程!.evidenceId
    expect(overview.recordCodes[id]).toMatch(/^EVD-/)
    expect(overview.evidence.find(e => e.id === id)?.relatedCompetitorIds).toContain(product.id)
  }
})
it('separates conditions and units, keeps legacy/absent values UNKNOWN, and never inherits another model', async () => {
  const { services: s, project: p, doc, raw } = await comparisonFixture()
  await new ResearchWorkflow(s, model(raw)).start(p.id, [doc.id], 'competitor', signal())
  const rows = s.competitors.list(p.id)
  const otherConditions = structuredClone(rows); otherConditions[1]!.parameterContexts!.量程!.conditions = '流水/水下目标'
  expect(parameterComparison(otherConditions)).toHaveLength(2)
  expect(parameterComparison(otherConditions).every(row => !row.comparable)).toBe(true)
  const otherUnits = structuredClone(rows); otherUnits[1]!.parameterContexts!.量程!.unit = 'cm'
  expect(parameterComparison(otherUnits)).toHaveLength(2)
  expect(parameterComparison(rows.map(({ parameterContexts: _context, ...row }) => row))[0]?.comparable).toBe(false)
  const missing = structuredClone(rows); missing[1]!.performance.量程 = null
  expect(parameterComparison(missing)[0]).toMatchObject({ comparable: false, cells: { [missing[1]!.id]: { value: null } } })
})
it('rejects invented conditions atomically, before any source or product is saved', async () => {
  const { services: s, project: p, doc, raw } = await comparisonFixture()
  raw.competitors[1]!.claims[0]!.conditions = '流水/水下目标'
  await expect(new ResearchWorkflow(s, model(raw)).start(p.id, [doc.id], 'competitor', signal())).rejects.toMatchObject({ code: 'PARAMETER_CONTEXT_UNSUPPORTED' })
  expect(s.competitors.list(p.id)).toEqual([]); expect(s.evidence.list(p.id)).toEqual([])
  expect(s.workflows.list(p.id)[0]?.status).toBe('failed')
})
it('does not label rejected, wrong-product or unsupported quotations as comparable', async () => {
  const { services: s, project: p, doc, raw } = await comparisonFixture()
  await new ResearchWorkflow(s, model(raw)).start(p.id, [doc.id], 'competitor', signal())
  const products = s.competitors.list(p.id), evidence = s.evidence.list(p.id)
  expect(parameterComparison(products, evidence)[0]?.comparable).toBe(true)
  const rejected = structuredClone(evidence); rejected.find(e => e.id === products[0]!.parameterContexts!.量程!.evidenceId)!.status = 'rejected'
  expect(parameterComparison(products, rejected)[0]?.comparable).toBe(false)
  const wrongProduct = structuredClone(evidence); wrongProduct.find(e => e.id === products[0]!.parameterContexts!.量程!.evidenceId)!.relatedCompetitorIds = [products[1]!.id]
  expect(parameterComparison(products, wrongProduct)[0]?.comparable).toBe(false)
  const unsupported = structuredClone(evidence); unsupported.find(e => e.id === products[0]!.parameterContexts!.量程!.evidenceId)!.statement = '未给出参数的摘要'
  expect(parameterComparison(products, unsupported)[0]?.comparable).toBe(false)
})
it('rejects stale inputs and cross-project documents without overwriting research', async () => {
  const { services: s, project: p, doc, raw } = await comparisonFixture()
  const changing: ModelStructuredOutputAdapter = { async generate({ schema }) {
    await s.documents.add(p.id, { name: 'extra.md', kind: 'report', textContent: '新的业务输入' }); return schema.parse(raw)
  } }
  await expect(new ResearchWorkflow(s, changing).start(p.id, [doc.id], 'competitor', signal())).rejects.toMatchObject({ code: 'STALE_CONTEXT' })
  const other = await s.projects.create({ name: 'other' })
  await expect(new ResearchWorkflow(s, model(raw)).start(other.id, [doc.id], 'competitor', signal())).rejects.toThrow()
  expect(s.competitors.list(p.id)).toEqual([]); expect(s.competitors.list(other.id)).toEqual([])
})
it('stores policy scope from quotations and rejects unsupported version or force', async () => {
  const { services: s, project: p } = await setup()
  const quote = 'synthetic QA 演示标准，发行方演示机构，文号 QA-1，版本 2026，适用于固定平台，推荐：事件应留存。'
  const doc = await s.documents.add(p.id, { name: 'synthetic standard.md', kind: 'standard', textContent: quote })
  const raw = { policies: [{ title: '演示标准', issuer: '演示机构', documentNumber: 'QA-1', version: '2026', scope: '固定平台',
    mandatoryLevel: 'recommended', keyRequirements: ['事件应留存'], sourceDocumentId: doc.id, sourceLocator: '全文', quote }], gaps: [] }
  await new ResearchWorkflow(s, model(raw)).start(p.id, [doc.id], 'policy', signal(), '核查政策适用范围')
  expect(s.policies.list(p.id)[0]).toMatchObject({ scope: '固定平台', version: '2026', mandatoryLevel: 'recommended' })
  const invented = structuredClone(raw); invented.policies[0]!.version = '2027'
  await expect(new ResearchWorkflow(s, model(invented)).start(p.id, [doc.id], 'policy', signal())).rejects.toMatchObject({ code: 'POLICY_METADATA_UNSUPPORTED' })
  const force = structuredClone(raw); force.policies[0]!.mandatoryLevel = 'mandatory'
  await expect(new ResearchWorkflow(s, model(force)).start(p.id, [doc.id], 'policy', signal())).rejects.toMatchObject({ code: 'POLICY_FORCE_UNSUPPORTED' })
  expect(s.policies.list(p.id)).toHaveLength(1)
})
it('keeps the existing CALM local fixtures honest through extraction and research projection', async () => {
  const { services: s, project: p, repository } = await setup()
  const textContent = await readFile(new URL('../fixtures/calm/input/synthetic-datasheet.md', import.meta.url), 'utf8')
  const doc = await s.documents.add(p.id, { name: 'synthetic-datasheet.md', kind: 'competitor_datasheet', textContent })
  await new ResearchWorkflow(s, offlineModel).start(p.id, [doc.id], 'competitor', signal(), '核查真实指标缺项')
  await new ResearchWorkflow(s, offlineModel).start(p.id, [doc.id], 'policy', signal(), '确认是否有正式标准')
  const result = researchOverview(repository.get(p.id)!)
  expect(result.competitors.length).toBeGreaterThanOrEqual(2)
  expect(result.policies).toEqual([])
  expect(result.runs.map(run => [run.type, run.status])).toEqual([['competitor_analysis', 'completed'], ['policy_analysis', 'completed']])
  expect(parameterComparison(result.competitors).every(group => !group.comparable)).toBe(true)
  expect(result.evidence.some(e => e.kind === 'UNKNOWN')).toBe(true)
})
