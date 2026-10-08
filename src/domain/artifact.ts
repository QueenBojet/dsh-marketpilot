import { z } from 'zod'
import { id, text, recordFields, reviewSchema } from './common.ts'

export const artifactInput = z.strictObject({
  type: z.enum(['requirement_baseline', 'competitor_matrix', 'research_report', 'alternative_comparison',
    'solution', 'compliance_matrix', 'product_gap', 'other']),
  name: text, content: text, format: z.enum(['markdown', 'json', 'csv']), workflowRunId: id.optional(),
})
export const artifactSchema = artifactInput.extend({
  ...recordFields, reviewStatus: z.enum(['draft', 'approved']), review: reviewSchema.optional(),
}).refine(a => a.reviewStatus !== 'approved' || !!a.review, 'Approved artifact needs human review')
export type Artifact = z.infer<typeof artifactSchema>
