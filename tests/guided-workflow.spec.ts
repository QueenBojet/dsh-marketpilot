import { describe, expect, it } from 'vitest'
import { projectWorkflowOverview } from '../src/domain/project-workflow.ts'
import { GUIDED_STEPS, guidedCurrentStep, guidedResult } from '../src/client/guidedWorkflow.ts'
import { marketpilotLocales } from '../src/client/locales.ts'
import { capabilities, now, run, withDecision, withInputs, withSolution, workflowState } from './workflow-fixtures.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]
const project = (state = workflowState(), executions: Parameters<typeof projectWorkflowOverview>[2] = []) => projectWorkflowOverview(state, capabilities, executions)
describe('Guided navigation preserves backend facts', () => {
  it('does not infer progress from a solution_ready record without real inputs', () => {
    const state = workflowState(); state.project.status = 'solution_ready'
    const snapshot = project(state)
    expect(guidedCurrentStep(snapshot).id).toBe('S0')
    expect(snapshot.stages.find(s => s.id === 'S5')?.status).toBe('not_started')
  })
  it('suggests research after confirmed requirements, without adding a generation gate', () => {
    const snapshot = project(withInputs(workflowState()))
    expect(guidedCurrentStep(snapshot).id).toBe('S2')
    expect(snapshot.stages.find(s => s.id === 'S4')?.action.enabled).toBe(true)
    expect(snapshot.currentStage).toBe('S4')
  })
  it('a real Decision enables the solution, without pretending research has completed', () => {
    const snapshot = project(withDecision())
    expect(guidedCurrentStep(snapshot).id).toBe('S5')
    expect(snapshot.stages.find(s => s.id === 'S2')?.status).toBe('ready')
  })
  it('keeps solution as the outcome with unresolved tender sources and an active tender gate', () => {
    const state = withSolution(); state.documents[0]!.kind = 'tender'
    const snapshot = project(state, [{ callId: 'tender-gate', tool: 'marketpilot_tender_extract', status: 'waiting_human', projectId: 'p1', startedAt: now, question: {} }])
    expect(snapshot.currentStage).toBe('S6')
    expect(guidedCurrentStep(snapshot).id).toBe('S5')
    expect(snapshot.stages.find(s => s.id === 'S6')?.status).toBe('waiting_human')
  })
  it('failed regeneration keeps an existing Decision visibly confirmed', () => {
    const state = withDecision(); state.workflowRuns.push(run('retry', 'alternative_generation', 'failed'))
    const snapshot = project(state)
    const stage = snapshot.stages.find(s => s.id === 'S4')!
    expect(stage.status).toBe('failed')
    expect(guidedResult(t, GUIDED_STEPS[3], stage)).toContain(t('guided.routeConfirmed'))
  })
  it('mapping does not mutate records, stage statuses or guarded action arguments', () => {
    const state = withSolution(); state.workflowRuns.push(run('waiting', 'solution_generation', 'waiting_human'))
    const snapshot = project(state), original = structuredClone(snapshot), records = structuredClone(state)
    guidedCurrentStep(snapshot)
    for (const step of GUIDED_STEPS) guidedResult(t, step, snapshot.stages.find(s => s.id === step.id)!)
    expect(snapshot).toEqual(original)
    expect(state).toEqual(records)
  })
})
