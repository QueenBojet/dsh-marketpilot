import { z } from 'zod'
import { id, text, timestamp, recordFields } from './common.ts'

export const projectInput = z.strictObject({
  name: text, description: text.optional(), customer: text.optional(),
  industry: text.optional(), scenario: text.optional(),
})
export const projectSchema = projectInput.extend({
  id, createdAt: timestamp, updatedAt: timestamp,
  status: z.enum(['draft', 'requirements_ready', 'researching', 'alternatives_ready',
    'decision_confirmed', 'solution_ready', 'tender_review', 'archived']),
  activeDecisionId: id.optional(),
})
export const documentInput = z.strictObject({
  name: text,
  kind: z.enum(['customer_requirement', 'tender', 'meeting_note', 'internal_reference',
    'competitor_datasheet', 'standard', 'report', 'other']),
  mimeType: text.optional(), originalPath: text.optional(), textContent: text,
  checksum: text.optional(),
})
export const documentSchema = documentInput.extend({ ...recordFields, importedAt: timestamp })
export type Project = z.infer<typeof projectSchema>
export type SourceDocument = z.infer<typeof documentSchema>
