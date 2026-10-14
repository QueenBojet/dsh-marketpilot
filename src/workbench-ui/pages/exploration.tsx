import { useStore } from '../store.tsx'
import { post, pp } from '../api.ts'
import { href } from '../shell.tsx'
import { Badge, Btn, Panel } from '../ui.tsx'

export function ExplorationPanel() {
  const { ov, pid, act, run, active } = useStore()
  if (!ov!.v4.discovery) return <p className="boxnote">可在 <a href={href('discovery', pid)}>需求访谈</a> 开启“需求确认 → 多路线初筛 → 定向研究 → 综合判断”流程。</p>
  const items = ov!.v4.explorations ?? []
  const initial = items.filter(e => e.phase === 'initial').at(-1), final = items.filter(e => e.phase === 'synthesis').at(-1)
  const reason = active ? '已有运行进行中' : !ov!.capabilities.model.available ? ov!.capabilities.model.reason : !ov!.discoveryStatus?.confirmed ? '请先确认需求简报' : ''
  const draftQuestion = (alternativeId: string, direction: string) => act(() => post(pp(pid!, 'questions'), {
    title: direction.slice(0, 200), direction, alternativeIds: [alternativeId], decisionUse: `判断「${ov!.alternatives.find(a => a.id === alternativeId)?.name}」在此方向的可行性、支持/反对证据与适用条件`,
    requirementIds: ov!.requirements.filter(r => r.status === 'confirmed').map(r => r.id), documentIds: [],
  }), '已创建独立研究方向，请到智能研究确认计划').then(() => {})
  return <Panel title="技术路线探索与综合判断" extra={<a href={href('research', pid)}>进入定向研究 →</a>}>
    <div className="actions"><Btn kind="teal" showReason disabled={reason} onClick={() => run('marketpilot_v4_brainstorm', { phase: 'initial' }, { ok: '多路线初筛已完成，请挑选需要深入验证的方向' }).then(() => {})}>{initial ? '更新多路线初筛' : '开始多路线头脑风暴'}</Btn>
      <Btn kind="primary" showReason disabled={reason || (!ov!.discoveryStatus?.initialCurrent ? '请先完成当前多路线初筛' : '')} onClick={() => run('marketpilot_v4_brainstorm', { phase: 'synthesis' }, { ok: '综合判断与二次重组完成，请审阅最终候选并人工决策' }).then(() => {})}>综合判断与二次头脑风暴</Btn></div>
    {[initial, final].filter(e => !!e).map(e => <div key={e.id} className="section-spacer"><h3>{e.phase === 'initial' ? '第一轮：广泛技术路线初筛' : '第二轮：研究综合与路线重组'} <Badge tone={(e.phase === 'initial' ? ov!.discoveryStatus?.initialCurrent : ov!.discoveryStatus?.synthesisCurrent) ? 'teal' : 'warn'}>{(e.phase === 'initial' ? ov!.discoveryStatus?.initialCurrent : ov!.discoveryStatus?.synthesisCurrent) ? '依据有效' : '依据已变化，请更新'}</Badge></h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{e.summary}</p><div className="route-grid">{e.routes.map(r => <div className="route-card" key={r.alternativeId}>
        <h3>{ov!.alternatives.find(a => a.id === r.alternativeId)?.name}</h3><p><b>工业支撑：</b>{r.industrialSupport}</p><p><b>可行性：</b>{r.feasibility}</p><p><b>证据缺口：</b>{r.evidenceGaps.join('；') || '无新增'}</p>
        {r.sourceAlternativeIds.length ? <p>重组自：{r.sourceAlternativeIds.map(id => ov!.alternatives.find(a => a.id === id)?.name).join('、')}</p> : null}
        {e.phase === 'initial' ? r.researchDirections.map(direction => <div key={direction} className="dtl-row"><span>{direction}</span><Btn small kind="ghost" disabled={active ? '已有运行进行中' : !ov!.discoveryStatus?.initialCurrent ? '初筛已失效' : ov!.v4.questions.some(q => q.direction === direction && q.status !== 'closed') ? '已创建此方向' : ''} onClick={() => draftQuestion(r.alternativeId, direction)}>建立定向研究</Btn></div>) : null}
      </div>)}</div></div>)}
    {items.length > 2 ? <details><summary>历史探索（{items.length} 轮）</summary>{items.map(e => <p key={e.id}>{e.createdAt} · {e.phase === 'initial' ? '初筛' : '综合'} · {e.routes.length} 条路线</p>)}</details> : null}
  </Panel>
}
