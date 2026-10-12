/** 正式版本: gated publish of immutable technical / full baselines and business-level diffs. */
import { z } from 'zod'
import { ensure, text } from '../../domain/common.ts'
import type { Baseline, DocDraft } from '../../domain/v4.ts'
import { computeCost } from '../../domain/cost.ts'
import { hashOf } from '../../domain/v4-text.ts'
import type { ProjectState } from '../../domain/state.ts'
import { V4Base, costHash, docHash, reviewStatus, routeState, v4Of } from './base.ts'

export const publishInput = z.strictObject({
  type: z.enum(['technical', 'full']), label: text.max(200).optional(), note: z.string().trim().max(2000).optional(),
})
export type BaselineType = Baseline['type']

/** A document counts for publishing only when its current text is reviewed and no proposal is pending. */
function reviewedDoc(state: ProjectState, kind: DocDraft['kind']): DocDraft | undefined {
  return v4Of(state).docs.filter(d => d.kind === kind && reviewStatus(d.review, docHash(d)) === 'valid' && !d.sections.some(s => s.proposal)).at(-1)
}

/** Publish blockers; an empty list means the baseline may be published. */
export function baselineChecks(state: ProjectState, type: BaselineType, today: string): string[] {
  const v4 = v4Of(state)
  const out: string[] = []
  const route = routeState(state)
  if (!route.decision) out.push('尚无人工确认的路线决策。')
  else if (!route.confirmed) out.push('草稿路线与已确认决策不一致，需重新确认路线。')
  if (!state.requirements.some(r => r.status === 'confirmed')) out.push('尚无已确认需求。')
  if (!v4.configItems.some(c => c.status === 'active')) out.push('结构化配置为空。')
  if (!reviewedDoc(state, 'technical')) out.push('技术方案文档未通过人工审核（或审核后已修改、仍有待处理建议）。')
  if (type === 'full') {
    if (reviewStatus(v4.costReviews.cost_draft, costHash(state)) !== 'valid') out.push('成本草稿未审核或审核后已变化。')
    const cost = computeCost(v4.costLines, v4.configItems.filter(c => c.status === 'active'), v4.costSettings, today)
    if (cost.missingFx.length) out.push(`缺少汇率：${cost.missingFx.join('、')}，无法形成总价。`)
    if (cost.total === undefined) out.push('无法计算总价。')
    if (!reviewedDoc(state, 'cost')) out.push('成本报价文档未通过人工审核。')
  }
  return out
}

/** Frozen, JSON-only snapshot of everything the baseline vouches for. */
export function buildSnapshot(state: ProjectState, type: BaselineType, today: string) {
  const v4 = v4Of(state)
  const route = routeState(state)
  const alt = state.alternatives.find(a => a.id === route.decision?.alternativeId)
  const config = v4.configItems.filter(c => c.status === 'active')
  const docKinds: DocDraft['kind'][] = type === 'full' ? ['technical', 'cost'] : ['technical']
  const snap = {
    type,
    requirements: state.requirements.filter(r => r.status === 'confirmed')
      .map(r => ({ id: r.id, text: r.normalizedText, priority: r.priority, type: r.type })),
    evidenceRefs: state.evidence.filter(e => e.status !== 'rejected' && e.status !== 'superseded')
      .map(e => ({ id: e.id, kind: e.kind, title: e.title, status: e.status })),
    findings: v4.findings.filter(f => f.adoption === 'adopted')
      .map(f => ({ id: f.id, statement: f.statement, verification: f.verification, sourceType: f.source.type })),
    decision: route.decision ? { id: route.decision.id, decision: route.decision.decision, rationale: route.decision.rationale,
      confirmedBy: route.decision.confirmedBy, confirmedAt: route.decision.confirmedAt } : null,
    alternative: alt ? { id: alt.id, name: alt.name, summary: alt.summary } : null,
    config: config.map(c => ({ id: c.id, group: c.group, name: c.name, model: c.model ?? null, params: c.params ?? null, quantity: c.quantity, unit: c.unit })),
    cost: type === 'full' ? (() => {
      const r = computeCost(v4.costLines, config, v4.costSettings, today)
      return { hash: costHash(state), baseCurrency: r.baseCurrency, total: r.total ?? null, totalDisplay: r.totalDisplay ?? null,
        testData: r.testData, estimates: r.estimates,
        reviews: Object.fromEntries((['cost_draft', 'supplier_verified', 'external_approved'] as const)
          .map(k => [k, reviewStatus(v4.costReviews[k], costHash(state))])),
        lines: r.lines.map(l => ({ id: l.id, name: l.name, quantity: l.quantity, currency: l.currency, unitPrice: l.unitPrice ?? null, amount: l.amount ?? null, priceState: l.priceState })) }
    })() : null,
    docs: docKinds.map(k => reviewedDoc(state, k)).filter((d): d is DocDraft => d !== undefined)
      .map(d => ({ id: d.id, kind: d.kind, title: d.title, revisionNo: d.revisionNo, hash: docHash(d), exportSha256: d.exports.at(-1)?.sha256 ?? null })),
  }
  return JSON.parse(JSON.stringify(snap)) as Record<string, z.core.util.JSONType>
}

interface Snap {
  requirements: { id: string; text: string; priority: string; type: string }[]
  findings: { id: string; statement: string; verification: string }[]
  alternative: { id: string; name: string } | null
  config: { id: string; name: string; model: string | null; params: string | null; quantity: number; unit: string }[]
  cost: { totalDisplay: string | null; baseCurrency: string; lines: { id: string; name: string; quantity: number; unitPrice: string | null; amount: string | null; currency: string }[] } | null
  docs: { id: string; kind: string; title: string; revisionNo: number }[]
}
export interface FieldChange { id: string; name: string; changes: string[] }
interface ListDiff { added: string[]; removed: string[]; changed: FieldChange[] }

function listDiff<T extends { id: string }>(a: readonly T[], b: readonly T[], name: (x: T) => string, fields: (keyof T)[]): ListDiff {
  const before = new Map(a.map(x => [x.id, x]))
  const after = new Map(b.map(x => [x.id, x]))
  const changed: FieldChange[] = []
  for (const [k, y] of after) {
    const x = before.get(k)
    if (!x) continue
    const changes = fields.filter(f => JSON.stringify(x[f]) !== JSON.stringify(y[f])).map(f => `${String(f)}：${String(x[f] ?? '—')} → ${String(y[f] ?? '—')}`)
    if (changes.length) changed.push({ id: k, name: name(y), changes })
  }
  return { added: b.filter(x => !before.has(x.id)).map(name), removed: a.filter(x => !after.has(x.id)).map(name), changed }
}

/** Business-level comparison between two frozen snapshots (older `a` → newer `b`). */
export function diffSnapshots(aRaw: unknown, bRaw: unknown) {
  const a = aRaw as Snap, b = bRaw as Snap
  return {
    requirements: listDiff(a.requirements, b.requirements, r => r.text, ['text', 'priority', 'type']),
    route: a.alternative?.id === b.alternative?.id ? null : { from: a.alternative?.name ?? null, to: b.alternative?.name ?? null },
    config: listDiff(a.config, b.config, c => c.name, ['name', 'model', 'params', 'quantity', 'unit']),
    cost: a.cost || b.cost ? {
      totalFrom: a.cost?.totalDisplay ?? null, totalTo: b.cost?.totalDisplay ?? null,
      lines: listDiff(a.cost?.lines ?? [], b.cost?.lines ?? [], l => l.name, ['quantity', 'unitPrice', 'currency', 'amount']),
    } : null,
    findings: listDiff(a.findings, b.findings, f => f.statement, ['statement', 'verification']),
    docs: listDiff(a.docs, b.docs, d => d.title, ['title', 'revisionNo']),
  }
}

export class BaselineService extends V4Base {
  checks(projectId: string, type: BaselineType) { return baselineChecks(this.ctx.state(projectId), type, this.today()) }
  list(projectId: string): Baseline[] { return [...this.v4(projectId).baselines].sort((x, y) => x.number - y.number) }
  get(projectId: string, baselineId: string): Baseline {
    const b = this.v4(projectId).baselines.find(x => x.id === baselineId)
    ensure(b, 'RECORD_NOT_FOUND', '版本不存在。')
    return b
  }

  /** Gated publish. The snapshot is frozen at review time; a later state change aborts the commit. */
  async publish(projectId: string, input: unknown): Promise<Baseline> {
    const data = publishInput.parse(input)
    const state = this.ctx.state(projectId)
    const blockers = baselineChecks(state, data.type, this.today())
    ensure(!blockers.length, 'PUBLISH_BLOCKED', blockers.join(' '))
    const snapshot = buildSnapshot(state, data.type, this.today())
    const snapshotHash = hashOf(snapshot)
    const number = v4Of(state).baselines.reduce((n, b) => Math.max(n, b.number), 0) + 1
    const label = data.label ?? `V${number}`
    const { revision, review } = await this.ctx.review(projectId, 'v4_baseline_publish',
      { type: data.type, label, number, note: data.note, snapshotHash, summary: {
        requirements: (snapshot.requirements as unknown[]).length, config: (snapshot.config as unknown[]).length,
        alternative: (snapshot.alternative as { name?: string } | null)?.name ?? null } })
    const row: Baseline = { ...this.ctx.fields(projectId), number, label, type: data.type, review, snapshotHash, snapshot }
    await this.mutate(projectId, s => {
      this.ctx.assertFresh(s, revision)
      ensure(hashOf(buildSnapshot(s, data.type, this.today())) === snapshotHash, 'STALE_CONTEXT', '项目数据在审核期间已变化，请重新发布。')
      ensure(!s.v4.baselines.some(b => b.number === number), 'STALE_CONTEXT', '版本号已被占用，请重新发布。')
      s.v4.baselines.push(row)
    })
    return row
  }

  diff(projectId: string, aId: string, bId: string) {
    const a = this.get(projectId, aId), b = this.get(projectId, bId)
    return { from: { id: a.id, label: a.label, type: a.type }, to: { id: b.id, label: b.label, type: b.type }, ...diffSnapshots(a.snapshot, b.snapshot) }
  }
}
