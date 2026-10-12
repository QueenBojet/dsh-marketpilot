/** Global pages: 研究资料库 (sources/findings/evidence), 运行记录 (runs + executions) and 设置 (model precedence). */
import { useEffect, useState } from 'react'
import { cancelRun, get, pp, put } from '../api.ts'
import type { Selection } from '../api.ts'
import { Icon } from '../icons.tsx'
import { href } from '../shell.tsx'
import { useStore } from '../store.tsx'
import type { Finding, Run } from '../types.ts'
import { Badge, Btn, Empty, Field, PageHead, Panel, ROUTE_SRC, WEB_STATUS, cx, fmtTime } from '../ui.tsx'
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
        lede="汇总当前项目的网页来源、研究结论与历史证据。只有正文已成功抓取的网页才计为来源；未核实的结论会明确标出。"
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
const RUN_KIND: Record<Run['kind'], string> = { chat: 'AI 对话', research: '智能研究', deep_change: '深度变更分析', section_revision: '章节修订建议' }
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
      <PageHead eyebrow="运行记录" title={`${ov.project.name} · 运行记录`}
        lede="每次 AI 运行都记录实际使用的模型路由（全局默认 → 项目偏好 → 本次指定）、联网状态与来源数量；失败与取消会如实保留。" />
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
interface ModelSelectionInfo { selection: Selection | null; providers: string[]; editable: boolean }
const fmtSel = (s: Selection | null | undefined) => s ? `${s.provider} / ${s.model}${s.reasoningEffort ? `（思考强度 ${s.reasoningEffort}）` : ''}` : '未配置'
const MODEL_MODE: Record<string, string> = { live: '在线可用', offline: '离线（确定性模式）', unavailable: '不可用' }
const RESEARCH_MODE: Record<string, string> = { live: '联网可用', unverified: '仅本地 / 联网未验证', unavailable: '不可用' }

export function SettingsPage() {
  const { ov, pid, act } = useStore()
  const [info, setInfo] = useState<ModelSelectionInfo>()
  const [infoErr, setInfoErr] = useState('')
  const [prov, setProv] = useState('')
  const [model, setModel] = useState('')
  const [eff, setEff] = useState('')
  const [key, setKey] = useState<string>()
  useEffect(() => {
    get<ModelSelectionInfo>('model-selection').then(setInfo, (e: unknown) => setInfoErr(e instanceof Error ? e.message : String(e)))
  }, [])
  const pref = ov?.v4.modelPreference ?? null
  const k = `${pid ?? ''}|${fmtSel(pref)}|${info ? 1 : 0}`
  if (k !== key) {
    setKey(k)
    setProv(pref?.provider ?? info?.selection?.provider ?? ''); setModel(pref?.model ?? ''); setEff(pref?.reasoningEffort ?? '')
  }
  const reason = !pid ? '请先选择项目' : !prov.trim() ? '请选择 Provider' : !model.trim() ? '请填写模型 ID' : ''
  const save = () => act(() => put(pp(pid!, 'model-preference'), { provider: prov.trim(), model: model.trim(), ...eff.trim() ? { reasoningEffort: eff.trim() } : {} }), '项目模型偏好已保存')
  const clear = () => act(() => put(pp(pid!, 'model-preference'), { clear: true }), '已清除项目偏好，改用全局默认')
  const caps = ov?.capabilities
  return (
    <>
      <PageHead eyebrow="设置" title="模型与能力设置"
        lede="模型选择优先级：全局默认 → 项目偏好 → 本次运行指定。每次运行都会记录实际使用的路由，可在“运行记录”中查看。" />
      <div className="dual-grid">
        <Panel title="模型路由">
          <div className="dtl-row"><div><strong>① 全局默认（DSH）</strong><small>由 DSH 配置决定，此处只读</small></div>
            <span>{infoErr ? `读取失败：${infoErr}` : info ? fmtSel(info.selection) : '读取中…'}</span></div>
          <div className="dtl-row"><div><strong>② 项目偏好</strong><small>{pid ? ov?.project.name ?? '' : '未选择项目'}</small></div>
            <span>{pref ? fmtSel(pref) : '未设置（使用全局默认）'}</span></div>
          <div className="dtl-row"><div><strong>③ 本次运行指定</strong><small>在智能研究、对话等运行入口临时选择</small></div><span>仅作用于单次运行</span></div>
          <div className="section-spacer" />
          {pid ? <>
            <div className="micro-title">设置项目偏好</div>
            <div className="form-two">
              <Field label="Provider">{info?.providers.length
                ? <select className="option-select" value={prov} onChange={e => setProv(e.target.value)}>
                  <option value="">（请选择）</option>{info.providers.map(p => <option key={p} value={p}>{p}</option>)}</select>
                : <input className="text-field" value={prov} onChange={e => setProv(e.target.value)} placeholder="未读取到 Provider 列表" />}</Field>
              <Field label="模型 ID"><input className="text-field" value={model} onChange={e => setModel(e.target.value)} /></Field>
              <Field label="思考强度（可选）" hint="留空继承默认"><input className="text-field" value={eff} onChange={e => setEff(e.target.value)} /></Field>
            </div>
            <div className="actions">
              <Btn kind="primary" disabled={reason} showReason onClick={() => { void save() }}>保存项目偏好</Btn>
              <Btn kind="ghost" disabled={pref ? '' : '当前没有项目偏好'} onClick={() => { void clear() }}>清除偏好</Btn>
            </div>
          </> : <NeedProject />}
        </Panel>
        <Panel title="能力状态">
          {caps ? <>
            <div className="dtl-row"><div><strong>模型</strong><small>{caps.model.reason}</small></div>
              <Badge tone={caps.model.mode === 'live' ? 'teal' : caps.model.mode === 'offline' ? 'warn' : 'red'}>{MODEL_MODE[caps.model.mode]}</Badge></div>
            <div className="dtl-row"><div><strong>联网研究</strong><small>{caps.research.reason}</small></div>
              <Badge tone={caps.research.mode === 'live' ? 'teal' : caps.research.mode === 'unverified' ? 'warn' : 'red'}>{RESEARCH_MODE[caps.research.mode]}</Badge></div>
          </> : <Empty>选择项目后显示模型与联网能力状态。</Empty>}
          <div className="reconcile-note" style={{ marginTop: 14 }}><Icon name="shield" /> 不可用的能力对应按钮会被禁用并说明原因；网页只有在正文成功抓取后才计为来源。</div>
        </Panel>
      </div>
    </>
  )
}
