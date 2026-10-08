/**
 * Short-handle aliases for model-facing generation contexts. Long UUIDs are
 * the documented failure mode of real model runs (the model mis-copies or
 * invents an id and validation rejects an otherwise usable section), so the
 * workflow shows requirements as R1…, evidence as E1…, the active decision as
 * D1 and resolves those handles back to real ids before validation. A value
 * that is not a known handle passes through untouched, so a model echoing the
 * original UUID verbatim keeps validating and an invented handle still fails
 * with SOURCE_MISMATCH exactly as before.
 */

/** The context fields whose ids the generation outputs may reference. */
export interface AliasableContext {
  readonly confirmedRequirements: readonly { readonly id: string }[]
  readonly verifiedFacts: readonly { readonly id: string }[]
  readonly assumptions: readonly { readonly id: string }[]
  readonly openUnknowns: readonly { readonly id: string }[]
  readonly selectedDecision?: { readonly id: string } | undefined
  readonly route?: {
    readonly evidenceIds?: readonly string[] | undefined
    /** Stored alternatives key coverage by requirement id (Record, not the model's array form). */
    readonly requirementCoverage?: Readonly<Record<string, string>> | undefined
  } | undefined
  readonly [key: string]: unknown
}

export interface ContextAliases {
  /** The model-facing copy: id fields replaced by R#/E#/D1 handles. */
  readonly context: AliasableContext
  /** Resolve one handle (or pass an unknown value through unchanged). */
  readonly resolveId: (value: string) => string
}

/** Rewrite one context with stable short handles and return the resolver. */
export function aliasProjectContext<T extends AliasableContext>(context: T): ContextAliases {
  const forward = new Map<string, string>()
  const backward = new Map<string, string>()
  let requirementSeq = 0
  let evidenceSeq = 0
  const rewriteId = (id: string, mint: () => string): string => {
    const existing = backward.get(id)
    if (existing !== undefined) return existing
    const handle = mint()
    forward.set(handle, id)
    backward.set(id, handle)
    return handle
  }
  const rewriteRecords = (records: readonly { readonly id: string }[], prefix: 'R' | 'E') => records.map(record => ({
    ...record,
    id: rewriteId(record.id, () => `${prefix}${prefix === 'R' ? ++requirementSeq : ++evidenceSeq}`),
  }))
  const rewritten: Record<string, unknown> = { ...context }
  rewritten.confirmedRequirements = rewriteRecords(context.confirmedRequirements, 'R')
  for (const pool of ['verifiedFacts', 'assumptions', 'openUnknowns'] as const) {
    rewritten[pool] = rewriteRecords(context[pool], 'E')
  }
  if (context.selectedDecision !== undefined) {
    forward.set('D1', context.selectedDecision.id)
    backward.set(context.selectedDecision.id, 'D1')
    rewritten.selectedDecision = { ...context.selectedDecision, id: 'D1' }
  }
  if (context.route !== undefined) {
    rewritten.route = {
      ...context.route,
      ...(context.route.evidenceIds === undefined ? {} : { evidenceIds: context.route.evidenceIds.map(id => backward.get(id) ?? id) }),
      ...(context.route.requirementCoverage === undefined ? {} : {
        requirementCoverage: Object.fromEntries(Object.entries(context.route.requirementCoverage)
          .map(([id, coverage]) => [backward.get(id) ?? id, coverage])),
      }),
    }
  }
  return { context: rewritten as AliasableContext, resolveId: value => forward.get(value) ?? value }
}

/** Resolve one model-authored alternative back onto real evidence/requirement ids. */
export function resolveAlternative<T extends { evidenceIds: string[]; requirementCoverage: { requirementId: string }[] }>(
  alternative: T, resolveId: (value: string) => string,
): T {
  return {
    ...alternative,
    evidenceIds: alternative.evidenceIds.map(resolveId),
    requirementCoverage: alternative.requirementCoverage.map(entry => ({ ...entry, requirementId: resolveId(entry.requirementId) })),
  }
}

/** Resolve one model-authored section (decision id, claim references) back onto real ids. */
export function resolveSection<T extends { decisionId: string; claims: { requirementIds: string[]; evidenceIds: string[] }[] }>(
  section: T, resolveId: (value: string) => string,
): T {
  return {
    ...section,
    decisionId: resolveId(section.decisionId),
    claims: section.claims.map(claim => ({
      ...claim,
      requirementIds: claim.requirementIds.map(resolveId),
      evidenceIds: claim.evidenceIds.map(resolveId),
    })),
  }
}
