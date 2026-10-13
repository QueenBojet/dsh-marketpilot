/** Independent, deterministic V3.4 records; no customer data or model calls. */
import { stateSchema } from '../src/storage/v34-schema/state.ts'
import type { ProjectState } from '../src/domain/state.ts'
import { emptyV4 } from '../src/domain/v4.ts'
import { hashOf } from '../src/domain/v4-text.ts'
import { z } from 'zod'

export const at = '2026-10-13T00:00:00.000Z'
export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const review = { reviewer: 'synthetic-engineer', reviewedAt: at, reason: 'Synthetic explicit approval' }
export function legacyFixture(): ProjectState[] {
  const pid = uid(1)
  const record = (n: number) => ({ id: uid(n), projectId: pid, createdAt: at, updatedAt: at })
  const state = stateSchema.parse({
    project: { id: pid, name: 'Synthetic compatibility fixture', status: 'solution_ready', createdAt: at, updatedAt: at, activeDecisionId: uid(5) }, revision: 7,
    documents: [{ ...record(2), importedAt: at, name: 'Synthetic specification', kind: 'customer_requirement', textContent: 'Synthetic requirement: retain events.' }],
    requirements: [{ ...record(3), originalText: 'Retain events', normalizedText: 'Retain events', type: 'functional', priority: 'must', status: 'confirmed', sourceDocumentId: uid(2), confirmation: review }],
    evidence: [{ ...record(4), kind: 'SOURCE', title: 'Synthetic source', statement: 'Retain events', sourceType: 'customer', sourceDocumentId: uid(2), supportingEvidenceIds: [], relatedRequirementIds: [uid(3)], relatedCompetitorIds: [], relatedAlternativeIds: [uid(6)], status: 'draft' }],
    alternatives: [{ ...record(6), name: 'Synthetic route', summary: 'Store events', components: ['Recorder'], strengths: [], limitations: [], risks: [], unknowns: [], requirementCoverage: { [uid(3)]: 'full' }, evidenceIds: [uid(4)], status: 'selected' }],
    decisions: [{ ...record(5), alternativeId: uid(6), decision: 'Select synthetic route', rationale: 'Test fixture', evidenceIds: [uid(4)], requirementIds: [uid(3)], confirmedBy: review.reviewer, confirmedAt: at, review }],
    workflowRuns: [{ ...record(7), type: 'solution_generation', input: {}, status: 'completed', currentStep: 'COMPLETED', startedAt: at, completedAt: at, durationMs: 0, modelCalls: 0, toolCalls: 0, humanWaitMs: 0, steps: [{ step: 'COMPLETED', at }] }],
    artifacts: [{ ...record(8), type: 'solution', name: 'Synthetic artifact', content: 'Synthetic preserved content', format: 'markdown', workflowRunId: uid(7), reviewStatus: 'approved', review }],
    competitors: [{ ...record(9), company: 'Synthetic vendor', performance: {}, interfaces: [], certifications: [], cases: [], strengths: [], limitations: [], evidenceIds: [uid(4)] }],
    policies: [{ ...record(10), title: 'Synthetic policy', mandatoryLevel: 'unknown', keyRequirements: ['Retain events'], evidenceIds: [uid(4)] }],
    tenderItems: [{ ...record(11), originalText: 'Retain events', normalizedRequirement: 'Retain events', sourceDocumentId: uid(2), claimKinds: ['general'], status: 'unknown', requirementIds: [uid(3)], evidenceIds: [uid(4)] }],
    codeBook: { seq: { REQ: 1 }, codes: { [uid(3)]: 'REQ-01' } },
  })
  const empty = stateSchema.parse({ project: { id: uid(20), name: 'Independent empty project', status: 'draft', createdAt: at, updatedAt: at }, revision: 0,
    documents: [], requirements: [], evidence: [], alternatives: [], decisions: [], artifacts: [], workflowRuns: [], competitors: [], policies: [], tenderItems: [] })
  return [state, empty]
}

export function populatedV4(): NonNullable<ProjectState['v4']> {
  const v4 = emptyV4()
  const record = (n: number) => ({ id: uid(n), projectId: uid(1), createdAt: at, updatedAt: at })
  v4.intakeBatches.push({ ...record(30), label: 'Synthetic batch', documentIds: [uid(2)], status: 'hinted', warnings: [] })
  v4.changes.push({ ...record(31), batchId: uid(30), kind: 'modified', summary: 'Synthetic change', newText: 'Retain events for two days', documentId: uid(2), requirementId: uid(3), origin: 'direct', detectedBy: 'rule', status: 'pending' })
  v4.findings.push({ ...record(32), statement: 'Synthetic finding', origin: 'manual', source: { type: 'document', documentId: uid(2), quote: 'retain events' }, adoption: 'candidate', verification: 'unverified', needsReview: false, history: [], requirementIds: [uid(3)], alternativeIds: [uid(6)], decisionIds: [uid(5)], configItemIds: [uid(33)] })
  v4.configItems.push({ ...record(33), group: 'Synthetic group', name: 'Recorder', quantity: 2, unit: 'unit', requirementIds: [uid(3)], evidenceIds: [uid(4)], findingIds: [uid(32)], alternativeId: uid(6), status: 'active' })
  v4.costLines.push({ ...record(34), category: 'equipment', name: 'Synthetic price', configItemIds: [uid(33)], quantityMode: 'follow_config', quantity: 0, factor: 1, unit: 'unit', unitPrice: '1000', currency: 'CNY', sourceType: 'test_data' })
  v4.costSettings.taxPct = '6'
  v4.modelPreference = { provider: 'synthetic', model: 'no-network' }
  v4.docs.push({ ...record(35), kind: 'technical', title: 'Synthetic DOCX', sections: [{ key: 'overview', title: 'Overview', content: 'Synthetic editable document', depsHash: hashOf('fixture'), generatedAt: at, editedByHuman: true }], revisionNo: 1, exports: [], sent: [] })
  for (const number of [1, 2]) {
    const snapshot = z.record(z.string(), z.json()).parse(JSON.parse(JSON.stringify({ requirements: legacyFixture()[0]!.requirements, configItems: v4.configItems, costLines: v4.costLines, docs: v4.docs })))
    v4.baselines.push({ ...record(40 + number), number, label: `V${number}`, type: 'full', review, snapshotHash: hashOf(snapshot), snapshot })
  }
  return v4
}
