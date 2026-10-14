import { useState } from 'react'
import { get, post, put, pp } from '../api.ts'
import { useStore } from '../store.tsx'
import { Badge, Btn, Field, Modal, Panel } from '../ui.tsx'
import type { SupportNote } from '../types.ts'

const categories = { fact: '必要事实', constraint: '工程约束', acceptance: '验收指标', interface: '接口条件', risk: '风险与待核实' }
export function SupportPanel() {
  const { ov, pid, act, run, active } = useStore()
  const [edit, setEdit] = useState<SupportNote | 'new'>()
  const [form, setForm] = useState({ category: 'fact', title: '', content: '', relevance: '', documentId: '', quote: '', locator: '' })
  const [source, setSource] = useState('')
  const open = (note: SupportNote | 'new') => {
    setEdit(note); setSource('')
    setForm(note === 'new' ? { category: 'fact', title: '', content: '', relevance: '', documentId: '', quote: '', locator: '' } : { ...note, documentId: note.documentId ?? '', quote: note.quote ?? '', locator: note.locator ?? '' })
  }
  const save = async () => {
    const body = { category: form.category, title: form.title, content: form.content, relevance: form.relevance,
      ...form.documentId ? { documentId: form.documentId, quote: form.quote, locator: form.locator } : {} }
    const out = await act(() => edit !== 'new' && edit ? put(pp(pid!, `support-notes/${edit.id}`), body) : post(pp(pid!, 'support-notes'), body), '摘要草稿已保存')
    if (out) setEdit(undefined)
  }
  const field = (key: 'title' | 'content' | 'relevance' | 'quote' | 'locator', label: string, rows = 2) => <Field label={label}><textarea className="text-field" rows={rows} value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></Field>
  return <Panel title="精选支撑摘要" extra={<Btn small kind="primary" onClick={() => open('new')}>新增结构化摘要</Btn>}>
    <p className="boxnote">只保留会影响需求、路线或交付的必要信息：内容、适用范围/用途和原文依据。草稿经人工固化后才用于后续 AI 工作。</p>
    {(ov!.v4.supportNotes ?? []).map(n => <div className="stack-card" key={n.id} style={{ padding: 16, marginTop: 10 }}><Badge tone={n.status === 'fixed' ? 'teal' : 'warn'}>{n.status === 'fixed' ? '已固化' : '草稿'}</Badge> {categories[n.category]}<h3>{n.title}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{n.content}</p><p>用途：{n.relevance}</p><small>{n.documentId ? ov!.documents.find(d => d.id === n.documentId)?.name : '人工补充'} {n.locator}</small><div className="actions"><Btn small kind="ghost" onClick={() => open(n)}>编辑摘要</Btn><Btn small kind="teal" disabled={active ? '已有运行进行中' : n.status === 'fixed' ? '已固化' : ''} onClick={() => run('marketpilot_v4_support_fix', { noteId: n.id }, { ok: '支撑摘要已人工固化' }).then(() => {})}>人工固化</Btn></div></div>)}
    <Modal open={!!edit} title="结构化支撑摘要" wide onClose={() => setEdit(undefined)} actions={<><Btn kind="ghost" onClick={() => setEdit(undefined)}>取消</Btn><Btn kind="primary" disabled={!form.title.trim() || !form.content.trim() || !form.relevance.trim() ? '请填写标题、必要内容与用途' : ''} onClick={save}>保存摘要草稿</Btn></>}>
      <Field label="信息类别"><select className="text-field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{Object.entries(categories).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
      {field('title', '摘要标题', 1)}{field('content', '必要内容', 4)}{field('relevance', '适用范围与后续用途')}
      <Field label="依据资料"><select className="text-field" value={form.documentId} onChange={async e => {
        const documentId = e.target.value; setForm({ ...form, documentId, quote: '', locator: '' }); setSource('')
        if (documentId) { const d = await act(() => get<{ textContent: string }>(pp(pid!, `documents/${documentId}`))); if (d) setSource(d.textContent) }
      }}><option value="">人工补充（不声明原文依据）</option>{ov!.documents.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}</select></Field>
      {source ? <pre className="source-text">{source}</pre> : null}
      {form.documentId ? <>{field('quote', '原文摘录（需在资料中可定位）', 3)}{field('locator', '原文位置', 1)}</> : null}
    </Modal>
  </Panel>
}
