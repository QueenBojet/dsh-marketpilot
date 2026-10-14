/** 智能研究 (2B): question rail | report-centred research | collapsible AI assistant. */
import { useState } from 'react'
import { get, patch, post, pp, put } from '../api.ts'
import { Icon } from '../icons.tsx'
import { useStore } from '../store.tsx'
import type { Finding, Message, Question, WebSource } from '../types.ts'
import { Badge, Btn, Drawer, Empty, Field, Modal, PageHead, ROUTE_SRC, WEB_STATUS, cx, fmtTime } from '../ui.tsx'

const Q_STATUS: Record<Question['status'], [string, 'gray' | 'blue' | 'teal' | 'warn']> = {
  open: ['待研究', 'gray'], researching: ['研究中', 'blue'], answered: ['已有报告', 'teal'], needs_review: ['需复核', 'warn'], closed: ['已关闭', 'gray'],
}
const MODE: Record<'local' | 'web' | 'both', string> = { local: '仅本地资料', web: '仅联网', both: '本地 + 联网' }
const ADOPT: Record<Finding['adoption'], [string, 'gray' | 'teal' | 'red']> = { candidate: ['候选', 'gray'], adopted: ['已采纳', 'teal'], rejected: ['已拒绝', 'red'] }
const VERIFY: Record<Finding['verification'], [string, 'gray' | 'teal' | 'red']> = { unverified: ['未核实', 'gray'], verified: ['已核实', 'teal'], disputed: ['有争议', 'red'] }
const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

function QuestionModal({ q, open, onClose }: { q: Question | undefined; open: boolean; onClose: () => void }) {
  const { pid, ov, act } = useStore()
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [reqs, setReqs] = useState<string[]>([])
  const [docs, setDocs] = useState<string[]>([])
  const [alts, setAlts] = useState<string[]>([])
  const [direction, setDirection] = useState('')
  const [decisionUse, setDecisionUse] = useState('')
  const [key, setKey] = useState<string>()
  const k = open ? q?.id ?? 'new' : undefined
  if (k !== key) { setKey(k); setTitle(q?.title ?? ''); setDesc(q?.description ?? ''); setReqs(q?.requirementIds ?? []); setDocs(q?.documentIds ?? []); setAlts(q?.alternativeIds ?? []); setDirection(q?.direction ?? ''); setDecisionUse(q?.decisionUse ?? '') }
  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  const save = async () => {
    const body = { title: title.trim(), description: desc.trim(), requirementIds: reqs, documentIds: docs, alternativeIds: alts, direction: direction.trim(), decisionUse: decisionUse.trim() }
    const out = await act(() => q ? patch(pp(pid!, `questions/${encodeURIComponent(q.id)}`), body) : post(pp(pid!, 'questions'), body), q ? '问题已更新' : '已新增研究问题')
    if (out !== undefined) onClose()
  }
  return (
    <Modal open={open} wide title={q ? '编辑研究问题' : '新增研究问题'} onClose={onClose} subtitle="每项研究聚焦一个具体方向，并说明它将支持哪项路线选择。新流程只使用已固化的本地支撑摘要。"
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={!title.trim() && '请填写问题'} onClick={save}>保存</Btn></>}>
      <Field label="问题 *"><input className="text-field" value={title} onChange={e => setTitle(e.target.value)} maxLength={200} /></Field>
      <Field label="说明"><textarea className="text-field" rows={3} value={desc} onChange={e => setDesc(e.target.value)} /></Field>
      <Field label="具体研究方向"><input className="text-field" value={direction} onChange={e => setDirection(e.target.value)} placeholder="例如：高湿工况下的检测可靠性" /></Field>
      <Field label="对路线决策的用途"><textarea className="text-field" rows={2} value={decisionUse} onChange={e => setDecisionUse(e.target.value)} /></Field>
      <div className="fieldcap">关联候选路线</div>{ov!.alternatives.map(a => <label className="check-row" key={a.id}><input type="checkbox" checked={alts.includes(a.id)} onChange={() => toggle(alts, setAlts, a.id)} />{a.name}</label>)}
      <div className="form-two">
        <Field label="关联需求">{ov!.requirements.filter(r => r.status !== 'superseded').map(r => (
          <label key={r.id} className="check-row"><input type="checkbox" checked={reqs.includes(r.id)} onChange={() => toggle(reqs, setReqs, r.id)} />{r.normalizedText.slice(0, 60)}</label>))}</Field>
        <Field label="资料范围">{ov!.documents.map(d => (
          <label key={d.id} className="check-row"><input type="checkbox" checked={docs.includes(d.id)} onChange={() => toggle(docs, setDocs, d.id)} />{d.name}</label>))}</Field>
      </div>
    </Modal>
  )
}

function PlanDrawer({ q, open, onClose }: { q: Question; open: boolean; onClose: () => void }) {
  const { pid, ov, act, run, active } = useStore()
  const [steps, setSteps] = useState('')
  const [queries, setQueries] = useState('')
  const [mode, setMode] = useState<'local' | 'web' | 'both'>('local')
  const [key, setKey] = useState<string>()
  const k = open ? q.id : undefined
  if (k !== key) { setKey(k); setSteps(q.plan?.steps.join('\n') ?? ''); setQueries(q.plan?.queries.join('\n') ?? ''); setMode(q.plan?.mode ?? 'local') }
  const model = ov!.capabilities.model
  const draft = async () => {
    const ex = await run('marketpilot_v4_research_draft_plan', { questionId: q.id }, { ok: 'AI 已拟定计划草稿，请审阅后保存' })
    const v = ex?.status === 'completed' ? ex.value as { steps?: string[]; queries?: string[] } | undefined : undefined
    if (v?.steps) { setSteps(v.steps.join('\n')); setQueries((v.queries ?? []).join('\n')) }
  }
  const save = async () => {
    const out = await act(() => put(pp(pid!, `questions/${encodeURIComponent(q.id)}/plan`), { steps: lines(steps), mode, queries: lines(queries) }), '研究计划已确认保存')
    if (out !== undefined) onClose()
  }
  const reason = !lines(steps).length ? '至少一个步骤' : lines(steps).length > 12 ? '最多 12 个步骤' : lines(queries).length > 6 ? '最多 6 条检索词' : ''
  return (
    <Drawer open={open} title="研究计划" cap={q.title} onClose={onClose}
      footer={<><Btn kind="ghost" onClick={draft} disabled={!model.available ? `模型不可用：${model.reason}` : active ? '已有运行进行中' : ''}><Icon name="spark" />AI 拟定草稿</Btn>
        <Btn kind="primary" disabled={reason} onClick={save}>确认计划</Btn></>}>
      <div className="tiny-caption">AI 只生成草稿，保存即视为人工确认。{q.plan?.confirmedAt ? `上次确认：${q.plan.confirmedBy ?? ''} ${fmtTime(q.plan.confirmedAt)}` : ''}</div>
      <Field label="研究步骤（每行一步）"><textarea className="text-field" rows={6} value={steps} onChange={e => setSteps(e.target.value)} /></Field>
      <Field label="研究模式"><select className="text-field" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
        {Object.entries(MODE).map(([m, v]) => <option key={m} value={m}>{v}</option>)}</select></Field>
      <Field label="联网检索词（每行一条）" hint={ov!.capabilities.research.reason}><textarea className="text-field" rows={3} value={queries} onChange={e => setQueries(e.target.value)} /></Field>
    </Drawer>
  )
}
type Preset = { type: 'document' | 'web' | 'report' | 'none'; documentId?: string; sourceId?: string; quote?: string }
const selected = () => (window.getSelection()?.toString() ?? '').trim()

/** Manual finding: the quote must exist verbatim in the chosen source (checked server-side, QUOTE_NOT_FOUND). */
function FindingModal({ q, preset, onClose }: { q: Question | undefined; preset: Preset | undefined; onClose: () => void }) {
  const { pid, ov, act } = useStore()
  const [statement, setStatement] = useState('')
  const [conditions, setConditions] = useState('')
  const [src, setSrc] = useState<Preset>({ type: 'none' })
  const [locator, setLocator] = useState('')
  const [text, setText] = useState<string>()
  const [key, setKey] = useState<Preset>()
  if (preset !== key) { setKey(preset); setStatement(preset?.quote ?? ''); setConditions(''); setLocator(''); setText(undefined); setSrc(preset ?? { type: 'none' }) }
  const loadDoc = async (documentId: string) => {
    setSrc({ ...src, type: 'document', documentId }); setText(undefined)
    if (!documentId) return
    const d = await act(() => get<{ textContent: string }>(pp(pid!, `documents/${encodeURIComponent(documentId)}`)))
    setText(d?.textContent ?? '')
  }
  const web = src.type === 'web' ? ov!.v4.sources.find(s => s.id === src.sourceId) : undefined
  const save = async () => {
    const source = src.type === 'none' ? { type: 'none' } : {
      type: src.type, ...src.documentId ? { documentId: src.documentId } : {}, ...src.sourceId ? { sourceId: src.sourceId } : {},
      ...locator.trim() ? { locator: locator.trim() } : {}, quote: (src.quote ?? '').trim(),
    }
    const out = await act(() => post(pp(pid!, 'findings'), {
      statement: statement.trim(), ...conditions.trim() ? { conditions: conditions.trim() } : {}, origin: 'manual', source,
      ...q ? { questionId: q.id, requirementIds: q.requirementIds } : {},
    }), '已保存为候选发现（尚未采纳）')
    if (out !== undefined) onClose()
  }
  const reason = !statement.trim() ? '请填写结论' : src.type !== 'none' && !src.quote?.trim() ? '请选择或粘贴原文摘录' : src.type === 'document' && !src.documentId ? '请选择文档' : ''
  return (
    <Modal open={Boolean(preset)} wide title="保存为研究发现" onClose={onClose}
      subtitle="保存后为“候选”状态；采纳与核实是两个独立的人工步骤。报告摘录或无来源的发现会标记为需复核。"
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} onClick={save}>保存发现</Btn></>}>
      <Field label="结论 *"><textarea className="text-field" rows={3} value={statement} onChange={e => setStatement(e.target.value)} maxLength={2000} /></Field>
      <Field label="适用条件"><input className="text-field" value={conditions} onChange={e => setConditions(e.target.value)} /></Field>
      <div className="form-two">
        <Field label="来源类型"><select className="text-field" value={src.type} onChange={e => { setSrc({ type: e.target.value as Preset['type'] }); setText(undefined) }}>
          <option value="document">项目资料</option><option value="web" disabled={!ov!.v4.sources.some(s => s.status === 'fetched')}>网页快照</option>
          <option value="report" disabled={!q?.report}>研究报告</option><option value="none">无来源（需复核）</option></select></Field>
        {src.type === 'document' ? <Field label="文档"><select className="text-field" value={src.documentId ?? ''} onChange={e => void loadDoc(e.target.value)}>
          <option value="">（请选择）</option>{ov!.documents.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field> : null}
        {src.type === 'web' ? <Field label="网页"><select className="text-field" value={src.sourceId ?? ''} onChange={e => setSrc({ ...src, sourceId: e.target.value })}>
          <option value="">（请选择）</option>{ov!.v4.sources.filter(s => s.status === 'fetched').map(s => <option key={s.id} value={s.id}>{s.title || s.url}</option>)}</select></Field> : null}
      </div>
      {src.type === 'document' && text !== undefined ? <><div className="fieldcap">在下方原文中选中文字，再点“使用选中文字”</div>
        <pre className="research-quote source-text">{text || '（该文档没有可读文本）'}</pre></> : null}
      {src.type === 'web' && web?.snapshot ? <pre className="research-quote source-text">{web.snapshot}</pre> : null}
      {src.type === 'report' && q?.report ? <pre className="research-quote source-text">{q.report}</pre> : null}
      {src.type !== 'none' ? <>
        <div className="actions"><Btn small kind="ghost" onClick={() => { const s = selected(); if (s) setSrc({ ...src, quote: s }) }}>使用选中文字</Btn></div>
        <Field label="原文摘录 *" hint="必须与原文逐字一致（空白差异可忽略）"><textarea className="text-field" rows={3} value={src.quote ?? ''} onChange={e => setSrc({ ...src, quote: e.target.value })} /></Field>
        <Field label="位置"><input className="text-field" value={locator} onChange={e => setLocator(e.target.value)} placeholder="例如 第 2 节 / 第 3 页" /></Field>
      </> : null}
    </Modal>
  )
}
function SourceDrawer({ s, onClose, onSave }: { s: WebSource | undefined; onClose: () => void; onSave: (p: Preset) => void }) {
  return (
    <Drawer open={Boolean(s)} title={s?.title || s?.url || ''} cap={s ? (s.status === 'fetched' ? `已获取正文 · ${fmtTime(s.fetchedAt)}` : '获取失败：未取得正文，不能作为证据') : ''} onClose={onClose}
      footer={<Btn kind="primary" disabled={s?.status !== 'fetched' ? '只有已获取正文的网页才能作为来源' : ''}
        onClick={() => { const quote = selected(); onSave({ type: 'web', ...s ? { sourceId: s.id } : {}, ...quote ? { quote } : {} }) }}>选中文字保存为发现</Btn>}>
      {s ? <>
        <div className="fieldcap">网址</div><p className="tiny-caption" style={{ wordBreak: 'break-all' }}>{s.url}</p>
        {s.error ? <div className="boxnote">错误：{s.error}</div> : null}
        {s.contentHash ? <div className="tiny-caption">内容哈希：{s.contentHash.slice(0, 16)}…</div> : null}
        {s.snapshot ? <><div className="fieldcap">正文快照（选中文字后可保存）</div><pre className="research-quote source-text">{s.snapshot}</pre></> : null}
      </> : null}
    </Drawer>
  )
}

function FindingCard({ f }: { f: Finding }) {
  const { pid, ov, act, run, active } = useStore()
  const [edit, setEdit] = useState<string>()
  const [hist, setHist] = useState(false)
  const review = (kind: 'adoption' | 'verification', value: string) =>
    run('marketpilot_v4_findings_review', { input: { findingIds: [f.id], kind, value } }, { ok: '已记录人工审核' }).then(() => {})
  const busy = active ? '已有运行进行中' : ''
  const src = f.source
  const srcName = src.type === 'document' ? ov!.documents.find(d => d.id === src.documentId)?.name ?? '文档'
    : src.type === 'web' ? ov!.v4.sources.find(s => s.id === src.sourceId)?.title ?? '网页' : src.type === 'report' ? '研究报告' : '无来源'
  return (
    <div className="finding">
      <div className="finding-head">
        <Badge tone={ADOPT[f.adoption][1]}>{ADOPT[f.adoption][0]}</Badge><Badge tone={VERIFY[f.verification][1]}>{VERIFY[f.verification][0]}</Badge>
        {f.needsReview ? <Badge tone="warn">需复核</Badge> : null}<span className="tiny-caption">{f.origin === 'ai' ? 'AI 提出' : '人工摘录'}</span>
      </div>
      {edit === undefined ? <p><b>{f.statement}</b>{f.conditions ? <span className="tiny-caption"> · 条件：{f.conditions}</span> : null}</p>
        : <textarea className="text-field" rows={3} value={edit} onChange={e => setEdit(e.target.value)} />}
      {src.quote ? <div className="research-quote">“{src.quote}”<div className="tiny-caption">{srcName}{src.locator ? ` · ${src.locator}` : ''}</div></div> : <div className="tiny-caption">来源：{srcName}</div>}
      {f.needsReview && f.reviewReason ? <div className="tiny-caption">复核原因：{f.reviewReason}</div> : null}
      {f.adoptionReview ? <div className="tiny-caption">采纳审核：{f.adoptionReview.reviewer} {fmtTime(f.adoptionReview.reviewedAt)}</div> : null}
      {f.verificationReview ? <div className="tiny-caption">核实审核：{f.verificationReview.reviewer} {fmtTime(f.verificationReview.reviewedAt)}</div> : null}
      {hist && f.history.length ? f.history.map((h, i) => <div key={i} className="tiny-caption">· {fmtTime(h.at)} {h.by}：{h.statement}</div>) : null}
      <div className="finding-foot actions">
        {edit === undefined ? <>
          <Btn small kind="teal" disabled={busy || (f.adoption === 'adopted' && !f.needsReview && '已采纳')} onClick={() => review('adoption', 'adopted')}>采纳</Btn>
          <Btn small kind="ghost" disabled={busy || (f.adoption === 'rejected' && '已拒绝')} onClick={() => review('adoption', 'rejected')}>拒绝</Btn>
          <Btn small kind="ghost" disabled={busy || (src.type === 'none' && '无来源，无法核实') || (f.verification === 'verified' && !f.needsReview && '已核实')} onClick={() => review('verification', 'verified')}>核实无误</Btn>
          <Btn small kind="ghost" disabled={busy} onClick={() => review('verification', 'disputed')}>标记争议</Btn>
          <Btn small kind="text" onClick={() => setEdit(f.statement)}>编辑</Btn>
          {f.history.length ? <Btn small kind="text" onClick={() => setHist(!hist)}>{hist ? '收起历史' : `历史（${f.history.length}）`}</Btn> : null}
        </> : <>
          <Btn small kind="primary" disabled={!edit.trim() && '结论不能为空'} onClick={async () => {
            const out = await act(() => patch(pp(pid!, `findings/${encodeURIComponent(f.id)}`), { statement: edit.trim() }), '已更新；已采纳/已核实的发现需重新复核')
            if (out !== undefined) setEdit(undefined)
          }}>保存</Btn><Btn small kind="text" onClick={() => setEdit(undefined)}>取消</Btn>
        </>}
      </div>
    </div>
  )
}
function ReportPanel({ q, onEdit, onSave }: { q: Question; onEdit: () => void; onSave: (p: Preset) => void }) {
  const { pid, ov, act, run, active } = useStore()
  const [plan, setPlan] = useState(false)
  const [mode, setMode] = useState<'local' | 'web' | 'both' | ''>('')
  const [src, setSrc] = useState<string>()
  const cap = ov!.capabilities
  const last = ov!.v4.runs.filter(r => r.kind === 'research' && r.questionId === q.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
  const sources = ov!.v4.sources.filter(s => s.questionId === q.id)
  const eff = mode || q.plan?.mode || 'local'
  const reason = !cap.model.available ? `模型不可用：${cap.model.reason}` : q.status === 'researching' ? '研究进行中' : q.status === 'closed' ? '问题已关闭'
    : ov!.v4.discovery && !q.plan?.confirmedAt ? '请先制定并确认本方向研究计划'
    : !ov!.documents.length && eff === 'local' ? '项目没有资料，请先上传' : active ? '已有运行进行中' : ''
  const go = () => run('marketpilot_v4_research_run', { questionId: q.id, ...mode ? { mode } : {} }, { ok: '研究完成：报告与候选发现已生成，均需人工审核' }).then(() => {})
  const findings = ov!.v4.findings.filter(f => f.questionId === q.id)
  return (
    <div className="report">
      <div className="report-top">
        <div className="grow"><div className="report-overline">研究问题 · <Badge tone={Q_STATUS[q.status][1]}>{Q_STATUS[q.status][0]}</Badge></div>
          <h2>{q.title}</h2>{q.description ? <p className="report-intro">{q.description}</p> : null}
          {q.reviewReason ? <div className="boxnote">需复核：{q.reviewReason}</div> : null}</div>
        <div className="actions"><Btn small kind="text" onClick={onEdit}>编辑</Btn>
          <Btn small kind="ghost" disabled={q.status === 'closed' && '已关闭'} onClick={() => act(() => patch(pp(pid!, `questions/${encodeURIComponent(q.id)}`), { status: 'closed' }), '问题已关闭').then(() => {})}>关闭问题</Btn></div>
      </div>
      <div className="research-toolbar">
        <span className="tiny-caption">计划：{q.plan ? `${q.plan.steps.length} 步 · ${MODE[q.plan.mode]} · ${q.plan.confirmedBy ?? ''} 确认` : ov!.v4.discovery ? '未制定，请先确认本方向计划' : '未制定（将直接按问题研究本地资料）'}</span>
        <Btn small kind="ghost" onClick={() => setPlan(true)}>{q.plan ? '修改计划' : '制定计划'}</Btn>
        <select className="text-field" style={{ width: 150 }} value={mode} onChange={e => setMode(e.target.value as typeof mode)} aria-label="本次研究模式">
          <option value="">按计划（{MODE[q.plan?.mode ?? 'local']}）</option>{Object.entries(MODE).map(([m, v]) => <option key={m} value={m}>{v}</option>)}</select>
        <Btn small kind="primary" disabled={reason} showReason onClick={go}><Icon name="spark" />开始研究</Btn>
      </div>
      {eff !== 'local' && !cap.research.available ? <div className="boxnote">{cap.research.reason} {eff === 'web' ? '仅联网模式需要成功获取网页正文，否则报告生成会停止。' : '联网失败时会记录原因，并明确区分本地资料与网页来源。'}</div> : null}
      {last ? <div className="tiny-caption">最近运行：{fmtTime(last.startedAt)} · {last.status} · 模型 {last.modelRoute.provider}/{last.modelRoute.model}（{ROUTE_SRC[last.modelRoute.source]}）· {WEB_STATUS[last.webStatus]}{last.note ? ` · ${last.note}` : ''}{last.error ? ` · 错误：${last.error}` : ''}</div> : null}
      <div className="thin-rule" />
      {q.report ? <>
        <div className="report-sub">研究报告（AI 草稿，需人工判断）<Btn small kind="text" onClick={() => onSave({ type: 'report', ...selected() ? { quote: selected() } : {} })}>选中文字保存为发现</Btn></div>
        {q.report.split(/\n{2,}/).map((para, i) => <p key={i} style={{ whiteSpace: 'pre-wrap' }}>{para}</p>)}
      </> : <Empty>尚无报告。{ov!.v4.discovery ? '请先制定并确认本方向研究计划，再开始研究。' : '制定计划（可选）后点击“开始研究”。'}</Empty>}
      {sources.length ? <div className="sources"><div className="micro-title">网页来源（{sources.filter(s => s.status === 'fetched').length}/{sources.length} 已获取正文）</div>
        {sources.map(s => <button key={s.id} className="source-line" onClick={() => setSrc(s.id)}>
          <Badge tone={s.status === 'fetched' ? 'teal' : 'red'}>{s.status === 'fetched' ? '已获取' : '失败'}</Badge> {s.title || s.url}</button>)}</div> : null}
      <div className="section-heading"><h3>研究发现（{findings.length}）</h3>
        <Btn small kind="ghost" onClick={() => onSave({ type: 'document' })}><Icon name="plus" />从资料摘录</Btn></div>
      {findings.length ? <div className="finding-list">{findings.map(f => <FindingCard key={f.id} f={f} />)}</div> : <Empty>暂无发现。研究运行会提出候选发现，也可以手工从资料中摘录。</Empty>}
      <PlanDrawer q={q} open={plan} onClose={() => setPlan(false)} />
      <SourceDrawer s={sources.find(s => s.id === src)} onClose={() => setSrc(undefined)} onSave={p => { setSrc(undefined); onSave(p) }} />
    </div>
  )
}
/** Advisory chat: answers are stored per thread; it cannot confirm, adopt or publish anything (Human Gate stays with the UI). */
function AssistantPanel({ q, onClose }: { q: Question | undefined; onClose: () => void }) {
  const { ov, run, active } = useStore()
  const [text, setText] = useState('')
  const thread = q ? `q:${q.id}` : 'general'
  const msgs: Message[] = ov!.v4.messages.filter(m => m.thread === thread)
  const model = ov!.capabilities.model
  const reason = !model.available ? `模型不可用：${model.reason}` : active ? '已有运行进行中' : !text.trim() ? '请输入问题' : text.length > 8000 ? '最多 8000 字' : ''
  const send = async () => {
    if (reason) return
    const content = text.trim()
    const ex = await run('marketpilot_v4_research_chat', { input: { thread, ...q ? { questionId: q.id } : {}, content } })
    if (ex?.status === 'completed') setText('')
  }
  return (
    <aside className="card assistant-panel">
      <div className="assistant-top">
        <div className="assistant-title">
          <div className="assistant-name"><span className="bot-mark"><Icon name="spark" /></span>项目 AI 助手</div>
          <button className="icon-btn" style={{ width: 27, height: 27, border: 0 }} onClick={onClose} title="收起 AI 面板" aria-label="收起 AI 面板"><Icon name="close" /></button>
        </div>
        <div className="tiny-caption">{q ? `当前问题：${q.title}` : '通用对话（未选择研究问题）'}</div>
      </div>
      <div className="conversation">
        {msgs.length ? msgs.map(m => (
          <div key={m.id} className={cx('bubble', m.role === 'user' ? 'user' : 'ai')}>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
            {m.status !== 'done' ? <Badge tone={m.status === 'failed' ? 'red' : 'gray'}>{m.status === 'failed' ? '失败' : '已取消'}</Badge> : null}
            {m.role === 'assistant' && m.modelRoute ? <div className="tiny-caption">{m.modelRoute.provider}/{m.modelRoute.model} · {ROUTE_SRC[m.modelRoute.source]}</div> : null}
          </div>)) : <div className="chat-empty">{q ? '围绕这个问题展开讨论' : '有什么需要一起研究？'}</div>}
      </div>
      <div className="chat-compose">
        <textarea value={text} onChange={e => setText(e.target.value)} placeholder="针对当前研究问题继续提问…" aria-label="对话输入"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
        <div className="chat-footer">
          <span className="tiny-caption">{reason && text.trim() ? reason : 'AI 只提供建议，不能确认、采纳或发布'}</span>
          <button className="send-btn" onClick={() => void send()} disabled={Boolean(reason)} title={reason || '发送'} aria-label="发送"><Icon name="send" /></button>
        </div>
      </div>
    </aside>
  )
}

export function ResearchPage() {
  const { ov } = useStore()
  const [sel, setSel] = useState<string>()
  const [chat, setChat] = useState(() => window.innerWidth > 1110)
  const [qModal, setQModal] = useState<Question | 'new'>()
  const [preset, setPreset] = useState<Preset>()
  if (!ov) return <Empty>正在加载项目…</Empty>
  const qs = [...ov.v4.questions].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  const q = qs.find(x => x.id === sel) ?? qs[0]
  const adopted = ov.v4.findings.filter(f => f.adoption === 'adopted').length
  return (
    <>
      <PageHead eyebrow="智能研究" title="智能研究空间"
        actions={<Btn kind="primary" onClick={() => setQModal('new')}><Icon name="plus" />新增问题</Btn>} />
      <div className="research-toolbar">
        <Badge tone="blue">联网：{ov.capabilities.research.mode === 'unverified' ? '待验证' : ov.capabilities.research.available ? '可用' : '不可用'}</Badge>
        <span className="tiny-caption">{ov.capabilities.research.reason}</span>
        <button type="button" className="btn small ghost reopen-chat" onClick={() => setChat(!chat)}><Icon name="message" />{chat ? '收起' : '展开'} AI 助手</button>
      </div>
      <div className={cx('research-grid', !chat && 'chat-collapsed')}>
        <aside className="card research-left">
          <div className="micro-title">研究问题（{qs.length}）</div>
          {qs.map(x => <button key={x.id} className={cx('topic', x.id === q?.id && 'active')} onClick={() => setSel(x.id)}><span className="topic-dot" />{x.title}
            <Badge tone={Q_STATUS[x.status][1]}>{Q_STATUS[x.status][0]}</Badge></button>)}
          <button className="topic" onClick={() => setQModal('new')}><Icon name="plus" />新增问题</button>
          <div className="thin-rule" />
          <div className="micro-title">知识沉淀</div>
          <div className="tiny-caption" style={{ padding: '0 9px' }}>已采纳 {adopted} 条 · 候选 {ov.v4.findings.filter(f => f.adoption === 'candidate').length} 条</div>
        </aside>
        <article className="card">
          {q ? <ReportPanel q={q} onEdit={() => setQModal(q)} onSave={setPreset} />
            : <div className="report"><Empty>还没有研究问题。点击“新增问题”，可关联需求并限定资料范围。</Empty></div>}
        </article>
        <AssistantPanel q={q} onClose={() => setChat(false)} />
      </div>
      <QuestionModal q={qModal === 'new' ? undefined : qModal} open={Boolean(qModal)} onClose={() => setQModal(undefined)} />
      <FindingModal q={q} preset={preset} onClose={() => setPreset(undefined)} />
    </>
  )
}
