/** Shared CRUD mechanics; entity-specific services own policy and confirmations. */
import { z } from 'zod'
import { ensure } from '../domain/common.ts'
import type { Collection, ProjectState, RecordOf } from '../domain/state.ts'
import { assertEditable } from '../domain/state.ts'
import { documentInput } from '../domain/project.ts'
import { competitorInput, policyInput } from '../domain/research.ts'
import { alternativeInput } from '../domain/decision.ts'
import type { ServiceContext } from './project.ts'

export function requiredRecord<K extends Collection>(state: ProjectState, collection: K, id: string): RecordOf<K> {
  const record = state[collection].find(r => r.id === id)
  ensure(record, 'RECORD_NOT_FOUND', `${collection} 记录不存在。`)
  return record as RecordOf<K>
}

/** Typed collection operations preserve IDs and enforce references at commit. */
export class RecordService<K extends Collection> {
  constructor(protected readonly ctx: ServiceContext, readonly collection: K) {}
  list(projectId: string): RecordOf<K>[] { return this.ctx.state(projectId)[this.collection] as RecordOf<K>[] }
  get(projectId: string, id: string): RecordOf<K> { return requiredRecord(this.ctx.state(projectId), this.collection, id) }
  async delete(projectId: string, id: string): Promise<void> {
    await this.ctx.repository.update(projectId, s => {
      assertEditable(s, id)
      const rows = s[this.collection]
      const index = rows.findIndex(r => r.id === id)
      ensure(index >= 0, 'RECORD_NOT_FOUND', '记录不存在。')
      rows.splice(index, 1)
    })
  }
}

export class DocumentService extends RecordService<'documents'> {
  constructor(ctx: ServiceContext) { super(ctx, 'documents') }
  async add(projectId: string, input: unknown) {
    const row = { ...documentInput.parse(input), ...this.ctx.fields(projectId), importedAt: this.ctx.now() }
    await this.ctx.repository.update(projectId, s => { s.documents.push(row) })
    return row
  }
  async update(projectId: string, id: string, input: unknown) {
    const patch = documentInput.partial().parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      ensure(!s.requirements.some(r => r.sourceDocumentId === id) && !s.evidence.some(e => e.sourceDocumentId === id)
        && !s.tenderItems.some(t => t.sourceDocumentId === id),
        'SOURCE_REFERENCED', '来源已被引用，请导入新版本以保留原文。')
      Object.assign(requiredRecord(s, 'documents', id), patch, { updatedAt: this.ctx.now() })
    })
    return requiredRecord(state, 'documents', id)
  }
}

export class CompetitorService extends RecordService<'competitors'> {
  constructor(ctx: ServiceContext) { super(ctx, 'competitors') }
  async upsert(projectId: string, input: unknown, id?: string) {
    const data = competitorInput.parse(input)
    const row = { ...data, ...this.ctx.fields(projectId) }
    const state = await this.ctx.repository.update(projectId, s => {
      if (id) Object.assign(requiredRecord(s, 'competitors', id), data, { updatedAt: this.ctx.now() })
      else s.competitors.push(row)
    })
    return requiredRecord(state, 'competitors', id ?? row.id)
  }
}

export class PolicyService extends RecordService<'policies'> {
  constructor(ctx: ServiceContext) { super(ctx, 'policies') }
  async add(projectId: string, input: unknown) {
    const row = { ...policyInput.parse(input), ...this.ctx.fields(projectId) }
    await this.ctx.repository.update(projectId, s => { s.policies.push(row) })
    return row
  }
}

export class AlternativeService extends RecordService<'alternatives'> {
  constructor(ctx: ServiceContext) { super(ctx, 'alternatives') }
  async addMany(projectId: string, input: unknown) {
    const rows = z.array(alternativeInput).min(1).parse(input).map(data => ({ ...data, ...this.ctx.fields(projectId) }))
    await this.ctx.repository.update(projectId, s => { s.alternatives.push(...rows) })
    return rows
  }
  async update(projectId: string, id: string, input: unknown) {
    const patch = alternativeInput.partial().parse(input)
    const state = await this.ctx.repository.update(projectId, s => {
      assertEditable(s, id)
      Object.assign(requiredRecord(s, 'alternatives', id), patch, { updatedAt: this.ctx.now() })
    })
    return requiredRecord(state, 'alternatives', id)
  }
}
