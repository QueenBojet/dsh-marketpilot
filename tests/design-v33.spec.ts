import { expect, it, vi } from 'vitest'
import { setup, alternative, confirmedRequirement, evidence, approved } from './helpers.ts'
import { designOverview } from '../src/services/design-overview.ts'
import { captureArtifactDependencies, artifactContext } from '../src/services/artifact-context.ts'
import { businessVersion } from '../src/services/generation.ts'
import { SolutionWorkflow } from '../src/workflows/generation.ts'
import { sectionTitles } from '../src/domain/generation.ts'
import { routeReview } from '../src/domain/route-review.ts'
import { stateSchema } from '../src/domain/state.ts'

async function ready() {
  const h = await setup(), s = h.services, id = h.project.id
  const req = await confirmedRequirement(s, id)
  const routes = await s.alternatives.addMany(id, [
    { ...alternative, requirementCoverage: { [req]: 'partial' } },
    { ...alternative, name: '第二路线', requirementCoverage: { [req]: 'full' } },
  ])
  const decision = await s.decisions.confirm(id, { alternativeId: routes[0]!.id, decision: 'selected', rationale: '显式模拟人工。', requirementIds: [req], evidenceIds: [] })
  return { ...h, req, routes, decision }
}

it('captures the solution dependencies in the existing atomic write and keeps telemetry / approval out of freshness', async () => {
  const { services: s, project: p, repository, req, decision } = await ready()
  const queue: unknown[] = [{ sections: sectionTitles.map(title => ({ title, purpose: '离线验收' })) },
    ...sectionTitles.map(title => ({ title, decisionId: decision.id, claims: [{ text: '建议人工复核。', kind: 'narrative', status: 'suggested', requirementIds: [req], evidenceIds: [] }] }))]
  await new SolutionWorkflow(s, { async generate({ schema }) { return schema.parse(queue.shift()) } }).start(p.id, new AbortController().signal)
  const artifact = s.artifacts.list(p.id)[0]!, before = repository.get(p.id)!
  expect(artifact.dependencies).toEqual(captureArtifactDependencies(before, 'solution'))
  expect(artifact.dependencies?.decisionId).toBe(decision.id)
  await s.workflows.start(p.id, { type: 'competitor_analysis' })
  await s.artifacts.approve(p.id, artifact.id)
  expect(artifactContext(repository.get(p.id)!, s.artifacts.get(p.id, artifact.id)).status).toBe('current')
  const snapshot = designOverview(repository.get(p.id)!)
  expect(snapshot.artifacts[0]?.context.status).toBe('current')
  expect(snapshot.artifacts[0]).not.toHaveProperty('content')
  expect(snapshot.documents.every(row => !('textContent' in row))).toBe(true)
})

it('detects requirement and evidence changes without relying on timestamps and never rewrites archived content or codes', async () => {
  const { services: s, project: p, repository } = await ready()
  const source = await s.evidence.add(p.id, evidence)
  const artifact = await s.artifacts.save(p.id, { name: 'Solution.md', type: 'solution', format: 'markdown', content: '# 存档事实' })
  const originalCodes = repository.get(p.id)!.codeBook?.codes, originalContent = artifact.content
  await confirmedRequirement(s, p.id)
  await s.evidence.verify(p.id, source.id, { method: 'human', targetKind: 'SOURCE', statement: source.statement })
  const snapshot = designOverview(repository.get(p.id)!)
  expect(snapshot.artifacts[0]?.context).toMatchObject({ status: 'possibly_stale', changed: ['requirements', 'sources'] })
  expect(s.artifacts.get(p.id, artifact.id).content).toBe(originalContent)
  for (const [id, code] of Object.entries(originalCodes ?? {})) expect(snapshot.recordCodes[id]).toBe(code)
})

it('retains generation-time Decision after a new human selection and does not invalidate a freshly saved version', async () => {
  const { services: s, project: p, repository, routes, req, decision } = await ready()
  const old = await s.artifacts.save(p.id, { name: '旧方案', type: 'solution', format: 'markdown', content: '历史正文' })
  const newerDecision = await s.decisions.confirm(p.id, { alternativeId: routes[1]!.id, decision: 'selected', rationale: '人工更改选择。', requirementIds: [req], evidenceIds: [] })
  const newer = await s.artifacts.save(p.id, { name: '新方案', type: 'solution', format: 'markdown', content: '新正文' })
  const overview = designOverview(repository.get(p.id)!)
  expect(overview.artifacts.find(row => row.id === old.id)?.context).toMatchObject({ status: 'possibly_stale', stored: { decisionId: decision.id }, changed: ['decision', 'sources'] })
  expect(overview.artifacts.find(row => row.id === newer.id)?.context).toMatchObject({ status: 'current', stored: { decisionId: newerDecision.id } })
  expect(s.artifacts.list(p.id).map(row => row.content)).toEqual(['历史正文', '新正文'])
})

it('reports missing legacy snapshots honestly, rejects forged dependency IDs and treats a manual edit as untracked', async () => {
  const { services: s, project: p, repository } = await ready()
  const row = await s.artifacts.save(p.id, { name: '旧方案', type: 'solution', format: 'markdown', content: '旧模板' })
  const legacy = structuredClone(repository.get(p.id)!)
  delete legacy.artifacts[0]!.dependencies
  expect(stateSchema.safeParse(legacy).success).toBe(true)
  expect(designOverview(legacy).artifacts[0]?.context).toMatchObject({ status: 'untracked', stored: null, changed: [] })
  const malformed = structuredClone(repository.get(p.id)!)
  malformed.artifacts[0]!.dependencies!.decisionId = '11111111-1111-4111-8111-111111111111'
  expect(stateSchema.safeParse(malformed).success).toBe(false)
  await expect(s.artifacts.save(p.id, { type: 'other', name: '伪造', content: '正文', format: 'markdown', dependencies: row.dependencies })).rejects.toThrow()
  await s.artifacts.update(p.id, row.id, { content: '人工修改正文' })
  expect(designOverview(repository.get(p.id)!).artifacts[0]?.context.status).toBe('untracked')
})

it('rejects a stale decision preview before opening the real gate and still rejects edits during the gate', async () => {
  let changeDuringGate = false, mutate: () => Promise<unknown> = async () => undefined
  const review = vi.fn(async () => { if (changeDuringGate) await mutate(); return approved.review({} as never) })
  const h = await setup('sqlite', { review }), s = h.services, id = h.project.id
  const req = await confirmedRequirement(s, id), [route] = await s.alternatives.addMany(id, [alternative])
  const request = { alternativeId: route!.id, decision: 'selected', rationale: '显式测试', evidenceIds: [], requirementIds: [req] }
  const preview = businessVersion(h.repository.get(id)!)
  await s.documents.add(id, { name: '补证.md', kind: 'report', textContent: '新输入' })
  const count = review.mock.calls.length
  await expect(s.decisions.confirm(id, { ...request, expectedVersion: preview })).rejects.toMatchObject({ code: 'STALE_CONTEXT' })
  expect(review).toHaveBeenCalledTimes(count)
  changeDuringGate = true; mutate = () => s.projects.update(id, { name: '审核期间输入变化' })
  await expect(s.decisions.confirm(id, { ...request, expectedVersion: businessVersion(h.repository.get(id)!) })).rejects.toMatchObject({ code: 'STALE_REVIEW' })
  expect(s.decisions.list(id)).toEqual([])
})

it('counts stored MUST coverage separately from verified support and unconfirmed MUST risks', async () => {
  const { services: s, project: p, req, routes } = await ready()
  const [unconfirmed] = await s.requirements.addMany(p.id, [{ originalText: '新指标', normalizedText: '新指标待确认', type: 'performance', priority: 'must' }])
  const draft = await s.evidence.add(p.id, evidence), unknown = await s.evidence.add(p.id, { ...evidence, kind: 'UNKNOWN' })
  const route = { ...routes[0]!, evidenceIds: [draft.id, unknown.id] }
  const summary = routeReview(route, s.requirements.list(p.id), s.evidence.list(p.id))
  expect(summary.gaps.map(row => row.id)).toEqual([req]); expect(summary.full).toEqual([])
  expect(summary.unconfirmedMust.map(row => row.id)).toEqual([unconfirmed!.id]); expect(summary.verified).toEqual([])
  await s.evidence.verify(p.id, draft.id, { method: 'human', targetKind: 'SOURCE', statement: draft.statement })
  expect(routeReview(route, s.requirements.list(p.id), s.evidence.list(p.id)).verified.map(row => row.id)).toEqual([draft.id])
})
