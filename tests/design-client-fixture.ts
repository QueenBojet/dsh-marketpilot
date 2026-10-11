import { buildShortCodeIndex } from '../src/domain/shortcodes.ts'

/** Legacy page fixtures projected into the new wire contract. No production fallback. */
export function designClientFixture(input: { projectId?: string; activeDecisionId?: string | undefined;
  alternatives?: unknown[]; requirements?: unknown[]; evidence?: unknown[]; decisions?: unknown[];
  artifacts?: unknown[]; documents?: unknown[]; tenderItems?: unknown[] }) {
  const projectId = input.projectId ?? 'p1'
  const records = (rows: unknown[] = []) => rows.map(row => ({ createdAt: '2026-10-09T05:00:00.000Z', projectId, ...row as Record<string, unknown>, id: String((row as { id: unknown }).id) }))
  const snapshot = { projectId, revision: 1, reviewVersion: 'a'.repeat(64), activeDecisionId: input.activeDecisionId ?? null,
    alternatives: records(input.alternatives), requirements: records(input.requirements), evidence: records(input.evidence), decisions: records(input.decisions),
    tenderItems: records(input.tenderItems), documents: records(input.documents).map(row => ({ hasText: true, ...row })),
    artifacts: records(input.artifacts).map(row => ({ ...row, context: { status: 'untracked', changed: [], stored: null } })), runs: [] }
  const index = buildShortCodeIndex(snapshot)
  return { ...snapshot, recordCodes: Object.fromEntries(index.entries().map(row => [row.id, row.code])) }
}
