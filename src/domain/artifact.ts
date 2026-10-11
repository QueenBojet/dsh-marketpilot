import { z } from 'zod'
import { id, text, recordFields, reviewSchema } from './common.ts'

/** Server-captured input fingerprints. Absent on legacy artifacts; never inferred from timestamps. */
export const artifactDependenciesSchema = z.strictObject({
  version: z.literal(1),
  requirementsVersion: z.string().regex(/^[a-f0-9]{64}$/),
  decisionVersion: z.string().regex(/^[a-f0-9]{64}$/),
  decisionId: id.nullable(),
  sourcesVersion: z.string().regex(/^[a-f0-9]{64}$/),
})
export type ArtifactDependencies = z.infer<typeof artifactDependenciesSchema>

export const artifactInput = z.strictObject({
  type: z.enum(['requirement_baseline', 'competitor_matrix', 'research_report', 'alternative_comparison',
    'solution', 'compliance_matrix', 'product_gap', 'other']),
  name: text, content: text, format: z.enum(['markdown', 'json', 'csv']), workflowRunId: id.optional(),
})
export const artifactSchema = artifactInput.extend({
  ...recordFields, reviewStatus: z.enum(['draft', 'approved']), review: reviewSchema.optional(),
  dependencies: artifactDependenciesSchema.optional(),
}).refine(a => a.reviewStatus !== 'approved' || !!a.review, 'Approved artifact needs human review')
export type Artifact = z.infer<typeof artifactSchema>
