import { z } from 'zod'
import { ids, text, recordFields } from './common.ts'

export const competitorInput = z.strictObject({
  company: text, product: text.optional(), technology: text.optional(), targetScenario: text.optional(),
  performance: z.record(text, z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
  interfaces: z.array(text), certifications: z.array(text), cases: z.array(text),
  strengths: z.array(text), limitations: z.array(text), evidenceIds: ids,
})
export const competitorSchema = competitorInput.extend(recordFields)
export const policyInput = z.strictObject({
  title: text, issuer: text.optional(), documentNumber: text.optional(), version: text.optional(),
  scope: text.optional(), mandatoryLevel: z.enum(['mandatory', 'recommended', 'unknown']),
  keyRequirements: z.array(text), impact: text.optional(), gap: text.optional(), evidenceIds: ids,
})
export const policySchema = policyInput.extend(recordFields)
export type Competitor = z.infer<typeof competitorSchema>
export type PolicyOrStandard = z.infer<typeof policySchema>
