/** 资料与变更: batch upload, light rule hints (1C), human-started deep analysis, change handling and requirements. */
import { useState } from 'react'
import { SupportPanel } from './support.tsx'
import { fileToBase64, patch, post, pp } from '../api.ts'
import { Icon } from '../icons.tsx'
import { useStore } from '../store.tsx'
import type { Batch, Change, Requirement } from '../types.ts'
import { Badge, Btn, Drawer, Empty, Field, Modal, PageHead, Panel, REQ_STATUS, cx, fmtTime } from '../ui.tsx'

const DOC_KINDS: Record<string, string> = {
  customer_requirement: '客户需求', tender: '招标文件', meeting_note: '会议纪要', internal_reference: '内部资料',
  competitor_datasheet: '竞品资料', standard: '标准规范', report: '报告', other: '其他',
}
export const REQ_TYPES: Record<string, string> = {
  functional: '功能', performance: '性能', interface: '接口', environment: '环境', safety: '安全', compliance: '合规',
  installation: '安装', maintenance: '维护', commercial: '商务', constraint: '约束', other: '其他',
}
const PRIORITY: Record<string, string> = { must: '必须', should: '应当', could: '可选' }
const CHANGE_KIND: Record<Change['kind'], [string, 'blue' | 'warn' | 'red' | 'gray']> = {
  added: ['可能新增', 'blue'], modified: ['可能修改', 'warn'], conflict: ['可能冲突', 'red'], background: ['背景信息', 'gray'],
}
const CHANGE_STATUS: Record<Change['status'], string> = {
  pending: '待处理', adopted: '已采纳', ignored: '已忽略', clarify: '待澄清', to_research: '转研究', no_change: '无需变更',
}
const BATCH_STATUS: Record<Batch['status'], string> = { received: '已接收', hinted: '已轻量识别', analyzing: '深度分析中', analyzed: '已深度分析', failed: '分析失败' }
const ACCEPT = '.md,.txt,.csv,.docx,.xlsx,.pdf'

function UploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pid, act } = useStore()
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [on, setOn] = useState('')
  const [kind, setKind] = useState('customer_requirement')
  const [files, setFiles] = useState<File[]>([])
  const submit = async () => {
    const payload = await Promise.all(files.map(async f => ({ name: f.name, kind, dataBase64: await fileToBase64(f) })))
    const out = await act(() => post<{ changes: number; duplicates: string[] }>(pp(pid!, 'intake'), {
      label: label.trim(), ...note.trim() ? { sourceNote: note.trim() } : {}, ...on ? { receivedOn: on } : {}, files: payload,
    }))
    if (out) { setFiles([]); setLabel(''); setNote(''); onClose() }
  }
  const reason = !label.trim() ? '请填写批次名称' : !files.length ? '请选择文件' : files.length > 20 ? '单批最多 20 个文件' : ''
  return (
    <Modal open={open} title="上传一批资料" onClose={onClose}
      subtitle={`支持 ${ACCEPT.replaceAll(',', ' ')}。上传保留原文；请精选必要信息并人工固化为结构化支撑摘要。`}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} onClick={submit}>上传资料</Btn></>}>
      <Field label="批次名称 *"><input className="text-field" value={label} onChange={e => setLabel(e.target.value)} placeholder="例如：客户第二轮技术澄清" /></Field>
      <div className="form-two">
        <Field label="资料类型"><select className="text-field" value={kind} onChange={e => setKind(e.target.value)}>
          {Object.entries(DOC_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="收到日期"><input className="text-field" type="date" value={on} onChange={e => setOn(e.target.value)} /></Field>
      </div>
      <Field label="来源说明" hint="例如：客户邮件 / 会议 / 招标平台。便于追溯。"><input className="text-field" value={note} onChange={e => setNote(e.target.value)} /></Field>
      <Field label="文件"><input type="file" multiple accept={ACCEPT} onChange={e => setFiles(Array.from(e.target.files ?? []))} /></Field>
      {files.length ? <div className="tiny-caption">{files.map(f => `${f.name}（${Math.ceil(f.size / 1024)} KB）`).join('、')}</div> : null}
    </Modal>
  )
}

function BatchCard({ b }: { b: Batch }) {
  const { ov, run, active } = useStore()
  const model = ov!.capabilities.model
  const pending = ov!.v4.changes.filter(c => c.batchId === b.id && c.status === 'pending').length
  const h = b.hint
  return (
    <div className="change-card">
      <span className="circle-icon"><Icon name="upload" /></span>
      <div className="grow">
        <h3>{b.label} <Badge tone={b.status === 'failed' ? 'red' : b.status === 'analyzed' ? 'teal' : 'blue'}>{BATCH_STATUS[b.status]}</Badge></h3>
        <p>{b.documentIds.length} 个文件 · {fmtTime(b.createdAt)}{b.receivedOn ? ` · 收到于 ${b.receivedOn}` : ''}{b.sourceNote ? ` · 来源：${b.sourceNote}` : ''}<br />
          {h && b.status !== 'received' ? `历史提示：可能新增 ${h.added} · 可能修改 ${h.modified} · 可能冲突 ${h.conflict} · 背景 ${h.background}。` : ''}
          {pending ? ` 尚有 ${pending} 条待处理。` : ''}</p>
        {h?.duplicates.length ? <div className="tiny-caption">重复未导入：{h.duplicates.join('；')}</div> : null}
        {[...(h?.notes ?? []), ...b.warnings].map(n => <div key={n} className="tiny-caption">· {n}</div>)}
        {b.error ? <div className="tiny-caption" style={{ color: '#b91c1c' }}>失败原因：{b.error}</div> : null}
        {b.status !== 'received' && !ov!.v4.discovery ? <div className="actions" style={{ marginTop: 10 }}>
          <Btn small kind="primary" onClick={() => run('marketpilot_v4_intake_deep_analyze', { batchId: b.id }, { ok: '深度分析完成，请逐条审阅候选变更' }).then(() => {})}
            disabled={!model.available ? `模型不可用：${model.reason}` : b.status === 'analyzing' ? '正在分析' : active ? '已有运行进行中' : !b.documentIds.length ? '本批次无新文档' : ''} showReason>
            <Icon name="spark" />{b.status === 'analyzed' ? '重新深度分析' : '启动深度分析'}</Btn>
        </div> : null}
      </div>
    </div>
  )
}
type ChangeAction = 'adopt' | 'ignore' | 'clarify' | 'to_research' | 'no_change'

function ChangeDrawer({ c, onClose }: { c: Change | undefined; onClose: () => void }) {
  const { ov, run, active } = useStore()
  const [text, setText] = useState('')
  const [prio, setPrio] = useState('should')
  const [type, setType] = useState('functional')
  const [note, setNote] = useState('')
  const [key, setKey] = useState('')
  if (c && key !== c.id) { setKey(c.id); setText(c.newText); setNote('') }
  const doc = c?.documentId ? ov?.documents.find(d => d.id === c.documentId) : undefined
  const doAct = async (action: ChangeAction) => {
    if (!c) return
    const edits = action === 'adopt' ? { ...text.trim() && text !== c.newText ? { normalizedText: text.trim() } : {}, priority: prio, type } : undefined
    const out = await run('marketpilot_v4_intake_act', { input: { changeIds: [c.id], action, ...edits ? { edits } : {}, ...note.trim() ? { note: note.trim() } : {} } },
      { ok: action === 'adopt' ? '已采纳，写入为待确认需求' : '已记录处理结果' })
    if (out?.status === 'completed') onClose()
  }
  const done = active ? '已有运行进行中' : c && c.status !== 'pending' ? `该变更已处理：${CHANGE_STATUS[c.status]}` : ''
  return (
    <Drawer open={Boolean(c)} title={c?.summary ?? ''} cap={c ? `${CHANGE_KIND[c.kind][0]} · ${c.detectedBy === 'model' ? '深度分析' : '规则提示'}` : ''} onClose={onClose}
      footer={<>
        <Btn kind="ghost" disabled={done} onClick={() => doAct('ignore')}>忽略</Btn>
        <Btn kind="ghost" disabled={done} onClick={() => doAct('clarify')}>待澄清</Btn>
        <Btn kind="ghost" disabled={done} onClick={() => doAct('to_research')}>转研究</Btn>
        <Btn kind="ghost" disabled={done} onClick={() => doAct('no_change')}>无需变更</Btn>
        <Btn kind="primary" disabled={done || (!text.trim() && '采纳内容不能为空')} onClick={() => doAct('adopt')}>采纳为需求</Btn>
      </>}>
      {c ? <>
        <div className="fieldcap">来源</div>
        <p>{doc?.name ?? '未关联文档'}{c.locator ? ` · ${c.locator}` : ''}</p>
        <div className="diffbox">
          {c.oldText ? <div className="diffrow"><div className="diffcap">原需求</div><div>{c.oldText}</div></div> : null}
          <div className="diffrow new"><div className="diffcap">新资料</div><div>{c.newText}</div></div>
        </div>
        {c.impactNote ? <div className="boxnote">影响：{c.impactNote}</div> : null}
        <div className="fieldcap">采纳时的需求表述（可编辑）</div>
        <textarea className="text-field" rows={4} value={text} onChange={e => setText(e.target.value)} disabled={Boolean(done)} />
        <div className="form-two">
          <Field label="类型"><select className="text-field" value={type} onChange={e => setType(e.target.value)}>
            {Object.entries(REQ_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="优先级"><select className="text-field" value={prio} onChange={e => setPrio(e.target.value)}>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        </div>
        <Field label="处理备注"><input className="text-field" value={note} onChange={e => setNote(e.target.value)} /></Field>
        <div className="tiny-caption">采纳只会生成“待确认”需求；正式确认需在需求表中由人工确认。</div>
      </> : null}
    </Drawer>
  )
}

function ChangeList() {
  const { ov, run, active } = useStore()
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [open, setOpen] = useState<string>()
  const [sel, setSel] = useState<string[]>([])
  const all = ov!.v4.changes
  const shown = filter === 'pending' ? all.filter(c => c.status === 'pending') : all
  const bulk = async (action: ChangeAction) => {
    const out = await run('marketpilot_v4_intake_act', { input: { changeIds: sel, action } }, { ok: `已处理 ${sel.length} 条` })
    if (out?.status === 'completed') setSel([])
  }
  const noSel = active ? '已有运行进行中' : sel.length ? '' : '请先勾选候选变更'
  return (
    <Panel title={`候选变更（${all.filter(c => c.status === 'pending').length} 待处理）`} extra={<>
      <div className="segment">{(['pending', 'all'] as const).map(f => <button key={f} className={cx(filter === f && 'active')} onClick={() => setFilter(f)}>{f === 'pending' ? '待处理' : '全部'}</button>)}</div>
      {shown.some(c => c.status === 'pending') ? <label className="batch-select"><input type="checkbox" aria-label="全选候选变更"
        checked={shown.filter(c => c.status === 'pending').every(c => sel.includes(c.id))}
        onChange={e => setSel(e.target.checked ? shown.filter(c => c.status === 'pending').map(c => c.id) : [])} />全选{sel.length ? ` · ${sel.length}` : ''}</label> : null}
      <Btn small kind="ghost" disabled={noSel} onClick={() => bulk('ignore')}>批量忽略</Btn>
      <Btn small kind="teal" disabled={noSel} onClick={() => bulk('adopt')}>批量采纳</Btn>
    </>}>
      {shown.length ? <div className="item-list">{shown.map(c => (
        <div key={c.id} className="list-row">
          <input type="checkbox" aria-label="选择" disabled={c.status !== 'pending'} checked={sel.includes(c.id)}
            onChange={e => setSel(e.target.checked ? [...sel, c.id] : sel.filter(x => x !== c.id))} />
          <div className="grow"><b>{c.summary}</b><div className="tiny-caption">{c.newText.slice(0, 120)}</div></div>
          <Badge tone={CHANGE_KIND[c.kind][1]}>{CHANGE_KIND[c.kind][0]}</Badge>
          <Badge tone={c.status === 'pending' ? 'warn' : 'gray'}>{CHANGE_STATUS[c.status]}</Badge>
          <Btn small kind="text" onClick={() => setOpen(c.id)}>{c.status === 'pending' ? '处理' : '查看'}</Btn>
        </div>))}</div> : <Empty>{all.length ? '没有待处理的候选变更。' : '上传资料后，这里会列出规则识别或深度分析得到的候选变更。'}</Empty>}
      <ChangeDrawer c={all.find(c => c.id === open)} onClose={() => setOpen(undefined)} />
    </Panel>
  )
}
const EDIT_STATUS = ['proposed', 'unknown', 'conflict', 'superseded'] as const
const blankReq = { originalText: '', normalizedText: '', type: 'functional', priority: 'should', status: 'proposed', sourceDocumentId: '', sourceLocator: '', rationale: '', risk: '', clarificationQuestion: '' }

function ReqModal({ req, open, onClose }: { req: Requirement | undefined; open: boolean; onClose: () => void }) {
  const { pid, ov, act } = useStore()
  const [f, setF] = useState(blankReq)
  const [key, setKey] = useState<string>()
  const k = open ? req?.id ?? 'new' : undefined
  if (k !== key) {
    setKey(k)
    if (open) setF(req ? { ...blankReq, ...Object.fromEntries(Object.entries(req).filter(([n]) => n in blankReq).map(([n, v]) => [n, String(v ?? '')])), status: req.status === 'confirmed' ? 'proposed' : req.status } : blankReq)
  }
  const set = (n: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [n]: e.target.value })
  const save = async () => {
    const body: Record<string, string> = {}
    for (const [n, v] of Object.entries(f)) if (v.trim()) body[n] = v.trim()
    if (!body.originalText) body.originalText = body.normalizedText!
    const out = await act(() => req ? patch(pp(pid!, `requirements/${encodeURIComponent(req.id)}`), body) : post(pp(pid!, 'requirements'), body),
      req ? '需求已更新' : '已新增待确认需求')
    if (out !== undefined) onClose()
  }
  return (
    <Modal open={open} wide title={req ? '编辑需求' : '新增需求'} onClose={onClose}
      subtitle={f.status === 'superseded' ? '已替代需求退出当前范围，历史内容保留。若当前路线仍引用它，请先重新确认路线。' : req?.status === 'confirmed' ? '修改已确认需求会撤销其确认，需要重新人工确认，并使依赖的审核失效。' : '待确认需求需经人工确认后才计入正式范围。'}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={!f.normalizedText.trim() && '请填写需求表述'} onClick={save}>保存</Btn></>}>
      <Field label="需求表述 *"><textarea className="text-field" rows={3} value={f.normalizedText} onChange={set('normalizedText')} /></Field>
      <Field label="原文" hint="留空则与需求表述相同"><textarea className="text-field" rows={2} value={f.originalText} onChange={set('originalText')} /></Field>
      <div className="form-two">
        <Field label="类型"><select className="text-field" value={f.type} onChange={set('type')}>{Object.entries(REQ_TYPES).map(([n, v]) => <option key={n} value={n}>{v}</option>)}</select></Field>
        <Field label="优先级"><select className="text-field" value={f.priority} onChange={set('priority')}>{Object.entries(PRIORITY).map(([n, v]) => <option key={n} value={n}>{v}</option>)}</select></Field>
        <Field label="状态"><select className="text-field" value={f.status} onChange={set('status')}>{EDIT_STATUS.map(s => <option key={s} value={s}>{REQ_STATUS[s]![0]}</option>)}</select></Field>
        <Field label="来源文档"><select className="text-field" value={f.sourceDocumentId} onChange={set('sourceDocumentId')}>
          <option value="">（无）</option>{ov!.documents.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      </div>
      <div className="form-two">
        <Field label="位置"><input className="text-field" value={f.sourceLocator} onChange={set('sourceLocator')} placeholder="例如 第 3.2 节" /></Field>
        <Field label="风险"><input className="text-field" value={f.risk} onChange={set('risk')} /></Field>
      </div>
      <Field label="澄清问题"><input className="text-field" value={f.clarificationQuestion} onChange={set('clarificationQuestion')} /></Field>
    </Modal>
  )
}

function ReqTable() {
  const { ov, run, active } = useStore()
  const [edit, setEdit] = useState<Requirement | 'new'>()
  const [sel, setSel] = useState<string[]>([])
  const [showOld, setShowOld] = useState(false)
  const rows = ov!.requirements.filter(r => showOld || r.status !== 'superseded')
  const proposed = sel.filter(id => ov!.requirements.find(r => r.id === id)?.status === 'proposed')
  const docName = (id?: string) => ov!.documents.find(d => d.id === id)?.name
  const confirm = () => run('marketpilot_requirement_confirm', { requirementIds: proposed }, { ok: `已确认 ${proposed.length} 条需求` }).then(() => setSel([]))
  return (
    <Panel title={`工程需求清单（${rows.filter(r => r.status === 'confirmed').length}/${rows.length} 已确认）`}
      subtitle="确认简报会自动同步验收要求至此表；也可从候选变更采纳或手工新增。被当前路线决策引用的需求受覆写保护。"
      extra={<>
        <label className="tiny-caption"><input type="checkbox" checked={showOld} onChange={e => setShowOld(e.target.checked)} /> 显示已替代</label>
        <Btn small kind="ghost" onClick={() => setEdit('new')}><Icon name="plus" />新增</Btn>
        <Btn small kind="primary" disabled={!proposed.length ? '请勾选“待确认”的需求' : active ? '已有运行进行中' : ''} onClick={confirm}><Icon name="check" />人工确认所选（{proposed.length}）</Btn>
      </>}>
      {rows.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th><input type="checkbox" aria-label="全选待确认" checked={rows.some(r => r.status === 'proposed') && rows.filter(r => r.status === 'proposed').every(r => sel.includes(r.id))}
          onChange={e => setSel(e.target.checked ? rows.filter(r => r.status === 'proposed').map(r => r.id) : [])} /></th>
          <th>需求</th><th>类型</th><th>优先级</th><th>来源</th><th>状态</th><th /></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}>
            <td><input type="checkbox" aria-label="选择" checked={sel.includes(r.id)} onChange={e => setSel(e.target.checked ? [...sel, r.id] : sel.filter(x => x !== r.id))} /></td>
            <td className="main-cell"><b>{r.normalizedText}</b>{r.clarificationQuestion ? <div className="tiny-caption">待澄清：{r.clarificationQuestion}</div> : null}</td>
            <td>{REQ_TYPES[r.type] ?? r.type}</td><td>{PRIORITY[r.priority]}</td>
            <td className="tiny-caption">{docName(r.sourceDocumentId) ?? '手工录入'}{r.sourceLocator ? ` · ${r.sourceLocator}` : ''}</td>
            <td><Badge tone={REQ_STATUS[r.status]![1]}>{REQ_STATUS[r.status]![0]}</Badge></td>
            <td><Btn small kind="text" onClick={() => setEdit(r)}>编辑</Btn></td>
          </tr>))}</tbody>
      </table></div> : <Empty>暂无需求。可在“需求访谈”中确认需求简报，或从候选变更采纳、手工新增。</Empty>}
      <ReqModal open={Boolean(edit)} req={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} />
    </Panel>
  )
}

export function IntakePage() {
  const { ov } = useStore()
  const [up, setUp] = useState(false)
  if (!ov) return <Empty>正在加载项目…</Empty>
  const batches = [...ov.v4.intakeBatches].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return (
    <>
      <PageHead eyebrow="STAGE 2 · MATERIALS & CURATED SUPPORT" title="资料与精选支撑"
        lede="上传客户现场资料、标准规范或招标文件（支持 .md .txt .csv .docx .xlsx .pdf）；精选影响方案决策的关键事实与约束并人工固化。"
        actions={<Btn kind="primary" onClick={() => setUp(true)}><Icon name="upload" />上传资料</Btn>} />
      <div className="dual-grid">
        <Panel title={`资料批次（${batches.length}）`} subtitle="自动校验 SHA-256 防止重复导入；被支撑摘要或发现引用的原文受修改保护。">
          {batches.length ? batches.map(b => <BatchCard key={b.id} b={b} />) : <Empty>还没有资料。点击右上角“上传资料”导入客户需求、招标文件或会议纪要。</Empty>}
          {ov.documents.length ? (
            <>
              <div className="thin-rule" />
              <div className="micro-title">全部已归档文档（{ov.documents.length}）</div>
              {ov.documents.map(d => (
                <div key={d.id} className="source-mini">
                  <b>{d.name}</b>
                  <span className="tiny-caption">{DOC_KINDS[d.kind] ?? d.kind} · {d.length} 字</span>
                </div>
              ))}
            </>
          ) : null}
        </Panel>
        <SupportPanel />
      </div>
      {ov.v4.changes.length ? (
        <details className="section-spacer" open={ov.v4.changes.some(c => c.status === 'pending')}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>历史候选变更（{ov.v4.changes.length}）</summary>
          <ChangeList />
        </details>
      ) : null}
      <div className="section-spacer" />
      <ReqTable />
      <UploadModal open={up} onClose={() => setUp(false)} />
    </>
  )
}
