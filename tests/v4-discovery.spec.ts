import { expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { setup } from './helpers.ts'
import type { RunDeps } from '../src/services/v4/base.ts'
import { briefConfirmed, latestExploration } from '../src/services/v4/discovery-context.ts'
import { defaultTemplate, inspectTemplate, renderDocx } from '../src/render/docx.ts'
import { readZip, writeZip } from '../src/render/zip.ts'
import { extractDocument } from '../src/adapters/extract.ts'

const brief = { objective: '连续监测合成工厂', scenario: '室外厂界', scope: '四点监测，不含施工', constraints: '预算待报价；不承诺未经验证性能', acceptance: ['连续采集四个点位的数据'], openQuestions: [] }
const route = { provider: 'test', model: 'test', source: 'override' as const }
const deps = (output: unknown, prompts: string[] = []): RunDeps => ({ route, signal: new AbortController().signal,
  model: { async generate({ schema, prompt }) { prompts.push(prompt); return schema.parse(output) } } })
const candidate = (name: string, sources: string[] = []) => ({ name, summary: `${name}候选`, components: ['采集设备'], strengths: ['易集成'], limitations: ['需校准'], risks: ['工况影响'], industrialSupport: '工业监测应用类别，具体案例待核实', feasibility: '需要现场试验验证', evidenceGaps: ['工业案例未核实'], researchDirections: [`${name}环境可靠性`], sourceAlternativeIds: sources })
async function ready() {
  const h = await setup(), s = h.services.v4, pid = h.project.id
  await s.discovery.enable(pid)
  await s.discovery.saveBrief(pid, brief)
  await s.discovery.confirmBrief(pid)
  await s.discovery.brainstorm(pid, 'initial', deps({ summary: '比较不同技术原理', routes: ['点式', '开路', '抽取'].map(n => { const { sourceAlternativeIds: _, ...r } = candidate(n); return r }) }))
  return { ...h, s, pid }
}
it('keeps interview proposals separate, rejects incomplete briefs, and protects cancelled output', async () => {
  const { services, project, repository } = await setup()
  const d = services.v4.discovery, pid = project.id
  await d.enable(pid)
  await expect(d.confirmBrief(pid)).rejects.toMatchObject({ code: 'BRIEF_INCOMPLETE' })
  const prompts: string[] = []
  await d.chat(pid, { content: '希望监测工厂' }, deps({ answer: '您期望哪些验收指标？', brief }, prompts))
  expect(repository.get(pid)!.v4!.discovery!.brief.objective).toBe('')
  expect(repository.get(pid)!.v4!.discovery!.proposal).toEqual(brief)
  expect(repository.get(pid)!.requirements).toHaveLength(0)
  expect(prompts[0]).toContain('最多 3 个')
  await d.saveBrief(pid, brief)
  await d.confirmBrief(pid)
  expect(briefConfirmed(repository.get(pid)!)).toBe(true)
  await d.confirmBrief(pid)
  expect(repository.get(pid)!.requirements).toHaveLength(1)
  const aborted = { ...deps({ answer: '不应保存', brief }), signal: AbortSignal.abort() }
  await d.chat(pid, { content: '取消这次' }, aborted)
  expect(repository.get(pid)!.v4!.messages.some(m => m.content === '不应保存')).toBe(false)
})
it('uploads without line harvesting and fixes only selected, locatable support', async () => {
  const { services, project, repository } = await setup()
  const s = services.v4, pid = project.id
  await s.discovery.enable(pid)
  const intake = await s.intake.intake(pid, { label: '合成资料', files: [{ name: '现场.txt', kind: 'other', textContent: '现场共有四个点位。\n无关背景故事。' }] })
  expect(intake.changes).toBe(0)
  const note = { category: 'fact', title: '点位', content: '现场四点', relevance: '确定配置数量', documentId: intake.documentIds[0], quote: '虚构内容' }
  await expect(s.discovery.saveNote(pid, note)).rejects.toMatchObject({ code: 'QUOTE_NOT_FOUND' })
  const saved = await s.discovery.saveNote(pid, { ...note, quote: '现场共有四个点位。' })
  await s.discovery.fixNote(pid, saved.id)
  expect(repository.get(pid)!.v4!.supportNotes![0]!.status).toBe('fixed')
  await s.discovery.saveNote(pid, { ...note, quote: '现场共有四个点位。', content: '修改内容' }, saved.id)
  expect(repository.get(pid)!.v4!.supportNotes![0]!.review).toBeUndefined()
  await expect(services.documents.update(pid, intake.documentIds[0]!, { textContent: '更改原文' })).rejects.toMatchObject({ code: 'SOURCE_REFERENCED' })
  await s.discovery.saveNote(pid, { category: 'fact', title: '人工补充', content: '人工信息', relevance: '比较依据' }, saved.id)
  expect(repository.get(pid)!.v4!.supportNotes![0]!.documentId).toBeUndefined()
})
it('rejects a late interview response after newer conversation or support changes', async () => {
  const { services, project, repository } = await setup(), d = services.v4.discovery, pid = project.id
  await d.enable(pid)
  let resolve!: (value: unknown) => void
  const generate = vi.fn(() => new Promise<unknown>(r => { resolve = r }))
  const model: NonNullable<RunDeps['model']> = { async generate({ schema }) { return schema.parse(await generate()) } }
  const first = d.chat(pid, { content: '第一轮' }, { ...deps({}), model })
  const rejected = expect(first).rejects.toMatchObject({ code: 'STALE_CONTEXT' })
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce())
  await d.chat(pid, { content: '补充新的条件' }, deps({ answer: '新的建议', brief: { ...brief, objective: '新的目标' } }))
  resolve({ answer: '过时的建议', brief })
  await rejected
  expect(repository.get(pid)!.v4!.discovery!.proposal!.objective).toBe('新的目标')
  expect(repository.get(pid)!.v4!.messages.some(m => m.content === '过时的建议')).toBe(false)
  generate.mockClear()
  const second = d.chat(pid, { content: '再讨论' }, { ...deps({}), model })
  const stale = expect(second).rejects.toMatchObject({ code: 'STALE_CONTEXT' })
  await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce())
  const note = await d.saveNote(pid, { category: 'fact', title: '新条件', content: '新增现场约束', relevance: '需求范围' })
  await d.fixNote(pid, note.id)
  resolve({ answer: '遗漏约束', brief })
  await stale
})
it('requires distinct research directions and current synthesis before final decision; changed inputs invalidate it', async () => {
  const h = await ready(), { s, pid, repository } = h
  const initial = latestExploration(repository.get(pid)!, 'initial')!
  const a = initial.routes[0]!.alternativeId
  const request = { alternativeId: a, decision: '未经调研选定', rationale: '错误路径', requirementIds: repository.get(pid)!.requirements.map(r => r.id), evidenceIds: [] }
  await expect(h.services.decisions.confirm(pid, request)).rejects.toMatchObject({ code: 'DECISION_NOT_READY' })
  await expect(s.research.addQuestion(pid, { title: '泛化研究' })).rejects.toMatchObject({ code: 'DIRECTION_REQUIRED' })
  const q = await s.research.addQuestion(pid, { title: '环境', direction: '湿度影响', decisionUse: '比较可靠性', alternativeIds: [a] })
  await expect(s.research.addQuestion(pid, { title: '重复', direction: '湿度影响', decisionUse: '同一用途', alternativeIds: [a] })).rejects.toMatchObject({ code: 'DUPLICATE_DIRECTION' })
  await expect(s.discovery.brainstorm(pid, 'synthesis', deps({}))).rejects.toMatchObject({ code: 'RESEARCH_REQUIRED' })
  const q2 = await s.research.addQuestion(pid, { title: '接口', direction: '接口兼容性', decisionUse: '判断集成', alternativeIds: [a] })
  for (const question of [q, q2]) {
    await s.research.savePlan(pid, question.id, { steps: ['验证'], queries: [], mode: 'web' }, '工程师')
    const d = deps({ report: `研究 ${question.direction}：证据有限`, findings: [] })
    await s.research.research(pid, question.id, { ...d, web: { async search() { return { sources: [{ url: 'https://example.com/test' }] } }, async fetch({ url }) { return { url, statusCode: 200, body: { content: '合成来源正文仅用于测试。'.repeat(10) } } } } })
  }
  await repository.update(pid, state => {
    const oldId = randomUUID()
    state.alternatives.push({ ...state.alternatives[0]!, id: oldId })
    state.v4!.questions.push({ ...state.v4!.questions[0]!, id: randomUUID(), alternativeIds: [oldId], report: 'OLD_INVALID_REPORT' })
    state.v4!.questions.push({ ...state.v4!.questions[0]!, id: randomUUID(), status: 'needs_review', report: 'STALE_INVALID_REPORT' })
  })
  const prompts: string[] = []
  await s.discovery.brainstorm(pid, 'synthesis', deps({ summary: '综合两份报告，按条件选择', routes: [candidate('组合路线', [a])] }, prompts))
  expect(prompts[0]).not.toContain('OLD_INVALID_REPORT')
  expect(prompts[0]).not.toContain('STALE_INVALID_REPORT')
  const final = latestExploration(repository.get(pid)!, 'synthesis')!
  expect(final.questionIds).toEqual([q.id, q2.id])
  const input = { alternativeId: final.routes[0]!.alternativeId, decision: '采用组合', rationale: '合成场景下比较证据', requirementIds: repository.get(pid)!.requirements.map(r => r.id), evidenceIds: [] }
  await s.route.confirmRoute(pid, input)
  expect(s.solution.route(pid).confirmed).toBe(true)
  await s.research.updateQuestion(pid, q.id, { direction: '温度影响' })
  expect(s.solution.route(pid).confirmed).toBe(false)
  expect(repository.get(pid)!.v4!.questions.find(x => x.id === q.id)!.status).toBe('needs_review')
  await expect(s.route.confirmRoute(pid, input)).rejects.toMatchObject({ code: 'DECISION_NOT_READY' })
})
it('invalidates exploration when a candidate body changes without status-driven false invalidation', async () => {
  const { services, repository, pid } = await ready()
  const current = latestExploration(repository.get(pid)!, 'initial')!
  await services.alternatives.update(pid, current.routes[0]!.alternativeId, { summary: '已改变技术架构' })
  expect(latestExploration(repository.get(pid)!, 'initial')).toBeUndefined()
})
it('does not commit a research report when its support changes during generation', async () => {
  const { s, pid, repository } = await ready()
  const q = await s.research.addQuestion(pid, { title: '方向', direction: '可靠性', decisionUse: '决策', alternativeIds: [latestExploration(repository.get(pid)!, 'initial')!.routes[0]!.alternativeId] })
  await s.research.savePlan(pid, q.id, { steps: ['验证'], queries: [], mode: 'web' }, '测试')
  let resolve!: (value: unknown) => void
  const pending = vi.fn(() => new Promise<unknown>(r => { resolve = r }))
  const run = s.research.research(pid, q.id, { ...deps({}), model: { async generate({ schema }) { return schema.parse(await pending()) } },
    web: { async search() { return { sources: [{ url: 'https://example.com' }] } }, async fetch({ url }) { return { url, statusCode: 200, body: { content: '合成可用正文'.repeat(50) } } } } })
  const rejected = expect(run).rejects.toMatchObject({ code: 'STALE_CONTEXT' })
  await vi.waitFor(() => expect(pending).toHaveBeenCalledOnce())
  await s.discovery.saveBrief(pid, { ...brief, constraints: '新增限制' })
  resolve({ report: '过时的研究', findings: [] })
  await rejected
  expect(repository.get(pid)!.v4!.questions[0]!.report).toBeUndefined()
})
it('rejects an incompatible Word template switch while preserving all authored sections', async () => {
  const h = await setup(), pid = h.project.id
  const d = await h.services.v4.docs.create(pid, { kind: 'technical' })
  const zip = readZip(defaultTemplate())
  zip.set('word/document.xml', new TextEncoder().encode('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>单独模板章节</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'))
  const bytes = writeZip([...zip].map(([name, data]) => ({ name, data })))
  const t = await h.services.v4.docs.uploadTemplate(pid, { name: '不兼容模板', fileName: 'one.docx', dataBase64: Buffer.from(bytes).toString('base64') })
  await expect(h.services.v4.docs.update(pid, d.doc.id, { templateId: t.id })).rejects.toMatchObject({ code: 'TEMPLATE_CHANGED' })
  expect(h.services.v4.docs.view(pid, d.doc.id).doc.sections).toEqual(d.doc.sections)
})
it('renders ordinary Word heading templates in place and preserves the original container', () => {
  const zip = readZip(defaultTemplate())
  zip.set('word/document.xml', new TextEncoder().encode('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>公司方案</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>建设目标</w:t></w:r></w:p><w:p><w:r><w:t>这里是模板写作要求</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>实施路径</w:t></w:r></w:p><w:p><w:r><w:t>这里是第二节写作要求</w:t></w:r></w:p><w:sectPr/></w:body></w:document>'))
  const template = writeZip([...zip].map(([name, data]) => ({ name, data })))
  expect(inspectTemplate(template).outline.map(s => s.title)).toEqual(['建设目标', '实施路径'])
  const rendered = renderDocx(template, { values: {}, sections: [{ key: 'template_1', title: '建设目标', blocks: [{ kind: 'paragraph', text: '合成项目的确认目标' }] }, { key: 'template_2', title: '实施路径', blocks: [{ kind: 'paragraph', text: '依据研究确定技术路线' }] }] })
  const text = extractDocument('delivery.docx', rendered).text
  expect(text).toContain('建设目标'); expect(text).toContain('合成项目的确认目标')
  expect(text).toContain('实施路径'); expect(text).not.toContain('写作要求')
  expect(readZip(rendered).get('word/styles.xml')).toEqual(zip.get('word/styles.xml'))
})
