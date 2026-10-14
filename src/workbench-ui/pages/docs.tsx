/** 文档与交付: templated documents, section proposals, human review, DOCX export, send record, baselines V1/V2 and diff. */
import { useState, type ReactNode } from 'react'
import { del, downloadDocx, fileToBase64, get, patch, post, pp, put } from '../api.ts'
import { Icon } from '../icons.tsx'
import { useStore } from '../store.tsx'
import type { Baseline, DiffView, DocView, ListDiff, Section } from '../types.ts'
import { Badge, Btn, Drawer, Empty, Field, Modal, PageHead, Panel, REVIEW, cx, fmtTime } from '../ui.tsx'

const DOC_KIND: Record<DocView['doc']['kind'], string> = { technical: '技术方案', cost: '成本与报价', change_summary: '变更说明' }
const BASE_TYPE: Record<Baseline['type'], [string, string]> = {
  technical: ['技术方案基线', '冻结需求、路线、配置、研究结论与技术文档。'],
  full: ['完整方案包（含成本）', '在技术基线基础上冻结成本明细与三项成本审核、成本文档。'],
}

function inlineText(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
}

/** Render section content into paper blocks as React elements (headings, bullets, notes, tables, paragraphs). */
function Blocks({ content }: { content: string }) {
  const out: ReactNode[] = []
  let list: string[] = []
  let table: string[][] = []
  const flush = () => {
    if (list.length) { out.push(<ul key={`l${out.length}`}>{list.map((x, i) => <li key={i}>{inlineText(x)}</li>)}</ul>); list = [] }
    if (table.length) {
      const [head, ...rows] = table
      out.push(<table key={`t${out.length}`} className="paper-table"><thead><tr>{head!.map((c, i) => <th key={i}>{inlineText(c)}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{inlineText(c)}</td>)}</tr>)}</tbody></table>)
      table = []
    }
  }
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (/^\|.*\|$/.test(line)) {
      if (list.length) { const t = table; table = []; flush(); table = t }
      const cells = line.slice(1, -1).split('|').map(c => c.trim())
      if (!cells.every(c => /^:?-{2,}:?$/.test(c))) table.push(cells)
      continue
    }
    if (/^[-*] /.test(line)) { if (table.length) { const l = list; list = []; flush(); list = l } list.push(line.slice(2)); continue }
    flush()
    if (!line) continue
    if (line.startsWith('### ')) out.push(<h4 key={out.length}>{inlineText(line.slice(4))}</h4>)
    else if (line.startsWith('## ')) out.push(<h4 key={out.length}>{inlineText(line.slice(3))}</h4>)
    else if (line.startsWith('> ')) out.push(<div key={out.length} className="boxnote">{inlineText(line.slice(2))}</div>)
    else out.push(<p key={out.length}>{inlineText(line)}</p>)
  }
  flush()
  return <>{out}</>
}
function CreateModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const { ov, pid, act } = useStore()
  const [kind, setKind] = useState<DocView['doc']['kind']>('technical')
  const [title, setTitle] = useState('')
  const [tpl, setTpl] = useState('')
  const submit = async () => {
    const out = await act(() => post<DocView>(pp(pid!, 'docs'), {
      kind, ...title.trim() ? { title: title.trim() } : {}, ...tpl ? { templateId: tpl } : {},
    }), '文档已创建，章节内容来自当前工作草稿')
    if (out !== undefined) { onCreated(out.doc.id); setTitle(''); onClose() }
  }
  return (
    <Modal open={open} title="新建文档" subtitle="先选择上传的 Word 模板建立章节，再点击“按模板撰写”生成待审正文。默认模板可直接使用项目数据。" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" onClick={submit}>创建</Btn></>}>
      <Field label="文档类型"><select className="option-select" value={kind} onChange={e => setKind(e.target.value as typeof kind)}>
        {Object.entries(DOC_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="标题" hint="留空使用默认标题"><input className="text-field" value={title} onChange={e => setTitle(e.target.value)} /></Field>
      <Field label="DOCX 模板"><select className="option-select" value={tpl} onChange={e => setTpl(e.target.value)}>
        <option value="">默认模板</option>{ov!.v4.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    </Modal>
  )
}

function SectionDrawer({ dv, sec, onClose }: { dv: DocView; sec: Section | undefined; onClose: () => void }) {
  const { ov, pid, act, run, active } = useStore()
  const [text, setText] = useState('')
  const [ask, setAsk] = useState('')
  const [key, setKey] = useState<string>()
  if (sec?.key !== key) { setKey(sec?.key); setText(sec?.content ?? ''); setAsk('') }
  const model = ov!.capabilities.model
  const base = `docs/${encodeURIComponent(dv.doc.id)}`
  const save = async () => {
    const out = await act(() => put(pp(pid!, `${base}/sections/${encodeURIComponent(sec!.key)}`), { content: text }),
      dv.review === 'valid' ? '章节已保存；文档审核已失效，需要重新审核' : '章节已保存')
    if (out !== undefined) onClose()
  }
  const revise = async () => {
    await run('marketpilot_v4_doc_revise_section', { docId: dv.doc.id, input: { key: sec!.key, instruction: ask.trim() } },
      { ok: 'AI 已提出修改建议；请在正文中逐节接受或拒绝' })
  }
  const decide = async (accept: boolean) => {
    const out = await act(() => post(pp(pid!, `${base}/proposals`), { keys: [sec!.key], accept }),
      accept ? '已接受建议并写入章节' : '已拒绝建议')
    if (out !== undefined) onClose()
  }
  return (
    <Drawer open={Boolean(sec)} title={sec?.title ?? ''} cap={sec?.editedByHuman ? '已人工编辑' : '系统生成内容'} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={text === sec?.content ? '内容未变化' : ''} onClick={save}>保存章节</Btn></>}>
      <div className="tiny-caption">格式：“## ”标题、“- ”列表、“&gt; ”提示、“|a|b|”表格，其余为段落。</div>
      <textarea className="text-field" rows={14} value={text} onChange={e => setText(e.target.value)} />
      {sec?.proposal ? <>
        <div className="fieldcap">待处理建议（{sec.proposal.origin === 'ai' ? 'AI' : '数据刷新'}）</div>
        <div className="diffbox">
          <div className="diffrow"><div className="diffcap">当前</div><div style={{ whiteSpace: 'pre-wrap' }}>{sec.content}</div></div>
          <div className="diffrow new"><div className="diffcap">建议</div><div style={{ whiteSpace: 'pre-wrap' }}>{sec.proposal.content}</div></div>
        </div>
        <div className="tiny-caption">理由：{sec.proposal.reason}</div>
        <div className="actions"><Btn small kind="ghost" onClick={() => decide(false)}>拒绝</Btn><Btn small kind="teal" onClick={() => decide(true)}>接受建议</Btn></div>
      </> : null}
      <div className="thin-rule" />
      <Field label="请 AI 提出修改建议" hint="只生成建议，不会覆盖章节；需人工接受。">
        <textarea className="text-field" rows={3} maxLength={2000} value={ask} onChange={e => setAsk(e.target.value)} placeholder="例如：压缩为三段，突出接口要求" /></Field>
      <Btn small kind="teal" showReason onClick={revise}
        disabled={!model.available ? `模型不可用：${model.reason}` : !ask.trim() ? '请填写修改要求' : active ? '已有运行进行中' : ''}><Icon name="spark" />生成建议</Btn>
    </Drawer>
  )
}
function ReviewModal({ dv, open, onClose }: { dv: DocView; open: boolean; onClose: () => void }) {
  const { run, active } = useStore()
  const [ack, setAck] = useState(false)
  const [note, setNote] = useState('')
  const pending = dv.doc.sections.filter(s => s.proposal).length
  const submit = async () => {
    const ex = await run('marketpilot_v4_doc_review', { docId: dv.doc.id, ...note.trim() ? { note: note.trim() } : {} }, { ok: '文档审核已记录' })
    if (ex?.status === 'completed') { setAck(false); setNote(''); onClose() }
  }
  return (
    <Modal open={open} title="人工审核文档" subtitle="审核绑定当前文档内容指纹；之后任何章节编辑或接受建议都会使审核失效。需要在 Human Gate 中再次确认。" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={!ack ? '请勾选确认' : active ? '已有运行进行中' : ''} onClick={submit}>确认审核</Btn></>}>
      <div className="boxnote">《{dv.doc.title}》修订 {dv.doc.revisionNo} · 指纹 {dv.hash.slice(0, 12)}</div>
      {dv.outdated.length ? <div className="tiny-caption">⚠ {dv.outdated.length} 个章节与当前项目数据不一致，建议先刷新。</div> : null}
      {pending ? <div className="tiny-caption">⚠ 仍有 {pending} 个章节建议未处理。</div> : null}
      <label className="check-row"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>我已通读全文并对内容负责；AI 生成内容已逐节核对。</span></label>
      <Field label="审核说明"><textarea className="text-field" rows={3} value={note} onChange={e => setNote(e.target.value)} /></Field>
    </Modal>
  )
}

function SentModal({ dv, open, onClose }: { dv: DocView; open: boolean; onClose: () => void }) {
  const { run, active } = useStore()
  const [to, setTo] = useState('')
  const [ch, setCh] = useState('邮件')
  const [note, setNote] = useState('')
  const submit = async () => {
    const ex = await run('marketpilot_v4_doc_mark_sent', { docId: dv.doc.id, input: { recipient: to.trim(), channel: ch.trim(), ...note.trim() ? { note: note.trim() } : {} } },
      { ok: '已记录对外发送' })
    if (ex?.status === 'completed') { setTo(''); setNote(''); onClose() }
  }
  const reason = !to.trim() ? '请填写接收方' : !ch.trim() ? '请填写发送渠道' : active ? '已有运行进行中' : ''
  return (
    <Modal open={open} title="记录对外发送" subtitle="系统不会代你发送文件；这里仅记录你已通过其他渠道发送了已审核、已导出的当前版本。" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} onClick={submit}>确认记录</Btn></>}>
      <div className="form-two">
        <Field label="接收方 *"><input className="text-field" maxLength={200} value={to} onChange={e => setTo(e.target.value)} placeholder="例如 客户技术部" /></Field>
        <Field label="渠道 *"><input className="text-field" maxLength={100} value={ch} onChange={e => setCh(e.target.value)} /></Field>
      </div>
      <Field label="备注"><input className="text-field" value={note} onChange={e => setNote(e.target.value)} /></Field>
      <div className="tiny-caption">将绑定导出文件 SHA256：{dv.doc.exports.at(-1)?.sha256.slice(0, 16) ?? '—'}</div>
    </Modal>
  )
}
function TemplatePanel() {
  const { ov, pid, act } = useStore()
  const [name, setName] = useState('')
  const [file, setFile] = useState<File>()
  const [drop, setDrop] = useState<string>()
  const upload = async () => {
    if (!file) return
    const dataBase64 = await fileToBase64(file)
    const out = await act(() => post(pp(pid!, 'templates'), { name: name.trim() || file.name.replace(/\.docx$/i, ''), fileName: file.name, dataBase64 }), '模板已上传并解析')
    if (out !== undefined) { setName(''); setFile(undefined) }
  }
  const remove = async (id: string) => {
    const out = await act(() => del(pp(pid!, `templates/${encodeURIComponent(id)}`)), '模板已删除')
    if (out !== undefined) setDrop(undefined)
  }
  const tpls = ov!.v4.templates
  return (
    <Panel title={`DOCX 模板（${tpls.length + 1}）`}>
      <div className="dtl-row"><div><strong>默认模板</strong><small>系统内置 A4 版式；未选择模板的文档使用此模板。</small></div><Badge tone="teal">内置</Badge></div>
      {tpls.map(t => (
        <div key={t.id} className="dtl-row"><div><strong>{t.name}</strong>
          <small>{t.fileName} · 已识别章节 {t.outline?.length ?? t.sectionSlots.length}</small>
          {t.outline?.length ? <small>{t.outline.map(s => s.title).join(' → ')}</small> : null}
          {t.warnings.map(w => <div key={w} className="tiny-caption">⚠ {w}</div>)}</div>
          {drop === t.id ? <><button type="button" className="mini-action" onClick={() => { void remove(t.id) }}>确认删除</button>
            <button type="button" className="mini-action" onClick={() => setDrop(undefined)}>取消</button></>
            : <button type="button" className="mini-action" onClick={() => setDrop(t.id)}>删除</button>}
        </div>))}
      <div className="thin-rule" />
      <div className="tiny-caption">上传公司 .docx 模板：用 Word“标题 1–3”定义章节，标题下可填写写作要求。系统按这些章节撰写并保留模板页眉页脚。也支持 {'{{sections}}'} 或 {'{{section:KEY}}'} 插槽。</div>
      <div className="form-two">
        <Field label="模板名称"><input className="text-field" value={name} onChange={e => setName(e.target.value)} placeholder="留空使用文件名" /></Field>
        <Field label="文件"><input type="file" accept=".docx" onChange={e => setFile(e.target.files?.[0])} /></Field>
      </div>
      <Btn small kind="ghost" disabled={!file ? '请选择 .docx 文件' : ''} onClick={upload}><Icon name="upload" />上传模板</Btn>
    </Panel>
  )
}

function PublishModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { ov, run, active } = useStore()
  const [type, setType] = useState<Baseline['type']>('technical')
  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [ack, setAck] = useState(false)
  const next = Math.max(0, ...ov!.baselines.map(b => b.number)) + 1
  const blockers = ov!.checks[type]
  const submit = async () => {
    const ex = await run('marketpilot_v4_baseline_publish', { input: { type, ...label.trim() ? { label: label.trim() } : {}, ...note.trim() ? { note: note.trim() } : {} } },
      { ok: '正式版本已发布' })
    if (ex?.status === 'completed') { setLabel(''); setNote(''); setAck(false); onClose() }
  }
  const reason = blockers.length ? '发布前检查未通过' : !ack ? '请勾选确认' : active ? '已有运行进行中' : ''
  return (
    <Modal open={open} wide title="人工发布正式版本" subtitle="发布会冻结当前工作草稿的快照；正式版本不可修改，之后的草稿编辑不会影响它。需要在 Human Gate 中再次确认。" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} showReason onClick={submit}><Icon name="layers" />发布 {label.trim() || `V${next}`}</Btn></>}>
      <div className="route-grid">{(Object.keys(BASE_TYPE) as Baseline['type'][]).map(t => (
        <button key={t} type="button" className={cx('route-card', type === t && 'chosen')} onClick={() => setType(t)} style={{ textAlign: 'left' }}>
          <h3>{BASE_TYPE[t][0]}</h3><p>{BASE_TYPE[t][1]}</p>
          <Badge tone={ov!.checks[t].length ? 'warn' : 'teal'}>{ov!.checks[t].length ? `${ov!.checks[t].length} 项未满足` : '检查通过'}</Badge>
        </button>))}</div>
      {blockers.length ? <div className="review-list">{blockers.map(b => <div key={b} className="tiny-caption">· {b}</div>)}</div> : null}
      <div className="form-two">
        <Field label="版本标签" hint={`留空为 V${next}`}><input className="text-field" value={label} onChange={e => setLabel(e.target.value)} /></Field>
        <Field label="发布说明"><input className="text-field" value={note} onChange={e => setNote(e.target.value)} /></Field>
      </div>
      <label className="check-row"><input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} /><span>我确认发布内容已经过人工审核，并对该正式版本负责。</span></label>
    </Modal>
  )
}
function ListDiffBlock({ title, d }: { title: string; d: ListDiff }) {
  const n = d.added.length + d.removed.length + d.changed.length
  return (
    <div className="stack-card" style={{ padding: 14 }}>
      <div className="panel-heading"><div><h3>{title}</h3></div><Badge tone={n ? 'warn' : 'gray'}>{n ? `${n} 处变化` : '无变化'}</Badge></div>
      {d.added.map(x => <div key={`a${x}`} className="diffrow new"><div className="diffcap">新增</div><div>{x}</div></div>)}
      {d.removed.map(x => <div key={`r${x}`} className="diffrow"><div className="diffcap">移除</div><div>{x}</div></div>)}
      {d.changed.map(c => <div key={c.id} className="diffrow"><div className="diffcap">修改</div><div><b>{c.name}</b>{c.changes.map(x => <div key={x} className="tiny-caption">· {x}</div>)}</div></div>)}
    </div>
  )
}

function DiffPanel() {
  const { ov, pid } = useStore()
  const list = [...ov!.baselines].sort((a, b) => a.number - b.number)
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [view, setView] = useState<DiffView>()
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const from = a || list.at(-2)?.id || ''
  const to = b || list.at(-1)?.id || ''
  const compare = async () => {
    setBusy(true); setErr('')
    try { setView(await get<DiffView>(pp(pid!, `diff?a=${encodeURIComponent(from)}&b=${encodeURIComponent(to)}`))) }
    catch (e) { setView(undefined); setErr(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const pick = (v: string, set: (s: string) => void) => <select className="option-select" value={v} onChange={e => { set(e.target.value); setView(undefined) }}>
    {list.map(x => <option key={x.id} value={x.id}>{x.label} · {BASE_TYPE[x.type][0]}</option>)}</select>
  return (
    <Panel title="版本差异（业务级）">
      {list.length < 2 ? <Empty>至少发布两个正式版本后，才能比较业务差异。</Empty> : <>
        <div className="form-two">
          <Field label="基准版本">{pick(from, setA)}</Field>
          <Field label="对比版本">{pick(to, setB)}</Field>
        </div>
        <Btn small kind="primary" disabled={from === to ? '请选择两个不同版本' : busy ? '正在比较' : ''} onClick={compare}><Icon name="diff" />比较</Btn>
        {err ? <div className="tiny-caption">比较失败：{err}</div> : null}
        {view ? <div className="right-panel-stack" style={{ marginTop: 14 }}>
          <div className="boxnote">{view.from.label} → {view.to.label}</div>
          <ListDiffBlock title="需求" d={view.requirements} />
          <div className="stack-card" style={{ padding: 14 }}><div className="panel-heading"><div><h3>技术路线</h3></div>
            <Badge tone={view.route ? 'warn' : 'gray'}>{view.route ? '已变化' : '无变化'}</Badge></div>
            {view.route ? <div className="diffrow new"><div className="diffcap">路线</div><div>{view.route.from ?? '（无）'} → {view.route.to ?? '（无）'}</div></div> : null}</div>
          <ListDiffBlock title="设备配置" d={view.config} />
          {view.cost ? <><div className="stack-card" style={{ padding: 14 }}><div className="panel-heading"><div><h3>成本合计</h3></div></div>
            <div className="diffrow new"><div className="diffcap">合计</div><div>{view.cost.totalFrom ?? '无合计'} → {view.cost.totalTo ?? '无合计'}</div></div></div>
            <ListDiffBlock title="成本明细" d={view.cost.lines} /></>
            : <div className="tiny-caption">至少一个版本为技术方案基线（不含成本），不比较成本。</div>}
          <ListDiffBlock title="研究结论" d={view.findings} />
          <ListDiffBlock title="文档" d={view.docs} />
        </div> : null}
      </>}
    </Panel>
  )
}

function BaselinePanel({ onPublish }: { onPublish: () => void }) {
  const { ov } = useStore()
  const list = [...ov!.baselines].sort((a, b) => b.number - a.number)
  return (
    <Panel title={`正式版本（${list.length}）`} extra={<Btn small kind="primary" onClick={onPublish}><Icon name="layers" />发布正式版本</Btn>}>
      {list.length ? list.map(b => (
        <div key={b.id} className="baseline">
          <div className="smallcap">{BASE_TYPE[b.type][0]} · 不可修改</div>
          <div className="baseline-title">{b.label}</div>
          <div className="tiny-caption">{b.review.reviewer} · {fmtTime(b.review.reviewedAt)}{b.review.reason ? ` · ${b.review.reason}` : ''}</div>
          <div className="tiny-caption">快照指纹 {b.snapshotHash.slice(0, 12)}</div>
        </div>)) : <Empty>尚未发布正式版本。工作草稿可持续修改；只有人工发布才会生成 V1、V2…</Empty>}
    </Panel>
  )
}
export function DeliverPage() {
  const { ov, pid, act, run, toast, refresh, active } = useStore()
  const [sel, setSel] = useState<string>()
  const [create, setCreate] = useState(false)
  const [editKey, setEditKey] = useState<string>()
  const [review, setReview] = useState(false)
  const [sent, setSent] = useState(false)
  const [publish, setPublish] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!ov || !pid) return <Empty>正在加载项目…</Empty>
  const dv = ov.docs.find(d => d.doc.id === sel) ?? ov.docs[0]
  const base = dv ? `docs/${encodeURIComponent(dv.doc.id)}` : ''
  const tplName = (id?: string) => id ? ov.v4.templates.find(t => t.id === id)?.name ?? '（模板已删除）' : '默认模板'
  const currentExports = dv ? dv.doc.exports.filter(e => e.hash === dv.hash) : []
  const sentNow = dv ? dv.doc.sent.filter(s => currentExports.some(e => e.sha256 === s.exportSha256)) : []
  const sync = async () => {
    const out = await act(() => post<DocView & { replaced: number; proposed: number }>(pp(pid, `${base}/refresh`), {}))
    if (out) toast(`已同步：直接更新 ${out.replaced} 节，${out.proposed} 节已人工编辑，改为建议待处理`, 'ok')
  }
  const setTpl = (v: string) => act(() => patch(pp(pid, base), { templateId: v || null }), '模板已切换；导出将使用新模板').then(() => {})
  const download = async () => {
    setBusy(true)
    try {
      const r = await downloadDocx(pid, dv!.doc.id)
      toast(`已导出 ${r.fileName} · SHA256 ${r.sha256.slice(0, 12)}${r.reviewed ? '' : ' · 未审核版本，不能对外发送'}`, r.reviewed ? 'ok' : 'err')
      await refresh()
    } catch (e) { toast(`导出失败：${e instanceof Error ? e.message : String(e)}`, 'err') }
    finally { setBusy(false) }
  }
  const [rl, rt] = dv ? REVIEW[dv.review]! : ['', 'gray']
  return (
    <>
      <PageHead eyebrow="文档与交付" title="文档、审核与正式版本"
        actions={<><Btn kind="ghost" onClick={() => setCreate(true)}><Icon name="plus" />新建文档</Btn>
          <Btn kind="primary" onClick={() => setPublish(true)}><Icon name="layers" />发布正式版本</Btn></>} />
      <div className="doc-layout">
        <div className="doc-list">
          <div className="micro-title">项目文档（{ov.docs.length}）</div>
          {ov.docs.map(d => (
            <button key={d.doc.id} type="button" className={cx('doc-item', d.doc.id === dv?.doc.id && 'active')} onClick={() => setSel(d.doc.id)}>
              <Icon name="file" /><span>{d.doc.title}<br /><small>{DOC_KIND[d.doc.kind]} · 修订 {d.doc.revisionNo}</small></span>
              <Badge tone={REVIEW[d.review]![1] as 'teal' | 'red' | 'gray'}>{REVIEW[d.review]![0]}</Badge>
            </button>))}
          {!ov.docs.length ? <div className="empty-note">暂无文档，点击“新建文档”。</div> : null}
        </div>
        {dv ? <div>
          <div className="actions" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
            <Badge tone={rt as 'teal' | 'red' | 'gray'}>{rl}</Badge>
            <Badge tone={dv.outdated.length && currentExports.length ? 'warn' : currentExports.length ? 'teal' : 'gray'}>{currentExports.length ? dv.outdated.length ? '已导出 · 依据已变化' : '当前版本已导出' : dv.doc.exports.length ? '导出已过期' : '未导出'}</Badge>
            <Badge tone={sentNow.length ? 'teal' : 'gray'}>{sentNow.length ? `已对外发送 ${sentNow.length} 次` : '未对外发送'}</Badge>
            <span className="grow" />
            <Btn small kind="teal" showReason disabled={active ? '已有运行进行中' : !dv.doc.templateId ? '请先选择上传的 Word 模板' : !ov.route.confirmed ? '请先确认最终路线' : ''} onClick={() => run('marketpilot_v4_doc_draft_template', { docId: dv.doc.id }, { ok: '模板正文建议已生成，请逐节审阅采纳' }).then(() => {})}>按模板撰写</Btn>
            <select className="option-select" aria-label="DOCX 模板" value={dv.doc.templateId ?? ''} onChange={e => { void setTpl(e.target.value) }}>
              <option value="">默认模板</option>{ov.v4.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            {dv.outdated.length ? <Btn small kind="teal" onClick={sync}><Icon name="refresh" />同步项目数据（{dv.outdated.length}）</Btn> : null}
            <Btn small kind={dv.review === 'valid' ? 'ghost' : 'primary'} disabled={active ? '已有运行进行中' : dv.outdated.length ? '请先同步项目数据' : dv.doc.sections.some(s => s.proposal) ? '请先处理章节建议' : ''} onClick={() => setReview(true)}><Icon name="shield" />{dv.review === 'valid' ? '重新审核' : '人工审核'}</Btn>
            <Btn small kind="ghost" disabled={busy ? '正在导出' : ''} onClick={download}><Icon name="file" />导出 DOCX</Btn>
            <Btn small kind="text" disabled={dv.sendBlockers[0] ?? (active ? '已有运行进行中' : '')} onClick={() => setSent(true)}><Icon name="send" />记录对外发送</Btn>
          </div>
          {dv.outdated.length ? <div className="reconcile-note"><Icon name="refresh" /> 以下章节与当前项目数据不一致：{dv.outdated.map(k => dv.doc.sections.find(s => s.key === k)?.title ?? k).join('、')}。同步时人工编辑过的章节只会生成建议，不会被覆盖。</div> : null}
          <div className="paper">
            <div className="paper-cap">{ov.project.name} · {DOC_KIND[dv.doc.kind]}</div>
            <h1>{dv.doc.title}</h1>
            <div className="minor" title={`内容指纹：${dv.hash}`}>修订 {dv.doc.revisionNo} · {tplName(dv.doc.templateId)}{dv.doc.review ? ` · 审核于 ${fmtTime(dv.doc.review.review.reviewedAt)}` : ''}</div>
            <div className="paper-rule" />
            {dv.doc.sections.map(s => (
              <section key={s.key}>
                <h3>{s.title} <button type="button" className="mini-action" onClick={() => setEditKey(s.key)}>编辑</button>
                  {s.proposal ? <> <Badge tone="warn">有待处理建议</Badge></> : null}
                  {s.editedByHuman ? <> <Badge tone="blue">已人工编辑</Badge></> : null}</h3>
                {s.content.trim() ? <Blocks content={s.content} /> : <p className="tiny-caption">（本节暂无内容）</p>}
              </section>))}
          </div>
          {dv.doc.sent.length ? <Panel title="对外发送记录" className="section-spacer">
            {dv.doc.sent.map((s, i) => <div key={i} className="dtl-row"><div><strong>{s.recipient} · {s.channel}</strong>
              <small>{s.review.reviewer} · {fmtTime(s.review.reviewedAt)} · SHA256 {s.exportSha256.slice(0, 12)}</small></div>
              <Badge tone={currentExports.some(e => e.sha256 === s.exportSha256) ? 'teal' : 'gray'}>{currentExports.some(e => e.sha256 === s.exportSha256) ? '当前版本' : '旧版本'}</Badge></div>)}
          </Panel> : null}
          <SectionDrawer dv={dv} sec={dv.doc.sections.find(s => s.key === editKey)} onClose={() => setEditKey(undefined)} />
          <ReviewModal dv={dv} open={review} onClose={() => setReview(false)} />
          <SentModal dv={dv} open={sent} onClose={() => setSent(false)} />
        </div> : <Empty>暂无文档。新建技术方案或成本文档后，可在此 A4 预览、审核并导出 DOCX。</Empty>}
      </div>
      <div className="section-spacer" />
      <div className="dual-grid">
        <BaselinePanel onPublish={() => setPublish(true)} />
        <TemplatePanel />
      </div>
      <div className="section-spacer" />
      <DiffPanel />
      <CreateModal open={create} onClose={() => setCreate(false)} onCreated={setSel} />
      <PublishModal open={publish} onClose={() => setPublish(false)} />
    </>
  )
}
