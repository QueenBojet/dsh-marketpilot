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
  for (const r of ov.v4.runs) ev.push({ at: r.startedAt, title: `${({ chat: 'AI 对话', research: '研究运行', deep_change: '深度变更分析', section_revision: '章节修订', discovery: '需求访谈', brainstorm: '路线头脑风暴', document_draft: '按模板撰写' })[r.kind]}`, note: `${r.status} · ${r.modelRoute.provider}/${r.modelRoute.model}` })
  for (const d of ov.decisions) ev.push({ at: d.confirmedAt, title: '人工确认技术路线', note: `${ov.alternatives.find(a => a.id === d.alternativeId)?.name ?? d.alternativeId} · ${d.confirmedBy}` })
  for (const b of ov.baselines) ev.push({ at: b.createdAt ?? '', title: `发布正式版本 ${b.label}`, note: `${b.type === 'full' ? '完整基线' : '技术基线'} · ${b.review.reviewer}` })
  return ev.filter(e => e.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8)
}

export function OverviewPage() {
  const { ov, pid } = useStore()
  if (!ov || !pid) return <Empty>正在加载项目…</Empty>
  const reqs = ov.requirements.filter(r => r.status !== 'superseded')
  const confirmed = reqs.filter(r => r.status === 'confirmed').length
  const fixedNotes = (ov.v4.supportNotes ?? []).filter(n => n.status === 'fixed').length
  const draftNotes = (ov.v4.supportNotes ?? []).filter(n => n.status === 'draft').length
  const pending = ov.v4.changes.filter(c => c.status === 'pending')
  const route = ov.alternatives.find(a => a.id === ov.route.draftAlternativeId)
  const latest = [...ov.baselines].sort((a, b) => b.number - a.number)[0]
  const findings = ov.v4.findings.filter(f => f.adoption === 'adopted').length
  const answeredQs = ov.v4.questions.filter(q => q.status === 'answered').length
  const activeCfg = ov.v4.configItems.filter(c => c.status === 'active').length
  const reviews = Object.values(ov.cost.reviews).filter(r => r === 'valid').length
  const staleCost = Object.values(ov.cost.reviews).some(r => r === 'stale')
  const events = timeline(ov)

  const todo: { text: string; to: string; page: Parameters<typeof href>[0]; tone: 'red' | 'warn' | 'blue' }[] = []
  if (ov.v4.discovery && !ov.discoveryStatus?.confirmed) {
    todo.push({ text: '需求简报尚未人工确认（或修改后已失效），请先完成访谈并确认简报', to: '继续访谈', page: 'discovery', tone: 'warn' })
  }
  if (draftNotes) {
    todo.push({ text: `有 ${draftNotes} 条精选支撑摘要仍为草稿，需人工固化后才作为 AI 依据`, to: '去固化', page: 'change', tone: 'warn' })
  }
  if (pending.length) {
    todo.push({ text: `${pending.length} 条候选变更待人工处理`, to: '去处理', page: 'change', tone: 'warn' })
  }
  if (reqs.length - confirmed) {
    todo.push({ text: `${reqs.length - confirmed} 条待确认需求尚未通过人工确认`, to: '去确认', page: 'change', tone: 'warn' })
  }
  if (ov.v4.discovery && ov.discoveryStatus?.confirmed && !ov.discoveryStatus.initialCurrent) {
    todo.push({ text: '多路线初筛尚未执行或因上游需求/资料变化已失效', to: '去初筛', page: 'solution', tone: 'red' })
  }
  if (ov.v4.questions.some(q => q.status === 'needs_review') || ov.v4.findings.some(f => f.needsReview)) {
    todo.push({ text: '部分研究问题或研究结论因输入变化标记为需复核', to: '去复核', page: 'research', tone: 'warn' })
  }
  if (!ov.route.confirmed) {
    todo.push({
      text: route ? '当前草稿路线与已确认决策不一致（或综合依据已变化），需重新人工确认' : '尚未选择并确认最终技术路线',
      to: '去决策', page: 'solution', tone: ov.route.decision ? 'red' : 'blue',
    })
  }
  if (staleCost) {
    todo.push({ text: '成本审核因配置、单价或汇率变更已失效，需重新人工审核', to: '去审核', page: 'cost', tone: 'red' })
  }
  for (const d of ov.docs) {
    if (d.review === 'stale' || d.outdated.length > 0) {
      todo.push({ text: `文档《${d.doc.title}》因上游数据变化导致章节或审核失效`, to: '去同步审核', page: 'deliver', tone: 'red' })
    }
  }

  return (
    <>
      <PageHead eyebrow="PROJECT OVERVIEW · 项目总览" title={ov.project.name}
        lede={[ov.project.customer, ov.project.industry, ov.project.scenario].filter(Boolean).join(' · ') || ov.project.description || '未填写项目描述'}
        actions={<>
          <a className="btn ghost" href={href('discovery', pid)}><Icon name="chat" />需求访谈</a>
          <a className="btn primary" href={href('change', pid)}><Icon name="upload" />上传新资料</a>
        </>} />
      <div className="kpi-row">
        <Kpi icon="file" label="需求确认" val={`${confirmed}/${reqs.length}`}
          foot={<><b>{ov.documents.length}</b> 份资料 · <b>{fixedNotes}</b> 条固化摘要</>} />
        <Kpi icon="microscope" label="已采纳研究结论" val={String(findings)}
          foot={<><b>{answeredQs}/{ov.v4.questions.length}</b> 份方向研究报告</>} />
        <Kpi icon="layers" label="技术路线" val={route ? (ov.route.confirmed ? '已确认' : '待确认') : '未选择'}
          foot={<>{route?.name ?? `${ov.alternatives.length} 个候选方案`} · <b>{activeCfg}</b> 项配置</>} />
        <Kpi icon="coins" label="成本审核" val={`${reviews}/3`}
          foot={ov.cost.result.totalDisplay ?? '暂无合计（价格或汇率不完整）'} />
      </div>
      <div className="overview-grid">
        <div>
          {pending.length ? (
            <div className="change-card">
              <span className="circle-icon"><Icon name="diff" /></span>
              <div className="grow">
                <h3>检测到 {pending.length} 条候选变更</h3>
                <p>{pending.slice(0, 3).map(c => c.summary).join('；')}{pending.length > 3 ? '…' : ''}。候选变更需要人工采纳后才会写入需求。</p>
                <a className="btn small primary" href={href('change', pid)}>查看并处理</a>
              </div>
            </div>
          ) : null}
          <Panel title={`待办事项与状态阻断（${todo.length}）`} subtitle="系统自动追踪需求、研究、路线、成本与文档的哈希依赖，任何上游变动均在此提示复核。">
            {todo.length ? (
              <div className="item-list">
                {todo.map(t => (
                  <div key={t.text} className="list-row">
                    <span className="list-ic"><Icon name={t.tone === 'red' ? 'alert' : 'check'} /></span>
                    <div className="grow">{t.text}</div>
                    <Badge tone={t.tone}>{t.tone === 'red' ? '失效/阻断' : '待推进'}</Badge>
                    <a className="btn small teal" href={href(t.page, pid)}>{t.to}</a>
                  </div>
                ))}
              </div>
            ) : <Empty>当前没有阻塞事项，所有环节状态有效。</Empty>}
          </Panel>
          <div className="section-spacer" />
          <Panel title="发布前检查" subtitle="技术方案基线（不含商务报价）与完整方案包（含成本核查）分别独立校验。">
            {(['technical', 'full'] as const).map(t => (
              <div key={t} className="list-row">
                <span className="list-ic"><Icon name="shield" /></span>
                <div className="grow">
                  <b>{t === 'technical' ? '技术基线（需求 + 路线 + 配置 + 技术文档）' : '完整基线（技术基线 + 成本明细与审核 + 成本文档）'}</b>
                  <div className="tiny-caption">{ov.checks[t].length ? ov.checks[t].join(' ') : '检查通过，可在“文档与交付”中由人工发布。'}</div>
                </div>
                <Badge tone={ov.checks[t].length ? 'warn' : 'teal'}>{ov.checks[t].length ? `${ov.checks[t].length} 项阻塞` : '可发布'}</Badge>
              </div>
            ))}
          </Panel>
        </div>
        <div className="right-panel-stack">
          <div className="baseline">
            <div className="smallcap">当前正式版本 · IMMUTABLE BASELINE</div>
            <div className="baseline-title">{latest ? latest.label : '尚未发布'}</div>
            <p>{latest ? `${latest.type === 'full' ? '完整基线' : '技术基线'} · ${fmtTime(latest.createdAt)} · ${latest.review.reviewer} 发布。正式版本不可修改。` : '草稿持续保存；只有人工发布才会形成 V1/V2 正式版本。'}</p>
            <div className="inline"><span className="tag">{ov.baselines.length} 个版本</span><a href={href('deliver', pid)}>版本与对比 →</a></div>
          </div>
          <Panel title="文档状态">
            {ov.docs.length ? ov.docs.map(d => (
              <div key={d.doc.id} className="list-row">
                <span className="list-ic"><Icon name="book" /></span>
                <div className="grow">
                  <b>{d.doc.title}</b>
                  <div className="tiny-caption">修订 {d.doc.revisionNo}{d.exported ? ' · 已导出' : ''}{d.doc.sent.length ? ' · 已对外发送' : ''}</div>
                </div>
                <Badge tone={REVIEW[d.review]![1] === 'red' ? 'red' : REVIEW[d.review]![1] === 'teal' ? 'teal' : 'gray'}>{REVIEW[d.review]![0]}</Badge>
              </div>
            )) : <Empty>尚未创建文档。</Empty>}
          </Panel>
          <Panel title="最近动态">
            {events.length ? (
              <div className="mini-timeline">
                {events.map((e, i) => (
                  <div key={i} className="event">
                    <span className="event-dot" />
                    <div><b>{e.title}</b><small>{fmtTime(e.at)} · {e.note}</small></div>
                  </div>
                ))}
              </div>
            ) : <Empty>暂无记录。</Empty>}
          </Panel>
        </div>
      </div>
    </>
  )
}

function Kpi(p: { icon: string; label: string; val: string; foot: ReactNode }) {
  return (
    <div className="card kpi">
      <div className="kpi-top">{p.label}<span className="sym"><Icon name={p.icon} /></span></div>
      <div className="kpi-val">{p.val}</div>
      <div className="kpi-foot">{p.foot}</div>
    </div>
  )
}
