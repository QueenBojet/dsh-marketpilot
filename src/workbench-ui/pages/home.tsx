/** 工作台 and 我的项目: project list, creation and selection (no project context needed). */
import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../api.ts'
import { Icon } from '../icons.tsx'
import { go } from '../shell.tsx'
import { errText, useStore } from '../store.tsx'
import type { Project } from '../types.ts'
import { Badge, Btn, Empty, Field, Modal, PageHead, Panel, fmtTime } from '../ui.tsx'

const STATUS: Record<string, string> = {
  draft: '草稿', requirements_ready: '需求已确认', researching: '研究中', alternatives_ready: '方案待决策',
  decision_confirmed: '路线已确认', solution_ready: '方案已就绪', tender_review: '投标审核', archived: '已归档',
}

function useProjects() {
  const [list, setList] = useState<Project[]>()
  const [error, setError] = useState<string>()
  const load = useCallback(async () => {
    try { setList((await get<{ projects: Project[] }>('v4/projects')).projects); setError(undefined) } catch (e) { setError(errText(e)) }
  }, [])
  useEffect(() => { void load() }, [load])
  return { list, error, load }
}

function CreateModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (p: Project) => void }) {
  const { toast } = useStore()
  const [f, setF] = useState({ name: '', customer: '', industry: '', scenario: '', description: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const submit = async () => {
    const body: Record<string, string> = {}
    for (const [k, v] of Object.entries(f)) if (v.trim()) body[k] = v.trim()
    try { const p = await post<Project>('v4/projects', body); toast('项目已创建'); onDone(p) } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <Modal open={open} title="新建项目" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={!f.name.trim() && '请填写项目名称'} onClick={submit}>创建项目</Btn></>}>
      <Field label="项目名称 *"><input className="text-field" value={f.name} onChange={set('name')} maxLength={200} autoFocus /></Field>
      <div className="form-two">
        <Field label="客户"><input className="text-field" value={f.customer} onChange={set('customer')} /></Field>
        <Field label="行业"><input className="text-field" value={f.industry} onChange={set('industry')} /></Field>
      </div>
      <Field label="应用场景"><input className="text-field" value={f.scenario} onChange={set('scenario')} /></Field>
      <Field label="说明"><textarea className="text-field" rows={3} value={f.description} onChange={set('description')} /></Field>
    </Modal>
  )
}

function ProjectRows({ list }: { list: Project[] }) {
  return (
    <div className="item-list">
      {list.map(p => (
        <div key={p.id} className="list-row">
          <span className="list-ic"><Icon name="layers" /></span>
          <div className="grow">
            <b>{p.name}</b>
            <div className="tiny-caption">{[p.customer, p.industry, p.scenario].filter(Boolean).join(' · ') || '未填写客户/行业'} · 更新 {fmtTime(p.updatedAt)}</div>
          </div>
          <Badge tone={p.status === 'draft' ? 'gray' : 'blue'}>{STATUS[p.status] ?? p.status}</Badge>
          <Btn small kind="teal" onClick={() => go('overview', p.id)}>进入项目</Btn>
        </div>
      ))}
    </div>
  )
}

export function HomePage({ mode }: { mode: 'home' | 'projects' }) {
  const { list, error, load } = useProjects()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const shown = (list ?? []).filter(p => !q || `${p.name}${p.customer ?? ''}${p.industry ?? ''}`.includes(q))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const create = <Btn kind="primary" onClick={() => setOpen(true)}><Icon name="plus" />新建项目</Btn>
  return (
    <>
      {mode === 'home' ? (
        <PageHead eyebrow="工作台" title="工作台" actions={create} />
      ) : <PageHead eyebrow="项目" title="我的项目" actions={create} />}
      {error ? <Empty>项目列表加载失败：{error} <Btn small kind="text" onClick={load}>重试</Btn></Empty> : null}
      {mode === 'home' && list ? (
        <div className="summary-grid">
          <div className="summary-box"><div className="cap"><Icon name="folder" />项目</div><div className="val">{list.length}</div></div>
          <div className="summary-box"><div className="cap"><Icon name="check" />路线已确认</div><div className="val">{list.filter(p => p.activeDecisionId).length}</div></div>
          <div className="summary-box"><div className="cap"><Icon name="clock" />最近更新</div><div className="val" style={{ fontSize: 15 }}>{fmtTime(shown[0]?.updatedAt)}</div><div className="detail">{shown[0]?.name ?? '暂无项目'}</div></div>
        </div>
      ) : null}
      <Panel title={mode === 'home' ? '最近项目' : `全部项目（${list?.length ?? 0}）`}
        extra={<input className="text-field" style={{ width: 200 }} placeholder="搜索名称/客户/行业" value={q} onChange={e => setQ(e.target.value)} aria-label="搜索项目" />}>
        {!list ? <Empty>正在加载…</Empty> : shown.length ? <ProjectRows list={mode === 'home' ? shown.slice(0, 6) : shown} />
          : <Empty>{list.length ? '没有匹配的项目。' : '还没有项目。点击“新建项目”开始。'}</Empty>}
      </Panel>
      <CreateModal open={open} onClose={() => setOpen(false)} onDone={p => { setOpen(false); void load(); go('discovery', p.id) }} />
    </>
  )
}

/** Pid-dependent pages render this when no project is chosen. */
export function NeedProject() {
  return <><PageHead eyebrow="项目工作区" title="请先选择项目" /><Empty>该工作区需要一个项目。<a href="#/projects">前往“我的项目”</a></Empty></>
}
