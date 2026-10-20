import { useState } from 'react'
import { post, put, pp } from '../api.ts'
import { Icon } from '../icons.tsx'
import { useStore } from '../store.tsx'
import { href } from '../shell.tsx'
import { Badge, Blocks, Btn, Empty, Field, PageHead, Panel, fmtTime } from '../ui.tsx'
import type { Discovery } from '../types.ts'

const fields = {
  objective: '项目目标（要解决的核心工程问题）',
  scenario: '应用场景（工况环境、部署位置与对象）',
  scope: '范围与不做的事项（明确交付边界）',
  constraints: '约束与已接受的不确定性（工期、供电、网络、合规等）',
} as const

function BriefEditor({ value }: { value: Discovery['brief'] }) {
  const { ov, pid, act, run, active } = useStore()
  const [brief, setBrief] = useState(value)
  const [saved, setSaved] = useState(JSON.stringify(value))
  if (JSON.stringify(value) !== saved) { setSaved(JSON.stringify(value)); setBrief(value) }
  const dirty = JSON.stringify(brief) !== JSON.stringify(ov!.v4.discovery!.brief)
  const hasProposal = Boolean(ov!.v4.discovery!.proposal)
  const accList = brief.acceptance.map(x => x.trim()).filter(Boolean)
  const openList = brief.openQuestions.map(x => x.trim()).filter(Boolean)
  const review = ov!.v4.discovery!.review

  const moveOpenToConstraints = () => {
    if (!openList.length) return
    const merged = [brief.constraints.trim(), ...openList.map(q => `已接受待后续调研验证：${q}`)].filter(Boolean).join('；')
    setBrief({ ...brief, constraints: merged, openQuestions: [] })
  }

  const confirmDisabled = active
    ? '已有运行进行中'
    : dirty || hasProposal
      ? '请先保存简报'
      : openList.length
        ? `请先解决或移入约束 ${openList.length} 条待澄清问题`
        : !brief.objective.trim() || !brief.scenario.trim() || !brief.scope.trim() || !brief.constraints.trim() || !accList.length
          ? '请完整填写目标、场景、范围、约束及至少一条可检验需求'
          : ''

  return (
    <Panel
      title="结构化需求简报"
      subtitle="保存简报仅更新工作草稿；需解决待澄清问题后通过 Human Gate 独立人工确认，系统才会将验收标准同步为正式需求。"
      extra={
        <div className="actions">
          {hasProposal ? <Badge tone="warn">AI 最新建议待保存</Badge> : dirty ? <Badge tone="warn">草稿已修改未保存</Badge> : null}
          <Badge tone={ov!.discoveryStatus?.confirmed ? 'teal' : 'warn'}>
            {ov!.discoveryStatus?.confirmed ? '当前简报已确认' : '待人工确认'}
          </Badge>
        </div>
      }>
      {hasProposal ? (
        <div className="reconcile-note">
          <Icon name="spark" />
          <div>下方已载入需求访谈产生的最新简报建议，请审阅或修订后点击<strong>“保存简报”</strong>；保存不等于人工确认。</div>
        </div>
      ) : null}
      {review ? (
        <div className="boxnote" style={{ marginBottom: 12 }}>
          <strong>最近人工确认记录：</strong>{review.review.reviewer} · {fmtTime(review.review.reviewedAt)} · 指纹 <code>{review.hash.slice(0, 12)}</code>
          {!ov!.discoveryStatus?.confirmed ? <span style={{ color: '#b91c1c', marginLeft: 8 }}>（简报内容已变化，原确认已失效，请重新确认）</span> : null}
        </div>
      ) : null}
      <div className="form-two">
        {(['objective', 'scenario'] as const).map(key => (
          <Field key={key} label={fields[key]}>
            <textarea className="text-field" rows={3} value={brief[key]} onChange={e => setBrief({ ...brief, [key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <div className="form-two">
        {(['scope', 'constraints'] as const).map(key => (
          <Field key={key} label={fields[key]}>
            <textarea className="text-field" rows={3} value={brief[key]} onChange={e => setBrief({ ...brief, [key]: e.target.value })} />
          </Field>
        ))}
      </div>
      <Field label={`可检验需求与验收标准（每行一条 · 当前 ${accList.length} 条）`} hint="人工确认简报后，每一条验收标准会自动生成或更新为“已确认 (confirmed)”正式需求。">
        <textarea className="text-field" rows={5} value={brief.acceptance.join('\n')} onChange={e => setBrief({ ...brief, acceptance: e.target.value.split('\n') })} />
      </Field>
      <Field label={`待澄清问题（每行一条 · 当前 ${openList.length} 条）`} hint="确认简报前需清空待澄清问题；若某项不确定性留待后续调研验证，可一键移入上方“约束与已接受的不确定性”。">
        <textarea className="text-field" rows={3} value={brief.openQuestions.join('\n')} onChange={e => setBrief({ ...brief, openQuestions: e.target.value.split('\n') })} />
      </Field>
      {openList.length ? (
        <div className="actions" style={{ marginBottom: 12 }}>
          <Btn small kind="ghost" onClick={moveOpenToConstraints}>将 {openList.length} 条待澄清问题转为“已接受的不确定性”并移入约束</Btn>
        </div>
      ) : null}
      <div className="actions" style={{ marginTop: 8 }}>
        <Btn kind="teal" disabled={active ? '已有运行进行中' : ''} onClick={() => act(() => put(pp(pid!, 'discovery/brief'), { ...brief, acceptance: accList, openQuestions: openList }), '简报已保存，等待人工确认').then(() => {})}>保存简报</Btn>
        <Btn kind="primary" showReason disabled={confirmDisabled} onClick={() => run('marketpilot_v4_discovery_confirm', {}, { ok: '需求简报已人工确认，可开始路线初筛' }).then(() => {})}><Icon name="shield" />人工确认需求简报</Btn>
      </div>
    </Panel>
  )
}

export function DiscoveryPage() {
  const { ov, pid, act, run, active } = useStore()
  const [message, setMessage] = useState('')
  const [docs, setDocs] = useState<string[]>([])
  if (!ov) return <Empty>正在加载项目…</Empty>
  const d = ov.v4.discovery
  const send = async (content: string) => {
    const out = await run('marketpilot_v4_discovery_chat', { input: { content, documentIds: docs } })
    if (out?.status === 'completed') setMessage('')
  }
  const reason = active ? '已有运行进行中' : !ov.capabilities.model.available ? ov.capabilities.model.reason : ''
  const msgs = ov.v4.messages.filter(m => m.thread === 'discovery')

  return (
    <>
      <PageHead eyebrow="STAGE 1 · GUIDED REQUIREMENT DISCOVERY" title="先把需求说清楚"
        lede="通过 DSH 多轮追问明确工程目标、工况边界、接口条件与可检验验收指标；辅助资料仅作上下文参考，最终需求简报须经人工独立确认。"
        actions={<>
          <a className="btn ghost" href={href('change', pid)}><Icon name="upload" />上传辅助资料</a>
          {ov.discoveryStatus?.confirmed ? <a className="btn primary" href={href('solution', pid)}>下一步：多路线头脑风暴 →</a> : null}
        </>} />
      {!d ? (
        <Panel title="开启 V4 引导式需求澄清" subtitle="旧项目默认保留原有工作模式；显式开启需求访谈后，后续技术路线决策将基于已确认简报、精选固化资料与定向研究。">
          <div className="boxnote" style={{ marginBottom: 14 }}>
            开启不会删除或覆盖项目已有的 {ov.requirements.length} 条需求、{ov.alternatives.length} 条候选路线与历史决策记录。
          </div>
          <Btn kind="primary" onClick={() => act(() => post(pp(pid!, 'discovery')), '已开启需求访谈').then(() => {})}><Icon name="chat" />开启需求访谈</Btn>
        </Panel>
      ) : (
        <div className="dual-grid">
          <Panel title={`多轮需求访谈（${msgs.length} 条对话）`} subtitle="助手每轮最多追问 3 个实质影响方案选型的关键缺口，并同步更新右侧简报建议。">
            <div className="discovery-conversation">
              {msgs.length ? msgs.map(m => (
                <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`} style={{ whiteSpace: 'pre-wrap' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <b>{m.role === 'user' ? '你（工程师）' : '需求助手'}</b>
                    {m.modelRoute ? <span className="tiny-caption">{m.modelRoute.provider}/{m.modelRoute.model}</span> : null}
                  </div>
                  {m.role === 'assistant' ? <Blocks content={m.content} /> : <div>{m.content}</div>}
                  {m.status !== 'done' ? <Badge tone="warn">{m.status === 'failed' ? '本轮失败，可重试' : '已取消'}</Badge> : null}
                </div>
              )) : (
                <div className="chat-empty">
                  <p style={{ margin: '0 0 10px' }}>先描述要解决的工程问题、监测对象、现场工况与期望验收效果。助手会逐轮追问关键缺口。</p>
                  <Btn kind="teal" disabled={reason} onClick={() => send('请根据项目说明开始需求访谈，先问最关键的三个问题。')}><Icon name="spark" />开始需求访谈</Btn>
                </div>
              )}
            </div>
            <Field label="本轮回答或补充说明">
              <textarea className="text-field" rows={4} value={message} onChange={e => setMessage(e.target.value)}
                placeholder="回答上方追问的测点数量、精度容差、报警接口、断网缓存、供电布线或合规验收要求…" />
            </Field>
            <details style={{ margin: '10px 0 12px' }}>
              <summary className="tiny-caption" style={{ cursor: 'pointer', fontWeight: 650 }}>本轮辅助资料（{docs.length}/{ov.documents.length} 已选）</summary>
              {ov.documents.length ? ov.documents.map(doc => (
                <label className="check-row" key={doc.id}>
                  <input type="checkbox" checked={docs.includes(doc.id)} onChange={() => setDocs(docs.includes(doc.id) ? docs.filter(x => x !== doc.id) : [...docs, doc.id])} />
                  <span>{doc.name}（{doc.length} 字）</span>
                </label>
              )) : <div className="tiny-caption" style={{ paddingTop: 6 }}>暂无已上传资料，可点击右上角“上传辅助资料”。</div>}
            </details>
            <div className="actions">
              <Btn kind="primary" disabled={reason || (!message.trim() ? '请填写回答或补充' : '')} onClick={() => send(message.trim())}><Icon name="send" />发送并继续澄清</Btn>
            </div>
          </Panel>
          <BriefEditor value={d.proposal ?? d.brief} />
        </div>
      )}
      {ov.discoveryStatus?.confirmed ? (
        <div className="card" style={{ padding: '14px 18px', marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <strong>需求简报已完成人工确认</strong>
            <div className="tiny-caption">已同步 {ov.requirements.filter(r => r.status === 'confirmed').length} 条正式需求。您可继续上传现场资料并人工固化关键支撑摘要，或直接进入多路线初筛。</div>
          </div>
          <div className="actions">
            <a className="btn ghost" href={href('change', pid)}>精选与固化资料 →</a>
            <a className="btn primary" href={href('solution', pid)}>下一步：多路线头脑风暴</a>
          </div>
        </div>
      ) : null}
    </>
  )
}
