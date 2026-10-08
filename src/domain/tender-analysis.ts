import { z } from 'zod'
import { id, ids, text } from './common.ts'
import { tenderInput } from './tender.ts'

export const tenderExtraction = z.strictObject({ clauses: z.array(z.strictObject({
  clauseId: text, originalText: text, normalizedRequirement: text,
  sourceDocumentId: id, sourceLocator: text, claimKinds: tenderInput.shape.claimKinds,
})).min(1) })
export const tenderReview = z.strictObject({ items: z.array(z.strictObject({
  id, responseDraft: text, status: tenderInput.shape.status,
  requirementIds: ids, evidenceIds: ids, risk: text.nullable(), action: text.nullable(),
})).min(1) })
