/** Loose client-side views of the V4 read model returned by `GET projects/:pid/v4/overview`. */
import type { Execution, Selection } from './api.ts'
import type { z } from 'zod'
import type { discoverySchema, supportNoteSchema, explorationSchema } from '../domain/v4.ts'
export type Discovery = z.infer<typeof discoverySchema>
export type SupportNote = z.infer<typeof supportNoteSchema>
export type Exploration = z.infer<typeof explorationSchema>

export interface HumanReview { reviewer: string; reviewedAt: string; reason: string }
export type Rec = { id: string; createdAt?: string; updatedAt?: string }
export interface Project extends Rec { name: string; description?: string; customer?: string; industry?: string; scenario?: string; status: string; activeDecisionId?: string }
export interface DocumentMeta extends Rec { name: string; kind: string; length: number; mimeType?: string; batchId?: string }
export interface Requirement extends Rec {
  originalText: string; normalizedText: string; type: string; priority: 'must' | 'should' | 'could'
  status: 'proposed' | 'confirmed' | 'unknown' | 'conflict' | 'superseded'; sourceDocumentId?: string; sourceLocator?: string
  rationale?: string; risk?: string; clarificationQuestion?: string
}
export interface Alternative extends Rec {
  name: string; summary: string; components: string[]; strengths: string[]; limitations: string[]; risks: string[]; unknowns: string[]
  status: 'draft' | 'candidate' | 'selected' | 'rejected'
}
export interface Decision extends Rec { alternativeId: string; rationale: string; confirmedBy: string; confirmedAt: string }
export interface Evidence extends Rec { kind: string; title: string; statement: string; sourceType: string; sourceName?: string; sourceUrl?: string; status: string }
export interface Batch extends Rec {
  label: string; status: 'received' | 'hinted' | 'analyzing' | 'analyzed' | 'failed'; documentIds: string[]
  hint?: { added: number; modified: number; conflict: number; background: number; duplicates: string[]; notes: string[] }
  warnings: string[]; error?: string; sourceNote?: string; receivedOn?: string
}
export interface Change extends Rec {
  batchId: string; kind: 'added' | 'modified' | 'conflict' | 'background'
  status: 'pending' | 'adopted' | 'ignored' | 'clarify' | 'to_research' | 'no_change'
  summary: string; newText: string; oldText?: string; locator?: string; documentId?: string; impactNote?: string; origin?: string; detectedBy?: string
}
export interface Plan { steps: string[]; mode: 'local' | 'web' | 'both'; queries: string[]; confirmedBy?: string; confirmedAt?: string }
export interface Question extends Rec {
  alternativeIds?: string[]; direction?: string; decisionUse?: string
  title: string; description?: string; requirementIds: string[]; documentIds: string[]
  status: 'open' | 'researching' | 'answered' | 'needs_review' | 'closed'; plan?: Plan; report?: string; reviewReason?: string
}
export interface WebSource extends Rec { url: string; title: string; status: 'fetched' | 'failed'; fetchedAt?: string; error?: string; snapshot?: string; questionId?: string; contentHash?: string }
export interface ModelRoute { provider: string; model: string; reasoningEffort?: string; source: 'override' | 'project' | 'default' | 'none' }
export interface Run extends Rec {
  kind: 'chat' | 'research' | 'deep_change' | 'section_revision' | 'discovery' | 'brainstorm' | 'document_draft'; mode?: string; status: 'running' | 'completed' | 'failed' | 'cancelled'
  modelRoute: ModelRoute; webStatus: 'not_requested' | 'unavailable' | 'fetched' | 'partial' | 'failed'
  sourceIds: string[]; note?: string; error?: string; startedAt: string; completedAt?: string; questionId?: string
}
export interface Message extends Rec { thread: string; role: 'user' | 'assistant'; content: string; status: 'done' | 'failed' | 'cancelled'; modelRoute?: ModelRoute; questionId?: string }
export interface FindingSource { type: 'document' | 'web' | 'report' | 'none'; documentId?: string; sourceId?: string; locator?: string; quote?: string }
export interface Finding extends Rec {
  questionId?: string; statement: string; conditions?: string; origin: 'ai' | 'manual'
  adoption: 'candidate' | 'adopted' | 'rejected'; verification: 'unverified' | 'verified' | 'disputed'
  needsReview: boolean; reviewReason?: string; source: FindingSource
  requirementIds: string[]; alternativeIds: string[]; decisionIds: string[]; configItemIds: string[]
  history: { statement: string; at: string; by: string }[]
  adoptionReview?: HumanReview; verificationReview?: HumanReview
}
export interface ConfigItem extends Rec {
  group: string; name: string; model?: string; params?: string; quantity: number; unit: string; interface?: string; installation?: string
  requirementIds: string[]; evidenceIds: string[]; findingIds: string[]; alternativeId?: string; status: 'active' | 'removed'
}
export interface CostLine extends Rec {
  category: string; name: string; configItemIds: string[]; quantityMode: 'manual' | 'follow_config'; quantity: number; factor: number; unit: string
  unitPrice?: string; currency: string; sourceType: string; supplier?: string; quoteDate?: string; validUntil?: string
  applicableQty?: string; taxIncluded?: boolean; reference?: string; note?: string
}
export interface FxRate { currency: string; rate: string; asOf: string; source: string }
export interface CostSettings { baseCurrency: string; contingencyPct: string; taxPct?: string; taxNote?: string; fxRates: FxRate[] }
export type ReviewStatus = 'none' | 'valid' | 'stale'
export type CostKind = 'cost_draft' | 'supplier_verified' | 'external_approved'
export interface CostResultLine {
  id: string; name: string; category: string; quantity: number; currency: string; unitPrice?: string; amount?: string; amountDisplay?: string
  priceState: 'quoted' | 'estimate' | 'test' | 'missing'; warnings: string[]
}
export interface CostView {
  result: { lines: CostResultLine[]; subtotals: { currency: string; amount: string; display: string; rate?: string }[]; baseCurrency: string; baseSubtotal?: string; contingency?: string; tax?: string; categories: { category: string; amount: string; display: string; share: number }[]; blockers: string[]; total?: string; totalDisplay?: string; missingPrices: number; estimates: number; testData: number; expiredQuotes: number; missingFx: string[] }
  hash: string; reviews: Record<CostKind, ReviewStatus>; checks: Record<CostKind, string[]>
}
export interface Section { key: string; title: string; content: string; editedByHuman: boolean; proposal?: { content: string; reason: string; origin: string } }
export interface Doc extends Rec {
  kind: 'technical' | 'cost' | 'change_summary'; title: string; templateId?: string; sections: Section[]; revisionNo: number
  review?: { review: HumanReview; hash: string }; exports: { at: string; hash: string; fileName: string; sha256: string; byteLength: number }[]
  sent: { review: HumanReview; recipient: string; channel: string; exportSha256: string }[]
}
export interface DocView { doc: Doc; hash: string; review: ReviewStatus; outdated: string[]; exported: boolean; sendBlockers: string[] }
export interface Template extends Rec { name: string; fileName: string; placeholders: string[]; sectionSlots: string[]; warnings: string[]; outline?: { key: string; title: string; guidance: string }[] }
export interface Baseline extends Rec { number: number; label: string; type: 'technical' | 'full'; review: HumanReview; snapshotHash: string }
export interface Capabilities {
  model: { available: boolean; mode: 'live' | 'offline' | 'unavailable'; reason: string; provider?: string; model?: string }
  research: { available: boolean; mode: 'unavailable' | 'unverified' | 'live'; reason: string }
}
export interface Overview {
  discoveryStatus?: { confirmed: boolean; initialCurrent: boolean; synthesisCurrent: boolean; decisionBlocker: string | null }
  project: Project; revision: number; documents: DocumentMeta[]; requirements: Requirement[]; alternatives: Alternative[]
  decisions: Decision[]; evidence: Evidence[]
  v4: {
    discovery?: Discovery; supportNotes?: SupportNote[]; explorations?: Exploration[]
    intakeBatches: Batch[]; changes: Change[]; questions: Question[]; runs: Run[]; sources: WebSource[]; messages: Message[]
    findings: Finding[]; configItems: ConfigItem[]; costLines: CostLine[]; costSettings?: CostSettings; templates: Template[]
    modelPreference?: Selection; costReviews: Partial<Record<CostKind, { review: HumanReview; hash: string }>>
    draftRoute?: { alternativeId: string; selectedAt: string; by: string }
  }
  route: { draftAlternativeId?: string; confirmedAlternativeId?: string; decision?: Decision; confirmed: boolean }
  cost: CostView; docs: DocView[]; baselines: Baseline[]; checks: { technical: string[]; full: string[] }
  executions: Execution[]; model: { preference: Selection | null; default: Selection | null }; capabilities: Capabilities
}
export interface ListDiff { added: string[]; removed: string[]; changed: { id: string; name: string; changes: string[] }[] }
export interface DiffView {
  from: { id: string; label: string; type: string }; to: { id: string; label: string; type: string }
  requirements: ListDiff; route: { from: string | null; to: string | null } | null; config: ListDiff
  cost: { totalFrom: string | null; totalTo: string | null; lines: ListDiff } | null; findings: ListDiff; docs: ListDiff
}
