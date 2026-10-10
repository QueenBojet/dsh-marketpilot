import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { setup, confirmedRequirement, alternative, evidence } from './helpers.ts'
import type { ModelStructuredOutputAdapter } from '../src/adapters/contracts.ts'
import { AlternativeWorkflow, SolutionWorkflow } from '../src/workflows/generation.ts'
import { alternativesOutput, sectionTitles, sectionOutput, outlineOutput } from '../src/domain/generation.ts'
import { reviewerLabel } from '../src/domain/shortcodes.ts'
import { harnessOutputSchema } from '../src/adapters/harness-model.ts'

const signal = () => new AbortController().signal
function responses(values: unknown[]): ModelStructuredOutputAdapter {
  return { async generate({ schema }) { return schema.parse(values.shift()) } }
}
const outline = { sections: sectionTitles.map(title => ({ title, purpose: '响应已确认需求，保留设计建议与未知项。' })) }
const candidates = (requirementId: string) => ({ alternatives: ['多源融合', '分阶段实施'].map(name => ({ ...alternative, name,
  requirementCoverage: [{ requirementId, coverage: 'partial' }] })) })

async function ready() {
  const h = await setup()
  const { services: s, project: p } = h
  const requirementId = await confirmedRequirement(s, p.id)
  const run = await new AlternativeWorkflow(s, responses([candidates(requirementId)])).start(p.id, signal())
  const routes = s.alternatives.list(p.id)
  const decision = await s.decisions.confirm(p.id, { alternativeId: routes[0]!.id, decision: '采用第一候选路线',
    rationale: '人工比较后确认，性能需现场验证。', evidenceIds: [], requirementIds: [requirementId] })
  await s.evidence.add(p.id, { kind: 'UNKNOWN', title: '未冻结参数', statement: '最小检漏率与误报率待确认。', sourceType: 'customer' })
  const sections = sectionTitles.map(title => ({ title, decisionId: decision.id, claims: [{ text: '建议完成现场基线采集和人工复核。',
    kind: 'narrative', status: 'suggested', requirementIds: [requirementId], evidenceIds: [] }] }))
  return { ...h, decision, sections, requirementId, alternativeRun: run }
}

it('generates two unselected candidates and requires complete coverage', async () => {
  const { services: s, project: p } = await setup()
  const req = await confirmedRequirement(s, p.id)
  const workflow = new AlternativeWorkflow(s, responses([candidates(req)]))
  const run = await workflow.start(p.id, signal())
  expect(run.status).toBe('completed')
  expect(s.alternatives.list(p.id).map(a => a.status)).toEqual(['candidate', 'candidate'])
  expect(s.decisions.list(p.id)).toEqual([])
  const bad = candidates(randomUUID())
  await expect(new AlternativeWorkflow(s, responses([bad])).start(p.id, signal())).rejects.toMatchObject({ code: 'INCOMPLETE_COVERAGE' })
  expect(s.alternatives.list(p.id)).toHaveLength(2)
})

it('returns prerequisite_error or waiting_human without invoking a model', async () => {
  const { services: s, project: p } = await setup()
  const generate = vi.fn()
  const workflow = new SolutionWorkflow(s, { generate })
  expect(await workflow.start(p.id, signal())).toMatchObject({ status: 'failed', error: '请先确认客户需求。' })
  await confirmedRequirement(s, p.id)
  const waiting = await workflow.start(p.id, signal())
  expect(waiting.status).toBe('waiting_human')
  expect(await workflow.start(p.id, signal(), waiting.id)).toMatchObject({ status: 'waiting_human' })
  expect(generate).not.toHaveBeenCalled()
})

it('resumes after a human Decision and renders UNKNOWN, source trace and suggestion labels', async () => {
  const { services: s, project: p, sections, decision } = await ready()
  const run = await new SolutionWorkflow(s, responses([outline, ...sections])).start(p.id, signal())
  expect(run).toMatchObject({ status: 'completed', modelCalls: 7 })
  const artifact = s.artifacts.list(p.id).find(a => a.type === 'solution')!
  // Formal prose carries the business short code — never the raw decision UUID.
  expect(artifact.content).toContain('DEC-01')
  expect(artifact.content).not.toContain(decision.id)
  expect(artifact.content).toContain(decision.id.slice(0, 8))
  // No canonical UUID may survive anywhere in the body; the appendix keeps
  // only 8-char trace fragments.
  const body = artifact.content.slice(0, artifact.content.indexOf('附录：编号对照'))
  expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  // Production gate identities are `Harness human (callId-uuid)`; the shared
  // reviewer formatter keeps an 8-char fragment instead of the raw UUID
  // (live GLM acceptance caught the raw form in the 方案摘要 block).
  expect(reviewerLabel('Harness human (0f0e1d2c-3b4a-4c5d-8e9f-0a1b2c3d4e5f)')).toBe('Harness human (#0f0e1d2c)')
  expect(reviewerLabel('test-engineer')).toBe('test-engineer')
  expect(artifact.content).toContain('审核人：test-engineer')
  expect(artifact.content).toContain('UNKNOWN / 待确认条件')
  expect(artifact.content).toContain('最小检漏率与误报率待确认')
  expect(artifact.content).toContain('建议，待验证')
  expect(artifact.content).toContain('需求响应与证据索引')
  expect(artifact.content).toContain('附录：编号对照')
  expect(artifact.reviewStatus).toBe('draft')
  // A finished solution moves the stage baseline forward (no stale stage hint).
  expect(s.projects.get(p.id)!.status).toBe('solution_ready')
})

it('advances the project status baseline forward-only as workflows complete', async () => {
  const { services: s, project: p } = await setup()
  const requirementId = await confirmedRequirement(s, p.id)
  expect(s.projects.get(p.id)!.status).toBe('requirements_ready')
  await new AlternativeWorkflow(s, responses([candidates(requirementId)])).start(p.id, signal())
  expect(s.projects.get(p.id)!.status).toBe('alternatives_ready')
  const routes = s.alternatives.list(p.id)
  const decision = await s.decisions.confirm(p.id, { alternativeId: routes[0]!.id, decision: '采用第一候选路线',
    rationale: '人工比较后确认。', evidenceIds: [], requirementIds: [requirementId] })
  expect(s.projects.get(p.id)!.status).toBe('decision_confirmed')
  const sections = sectionTitles.map(title => ({ title, decisionId: decision.id, claims: [{ text: '建议完成现场基线采集和人工复核。',
    kind: 'narrative', status: 'suggested', requirementIds: [requirementId], evidenceIds: [] }] }))
  await new SolutionWorkflow(s, responses([outline, ...sections])).start(p.id, signal())
  expect(s.projects.get(p.id)!.status).toBe('solution_ready')
})

it('rejects unsupported parameter values, invented decisions and missing requirement trace', async () => {
  const { services: s, project: p, sections } = await ready()
  const parameter = structuredClone(sections)
  Object.assign(parameter[0]!.claims[0]!, { kind: 'parameter', text: '建议检出率为 99%。' })
  await expect(new SolutionWorkflow(s, responses([outline, ...parameter])).start(p.id, signal())).rejects.toMatchObject({ code: 'UNSUPPORTED_CLAIM' })
  const forged = structuredClone(sections)
  forged[0]!.decisionId = randomUUID()
  await expect(new SolutionWorkflow(s, responses([outline, ...forged])).start(p.id, signal())).rejects.toMatchObject({ code: 'DECISION_MISMATCH' })
  const noTrace = sections.map(section => ({ ...section, claims: section.claims.map(c => ({ ...c, requirementIds: [] })) }))
  await expect(new SolutionWorkflow(s, responses([outline, ...noTrace])).start(p.id, signal())).rejects.toMatchObject({ code: 'INCOMPLETE_TRACE' })
  expect(s.artifacts.list(p.id).some(a => a.type === 'solution')).toBe(false)
})

it('accepts verified parameter evidence and refuses stale or cancelled results atomically', async () => {
  const { services: s, project: p, sections } = await ready()
  const source = await s.evidence.add(p.id, evidence)
  await s.evidence.verify(p.id, source.id, { method: 'human', targetKind: 'SOURCE', statement: source.statement })
  const supported = structuredClone(sections)
  Object.assign(supported[0]!.claims[0]!, { kind: 'parameter', status: 'confirmed', evidenceIds: [source.id] })
  expect((await new SolutionWorkflow(s, responses([outline, ...supported])).start(p.id, signal())).status).toBe('completed')
  const queue: unknown[] = [outline, ...sections]
  const changing: ModelStructuredOutputAdapter = { async generate({ schema }) {
    if (queue.length === 1) await s.projects.update(p.id, { name: '人工修改了项目' })
    return schema.parse(queue.shift())
  } }
  await expect(new SolutionWorkflow(s, changing).start(p.id, signal())).rejects.toMatchObject({ code: 'STALE_CONTEXT' })
  const abort = new AbortController()
  const cancelling: ModelStructuredOutputAdapter = { async generate({ schema }) { abort.abort(); return schema.parse(outline) } }
  await expect(new SolutionWorkflow(s, cancelling).start(p.id, abort.signal)).rejects.toThrow()
  expect(s.workflows.list(p.id).at(-1)?.status).toBe('cancelled')
  expect(s.artifacts.list(p.id).filter(a => a.type === 'solution')).toHaveLength(1)
})

it('accepts short handles from the model and resolves them back to real ids', async () => {
  const { services: s, project: p } = await setup()
  const requirementId = await confirmedRequirement(s, p.id)
  const handled = { alternatives: ['多源融合', '分阶段实施'].map(name => ({ ...alternative, name,
    evidenceIds: [], requirementCoverage: [{ requirementId: 'R1', coverage: 'partial' }] })) }
  const prompts: string[] = []
  const recording: ModelStructuredOutputAdapter = { async generate({ prompt, schema }) {
    prompts.push(prompt)
    return schema.parse(prompts.length === 1 ? handled : outline)
  } }
  expect((await new AlternativeWorkflow(s, recording).start(p.id, signal())).status).toBe('completed')
  expect(prompts[0]).toContain('"R1"')
  expect(s.alternatives.list(p.id).every(a => Object.keys(a.requirementCoverage).includes(requirementId))).toBe(true)
  const routes = s.alternatives.list(p.id)
  const decision = await s.decisions.confirm(p.id, { alternativeId: routes[0]!.id, decision: '采用第一候选路线',
    rationale: '人工确认。', evidenceIds: [], requirementIds: [requirementId] })
  const sections = sectionTitles.map(title => ({ title, decisionId: 'D1', claims: [{ text: '建议完成现场基线采集和人工复核。',
    kind: 'narrative', status: 'suggested', requirementIds: ['R1'], evidenceIds: [] }] }))
  const queue: unknown[] = [outline, ...sections]
  const sectionModel: ModelStructuredOutputAdapter = { async generate({ schema }) { return schema.parse(queue.shift()) } }
  expect((await new SolutionWorkflow(s, sectionModel).start(p.id, signal())).status).toBe('completed')
  const artifact = s.artifacts.list(p.id).find(a => a.type === 'solution')!
  // Codes replace UUIDs in prose; the appendix keeps the 8-char trace fragments.
  expect(artifact.content).toContain('DEC-01')
  expect(artifact.content).toContain('REQ-01')
  expect(artifact.content).not.toContain(decision.id)
  expect(artifact.content).toContain(decision.id.slice(0, 8))
  expect(artifact.content).toContain(requirementId.slice(0, 8))
})

it('projects generation schemas through the actual Harness output schema validator', () => {
  for (const schema of [alternativesOutput, outlineOutput, sectionOutput]) expect(() => harnessOutputSchema(schema)).not.toThrow()
  expect(() => alternativesOutput.parse({ ...candidates(randomUUID()), selected: true })).toThrow()
})
