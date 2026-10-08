import { z } from 'zod'
import { ensure, text } from '../domain/common.ts'
import { workflowInput } from '../domain/workflow.ts'
import type { WorkflowRun } from '../domain/workflow.ts'
import { solutionPrerequisites } from '../domain/state.ts'
import { RecordService, requiredRecord } from './records.ts'
import type { ServiceContext } from './project.ts'

type Status = WorkflowRun['status']
/** Commit a terminal success together with the workflow's business output. */
export function completeRun(run: WorkflowRun, now: string, output: NonNullable<WorkflowRun['output']>) {
  ensure(run.status === 'running', 'RUN_NOT_RUNNING', '工作流已停止。')
  Object.assign(run, { status: 'completed', currentStep: 'COMPLETED', completedAt: now, updatedAt: now,
    durationMs: Math.max(0, Date.parse(now) - Date.parse(run.startedAt)), output })
  run.steps.push({ step: 'COMPLETED', at: now })
}
const transitions: Record<Status, readonly Status[]> = {
  pending: ['running', 'cancelled'], running: ['waiting_human', 'completed', 'failed', 'cancelled'],
  waiting_human: ['running', 'cancelled'], completed: [], failed: [], cancelled: [],
}

/** Tracks runs and gates independently of model execution. */
export class WorkflowService extends RecordService<'workflowRuns'> {
  constructor(ctx: ServiceContext) { super(ctx, 'workflowRuns') }
  async start(projectId: string, input: unknown) {
    const data = workflowInput.parse(input)
    const now = this.ctx.now()
    const row: WorkflowRun = { ...data, ...this.ctx.fields(projectId), status: 'running', currentStep: 'START',
      startedAt: now, durationMs: 0, humanWaitMs: 0, modelCalls: 0, toolCalls: 0, steps: [{ step: 'START', at: now }] }
    await this.ctx.repository.update(projectId, s => {
      if (data.type === 'solution_generation') {
        const gate = solutionPrerequisites(s)
        if (gate.status === 'waiting_human') Object.assign(row, { status: 'waiting_human', currentStep: 'VALIDATE_PREREQUISITES', waitingSince: now })
        if (gate.status === 'prerequisite_error') Object.assign(row, { status: 'failed', error: gate.reason, completedAt: now, currentStep: 'VALIDATE_PREREQUISITES' })
      }
      s.workflowRuns.push(row)
    })
    return row
  }
  private async transition(projectId: string, id: string, status: Status, step: string, error?: string, reviewedRevision?: number) {
    const state = await this.ctx.repository.update(projectId, s => {
      const run = requiredRecord(s, 'workflowRuns', id)
      ensure(transitions[run.status].includes(status), 'INVALID_TRANSITION', `不能从 ${run.status} 转为 ${status}。`)
      if (reviewedRevision !== undefined) this.ctx.assertFresh(s, reviewedRevision)
      if (status === 'running' || status === 'completed') {
        if (run.type === 'solution_generation') ensure(solutionPrerequisites(s).status === 'ready', 'WAITING_HUMAN', '请先确认需求与技术路线。')
        if (run.type === 'requirement_analysis') ensure(s.requirements.some(r => r.status === 'confirmed'), 'WAITING_HUMAN', '请先确认需求。')
      }
      const now = this.ctx.now()
      if (run.waitingSince) {
        run.humanWaitMs += Math.max(0, Date.parse(now) - Date.parse(run.waitingSince))
        delete run.waitingSince
      }
      if (status === 'waiting_human') run.waitingSince = now
      if (['completed', 'failed', 'cancelled'].includes(status)) run.completedAt = now
      if (error) run.error = error
      Object.assign(run, { status, currentStep: step, updatedAt: now, durationMs: Math.max(0, Date.parse(now) - Date.parse(run.startedAt)) })
      run.steps.push({ step, at: now })
    })
    return requiredRecord(state, 'workflowRuns', id)
  }
  wait(projectId: string, id: string) { return this.transition(projectId, id, 'waiting_human', 'WAITING_HUMAN') }
  cancel(projectId: string, id: string) { return this.transition(projectId, id, 'cancelled', 'CANCELLED') }
  fail(projectId: string, id: string, error: string) { return this.transition(projectId, id, 'failed', 'FAILED', text.parse(error)) }
  complete(projectId: string, id: string) { return this.transition(projectId, id, 'completed', 'COMPLETED') }
  async resume(projectId: string, id: string) {
    const run = this.get(projectId, id)
    ensure(run.status === 'waiting_human', 'INVALID_TRANSITION', '仅可恢复等待人工处理的工作流。')
    const human = ['solution_generation', 'requirement_analysis'].includes(run.type)
      ? undefined : await this.ctx.review(projectId, 'resume_workflow', run)
    return this.transition(projectId, id, 'running', 'RESUMED', undefined, human?.revision)
  }
  async step(projectId: string, id: string, input: unknown) {
    const data = z.strictObject({ step: text, modelCalls: z.number().int().nonnegative().default(0), toolCalls: z.number().int().nonnegative().default(0) }).parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      const run = requiredRecord(s, 'workflowRuns', id)
      ensure(run.status === 'running', 'RUN_NOT_RUNNING', '只有运行中的 Workflow 可以记录步骤。')
      run.currentStep = data.step
      run.steps.push({ step: data.step, at: this.ctx.now() })
      run.modelCalls += data.modelCalls
      run.toolCalls += data.toolCalls
      run.updatedAt = this.ctx.now()
      run.durationMs = Math.max(0, Date.parse(run.updatedAt) - Date.parse(run.startedAt))
    })
    return requiredRecord(state, 'workflowRuns', id)
  }
  /** Count successful foreground Tool returns associated with this run. */
  async recordToolCall(projectId: string, id: string) {
    const state = await this.ctx.repository.update(projectId, s => {
      const run = requiredRecord(s, 'workflowRuns', id)
      run.toolCalls += 1
      run.updatedAt = this.ctx.now()
    })
    return requiredRecord(state, 'workflowRuns', id)
  }
  async delete(projectId: string, id: string) {
    const run = this.get(projectId, id)
    ensure(['completed', 'failed', 'cancelled'].includes(run.status), 'RUN_ACTIVE', '请先结束或取消工作流。')
    return super.delete(projectId, id)
  }
  summary(projectId: string) {
    const s = this.ctx.state(projectId)
    return { title: 'MarketPilot Run Summary', documents: s.documents.length, requirements: s.requirements.length,
      evidence: s.evidence.length, unknowns: s.evidence.filter(e => e.kind === 'UNKNOWN').length,
      artifacts: s.artifacts.length, durationMs: s.workflowRuns.reduce((sum, r) => sum + r.durationMs, 0),
      modelCalls: s.workflowRuns.reduce((sum, r) => sum + r.modelCalls, 0), toolCalls: s.workflowRuns.reduce((sum, r) => sum + r.toolCalls, 0),
      humanWaitMs: s.workflowRuns.reduce((sum, r) => sum + r.humanWaitMs, 0) }
  }
}
