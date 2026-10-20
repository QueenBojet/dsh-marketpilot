/** 工作台 and 我的项目: project list, creation and selection (no project context needed). */
import { useCallback, useEffect, useState } from 'react'
import { get, post } from '../api.ts'
import { Icon } from '../icons.tsx'
import { go } from '../shell.tsx'
import { errText, useStore } from '../store.tsx'
import type { Project } from '../types.ts'
import { Badge, Btn, Empty, Field, Modal, PageHead, Panel, fmtTime } from '../ui.tsx'

const STATUS: Record<string, [string, 'gray' | 'blue' | 'teal' | 'warn']> = {
  draft: ['草稿 · 待澄清', 'gray'],
  requirements_ready: ['需求已确认', 'blue'],
  researching: ['定向研究中', 'blue'],
  alternatives_ready: ['方案待决策', 'warn'],
  decision_confirmed: ['路线已确认', 'teal'],
  solution_ready: ['方案已就绪', 'teal'],
  tender_review: ['投标审核', 'teal'],
  archived: ['已归档', 'gray'],
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
    try { const p = await post<Project>('v4/projects', body); toast('项目已创建，正在进入需求访谈'); onDone(p) } catch (e) { toast(errText(e), 'err') }
  }
  return (
    <Modal open={open} title="新建工程方案项目" subtitle="创建后将默认开启 V4 引导式需求访谈，先澄清目标、边界与验收指标，再进入技术路线探索。" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={!f.name.trim() && '请填写项目名称'} onClick={submit}>创建项目</Btn></>}>
      <Field label="项目名称 *"><input className="text-field" value={f.name} onChange={set('name')} maxLength={200} placeholder="例如：冷链仓储多温区监测与报警系统" autoFocus /></Field>
      <div className="form-two">
        <Field label="客户 / 使用部门"><input className="text-field" value={f.customer} onChange={set('customer')} placeholder="例如：某海工装备部 / 内部合成验证" /></Field>
        <Field label="所属行业"><input className="text-field" value={f.industry} onChange={set('industry')} placeholder="例如：船舶智能系统 / 工业监测" /></Field>
      </div>
      <Field label="典型应用场景"><input className="text-field" value={f.scenario} onChange={set('scenario')} placeholder="例如：室外高湿工况 / 库区多点监测" /></Field>
      <Field label="项目背景说明"><textarea className="text-field" rows={3} value={f.description} onChange={set('description')} placeholder="简述核心痛点、拟解决的问题与初步边界…" /></Field>
    </Modal>
  )
}

function ProjectRows({ list }: { list: Project[] }) {
  return (
    <div className="item-list">
      {list.map(p => {
        const [stLabel, stTone] = STATUS[p.status] ?? [p.status, 'blue']
        return (
          <div key={p.id} className="list-row">
            <span className="list-ic"><Icon name="layers" /></span>
            <div className="grow">
              <b>{p.name}</b>
              <div className="tiny-caption">
                {[p.customer, p.industry, p.scenario].filter(Boolean).join(' · ') || '未填写客户/行业信息'} · 最近更新 {fmtTime(p.updatedAt)}
              </div>
            </div>
            <Badge tone={stTone}>{stLabel}</Badge>
            <div className="actions">
              {p.status === 'draft' ? <Btn small kind="ghost" onClick={() => go('discovery', p.id)}>需求访谈</Btn> : null}
              <Btn small kind="teal" onClick={() => go('overview', p.id)}>进入项目</Btn>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function HomePage({ mode }: { mode: 'home' | 'projects' }) {
  const { list, error, load } = useProjects()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const shown = (list ?? []).filter(p => !q || `${p.name}${p.customer ?? ''}${p.industry ?? ''}${p.scenario ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
  const create = <Btn kind="primary" onClick={() => setOpen(true)}><Icon name="plus" />新建项目</Btn>
  return (
    <>
      {mode === 'home' ? (
        <PageHead eyebrow="ENGINEERING AI WORKBENCH · 工作台" title="工作台"
          lede="覆盖需求访谈、精选资料固化、多路线初筛、分方向研究、人工路线决策、确定性 BOM 成本核算与 Word 模板方案交付。"
          actions={create} />
      ) : (
        <PageHead eyebrow="PROJECT PORTFOLIO · 项目管理" title="我的项目"
          lede="管理所有工程方案项目；既有 V3 项目保持兼容可读，新项目默认启用 V4 引导式探索流程。"
          actions={create} />
      )}
      {error ? <Empty>项目列表加载失败：{error} <Btn small kind="text" onClick={load}>重试</Btn></Empty> : null}
      {mode === 'home' && list ? (
        <div className="summary-grid">
          <div className="summary-box">
            <div className="cap"><Icon name="folder" />工程项目总数</div>
            <div className="val">{list.length}</div>
            <div className="detail">含新流程引导项目与历史兼容项目</div>
          </div>
          <div className="summary-box">
            <div className="cap"><Icon name="shield" />技术路线已确认</div>
            <div className="val">{list.filter(p => p.activeDecisionId).length}</div>
            <div className="detail">已通过 Human Gate 人工确认路线</div>
          </div>
          <div className="summary-box">
            <div className="cap"><Icon name="clock" />最近活跃项目</div>
            <div className="val" style={{ fontSize: 16 }}>{shown[0]?.name ?? '暂无项目'}</div>
            <div className="detail">更新时间：{fmtTime(shown[0]?.updatedAt)}</div>
          </div>
        </div>
      ) : null}
      <Panel title={mode === 'home' ? '最近活跃项目' : `全部工程项目（${list?.length ?? 0}）`}
        subtitle="点击“进入项目”查看项目总览与 7 步工程流转进度，或新建项目直接开启需求访谈。"
        extra={<input className="text-field" style={{ width: 220 }} placeholder="搜索名称 / 客户 / 行业" value={q} onChange={e => setQ(e.target.value)} aria-label="搜索项目" />}>
        {!list ? <Empty>正在加载…</Empty> : shown.length ? <ProjectRows list={mode === 'home' ? shown.slice(0, 8) : shown} />
          : <Empty>{list.length ? '没有匹配的项目。' : '还没有项目。点击右上角“新建项目”开始。'}</Empty>}
      </Panel>
      <CreateModal open={open} onClose={() => setOpen(false)} onDone={p => { setOpen(false); void load(); go('discovery', p.id) }} />
    </>
  )
}

/** Pid-dependent pages render this when no project is chosen. */
export function NeedProject() {
  return <><PageHead eyebrow="项目工作区" title="请先选择项目" /><Empty>该工作区需要一个项目。<a href="#/projects">前往“我的项目”</a></Empty></>
}
