import { z } from 'zod'
import { id, ids, text, recordFields, reviewSchema } from './common.ts'

export const evidenceKind = z.enum(['FACT', 'SOURCE', 'ASSUMPTION', 'INFERENCE', 'DECISION', 'UNKNOWN'])
export const evidenceInput = z.strictObject({
  kind: evidenceKind.exclude(['DECISION']), title: text, statement: text,
  sourceType: z.enum(['customer', 'internal', 'official', 'vendor', 'standard', 'paper', 'web', 'model', 'human', 'unknown']),
  sourceName: text.optional(), sourceDocumentId: id.optional(), sourceLocator: text.optional(),
  sourceUrl: z.url().optional(), confidence: z.number().min(0).max(1).optional(),
  supportingEvidenceIds: ids.default([]),
})
export const evidenceSchema = evidenceInput.extend({
  ...recordFields, kind: evidenceKind,
  status: z.enum(['draft', 'verified', 'rejected', 'superseded']),
  relatedRequirementIds: ids, relatedCompetitorIds: ids, relatedAlternativeIds: ids,
  decisionId: id.optional(),
  verification: z.strictObject({
    method: z.enum(['human', 'new_evidence']), fromKind: evidenceKind, previousStatement: text,
    supportingEvidenceIds: ids, review: reviewSchema.optional(),
  }).optional(),
}).superRefine((e, ctx) => {
  if (e.kind === 'DECISION' && !e.decisionId) ctx.addIssue({ code: 'custom', message: 'DECISION evidence needs a Decision' })
  if (e.status === 'verified' && !e.verification) ctx.addIssue({ code: 'custom', message: 'Verified evidence needs verification' })
  if (e.verification?.method === 'human' && !e.verification.review) ctx.addIssue({ code: 'custom', message: 'Human verification needs review' })
  if (e.verification?.method === 'new_evidence' && !e.verification.supportingEvidenceIds.length) ctx.addIssue({ code: 'custom', message: 'New evidence verification needs supporting evidence' })
})
export type EvidenceKind = z.infer<typeof evidenceKind>
export type Evidence = z.infer<typeof evidenceSchema>

/** Structural evidence review; does not claim to inspect free-text semantics. */
export function findUnsupportedClaims(
  claims: readonly { id: string; evidenceIds: string[] }[], evidence: readonly Evidence[],
): { claimId: string; action: string }[] {
  const supported = new Set(evidence.filter(e => e.status === 'verified' && (e.kind === 'FACT' || e.kind === 'SOURCE')).map(e => e.id))
  return claims.filter(c => !c.evidenceIds.some(e => supported.has(e)))
    .map(c => ({ claimId: c.id, action: '补充并核验与该声明直接相关的来源证据。' }))
}
