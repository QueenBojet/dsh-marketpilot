import { z } from 'zod'
import { ensure, ids } from '../domain/common.ts'
import { requirementExtractionSchema } from '../domain/requirement-analysis.ts'
import type { RequirementExtraction } from '../domain/requirement-analysis.ts'
import type { ModelStructuredOutputAdapter } from '../adapters/contracts.ts'
import { StructuredOutputError } from '../adapters/structured-error.ts'
import type { createServices } from '../services/index.ts'
import type { WorkflowService } from '../services/workflow.ts'
import { loadPrompt, renderPrompt } from '../prompts/template.ts'

/** Deterministic normalization preserves uncertainty and marks priority conflicts. */
export function normalizeExtraction(input: RequirementExtraction): RequirementExtraction {
  const result = structuredClone(input)
  for (const row of result.requirements) row.normalizedText = row.normalizedText.replace(/\s+/g, ' ').trim()
  for (const row of result.requirements) {
    if (result.requirements.some(other => other !== row && other.normalizedText === row.normalizedText && other.priority !== row.priority)) {
      row.status = 'conflict'
      row.clarificationQuestion = '同一需求的优先级存在冲突，请人工确认。'
    }
    if (row.status === 'unknown' && !result.unknowns.some(u => u.sourceDocumentId === row.sourceDocumentId && u.statement === row.originalText)) {
      result.unknowns.push({ title: row.normalizedText, statement: row.originalText, sourceDocumentId: row.sourceDocumentId, sourceLocator: row.sourceLocator })
    }
  }
  return requirementExtractionSchema.parse(result)
}

/** Fixed requirement analysis; storage and model providers remain outside this module. */
export class RequirementAnalysisWorkflow {
  constructor(private readonly services: ReturnType<typeof createServices>, private readonly model: ModelStructuredOutputAdapter,
    private readonly lifecycle: WorkflowService = services.workflows) {}

  async start(projectId: string, documentIds: string[], signal: AbortSignal) {
    const selected = ids.min(1).parse(documentIds)
    const run = await this.lifecycle.start(projectId, { type: 'requirement_analysis', input: { documentIds: selected } })
    const step = (step: string, modelCalls = 0) => this.lifecycle.step(projectId, run.id, { step, modelCalls })
    try {
      signal.throwIfAborted()
      await step('LOAD_DOCUMENTS')
      const documents = selected.map(id => this.services.documents.get(projectId, id))
      ensure(documents.every(d => d.textContent.trim()), 'EMPTY_DOCUMENT', '输入文档无有效文本。')
      const prompt = renderPrompt(await loadPrompt('requirement-extract'), {
        project: JSON.stringify(this.services.projects.get(projectId)), documents: JSON.stringify(documents),
        schema: JSON.stringify(z.toJSONSchema(requirementExtractionSchema)),
      })
      let extracted: RequirementExtraction | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        await step('EXTRACT_CANDIDATES', 1)
        try {
          extracted = requirementExtractionSchema.parse(await this.model.generate({ prompt, schema: requirementExtractionSchema, signal }))
          break
        } catch (error) {
          if (!(error instanceof z.ZodError || error instanceof StructuredOutputError)) throw error
          if (attempt === 1) {
            await this.services.artifacts.save(projectId, { type: 'other', name: 'Requirement extraction failure.json',
              format: 'json', workflowRunId: run.id, content: JSON.stringify({ error: error.message,
                raw: error instanceof StructuredOutputError ? error.raw : null }) })
            throw error
          }
        }
      }
      ensure(extracted, 'INVALID_MODEL_RESULT', '模型未提供有效需求。')
      signal.throwIfAborted()
      await step('NORMALIZE_REQUIREMENTS')
      const normalized = normalizeExtraction(extracted)
      await step('DETECT_UNKNOWN_AND_CONFLICTS')
      ensure(normalized.requirements.every(r => selected.includes(r.sourceDocumentId))
        && normalized.unknowns.every(u => selected.includes(u.sourceDocumentId)), 'SOURCE_MISMATCH', '模型引用了本批输入之外的文档。')
      await step('SAVE_REQUIREMENTS')
      signal.throwIfAborted()
      return await this.services.requirements.saveAnalysis(projectId, run.id, normalized)
    } catch (error) {
      const current = this.lifecycle.get(projectId, run.id)
      if (current.status === 'running') {
        if (signal.aborted) await this.lifecycle.cancel(projectId, run.id)
        else await this.lifecycle.fail(projectId, run.id, error instanceof Error ? error.message : String(error))
      }
      throw error
    }
  }
}
