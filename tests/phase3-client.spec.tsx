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

const noopActions: MarketPilotActions = {
  goHome: () => {}, goProjects: () => {}, goTasks: () => {}, openProject: () => {}, setSection: () => {},
  focusRecord: () => {},
}

describe('navigation store', () => {
  it('supports the tasks view', () => {
    const instance = createMarketPilotStore().create()
    instance.actions.goTasks()
    expect(instance.getSnapshot().view).toEqual({ kind: 'tasks' })
  })

  it('lands cross-module focus on a section and clears it on plain navigation', () => {
    const instance = createMarketPilotStore().create()
    instance.actions.openProject('p1')
    instance.actions.focusRecord('requirements', 'requirement', 'r9')
    expect(instance.getSnapshot().view).toEqual({
      kind: 'project', projectId: 'p1', section: 'requirements', focus: { kind: 'requirement', id: 'r9' },
    })
    instance.actions.setSection('evidence')
    expect(instance.getSnapshot().view).toEqual({ kind: 'project', projectId: 'p1', section: 'evidence' })
    instance.actions.focusRecord('evidence', 'evidence', 'e3')
    expect(instance.getSnapshot().view).toEqual({
      kind: 'project', projectId: 'p1', section: 'evidence', focus: { kind: 'evidence', id: 'e3' },
    })
  })
})

describe('TasksPage', () => {
  it('renders tracked executions with type, project, cancel and expandable steps', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse({ projects: [{ id: 'p1', name: '任务中心项目' }] })
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse(runsPayload)
      if (url.startsWith('/marketpilot/api/runs')) return jsonResponse({ runs: [] })
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

  it('binds the timeline to the exact runId only — no same-type fallback', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse({ projects: [{ id: 'p2', name: '精确关联项目' }] })
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      if (url.startsWith('/marketpilot/api/runs')) return jsonResponse({ runs: [] })
      // A same-type run exists, but its id differs from the execution's runId;
      // its distinctive step must never leak into this execution's timeline.
      if (url.startsWith('/marketpilot/api/projects/p2/runs')) {
        return jsonResponse({
          runs: [{ ...runsPayload.runs[0], id: 'run-OTHER', type: 'requirement_analysis',
            status: 'completed', currentStep: '',
            steps: [{ step: 'LOAD_DOCUMENTS', at: '2026-10-09T04:46:34.000Z' }, { step: 'SAVE_REQUIREMENTS', at: '2026-10-09T04:48:14.000Z' }],
            durationMs: 95000 }],
        })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    act(() => {
      void executionStore.adopt({
        callId: 'call-y1', tool: 'marketpilot_requirement_extract', status: 'completed',
        startedAt: new Date().toISOString(), projectId: 'p2', runId: 'run-1', question: null,
      })
    })
    render(<TasksPage t={t} actions={noopActions} />)
    await flush()
    act(() => {
      const expand = [...container!.querySelectorAll('button')].filter(b => b.textContent === t('taskShowSteps'))
      expand[expand.length - 1]!.click()
    })
    await flush()
    // The lookalike run's steps must NOT appear; the honest missing-record text does.
    expect(text()).toContain(t('runNotAvailable'))
    expect(text()).not.toContain(t('step.LOAD_DOCUMENTS'))
    expect(text()).not.toContain(t('step.SAVE_REQUIREMENTS'))
  })

  it('merges persisted run history when no live executions exist (after a host restart)', async () => {
    const history = {
      runs: [
        { id: 'run-old', type: 'solution_generation', status: 'completed', currentStep: 'COMPLETED',
          projectId: 'p1', projectName: '历史项目甲', startedAt: '2026-10-09T02:00:00.000Z', updatedAt: '2026-10-09T02:01:40.000Z',
          steps: [{ step: 'START', at: '2026-10-09T02:00:00.000Z' }, { step: 'COMPLETED', at: '2026-10-09T02:01:40.000Z' }], durationMs: 100000 },
        { id: 'run-older', type: 'tender_review', status: 'failed', currentStep: 'FAILED',
          projectId: 'p9', projectName: '历史项目乙', startedAt: '2026-10-08T09:00:00.000Z', updatedAt: '2026-10-08T09:01:00.000Z',
          steps: [{ step: 'START', at: '2026-10-08T09:00:00.000Z' }, { step: 'FAILED', at: '2026-10-08T09:01:00.000Z' }],
          error: 'No source text' },
      ],
    }
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse({ projects: [] })
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      if (url.startsWith('/marketpilot/api/runs')) return jsonResponse(history)
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<TasksPage t={t} actions={noopActions} />)
    await flush()
    // The history section renders persisted records with project names and errors.
    expect(text()).toContain(t('tasksHistoryTitle'))
    expect(text()).toContain('历史项目甲')
    expect(text()).toContain('历史项目乙')
    expect(text()).toContain(t('runType.solution_generation'))
    expect(text()).toContain('No source text')
    // History steps expand from the persisted record itself.
    act(() => {
      const expand = [...container!.querySelectorAll('button')].filter(b => b.textContent === t('taskShowSteps'))
      expand[0]!.click()
    })
    await flush()
    expect(text()).toContain(t('step.COMPLETED'))
  })

  it('falls back to per-project runs when the cross-project route is missing (older host)', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') {
        return jsonResponse({ projects: [{ id: 'p1', name: '项目甲' }, { id: 'p9', name: '项目乙' }] })
      }
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      if (url.startsWith('/marketpilot/api/runs')) return { ok: false, status: 404, json: async () => ({ error: '未知的工作台请求' }) }
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) {
        return jsonResponse({ runs: [{ ...runsPayload.runs[0], id: 'run-1', status: 'completed', currentStep: 'COMPLETED',
          steps: [{ step: 'COMPLETED', at: '2026-10-09T04:48:14.000Z' }], durationMs: 100000, projectId: undefined }] })
      }
      if (url.startsWith('/marketpilot/api/projects/p9/runs')) {
        return jsonResponse({ runs: [{ id: 'run-9', type: 'tender_review', status: 'failed', currentStep: 'FAILED',
          steps: [{ step: 'FAILED', at: '2026-10-08T09:01:00.000Z' }], startedAt: '2026-10-08T09:00:00.000Z',
          updatedAt: '2026-10-08T09:01:00.000Z', error: 'No source text' }] })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<TasksPage t={t} actions={noopActions} />)
    await flush()
    expect(text()).toContain(t('tasksHistoryTitle'))
    expect(text()).toContain('项目甲')
    expect(text()).toContain('项目乙')
    expect(text()).toContain(t('runType.tender_review'))
    expect(text()).toContain('No source text')
  })

  it('does not duplicate a run already shown as a live execution', async () => {
    const history = {
      runs: [
        { id: 'run-1', type: 'requirement_analysis', status: 'waiting_human', currentStep: 'WAITING_HUMAN',
          projectId: 'p1', projectName: '任务中心项目', startedAt: '2026-10-09T04:46:34.000Z', updatedAt: '2026-10-09T04:48:14.000Z',
          steps: [{ step: 'WAITING_HUMAN', at: '2026-10-09T04:48:14.000Z' }] },
        { id: 'run-solo', type: 'tender_review', status: 'completed', currentStep: 'COMPLETED',
          projectId: 'p1', projectName: '任务中心项目', startedAt: '2026-10-09T03:00:00.000Z', updatedAt: '2026-10-09T03:01:00.000Z',
          steps: [{ step: 'COMPLETED', at: '2026-10-09T03:01:00.000Z' }] },
      ],
    }
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse({ projects: [{ id: 'p1', name: '任务中心项目' }] })
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      if (url.startsWith('/marketpilot/api/runs')) return jsonResponse(history)
      throw new Error(`unexpected fetch: ${url}`)
    })
    act(() => {
      void executionStore.adopt({
        callId: 'call-d1', tool: 'marketpilot_requirement_extract', status: 'waiting_human',
        startedAt: new Date().toISOString(), projectId: 'p1', runId: 'run-1', question: null,
      })
    })
    render(<TasksPage t={t} actions={noopActions} />)
    await flush()
    // The module-level execution registry keeps earlier tests' records, so the
    // invariant is: total cards = live executions + persisted rows minus the
    // persisted run that a live execution already represents (run-1).
    const liveCount = executionStore.getSnapshot().length
    const total = container!.querySelectorAll('.mp-taskCard').length
    expect(total).toBe(liveCount + 1)
    // And run-1 is never rendered twice: exactly one card binds its steps.
    const runOneTitles = [...container!.querySelectorAll('.mp-taskCard .mp-cellMain')]
      .filter(node => node.textContent === t('runType.requirement_analysis'))
    expect(runOneTitles.length).toBe(
      [...executionStore.getSnapshot()].filter(view => view.tool === 'marketpilot_requirement_extract').length)
  })
})

describe('ArtifactsPage', () => {
  const REQ_UUID = '11111111-1111-4111-8111-111111111111'
  const artifactsDetail = {
    ...detailPayload,
    requirements: [{ id: REQ_UUID, normalizedText: '系统需 24 h 连续监测', status: 'confirmed', createdAt: '2026-10-09T05:00:00.000Z' }],
  }

  function artifactFetchMock(content: string): void {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(artifactsDetail)
      if (url === '/marketpilot/api/projects/p1/artifacts') return jsonResponse(artifactsList)
      if (url === '/marketpilot/api/projects/p1/artifacts/a1') {
        return jsonResponse({ artifact: { ...artifactsList.artifacts[0], content } })
      }
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
  }

  it('lists review badges and opens the markdown reader', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(detailPayload)
      if (url === '/marketpilot/api/projects/p1/artifacts') return jsonResponse(artifactsList)
      if (url === '/marketpilot/api/projects/p1/artifacts/a1') {
        return jsonResponse({ artifact: { ...artifactsList.artifacts[0], content: '# 基线\n\nUNKNOWN / 待确认条件' } })
      }
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<ArtifactsPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain('Requirement Baseline.md')
    expect(container!.querySelector('span[data-tone="warning"]')?.textContent).toBe(t('reviewStatus.draft'))
    expect(container!.querySelector('span[data-tone="success"]')?.textContent).toBe(t('reviewStatus.approved'))
    // Created and updated times are both shown as real timestamps.
    expect(text()).toContain(t('colCreated'))
    act(() => {
      const open = [...container!.querySelectorAll('button')].find(b => b.textContent === t('openArtifact'))
      open!.click()
    })
    await flush()
    expect(container!.querySelector('[data-testid="mp-markdown"]')?.textContent).toContain('UNKNOWN / 待确认条件')
    // The export bar explains the gated path and needs an explicit new path.
    expect(text()).toContain(t('exportHint'))
    const exportButton = [...container!.querySelectorAll('button')].find(b => b.textContent === t('exportArtifact'))
    expect(exportButton).toBeDefined()
    expect(exportButton!.disabled).toBe(true)
  })

  it('reads in a true single-column layout — no reserved 224px side grid column', async () => {
    artifactFetchMock('# 基线\n\nUNKNOWN / 待确认条件')
    render(<ArtifactsPage t={t} projectId="p1" />)
    await flush()
    act(() => {
      const open = [...container!.querySelectorAll('button')].find(b => b.textContent === t('openArtifact'))
      open!.click()
    })
    await flush()
    // The reader document is a single-column article, never the 2-column grid.
    expect(container!.querySelector('.mp-readerSingle')).not.toBeNull()
    expect(container!.querySelector('.mp-readerLayout')).toBeNull()
  })

  it('shows business short codes instead of raw UUIDs, with the code map for traceability', async () => {
    artifactFetchMock(`# 基线\n\n- [${REQ_UUID}] 系统需 24 h 连续监测\n`)
    render(<ArtifactsPage t={t} projectId="p1" />)
    await flush()
    act(() => {
      const open = [...container!.querySelectorAll('button')].find(b => b.textContent === t('openArtifact'))
      open!.click()
    })
    await flush()
    const markdown = container!.querySelector('[data-testid="mp-markdown"]')?.textContent ?? ''
    expect(markdown).toContain('REQ-01')
    expect(markdown).not.toContain(REQ_UUID)
    // The collapsible code map keeps the full record id reachable.
    const codeMap = container!.querySelector('details.mp-codeMap')
    expect(codeMap?.textContent).toContain(t('codeMapTitle'))
    expect(codeMap?.textContent).toContain(`（${REQ_UUID.slice(0, 8)}）`)
    expect(codeMap?.textContent).toContain('系统需 24 h 连续监测')
  })

  it('submits artifact export through the guarded tool with the typed path', async () => {
    const postedTools: { name: string; args: Record<string, unknown> }[] = []
    fetchMock.mockImplementation(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(detailPayload)
      if (url === '/marketpilot/api/projects/p1/artifacts') return jsonResponse(artifactsList)
      if (url === '/marketpilot/api/projects/p1/artifacts/a1') {
        return jsonResponse({ artifact: { ...artifactsList.artifacts[0], content: '# 基线' } })
      }
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (/\/marketpilot\/api\/executions\/call-/.test(url)) {
        return jsonResponse({ callId: 'call-x1', tool: 'marketpilot_artifact_export', projectId: 'p1',
          status: 'waiting_human', startedAt: '2026-10-09T07:00:00.000Z',
          question: { header: '人工审核', question: '是否确认 导出成果？', detail: '{}', options: ['确认', '退回修改'] } })
      }
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      if (url === '/marketpilot/api/tools' && init?.method === 'POST') {
        postedTools.push(JSON.parse(init.body!) as { name: string; args: Record<string, unknown> })
        return jsonResponse({ callId: 'call-x1' })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<ArtifactsPage t={t} projectId="p1" />)
    await flush()
    act(() => {
      const open = [...container!.querySelectorAll('button')].find(b => b.textContent === t('openArtifact'))
      open!.click()
    })
    await flush()
    const exportButton = [...container!.querySelectorAll('button')].find(b => b.textContent === t('exportArtifact'))
    const input = container!.querySelector('input[type=text]') as HTMLInputElement
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'E:\\exports\\baseline.md')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    expect(exportButton!.disabled).toBe(false)
    act(() => { exportButton!.click() })
    await flush()
    await flush()
    const post = postedTools.find(entry => entry.name === 'marketpilot_artifact_export')
    expect(post).toBeDefined()
    expect(post!.args.artifactId).toBe('a1')
    expect(post!.args.path).toBe('E:\\exports\\baseline.md')
    expect(post!.args.projectId).toBe('p1')
    // The export parks on the real human gate — nothing is auto-approved.
    expect(container!.querySelector('.mp-dialog')?.textContent).toContain('导出成果')
  })
})

describe('ProjectOverviewPage stage navigation', () => {
  it('derives live stage state and jumps to the section on click', async () => {
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
    // A waiting_human requirement run marks the requirements stage as waiting
    // despite the status baseline, and the next-action card leads with it.
    const stage = container!.querySelector('button.mp-stageItem[data-state="waiting"]')
    expect(stage?.textContent).toContain(t('sectionRequirements'))
    expect(text()).toContain(t('statWaiting'))
    expect(text()).toContain(t('projectActivity'))
    act(() => {
      const research = [...container!.querySelectorAll<HTMLButtonElement>('button.mp-stageItem')]
        .find(b => b.textContent?.includes(t('sectionResearch')))
      research!.click()
    })
    await flush()
    // The static view prop cannot re-render; the store's section change is the contract.
    expect(instance.getSnapshot().view).toEqual({ kind: 'project', projectId: 'p1', section: 'research' })
  })

  it('keeps the stage baseline consistent after a successful solution generation', async () => {
    const solutionDetail = {
      ...detailPayload,
      project: { ...detailPayload.project, status: 'solution_ready' },
    }
    const solutionRuns = {
      runs: [{ id: 'run-s1', type: 'solution_generation', status: 'completed', currentStep: 'COMPLETED',
        steps: [{ step: 'START', at: '2026-10-09T04:00:00.000Z' }, { step: 'COMPLETED', at: '2026-10-09T04:01:30.000Z' }],
        startedAt: '2026-10-09T04:00:00.000Z', updatedAt: '2026-10-09T04:01:30.000Z', durationMs: 90000, output: null }],
    }
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(solutionDetail)
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse(solutionRuns)
      throw new Error(`unexpected fetch: ${url}`)
    })
    const instance = createMarketPilotStore().create()
    instance.actions.openProject('p1')
    render(<ProjectOverviewPage t={t} actions={instance.actions} view={{ kind: 'project', projectId: 'p1', section: 'overview' }} />)
    await flush()
    // 方案生成 shows done; the current stage is 投标检查 — no stale "current" hint
    // on a stage whose workflow already finished.
    const stages = [...container!.querySelectorAll<HTMLButtonElement>('button.mp-stageItem')]
    expect(stages.find(b => b.textContent?.includes(t('sectionSolution')))?.getAttribute('data-state')).toBe('done')
    expect(stages.find(b => b.textContent?.includes(t('sectionTender')))?.getAttribute('data-state')).toBe('current')
    expect(text()).toContain(t('next.solution_ready'))
  })
})
