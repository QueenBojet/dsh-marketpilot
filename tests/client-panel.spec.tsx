// @vitest-environment jsdom
/** Panel render tests: pages render real API payloads and drive the navigation store. */
import { act, useSyncExternalStore, type ComponentProps, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ComponentProps<'button'>) => <button {...props} />,
  Input: (props: ComponentProps<'input'>) => <input {...props} />,
  Tag: (props: { tone?: string; className?: string; children?: ReactNode }) => (
    <span data-tone={props.tone} className={props.className}>{props.children}</span>
  ),
  StateDot: () => <span data-testid="mp-stub-statedot" />,
  IconListPenOutlineRegular: () => <svg aria-hidden="true" />,
}))

import { MarketPilotPanel } from '../src/client/MarketPilotPanel.tsx'
import { StatusTag } from '../src/client/components/StatusTag.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'
import { createMarketPilotStore, type MarketPilotActions } from '../src/client/stores.ts'
import { projectWorkflowOverview } from '../src/domain/project-workflow.ts'
import { projectReviewOverview } from '../src/domain/project-review.ts'
import { capabilities, withInputs, workflowState } from './workflow-fixtures.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]

interface JsonLike { ok: boolean; status: number; json(): Promise<unknown> }

function jsonResponse(payload: unknown): JsonLike {
  return { ok: true, status: 200, json: async () => payload }
}

const projectsPayload = {
  projects: [
    { id: 'p1', name: 'CALM 单点系泊监测', status: 'requirements_ready', industry: '船舶', scenario: '漏油监测', updatedAt: '2026-10-09T01:00:00.000Z' },
    { id: 'p2', name: 'GLM 结构化验证', status: 'draft', updatedAt: '2026-10-08T02:00:00.000Z' },
  ],
}

const detailPayload = {
  project: projectsPayload.projects[0],
  context: {},
  documents: [{ id: 'd1' }, { id: 'd2' }],
  requirements: [
    { id: 'r1', status: 'confirmed' },
    { id: 'r2', status: 'unknown' },
  ],
  evidence: [{ id: 'e1' }],
  competitors: [],
  policies: [],
  alternatives: [{ id: 'a1' }],
  decisions: [],
  tenderItems: [],
  artifacts: [{ id: 'art1' }],
  workflowRuns: [],
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

function makePanelProps(): { useStore: Parameters<typeof MarketPilotPanel>[0]['useStore']; actions: MarketPilotActions } {
  const instance = createMarketPilotStore().create()
  return {
    // A reactive stand-in for the renderer's selector hook: same subscribe +
    // snapshot contract, so store updates re-render the panel under test.
    useStore: selector => useSyncExternalStore(
      listener => instance.subscribe(listener),
      () => selector(instance.getSnapshot()),
    ),
    actions: instance.actions,
  }
}

describe('MarketPilot main panel', () => {
  it('renders the home page with real project rows and real stats — no permanent placeholders', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse(projectsPayload)
      if (url === '/marketpilot/api/executions') {
        return jsonResponse({ executions: [{ callId: 'c1', tool: 'marketpilot_requirement_extract', status: 'running', startedAt: '2026-10-09T01:00:00.000Z', question: null }] })
      }
      if (url === '/marketpilot/api/projects/p1/runs?active=1') {
        return jsonResponse({ runs: [{ id: 'run-1', type: 'requirement_analysis', status: 'waiting_human', currentStep: 'WAITING_HUMAN', steps: [], startedAt: '2026-10-09T01:00:00.000Z', updatedAt: '2026-10-09T01:00:00.000Z' }] })
      }
      if (url === '/marketpilot/api/projects/p2/runs?active=1') return jsonResponse({ runs: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<MarketPilotPanel t={t} {...makePanelProps()} />)
    await flush()
    expect(text()).toContain('CALM 单点系泊监测')
    expect(text()).toContain('GLM 结构化验证')
    expect(text()).toContain(marketpilotLocales.zh.recentProjects)
    expect(container!.querySelectorAll('.mp-homeJourney')).toHaveLength(1)
    expect(container!.querySelectorAll('.mp-homeJourney li')).toHaveLength(5)
    expect(container!.querySelector('.mp-homeJourney')?.closest('details')).toBeNull()
    // The three stat cards carry real values: 2 projects, 1 waiting review, 1 running.
    const cards = [...container!.querySelectorAll('.mp-cards .mp-card')].map(card => card.textContent ?? '')
    expect(cards[0]).toContain('2')
    expect(cards[1]).toContain('1')
    expect(cards[2]).toContain('1')
    // The attention list names the project with the waiting review.
    expect(text()).toContain(marketpilotLocales.zh.homeAttention)
    expect(text()).toContain('CALM 单点系泊监测')
    expect(fetchMock).toHaveBeenCalledWith('/marketpilot/api/projects', { method: 'GET' })
  })

  it('marks stats 暂无数据 when the aggregates cannot load — never a fake 0', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse(projectsPayload)
      if (url === '/marketpilot/api/executions') throw new Error('network down')
      if (url.includes('/runs?active=1')) throw new Error('network down')
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<MarketPilotPanel t={t} {...makePanelProps()} />)
    await flush()
    const cards = [...container!.querySelectorAll('.mp-cards .mp-card')].map(card => card.textContent ?? '')
    expect(cards[1]).toContain(marketpilotLocales.zh.statUnavailable)
    expect(cards[2]).toContain(marketpilotLocales.zh.statUnavailable)
  })

  it('renders the empty state when no projects exist', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ projects: [] }))
    render(<MarketPilotPanel t={t} {...makePanelProps()} />)
    await flush()
    expect(text()).toContain(marketpilotLocales.zh.emptyTitle)
    expect(text()).toContain(marketpilotLocales.zh.emptyBody)
  })

  it('renders the error state with a retry action when loading fails', async () => {
    fetchMock.mockRejectedValue(new Error('网络中断'))
    render(<MarketPilotPanel t={t} {...makePanelProps()} />)
    await flush()
    expect(text()).toContain(marketpilotLocales.zh.loadError)
    expect(text()).toContain('网络中断')
  })

  it('navigates home → projects → project overview → guided requirement results', async () => {
    const requirementState = withInputs(workflowState())
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse(projectsPayload)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(detailPayload)
      if (url === '/marketpilot/api/projects/p1/workflow') return jsonResponse(projectWorkflowOverview(withInputs(workflowState()), capabilities, []))
      if (url === '/marketpilot/api/projects/p1/review') return jsonResponse(projectReviewOverview(requirementState))
      if (url === '/marketpilot/api/projects/p1/documents') return jsonResponse({ documents: requirementState.documents.map(doc => ({ ...doc, bytes: 10, hasText: true })) })
      if (url.startsWith('/marketpilot/api/projects/p1/requirements?')) return jsonResponse({ requirements: requirementState.requirements.map(row => ({ ...row, shortId: 'REQ-01', sourceDocumentId: 'doc1', sourceDocumentName: 'customer.md' })), total: 1, page: 1, pageSize: 25, counts: { confirmed: 1 } })
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    const props = makePanelProps()
    render(<MarketPilotPanel t={t} {...props} />)
    await flush()
    act(() => {
      const nav = [...container!.querySelectorAll('button')].find(b => b.textContent === marketpilotLocales.zh.navProjects)
      nav!.click()
    })
    await flush()
    expect(container!.querySelector('input[placeholder="项目名称（必填）"]')).not.toBeNull()
    act(() => {
      const link = [...container!.querySelectorAll('button')].find(b => b.textContent === 'CALM 单点系泊监测')
      link!.click()
    })
    await flush()
    expect(fetchMock).toHaveBeenCalledWith('/marketpilot/api/projects/p1', { method: 'GET' })
    expect(text()).toContain('CALM 单点系泊监测')
    expect(text()).toContain(marketpilotLocales.zh['guided.currentTask'])
    act(() => {
      const section = container!.querySelector<HTMLButtonElement>('.mp-guidedNavStep[data-stage="S1"]')
      section!.click()
    })
    await flush()
    // Phase 2: the requirements section is a real page (uploader + review table).
    expect(text()).toContain(marketpilotLocales.zh['guided.requirementsResult'])
    expect(text()).toContain(marketpilotLocales.zh.docsDrop)
  })
})

describe('StatusTag', () => {
  it('maps known statuses to localized labels with tones', () => {
    render(<StatusTag t={t} kind="project" value="requirements_ready" />)
    expect(container?.querySelector('span[data-tone="info"]')?.textContent).toBe(marketpilotLocales.zh['projectStatus.requirements_ready'])
  })

  it('falls back to the raw code for unknown values', () => {
    render(<StatusTag t={t} kind="run" value="weird_state" />)
    expect(container?.querySelector('span[data-tone="outline"]')?.textContent).toBe('weird_state')
  })
})
