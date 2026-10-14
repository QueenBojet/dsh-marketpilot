import { z } from 'zod'
import { id, text, recordFields, reviewSchema } from './common.ts'

export const requirementInput = z.strictObject({
  originalText: text, normalizedText: text,
  type: z.enum(['functional', 'performance', 'interface', 'environment', 'safety', 'compliance',
    'installation', 'maintenance', 'commercial', 'constraint', 'other']),
  priority: z.enum(['must', 'should', 'could']),
  status: z.enum(['proposed', 'unknown', 'conflict', 'superseded']).default('proposed'),
  sourceDocumentId: id.optional(), sourceLocator: text.optional(), rationale: text.optional(),
  risk: text.optional(), clarificationQuestion: text.optional(),
})
export const requirementSchema = requirementInput.extend({
  ...recordFields,
  status: z.enum(['proposed', 'confirmed', 'unknown', 'conflict', 'superseded']),
  confirmation: reviewSchema.optional(),
}).refine(r => r.status !== 'confirmed' || r.confirmation !== undefined, 'Confirmed requirement needs a human review')
export type Requirement = z.infer<typeof requirementSchema>
