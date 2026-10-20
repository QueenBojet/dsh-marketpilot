import { useState } from 'react'
import { get, post, put, pp } from '../api.ts'
import { Icon } from '../icons.tsx'
import { useStore } from '../store.tsx'
import { Badge, Btn, Empty, Field, Modal, Panel, fmtTime } from '../ui.tsx'
import type { SupportNote } from '../types.ts'

const categories: Record<SupportNote['category'], [string, 'blue' | 'warn' | 'teal' | 'red']> = {
  fact: ['必要事实', 'blue'],
  constraint: ['工程约束', 'warn'],
  acceptance: ['验收指标', 'teal'],
  interface: ['接口条件', 'blue'],
  risk: ['风险与待核实', 'red'],
}

const selectedText = () => (window.getSelection()?.toString() ?? '').trim()
const squash = (s: string) => s.replace(/\s+/g, '')

export function SupportPanel() {
  const { ov, pid, act, run, active } = useStore()
  const [edit, setEdit] = useState<SupportNote | 'new'>()
  const [form, setForm] = useState({ category: 'fact' as SupportNote['category'], title: '', content: '', relevance: '', documentId: '', quote: '', locator: '' })
  const [source, setSource] = useState('')

  const open = async (note: SupportNote | 'new') => {
    setEdit(note)
    setSource('')
    if (note === 'new') {
      setForm({ category: 'fact', title: '', content: '', relevance: '', documentId: '', quote: '', locator: '' })
    } else {
      setForm({
        category: note.category, title: note.title, content: note.content, relevance: note.relevance,
        documentId: note.documentId ?? '', quote: note.quote ?? '', locator: note.locator ?? '',
      })
      if (note.documentId) {
        const d = await act(() => get<{ textContent: string }>(pp(pid!, `documents/${note.documentId}`)))
        if (d) setSource(d.textContent)
      }
    }
  }

  const save = async () => {
    const body = {
      category: form.category, title: form.title.trim(), content: form.content.trim(), relevance: form.relevance.trim(),
      ...form.documentId ? { documentId: form.documentId, quote: form.quote.trim(), locator: form.locator.trim() } : {},
    }
    const out = await act(
      () => edit !== 'new' && edit ? put(pp(pid!, `support-notes/${edit.id}`), body) : post(pp(pid!, 'support-notes'), body),
      '摘要草稿已保存；请点击“人工固化”使其生效'
    )
    if (out) setEdit(undefined)
  }

  const notes = ov!.v4.supportNotes ?? []
  const fixedCount = notes.filter(n => n.status === 'fixed').length
  const quoteMatched = !form.documentId || (Boolean(form.quote.trim()) && Boolean(source) && squash(source).includes(squash(form.quote)))
  const saveDisabled = !form.title.trim() || !form.content.trim() || !form.relevance.trim()
    ? '请填写标题、必要内容与用途'
    : form.documentId && !form.quote.trim()
      ? '关联资料时必须提供原文摘录'
      : form.documentId && source && !quoteMatched
        ? '原文摘录在所选资料中未定位到，请从上方原文选中填入'
        : ''

  const field = (key: 'title' | 'content' | 'relevance' | 'quote' | 'locator', label: string, rows = 2, placeholder = '') => (
    <Field label={label}>
      <textarea className="text-field" rows={rows} value={form[key]} placeholder={placeholder} onChange={e => setForm({ ...form, [key]: e.target.value })} />
    </Field>
  )

  return (
    <Panel
      title={`精选支撑摘要（${fixedCount}/${notes.length} 已固化）`}
      subtitle="只提炼会影响需求、技术路线或交付的必要事实、约束、接口和验收信息。草稿经人工固化后才进入 AI 上下文。"
      extra={<Btn small kind="primary" onClick={() => void open('new')}><Icon name="plus" />新增结构化摘要</Btn>}>
      {notes.length ? (
        <div className="flexstack">
          {notes.map(n => {
            const [catLabel, catTone] = categories[n.category] ?? [n.category, 'blue']
            const docName = n.documentId ? ov!.documents.find(d => d.id === n.documentId)?.name : undefined
            return (
              <div className="stack-card" key={n.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div className="actions">
                    <Badge tone={n.status === 'fixed' ? 'teal' : 'warn'}>{n.status === 'fixed' ? '已固化' : '草稿待固化'}</Badge>
                    <Badge tone={catTone}>{catLabel}</Badge>
                  </div>
                  <span className="tiny-caption">
                    {docName ? `${docName}${n.locator ? ` · ${n.locator}` : ''}` : '人工补充（无文档引用）'}
                  </span>
                </div>
                <h3>{n.title}</h3>
                <p style={{ whiteSpace: 'pre-wrap' }}>{n.content}</p>
                {n.quote ? (
                  <div className="research-quote">
                    “{n.quote}”
                    <div className="tiny-caption">{docName ?? '原文摘录'}{n.locator ? ` · ${n.locator}` : ''}</div>
                  </div>
                ) : null}
                <div className="tiny-caption" style={{ marginTop: 6 }}>
                  <strong>适用范围与用途：</strong>{n.relevance}
                  {n.review ? ` · 固化人：${n.review.reviewer} (${fmtTime(n.review.reviewedAt)})` : ''}
                </div>
                <div className="actions" style={{ marginTop: 10 }}>
                  <Btn small kind="ghost" onClick={() => void open(n)}>编辑摘要</Btn>
                  <Btn small kind="teal" disabled={active ? '已有运行进行中' : n.status === 'fixed' ? '已固化' : ''}
                    onClick={() => run('marketpilot_v4_support_fix', { noteId: n.id }, { ok: '支撑摘要已人工固化' }).then(() => {})}>
                    <Icon name="shield" />人工固化
                  </Btn>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Empty>尚无精选支撑摘要。上传客户资料后，点击右上角“新增结构化摘要”提炼关键约束与接口事实并人工固化。</Empty>
      )}

      <Modal open={!!edit} title={edit === 'new' ? '新增结构化支撑摘要' : '编辑结构化支撑摘要'}
        subtitle="关联原始资料时，必须在原文中可逐字定位摘录片段（忽略空白差异）；修改已固化摘要会将其重置为草稿，需重新人工固化。"
        wide onClose={() => setEdit(undefined)}
        actions={<>
          <Btn kind="ghost" onClick={() => setEdit(undefined)}>取消</Btn>
          <Btn kind="primary" showReason disabled={saveDisabled} onClick={save}>保存摘要草稿</Btn>
        </>}>
        <div className="form-two">
          <Field label="信息类别 *">
            <select className="text-field" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as SupportNote['category'] })}>
              {Object.entries(categories).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </Field>
          <Field label="依据资料">
            <select className="text-field" value={form.documentId} onChange={async e => {
              const documentId = e.target.value
              setForm({ ...form, documentId, quote: '', locator: '' })
              setSource('')
              if (documentId) {
                const d = await act(() => get<{ textContent: string }>(pp(pid!, `documents/${documentId}`)))
                if (d) setSource(d.textContent)
              }
            }}>
              <option value="">人工补充（不声明原文依据）</option>
              {ov!.documents.map(d => <option value={d.id} key={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        {field('title', '摘要标题 *', 1, '例如：值班系统报警接口与库外市电条件')}
        {field('content', '必要内容 *', 3, '提炼将影响技术路线、接口或设备选型的核心事实…')}
        {field('relevance', '适用范围与后续用途 *', 2, '例如：用于比较网关集成方案和断网恢复策略')}
        {source ? (
          <>
            <div className="fieldcap" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>资料原文（可在下方框中用鼠标选中文字后点击右侧按钮）</span>
              <Btn small kind="teal" onClick={() => { const s = selectedText(); if (s) setForm({ ...form, quote: s }) }}>使用选中文字填入摘录</Btn>
            </div>
            <pre className="source-text">{source}</pre>
          </>
        ) : null}
        {form.documentId ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
              <span className="tiny-caption">原文定位状态：</span>
              {form.quote.trim() ? (
                <Badge tone={quoteMatched ? 'teal' : 'red'}>
                  {quoteMatched ? '✓ 原文已定位匹配' : '⚠ 原文中未找到该摘录'}
                </Badge>
              ) : <Badge tone="warn">待填写或从上方选中摘录</Badge>}
            </div>
            {field('quote', '原文摘录（需在资料中可定位）*', 3, '粘贴或从上方原文框选中文字填入…')}
            {field('locator', '原文位置（如行号/章节）', 1, '例如：合成资料第3–4行 / 第 2.1 节')}
          </>
        ) : null}
      </Modal>
    </Panel>
  )
}
