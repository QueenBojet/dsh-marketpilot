// @vitest-environment jsdom
/** Phase 3 render tests: task center, artifact reader, and phase-bar navigation. */
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
  MarkdownText: (props: { text: string }) => <div data-testid="mp-markdown">{props.text}</div>,
}))

import { ArtifactsPage } from '../src/client/pages/ArtifactsPage.tsx'
import { ProjectOverviewPage } from '../src/client/pages/ProjectOverviewPage.tsx'
import { TasksPage } from '../src/client/pages/TasksPage.tsx'
import { executionStore } from '../src/client/hooks/executionStore.ts'
import { marketpilotLocales } from '../src/client/locales.ts'
import { createMarketPilotStore, type MarketPilotActions } from '../src/client/stores.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]

interface JsonLike { ok: boolean; status: number; json(): Promise<unknown> }
const jsonResponse = (payload: unknown): JsonLike => ({ ok: true, status: 200, json: async () => payload })

const detailPayload = {
  project: { id: 'p1', name: '任务中心项目', status: 'requirements_ready', industry: '船舶', scenario: '监测', customer: undefined, updatedAt: '2026-10-09T05:00:00.000Z' },
  context: {},
  documents: [],
  requirements: [{ id: 'r1', status: 'confirmed' }],
  evidence: [],
  alternatives: [],
  decisions: [],
  tenderItems: [],
  artifacts: [],
  workflowRuns: [{ id: 'run-1', type: 'requirement_analysis', status: 'waiting_human', currentStep: 'WAITING_HUMAN' }],
}

const runsPayload = {
  runs: [{
    id: 'run-1', type: 'requirement_analysis', status: 'waiting_human', currentStep: 'WAITING_HUMAN',
    steps: [{ step: 'WAITING_HUMAN', at: '2026-10-09T04:48:14.000Z' }], startedAt: '2026-10-09T04:46:34.000Z',
    updatedAt: '2026-10-09T04:48:14.000Z', output: null,
  }],
}

const artifactsList = {
  artifacts: [
    { id: 'a1', name: 'Requirement Baseline.md', type: 'requirement_baseline', format: 'markdown', reviewStatus: 'draft', createdAt: '2026-10-09T05:00:00.000Z', updatedAt: '2026-10-09T05:00:00.000Z' },
    { id: 'a2', name: 'Compliance Matrix.md', type: 'compliance_matrix', format: 'markdown', reviewStatus: 'approved', createdAt: '2026-10-09T05:01:00.000Z', updatedAt: '2026-10-09T05:01:00.000Z' },
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

const noopActions: MarketPilotActions = { goHome: () => {}, goProjects: () => {}, goTasks: () => {}, openProject: () => {}, setSection: () => {} }

describe('navigation store', () => {
  it('supports the tasks view', () => {
    const instance = createMarketPilotStore().create()
    instance.actions.goTasks()
    expect(instance.getSnapshot().view).toEqual({ kind: 'tasks' })
  })
})

describe('TasksPage', () => {
  it('renders tracked executions with type, project, cancel and expandable steps', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse({ projects: [{ id: 'p1', name: '任务中心项目' }] })
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse(runsPayload)
      throw new Error(`unexpected fetch: ${url}`)
    })
    act(() => {
      void executionStore.adopt({
        callId: 'call-x1', tool: 'marketpilot_requirement_extract', status: 'waiting_human',
        startedAt: new Date().toISOString(), projectId: 'p1', runId: 'run-1', question: null,
      })
    })
    render(<TasksPage t={t} actions={noopActions} />)
    await flush()
    expect(text()).toContain(t('runType.requirement_analysis'))
    expect(text()).toContain('任务中心项目')
    expect(text()).toContain(t('cancelTask'))
    act(() => {
      const expand = [...container!.querySelectorAll('button')].find(b => b.textContent === t('taskShowSteps'))
      expand!.click()
    })
    await flush()
    expect(text()).toContain(t('step.WAITING_HUMAN'))
  })
})

describe('ArtifactsPage', () => {
  it('lists review badges and opens the markdown reader', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1/artifacts') return jsonResponse(artifactsList)
      if (url === '/marketpilot/api/projects/p1/artifacts/a1') {
        return jsonResponse({ artifact: { ...artifactsList.artifacts[0], content: '# 基线\n\nUNKNOWN / 待确认条件' } })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<ArtifactsPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain('Requirement Baseline.md')
    expect(container!.querySelector('span[data-tone="warning"]')?.textContent).toBe(t('reviewStatus.draft'))
    expect(container!.querySelector('span[data-tone="success"]')?.textContent).toBe(t('reviewStatus.approved'))
    act(() => {
      const open = [...container!.querySelectorAll('button')].find(b => b.textContent === t('openArtifact'))
      open!.click()
    })
    await flush()
    expect(container!.querySelector('[data-testid="mp-markdown"]')?.textContent).toContain('UNKNOWN / 待确认条件')
  })
})

describe('ProjectOverviewPage phase bar', () => {
  it('derives live phase state and jumps to the section on click', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(detailPayload)
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse(runsPayload)
      throw new Error(`unexpected fetch: ${url}`)
    })
    const instance = createMarketPilotStore().create()
    instance.actions.openProject('p1')
    render(<ProjectOverviewPage t={t} actions={instance.actions} view={{ kind: 'project', projectId: 'p1', section: 'overview' }} />)
    await flush()
    // A waiting_human requirement run marks stage 1 as waiting despite the status baseline.
    const phase = container!.querySelector('button.mp-phase[data-state="waiting"]')
    expect(phase?.textContent).toContain(t('phaseRequirement'))
    act(() => {
      const research = [...container!.querySelectorAll<HTMLButtonElement>('button.mp-phase')]
        .find(b => b.textContent?.includes(t('phaseResearch')))
      research!.click()
    })
    await flush()
    // The static view prop cannot re-render; the store's section change is the contract.
    expect(instance.getSnapshot().view).toEqual({ kind: 'project', projectId: 'p1', section: 'research' })
  })
})
