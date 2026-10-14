/** 项目总览: KPIs, pending work, current baseline, recent activity and publish readiness. */
import type { ReactNode } from 'react'
import { Icon } from '../icons.tsx'
import { href } from '../shell.tsx'
import { useStore } from '../store.tsx'
import type { Overview } from '../types.ts'
import { Badge, Empty, PageHead, Panel, REVIEW, fmtTime } from '../ui.tsx'

interface Ev { at: string; title: string; note: string }

/** Activity is derived from real records only: runs, executions, batches, reviews and baselines. */
function timeline(ov: Overview): Ev[] {
  const ev: Ev[] = []
  for (const b of ov.v4.intakeBatches) ev.push({ at: b.createdAt ?? '', title: `收到资料：${b.label}`, note: `${b.documentIds.length} 个文件 · ${b.status}` })
  for (const r of ov.v4.runs) ev.push({ at: r.startedAt, title: `${({ chat: 'AI 对话', research: '研究运行', deep_change: '深度变更分析', section_revision: '章节修订' })[r.kind]}`, note: `${r.status} · ${r.modelRoute.provider}/${r.modelRoute.model}` })
  for (const d of ov.decisions) ev.push({ at: d.confirmedAt, title: '人工确认技术路线', note: `${ov.alternatives.find(a => a.id === d.alternativeId)?.name ?? d.alternativeId} · ${d.confirmedBy}` })
  for (const b of ov.baselines) ev.push({ at: b.createdAt ?? '', title: `发布正式版本 ${b.label}`, note: `${b.type === 'full' ? '完整基线' : '技术基线'} · ${b.review.reviewer}` })
  return ev.filter(e => e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
}

export function OverviewPage() {
  const { ov, pid } = useStore()
  if (!ov || !pid) return <Empty>正在加载项目…</Empty>
  const reqs = ov.requirements.filter(r => r.status !== 'superseded')
  const confirmed = reqs.filter(r => r.status === 'confirmed').length
  const pending = ov.v4.changes.filter(c => c.status === 'pending')
  const route = ov.alternatives.find(a => a.id === ov.route.draftAlternativeId)
  const latest = [...ov.baselines].sort((a, b) => b.number - a.number)[0]
  const findings = ov.v4.findings.filter(f => f.adoption === 'adopted').length
  const reviews = Object.values(ov.cost.reviews).filter(r => r === 'valid').length
  const events = timeline(ov)
  const todo: { text: string; to: string; page: Parameters<typeof href>[0] }[] = []
  if (pending.length) todo.push({ text: `${pending.length} 条候选变更待人工处理`, to: '去处理', page: 'change' })
  if (reqs.length - confirmed) todo.push({ text: `${reqs.length - confirmed} 条需求尚未确认`, to: '去确认', page: 'change' })
  if (!ov.route.confirmed) todo.push({ text: route ? '草稿路线与已确认决策不一致，需重新确认' : '尚未选择技术路线', to: '去决策', page: 'solution' })
  if (ov.v4.findings.some(f => f.needsReview)) todo.push({ text: '部分研究结论因输入变化需要复核', to: '去复核', page: 'research' })
  for (const d of ov.docs) if (d.review === 'stale') todo.push({ text: `文档《${d.doc.title}》审核已失效`, to: '去审核', page: 'deliver' })
  return (
    <>
      <PageHead eyebrow="项目总览" title={ov.project.name}
        lede={[ov.project.customer, ov.project.industry, ov.project.scenario].filter(Boolean).join(' · ') || ov.project.description || '未填写项目描述'}
        actions={<a className="btn primary" href={href('change', pid)}><Icon name="upload" />上传新资料</a>} />
      <div className="kpi-row">
        <Kpi icon="file" label="需求确认" val={`${confirmed}/${reqs.length}`} foot={<><b>{ov.documents.length}</b> 份资料</>} />
        <Kpi icon="microscope" label="已采纳研究结论" val={String(findings)} foot={<>{ov.v4.questions.length} 个研究问题</>} />
        <Kpi icon="layers" label="技术路线" val={route ? (ov.route.confirmed ? '已确认' : '待确认') : '未选择'} foot={route?.name ?? `${ov.alternatives.length} 个候选方案`} />
        <Kpi icon="coins" label="成本审核" val={`${reviews}/3`} foot={ov.cost.result.totalDisplay ?? '暂无合计（价格或汇率不完整）'} />
      </div>
      <div className="overview-grid">
        <div>
          {pending.length ? (
            <div className="change-card">
              <span className="circle-icon"><Icon name="diff" /></span>
              <div className="grow"><h3>检测到 {pending.length} 条候选变更</h3>
                <p>{pending.slice(0, 3).map(c => c.summary).join('；')}{pending.length > 3 ? '…' : ''}。候选变更需要人工采纳后才会写入需求。</p>
                <a className="btn small primary" href={href('change', pid)}>查看并处理</a></div>
            </div>
          ) : null}
          <div className="section-spacer" />
          <Panel title="待办事项">
            {todo.length ? <div className="item-list">{todo.map(t => (
              <div key={t.text} className="list-row"><span className="list-ic"><Icon name="check" /></span><div className="grow">{t.text}</div>
                <a className="btn small teal" href={href(t.page, pid)}>{t.to}</a></div>))}</div> : <Empty>当前没有阻塞事项。</Empty>}
          </Panel>
          <div className="section-spacer" />
          <Panel title="发布前检查">
            {(['technical', 'full'] as const).map(t => (
              <div key={t} className="list-row"><span className="list-ic"><Icon name="shield" /></span>
                <div className="grow"><b>{t === 'technical' ? '技术基线' : '完整基线'}</b>
                  <div className="tiny-caption">{ov.checks[t].length ? ov.checks[t].join(' ') : '检查通过，可在“文档与交付”中由人工发布。'}</div></div>
                <Badge tone={ov.checks[t].length ? 'warn' : 'teal'}>{ov.checks[t].length ? `${ov.checks[t].length} 项阻塞` : '可发布'}</Badge></div>
            ))}
          </Panel>
        </div>
        <div className="right-panel-stack">
          <div className="baseline">
            <div className="smallcap">当前正式版本</div>
            <div className="baseline-title">{latest ? latest.label : '尚未发布'}</div>
            <p>{latest ? `${latest.type === 'full' ? '完整基线' : '技术基线'} · ${fmtTime(latest.createdAt)} · ${latest.review.reviewer} 发布。正式版本不可修改。` : '草稿持续保存；只有人工发布才会形成 V1/V2 正式版本。'}</p>
            <div className="inline"><span className="tag">{ov.baselines.length} 个版本</span><a href={href('deliver', pid)}>版本与对比 →</a></div>
          </div>
          <Panel title="文档状态">
            {ov.docs.length ? ov.docs.map(d => (
              <div key={d.doc.id} className="list-row"><span className="list-ic"><Icon name="book" /></span><div className="grow">{d.doc.title}<div className="tiny-caption">修订 {d.doc.revisionNo}{d.exported ? ' · 已导出' : ''}{d.doc.sent.length ? ' · 已对外发送' : ''}</div></div>
                <Badge tone={REVIEW[d.review]![1] === 'red' ? 'red' : REVIEW[d.review]![1] === 'teal' ? 'teal' : 'gray'}>{REVIEW[d.review]![0]}</Badge></div>
            )) : <Empty>尚未创建文档。</Empty>}
          </Panel>
          <Panel title="最近动态">
            {events.length ? <div className="mini-timeline">{events.map((e, i) => (
              <div key={i} className="event"><span className="event-dot" /><div><b>{e.title}</b><small>{fmtTime(e.at)} · {e.note}</small></div></div>))}</div>
              : <Empty>暂无记录。</Empty>}
          </Panel>
        </div>
      </div>
    </>
  )
}

function Kpi(p: { icon: string; label: string; val: string; foot: ReactNode }) {
  return <div className="card kpi"><div className="kpi-top">{p.label}<span className="sym"><Icon name={p.icon} /></span></div><div className="kpi-val">{p.val}</div><div className="kpi-foot">{p.foot}</div></div>
}
