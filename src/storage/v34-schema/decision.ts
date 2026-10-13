import { z } from 'zod'
import { id, ids, text, timestamp, recordFields, reviewSchema } from './common.ts'

export const alternativeInput = z.strictObject({
  name: text, summary: text, components: z.array(text).min(1), strengths: z.array(text),
  limitations: z.array(text), risks: z.array(text), unknowns: z.array(text),
  requirementCoverage: z.record(id, z.enum(['full', 'partial', 'none', 'unknown'])), evidenceIds: ids,
  status: z.enum(['draft', 'candidate', 'rejected']).default('candidate'),
})
export const alternativeSchema = alternativeInput.extend({
  ...recordFields, status: z.enum(['draft', 'candidate', 'selected', 'rejected']),
})
export const decisionInput = z.strictObject({
  alternativeId: id, decision: text, rationale: text, evidenceIds: ids, requirementIds: ids.min(1),
})
export const decisionRequest = decisionInput.extend({ expectedVersion: z.string().regex(/^[a-f0-9]{64}$/).optional() })
export const decisionSchema = decisionInput.extend({
  ...recordFields, confirmedBy: text, confirmedAt: timestamp, review: reviewSchema,
})
export type Alternative = z.infer<typeof alternativeSchema>
export type Decision = z.infer<typeof decisionSchema>
