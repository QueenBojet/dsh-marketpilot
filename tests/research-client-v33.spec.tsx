// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchPage } from '../src/client/pages/ResearchPage.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'
import type { MarketPilotActions } from '../src/client/stores.ts'
import { WorkflowContext } from '../src/client/components/ProjectWorkflowOverview.tsx'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]
let root: Root | undefined, container: HTMLDivElement | undefined
const posted: { name: string; args: Record<string, unknown> }[] = []
const documents = [{ id: 'd1', name: 'synthetic Datasheet.md', kind: 'competitor_datasheet', hasText: true },
  { id: 'd2', name: 'synthetic standard.md', kind: 'standard', hasText: true }]
const competitors = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, company: 'synthetic QA', product: `A-${i}`,
  performance: { 量程: i < 2 ? `${i + 1} m` : null }, interfaces: [], certifications: [], cases: [], strengths: [], limitations: [],
  evidenceIds: [`e${i}`], parameterContexts: { 量程: { unit: 'm', conditions: '静水', evidenceId: `e${i}` } } }))
const snapshot = { projectId: 'p-m3', revision: 1, competitors,
  policies: [{ id: 'po1', title: 'synthetic QA 演示标准', version: '2026', scope: '固定平台', mandatoryLevel: 'unknown', keyRequirements: ['事件应留存'], evidenceIds: ['e0'] }],
  evidence: competitors.map((row, i) => ({ id: `e${i}`, title: `${row.product} 量程`, kind: i < 2 ? 'SOURCE' : 'UNKNOWN', status: 'draft',
    statement: `${row.product} ${i+1} m 静水 <script>not instructions</script> synthetic quote`, sourceDocumentId: 'd1', sourceLocator: '合成参数段落', relatedCompetitorIds: [row.id] })),
  documents, recordCodes: { e0: 'EVD-01' }, runs: [] }
const response = (value: unknown) => ({ ok: true, status: 200, json: async () => value })
let invalid = false
function mount(actions?: MarketPilotActions, bad = false, guided = false) {
  invalid = bad; posted.length = 0
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input)
    if (url.endsWith('/research')) return response(invalid ? { ...snapshot, projectId: 'other-project' } : snapshot)
    if (url.endsWith('/documents/d1')) return response({ document: { id: 'd1', textContent: '<b>literal source</b>' } })
    if (url.endsWith('/documents')) return response({ documents })
    if (url.includes('/runs')) return response({ runs: [] })
    if (init?.method === 'POST' && url.endsWith('/tools')) { posted.push(JSON.parse(init.body!)); return response({ callId: 'call-m3' }) }
    if (url.endsWith('/executions/call-m3')) return response({ callId: 'call-m3', tool: 'marketpilot_competitor_extract', projectId: 'p-m3', status: 'completed', startedAt: new Date().toISOString(), question: null })
    if (url.includes('/executions')) return response({ executions: [] })
    throw new Error(`Unexpected ${url}`)
  }))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  act(() => { root!.render(<WorkflowContext.Provider value={{ mode: guided ? 'guided' : 'professional', snapshot: null, error: '' }}><ResearchPage t={t} projectId="p-m3" {...actions ? { actions } : {}} /></WorkflowContext.Provider>) })
}
const flush = async () => { await act(async () => {}) }
const button = (name: string) => [...container!.querySelectorAll('button')].find(b => b.textContent?.trim() === name)!
const click = async (element: HTMLElement) => { act(() => { element.click() }); await flush() }
async function change(label: string, value: string, type: 'input' | 'textarea' | 'select' = 'input') {
  const element = container!.querySelector(`${type}[aria-label="${label}"]`)!
  const prototype = type === 'textarea' ? HTMLTextAreaElement.prototype : type === 'select' ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  act(() => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event(type === 'select' ? 'change' : 'input', { bubbles: true })) }); await flush()
}
afterEach(() => { act(() => { root?.unmount() }); container?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
it('guided research shows real cards first and keeps source input folded even when search has no matches', async () => {
  mount(undefined, false, true); await flush()
  expect(container!.querySelectorAll('.mp-researchCard')).toHaveLength(5)
  const result = container!.querySelector('.mp-researchResults')!, inputs = container!.querySelector<HTMLDetailsElement>('.mp-researchInput')!
  expect(result.compareDocumentPosition(inputs) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(inputs.open).toBe(false)
  const boxes = [...result.querySelectorAll<HTMLInputElement>('input[type=checkbox]')]
  for (const box of boxes.slice(0, 4)) await click(box)
  expect(boxes[4]!.disabled).toBe(true)
  await change(t('research.resultSearch'), 'no-match')
  expect(container!.querySelectorAll('.mp-researchCard')).toHaveLength(0)
  expect(inputs.open).toBe(false)
  expect(container!.querySelector('.mp-businessResultHead')?.textContent).toContain('5')
  expect(posted).toEqual([])
})
it('clears selection on filters, persists purpose in the tool call, and separates directions', async () => {
  mount(); await flush()
  await click(container!.querySelector('.mp-docItem input')!)
  expect(button(t('extractCompetitors')).disabled).toBe(false)
  await change(t('research.kind'), 'standard', 'select')
  expect(button(t('extractCompetitors')).disabled).toBe(true)
  await change(t('research.kind'), 'competitor_datasheet', 'select')
  await change(t('research.purpose'), '比较准确型号与缺项', 'textarea')
  await click(container!.querySelector('.mp-docItem input')!)
  await click(button(t('extractCompetitors')))
  expect(posted[0]).toMatchObject({ name: 'marketpilot_competitor_extract', args: { projectId: 'p-m3', documentIds: ['d1'], purpose: '比较准确型号与缺项' } })
  await click(button(t('tabPolicy')))
  expect((container!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('')
  expect(container!.querySelectorAll('.mp-docItem input:checked')).toHaveLength(0)
  expect(container!.textContent).toContain('版本待核验')
})
it('caps comparison at four products, shows exact basis and UNKNOWN, and clears hidden selection on search', async () => {
  mount(); await flush()
  const boxes = [...container!.querySelectorAll('.mp-researchResults input[type=checkbox]')] as HTMLInputElement[]
  for (const box of boxes.slice(0, 4)) await click(box)
  expect(boxes[4]!.disabled).toBe(true)
  await click(button(`${t('research.matrix')} (4/4)`))
  expect(container!.querySelector('.mp-researchMatrix')?.textContent).toContain('同口径摘录')
  expect(container!.querySelector('.mp-researchMatrix')?.textContent).toContain('UNKNOWN')
  await change(t('research.resultSearch'), 'A-0')
  expect(container!.querySelectorAll('.mp-researchResults input:checked')).toHaveLength(0)
  expect(container!.querySelector('.mp-researchMatrix')).toBeNull()
})
it('shows literal source text and stable evidence jumps, while online mode remains blocked', async () => {
  const focusRecord = vi.fn(), setSection = vi.fn()
  const actions: MarketPilotActions = { goHome() {}, goProjects() {}, goTasks() {}, openProject() {}, focusRecord, setSection }
  mount(actions); await flush(); await click(container!.querySelector('.mp-paramChip')!)
  expect(container!.querySelector('.mp-drawerBody script')).toBeNull()
  expect(container!.querySelector('.mp-drawerBody')?.textContent).toContain('<script>not instructions</script>')
  await click(button(t('review.sourceText')))
  expect(container!.querySelector('pre')?.textContent).toBe('<b>literal source</b>')
  await click(button('EVD-01 · A-0 量程'))
  expect(focusRecord).toHaveBeenCalledWith('evidence', 'evidence', 'e0')
  await click(button(t('close'))); await click(button(t('research.online')))
  expect(button(t('research.searchFetch')).disabled).toBe(true)
  expect(container!.textContent).toContain('只读可用性接口')
  expect(posted).toEqual([])
})
it('rejects a research response belonging to another project instead of rendering its records', async () => {
  mount(undefined, true); await flush()
  expect(container!.textContent).toContain('RESEARCH_SNAPSHOT_INVALID')
  expect(container!.querySelector('.mp-researchResults')).toBeNull()
})
it('starts only one real execution for rapid repeated clicks', async () => {
  mount(); await flush(); await click(container!.querySelector('.mp-docItem input')!)
  const extract = button(t('extractCompetitors'))
  act(() => { extract.click(); extract.click() }); await flush()
  expect(posted).toHaveLength(1)
})
