/**
 * V4 acceptance (spec §7.1): a synthetic CALM-like story driven end to end over the HTTP API,
 * including the human gates, a second intake batch, V1/V2 publishing, diff and a storage restart.
 * All prices are test data; no web or model is available, which must be reported, not faked.
 */
import { describe, expect, it } from 'vitest'
import { storageAt } from './helpers.ts'
import { BATCH1, BATCH2, harness, intakeAndAdopt, run, runExpectingFailure } from './v4-harness.ts'
import type { Json } from './v4-harness.ts'

describe('V4 acceptance §7.1 synthetic story (isolated storage, synthetic data only)', () => {
  it('walks intake → research → route → cost → DOCX → V1 → second batch → V2 → diff → restart', async () => {
    const { call, project, directory, root } = await harness()
    const pid = project.id
    const ov = async () => (await call('GET', `projects/${pid}/v4/overview`)).body as Json

    // 1. first batch: light rule hints, human adoption and confirmation
    const first = await intakeAndAdopt(call, pid, '第一批资料', BATCH1)

    // 2. research: without a model the run fails honestly and records no sources
    const question = (await call('POST', `projects/${pid}/v4/questions`, { title: '厂界甲烷监测点位如何布设？' })).body
    const failed = await runExpectingFailure(call, pid, 'marketpilot_v4_research_run', { questionId: question.id, mode: 'both' })
    expect(failed.status).not.toBe('completed')
    expect(String(failed.error ?? '')).toMatch(/MODEL|模型/)
    expect((await ov()).v4.sources).toEqual([])
    const finding = await call('POST', `projects/${pid}/v4/findings`, { statement: '监测点位至少 4 个', source: { type: 'document', documentId: first.documentId, quote: '监测点位不少于 4 个' } })
    expect(finding.status, JSON.stringify(finding.body)).toBe(201)

    // 3. two candidate routes, draft selection, human decision and configuration
    const altA = (await call('POST', `projects/${pid}/v4/alternatives`, { name: '开路激光路线', summary: '激光对射覆盖厂界。', components: ['激光监测仪'] })).body as unknown as Json[]
    const altB = (await call('POST', `projects/${pid}/v4/alternatives`, { name: '点式传感器路线', summary: '点式传感器网格布设。', components: ['点式传感器'] })).body as unknown as Json[]
    expect(altA[0]!.id).not.toBe(altB[0]!.id)
    expect((await call('PUT', `projects/${pid}/v4/route/draft`, { alternativeId: altA[0]!.id })).status).toBe(200)
    const confirmRoute = async () => {
      const reqs = ((await ov()).requirements as Json[]).filter(r => r.status === 'confirmed').map(r => r.id as string)
      await run(call, pid, 'marketpilot_v4_route_confirm', { input: { alternativeId: altA[0]!.id, decision: '选定路线：开路激光路线', rationale: '合成样例中的人工比选。', requirementIds: reqs, evidenceIds: [] } })
    }
    await confirmRoute()
    const item = (await call('POST', `projects/${pid}/v4/config`, { group: '感知层', name: '激光监测仪', quantity: 4, unit: '台' })).body

    // 4. test prices are flagged and block supplier verification
    const line = (await call('POST', `projects/${pid}/v4/cost-lines`, { category: 'equipment', name: '激光监测仪', configItemIds: [item.id], quantityMode: 'follow_config', unit: '台', unitPrice: '1000', sourceType: 'test_data' })).body
    await run(call, pid, 'marketpilot_v4_cost_review', { input: { kind: 'cost_draft' } })
    const cost1 = (await call('GET', `projects/${pid}/v4/cost`)).body as Json
    expect(cost1.result.lines[0].quantity).toBe(4)
    expect(cost1.result.testData).toBe(1)
    expect((cost1.checks.supplier_verified as string[]).join()).toContain('测试数据')

    // 5. templated DOCX, reviews and V1
    const docIds: string[] = []
    for (const kind of ['technical', 'cost']) {
      const created = (await call('POST', `projects/${pid}/v4/docs`, { kind })).body as Json
      expect(created.doc?.id, JSON.stringify(created)).toBeTruthy()
      docIds.push(created.doc.id as string)
      await run(call, pid, 'marketpilot_v4_doc_review', { docId: created.doc.id })
      const dl = await call('GET', `projects/${pid}/v4/docs/${created.doc.id as string}/docx`)
      expect(dl.raw.subarray(0, 2).toString()).toBe('PK')
      expect(dl.headers['x-marketpilot-reviewed']).toBe('true')
    }
    expect((await call('GET', `projects/${pid}/v4/checks?type=full`)).body.blockers).toEqual([])
    await run(call, pid, 'marketpilot_v4_baseline_publish', { input: { type: 'full', note: 'V1（合成样例）' } })

    // 6. second batch: only the differences are proposed and adopted by a human
    await intakeAndAdopt(call, pid, '第二批资料', BATCH2)

    // 7. price change invalidates reviews; redo reviews and publish V2
    expect((await call('PATCH', `projects/${pid}/v4/cost-lines/${line.id as string}`, { unitPrice: '1200' })).status).toBe(200)
    const cost2 = (await call('GET', `projects/${pid}/v4/cost`)).body as Json
    expect(cost2.reviews.cost_draft).toBe('stale')
    const stale = (await call('GET', `projects/${pid}/v4/checks?type=full`)).body.blockers as string[]
    expect(stale.length).toBeGreaterThan(0)
    if (!(await ov()).route.confirmed) await confirmRoute()
    await run(call, pid, 'marketpilot_v4_cost_review', { input: { kind: 'cost_draft' } })
    for (const id of docIds) {
      expect((await call('POST', `projects/${pid}/v4/docs/${id}/refresh`)).status).toBe(200)
      await run(call, pid, 'marketpilot_v4_doc_review', { docId: id })
    }
    expect((await call('GET', `projects/${pid}/v4/checks?type=full`)).body.blockers).toEqual([])
    await run(call, pid, 'marketpilot_v4_baseline_publish', { input: { type: 'full', note: 'V2（合成样例）' } })

    // 8. business-level diff, then persistence across a restart
    const list = (await call('GET', `projects/${pid}/v4/baselines`)).body.baselines as Json[]
    expect(list.map(b => b.label)).toEqual(['V1', 'V2'])
    const diff = (await call('GET', `projects/${pid}/v4/diff?a=${list[0]!.id as string}&b=${list[1]!.id as string}`)).body as Json
    expect(JSON.stringify(diff.cost.lines.changed)).toContain('1000 → 1200')
    expect(JSON.stringify(diff)).toContain('2 秒')
    await root.fiber.dispose()
    const reopened = await storageAt(directory, 'sqlite')
    try {
      const saved = await reopened.repository.get(pid)
      expect(saved?.v4?.baselines.map((b: Json) => b.label)).toEqual(['V1', 'V2'])
    } finally { await reopened.close() }
  }, 60_000)
})
