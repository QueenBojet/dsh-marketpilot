import type { createServices } from '../services/index.ts'
import type { ModelStructuredOutputAdapter } from '../adapters/contracts.ts'
import {
  alternativesModelOutput, alternativesOutput, outlineOutput, sectionModelOutput, sectionOutput, validateSection,
} from '../domain/generation.ts'
import { MarketPilotError, ensure } from '../domain/common.ts'
import { WorkflowExecution } from './execution.ts'
import { aliasProjectContext, resolveAlternative, resolveSection } from './handles.ts'
import { z } from 'zod'

type Services = ReturnType<typeof createServices>
/** An unresolved handle failed the strict UUID re-parse: the model invented one, the same class a re-ask may fix. */
function inventedId(error: z.ZodError): MarketPilotError {
  const uuidIssue = error.issues.some(issue => (issue as { format?: unknown }).format === 'uuid')
  ensure(uuidIssue, 'MODEL_OUTPUT_INVALID', '模型输出经句柄解析后仍不符合严格 Schema。')
  return new MarketPilotError('SOURCE_MISMATCH', '方案引用了不存在的证据。')
}

export class AlternativeWorkflow {
  constructor(private readonly services: Services, private readonly model: ModelStructuredOutputAdapter,
    private readonly lifecycle = services.workflows) {}
  async start(projectId: string, signal: AbortSignal) {
    const run = await this.lifecycle.start(projectId, { type: 'alternative_generation' })
    const exec = new WorkflowExecution(projectId, run.id, this.lifecycle, this.model, signal)
    try {
      await exec.step('BUILD_PROJECT_CONTEXT')
      const { version } = this.services.generation.snapshot(projectId)
      const { context, resolveId } = aliasProjectContext(this.services.projects.getContext(projectId))
      ensure(context.confirmedRequirements.length, 'PREREQUISITE_ERROR', '请先确认需求。')
      await exec.step('GENERATE_ALTERNATIVES')
      const output = await exec.generate('alternative-generate', alternativesModelOutput, { context })
      await exec.step('VALIDATE_AND_SAVE')
      const resolved = output.alternatives.map(candidate => resolveAlternative(candidate, resolveId))
      return await this.services.generation.alternatives(projectId, run.id, version,
        alternativesOutput.parse({ alternatives: resolved }))
    } catch (error) { return exec.failed(error) }
  }
}

export class SolutionWorkflow {
  constructor(private readonly services: Services, private readonly model: ModelStructuredOutputAdapter,
    private readonly lifecycle = services.workflows) {}
  async start(projectId: string, signal: AbortSignal, runId?: string) {
    const run = runId ? this.lifecycle.get(projectId, runId)
      : await this.lifecycle.start(projectId, { type: 'solution_generation' })
    ensure(run.type === 'solution_generation', 'INVALID_RUN', '请提供 Solution Workflow ID。')
    if (runId) {
      ensure(run.status === 'waiting_human', 'INVALID_TRANSITION', '只能恢复等待人工 Decision 的方案工作流。')
      const context = this.services.projects.getContext(projectId)
      if (!context.selectedDecision) return run
      await this.lifecycle.resume(projectId, run.id)
    } else if (run.status !== 'running') return run
    const exec = new WorkflowExecution(projectId, run.id, this.lifecycle, this.model, signal)
    try {
      await exec.step('VALIDATE_PREREQUISITES')
      const { state, version } = this.services.generation.snapshot(projectId)
      await exec.step('BUILD_PROJECT_CONTEXT')
      const { context, resolveId } = aliasProjectContext({
        ...this.services.projects.getContext(projectId),
        route: state.alternatives.find(a => a.id === state.decisions.find(d => d.id === state.project.activeDecisionId)?.alternativeId),
      })
      await exec.step('GENERATE_OUTLINE')
      const outline = await exec.generate('solution-outline', outlineOutput, { context })
      await exec.step('GENERATE_SECTIONS')
      const sections: z.infer<typeof sectionOutput>[] = []
      // An id that does not exist at all is the one failure a re-ask can fix: the model
      // invented a handle despite the alias layer. Every other invariant stays fail-fast
      // on the first response, so a rejected section is never silently repaired.
      for (const section of outline.sections) {
        let output: z.infer<typeof sectionOutput> | undefined
        for (let attempt = 0; !output; attempt++) {
          const generated = await exec.generate('solution-section', sectionModelOutput, { context, section })
          ensure(generated.title === section.title, 'SECTION_MISMATCH', '模型输出章节与提纲不一致。')
          try {
            const resolved = sectionOutput.parse(resolveSection(generated, resolveId))
            validateSection(resolved, state)
            output = resolved
          } catch (error) {
            const invented = error instanceof z.ZodError ? inventedId(error) : error
            if (attempt === 1 || !(invented instanceof MarketPilotError) || invented.code !== 'SOURCE_MISMATCH') throw error
          }
        }
        sections.push(output)
      }
      await exec.step('TRACE_REQUIREMENTS')
      await exec.step('TRACE_EVIDENCE')
      await exec.step('REVIEW')
      await exec.step('SAVE_ARTIFACT')
      return await this.services.generation.solution(projectId, run.id, version, sections)
    } catch (error) { return exec.failed(error) }
  }
}
