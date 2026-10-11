// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({ variant: _variant, ...p }: React.ComponentProps<'button'> & { variant?: string }) => <button {...p} />,
  Tag: (p: { children: React.ReactNode }) => <span>{p.children}</span>,
  StateDot: () => <span />,
  IconListPenOutlineRegular: () => <svg />,
}))
import { RequirementsPage } from '../src/client/pages/RequirementsPage.tsx'
import { EvidencePage } from '../src/client/pages/EvidencePage.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'
import { projectReviewOverview } from '../src/domain/project-review.ts'
import { evidenceReviewGroup } from '../src/domain/project-review.ts'
import { fields, run, withInputs, workflowState } from './workflow-fixtures.ts'
import type { ProjectState } from '../src/domain/state.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]
const response = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload })
let root: Root, container: HTMLElement, state: ProjectState, projectId: string
let sequence = 0, reviewError: boolean, listError: boolean, detailError: boolean
let posts: { name: string; args: Record<string, unknown> }[]
let pendingList: ((value: unknown) => void) | undefined, deferQuery: string | undefined
const actions = { goHome: vi.fn(), goProjects: vi.fn(), goTasks: vi.fn(), openProject: vi.fn(), setSection: vi.fn(), focusRecord: vi.fn() }
const flush = async () => { await act(async () => {}) }
async function render(node: React.ReactNode) { act(() => { root.render(node) }); await flush() }
function button(label: string, selector = 'button') {
  const found = [...container.querySelectorAll<HTMLButtonElement>(selector)].find(b => b.textContent?.trim().startsWith(label))
  expect(found, label).toBeDefined(); return found!
}
async function click(label: string, selector = 'button') { act(() => { button(label, selector).click() }); await flush() }
async function change(select: HTMLSelectElement, value: string) { act(() => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })) }); await flush() }
async function search(value: string) {
  const input = container.querySelector('input[type="search"]')!
  act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })) })
  await flush()
}
const requirements = () => state.requirements.map(r => ({ ...r, shortId: r.id === 'req1' ? 'REQ-47' : r.id, sourceDocumentId: 'doc1', sourceDocumentName: 'customer.md' }))

beforeEach(() => {
  vi.useFakeTimers()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  projectId = `m2-${++sequence}`; state = withInputs(workflowState()); state.project.id = projectId
  state.requirements[0]!.status = 'proposed'
  for (let n = 2; n <= 27; n++) state.requirements.push({ ...state.requirements[0]!, id: `req${n}`, normalizedText: `Batch two ${n}`, priority: n === 27 ? 'should' : 'must' })
  state.workflowRuns = [
    { ...run('b1', 'requirement_analysis', 'waiting_human'), output: { requirementIds: ['req1'] } },
    { ...run('b2', 'requirement_analysis', 'waiting_human'), startedAt: '2026-10-11T02:00:00.000Z', output: { requirementIds: state.requirements.slice(1).map(r => r.id) } },
  ]
  state.evidence = [
    { ...fields('e1'), kind: 'UNKNOWN', status: 'draft', title: 'Unresolved parameter', statement: 'Performance unknown', sourceType: 'model', sourceDocumentId: 'doc1', supportingEvidenceIds: [], relatedRequirementIds: ['req1'], relatedCompetitorIds: [], relatedAlternativeIds: [] },
    { ...fields('e2'), kind: 'SOURCE', status: 'verified', title: 'Reviewed source', statement: 'Source statement', sourceType: 'customer', supportingEvidenceIds: [], relatedRequirementIds: [], relatedCompetitorIds: [], relatedAlternativeIds: [] },
  ]
  reviewError = false; listError = false; detailError = false; posts = []; pendingList = undefined; deferQuery = undefined
  Object.values(actions).forEach(fn => fn.mockClear())
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = new URL(String(input), 'http://test'), path = url.pathname
    if (path.endsWith('/review')) { if (reviewError) throw new Error('REVIEW_READ_FAILED'); return response(projectReviewOverview(state)) }
    if (path === `/marketpilot/api/projects/${projectId}`) return response(state)
    if (path.endsWith('/documents/doc1')) return response({ document: { id: 'doc1', textContent: '<script>untrusted text</script>\nOriginal document' } })
    if (path.endsWith('/documents')) return response({ documents: [{ id: 'doc1', name: 'customer.md', kind: 'customer_requirement', bytes: 10 }] })
    if (/\/requirements\/[^/]+$/.test(path)) return response({ requirement: requirements().find(r => path.endsWith('/' + r.id)) })
    if (path.endsWith('/requirements')) {
      if (listError) throw new Error('REQUIREMENTS_READ_FAILED')
      let rows = requirements()
      const batch = state.workflowRuns.find(r => r.id === url.searchParams.get('runId'))
      if (batch) rows = rows.filter(r => (batch.output!.requirementIds as string[]).includes(r.id))
      const priority = url.searchParams.get('priority'), q = url.searchParams.get('q') ?? ''
      if (priority && priority !== 'all') rows = rows.filter(r => r.priority === priority)
      if (q) rows = rows.filter(r => r.normalizedText.includes(q))
      const page = Number(url.searchParams.get('page') ?? 1), result = { total: rows.length, page, pageSize: 25, counts: {}, requirements: rows.slice((page - 1) * 25, page * 25) }
      if (q === deferQuery) return new Promise(resolve => { pendingList = resolve })
      return response(result)
    }
    if (/\/evidence\/[^/]+$/.test(path)) {
      if (detailError) throw new Error('EVIDENCE_READ_FAILED')
      return response({ evidence: state.evidence.find(e => path.endsWith('/' + e.id)) })
    }
    if (path.endsWith('/evidence')) {
      const group = url.searchParams.get('review'), rows = state.evidence.filter(e => !group || group === 'all' || evidenceReviewGroup(e) === group)
      return response({ evidence: rows, total: rows.length, page: 1, pageSize: 50, counts: {} })
    }
    if (path.endsWith('/runs')) return response({ runs: state.workflowRuns })
    if (path === '/marketpilot/api/tools') {
      posts.push(JSON.parse(init!.body!)); return response({ callId: `review-call-${projectId}` })
    }
    if (path.startsWith('/marketpilot/api/executions/')) return response({ callId: `review-call-${projectId}`, projectId,
      tool: posts[0]?.name, status: 'completed', startedAt: '2026-10-11T03:00:00.000Z', question: null, value: { data: { run: { status: 'waiting_human' } } } })
    if (path.endsWith('/executions')) return response({ executions: [] })
    throw new Error(`Unexpected test request ${path}`)
  }))
})
afterEach(() => { act(() => { root.unmount() }); container.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('M2 batch and evidence interactions', () => {
  it('confirms only the current page in the exact latest batch, and makes older waits read only', async () => {
    await render(<RequirementsPage t={t} projectId={projectId} />)
    expect((container.querySelector('select[aria-label="需求批次"]') as HTMLSelectElement).value).toBe('b2')
    expect([...(container.querySelector('select[aria-label="优先级"]') as HTMLSelectElement).options].map(o => o.text)).toEqual(['全部', 'MUST', 'SHOULD', 'COULD'])
    act(() => { (container.querySelector('button[title="全选待审核"]') as HTMLButtonElement).click() }); await flush()
    await click(t('confirmSelectedReq'))
    expect(posts[0]).toEqual({ name: 'marketpilot_requirement_confirm', args: { projectId, runId: 'b2', requirementIds: state.requirements.slice(1, 26).map(r => r.id) } })
    expect(container.textContent).toContain(t('review.partial')); expect(container.textContent).not.toContain(t('baselineGenerated'))
    await change(container.querySelector('select[aria-label="需求批次"]')!, 'b1')
    expect((container.querySelector('.mp-table input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true)
    expect(button(t('confirmSelectedReq')).disabled).toBe(true)
    await change(container.querySelector('select[aria-label="需求批次"]')!, '')
    expect([...container.querySelectorAll<HTMLInputElement>('.mp-table input')].every(box => box.disabled)).toBe(true)
  })
  it('clears selection on pagination, priority and search, and never submits hidden rows', async () => {
    await render(<RequirementsPage t={t} projectId={projectId} />)
    act(() => { (container.querySelector('.mp-table input') as HTMLInputElement).click() }); await flush()
    await click(t('review.next')); expect(button(t('confirmSelectedReq')).disabled).toBe(true)
    expect(container.querySelector('.mp-table')!.textContent).toContain('Batch two 27')
    act(() => { (container.querySelector('.mp-table input') as HTMLInputElement).click() }); await flush()
    await change(container.querySelector('select[aria-label="优先级"]')!, 'should')
    expect(button(t('confirmSelectedReq')).disabled).toBe(true)
    act(() => { (container.querySelector('.mp-table input') as HTMLInputElement).click() }); await flush()
    await search('Batch two 27'); expect(button(t('confirmSelectedReq')).disabled).toBe(true)
    expect(posts).toHaveLength(0)
  })
  it('fails closed on review/list reads and recovers through a real refresh', async () => {
    reviewError = true; await render(<RequirementsPage t={t} projectId={projectId} />)
    expect(container.textContent).toContain('REVIEW_READ_FAILED'); expect(button(t('confirmSelectedReq')).disabled).toBe(true)
    reviewError = false; await click(t('workflow.refresh'))
    expect(container.textContent).not.toContain('REVIEW_READ_FAILED')
    listError = true; await click(t('workflow.refresh'))
    expect(container.textContent).toContain('REQUIREMENTS_READ_FAILED'); expect(container.querySelector('.mp-table')).toBeNull()
    expect(container.textContent).not.toContain(t('reqEmptyTitle'))
  })
  it('locates a requirement outside the selected batch, displays literal source text and jumps to evidence', async () => {
    await render(<RequirementsPage t={t} projectId={projectId} actions={actions} focus={{ kind: 'requirement', id: 'req1' }} />)
    expect(container.querySelector('.mp-drawer')).not.toBeNull()
    await click(t('review.sourceText'), '.mp-drawer button')
    expect(container.querySelector('.mp-drawer pre')?.textContent).toContain('<script>untrusted text</script>')
    expect(container.querySelector('.mp-drawer script')).toBeNull()
    await click(t('review.inspectEvidence'), '.mp-drawer button')
    expect(actions.focusRecord).toHaveBeenCalledWith('evidence', 'evidence', 'e1')
    state.requirements[0]!.status = 'confirmed'; state.revision += 1
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) }); await flush()
    expect(container.querySelector('.mp-drawer')?.textContent).toContain(t('requirementStatus.confirmed'))
    await click(t('close'), '.mp-drawer button')
    state.revision += 1; await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(container.querySelector('.mp-drawer')).toBeNull()
  })
  it('ignores a late requirement response after a newer search', async () => {
    await render(<RequirementsPage t={t} projectId={projectId} />)
    deferQuery = 'slow'; await search('slow'); expect(pendingList).toBeDefined()
    await search('Batch two 27'); expect(container.querySelector('.mp-table')?.textContent).toContain('Batch two 27')
    await act(async () => { pendingList!(response({ total: 1, page: 1, pageSize: 25, requirements: [{ ...requirements()[0]!, normalizedText: 'WRONG LATE ROW' }] })) })
    expect(container.textContent).not.toContain('WRONG LATE ROW')
  })
  it('keeps verified UNKNOWN in supplementation, opens filtered-out evidence and links back to the requirement', async () => {
    state.evidence[0]!.status = 'verified'
    await render(<EvidencePage t={t} projectId={projectId} actions={actions} />)
    await click(t('review.verified'), '.mp-reviewFilters button')
    expect(container.querySelector('.mp-table')?.textContent).not.toContain('Performance unknown')
    await render(<EvidencePage t={t} projectId={projectId} actions={actions} focus={{ kind: 'evidence', id: 'e1' }} />)
    expect(container.querySelector('.mp-drawer')?.textContent).toContain('Performance unknown')
    expect(container.querySelector('.mp-drawer')?.textContent).toContain(t('review.needs_support'))
    await click('REQ-01', '.mp-relatedLinks button')
    expect(actions.focusRecord).toHaveBeenCalledWith('requirements', 'requirement', 'req1')
    await click(t('review.addSource'), '.mp-drawer button'); expect(actions.setSection).toHaveBeenCalledWith('requirements')
  })
  it.each(['UNKNOWN', 'REJECT'])('sends the explicit %s action to the guarded tool without locally upgrading UNKNOWN', async target => {
    await render(<EvidencePage t={t} projectId={projectId} actions={actions} focus={{ kind: 'evidence', id: 'e1' }} />)
    await click(t('verifyStart')); expect(button(t('verifySubmit')).disabled).toBe(true)
    await change(container.querySelector('#mp-verify-target')!, target); await click(t('verifySubmit'))
    expect(posts[0]).toMatchObject({ name: 'marketpilot_evidence_verify', args: { projectId, evidenceId: 'e1', method: 'human', targetKind: target } })
    expect(state.evidence[0]).toMatchObject({ kind: 'UNKNOWN', status: 'draft' })
  })
  it('blocks verification on detail read errors and recovers on a new server revision', async () => {
    detailError = true; await render(<EvidencePage t={t} projectId={projectId} actions={actions} focus={{ kind: 'evidence', id: 'e1' }} />)
    expect(container.textContent).toContain('EVIDENCE_READ_FAILED'); expect(button(t('verifyStart')).disabled).toBe(true)
    detailError = false; state.revision += 1
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) }); await flush()
    expect(button(t('verifyStart')).disabled).toBe(false); expect(container.textContent).not.toContain('EVIDENCE_READ_FAILED')
  })
})
