/** 成本与报价: deterministic BOM cost lines, settings/FX, cost result and three independent cost reviews. */
import { useState } from 'react'
import { del, patch, post, pp, put } from '../api.ts'
import { Icon } from '../icons.tsx'
import { useStore } from '../store.tsx'
import type { CostKind, CostLine, CostResultLine, CostSettings } from '../types.ts'
import { Badge, Btn, Drawer, Empty, Field, Modal, PageHead, Panel, REVIEW, fmtTime } from '../ui.tsx'

export const CATEGORY: Record<string, string> = {
  equipment: '设备', installation: '安装', integration: '集成', service: '服务', spare: '备件', other: '其他',
}
const SOURCE: Record<string, string> = {
  supplier_quote: '供应商报价', catalog: '目录价', historical: '历史价', internal_estimate: '内部估算', test_data: '测试价格（非真实）', none: '未定价',
}
const PRICE_STATE: Record<CostResultLine['priceState'], [string, 'teal' | 'warn' | 'red' | 'gray']> = {
  quoted: ['有来源', 'teal'], estimate: ['估算', 'warn'], test: ['测试价格', 'red'], missing: ['缺价格', 'gray'],
}
export const COST_KIND: Record<CostKind, [string, string]> = {
  cost_draft: ['成本草稿审核', '确认 BOM 与数量、计算口径正确；路线需已确认。'],
  supplier_verified: ['供应商报价已核验', '所有价格均来自有效的供应商报价或目录价，无估算、测试价或过期报价。'],
  external_approved: ['对外报价已批准', '允许对外报价；需要可计算的合计（币种与汇率完整）。'],
}
const blankLine = {
  category: 'equipment', name: '', unit: '套', quantityMode: 'manual', quantity: '1', factor: '1', unitPrice: '', currency: 'CNY',
  sourceType: 'none', supplier: '', quoteDate: '', validUntil: '', applicableQty: '', reference: '', note: '',
}
function LineDrawer({ line, open, onClose }: { line: CostLine | undefined; open: boolean; onClose: () => void }) {
  const { ov, pid, act } = useStore()
  const [f, setF] = useState(blankLine)
  const [cfg, setCfg] = useState<string[]>([])
  const [tax, setTax] = useState(false)
  const [key, setKey] = useState<string>()
  const k = open ? line?.id ?? 'new' : undefined
  if (k !== key) {
    setKey(k)
    if (open) {
      setF(line ? { ...blankLine, ...Object.fromEntries(Object.keys(blankLine).map(n => [n, String((line as unknown as Record<string, unknown>)[n] ?? '')])) } : blankLine)
      setCfg(line?.configItemIds ?? []); setTax(Boolean(line?.taxIncluded))
    }
  }
  const set = (n: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [n]: e.target.value })
  const int = (s: string) => /^\d+$/.test(s.trim()) && Number.isSafeInteger(Number(s))
  const follow = f.quantityMode === 'follow_config'
  const reason = !f.name.trim() ? '请填写名称' : !f.unit.trim() ? '请填写单位'
    : !follow && !int(f.quantity) ? '数量必须是非负整数' : !int(f.factor) || Number(f.factor) < 1 ? '系数必须是 ≥1 的整数'
    : follow && !cfg.length ? '跟随配置数量时必须关联配置项'
    : f.unitPrice.trim() && !/^\d{1,13}(\.\d{1,4})?$/.test(f.unitPrice.trim()) ? '单价必须为非负数，最多 4 位小数'
    : !/^[A-Z]{3}$/.test(f.currency.trim()) ? '币种使用三位大写代码，如 CNY'
    : f.unitPrice.trim() && f.sourceType === 'none' ? '填写单价时必须选择价格来源'
    : f.sourceType === 'supplier_quote' && (!f.reference.trim() || !f.quoteDate) ? '供应商报价需填写报价单号与报价日期' : ''
  const save = async () => {
    const body: Record<string, unknown> = { quantity: follow ? 0 : Number(f.quantity), factor: Number(f.factor), configItemIds: cfg, taxIncluded: tax }
    for (const [n, v] of Object.entries(f)) if (!['quantity', 'factor'].includes(n) && v.trim()) body[n] = v.trim()
    const out = await act(() => line ? patch(pp(pid!, `cost-lines/${encodeURIComponent(line.id)}`), body) : post(pp(pid!, 'cost-lines'), body),
      '成本行已保存；依赖的成本审核与文档审核已失效')
    if (out !== undefined) onClose()
  }
  const items = ov!.v4.configItems.filter(i => i.status === 'active')
  return (
    <Drawer open={open} title={line ? '编辑成本行' : '新增成本行'} cap="金额由系统按 数量 × 系数 × 单价 确定性计算" onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} showReason onClick={save}>保存</Btn></>}>
      <div className="form-two">
        <Field label="类别"><select className="option-select" value={f.category} onChange={set('category')}>
          {Object.entries(CATEGORY).map(([n, v]) => <option key={n} value={n}>{v}</option>)}</select></Field>
        <Field label="名称 *"><input className="text-field" value={f.name} onChange={set('name')} /></Field>
        <Field label="数量来源"><select className="option-select" value={f.quantityMode} onChange={set('quantityMode')}>
          <option value="manual">手工填写</option><option value="follow_config">跟随配置数量</option></select></Field>
        <Field label="单位 *"><input className="text-field" value={f.unit} onChange={set('unit')} /></Field>
        <Field label="数量 *"><input className="num-input" type="number" min={0} step={1} disabled={follow} value={follow ? '' : f.quantity} onChange={set('quantity')} placeholder={follow ? '按关联配置合计' : ''} /></Field>
        <Field label="系数" hint="例如每套 2 个"><input className="num-input" type="number" min={1} step={1} value={f.factor} onChange={set('factor')} /></Field>
      </div>
      <div className="fieldcap">关联配置项{follow ? ' *' : ''}</div>
      {items.length ? items.map(i => (
        <label key={i.id} className="check-row"><input type="checkbox" checked={cfg.includes(i.id)} onChange={() => setCfg(cfg.includes(i.id) ? cfg.filter(x => x !== i.id) : [...cfg, i.id])} />
          <span>{i.name} · {i.quantity} {i.unit}</span></label>)) : <div className="tiny-caption">暂无有效配置项。</div>}
      <div className="form-two">
        <Field label="单价"><input className="text-field" inputMode="decimal" value={f.unitPrice} onChange={set('unitPrice')} placeholder="留空表示缺价格" /></Field>
        <Field label="币种"><input className="text-field" value={f.currency} onChange={e => setF({ ...f, currency: e.target.value.toUpperCase() })} /></Field>
        <Field label="价格来源"><select className="option-select" value={f.sourceType} onChange={set('sourceType')}>
          {Object.entries(SOURCE).map(([n, v]) => <option key={n} value={n}>{v}</option>)}</select></Field>
        <Field label="供应商"><input className="text-field" value={f.supplier} onChange={set('supplier')} /></Field>
        <Field label="报价日期"><input className="text-field" type="date" value={f.quoteDate} onChange={set('quoteDate')} /></Field>
        <Field label="有效期至"><input className="text-field" type="date" value={f.validUntil} onChange={set('validUntil')} /></Field>
        <Field label="报价单号 / 附件"><input className="text-field" value={f.reference} onChange={set('reference')} /></Field>
        <Field label="适用数量"><input className="text-field" value={f.applicableQty} onChange={set('applicableQty')} placeholder="例如 10–50 套" /></Field>
      </div>
      <label className="check-row"><input type="checkbox" checked={tax} onChange={e => setTax(e.target.checked)} /><span>单价已含税</span></label>
      <Field label="备注"><input className="text-field" value={f.note} onChange={set('note')} /></Field>
      {f.sourceType === 'test_data' ? <div className="reconcile-note"><Icon name="shield" /> 测试价格仅用于演示计算，不代表真实报价；含测试价格时不能通过“供应商报价已核验”。</div> : null}
    </Drawer>
  )
}
const DEC = /^\d{1,9}(\.\d{1,6})?$/
const PCT = /^\d{1,3}(\.\d{1,4})?$/

function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ov, pid, act } = useStore()
  const cur = ov!.v4.costSettings
  const [base, setBase] = useState('CNY')
  const [cont, setCont] = useState('0')
  const [taxPct, setTaxPct] = useState('')
  const [taxNote, setTaxNote] = useState('')
  const [fx, setFx] = useState<CostSettings['fxRates']>([])
  const [was, setWas] = useState(false)
  if (open !== was) {
    setWas(open)
    if (open) {
      setBase(cur?.baseCurrency ?? 'CNY'); setCont(cur?.contingencyPct ?? '0'); setTaxPct(cur?.taxPct ?? ''); setTaxNote(cur?.taxNote ?? '')
      setFx(cur?.fxRates.map(r => ({ ...r })) ?? [])
    }
  }
  const setRow = (i: number, k: keyof CostSettings['fxRates'][number], v: string) => setFx(fx.map((r, j) => j === i ? { ...r, [k]: k === 'currency' ? v.toUpperCase() : v } : r))
  const badFx = fx.findIndex(r => !/^[A-Z]{3}$/.test(r.currency) || !DEC.test(r.rate) || !/^\d{4}-\d{2}-\d{2}$/.test(r.asOf) || !r.source.trim())
  const reason = !/^[A-Z]{3}$/.test(base) ? '本位币使用三位大写代码' : !PCT.test(cont) ? '不可预见费比例格式不正确'
    : taxPct && !PCT.test(taxPct) ? '税率格式不正确' : badFx >= 0 ? `第 ${badFx + 1} 行汇率不完整（币种、汇率、日期、来源均必填）`
    : new Set(fx.map(r => r.currency)).size !== fx.length ? '汇率币种重复' : ''
  const save = async () => {
    const out = await act(() => put(pp(pid!, 'cost-settings'), {
      baseCurrency: base, contingencyPct: cont, ...taxPct ? { taxPct } : {}, ...taxNote.trim() ? { taxNote: taxNote.trim() } : {},
      fxRates: fx.map(r => ({ ...r, source: r.source.trim() })),
    }), '成本口径已保存；成本审核已失效')
    if (out !== undefined) onClose()
  }
  return (
    <Modal open={open} wide title="成本口径与汇率" subtitle="汇率由人工填写并注明来源与日期；缺少汇率的外币不会被折算，此时不出合计。" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} showReason onClick={save}>保存</Btn></>}>
      <div className="form-two">
        <Field label="本位币"><input className="text-field" value={base} onChange={e => setBase(e.target.value.toUpperCase())} /></Field>
        <Field label="不可预见费（%）"><input className="text-field" inputMode="decimal" value={cont} onChange={e => setCont(e.target.value)} /></Field>
        <Field label="税率（%，可选）"><input className="text-field" inputMode="decimal" value={taxPct} onChange={e => setTaxPct(e.target.value)} /></Field>
        <Field label="税务说明"><input className="text-field" value={taxNote} onChange={e => setTaxNote(e.target.value)} /></Field>
      </div>
      <div className="fieldcap">汇率（1 外币 = ? {base}）</div>
      {fx.map((r, i) => (
        <div key={i} className="form-two" style={{ gridTemplateColumns: '90px 1fr 150px 1fr auto' }}>
          <input className="text-field" aria-label="币种" placeholder="USD" value={r.currency} onChange={e => setRow(i, 'currency', e.target.value)} />
          <input className="text-field" aria-label="汇率" inputMode="decimal" placeholder="7.1" value={r.rate} onChange={e => setRow(i, 'rate', e.target.value)} />
          <input className="text-field" aria-label="日期" type="date" value={r.asOf} onChange={e => setRow(i, 'asOf', e.target.value)} />
          <input className="text-field" aria-label="来源" placeholder="来源，如 财务部牌价" value={r.source} onChange={e => setRow(i, 'source', e.target.value)} />
          <button type="button" className="mini-action" onClick={() => setFx(fx.filter((_, j) => j !== i))}>删除</button>
        </div>))}
      <Btn small kind="ghost" onClick={() => setFx([...fx, { currency: '', rate: '', asOf: '', source: '' }])}><Icon name="plus" />添加汇率</Btn>
    </Modal>
  )
}

function ReviewCard({ kind }: { kind: CostKind }) {
  const { ov, run, active } = useStore()
  const [open, setOpen] = useState(false)
  const [ack, setAck] = useState(false)
  const [note, setNote] = useState('')
  const status = ov!.cost.reviews[kind]
  const checks = ov!.cost.checks[kind]
  const rec = ov!.v4.costReviews[kind]
  const [label, desc] = COST_KIND[kind]
  const submit = async () => {
    const ex = await run('marketpilot_v4_cost_review', { input: { kind, ...note.trim() ? { note: note.trim() } : {} } }, { ok: `${label}已记录` })
    if (ex?.status === 'completed') { setOpen(false); setAck(false); setNote('') }
  }
  const tone = REVIEW[status]![1]
  return (
    <div className="stack-card" style={{ padding: 18 }}>
      <div className="panel-heading"><div><h3>{label}</h3><p>{desc}</p></div>
        <Badge tone={tone === 'warn' ? 'warn' : tone === 'teal' ? 'teal' : tone === 'red' ? 'red' : 'gray'}>{status === 'stale' ? '已失效' : REVIEW[status]![0]}</Badge></div>
      {rec ? <div className="tiny-caption">{rec.review.reviewer} · {fmtTime(rec.review.reviewedAt)}{rec.review.reason ? ` · ${rec.review.reason}` : ''}
        {status === 'stale' ? '（输入已变化，需重新审核）' : ''}</div> : null}
      {checks.length ? <div className="review-list">{checks.map(c => <div key={c} className="tiny-caption">· {c}</div>)}</div>
        : <div className="tiny-caption">前置检查已通过。</div>}
      <div className="actions" style={{ marginTop: 10 }}>
        <Btn small kind={status === 'valid' ? 'ghost' : 'primary'} showReason onClick={() => setOpen(true)}
          disabled={checks.length ? '前置检查未通过' : active ? '已有运行进行中' : ''}><Icon name="shield" />{status === 'valid' ? '重新审核' : '人工审核'}</Btn>
      </div>
      <Modal open={open} title={label} subtitle="审核绑定当前成本数据的指纹；之后任何成本输入变化都会使本审核失效。需要在 Human Gate 中再次确认。" onClose={() => setOpen(false)}
        actions={<><Btn kind="ghost" onClick={() => setOpen(false)}>取消</Btn><Btn kind="primary" disabled={!ack ? '请勾选确认' : active ? '已有运行进行中' : ''} onClick={submit}>确认审核</Btn></>}>
        <div className="boxnote">{desc}</div>
        <div className="tiny-caption">当前合计：{ov!.cost.result.totalDisplay ?? '无合计'} · 指纹 {ov!.cost.hash.slice(0, 12)}</div>
        <label className="check-row"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>我已逐行核对数量、单价与来源，并对该审核结论负责。</span></label>
        <Field label="审核说明"><textarea className="text-field" rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
      </Modal>
    </div>
  )
}
const BAR_COLORS = ['#3064DF', '#11A5A4', '#E3A33B', '#7A68D8', '#D9644F', '#8194AA']

export function CostPage() {
  const { ov, pid, act } = useStore()
  const [edit, setEdit] = useState<CostLine | 'new'>()
  const [drop, setDrop] = useState<CostLine>()
  const [settings, setSettings] = useState(false)
  if (!ov || !pid) return <Empty>正在加载项目…</Empty>
  const r = ov.cost.result
  const byId = new Map(ov.v4.costLines.map(l => [l.id, l]))
  const remove = async () => {
    if (!drop) return
    const out = await act(() => del(pp(pid, `cost-lines/${encodeURIComponent(drop.id)}`)), '成本行已删除；成本审核已失效')
    if (out !== undefined) setDrop(undefined)
  }
  return (
    <>
      <PageHead eyebrow="成本与报价" title="BOM 成本与报价"
        lede="金额由系统确定性计算，不由 AI 生成。价格必须注明来源；测试价格、估算与过期报价会被标出，多币种缺汇率时不出合计。"
        actions={<><Btn kind="ghost" onClick={() => setSettings(true)}><Icon name="coins" />口径与汇率</Btn>
          <Btn kind="primary" onClick={() => setEdit('new')}><Icon name="plus" />新增成本行</Btn></>} />
      {r.testData ? <div className="reconcile-note"><Icon name="shield" /> 当前包含 {r.testData} 行测试价格（非真实报价），仅用于演示计算，不能用于对外报价。</div> : null}
      <div className="dual-grid">
        <Panel title={`成本明细（${r.lines.length}）`}>
          {r.lines.length ? <div className="table-scroll"><table className="data-table">
            <thead><tr><th>成本项</th><th>类别</th><th>数量</th><th>单价</th><th>金额</th><th>价格状态</th><th /></tr></thead>
            <tbody>{r.lines.map(l => {
              const src = byId.get(l.id)
              return (
                <tr key={l.id}>
                  <td className="main-cell"><strong>{l.name}</strong>
                    <small>{src ? [SOURCE[src.sourceType] ?? src.sourceType, src.supplier, src.quantityMode === 'follow_config' ? '跟随配置' : ''].filter(Boolean).join(' · ') : ''}</small>
                    {l.warnings.map(w => <div key={w} className="tiny-caption">⚠ {w}</div>)}</td>
                  <td>{CATEGORY[l.category] ?? l.category}</td>
                  <td>{l.quantity}{src ? ` ${src.unit}` : ''}{src && src.factor > 1 ? ` × ${src.factor}` : ''}</td>
                  <td className="money">{l.unitPrice ? `${l.unitPrice} ${l.currency}` : '—'}</td>
                  <td className="money">{l.amountDisplay ?? '—'}</td>
                  <td><Badge tone={PRICE_STATE[l.priceState][1]}>{PRICE_STATE[l.priceState][0]}</Badge></td>
                  <td>{src ? <><button type="button" className="mini-action" onClick={() => setEdit(src)}>编辑</button>
                    <button type="button" className="mini-action" onClick={() => setDrop(src)}>删除</button></> : null}</td>
                </tr>)
            })}</tbody></table></div> : <Empty>暂无成本行。可新增设备、安装、集成、服务等成本行；数量可跟随方案配置。</Empty>}
          {r.categories.length ? <>
            <div className="cost-bars">{r.categories.map((c, i) => <div key={c.category} title={`${CATEGORY[c.category] ?? c.category} ${c.display}`} style={{ width: `${c.share.toFixed(2)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }} />)}</div>
            <div className="cost-legend">{r.categories.map((c, i) => <span key={c.category} style={{ ['--dot' as string]: BAR_COLORS[i % BAR_COLORS.length] }}>{CATEGORY[c.category] ?? c.category} {c.share.toFixed(1)}%</span>)}</div>
            <div className="tiny-caption">类别占比按本位币折算后计算。</div></> : null}
        </Panel>
        <div className="right-panel-stack">
          <div className="price-strip">
            <small>合计（{r.baseCurrency}）</small>
            <div className="amount">{r.totalDisplay ?? '无合计'}</div>
            {r.subtotals.map(s => <div key={s.currency} className="note">{s.currency} 小计 {s.display}{s.rate ? ` · 汇率 ${s.rate}` : ''}</div>)}
            {r.contingency ? <div className="note">不可预见费 {r.contingency}</div> : null}
            {r.tax ? <div className="note">税金 {r.tax}</div> : null}
            {[...r.blockers, ...r.missingFx.map(c => `缺少 ${c} → ${r.baseCurrency} 汇率`)].map(b => <div key={b} className="note">⚠ {b}</div>)}
          </div>
          <Panel title="价格可信度">
            <div className="dtl-row"><div><strong>缺价格</strong></div><Badge tone={r.missingPrices ? 'gray' : 'teal'}>{r.missingPrices}</Badge></div>
            <div className="dtl-row"><div><strong>估算价格</strong></div><Badge tone={r.estimates ? 'warn' : 'teal'}>{r.estimates}</Badge></div>
            <div className="dtl-row"><div><strong>测试价格（非真实）</strong></div><Badge tone={r.testData ? 'red' : 'teal'}>{r.testData}</Badge></div>
            <div className="dtl-row"><div><strong>过期报价</strong></div><Badge tone={r.expiredQuotes ? 'red' : 'teal'}>{r.expiredQuotes}</Badge></div>
          </Panel>
        </div>
      </div>
      <div className="section-spacer" />
      <Panel title="三项独立成本审核" extra={<span className="tiny-caption">任一成本输入、配置或路线变化都会使已有审核失效</span>}>
        <div className="route-grid">{(Object.keys(COST_KIND) as CostKind[]).map(k => <ReviewCard key={k} kind={k} />)}</div>
      </Panel>
      <LineDrawer open={Boolean(edit)} line={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} />
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <Modal open={Boolean(drop)} title="删除成本行" subtitle="删除后不可恢复；已发布的正式版本不受影响，但当前成本审核会失效。" onClose={() => setDrop(undefined)}
        actions={<><Btn kind="ghost" onClick={() => setDrop(undefined)}>取消</Btn><Btn kind="primary" onClick={remove}>确认删除</Btn></>}>
        <div className="boxnote">{drop?.name}</div>
      </Modal>
    </>
  )
}
