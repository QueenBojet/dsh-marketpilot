import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { setup } from './helpers.ts'
import type { ModelStructuredOutputAdapter } from '../src/adapters/contracts.ts'
import { StructuredOutputError } from '../src/adapters/structured-error.ts'
import { harnessOutputSchema } from '../src/adapters/harness-model.ts'
import { requirementExtractionSchema } from '../src/domain/requirement-analysis.ts'
import { RequirementAnalysisWorkflow, normalizeExtraction } from '../src/workflows/requirement-analysis.ts'
import { renderPrompt } from '../src/prompts/template.ts'
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

function model(responses: unknown[]): ModelStructuredOutputAdapter {
  return { async generate({ schema, signal }) {
    signal.throwIfAborted()
    const raw = responses.shift()
    const result = schema.safeParse(raw)
    if (!result.success) throw new StructuredOutputError(raw, { cause: result.error })
    return result.data
  } }
}
const candidate = (id: string) => ({ originalText: '24 h 连续监测', normalizedText: '系统需 24 h 连续监测', type: 'functional',
  priority: 'must', status: 'proposed', sourceDocumentId: id, sourceLocator: '第 1 条', risk: null, clarificationQuestion: null })
async function context() {
  const h = await setup()
  const document = await h.services.documents.add(h.project.id, { name: 'brief.md', kind: 'customer_requirement', textContent: '24 h 连续监测\n最小检漏率未冻结' })
  const response = { requirements: [candidate(document.id), { ...candidate(document.id), originalText: '最小检漏率未冻结',
    normalizedText: '最小检漏率待确认', type: 'performance', status: 'unknown', clarificationQuestion: '验收指标是什么？' }], unknowns: [] }
  return { ...h, document, response }
}

describe('Requirement Analysis fixed workflow', () => {
  it('extracts, persists UNKNOWN, waits, confirms and generates one repeatable baseline', async () => {
    const { services: s, project: p, document, response, advance } = await context()
    const workflow = new RequirementAnalysisWorkflow(s, model([response]))
    const run = await workflow.start(p.id, [document.id], new AbortController().signal)
    expect(run.status).toBe('waiting_human')
    expect(run.steps.map(s => s.step)).toEqual(['START', 'LOAD_DOCUMENTS', 'EXTRACT_CANDIDATES', 'NORMALIZE_REQUIREMENTS', 'DETECT_UNKNOWN_AND_CONFLICTS', 'SAVE_REQUIREMENTS', 'WAITING_HUMAN'])
    expect(s.evidence.list(p.id).map(e => e.kind)).toEqual(['UNKNOWN'])
    expect(s.artifacts.list(p.id)).toEqual([])
    await expect(s.requirements.finalizeAnalysis(p.id, run.id)).rejects.toMatchObject({ code: 'WAITING_HUMAN' })
    const proposed = s.requirements.list(p.id).filter(r => r.status === 'proposed')
    advance(1000)
    await s.requirements.confirm(p.id, proposed.map(r => r.id))
    const done = await s.requirements.finalizeAnalysis(p.id, run.id)
    expect(done).toMatchObject({ status: 'completed', modelCalls: 1, humanWaitMs: 1000 })
    const artifact = s.artifacts.list(p.id)[0]!
    expect(artifact.name).toBe('Requirement Baseline.md')
    expect(artifact.content).toContain('UNKNOWN / 待确认条件')
    // The baseline table shows business short codes; traceability stays in the appendix.
    expect(artifact.content).toContain('DOC-01')
    expect(artifact.content).toContain('REQ-01')
    expect(artifact.content).not.toContain(document.id)
    expect(artifact.content).toContain(document.id.slice(0, 8))
    expect(artifact.content).toContain('附录：编号对照')
    expect(artifact.content).toContain('最小检漏率未冻结')
    expect(artifact.content).toContain('test-engineer')
    await s.requirements.finalizeAnalysis(p.id, run.id)
    expect(s.artifacts.list(p.id)).toHaveLength(1)
  })
  it('retries a schema-invalid output once and does not commit the invalid candidates', async () => {
    const { services: s, project: p, document, response } = await context()
    const run = await new RequirementAnalysisWorkflow(s, model([{ requirements: [] }, response])).start(p.id, [document.id], new AbortController().signal)
    expect(run.modelCalls).toBe(2)
    expect(s.requirements.list(p.id)).toHaveLength(2)
  })
  it('saves invalid raw output for audit after the second failure and marks the run failed', async () => {
    const { services: s, project: p, document } = await context()
    await expect(new RequirementAnalysisWorkflow(s, model([{ requirements: [] }, { invalid: true }])).start(p.id, [document.id], new AbortController().signal)).rejects.toThrow(/Schema/)
    expect(s.requirements.list(p.id)).toEqual([])
    expect(s.workflows.list(p.id)[0]).toMatchObject({ status: 'failed', modelCalls: 2 })
    expect(s.artifacts.list(p.id)[0]?.content).toContain('"invalid":true')
  })
  it('rejects invented quotations and foreign input references before persistence', async () => {
    const { services: s, project: p, document, response } = await context()
    for (const patch of [{ originalText: '不在原文中的保证指标' }, { sourceDocumentId: randomUUID() }]) {
      await expect(new RequirementAnalysisWorkflow(s, model([{ ...response, requirements: [{ ...candidate(document.id), ...patch }] }])).start(p.id, [document.id], new AbortController().signal)).rejects.toMatchObject({ code: 'SOURCE_MISMATCH' })
    }
    expect(s.requirements.list(p.id)).toEqual([])
    expect(s.evidence.list(p.id)).toEqual([])
  })
  it('does not let an earlier confirmed batch finalize an unreviewed new batch', async () => {
    const { services: s, project: p, document, response } = await context()
    const workflow = new RequirementAnalysisWorkflow(s, model([response, response]))
    const first = await workflow.start(p.id, [document.id], new AbortController().signal)
    await s.requirements.confirm(p.id, s.requirements.list(p.id).filter(r => r.status === 'proposed').map(r => r.id))
    await s.requirements.finalizeAnalysis(p.id, first.id)
    const second = await workflow.start(p.id, [document.id], new AbortController().signal)
    await expect(s.requirements.finalizeAnalysis(p.id, second.id)).rejects.toMatchObject({ code: 'WAITING_HUMAN' })
    expect(s.artifacts.list(p.id)).toHaveLength(1)
  })
  it('cancels the run without committing late model output', async () => {
    const { services: s, project: p, document, response } = await context()
    const abort = new AbortController()
    const cancelling: ModelStructuredOutputAdapter = { async generate({ schema }) { abort.abort(); return schema.parse(response) } }
    await expect(new RequirementAnalysisWorkflow(s, cancelling).start(p.id, [document.id], abort.signal)).rejects.toThrow()
    expect(s.workflows.list(p.id)[0]?.status).toBe('cancelled')
    expect(s.requirements.list(p.id)).toEqual([])
  })
  it('detects priority conflicts and prevents confirmed output from the model', () => {
    const id = randomUUID()
    const output = requirementExtractionSchema.parse({ requirements: [candidate(id), { ...candidate(id), priority: 'could' }], unknowns: [] })
    expect(normalizeExtraction(output).requirements.map(r => r.status)).toEqual(['conflict', 'conflict'])
    expect(() => requirementExtractionSchema.parse({ requirements: [{ ...candidate(id), status: 'confirmed' }], unknowns: [] })).toThrow()
  })
  it('projects the real schema into Harness and retains stronger business validation', () => {
    const output = { requirements: [candidate(randomUUID())], unknowns: [] }
    const schema = harnessOutputSchema(requirementExtractionSchema)
    expect(validateJsonSchemaValue(schema, output)).toEqual([])
    expect(validateJsonSchemaValue(schema, { ...output, extra: true })).not.toEqual([])
    expect(validateJsonSchemaValue(schema, { ...output, requirements: 'table' })).not.toEqual([])
    expect(() => requirementExtractionSchema.parse({ ...output, requirements: [] })).toThrow()
  })
  it('substitutes prompt variables once and reports missing values', () => {
    expect(renderPrompt('{{documents}} {{schema}}', { documents: '{{schema}}', schema: 'JSON' })).toBe('{{schema}} JSON')
    expect(() => renderPrompt('{{documents}}', {})).toThrow(/缺少变量/)
  })
})
