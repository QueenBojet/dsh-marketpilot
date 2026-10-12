/** 文档与交付: deterministic section drafts, per-section proposals, bound review, DOCX export and sent records. */
import { z } from 'zod'
import { ensure, id, text } from '../../domain/common.ts'
import type { DocDraft, DocSectionState } from '../../domain/v4.ts'
import type { ProjectState } from '../../domain/state.ts'
import { hashOf, sha256 } from '../../domain/v4-text.ts'
import { computeCost } from '../../domain/cost.ts'
import { defaultTemplate, inspectTemplate, renderDocx } from '../../render/docx.ts'
import type { DocBlock, DocSection } from '../../render/docx.ts'
import { V4RunBase, docHash, errorText, reviewStatus, routeState, truncate, v4Of } from './base.ts'
import type { ReviewStatus, RunDeps } from './base.ts'

export type DocKind = DocDraft['kind']
export const docCreateInput = z.strictObject({
  kind: z.enum(['technical', 'cost', 'change_summary']), title: text.max(200).optional(), templateId: id.optional(),
})
export const docPatch = z.strictObject({ title: text.max(200).optional(), templateId: id.nullable().optional() })
export const sectionEditInput = z.strictObject({ content: z.string().max(100_000) })
export const proposalDecisionInput = z.strictObject({ keys: z.array(z.string()).min(1).max(40), accept: z.boolean() })
export const sectionRevisionInput = z.strictObject({ key: z.string(), instruction: text.max(2000) })
export const templateInput = z.strictObject({ name: text.max(200), fileName: text.max(255), dataBase64: z.string().min(1).max(4_000_000) })
export const sentInput = z.strictObject({ recipient: text.max(200), channel: text.max(100), note: z.string().trim().max(1000).optional() })
const revisionOutput = z.strictObject({ content: z.string().min(1).max(60_000), reason: text.max(400) })

const KIND_TITLES: Record<DocKind, string> = { technical: '技术方案', cost: '成本与报价说明', change_summary: '变更说明' }
const PRIORITY: Record<string, string> = { must: '必须', should: '应当', could: '可选' }
const CATEGORY: Record<string, string> = { equipment: '设备', installation: '安装', integration: '集成', service: '服务', spare: '备件', other: '其他' }
const PRICE: Record<string, string> = { quoted: '报价', estimate: '估算', test: '测试数据', missing: '缺价' }
const cell = (value: string | undefined) => (value ?? '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim() || '—'
const row = (cells: readonly (string | undefined)[]) => `| ${cells.map(cell).join(' | ')} |`
const table = (header: readonly string[], rows: readonly (readonly (string | undefined)[])[]) =>
  rows.length ? [row(header), ...rows.map(row)].join('\n') : '> 暂无数据。'

/**
 * Section content uses a small line-based markup that maps 1:1 to DOCX blocks:
 * `## ` / `### ` headings, `- ` bullets, `> ` notes, `| a | b |` table rows, other lines paragraphs.
 */
export function contentToBlocks(content: string): DocBlock[] {
  const blocks: DocBlock[] = []
  let bullets: string[] = []
  let rows: string[][] = []
  const flush = () => {
    if (bullets.length) blocks.push({ kind: 'bullets', items: bullets })
    if (rows.length) blocks.push({ kind: 'table', header: rows[0]!, rows: rows.slice(1) })
    bullets = []; rows = []
  }
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.startsWith('|') && line.endsWith('|') && line.length > 1) {
      if (bullets.length) { blocks.push({ kind: 'bullets', items: bullets }); bullets = [] }
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      if (!cells.every(c => /^:?-{3,}:?$/.test(c))) rows.push(cells)
      continue
    }
    if (/^[-*] /.test(line)) { if (rows.length) flush(); bullets.push(line.slice(2).trim()); continue }
    flush()
    if (!line) continue
    if (line.startsWith('### ')) blocks.push({ kind: 'heading', level: 3, text: line.slice(4) })
    else if (line.startsWith('## ')) blocks.push({ kind: 'heading', level: 2, text: line.slice(3) })
    else if (line.startsWith('> ')) blocks.push({ kind: 'note', text: line.slice(2) })
    else blocks.push({ kind: 'paragraph', text: line })
  }
  flush()
  return blocks
}
interface SectionDraft { key: string; title: string; content: string }

function requirementsSection(state: ProjectState): SectionDraft {
  const reqs = state.requirements.filter(r => r.status !== 'superseded')
  const confirmed = reqs.filter(r => r.status === 'confirmed')
  const open = reqs.filter(r => r.status !== 'confirmed')
  return { key: 'requirements', title: '需求概述', content: [
    `已确认需求 ${confirmed.length} 条${open.length ? `，另有 ${open.length} 条未确认（不计入方案依据）` : ''}。`,
    table(['编号', '优先级', '需求', '来源'], confirmed.map((r, i) => [`R${i + 1}`, PRIORITY[r.priority], r.normalizedText, r.sourceLocator])),
    ...open.length ? ['## 待确认事项', ...open.map(r => `- （${r.status}）${truncate(r.normalizedText, 300)}`)] : [],
  ].join('\n') }
}

function researchSection(state: ProjectState): SectionDraft {
  const adopted = v4Of(state).findings.filter(f => f.adoption === 'adopted')
  const verify = (v: string) => v === 'verified' ? '来源已核实' : v === 'disputed' ? '来源有争议' : '来源未核实'
  return { key: 'research', title: '研究结论', content: [
    adopted.length ? `采纳的研究发现 ${adopted.length} 条。` : '> 尚无人工采纳的研究发现。',
    ...adopted.map(f => `- ${f.statement}${f.conditions ? `（适用条件：${f.conditions}）` : ''}【${verify(f.verification)}】`),
    ...adopted.some(f => f.verification !== 'verified') ? ['> 标记为“来源未核实”的结论尚未经人工回溯原始资料，引用前需核实。'] : [],
  ].join('\n') }
}

function routeSection(state: ProjectState): SectionDraft {
  const route = routeState(state)
  const alt = state.alternatives.find(a => a.id === route.draftAlternativeId)
  const others = state.alternatives.filter(a => a.id !== alt?.id && a.status !== 'draft')
  const lines: string[] = []
  if (!alt) lines.push('> 尚未选择技术路线。')
  else {
    lines.push(`推荐路线：${alt.name}。${alt.summary}`)
    lines.push(route.confirmed && route.decision
      ? `该路线已由 ${route.decision.confirmedBy} 于 ${route.decision.confirmedAt.slice(0, 10)} 确认：${route.decision.decision}`
      : '> 当前路线为草稿，尚未经人工确认。')
    if (route.confirmed && route.decision) lines.push(`决策理由：${route.decision.rationale}`)
    lines.push('## 主要组成', ...alt.components.map(c => `- ${c}`))
    if (alt.strengths.length) lines.push('## 优势', ...alt.strengths.map(c => `- ${c}`))
    if (alt.limitations.length || alt.risks.length) lines.push('## 局限与风险', ...[...alt.limitations, ...alt.risks].map(c => `- ${c}`))
    if (alt.unknowns.length) lines.push('## 待确认', ...alt.unknowns.map(c => `- ${c}`))
  }
  if (others.length) lines.push('## 比较过的其他路线', ...others.map(a => `- ${a.name}（${a.status === 'rejected' ? '已否决' : '备选'}）：${truncate(a.summary, 200)}`))
  return { key: 'route', title: '技术路线与决策', content: lines.join('\n') }
}
function configSection(state: ProjectState): SectionDraft {
  const items = v4Of(state).configItems.filter(c => c.status === 'active')
  return { key: 'config', title: '系统配置', content: [
    items.length ? `配置项 ${items.length} 项。` : '> 尚无配置项。',
    table(['分组', '名称', '型号', '关键参数', '数量', '接口', '安装'], items.map(c => [c.group, c.name, c.model, c.params, `${c.quantity} ${c.unit}`, c.interface, c.installation])),
  ].join('\n') }
}

function costSection(state: ProjectState, today: string): SectionDraft {
  const v4 = v4Of(state)
  const r = computeCost(v4.costLines, v4.configItems.filter(c => c.status === 'active'), v4.costSettings, today)
  const lines = [
    table(['类别', '名称', '数量', '币种', '单价', '金额', '价格状态'], r.lines.map(l => [CATEGORY[l.category], l.name, String(l.quantity), l.currency, l.unitPrice, l.amountDisplay, PRICE[l.priceState]])),
    r.totalDisplay ? `合计（${r.baseCurrency}）：${r.totalDisplay}` : '> 无法给出合计：存在缺价或缺少汇率的成本行。',
  ]
  if (r.testData) lines.push(`> 含 ${r.testData} 行测试数据，仅用于演示流程，不构成报价。`)
  if (r.estimates) lines.push(`> 含 ${r.estimates} 行估算价，未经供应商报价核验。`)
  if (r.expiredQuotes) lines.push(`> 含 ${r.expiredQuotes} 行已过期报价。`)
  if (v4.costSettings.taxNote) lines.push(`> 税费说明：${v4.costSettings.taxNote}`)
  return { key: 'cost', title: '成本估算', content: lines.join('\n') }
}

function changesSection(state: ProjectState): SectionDraft {
  const v4 = v4Of(state)
  const handled = v4.changes.filter(c => c.status !== 'pending')
  const STATUS: Record<string, string> = { adopted: '已采纳', ignored: '已忽略', clarify: '待澄清', to_research: '转研究', no_change: '无需变更' }
  const open = v4.impacts.filter(i => i.status === 'open')
  return { key: 'changes', title: '资料变更记录', content: [
    handled.length ? `已处理资料变更 ${handled.length} 条。` : '> 尚无已处理的资料变更。',
    table(['处理', '变更', '来源', '处理人'], handled.map(c => [STATUS[c.status] ?? c.status, c.summary, c.locator, c.review?.reviewer])),
    ...open.length ? ['## 待复核影响', ...open.map(i => `- ${i.note ?? `${i.fromType} → ${i.toType}`}`)] : [],
  ].join('\n') }
}

/** Deterministic sections per document kind; the same state always yields the same text. */
export function buildSections(state: ProjectState, kind: DocKind, today: string): SectionDraft[] {
  if (kind === 'technical') return [requirementsSection(state), researchSection(state), routeSection(state), configSection(state)]
  if (kind === 'cost') return [configSection(state), costSection(state, today)]
  return [changesSection(state), requirementsSection(state), routeSection(state)]
}
const depsOf = (s: SectionDraft) => hashOf({ key: s.key, content: s.content })
export interface DocView {
  readonly doc: DocDraft
  readonly hash: string
  readonly review: ReviewStatus
  /** Sections whose upstream data changed since they were generated. */
  readonly outdated: readonly string[]
  /** Latest export matches the current content. */
  readonly exported: boolean
  readonly sendBlockers: readonly string[]
}

export class DocsService extends V4RunBase {
  private doc(projectId: string, docId: string): DocDraft {
    const doc = this.v4(projectId).docs.find(d => d.id === docId)
    ensure(doc, 'RECORD_NOT_FOUND', '文档不存在。')
    return doc
  }
  view(projectId: string, docId: string): DocView {
    const doc = this.doc(projectId, docId)
    const hash = docHash(doc)
    const fresh = new Map(buildSections(this.ctx.state(projectId), doc.kind, this.today()).map(s => [s.key, depsOf(s)]))
    const outdated = doc.sections.filter(s => fresh.has(s.key) && fresh.get(s.key) !== s.depsHash).map(s => s.key)
    const review = reviewStatus(doc.review, hash)
    const last = doc.exports.at(-1)
    const exported = last?.hash === hash
    const sendBlockers = [...review === 'valid' ? [] : ['文档需先通过人工审核（且审核后未再修改）。'],
      ...exported ? [] : ['需先导出当前版本的 DOCX。'], ...doc.sections.some(s => s.proposal) ? ['仍有未处理的章节建议。'] : []]
    return { doc, hash, review, outdated, exported, sendBlockers }
  }
  list(projectId: string): DocView[] { return this.v4(projectId).docs.map(d => this.view(projectId, d.id)) }

  async create(projectId: string, input: unknown) {
    const data = docCreateInput.parse(input)
    const state = this.ctx.state(projectId)
    if (data.templateId) ensure(v4Of(state).templates.some(t => t.id === data.templateId), 'RECORD_NOT_FOUND', '模板不存在。')
    const now = this.ctx.now()
    const sections: DocSectionState[] = buildSections(state, data.kind, this.today())
      .map(s => ({ ...s, depsHash: depsOf(s), generatedAt: now, editedByHuman: false }))
    const doc: DocDraft = { ...this.ctx.fields(projectId), kind: data.kind, title: data.title ?? `${state.project.name} ${KIND_TITLES[data.kind]}`,
      ...data.templateId ? { templateId: data.templateId } : {}, sections, revisionNo: 1, exports: [], sent: [] }
    await this.mutate(projectId, s => { s.v4.docs.push(doc) })
    return this.view(projectId, doc.id)
  }

  private async edit(projectId: string, docId: string, fn: (doc: DocDraft) => void) {
    await this.mutate(projectId, s => {
      const doc = s.v4.docs.find(d => d.id === docId)
      ensure(doc, 'RECORD_NOT_FOUND', '文档不存在。')
      const before = docHash(doc)
      fn(doc)
      if (docHash(doc) !== before) doc.revisionNo++
      doc.updatedAt = this.ctx.now()
    })
    return this.view(projectId, docId)
  }
  async update(projectId: string, docId: string, input: unknown) {
    const patch = docPatch.parse(input)
    if (patch.templateId) ensure(this.v4(projectId).templates.some(t => t.id === patch.templateId), 'RECORD_NOT_FOUND', '模板不存在。')
    return this.edit(projectId, docId, doc => {
      if (patch.title !== undefined) doc.title = patch.title
      if (patch.templateId === null) delete doc.templateId
      else if (patch.templateId !== undefined) doc.templateId = patch.templateId
    })
  }
  /** Human edit of one section; it is never overwritten by later refreshes, and the review becomes stale via the hash. */
  async editSection(projectId: string, docId: string, key: string, input: unknown) {
    const { content } = sectionEditInput.parse(input)
    return this.edit(projectId, docId, doc => {
      const sec = doc.sections.find(s => s.key === key)
      ensure(sec, 'RECORD_NOT_FOUND', '章节不存在。')
      if (sec.content !== content) { sec.content = content; sec.editedByHuman = true }
    })
  }
  /**
   * Regenerate from current project data. Untouched sections are replaced; human-edited sections
   * only receive a deterministic proposal, so a refresh never silently overwrites human text.
   */
  async refresh(projectId: string, docId: string) {
    const doc = this.doc(projectId, docId)
    const fresh = buildSections(this.ctx.state(projectId), doc.kind, this.today())
    let replaced = 0, proposed = 0
    const view = await this.edit(projectId, docId, d => {
      const now = this.ctx.now()
      for (const next of fresh) {
        const deps = depsOf(next)
        const sec = d.sections.find(s => s.key === next.key)
        if (!sec) { d.sections.push({ ...next, depsHash: deps, generatedAt: now, editedByHuman: false }); replaced++; continue }
        if (sec.depsHash === deps) continue
        sec.depsHash = deps
        sec.generatedAt = now
        if (!sec.editedByHuman) { sec.content = next.content; sec.title = next.title; delete sec.proposal; replaced++ }
        else if (sec.content !== next.content) { sec.proposal = { content: next.content, reason: '项目数据已变化，按最新数据重新生成的章节内容', at: now, origin: 'deterministic' }; proposed++ }
      }
    })
    return { ...view, replaced, proposed }
  }

  /** Accept or reject pending section proposals; accepting is an explicit human edit. */
  async decideProposals(projectId: string, docId: string, input: unknown) {
    const { keys, accept } = proposalDecisionInput.parse(input)
    return this.edit(projectId, docId, doc => {
      for (const key of keys) {
        const sec = doc.sections.find(s => s.key === key)
        ensure(sec?.proposal, 'RECORD_NOT_FOUND', `章节「${key}」没有待处理的建议。`)
        if (accept) {
          sec.content = sec.proposal.content
          // Accepting the regenerated text puts the section back under automatic refresh.
          sec.editedByHuman = sec.proposal.origin === 'ai'
        }
        delete sec.proposal
      }
    })
  }

  /** AI revision of one section, stored only as a proposal for human acceptance. */
  async reviseSection(projectId: string, docId: string, input: unknown, deps: RunDeps) {
    const { key, instruction } = sectionRevisionInput.parse(input)
    const model = this.requireModel(deps)
    const doc = this.doc(projectId, docId)
    const sec = doc.sections.find(s => s.key === key)
    ensure(sec, 'RECORD_NOT_FOUND', '章节不存在。')
    const facts = buildSections(this.ctx.state(projectId), doc.kind, this.today()).find(s => s.key === key)
    const runId = await this.startRun(projectId, 'section_revision', 'local', deps.route)
    const prompt = [
      '你是工程方案文档编辑。按用户指令改写下面的文档章节。只能使用“当前章节”和“项目数据”中已有的事实，不得新增数据、引用、价格或结论。',
      '保留以下行格式：“## ”二级标题、“- ”列表、“> ”提示、“| a | b |”表格。仅输出 JSON {"content": "...", "reason": "..."}。',
      `文档：${doc.title}`, `章节：${sec.title}`, `用户指令：${instruction}`,
      '当前章节：', truncate(sec.content, 30_000), '项目数据（自动生成版本）：', truncate(facts?.content ?? '（无）', 30_000),
    ].join('\n')
    try {
      const out = await model.generate({ prompt, schema: revisionOutput, signal: deps.signal })
      await this.finishRun(projectId, runId, deps.signal, { status: 'completed', note: `章节「${sec.title}」修改建议：${truncate(out.reason, 200)}` }, s => {
        const target = s.v4.docs.find(d => d.id === docId)?.sections.find(x => x.key === key)
        if (target) target.proposal = { content: out.content, reason: out.reason, at: this.ctx.now(), origin: 'ai', runId }
      })
      return { runId, cancelled: deps.signal.aborted, view: this.view(projectId, docId) }
    } catch (error) {
      await this.finishRun(projectId, runId, deps.signal, { status: 'failed', error: errorText(error) })
      throw error
    }
  }

  /** Gated document review bound to the exact content hash; any later edit makes it stale. */
  async review(projectId: string, docId: string, note?: string) {
    const view = this.view(projectId, docId)
    ensure(!view.doc.sections.some(s => s.proposal), 'REVIEW_BLOCKED', '仍有未处理的章节建议，请先接受或拒绝。')
    const { revision, bound } = await this.bound(projectId, 'v4_doc_review',
      { docId, title: view.doc.title, kind: view.doc.kind, revisionNo: view.doc.revisionNo, note, sections: view.doc.sections.map(s => ({ title: s.title, content: truncate(s.content, 4000) })) }, view.hash)
    await this.mutate(projectId, s => {
      this.ctx.assertFresh(s, revision)
      const doc = s.v4.docs.find(d => d.id === docId)
      ensure(doc && docHash(doc) === bound.hash, 'STALE_CONTEXT', '文档在审核期间已变化，请重新审核。')
      doc.review = bound
    })
    return this.view(projectId, docId)
  }

  async uploadTemplate(projectId: string, input: unknown) {
    const data = templateInput.parse(input)
    ensure(/\.docx$/i.test(data.fileName), 'INVALID_TEMPLATE', '模板必须是 .docx 文件。')
    const bytes = new Uint8Array(Buffer.from(data.dataBase64, 'base64'))
    ensure(bytes.byteLength > 0, 'INVALID_TEMPLATE', '模板文件为空。')
    const info = inspectTemplate(bytes)
    const row = { ...this.ctx.fields(projectId), name: data.name, fileName: data.fileName, sha256: sha256(bytes), byteLength: bytes.byteLength,
      dataBase64: Buffer.from(bytes).toString('base64'), placeholders: [...info.placeholders], sectionSlots: [...info.sectionSlots], warnings: [...info.warnings] }
    await this.mutate(projectId, s => { s.v4.templates.push(row) })
    const { dataBase64: _omit, ...meta } = row
    return meta
  }
  templates(projectId: string) { return this.v4(projectId).templates.map(({ dataBase64: _omit, ...meta }) => meta) }
  async removeTemplate(projectId: string, templateId: string) {
    await this.mutate(projectId, s => {
      ensure(s.v4.templates.some(t => t.id === templateId), 'RECORD_NOT_FOUND', '模板不存在。')
      ensure(!s.v4.docs.some(d => d.templateId === templateId), 'TEMPLATE_IN_USE', '仍有文档使用该模板，请先切换模板。')
      s.v4.templates = s.v4.templates.filter(t => t.id !== templateId)
    })
    return { removed: templateId }
  }

  /** Render the current content into real OOXML and record the export against the content hash. */
  async exportDocx(projectId: string, docId: string) {
    const state = this.ctx.state(projectId)
    const view = this.view(projectId, docId)
    const doc = view.doc
    const tpl = doc.templateId ? v4Of(state).templates.find(t => t.id === doc.templateId) : undefined
    ensure(!doc.templateId || tpl, 'RECORD_NOT_FOUND', '文档引用的模板已不存在。')
    const template = tpl ? new Uint8Array(Buffer.from(tpl.dataBase64, 'base64')) : defaultTemplate()
    const sections: DocSection[] = doc.sections.map(s => ({ key: s.key, title: s.title, blocks: contentToBlocks(s.content) }))
    const bytes = renderDocx(template, { sections, values: {
      'doc.title': doc.title, 'doc.revision': `第 ${doc.revisionNo} 版`, 'doc.date': this.today(),
      'doc.review': view.review === 'valid' && doc.review ? `已审核：${doc.review.review.reviewer}` : '未审核草稿',
      'project.name': state.project.name, 'project.customer': state.project.customer ?? '',
    } })
    const fileName = `${doc.title.replace(/[\\/:*?"<>|]/g, '_')}-r${doc.revisionNo}.docx`
    const record = { at: this.ctx.now(), hash: view.hash, fileName, sha256: sha256(bytes), byteLength: bytes.byteLength }
    await this.mutate(projectId, s => { s.v4.docs.find(d => d.id === docId)!.exports.push(record) })
    return { fileName, bytes, sha256: record.sha256, reviewed: view.review === 'valid' }
  }

  /** Gated "sent externally" record: only a reviewed and exported version of the current content. */
  async markSent(projectId: string, docId: string, input: unknown) {
    const data = sentInput.parse(input)
    const view = this.view(projectId, docId)
    ensure(!view.sendBlockers.length, 'REVIEW_BLOCKED', view.sendBlockers.join(' '))
    const exp = view.doc.exports.at(-1)!
    const { revision, review } = await this.ctx.review(projectId, 'v4_doc_sent',
      { docId, title: view.doc.title, ...data, exportSha256: exp.sha256, contentHash: view.hash })
    await this.mutate(projectId, s => {
      this.ctx.assertFresh(s, revision)
      const doc = s.v4.docs.find(d => d.id === docId)!
      ensure(docHash(doc) === view.hash, 'STALE_CONTEXT', '文档在确认期间已变化。')
      doc.sent.push({ review, recipient: data.recipient, channel: data.channel, exportSha256: exp.sha256 })
    })
    return this.view(projectId, docId)
  }
}
