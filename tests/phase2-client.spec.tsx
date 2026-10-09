// @vitest-environment jsdom
/** RequirementsPage render tests: documents, table statuses, and the detail drawer. */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: React.ComponentProps<'button'>) => <button {...props} />,
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Tag: (props: { tone?: string; className?: string; children?: React.ReactNode }) => (
    <span data-tone={props.tone} className={props.className}>{props.children}</span>
  ),
  StateDot: () => <span data-testid="mp-stub-statedot" />,
  IconListPenOutlineRegular: () => <svg aria-hidden="true" />,
}))

import { RequirementsPage } from '../src/client/pages/RequirementsPage.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]

interface JsonLike { ok: boolean; status: number; json(): Promise<unknown> }
const jsonResponse = (payload: unknown): JsonLike => ({ ok: true, status: 200, json: async () => payload })

const documentsPayload = {
  documents: [
    { id: 'd1', name: 'brief.md', kind: 'customer_requirement', importedAt: '2026-10-09T01:00:00.000Z', bytes: 120, hasText: true },
    { id: 'd2', name: 'tender.md', kind: 'tender', importedAt: '2026-10-09T01:01:00.000Z', bytes: 80, hasText: true },
  ],
}

const requirementsPayload = {
  total: 2, page: 1, pageSize: 100, counts: { proposed: 1, unknown: 1 },
  requirements: [
    { id: 'r10000000-0000-0000-0000-000000000001', shortId: 'r1000000', originalText: '连续监测原文', normalizedText: '系统应连续监测', type: 'functional', priority: 'must', status: 'proposed', sourceDocumentId: 'd1', sourceDocumentName: 'brief.md', sourceLocator: '第 1 条', updatedAt: '2026-10-09T01:02:00.000Z' },
    { id: 'r20000000-0000-0000-0000-000000000002', shortId: 'r2000000', originalText: '夜间原文', normalizedText: '系统应支持夜间作业', type: 'functional', priority: 'should', status: 'unknown', sourceDocumentId: 'd1', sourceDocumentName: 'brief.md', updatedAt: '2026-10-09T01:02:00.000Z' },
  ],
}

let fetchMock: ReturnType<typeof vi.fn>
let container: HTMLElement | undefined
let root: Root | undefined

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  fetchMock = vi.fn()
  ;(globalThis as { fetch: unknown }).fetch = fetchMock
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = undefined
  root = undefined
  vi.restoreAllMocks()
})

function render(node: React.ReactNode): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  const created = createRoot(container)
  root = created
  act(() => { created.render(node) })
  return container
}

async function flush(): Promise<void> {
  await act(async () => {})
}

function text(): string {
  return container?.textContent ?? ''
}

describe('RequirementsPage', () => {
  it('renders documents, the review table with statuses, and opens the source drawer', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith('/marketpilot/api/projects/p1/documents')) return jsonResponse(documentsPayload)
      if (url.startsWith('/marketpilot/api/projects/p1/requirements')) return jsonResponse(requirementsPayload)
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse({ runs: [] })
      if (url.startsWith('/marketpilot/api/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<RequirementsPage t={t} projectId="p1" />)
    await flush()
    // Documents list with metadata.
    expect(text()).toContain('brief.md')
    expect(text()).toContain('tender.md')
    // Table rows with status mapping (proposed → 待审核, unknown → 未知待补).
    expect(text()).toContain('系统应连续监测')
    expect(text()).toContain('系统应支持夜间作业')
    expect(container!.querySelector('span[data-tone="warning"]')?.textContent).toBe('待审核')
    // Extract button disabled without a selected document.
    const extract = [...container!.querySelectorAll('button')].find(b => b.textContent?.includes(t('extractSelected')))
    expect(extract!.disabled).toBe(true)
    // Detail drawer opens with original text and locator.
    act(() => {
      const detail = [...container!.querySelectorAll('button')].find(b => b.textContent === t('colDetail'))
      detail!.click()
    })
    await flush()
    expect(text()).toContain(t('drawerOriginal'))
    expect(text()).toContain('连续监测原文')
    expect(text()).toContain('第 1 条')
    act(() => {
      const close = [...container!.querySelectorAll('button')].find(b => b.textContent === t('close'))
      close!.click()
    })
    await flush()
    expect(text()).not.toContain(t('drawerOriginal'))
  })

  it('renders the empty state before any extraction', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.startsWith('/marketpilot/api/projects/p1/documents')) return jsonResponse({ documents: [] })
      if (url.startsWith('/marketpilot/api/projects/p1/requirements')) {
        return jsonResponse({ total: 0, page: 1, pageSize: 100, counts: {}, requirements: [] })
      }
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse({ runs: [] })
      if (url.startsWith('/marketpilot/api/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<RequirementsPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain(t('docsEmpty'))
    expect(text()).toContain(t('reqEmptyTitle'))
  })

  it('confirms a waiting batch started by another session (server-side runId)', async () => {
    const waitingRun = {
      id: 'run-waiting-0001', type: 'requirement_analysis', status: 'waiting_human', currentStep: 'WAITING_HUMAN',
      steps: [{ step: 'WAITING_HUMAN', at: '2026-10-09T04:48:14.000Z' }], startedAt: '2026-10-09T04:46:34.000Z',
      updatedAt: '2026-10-09T04:48:14.000Z', output: { requirementIds: requirementsPayload.requirements.map(row => row.id) },
    }
    const postedTools: { name: string; args: Record<string, unknown> }[] = []
    let callSeq = 0
    fetchMock.mockImplementation(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input)
      if (url.startsWith('/marketpilot/api/projects/p1/documents')) return jsonResponse(documentsPayload)
      if (url.startsWith('/marketpilot/api/projects/p1/requirements')) return jsonResponse(requirementsPayload)
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse({ runs: [waitingRun] })
      if (url === '/marketpilot/api/executions?projectId=p1') return jsonResponse({ executions: [] })
      if (url === '/marketpilot/api/tools' && init?.method === 'POST') {
        postedTools.push(JSON.parse(init.body!) as { name: string; args: Record<string, unknown> })
        callSeq += 1
        return jsonResponse({ callId: `call-${String(callSeq)}` })
      }
      if (/\/marketpilot\/api\/executions\/call-/.test(url)) {
        return jsonResponse({ callId: `call-${String(callSeq)}`, tool: 'marketpilot_requirement_confirm',
          status: 'completed', startedAt: '2026-10-09T04:50:00.000Z', question: null,
          value: { summary: '', data: { run: { id: waitingRun.id, status: 'completed' } } } })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<RequirementsPage t={t} projectId="p1" />)
    await flush()
    // Select all proposed, then confirm: the runId must come from the server's
    // waiting run, not from any session-local execution record.
    act(() => {
      ;(document.querySelector('button[title="全选待审核"]') as HTMLElement).click()
    })
    await flush()
    const confirm = [...container!.querySelectorAll('button')].find(b => (b.textContent ?? '').includes(t('confirmSelectedReq')))
    expect(confirm!.disabled).toBe(false)
    act(() => { confirm!.click() })
    await flush()
    const confirmPost = postedTools.find(post => post.name === 'marketpilot_requirement_confirm')
    expect(confirmPost).toBeDefined()
    expect(confirmPost!.args.runId).toBe('run-waiting-0001')
  })
})
