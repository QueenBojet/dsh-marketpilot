import { z } from 'zod'
import { id, ids, text, recordFields } from './common.ts'
import type { Evidence } from './evidence.ts'
import { findUnsupportedClaims } from './evidence.ts'

export const tenderInput = z.strictObject({
  clauseId: text.optional(), originalText: text, normalizedRequirement: text,
  sourceDocumentId: id.optional(), sourceLocator: text.optional(),
  claimKinds: z.array(z.enum(['technical_parameter', 'certification', 'track_record', 'model_performance', 'general'])).min(1),
  responseDraft: text.optional(), status: z.enum(['compliant', 'partially_compliant', 'non_compliant', 'unknown', 'not_applicable']),
  requirementIds: ids, evidenceIds: ids, risk: text.optional(), action: text.optional(),
})
export const tenderSchema = tenderInput.extend(recordFields).refine(
  t => t.status !== 'compliant' || t.evidenceIds.length > 0,
  'Compliant tender response needs evidence',
)
export type TenderItem = z.infer<typeof tenderSchema>

/** Every compliant claim needs verified FACT/SOURCE; stricter than the parameter-only minimum. */
export function validateTenderStatus<T extends z.infer<typeof tenderInput>>(item: T, evidence: readonly Evidence[]): T {
  if (item.status !== 'compliant' || !findUnsupportedClaims([{ id: 'clause', evidenceIds: item.evidenceIds }], evidence).length) return item
  return { ...item, status: 'unknown', responseDraft: '待确认：现有证据不足，暂不作符合性承诺。',
    action: '提供并核验本条款的参数、认证、业绩或型号证据后再确认符合性。' }
}
