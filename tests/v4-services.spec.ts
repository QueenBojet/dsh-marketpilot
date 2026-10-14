import { describe, expect, it } from 'vitest'
import { setup } from './helpers.ts'
import type { ModelStructuredOutputAdapter } from '../src/adapters/contracts.ts'
import type { RunDeps, WebLike } from '../src/services/v4/base.ts'

const route = { provider: 'test', model: 'fake-model', source: 'override' as const }
/** Deterministic fake model: each call takes the next canned answer and validates it with the real schema. */
function fakeModel(queue: unknown[]): ModelStructuredOutputAdapter {
  return { async generate({ schema }) { return schema.parse(queue.shift()) } }
}
function deps(queue: unknown[], web?: WebLike): RunDeps {
  return { model: fakeModel(queue), route, signal: new AbortController().signal, ...web ? { web } : {} }
}
const BODY = '<html><body><h1>标准</h1><p>甲烷开路激光监测仪在 100 米光程下检测下限可达 5 ppm·m，响应时间小于 1 秒。</p></body></html>'
const web: WebLike = {
  async search() { return { sources: [{ url: 'https://example.org/ok', title: '公开资料' }, { url: 'https://example.org/down', title: '不可达' }] } },
  async fetch({ url }) {
    if (url.endsWith('/down')) throw new Error('ECONNREFUSED')
    return { url, statusCode: 200, body: { content: BODY } }
  },
}
const file = (name: string, textContent: string) => ({ name, kind: 'customer_requirement', mimeType: 'text/plain', textContent })
const DOC1 = '系统应连续监测厂界甲烷浓度。\n报警响应时间不超过 5 秒。\n监测点位不少于 4 个。'
const DOC2 = '系统应连续监测厂界甲烷浓度。\n报警响应时间不超过 2 秒。\n监测点位不少于 4 个。\n新增：数据需上传至园区平台。'

async function story() {
  const h = await setup()
  const s = h.services, v4 = s.v4, id = h.project.id
  // 1. intake → light rule hints only; adopting creates *proposed* requirements
  const batch = await v4.intake.intake(id, { label: '第一批', sourceNote: '客户邮件', files: [file('需求.txt', DOC1)] })
  expect(batch.changes).toBeGreaterThan(0)
  const pending = h.repository.get(id)!.v4!.changes.filter(c => c.status === 'pending')
  const adopted = await v4.intake.act(id, { changeIds: pending.map(c => c.id), action: 'adopt' })
  expect(h.repository.get(id)!.requirements.filter(r => adopted.requirementIds.includes(r.id)).every(r => r.status === 'proposed')).toBe(true)
  await s.requirements.confirm(id, adopted.requirementIds)
  return { ...h, s, v4, id, reqIds: adopted.requirementIds }
}

async function toPublishable() {
  const h = await story()
  const { s, v4, id, reqIds } = h
  const [a, b] = await s.alternatives.addMany(id, [
    { name: '开路激光路线', summary: '激光对射覆盖厂界。', components: ['激光监测仪'], strengths: [], limitations: [], risks: [], unknowns: [], requirementCoverage: {}, evidenceIds: [] },
    { name: '点式传感路线', summary: '点式传感器组网。', components: ['点式传感器'], strengths: [], limitations: [], risks: [], unknowns: [], requirementCoverage: {}, evidenceIds: [] },
  ])
  await v4.solution.selectDraftRoute(id, { alternativeId: b!.id })
  expect(v4.solution.route(id).confirmed).toBe(false)
  await v4.route.confirmRoute(id, { alternativeId: a!.id, decision: 'selected', rationale: '人工比较后选择。', requirementIds: reqIds, evidenceIds: [] })
  expect(v4.solution.route(id)).toMatchObject({ confirmed: true, draftAlternativeId: a!.id })
  const item = await v4.solution.addConfig(id, { group: '感知层', name: '激光监测仪', quantity: 4, unit: '台' })
  const line = await v4.solution.addCostLine(id, { category: 'equipment', name: '激光监测仪', configItemIds: [item.id], quantityMode: 'follow_config',
    unit: '台', unitPrice: '1000', currency: 'CNY', sourceType: 'test_data', note: '测试数据' })
  await v4.solution.reviewCost(id, { kind: 'cost_draft' })
  const tech = await v4.docs.create(id, { kind: 'technical' })
  await v4.docs.review(id, tech.doc.id)
  const cost = await v4.docs.create(id, { kind: 'cost' })
  await v4.docs.review(id, cost.doc.id)
  return { ...h, alts: [a!, b!], item, line, tech: tech.doc.id, costDoc: cost.doc.id }
}

describe('V4 services', () => {
  it('reports duplicate files instead of re-importing them', async () => {
    const { v4, id } = await story()
    const again = await v4.intake.intake(id, { label: '重复', files: [file('副本.txt', DOC1)] })
    expect(again.documentIds).toEqual([])
    expect(again.duplicates[0]).toContain('副本.txt')
    await expect(v4.intake.deepAnalyze(id, again.batchId, deps([]))).rejects.toMatchObject({ code: 'NOTHING_TO_ANALYZE' })
  })

  it('keeps only locatable deep-analysis changes and records the model route on the run', async () => {
    const { v4, id, repository, reqIds } = await story()
    const b = await v4.intake.intake(id, { label: '第二批', files: [file('补充.txt', DOC2)] })
    const out = await v4.intake.deepAnalyze(id, b.batchId, deps([{ changes: [
      { kind: 'modified', newText: '报警响应时间不超过 2 秒。', summary: '响应时间收紧', oldRequirementId: reqIds[1] },
      { kind: 'added', newText: '这句话不在原文中', summary: '编造' },
    ] }]))
    expect(out).toMatchObject({ changes: 1, rejected: 1 })
    const run = repository.get(id)!.v4!.runs.find(r => r.id === out.runId)!
    expect(run).toMatchObject({ status: 'completed', modelRoute: route, kind: 'deep_change' })
  })

  it('stores web sources as fetched only when a body came back, and drops unlocatable quotes', async () => {
    const { v4, id, repository } = await story()
    const q = await v4.research.addQuestion(id, { title: '激光监测仪检测下限' })
    await v4.research.savePlan(id, q.id, { steps: ['查阅公开资料'], mode: 'both', queries: ['开路激光 甲烷 检测下限'] }, '工程师')
    const res = await v4.research.research(id, q.id, deps([{ report: '## 结论\n检测下限约 5 ppm·m。', findings: [
      { statement: '检测下限 5 ppm·m', sourceKind: 'web', sourceIndex: 1, quote: '检测下限可达 5 ppm·m' },
      { statement: '编造的引用', sourceKind: 'document', sourceIndex: 0, quote: '原文没有这一句' },
    ] }], web))
    expect(res.webStatus).toBe('partial')
    const state = repository.get(id)!.v4!
    expect(state.sources.map(x => x.status).sort()).toEqual(['failed', 'fetched'])
    expect(state.sources.find(x => x.status === 'fetched')!.snapshot).not.toContain('<p>')
    const [good, bad] = state.findings
    expect(good!.source).toMatchObject({ type: 'web' })
    expect(bad).toMatchObject({ source: { type: 'none' }, needsReview: true })
    await expect(v4.research.reviewFindings(id, { findingIds: [bad!.id], kind: 'verification', value: 'verified' })).rejects.toMatchObject({ code: 'SOURCE_REQUIRED' })
    // adoption and verification are separate judgements
    await v4.research.reviewFindings(id, { findingIds: [good!.id], kind: 'adoption', value: 'adopted' })
    expect(repository.get(id)!.v4!.findings[0]).toMatchObject({ adoption: 'adopted', verification: 'unverified' })
  })

  it('reports web as unavailable instead of faking it, and refuses a manual finding whose quote is not in the material', async () => {
    const { v4, id, repository } = await story()
    const q = await v4.research.addQuestion(id, { title: '点位数量' })
    const res = await v4.research.research(id, q.id, deps([{ report: '依据需求文件。', findings: [] }]), 'both')
    expect(res.webStatus).toBe('unavailable')
    const docId = repository.get(id)!.documents[0]!.id
    await expect(v4.research.addFinding(id, { statement: 'x', source: { type: 'document', documentId: docId, quote: '不存在的句子' } }))
      .rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
    const f = await v4.research.addFinding(id, { statement: '点位≥4', source: { type: 'document', documentId: docId, quote: '监测点位不少于 4 个' } })
    expect(f.source.quoteHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('records cancelled and interrupted runs honestly', async () => {
    const { v4, id, repository } = await story()
    const ac = new AbortController()
    const model: ModelStructuredOutputAdapter = { async generate() { ac.abort(); throw new Error('aborted') } }
    await expect(v4.research.chat(id, { thread: 't1', content: '你好' }, { model, route, signal: ac.signal })).rejects.toThrow()
    const st = repository.get(id)!.v4!
    expect(st.runs.at(-1)!.status).toBe('cancelled')
    expect(st.messages.at(-1)!.status).toBe('cancelled')
    await expect(v4.research.chat(id, { thread: 't1', content: '你好' }, { route, signal: new AbortController().signal })).rejects.toMatchObject({ code: 'MODEL_ADAPTER_UNAVAILABLE' })
  })

  it('blocks supplier verification for test prices and invalidates cost review when inputs change', async () => {
    const { v4, id, item } = await toPublishable()
    let cost = v4.solution.cost(id)
    expect(cost.result.totalDisplay).toBeDefined()
    expect(cost.reviews.cost_draft).toBe('valid')
    expect(cost.checks.supplier_verified.join()).toContain('测试数据')
    await expect(v4.solution.reviewCost(id, { kind: 'supplier_verified' })).rejects.toMatchObject({ code: 'REVIEW_BLOCKED' })
    await v4.solution.updateConfig(id, item.id, { quantity: 6 })
    cost = v4.solution.cost(id)
    expect(cost.reviews.cost_draft).toBe('stale')
    expect(cost.result.lines[0]!.quantity).toBe(6)
    await expect(v4.solution.addCostLine(id, { category: 'other', name: '负数', unit: '项', quantity: -1 })).rejects.toThrow()
    await expect(v4.solution.addCostLine(id, { category: 'other', name: '小数', unit: '项', quantity: 1.5 })).rejects.toThrow()
  })

  it('hides the total when a foreign currency has no FX rate', async () => {
    const { v4, id } = await toPublishable()
    await v4.solution.addCostLine(id, { category: 'service', name: '进口服务', unit: '项', quantity: 1, unitPrice: '10', currency: 'USD', sourceType: 'internal_estimate' })
    const cost = v4.solution.cost(id)
    expect(cost.result.missingFx).toEqual(['USD'])
    expect(cost.result.total).toBeUndefined()
    expect(v4.baselines.checks(id, 'full').join()).toContain('汇率')
  })

  it('never overwrites a human-edited section on refresh and invalidates the review on edit', async () => {
    const { v4, id, tech, item } = await toPublishable()
    let view = await v4.docs.editSection(id, tech, 'config', { content: '## 人工改写\n人工内容。' })
    expect(view.review).toBe('stale')
    await v4.solution.updateConfig(id, item.id, { name: '激光监测仪 II 型' })
    const refreshed = await v4.docs.refresh(id, tech)
    view = v4.docs.view(id, tech)
    const sec = view.doc.sections.find(s => s.key === 'config')!
    expect(sec.content).toContain('人工内容')
    expect(sec.proposal?.content).toContain('II 型')
    expect(refreshed.proposed).toBe(1)
    await expect(v4.docs.review(id, tech)).rejects.toMatchObject({ code: 'REVIEW_BLOCKED' })
    await v4.docs.decideProposals(id, tech, { keys: ['config'], accept: false })
    view = await v4.docs.review(id, tech)
    expect(view.review).toBe('valid')
  })

  it('exports real OOXML and only allows "sent" for a reviewed, exported version', async () => {
    const { v4, id, tech } = await toPublishable()
    await expect(v4.docs.markSent(id, tech, { recipient: '客户', channel: '邮件' })).rejects.toMatchObject({ code: 'REVIEW_BLOCKED' })
    const out = await v4.docs.exportDocx(id, tech)
    expect(String.fromCharCode(out.bytes[0]!, out.bytes[1]!)).toBe('PK')
    expect(out.reviewed).toBe(true)
    const view = await v4.docs.markSent(id, tech, { recipient: '客户', channel: '邮件' })
    expect(view.doc.sent).toHaveLength(1)
  })

  it('blocks publishing until gates pass and keeps the technical baseline free of cost', async () => {
    const { v4, id } = await story()
    await expect(v4.baselines.publish(id, { type: 'technical' })).rejects.toMatchObject({ code: 'PUBLISH_BLOCKED' })
    expect(v4.baselines.checks(id, 'technical').join()).toContain('路线')
  })

  it('marks runs left running by a crash as failed with an interruption reason', async () => {
    const { v4, id, repository } = await story()
    const b = await v4.intake.intake(id, { label: '第二批', files: [file('补充.txt', DOC2)] })
    let release!: () => void
    const hang: ModelStructuredOutputAdapter = { generate: () => new Promise((_, reject) => { release = () => reject(new Error('process exited')) }) }
    const pending = v4.intake.deepAnalyze(id, b.batchId, { model: hang, route, signal: new AbortController().signal })
    await new Promise(r => setTimeout(r, 20))
    expect(repository.get(id)!.v4!.runs.at(-1)!.status).toBe('running')
    const recovered = await v4.recoverInterrupted()
    expect(recovered).toBeGreaterThan(0)
    expect(repository.get(id)!.v4!.runs.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('中断') })
    expect(repository.get(id)!.v4!.intakeBatches.at(-1)!.status).toBe('failed')
    release()
    await pending.catch(() => undefined)
  })

  it('publishes immutable V1/V2 baselines and diffs them at business level', async () => {
    const { v4, id, repository, line, tech, costDoc, reqIds } = await toPublishable()
    expect(v4.baselines.checks(id, 'full')).toEqual([])
    const v1 = await v4.baselines.publish(id, { type: 'full' })
    expect(v1).toMatchObject({ number: 1, label: 'V1', type: 'full' })
    // a price change invalidates cost review and therefore blocks the next full baseline
    await v4.solution.updateCostLine(id, line.id, { unitPrice: '1200' })
    expect(v4.baselines.checks(id, 'full').join()).toContain('成本草稿')
    await v4.solution.reviewCost(id, { kind: 'cost_draft' })
    await v4.docs.refresh(id, costDoc)
    await v4.docs.review(id, costDoc)
    await v4.docs.refresh(id, tech)
    await v4.docs.review(id, tech)
    const v2 = await v4.baselines.publish(id, { type: 'full', note: '价格调整' })
    expect(v2.number).toBe(2)
    const diff = v4.baselines.diff(id, v1.id, v2.id)
    expect(diff.cost?.lines.changed[0]?.changes.join()).toContain('1000 → 1200')
    expect(diff.route).toBeNull()
    // published snapshots survive and any V4 mutation touching them is rejected
    expect(v4.baselines.get(id, v1.id).snapshotHash).toBe(v1.snapshotHash)
    const guarded = v4.baselines as unknown as { mutate(pid: string, fn: (s: { v4: { baselines: { label: string }[] } }) => void): Promise<unknown> }
    await expect(guarded.mutate(id, s => { s.v4.baselines[0]!.label = 'X' })).rejects.toMatchObject({ code: 'BASELINE_IMMUTABLE' })
    await expect(guarded.mutate(id, s => { s.v4.baselines.pop() })).rejects.toMatchObject({ code: 'BASELINE_IMMUTABLE' })
    expect(repository.get(id)!.v4!.baselines.map(b => b.label)).toEqual(['V1', 'V2'])
    // config patches must not wipe links that were not part of the patch
    const linked = await v4.solution.addConfig(id, { group: '平台', name: '数据网关', quantity: 1, unit: '套', requirementIds: [reqIds[0]!] })
    expect((await v4.solution.updateConfig(id, linked.id, { quantity: 2 })).requirementIds).toEqual([reqIds[0]])
  })
})
