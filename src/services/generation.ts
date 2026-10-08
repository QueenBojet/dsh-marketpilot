import { createHash } from 'node:crypto'
import { z } from 'zod'
import { alternativesOutput, sectionOutput, sectionTitles, validateSection } from '../domain/generation.ts'
import { ensure } from '../domain/common.ts'
import { solutionPrerequisites } from '../domain/state.ts'
import type { ProjectState } from '../domain/state.ts'
import type { ServiceContext } from './project.ts'
import { requiredRecord } from './records.ts'
import { renderAlternatives, renderSolution } from '../render/generation.ts'
import { completeRun } from './workflow.ts'

/** Workflow telemetry does not invalidate a business snapshot; concurrent business edits do. */
export function businessVersion(state: ProjectState): string {
  const { revision: _revision, workflowRuns: _runs, ...business } = state
  return createHash('sha256').update(JSON.stringify(business)).digest('hex')
}

/** Commit generated records and artifacts atomically after rechecking the human gate and context. */
export class GenerationService {
  constructor(private readonly ctx: ServiceContext) {}
  snapshot(projectId: string) {
    const state = this.ctx.state(projectId)
    return { state, version: businessVersion(state) }
  }
  async alternatives(projectId: string, runId: string, version: string, input: unknown) {
    const data = alternativesOutput.parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      ensure(businessVersion(s) === version, 'STALE_CONTEXT', '项目输入已变化，请重新生成候选路线。')
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.type === 'alternative_generation' && run.status === 'running', 'RUN_NOT_RUNNING', '候选路线工作流已停止。')
      const confirmed = s.requirements.filter(r => r.status === 'confirmed').map(r => r.id)
      ensure(confirmed.length, 'PREREQUISITE_ERROR', '请先确认需求。')
      const rows = data.alternatives.map(row => {
        const coverage = row.requirementCoverage.map(r => r.requirementId)
        ensure(coverage.length === confirmed.length && new Set(coverage).size === coverage.length && coverage.every(id => confirmed.includes(id)),
          'INCOMPLETE_COVERAGE', '每条候选路线必须逐项响应全部已确认需求。')
        ensure(row.evidenceIds.every(id => s.evidence.some(e => e.id === id &&
          ((e.status === 'verified' && ['FACT', 'SOURCE'].includes(e.kind)) || ['ASSUMPTION', 'UNKNOWN'].includes(e.kind)))),
        'SOURCE_MISMATCH', '候选路线证据必须来自输入中的已核验来源、假设或 UNKNOWN。')
        return { ...row, requirementCoverage: Object.fromEntries(row.requirementCoverage.map(c => [c.requirementId, c.coverage])),
          ...this.ctx.fields(projectId), status: 'candidate' as const }
      })
      s.alternatives.push(...rows)
      const artifact = { ...this.ctx.fields(projectId), name: 'Alternative Comparison.md', type: 'alternative_comparison' as const,
        format: 'markdown' as const, content: renderAlternatives(rows), workflowRunId: run.id, reviewStatus: 'draft' as const }
      s.artifacts.push(artifact)
      completeRun(run, this.ctx.now(), { alternativeIds: rows.map(r => r.id), artifactId: artifact.id })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }
  async solution(projectId: string, runId: string, version: string, input: unknown) {
    const sections = z.array(sectionOutput).length(sectionTitles.length).parse(input)
    ensure(new Set(sections.map(s => s.title)).size === sectionTitles.length, 'INCOMPLETE_SECTIONS', '方案缺少章节或章节重复。')
    const state = await this.ctx.repository.update(projectId, s => {
      ensure(businessVersion(s) === version, 'STALE_CONTEXT', '项目输入或人工 Decision 已变化，请重新生成方案。')
      ensure(solutionPrerequisites(s).status === 'ready', 'WAITING_HUMAN', '请先确认需求和技术路线。')
      const run = requiredRecord(s, 'workflowRuns', runId)
      ensure(run.type === 'solution_generation' && run.status === 'running', 'RUN_NOT_RUNNING', '方案工作流已停止。')
      for (const section of sections) validateSection(section, s)
      const covered = new Set(sections.flatMap(section => section.claims.flatMap(c => c.requirementIds)))
      ensure(s.requirements.filter(r => r.status === 'confirmed').every(r => covered.has(r.id)),
        'INCOMPLETE_TRACE', '仍有已确认需求未被方案章节响应。')
      const artifact = { ...this.ctx.fields(projectId), name: 'Solution.md', type: 'solution' as const,
        format: 'markdown' as const, content: renderSolution(s, sections), workflowRunId: run.id, reviewStatus: 'draft' as const }
      s.artifacts.push(artifact)
      completeRun(run, this.ctx.now(), { artifactId: artifact.id, decisionId: s.project.activeDecisionId! })
    })
    return requiredRecord(state, 'workflowRuns', runId)
  }
}
