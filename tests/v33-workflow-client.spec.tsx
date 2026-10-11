// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (p: React.ComponentProps<'button'>) => <button {...p} />,
  Tag: (p: { children: React.ReactNode }) => <span>{p.children}</span>,
  MarkdownText: (p: { text: string }) => <div>{p.text}</div>,
  StateDot: () => <span />,
  IconListPenOutlineRegular: () => <svg />,
}))
import { ProjectOverviewPage } from '../src/client/pages/ProjectOverviewPage.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'
import { createMarketPilotStore } from '../src/client/stores.ts'
import { executionStore } from '../src/client/hooks/executionStore.ts'
import { designOverview } from '../src/services/design-overview.ts'
import { projectWorkflowOverview } from '../src/domain/project-workflow.ts'
import { capabilities, now, run, withDecision, withInputs, withSolution, workflowState } from './workflow-fixtures.ts'
import type { ProjectState } from '../src/domain/state.ts'
const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]
let root: Root, container: HTMLElement, state: ProjectState, readError: boolean
let store: ReturnType<ReturnType<typeof createMarketPilotStore>['create']>
let executionFacts: Parameters<typeof projectWorkflowOverview>[2]
let workflowCapabilities: typeof capabilities
const response = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload })
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 15)) }) }
function Host() {
  const nav = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return nav.view.kind === 'project' ? <ProjectOverviewPage t={t} actions={store.actions} view={nav.view} mode={nav.workflowModes?.p1 ?? 'guided'} /> : null
}
async function render() { act(() => { root.render(<Host />) }); await flush() }
async function click(label: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label)
  expect(button, label).toBeDefined()
  act(() => { button!.click() }); await flush()
}
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state = workflowState(); readError = false; executionFacts = []; workflowCapabilities = structuredClone(capabilities)
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  store = createMarketPilotStore().create(); store.actions.openProject('p1')
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    const url = String(input)
    if (url.endsWith('/workflow')) {
      if (readError) throw new Error('WORKFLOW_READ_FAILED: test disconnect')
      return response(projectWorkflowOverview(state, workflowCapabilities, executionFacts))
    }
    if (url.endsWith('/design')) return response(designOverview(state))
    if (url === '/marketpilot/api/projects/p1') return response(state)
    if (url.includes('/executions')) return response({ executions: [] })
    if (url.includes('/requirements')) return response({ requirements: state.requirements.map(r => ({ ...r, shortId: 'REQ-01', sourceDocumentId: 'doc1', sourceDocumentName: 'customer.md' })), total: state.requirements.length, counts: {}, page: 1, pageSize: 100 })
    if (url.includes('/evidence')) return response({ evidence: state.evidence, total: state.evidence.length, counts: {}, page: 1, pageSize: 100 })
    if (url.includes('/documents')) return response({ documents: state.documents })
    if (url.includes('/alternatives')) return response({ alternatives: state.alternatives })
    if (url.includes('/artifacts')) return response({ artifacts: state.artifacts })
    if (url.includes('/runs')) return response({ runs: state.workflowRuns })
    throw new Error(`unexpected fetch ${url}`)
  }))
})
afterEach(() => { act(() => { root.unmount() }); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
describe('V3.3 interactive project workflow', () => {
  it('empty project shows all stages and cannot execute route generation', async () => {
    await render()
    expect(container.querySelectorAll('.mp-stepCard')).toHaveLength(8)
    expect(container.querySelector('.mp-stageAction')?.getAttribute('data-stage')).toBe('S0')
    act(() => { (container.querySelector('.mp-stepCard[data-stage="S4"]') as HTMLButtonElement).click() }); await flush()
    const generate = [...container.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.textContent === t('generateAlternatives') || b.textContent === t('workflow.action.S4'))
    expect(generate.length).toBeGreaterThan(0); expect(generate.every(b => b.disabled)).toBe(true)
    expect(container.textContent).toContain(t('workflow.needConfirmed'))
    expect(container.querySelector('.mp-prerequisites .mp-link')).not.toBeNull()
  })
  it('requirement wait jumps to its batch without starting a tool', async () => {
    state = withInputs(state); state.requirements[0]!.status = 'proposed'
    state.workflowRuns.push({ ...run('batch1', 'requirement_analysis', 'waiting_human'), output: { requirementIds: ['req1'] } })
    const start = vi.spyOn(executionStore, 'start').mockResolvedValue('should-not-start')
    await render(); await click(t('workflow.reviewRequirements'))
    expect(store.getSnapshot().view).toMatchObject({ section: 'requirements', projectId: 'p1' })
    expect(start).not.toHaveBeenCalled()
  })
  it('Decision leads to solution and the stage CTA executes the real guarded tool path', async () => {
    state = withDecision()
    const start = vi.spyOn(executionStore, 'start').mockResolvedValue('call-test')
    await render(); await click(t('workflow.action.S5'))
    expect(store.getSnapshot().view).toMatchObject({ section: 'solution' })
    await click(t('workflow.action.S5'))
    expect(start).toHaveBeenCalledWith('marketpilot_solution_generate', { projectId: 'p1' })
  })
  it('solution with no tender points to artifacts and marks the tender branch optional', async () => {
    state = withSolution(); await render()
    expect(container.querySelector('.mp-stageAction')?.getAttribute('data-stage')).toBe('S7')
    expect(container.querySelector('.mp-stepCard[data-stage="S6"]')?.getAttribute('data-status')).toBe('skipped_optional')
    await click(t('workflow.action.S7'))
    expect(store.getSnapshot().view).toMatchObject({ section: 'artifacts' })
  })
  it('guided/professional mode shares project, section, and survives return', async () => {
    state = withDecision(); await render()
    await click(t('workflow.mode.professional'))
    expect(store.getSnapshot().workflowModes?.p1).toBe('professional')
    expect(container.querySelectorAll('.mp-stageAction')).toHaveLength(1)
    expect(container.querySelector('.mp-flowSummary')?.textContent).toContain(t('workflow.latestArtifact'))
    await click(t('workflow.action.S5')); await click(t('workflow.allStages'))
    expect(store.getSnapshot().view).toMatchObject({ projectId: 'p1', section: 'overview' })
    expect(container.querySelector('.mp-layout')?.getAttribute('data-mode')).toBe('professional')
  })
  it('server read failure is explicit; retry restores facts, never a fabricated zero', async () => {
    state.project.status = 'solution_ready'; readError = true; await render()
    expect(container.textContent).toContain('WORKFLOW_READ_FAILED')
    expect(container.querySelectorAll('.mp-stepCard')).toHaveLength(0)
    expect(container.querySelector('.mp-stageItem[data-state="done"]')).toBeNull()
    readError = false; await click(t('retry'))
    expect(container.querySelectorAll('.mp-stepCard')).toHaveLength(8)
  })
  it('an active task navigation never starts a second execution', async () => {
    state = withDecision()
    executionFacts = [{ callId: 'active', tool: 'marketpilot_solution_generate', status: 'running', projectId: 'p1', startedAt: now, question: null }]
    const start = vi.spyOn(executionStore, 'start').mockResolvedValue('unexpected')
    await render(); await click(t('workflow.locateTask'))
    expect(store.getSnapshot().view).toMatchObject({ section: 'solution' })
    expect(start).not.toHaveBeenCalled()
    expect(container.querySelector('.mp-stageAction')?.getAttribute('data-status')).toBe('running')
  })
  it('failure and recorded steps are visible with the recovery path', async () => {
    state = withDecision(); state.workflowRuns.push(run('failure', 'solution_generation', 'failed'))
    await render()
    expect(container.textContent).toContain('MODEL_TIMEOUT')
    expect(container.querySelector('.mp-stageAction')?.getAttribute('data-status')).toBe('failed')
    expect(container.textContent).toContain(t('workflow.recordedSteps'))
  })
  it('missing model blocks generation but preserves an existing route Human Gate', async () => {
    state = withDecision(); state.decisions = []; state.project.activeDecisionId = undefined; state.alternatives[0]!.status = 'candidate'
    workflowCapabilities.model = { available: false, mode: 'unavailable', reason: 'test missing provider' }
    const start = vi.spyOn(executionStore, 'start').mockResolvedValue('human-gate-test')
    await render(); await click(t('workflow.chooseRoute'))
    expect(container.querySelector('.mp-stageItem[data-stage="S4"]')?.getAttribute('data-state')).toBe('waiting')
    const generate = [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === t('generateAlternatives'))
    expect(generate?.disabled).toBe(true)
    const pick = container.querySelector<HTMLInputElement>('input[type="radio"]')
    expect(pick).not.toBeNull()
    act(() => { pick!.click() })
    const input = container.querySelector<HTMLTextAreaElement>('[aria-label="'+t('rationale')+'"]')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, 'Test human review only')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush(); await click(t('submitDecision')); await click(t('design.openHumanGate'))
    expect(start).toHaveBeenCalledWith('marketpilot_decision_confirm', expect.objectContaining({ projectId: 'p1', alternativeId: 'alt1', rationale: 'Test human review only' }))
  })
})
