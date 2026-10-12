/** 方案与决策 + 成本与报价: draft route, structured config, cost lines and the three bound cost reviews. */
import { z } from 'zod'
import { ensure, id, ids, text } from '../../domain/common.ts'
import { configItemSchema, costLineSchema, costSettingsSchema, v4ReviewKind } from '../../domain/v4.ts'
import type { ConfigItem, CostLine } from '../../domain/v4.ts'
import { computeCost } from '../../domain/cost.ts'
import type { CostResult } from '../../domain/cost.ts'
import { requiredRecord } from '../records.ts'
import { V4Base, costHash, reviewStatus, routeState } from './base.ts'
import type { ReviewStatus } from './base.ts'
import type { DecisionService } from '../decision.ts'
import type { ServiceContext } from '../project.ts'

const omitRecord = { id: true, projectId: true, createdAt: true, updatedAt: true } as const
export const configInput = configItemSchema.omit({ ...omitRecord, status: true }).extend({
  requirementIds: ids.default([]), evidenceIds: ids.default([]), findingIds: ids.default([]),
})
export const configPatch = configInput.partial().extend({ status: z.enum(['active', 'removed']).optional() })
/** Cost line input; the record is re-validated with `costLineSchema` (whose refinements block extend/partial). */
export const costLineInput = z.strictObject({
  category: z.enum(['equipment', 'installation', 'integration', 'service', 'spare', 'other']), name: text.max(300),
  configItemIds: ids.default([]), quantityMode: z.enum(['manual', 'follow_config']).default('manual'),
  quantity: z.number().int('数量必须为整数').nonnegative('数量不能为负').max(1_000_000).default(0),
  factor: z.number().int().min(1).max(1_000_000).default(1), unit: text.max(40),
  unitPrice: z.string().optional(), currency: z.string().default('CNY'),
  sourceType: z.enum(['supplier_quote', 'catalog', 'historical', 'internal_estimate', 'test_data', 'none']).default('none'),
  supplier: z.string().trim().max(300).optional(), quoteDate: z.string().optional(), validUntil: z.string().optional(),
  applicableQty: z.string().trim().max(200).optional(), taxIncluded: z.boolean().optional(),
  reference: z.string().trim().max(1000).optional(), note: z.string().trim().max(2000).optional(),
})
export const routeSelectInput = z.strictObject({ alternativeId: id, by: text.max(80).default('用户') })
export const costReviewInput = z.strictObject({ kind: v4ReviewKind, note: z.string().trim().max(2000).optional() })

export type CostReviewKind = z.infer<typeof v4ReviewKind>
export interface CostView {
  readonly result: CostResult
  readonly hash: string
  readonly reviews: Record<CostReviewKind, ReviewStatus>
  readonly checks: Record<CostReviewKind, readonly string[]>
}

/** Strip empty strings that HTML forms send for untouched optional fields. */
function clean(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value)) if (v !== '' && v !== undefined) out[k] = v
  return out
}

export class SolutionService extends V4Base {
  /** Selecting a route only moves the draft; differing from the confirmed decision invalidates route confirmation. */
  async selectDraftRoute(projectId: string, input: unknown) {
    const data = routeSelectInput.parse(input)
    await this.mutate(projectId, s => {
      const alt = requiredRecord(s, 'alternatives', data.alternativeId)
      ensure(alt.status !== 'rejected', 'INVALID_INPUT', '已否决的路线不能选为草稿路线。')
      s.v4.draftRoute = { alternativeId: data.alternativeId, selectedAt: this.ctx.now(), by: data.by }
    })
    return routeState(this.ctx.state(projectId))
  }
  route(projectId: string) { return routeState(this.ctx.state(projectId)) }

  async addConfig(projectId: string, input: unknown) {
    const data = configInput.parse(clean(input))
    const row: ConfigItem = { ...this.ctx.fields(projectId), ...data, status: 'active' }
    await this.mutate(projectId, s => { s.v4.configItems.push(row) })
    return row
  }
  async updateConfig(projectId: string, itemId: string, input: unknown) {
    const patch = configPatch.parse(clean(input))
    await this.mutate(projectId, s => {
      const row = s.v4.configItems.find(c => c.id === itemId)
      ensure(row, 'RECORD_NOT_FOUND', '配置项不存在。')
      Object.assign(row, patch, { updatedAt: this.ctx.now() })
      configItemSchema.parse(row)
    })
    return this.v4(projectId).configItems.find(c => c.id === itemId)!
  }

  async removeConfig(projectId: string, itemId: string) { return this.updateConfig(projectId, itemId, { status: 'removed' }) }

  async addCostLine(projectId: string, input: unknown) {
    const data = costLineInput.parse(clean(input))
    const row: CostLine = costLineSchema.parse({ ...this.ctx.fields(projectId), ...data })
    await this.mutate(projectId, s => {
      for (const cid of row.configItemIds) ensure(s.v4.configItems.some(c => c.id === cid), 'RECORD_NOT_FOUND', '关联的配置项不存在。')
      s.v4.costLines.push(row)
    })
    return row
  }
  async updateCostLine(projectId: string, lineId: string, input: unknown) {
    const patch = costLineInput.partial().parse(clean(input))
    // Explicitly cleared optional fields arrive as null and remove the value.
    const cleared = Object.entries((input ?? {}) as Record<string, unknown>).filter(([, v]) => v === null || v === '').map(([k]) => k)
    await this.mutate(projectId, s => {
      const idx = s.v4.costLines.findIndex(l => l.id === lineId)
      ensure(idx >= 0, 'RECORD_NOT_FOUND', '成本行不存在。')
      const next: Record<string, unknown> = { ...s.v4.costLines[idx], ...patch, updatedAt: this.ctx.now() }
      for (const k of cleared) if (!['category', 'name', 'unit', 'currency', 'quantityMode', 'sourceType', 'configItemIds', 'quantity', 'factor'].includes(k)) delete next[k]
      const row = costLineSchema.parse(next)
      for (const cid of row.configItemIds) ensure(s.v4.configItems.some(c => c.id === cid), 'RECORD_NOT_FOUND', '关联的配置项不存在。')
      s.v4.costLines[idx] = row
    })
    return this.v4(projectId).costLines.find(l => l.id === lineId)!
  }
  async removeCostLine(projectId: string, lineId: string) {
    await this.mutate(projectId, s => {
      ensure(s.v4.costLines.some(l => l.id === lineId), 'RECORD_NOT_FOUND', '成本行不存在。')
      s.v4.costLines = s.v4.costLines.filter(l => l.id !== lineId)
    })
    return { removed: lineId }
  }
  async updateCostSettings(projectId: string, input: unknown) {
    const settings = costSettingsSchema.parse(clean(input))
    await this.mutate(projectId, s => { s.v4.costSettings = settings })
    return settings
  }

  /** Deterministic BOM/cost plus the status of each bound review against the current inputs. */
  cost(projectId: string): CostView {
    const state = this.ctx.state(projectId)
    const v4 = this.v4(projectId)
    const result = computeCost(v4.costLines, v4.configItems.filter(c => c.status === 'active'), v4.costSettings, this.today())
    const hash = costHash(state)
    const reviews = {
      cost_draft: reviewStatus(v4.costReviews.cost_draft, hash),
      supplier_verified: reviewStatus(v4.costReviews.supplier_verified, hash),
      external_approved: reviewStatus(v4.costReviews.external_approved, hash),
    }
    const draft: string[] = []
    if (!v4.costLines.length) draft.push('尚无成本行。')
    if (!routeState(state).confirmed) draft.push('草稿路线未经人工确认（与已确认决策不一致或尚无决策）。')
    const supplier = [...reviews.cost_draft === 'valid' ? [] : ['需先完成成本草稿审核（且审核后未再修改）。']]
    if (result.missingPrices) supplier.push(`${result.missingPrices} 行缺少单价。`)
    if (result.estimates) supplier.push(`${result.estimates} 行为估算价，非供应商报价。`)
    if (result.testData) supplier.push(`${result.testData} 行为测试数据，不能作为已核验报价。`)
    if (result.expiredQuotes) supplier.push(`${result.expiredQuotes} 行报价已过期。`)
    const external = [...reviews.supplier_verified === 'valid' ? [] : ['需先完成供应商报价核验。']]
    if (result.total === undefined) external.push('无法计算总价（缺价格或缺汇率）。')
    return { result, hash, reviews, checks: { cost_draft: draft, supplier_verified: supplier, external_approved: external } }
  }

  /** Gated cost review bound to the current cost hash; any later change makes it stale. */
  async reviewCost(projectId: string, input: unknown) {
    const { kind, note } = costReviewInput.parse(input)
    const view = this.cost(projectId)
    const blockers = view.checks[kind]
    ensure(!blockers.length, 'REVIEW_BLOCKED', blockers.join(' '))
    const { revision, bound } = await this.bound(projectId, `v4_cost_${kind}`,
      { kind, note, total: view.result.totalDisplay ?? null, lines: view.result.lines.map(l => ({ name: l.name, quantity: l.quantity, amount: l.amountDisplay ?? null, priceState: l.priceState })) }, view.hash)
    await this.mutate(projectId, s => {
      this.ctx.assertFresh(s, revision)
      ensure(costHash(s) === bound.hash, 'STALE_CONTEXT', '成本数据在审核期间已变化，请重新审核。')
      s.v4.costReviews[kind] = bound
    })
    return this.cost(projectId)
  }
}

/** Route confirmation reuses the V3.4 decision gate, then aligns the draft route with it. */
export class RouteService extends V4Base {
  constructor(ctx: ServiceContext, private readonly decisions: DecisionService) { super(ctx) }
  async confirmRoute(projectId: string, input: unknown) {
    const decision = await this.decisions.confirm(projectId, input)
    await this.mutate(projectId, s => {
      s.v4.draftRoute = { alternativeId: decision.alternativeId, selectedAt: this.ctx.now(), by: decision.confirmedBy }
    })
    return { decision, route: routeState(this.ctx.state(projectId)) }
  }
}
