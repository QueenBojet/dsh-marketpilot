import { z } from 'zod'
import { ids, text, ensure } from '../domain/common.ts'
import { evidenceInput, evidenceKind } from '../domain/evidence.ts'
import type { Evidence } from '../domain/evidence.ts'
import { RecordService, requiredRecord } from './records.ts'
import type { ServiceContext } from './project.ts'

const verificationInput = z.strictObject({
  method: z.enum(['human', 'new_evidence']), targetKind: evidenceKind.exclude(['DECISION', 'UNKNOWN']),
  statement: text, supportingEvidenceIds: ids.default([]),
})
const linksInput = z.strictObject({
  relatedRequirementIds: ids.default([]), relatedCompetitorIds: ids.default([]), relatedAlternativeIds: ids.default([]),
})

export class EvidenceService extends RecordService<'evidence'> {
  constructor(ctx: ServiceContext) { super(ctx, 'evidence') }
  async add(projectId: string, input: unknown) { return (await this.addMany(projectId, [input]))[0]! }
  async addMany(projectId: string, input: unknown) {
    const rows: Evidence[] = z.array(evidenceInput).min(1).parse(input).map(data => ({ ...data, ...this.ctx.fields(projectId),
      status: 'draft', relatedRequirementIds: [], relatedCompetitorIds: [], relatedAlternativeIds: [] }))
    await this.ctx.repository.update(projectId, s => { s.evidence.push(...rows) })
    return rows
  }
  async update(projectId: string, id: string, input: unknown) {
    const patch = evidenceInput.partial().parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      const row = requiredRecord(s, 'evidence', id)
      ensure(row.status === 'draft' && row.kind !== 'DECISION', 'EVIDENCE_IMMUTABLE', '已核验的证据不能覆盖，请添加新证据。')
      ensure(!patch.kind || patch.kind === row.kind, 'UNKNOWN_PROTECTED', '证据分类转换必须通过 verify 并保留核验记录。')
      Object.assign(row, patch, { updatedAt: this.ctx.now() })
    })
    return requiredRecord(state, 'evidence', id)
  }
  async link(projectId: string, id: string, input: unknown) {
    const links = linksInput.parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      const row = requiredRecord(s, 'evidence', id)
      for (const key of ['relatedRequirementIds', 'relatedCompetitorIds', 'relatedAlternativeIds'] as const) {
        row[key] = [...new Set([...row[key], ...links[key]])]
      }
      row.updatedAt = this.ctx.now()
    })
    return requiredRecord(state, 'evidence', id)
  }
  async verify(projectId: string, id: string, input: unknown) {
    const request = verificationInput.parse(input)
    const original = this.get(projectId, id)
    ensure(original.status === 'draft' && original.kind !== 'DECISION', 'EVIDENCE_IMMUTABLE', '只能核验草稿证据。')
    const human = request.method === 'human' ? await this.ctx.review(projectId, 'verify_evidence', { original, request }) : undefined
    const state = await this.ctx.repository.update(projectId, s => {
      if (human) this.ctx.assertFresh(s, human.revision)
      const row = requiredRecord(s, 'evidence', id)
      ensure(row.status === 'draft', 'EVIDENCE_IMMUTABLE', '证据已由另一个审核操作处理。')
      if (!human) {
        ensure(request.supportingEvidenceIds.length > 0, 'UNKNOWN_PROTECTED', '自动核验必须关联新证据。')
        for (const supportId of request.supportingEvidenceIds) {
          const source = requiredRecord(s, 'evidence', supportId)
          ensure(source.id !== row.id && source.status === 'verified' && ['FACT', 'SOURCE'].includes(source.kind)
            && source.statement === request.statement && source.createdAt >= row.createdAt,
          'UNSUPPORTED_RESOLUTION', '自动确认需要新增且已核验的 FACT/SOURCE，并且声明文本一致；其他情况需人工审核。')
        }
      }
      row.verification = { method: request.method, fromKind: row.kind, previousStatement: row.statement, supportingEvidenceIds: request.supportingEvidenceIds,
        ...(human ? { review: human.review } : {}) }
      Object.assign(row, { kind: request.targetKind, statement: request.statement, status: 'verified', updatedAt: this.ctx.now() })
    })
    return requiredRecord(state, 'evidence', id)
  }
}
