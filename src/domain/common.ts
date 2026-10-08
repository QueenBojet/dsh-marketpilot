/** Shared JSON validators; no Harness runtime or UI dependencies. */
import { z } from 'zod'

export const id = z.string().uuid()
export const text = z.string().trim().min(1)
export const timestamp = z.iso.datetime()
export const ids = z.array(id).refine(items => new Set(items).size === items.length, 'Duplicate IDs')
export const recordFields = { id, projectId: id, createdAt: timestamp, updatedAt: timestamp }
export const reviewSchema = z.strictObject({
  reviewer: text, reviewedAt: timestamp, reason: text,
})
export type HumanReview = z.infer<typeof reviewSchema>

/** Business failures propagate to the Tool pipeline as readable errors. */
export class MarketPilotError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'MarketPilotError'
  }
}

/** Require a domain invariant, preserving a stable machine-readable code. */
export function ensure(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new MarketPilotError(code, message)
}
