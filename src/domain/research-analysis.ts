import { z } from 'zod'
import { id, text } from './common.ts'
import { policyInput } from './research.ts'

const citation = { sourceDocumentId: id, sourceLocator: text, quote: text }
export const competitorExtraction = z.strictObject({ competitors: z.array(z.strictObject({
  company: text, product: text, ...citation,
  claims: z.array(z.strictObject({ category: z.enum(['performance', 'interface', 'certification', 'case', 'technology', 'strength', 'limitation']),
    name: text, value: text.nullable(), sourceDocumentId: id, sourceLocator: text, quote: text.nullable() })),
})), gaps: z.array(text) })
export const policyExtraction = z.strictObject({ policies: z.array(z.strictObject({
  title: text, issuer: text.nullable(), documentNumber: text.nullable(), version: text.nullable(),
  mandatoryLevel: policyInput.shape.mandatoryLevel, keyRequirements: z.array(text), ...citation,
})), gaps: z.array(text) })
