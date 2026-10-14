/**
 * V4 workbench knowledge objects. Stored under the optional `v4` key of a
 * project so legacy V3 projects stay valid unchanged; every record keeps the
 * project id, a stable id and timestamps like the V3 collections.
 */
import { z } from 'zod'
import { id, ids, text, timestamp, recordFields, reviewSchema } from './common.ts'

/** Non-negative decimal string with at most 4 fractional digits (prices, rates in %). */
export const decimal = z.string().regex(/^\d{1,13}(\.\d{1,4})?$/, '金额必须为非负数，最多 4 位小数')
/** FX rates allow 6 fractional digits. */
export const rateDecimal = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, '汇率必须为正数，最多 6 位小数')
export const currency = z.string().regex(/^[A-Z]{3}$/, '币种使用 ISO 4217 三位代码')
export const quantity = z.number().int('数量必须为整数').nonnegative('数量不能为负').max(1_000_000)
const shortText = z.string().trim().max(4000)
export const modelRouteSchema = z.strictObject({
  provider: z.string(), model: z.string(), reasoningEffort: z.string().optional(),
  source: z.enum(['override', 'project', 'default', 'none']),
})
export type ModelRoute = z.infer<typeof modelRouteSchema>
/** A human review bound to the exact content hash it approved; stale when content changes. */
export const boundReviewSchema = z.strictObject({ review: reviewSchema, hash: z.string().regex(/^[a-f0-9]{64}$/) })
export type BoundReview = z.infer<typeof boundReviewSchema>

export const briefSchema = z.strictObject({
  objective: shortText, scenario: shortText, scope: shortText, constraints: shortText,
  acceptance: z.array(text.max(1000)).max(20), openQuestions: z.array(text.max(1000)).max(12),
})
export const discoverySchema = z.strictObject({
  brief: briefSchema, review: boundReviewSchema.optional(), requirementIds: ids,
  proposal: briefSchema.optional(),
})
export const supportNoteSchema = z.strictObject({
  ...recordFields, category: z.enum(['fact', 'constraint', 'acceptance', 'interface', 'risk']),
  title: text.max(200), content: text.max(3000), relevance: text.max(1000),
  documentId: id.optional(), quote: shortText.optional(), locator: shortText.optional(),
  status: z.enum(['draft', 'fixed']), review: reviewSchema.optional(),
})
export const explorationSchema = z.strictObject({
  ...recordFields, phase: z.enum(['initial', 'synthesis']), inputHash: text, runId: id, routesHash: text.optional(),
  summary: text.max(20000), questionIds: ids,
  routes: z.array(z.strictObject({
    alternativeId: id, industrialSupport: text.max(3000), feasibility: text.max(3000),
    evidenceGaps: z.array(text.max(1000)).max(12), researchDirections: z.array(text.max(500)).max(8),
    sourceAlternativeIds: ids,
  })).min(1).max(5),
})

export const intakeBatchSchema = z.strictObject({
  ...recordFields, label: text, sourceNote: shortText.optional(), receivedOn: z.iso.date().optional(),
  documentIds: ids, manualSummary: shortText.optional(),
  status: z.enum(['received', 'hinted', 'analyzing', 'analyzed', 'failed']),
  hint: z.strictObject({ added: z.number().int().nonnegative(), modified: z.number().int().nonnegative(),
    conflict: z.number().int().nonnegative(), background: z.number().int().nonnegative(),
    duplicates: z.array(z.string()), notes: z.array(z.string()) }).optional(),
  warnings: z.array(z.string()), analysisRunId: id.optional(), error: z.string().optional(),
})
export const changeKind = z.enum(['added', 'modified', 'conflict', 'background'])
export const changeStatus = z.enum(['pending', 'adopted', 'ignored', 'clarify', 'to_research', 'no_change'])
export const changeProposalSchema = z.strictObject({
  ...recordFields, batchId: id, kind: changeKind, summary: text,
  newText: text, documentId: id.optional(), locator: shortText.optional(),
  oldText: shortText.optional(), requirementId: id.optional(),
  origin: z.enum(['direct', 'inferred']), detectedBy: z.enum(['rule', 'model']),
  impactNote: shortText.optional(), status: changeStatus, review: reviewSchema.optional(),
  resultRequirementId: id.optional(), resultQuestionId: id.optional(),
})
export const researchQuestionSchema = z.strictObject({
  ...recordFields, title: text, description: shortText.optional(),
  status: z.enum(['open', 'researching', 'answered', 'needs_review', 'closed']),
  requirementIds: ids, documentIds: ids,
  alternativeIds: ids.optional(), direction: shortText.optional(), decisionUse: shortText.optional(),
  plan: z.strictObject({ steps: z.array(text).min(1).max(12), mode: z.enum(['local', 'web', 'both']),
    queries: z.array(text).max(6), confirmedBy: text.optional(), confirmedAt: timestamp.optional() }).optional(),
  report: z.string().max(200_000).optional(), reportRunId: id.optional(), reviewReason: shortText.optional(),
})
export const webSourceSchema = z.strictObject({
  ...recordFields, questionId: id.optional(), runId: id.optional(), url: z.url(), title: text,
  status: z.enum(['fetched', 'failed']), fetchedAt: timestamp, contentHash: z.string().optional(),
  snapshot: z.string().max(100_000).optional(), error: shortText.optional(),
})
export const researchRunSchema = z.strictObject({
  ...recordFields, questionId: id.optional(), kind: z.enum(['chat', 'research', 'deep_change', 'section_revision', 'discovery', 'brainstorm', 'document_draft']),
  mode: z.enum(['local', 'web', 'both']),
  status: z.enum(['running', 'completed', 'failed', 'cancelled']), modelRoute: modelRouteSchema,
  startedAt: timestamp, completedAt: timestamp.optional(), error: shortText.optional(),
  webStatus: z.enum(['not_requested', 'unavailable', 'fetched', 'partial', 'failed']),
  sourceIds: ids, note: shortText.optional(),
})
export const chatMessageSchema = z.strictObject({
  ...recordFields, thread: z.string().min(1).max(80), role: z.enum(['user', 'assistant']),
  content: z.string().min(1).max(60_000), runId: id.optional(), modelRoute: modelRouteSchema.optional(),
  status: z.enum(['done', 'failed', 'cancelled']),
})
export const sourceRefSchema = z.strictObject({
  type: z.enum(['document', 'web', 'report', 'none']), documentId: id.optional(), sourceId: id.optional(),
  locator: shortText.optional(), quote: z.string().max(4000).optional(), quoteHash: z.string().optional(),
})
export const findingSchema = z.strictObject({
  ...recordFields, questionId: id.optional(), statement: text, conditions: shortText.optional(),
  origin: z.enum(['ai', 'manual']), source: sourceRefSchema,
  adoption: z.enum(['candidate', 'adopted', 'rejected']), adoptionReview: reviewSchema.optional(),
  verification: z.enum(['unverified', 'verified', 'disputed']), verificationReview: reviewSchema.optional(),
  needsReview: z.boolean(), reviewReason: shortText.optional(),
  history: z.array(z.strictObject({ statement: text, at: timestamp, by: text })),
  requirementIds: ids, alternativeIds: ids, decisionIds: ids, configItemIds: ids,
})
export const entityType = z.enum(['requirement', 'document', 'finding', 'question', 'alternative', 'decision',
  'config', 'cost', 'doc', 'change'])
export const impactLinkSchema = z.strictObject({
  ...recordFields, fromType: entityType, fromId: id, toType: entityType, toId: id,
  origin: z.enum(['direct', 'inferred']), note: shortText.optional(),
  status: z.enum(['open', 'confirmed', 'no_change']), review: reviewSchema.optional(),
})
export const configItemSchema = z.strictObject({
  ...recordFields, group: text, name: text, model: shortText.optional(), params: shortText.optional(),
  quantity, unit: text, interface: shortText.optional(), installation: shortText.optional(),
  requirementIds: ids, evidenceIds: ids, findingIds: ids, alternativeId: id.optional(),
  status: z.enum(['active', 'removed']),
})
export const costCategory = z.enum(['equipment', 'installation', 'integration', 'service', 'spare', 'other'])
export const priceSourceType = z.enum(['supplier_quote', 'catalog', 'historical', 'internal_estimate', 'test_data', 'none'])
export const costLineSchema = z.strictObject({
  ...recordFields, category: costCategory, name: text, configItemIds: ids,
  quantityMode: z.enum(['manual', 'follow_config']), quantity, factor: quantity.min(1).default(1), unit: text,
  unitPrice: decimal.optional(), currency,
  sourceType: priceSourceType, supplier: shortText.optional(), quoteDate: z.iso.date().optional(),
  validUntil: z.iso.date().optional(), applicableQty: shortText.optional(), taxIncluded: z.boolean().optional(),
  reference: shortText.optional(), note: shortText.optional(),
}).superRefine((l, ctx) => {
  if (l.quantityMode === 'follow_config' && !l.configItemIds.length) ctx.addIssue({ code: 'custom', message: '跟随配置数量的成本行必须关联配置项' })
  if (l.sourceType === 'supplier_quote' && (!l.reference || !l.quoteDate)) ctx.addIssue({ code: 'custom', message: '供应商报价必须记录报价单号/附件及报价日期' })
  if (l.unitPrice !== undefined && l.sourceType === 'none') ctx.addIssue({ code: 'custom', message: '已填写单价时必须选择价格来源类型' })
})
export const costSettingsSchema = z.strictObject({
  baseCurrency: currency, contingencyPct: decimal, taxPct: decimal.optional(), taxNote: shortText.optional(),
  fxRates: z.array(z.strictObject({ currency, rate: rateDecimal, asOf: z.iso.date(), source: text })),
})
export const docSectionSchema = z.strictObject({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/), title: text, content: z.string().max(100_000),
  depsHash: z.string(), generatedAt: timestamp, editedByHuman: z.boolean(),
  proposal: z.strictObject({ content: z.string().max(100_000), reason: text, at: timestamp,
    origin: z.enum(['deterministic', 'ai']), runId: id.optional() }).optional(),
})
export const docTemplateSchema = z.strictObject({
  ...recordFields, name: text, fileName: text, sha256: z.string(), byteLength: z.number().int().positive(),
  dataBase64: z.string().max(4_000_000), placeholders: z.array(z.string()), sectionSlots: z.array(z.string()),
  warnings: z.array(z.string()),
  outline: z.array(z.strictObject({ key: text, title: text, guidance: shortText })).optional(),
})
export const docDraftSchema = z.strictObject({
  ...recordFields, kind: z.enum(['technical', 'cost', 'change_summary']), title: text,
  templateId: id.optional(), sections: z.array(docSectionSchema).min(1), revisionNo: z.number().int().positive(),
  review: boundReviewSchema.optional(),
  exports: z.array(z.strictObject({ at: timestamp, hash: z.string(), fileName: text, sha256: z.string(), byteLength: z.number().int() })),
  sent: z.array(z.strictObject({ review: reviewSchema, recipient: text, channel: text, exportSha256: z.string() })),
})
export const v4ReviewKind = z.enum(['cost_draft', 'supplier_verified', 'external_approved'])
export const baselineSchema = z.strictObject({
  ...recordFields, number: z.number().int().positive(), label: text,
  type: z.enum(['technical', 'full']), review: reviewSchema, snapshotHash: z.string(),
  snapshot: z.record(z.string(), z.json()),
})
export const v4StateSchema = z.strictObject({
  discovery: discoverySchema.optional(), supportNotes: z.array(supportNoteSchema).optional(), explorations: z.array(explorationSchema).optional(),
  intakeBatches: z.array(intakeBatchSchema), changes: z.array(changeProposalSchema),
  questions: z.array(researchQuestionSchema), runs: z.array(researchRunSchema), sources: z.array(webSourceSchema),
  messages: z.array(chatMessageSchema), findings: z.array(findingSchema), impacts: z.array(impactLinkSchema),
  configItems: z.array(configItemSchema), costLines: z.array(costLineSchema), costSettings: costSettingsSchema,
  costReviews: z.strictObject({ cost_draft: boundReviewSchema.optional(), supplier_verified: boundReviewSchema.optional(),
    external_approved: boundReviewSchema.optional() }),
  draftRoute: z.strictObject({ alternativeId: id, selectedAt: timestamp, by: text }).optional(),
  templates: z.array(docTemplateSchema), docs: z.array(docDraftSchema), baselines: z.array(baselineSchema),
  modelPreference: z.strictObject({ provider: z.string(), model: z.string(), reasoningEffort: z.string().optional() }).optional(),
})
export type V4State = z.infer<typeof v4StateSchema>
export type ConfigItem = z.infer<typeof configItemSchema>
export type CostLine = z.infer<typeof costLineSchema>
export type CostSettings = z.infer<typeof costSettingsSchema>
export type DocDraft = z.infer<typeof docDraftSchema>
export type DocSectionState = z.infer<typeof docSectionSchema>
export type Finding = z.infer<typeof findingSchema>
export type ChangeProposal = z.infer<typeof changeProposalSchema>
export type IntakeBatch = z.infer<typeof intakeBatchSchema>
export type ResearchQuestion = z.infer<typeof researchQuestionSchema>
export type ResearchRunV4 = z.infer<typeof researchRunSchema>
export type Baseline = z.infer<typeof baselineSchema>

export function emptyV4(): V4State {
  return { intakeBatches: [], changes: [], questions: [], runs: [], sources: [], messages: [], findings: [],
    impacts: [], configItems: [], costLines: [], costSettings: { baseCurrency: 'CNY', contingencyPct: '0', fxRates: [] },
    costReviews: {}, templates: [], docs: [], baselines: [] }
}

/** V4 collections that hold project records (as opposed to settings objects). */
export const V4_COLLECTIONS = ['intakeBatches', 'changes', 'questions', 'runs', 'sources', 'messages', 'findings',
  'impacts', 'configItems', 'costLines', 'templates', 'docs', 'baselines', 'supportNotes', 'explorations'] as const

/**
 * Referential integrity for V4 records. `has(kind, id)` answers V3 lookups;
 * `fail` adds a schema issue. Kept here so state.ts stays a thin aggregator.
 */
export function validateV4(v4: V4State, projectId: string, has: (kind: 'documents' | 'requirements' | 'evidence' | 'alternatives' | 'decisions', id: string) => boolean,
  allIds: Set<string>, fail: (message: string) => void): void {
  for (const name of V4_COLLECTIONS) for (const r of v4[name] ?? []) {
    if (r.projectId !== projectId) fail(`Cross-project record: ${r.id}`)
    if (allIds.has(r.id)) fail(`Duplicate record: ${r.id}`)
    allIds.add(r.id)
  }
  const own = <K extends typeof V4_COLLECTIONS[number]>(name: K, list: readonly (string | undefined)[]) => {
    for (const x of list) if (x !== undefined && !v4[name]?.some(r => r.id === x)) fail(`Missing ${name} reference: ${x}`)
  }
  const v3 = (kind: Parameters<typeof has>[0], list: readonly (string | undefined)[]) => {
    for (const x of list) if (x !== undefined && !has(kind, x)) fail(`Missing ${kind} reference: ${x}`)
  }
  for (const b of v4.intakeBatches) { v3('documents', b.documentIds); own('runs', [b.analysisRunId]) }
  for (const c of v4.changes) {
    own('intakeBatches', [c.batchId]); v3('documents', [c.documentId]); v3('requirements', [c.requirementId, c.resultRequirementId])
    own('questions', [c.resultQuestionId])
    if (c.status !== 'pending' && !c.review) fail('Handled change needs a human review')
  }
  if (v4.discovery) v3('requirements', v4.discovery.requirementIds)
  for (const n of v4.supportNotes ?? []) {
    v3('documents', [n.documentId])
    if (n.status === 'fixed' && !n.review) fail('Fixed support note needs human review')
  }
  for (const e of v4.explorations ?? []) {
    own('runs', [e.runId]); own('questions', e.questionIds)
    for (const r of e.routes) v3('alternatives', [r.alternativeId, ...r.sourceAlternativeIds])
  }
  for (const q of v4.questions) { v3('requirements', q.requirementIds); v3('documents', q.documentIds); v3('alternatives', q.alternativeIds ?? []); own('runs', [q.reportRunId]) }
  for (const r of v4.runs) { own('questions', [r.questionId]); own('sources', r.sourceIds) }
  for (const s of v4.sources) {
    own('questions', [s.questionId])
    if (s.status === 'fetched' && (!s.snapshot || !s.contentHash)) fail('Fetched source needs a body snapshot')
  }
  for (const m of v4.messages) own('runs', [m.runId])
  for (const f of v4.findings) {
    own('questions', [f.questionId]); v3('requirements', f.requirementIds); v3('alternatives', f.alternativeIds)
    v3('decisions', f.decisionIds); own('configItems', f.configItemIds)
    if (f.source.type === 'document') v3('documents', [f.source.documentId])
    if (f.source.type === 'web') own('sources', [f.source.sourceId])
    if (f.adoption !== 'candidate' && !f.adoptionReview) fail('Finding adoption needs a human review')
    if (f.verification !== 'unverified' && !f.verificationReview) fail('Finding verification needs a human review')
    if (f.verification === 'verified' && f.source.type === 'none') fail('A finding without a source cannot be verified')
  }
  for (const c of v4.configItems) {
    v3('requirements', c.requirementIds); v3('evidence', c.evidenceIds); own('findings', c.findingIds); v3('alternatives', [c.alternativeId])
  }
  for (const l of v4.costLines) own('configItems', l.configItemIds)
  if (v4.draftRoute) v3('alternatives', [v4.draftRoute.alternativeId])
  for (const d of v4.docs) own('templates', [d.templateId])
  const numbers = new Set<number>()
  for (const b of v4.baselines) { if (numbers.has(b.number)) fail(`Duplicate baseline number: ${b.number}`); numbers.add(b.number) }
}
