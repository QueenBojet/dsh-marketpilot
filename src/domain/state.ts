/** A project is the atomic persistence unit: all references stay within it. */
import { z } from 'zod'
import { ensure } from './common.ts'
import { projectSchema, documentSchema } from './project.ts'
import { requirementSchema } from './requirement.ts'
import { evidenceSchema, findUnsupportedClaims } from './evidence.ts'
import { competitorSchema, policySchema } from './research.ts'
import { alternativeSchema, decisionSchema } from './decision.ts'
import { tenderSchema } from './tender.ts'
import { artifactSchema } from './artifact.ts'
import { workflowSchema } from './workflow.ts'

/**
 * Persisted short-code assignments (`REQ-01`-style display codes → record
 * ids). Optional: legacy projects keep deriving codes until their next write
 * pins the exact same numbering, after which codes never shift again.
 */
export const shortCodeBookSchema = z.strictObject({
  seq: z.record(z.string(), z.number().int().nonnegative()),
  codes: z.record(z.string(), z.string()),
})
export type ShortCodeBookState = z.infer<typeof shortCodeBookSchema>

export const stateSchema = z.strictObject({
  project: projectSchema, revision: z.number().int().nonnegative(),
  documents: z.array(documentSchema), requirements: z.array(requirementSchema),
  evidence: z.array(evidenceSchema), competitors: z.array(competitorSchema), policies: z.array(policySchema),
  alternatives: z.array(alternativeSchema), decisions: z.array(decisionSchema),
  tenderItems: z.array(tenderSchema), artifacts: z.array(artifactSchema), workflowRuns: z.array(workflowSchema),
  codeBook: shortCodeBookSchema.optional(),
}).superRefine((s, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  const collections = { documents: s.documents, requirements: s.requirements, evidence: s.evidence,
    competitors: s.competitors, policies: s.policies, alternatives: s.alternatives, decisions: s.decisions,
    tenderItems: s.tenderItems, artifacts: s.artifacts, workflowRuns: s.workflowRuns }
  const allIds = new Set<string>()
  for (const rows of Object.values(collections)) for (const r of rows) {
    if (r.projectId !== s.project.id) fail(`Cross-project record: ${r.id}`)
    if (allIds.has(r.id)) fail(`Duplicate record: ${r.id}`)
    allIds.add(r.id)
  }
  const refs = (ids: string[], name: keyof typeof collections) => {
    for (const id of ids) if (!collections[name].some(r => r.id === id)) fail(`Missing ${name} reference: ${id}`)
  }
  for (const r of s.requirements) if (r.sourceDocumentId) refs([r.sourceDocumentId], 'documents')
  for (const e of s.evidence) {
    if (e.sourceDocumentId) refs([e.sourceDocumentId], 'documents')
    refs(e.supportingEvidenceIds, 'evidence')
    refs(e.relatedRequirementIds, 'requirements')
    refs(e.relatedCompetitorIds, 'competitors')
    refs(e.relatedAlternativeIds, 'alternatives')
    if (e.supportingEvidenceIds.includes(e.id)) fail('Evidence cannot support itself')
    if (e.decisionId) refs([e.decisionId], 'decisions')
    if (e.verification?.method === 'new_evidence') {
      for (const id of e.verification.supportingEvidenceIds) {
        if (id === e.id || !s.evidence.some(source => source.id === id && source.status === 'verified'
          && (source.kind === 'FACT' || source.kind === 'SOURCE'))) fail('Verification needs another verified FACT/SOURCE')
      }
    }
  }
  for (const c of [...s.competitors, ...s.policies, ...s.alternatives, ...s.decisions, ...s.tenderItems]) refs(c.evidenceIds, 'evidence')
  for (const a of s.alternatives) refs(Object.keys(a.requirementCoverage), 'requirements')
  for (const d of s.decisions) { refs([d.alternativeId], 'alternatives'); refs(d.requirementIds, 'requirements') }
  for (const t of s.tenderItems) {
    if (t.sourceDocumentId) refs([t.sourceDocumentId], 'documents')
    refs(t.requirementIds, 'requirements')
    if (t.status === 'compliant' && findUnsupportedClaims([t], s.evidence).length) fail('Compliant clause lacks verified evidence')
  }
  for (const a of s.artifacts) if (a.workflowRunId) refs([a.workflowRunId], 'workflowRuns')
  const active = s.decisions.find(d => d.id === s.project.activeDecisionId)
  if (s.project.activeDecisionId && !active) fail('Active Decision is missing')
  if (active && active.requirementIds.some(id => !s.requirements.some(r => r.id === id && r.status === 'confirmed'))) fail('Active Decision requires confirmed requirements')
  const selected = s.alternatives.filter(a => a.status === 'selected')
  if (active ? selected.length !== 1 || selected[0]?.id !== active.alternativeId : selected.length !== 0) fail('Selected Alternative must match the active Human Decision')
})

export type ProjectState = z.infer<typeof stateSchema>
/** Record collections only — `project`/`revision` are headers, `codeBook` is the code map. */
export type Collection = Exclude<keyof ProjectState, 'project' | 'revision' | 'codeBook'>
export type RecordOf<K extends Collection> = ProjectState[K][number]

/** Forward-only project status order; `archived` is terminal. */
const STATUS_ORDER: readonly ProjectState['project']['status'][] = [
  'draft', 'requirements_ready', 'researching', 'alternatives_ready',
  'decision_confirmed', 'solution_ready', 'tender_review', 'archived',
]

/**
 * Move the project status forward only — a completed workflow never drags the
 * stage baseline backwards, and archived projects stay archived. Passing the
 * clock also refreshes the project's updatedAt, keeping 最近项目 ordering honest.
 */
export function advanceProjectStatus(s: ProjectState, next: ProjectState['project']['status'], now?: string): void {
  if (STATUS_ORDER.indexOf(next) > STATUS_ORDER.indexOf(s.project.status)) {
    s.project.status = next
    if (now !== undefined) s.project.updatedAt = now
  }
}

/** Return an explicit prerequisite result without letting a model select a route. */
export function solutionPrerequisites(s: ProjectState): { status: 'ready' | 'waiting_human' | 'prerequisite_error'; reason: string } {
  if (!s.requirements.some(r => r.status === 'confirmed')) return { status: 'prerequisite_error', reason: '请先确认客户需求。' }
  if (!s.project.activeDecisionId) return { status: 'waiting_human', reason: '等待人工确认最终技术路线。' }
  return { status: 'ready', reason: '需求与技术路线已确认。' }
}

/** Reject edits that would invalidate a recorded human decision. */
export function assertEditable(s: ProjectState, id: string): void {
  ensure(!s.decisions.some(d => d.alternativeId === id || d.requirementIds.includes(id)),
    'DECISION_REFERENCED', '记录已被人工 Decision 引用，请创建新候选版本。')
}
