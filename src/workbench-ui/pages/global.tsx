/** Global pages: 研究资料库 (sources/findings/evidence), 运行记录 (runs + executions) and 设置 (model precedence). */
import { useEffect, useState } from 'react'
import { cancelRun, get, pp } from '../api.ts'
import { Icon } from '../icons.tsx'
import { href } from '../shell.tsx'
import { useStore } from '../store.tsx'
import type { Finding, Run } from '../types.ts'
import { Badge, Btn, Empty, PageHead, Panel, ROUTE_SRC, WEB_STATUS, cx, fmtTime } from '../ui.tsx'
import { NeedProject } from './home.tsx'

const ADOPTION: Record<Finding['adoption'], [string, 'blue' | 'teal' | 'red']> = { candidate: ['候选', 'blue'], adopted: ['已采纳', 'teal'], rejected: ['已拒绝', 'red'] }
const VERIFY: Record<Finding['verification'], [string, 'warn' | 'teal' | 'red']> = { unverified: ['未核实', 'warn'], verified: ['已核实', 'teal'], disputed: ['有争议', 'red'] }
const safeUrl = (u: string) => /^https?:\/\//i.test(u) ? u : undefined

export function LibraryPage() {
  const { ov, pid } = useStore()
  const [tab, setTab] = useState<'sources' | 'findings' | 'evidence'>('sources')
  const [q, setQ] = useState('')
  if (!pid) return <NeedProject />
  if (!ov) return <Empty>正在加载项目…</Empty>
  const m = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase())
  const sources = ov.v4.sources.filter(s => m(`${s.title}${s.url}`))
  const findings = ov.v4.findings.filter(f => m(`${f.statement}${f.conditions ?? ''}`))
  const evidence = ov.evidence.filter(e => m(`${e.title}${e.statement}`))
  const tabs = [['sources', `网页来源（${ov.v4.sources.length}）`], ['findings', `研究结论（${ov.v4.findings.length}）`], ['evidence', `V3 证据（${ov.evidence.length}）`]] as const
  const srcName = (f: Finding) => f.source.type === 'web' ? ov.v4.sources.find(s => s.id === f.source.sourceId)?.title ?? '网页来源'
    : f.source.type === 'document' ? ov.documents.find(d => d.id === f.source.documentId)?.name ?? '项目资料' : f.source.type === 'report' ? '研究报告' : '无来源'
  return (
    <>
      <PageHead eyebrow="研究资料库" title={`${ov.project.name} · 研究资料`}
        actions={<a className="btn primary" href={href('research', pid)}><Icon name="microscope" />去智能研究</a>} />
      <Panel title="资料" extra={<>
        <div className="segment">{tabs.map(([k, t]) => <button key={k} type="button" className={cx(tab === k && 'active')} onClick={() => setTab(k)}>{t}</button>)}</div>
        <input className="text-field" style={{ width: 200 }} placeholder="搜索" aria-label="搜索资料" value={q} onChange={e => setQ(e.target.value)} />
      </>}>
        {tab === 'sources' ? (sources.length ? <div className="table-scroll"><table className="data-table">
          <thead><tr><th>来源</th><th>状态</th><th>抓取时间</th><th>内容指纹</th></tr></thead>
          <tbody>{sources.map(s => (
            <tr key={s.id}>
              <td className="main-cell"><strong>{s.title || s.url}</strong>
                <small>{safeUrl(s.url) ? <a href={safeUrl(s.url)} target="_blank" rel="noopener noreferrer">{s.url}</a> : s.url}</small>
                {s.error ? <div className="tiny-caption">失败原因：{s.error}</div> : null}</td>
              <td><Badge tone={s.status === 'fetched' ? 'teal' : 'red'}>{s.status === 'fetched' ? '正文已抓取' : '抓取失败（不计为来源）'}</Badge></td>
              <td>{fmtTime(s.fetchedAt)}</td>
              <td className="tiny-caption">{s.contentHash ? s.contentHash.slice(0, 12) : '—'}</td>
            </tr>))}</tbody></table></div> : <Empty>暂无网页来源。联网研究成功抓取正文后会出现在这里。</Empty>) : null}
        {tab === 'findings' ? (findings.length ? <div className="item-list">{findings.map(f => (
          <div key={f.id} className="list-row">
            <div className="grow"><b>{f.statement}</b>
              <div className="tiny-caption">{f.origin === 'ai' ? 'AI 提出' : '人工录入'} · 来源：{srcName(f)}{f.source.locator ? ` · ${f.source.locator}` : ''}{f.conditions ? ` · 适用条件：${f.conditions}` : ''}</div>
              {f.needsReview ? <div className="tiny-caption">⚠ 需重新复核{f.reviewReason ? `：${f.reviewReason}` : ''}</div> : null}</div>
            <Badge tone={ADOPTION[f.adoption][1]}>{ADOPTION[f.adoption][0]}</Badge>
            <Badge tone={VERIFY[f.verification][1]}>{VERIFY[f.verification][0]}</Badge>
          </div>))}</div> : <Empty>暂无研究结论。在“智能研究”中保存结论后会出现在这里。</Empty>) : null}
        {tab === 'evidence' ? (evidence.length ? <div className="item-list">{evidence.map(e => (
          <div key={e.id} className="list-row">
            <div className="grow"><b>{e.title}</b><div className="tiny-caption">{e.statement.slice(0, 160)}</div>
              <div className="tiny-caption">{e.sourceName ?? e.sourceType}{e.sourceUrl && safeUrl(e.sourceUrl) ? <> · <a href={safeUrl(e.sourceUrl)} target="_blank" rel="noopener noreferrer">原网页</a></> : null}</div></div>
            <Badge tone="gray">{e.status}</Badge>
          </div>))}</div> : <Empty>暂无 V3 证据记录。</Empty>) : null}
      </Panel>
    </>
  )
}
const RUN_KIND: Record<Run['kind'], string> = { chat: 'AI 对话', research: '智能研究', deep_change: '深度变更分析', section_revision: '章节修订建议', discovery: '需求访谈', brainstorm: '路线头脑风暴', document_draft: '按模板撰写' }
const RUN_STATUS: Record<string, [string, 'blue' | 'teal' | 'red' | 'gray' | 'warn']> = {
  running: ['运行中', 'blue'], waiting_human: ['等待人工确认', 'warn'], completed: ['已完成', 'teal'], failed: ['失败', 'red'], cancelled: ['已取消', 'gray'],
}

export function RunsPage() {
  const { ov, pid, act } = useStore()
  if (!pid) return <NeedProject />
  if (!ov) return <Empty>正在加载项目…</Empty>
  const runs = [...ov.v4.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const execs = [...ov.executions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  const cancel = (callId: string) => act(() => cancelRun(callId), '已请求取消运行')
  return (
    <>
      <PageHead eyebrow="运行记录" title={`${ov.project.name} · 运行记录`} />
      <Panel title={`AI 运行（${runs.length}）`}>
        {runs.length ? <div className="table-scroll"><table className="data-table">
          <thead><tr><th>运行</th><th>状态</th><th>实际模型</th><th>路由来源</th><th>联网</th><th>来源数</th><th>时间</th></tr></thead>
          <tbody>{runs.map(r => (
            <tr key={r.id}>
              <td className="main-cell"><strong>{RUN_KIND[r.kind]}{r.mode ? ` · ${r.mode}` : ''}</strong>
                {r.note ? <small>{r.note}</small> : null}{r.error ? <div className="tiny-caption">错误：{r.error}</div> : null}</td>
              <td><Badge tone={RUN_STATUS[r.status]![1]}>{RUN_STATUS[r.status]![0]}</Badge></td>
              <td>{r.modelRoute.source === 'none' ? '—' : `${r.modelRoute.provider} / ${r.modelRoute.model}${r.modelRoute.reasoningEffort ? ` (${r.modelRoute.reasoningEffort})` : ''}`}</td>
              <td>{ROUTE_SRC[r.modelRoute.source] ?? r.modelRoute.source}</td>
              <td>{WEB_STATUS[r.webStatus] ?? r.webStatus}</td>
              <td>{r.sourceIds.length}</td>
              <td className="tiny-caption">{fmtTime(r.startedAt)}{r.completedAt ? ` → ${fmtTime(r.completedAt)}` : ''}</td>
            </tr>))}</tbody></table></div> : <Empty>暂无 AI 运行记录。</Empty>}
      </Panel>
      <div className="section-spacer" />
      <Panel title={`工具执行（${execs.length}）`} extra={<span className="tiny-caption">服务重启后，未完成的执行会被标记为已中断</span>}>
        {execs.length ? <div className="item-list">{execs.map(x => (
          <div key={x.callId} className="list-row">
            <div className="grow"><b>{x.tool}</b><div className="tiny-caption">{fmtTime(x.startedAt)}{x.error ? ` · ${x.error}` : ''}{x.question ? ` · 待确认：${x.question.question}` : ''}</div></div>
            <Badge tone={RUN_STATUS[x.status]![1]}>{RUN_STATUS[x.status]![0]}</Badge>
            {x.status === 'running' || x.status === 'waiting_human'
              ? <button type="button" className="mini-action" onClick={() => void cancel(x.callId)}>取消</button> : null}
          </div>))}</div> : <Empty>暂无工具执行记录。</Empty>}
      </Panel>
    </>
  )
}
export function SettingsPage() {
  const { ov, selection, catalog, catalogError, reloadModels } = useStore()
  const caps = ov?.capabilities
  return <>
    <PageHead eyebrow="设置" title="设置" />
    <div className="dual-grid">
      <Panel title="模型供应商" extra={<Btn small kind="ghost" onClick={reloadModels}>刷新</Btn>}>
        <p className="settings-caption">与 DSH 配置同步。模型与思考强度在右上角切换。</p>
        {catalogError ? <div role="alert" className="boxnote">{catalogError}</div> : !catalog ? <Empty>读取中…</Empty> :
          catalog.providers.length ? catalog.providers.map(p => <div className="provider-row" key={p.id}>
            <div className="provider-monogram">{p.name.slice(0, 1).toUpperCase()}</div><div className="grow"><strong>{p.name}</strong>{p.name !== p.id ? <small>{p.id}</small> : null}</div>
            <Badge tone={p.id === selection?.provider ? 'blue' : 'gray'}>{p.id === selection?.provider ? '使用中' : '已配置'}</Badge>
          </div>) : <Empty>请先在 DSH 中配置模型供应商，再点击刷新。</Empty>}
      </Panel>
      <Panel title="连接状态">
        <div className="dtl-row"><strong>当前模型</strong><span>{selection ? `${selection.provider} / ${selection.model}` : '未选择'}</span></div>
        {selection?.reasoningEffort ? <div className="dtl-row"><strong>思考强度</strong><span>{selection.reasoningEffort}</span></div> : null}
        {caps ? <div className="dtl-row"><strong>联网研究</strong><Badge tone={caps.research.available ? 'teal' : 'warn'}>{caps.research.mode === 'unverified' ? '待验证' : caps.research.available ? '已连接' : '未连接'}</Badge></div> : null}
        {caps && !caps.research.available ? <details className="connection-detail"><summary>查看连接详情</summary><p>{caps.research.reason}</p></details> : null}
      </Panel>
    </div>
  </>
}
