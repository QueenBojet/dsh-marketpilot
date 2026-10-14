import { useState } from 'react'
import { post, put, pp } from '../api.ts'
import { useStore } from '../store.tsx'
import { href } from '../shell.tsx'
import { Badge, Btn, Empty, Field, PageHead, Panel } from '../ui.tsx'
import type { Discovery } from '../types.ts'

const fields = { objective: '项目目标', scenario: '应用场景', scope: '范围与不做的事项', constraints: '约束与已接受的不确定性' } as const
function BriefEditor({ value }: { value: Discovery['brief'] }) {
  const { ov, pid, act, run, active } = useStore()
  const [brief, setBrief] = useState(value)
  const [saved, setSaved] = useState(JSON.stringify(value))
  if (JSON.stringify(value) !== saved) { setSaved(JSON.stringify(value)); setBrief(value) }
  const dirty = JSON.stringify(brief) !== JSON.stringify(ov!.v4.discovery!.brief)
  return <Panel title="需求简报" extra={<Badge tone={ov!.discoveryStatus?.confirmed ? 'teal' : 'warn'}>{ov!.discoveryStatus?.confirmed ? '当前简报已确认' : '待人工确认'}</Badge>}>
    {ov!.v4.discovery!.proposal ? <p className="boxnote">下方是访谈产生的最新建议，可编辑后保存；保存不等于确认。</p> : null}
    {Object.entries(fields).map(([key, label]) => <Field key={key} label={label}><textarea className="text-field" rows={2} value={brief[key as keyof typeof fields]} onChange={e => setBrief({ ...brief, [key]: e.target.value })} /></Field>)}
    <Field label="可检验需求与验收标准（每行一条）"><textarea className="text-field" rows={5} value={brief.acceptance.join('\n')} onChange={e => setBrief({ ...brief, acceptance: e.target.value.split('\n') })} /></Field>
    <Field label="待澄清问题（每行一条）"><textarea className="text-field" rows={3} value={brief.openQuestions.join('\n')} onChange={e => setBrief({ ...brief, openQuestions: e.target.value.split('\n') })} /></Field>
    <div className="actions"><Btn kind="teal" disabled={active ? '已有运行进行中' : ''} onClick={() => act(() => put(pp(pid!, 'discovery/brief'), { ...brief, acceptance: brief.acceptance.map(x => x.trim()).filter(Boolean), openQuestions: brief.openQuestions.map(x => x.trim()).filter(Boolean) }), '简报已保存，等待人工确认').then(() => {})}>保存简报</Btn>
      <Btn kind="primary" showReason disabled={active ? '已有运行进行中' : dirty || ov!.v4.discovery!.proposal ? '请先保存简报' : ''} onClick={() => run('marketpilot_v4_discovery_confirm', {}, { ok: '需求简报已人工确认，可开始路线初筛' }).then(() => {})}>人工确认需求简报</Btn></div>
  </Panel>
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
  return <><PageHead eyebrow="需求确认" title="先把需求说清楚" lede="通过持续对话明确目标、边界和验收标准；资料可随时补充，最终简报由你确认。" actions={<a className="btn ghost" href={href('change', pid)}>上传辅助资料</a>} />
    {!d ? <Panel title="继续需求澄清"><p>旧项目可保留当前流程；开启后，新的路线决策将基于已确认简报和定向研究。</p><Btn kind="primary" onClick={() => act(() => post(pp(pid!, 'discovery')), '已开启需求访谈').then(() => {})}>开启需求访谈</Btn></Panel> : <div className="dual-grid">
      <Panel title="需求访谈"><div className="discovery-conversation">{ov.v4.messages.filter(m => m.thread === 'discovery').map(m => <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : 'ai'}`} style={{ whiteSpace: 'pre-wrap' }}><b>{m.role === 'user' ? '你' : '需求助手'}</b><br />{m.content}{m.status !== 'done' ? <Badge tone="warn">{m.status === 'failed' ? '本轮失败，可重试' : '已取消'}</Badge> : null}</div>)}</div>
        {!ov.v4.messages.some(m => m.thread === 'discovery') ? <><p className="boxnote">先描述要解决的问题、使用者和期望效果。助手会逐轮追问关键缺口。</p><Btn kind="teal" disabled={reason} onClick={() => send('请根据项目说明开始需求访谈，先问最关键的三个问题。')}>开始需求访谈</Btn></> : null}
        <Field label="本轮回答或补充"><textarea className="text-field" rows={4} value={message} onChange={e => setMessage(e.target.value)} /></Field>
        <details><summary>本轮辅助资料（{docs.length}）</summary>{ov.documents.map(d => <label className="check-row" key={d.id}><input type="checkbox" checked={docs.includes(d.id)} onChange={() => setDocs(docs.includes(d.id) ? docs.filter(x => x !== d.id) : [...docs, d.id])} />{d.name}</label>)}</details>
        <Btn kind="primary" disabled={reason || (!message.trim() ? '请填写回答或补充' : '')} onClick={() => send(message.trim())}>发送并继续澄清</Btn>
      </Panel><BriefEditor value={d.proposal ?? d.brief} />
    </div>}
    {ov.discoveryStatus?.confirmed ? <p><a className="btn primary" href={href('solution', pid)}>下一步：多路线头脑风暴</a></p> : null}
  </>
}
