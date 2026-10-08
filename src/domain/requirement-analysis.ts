import { z } from 'zod'
import { text, id } from './common.ts'
import { requirementInput } from './requirement.ts'

/** All model fields remain candidates; confirmation is never model-controlled. */
export const extractedRequirement = requirementInput.omit({ status: true }).extend({
  sourceDocumentId: id, sourceLocator: text,
  status: z.enum(['proposed', 'unknown', 'conflict']),
  risk: text.nullable(), clarificationQuestion: text.nullable(),
})
export const requirementExtractionSchema = z.strictObject({
  requirements: z.array(extractedRequirement).min(1),
  unknowns: z.array(z.strictObject({ title: text, statement: text, sourceDocumentId: id, sourceLocator: text })),
})
export type RequirementExtraction = z.infer<typeof requirementExtractionSchema>
