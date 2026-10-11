import { describe, expect, it } from 'vitest'
import { projectWorkflowOverview } from '../src/domain/project-workflow.ts'
import { capabilities, fields, now, run, withDecision, withInputs, withSolution, workflowState } from './workflow-fixtures.ts'

const project = (state = workflowState(), executions: Parameters<typeof projectWorkflowOverview>[2] = []) => projectWorkflowOverview(state, capabilities, executions)
describe('V3.3 server workflow projection', () => {
  it('empty project permits upload and forbids route/solution generation', () => {
    const result = project()
    expect(result.currentStage).toBe('S0')
    expect(result.stages[0]?.status).toBe('ready')
    expect(result.stages[4]?.action.enabled).toBe(false)
    expect(result.stages[5]?.action.enabled).toBe(false)
    expect(result.stages[6]?.status).toBe('skipped_optional')
  })
  it('does not infer completion from the forward-only Project status', () => {
    const s = workflowState(); s.project.status = 'solution_ready'
    expect(project(s).currentStage).toBe('S0')
    expect(project(s).stages[5]?.status).toBe('not_started')
  })
  it('confirmed requirements lead to route selection; a real Decision leads to solution', () => {
    expect(project(withInputs(workflowState())).currentStage).toBe('S4')
    const s = withDecision()
    expect(project(s).currentStage).toBe('S5')
    s.project.activeDecisionId = 'missing'
    expect(project(s).currentStage).toBe('S4')
  })
  it('solution leads to artifacts without tender, and to tender with its sources', () => {
    const s = withSolution()
    expect(project(s).currentStage).toBe('S7')
    s.documents[0]!.kind = 'tender'
    expect(project(s).currentStage).toBe('S6')
  })
  it('waiting requirement batches retain their actual run and point to requirements', () => {
    const s = withInputs(workflowState()); s.requirements[0]!.status = 'proposed'
    s.workflowRuns.push({ ...run('wait1', 'requirement_analysis', 'waiting_human'), output: { requirementIds: ['req1'] } })
    const p = project(s)
    expect(p.currentStage).toBe('S1'); expect(p.waiting).toBe(1)
    expect(p.stages[1]?.run?.id).toBe('wait1')
    expect(p.stages[1]?.action).toMatchObject({ section: 'requirements', key: 'reviewRequirements' })
  })
  it('superseded waits and waits with no recoverable batch are not approvals', () => {
    const s = withInputs(workflowState())
    s.workflowRuns.push(run('old', 'requirement_analysis', 'waiting_human'), { ...run('new', 'requirement_analysis', 'completed'), startedAt: '2026-10-11T02:00:00.000Z' })
    expect(project(s).waiting).toBe(0)
    s.workflowRuns.pop()
    expect(project(s).stages[1]?.status).toBe('needs_attention')
    expect(project(s).waiting).toBe(0)
  })
  it('recovers a solution wait with the original runId after Decision', () => {
    const s = withDecision(); s.workflowRuns.push(run('solution-wait', 'solution_generation', 'waiting_human'))
    expect(project(s).stages[5]?.action.args).toEqual({ runId: 'solution-wait' })
    s.project.activeDecisionId = undefined
    expect(project(s).stages[5]?.action.section).toBe('alternatives')
  })
  it('locates an active human gate instead of issuing a second tool call', () => {
    const s = withDecision()
    const p = project(s, [{ callId: 'gate', projectId: 'p1', tool: 'marketpilot_evidence_verify', status: 'waiting_human', startedAt: now, question: {} }])
    expect(p.currentStage).toBe('S3')
    expect(p.stages[3]?.action).toEqual({ key: 'locateReview', enabled: true, section: 'evidence' })
  })
  it('running records without a host owner show interruption instead of fake progress', () => {
    const s = withDecision(); s.workflowRuns.push(run('orphan', 'solution_generation', 'running'))
    expect(project(s).stages[5]?.status).toBe('needs_attention')
    expect(project(s).stages[5]?.prerequisites).toContainEqual({ key: 'interruptedRun', section: 'solution' })
  })
  it('uses only recorded steps and keeps the failure reason visible despite an older artifact', () => {
    const s = withSolution(); s.workflowRuns.push(run('failed', 'solution_generation', 'failed'))
    const p = project(s)
    expect(p.currentStage).toBe('S5'); expect(p.stages[5]?.status).toBe('failed')
    expect(p.stages[5]?.run?.error).toContain('MODEL_TIMEOUT')
    expect(p.stages[5]?.run?.steps).toEqual(s.workflowRuns[0]?.steps)
    expect(p.latestArtifact?.id).toBe('art1')
  })
  it('an independent failed research direction is not masked by the successful other direction', () => {
    const s = withInputs(workflowState())
    s.workflowRuns.push(run('c', 'competitor_analysis', 'failed'), run('p', 'policy_analysis', 'completed'))
    expect(project(s).stages[2]?.status).toBe('failed')
  })
  it('UNKNOWN stays actionable and does not block draft solution generation', () => {
    const s = withDecision()
    s.evidence.push({ ...fields('e1'), kind: 'UNKNOWN', status: 'draft', title: 'Test unknown', statement: 'Test only', sourceType: 'model', supportingEvidenceIds: [], relatedRequirementIds: [], relatedCompetitorIds: [], relatedAlternativeIds: [] })
    const p = project(s)
    expect(p.unknowns).toBe(1); expect(p.stages[3]?.status).toBe('needs_attention')
    expect(p.stages[5]?.action.enabled).toBe(true)
    expect(s.evidence[0]?.kind).toBe('UNKNOWN')
  })
  it('no Provider is explicit, while previous results remain readable', () => {
    const s = withSolution()
    const p = projectWorkflowOverview(s, { ...capabilities, model: { available: false, mode: 'unavailable', reason: 'missing' } }, [])
    expect(p.stages[5]?.action.enabled).toBe(false)
    expect(p.stages[5]?.status).toBe('completed')
    expect(p.latestArtifact?.id).toBe('art1')
  })
  it('existing route review remains actionable without a model Provider', () => {
    const s = withDecision(); s.decisions = []; s.project.activeDecisionId = undefined
    const p = projectWorkflowOverview(s, { ...capabilities, model: { available: false, mode: 'unavailable', reason: 'missing' } }, [])
    expect(p.stages[4]?.status).toBe('needs_attention')
    expect(p.stages[4]?.action).toMatchObject({ enabled: true, key: 'chooseRoute' })
    expect(p.stages[4]?.action.tool).toBeUndefined()
    expect(p.stages[5]?.action.enabled).toBe(false)
  })
  it('ignores another project execution and does not mutate stored facts/codeBook', () => {
    const s = withSolution(); s.codeBook = { seq: { requirement: 1 }, codes: { req1: 'REQ-01' } }
    const before = structuredClone(s)
    const p = project(s, [{ callId: 'foreign', projectId: 'p2', tool: 'marketpilot_evidence_verify', status: 'waiting_human', startedAt: now, question: {} }])
    expect(p.waiting).toBe(0); expect(s).toEqual(before)
  })
  it('input updates flag an existing solution without replacing it', () => {
    const s = withSolution(); s.requirements[0]!.updatedAt = '2026-10-11T02:00:00.000Z'
    expect(project(s).issues).toContainEqual({ key: 'possiblyStale', section: 'solution' })
    expect(s.artifacts).toHaveLength(1)
  })
  it('approval alone does not prove export', () => {
    const s = withSolution(); s.artifacts[0]!.reviewStatus = 'approved'
    expect(project(s).stages[7]?.status).toBe('ready')
    expect(project(s, [{ callId: 'export', tool: 'marketpilot_artifact_export', projectId: 'p1', status: 'completed', startedAt: now, question: null,
      value: { data: { artifactId: 'art1', path: 'test.md' } } }]).stages[7]?.status).toBe('completed')
  })
})
