import { useStore } from '../store.tsx'
import { post, pp } from '../api.ts'
import { Icon } from '../icons.tsx'
import { href } from '../shell.tsx'
import { Badge, Blocks, Btn, Panel, ROUTE_SRC, fmtTime } from '../ui.tsx'
import { currentResearchDirections } from '../research-progress.ts'

const Q_BADGE: Record<string, [string, 'gray' | 'blue' | 'teal' | 'warn']> = {
  open: ['待确认计划/研究', 'gray'],
  researching: ['研究中', 'blue'],
  answered: ['已有报告', 'teal'],
  needs_review: ['需复核', 'warn'],
  closed: ['已关闭', 'gray'],
}

export function ExplorationPanel() {
  const { ov, pid, act, run, active } = useStore()
  if (!ov!.v4.discovery) {
    return (
      <p className="boxnote">
        当前项目使用标准兼容模式；可在 <a href={href('discovery', pid)} style={{ color: '#2563eb', fontWeight: 650 }}>需求访谈</a> 开启“需求确认 → 多路线初筛 → 定向研究 → 综合判断”引导流程。
      </p>
    )
  }
  const items = ov!.v4.explorations ?? []
  const initial = items.filter(e => e.phase === 'initial').at(-1)
  const final = items.filter(e => e.phase === 'synthesis').at(-1)
  const distinctDirs = currentResearchDirections(ov!)
  const lastRun = [...(ov!.v4.runs ?? [])].filter(r => r.kind === 'brainstorm').sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]

  const reason = active
    ? '已有运行进行中'
    : !ov!.capabilities.model.available
      ? ov!.capabilities.model.reason
      : !ov!.discoveryStatus?.confirmed
        ? '请先确认需求简报'
        : ''

  const synReason = reason
    || (!ov!.discoveryStatus?.initialCurrent ? '请先完成当前多路线初筛' : '')
    || (distinctDirs < 2 ? `需至少 2 个不同具体方向的有效研究报告（当前 ${distinctDirs} 个）` : '')

  const draftQuestion = (alternativeId: string, direction: string) =>
    act(() => post(pp(pid!, 'questions'), {
      title: direction.slice(0, 200),
      direction,
      alternativeIds: [alternativeId],
      decisionUse: `判断「${ov!.alternatives.find(a => a.id === alternativeId)?.name}」在此方向的可行性、支持/反对证据与适用条件`,
      requirementIds: ov!.requirements.filter(r => r.status === 'confirmed').map(r => r.id),
      documentIds: [],
    }), '已创建独立研究方向，请到智能研究确认计划').then(() => {})

  const orderedExplorations = final ? [final, initial].filter(e => !!e) : [initial].filter(e => !!e)

  return (
    <Panel
      title="技术路线探索与综合判断"
      subtitle="第一轮基于已确认需求与固化支撑开展工业可行性多路线初筛（≥3 条）；经至少 2 个不同具体方向研究后，执行第二轮综合判断与路线重组。"
      extra={
        <div className="actions">
          <Badge tone={distinctDirs >= 2 ? 'teal' : 'warn'}>定向研究有效报告：{distinctDirs}/2 方向</Badge>
          <a className="btn small ghost" href={href('research', pid)}><Icon name="microscope" />进入定向研究 →</a>
        </div>
      }>
      <div className="actions" style={{ marginBottom: 14 }}>
        <Btn kind="teal" showReason disabled={reason}
          onClick={() => run('marketpilot_v4_brainstorm', { phase: 'initial' }, { ok: '多路线初筛已完成，请挑选需要深入验证的方向' }).then(() => {})}>
          <Icon name="spark" />{initial ? '更新多路线初筛' : '开始多路线头脑风暴'}
        </Btn>
        <Btn kind="primary" showReason disabled={synReason}
          onClick={() => run('marketpilot_v4_brainstorm', { phase: 'synthesis' }, { ok: '综合判断与二次重组完成，请审阅最终候选并人工决策' }).then(() => {})}>
          <Icon name="layers" />综合判断与二次头脑风暴
        </Btn>
      </div>

      {lastRun ? (
        <div className="tiny-caption" style={{ marginBottom: 12, ...(lastRun.status === 'failed' ? { color: '#b91c1c' } : {}) }}>
          最近头脑风暴运行：{fmtTime(lastRun.startedAt)} · {lastRun.status === 'completed' ? '已完成' : lastRun.status === 'running' ? '运行中' : lastRun.status === 'cancelled' ? '已取消' : '失败'}
          · 模型 {lastRun.modelRoute.provider}/{lastRun.modelRoute.model}（{ROUTE_SRC[lastRun.modelRoute.source] ?? lastRun.modelRoute.source}）
          {lastRun.note ? ` · ${lastRun.note}` : ''}{lastRun.error ? ` · 错误：${lastRun.error}` : ''}
          {lastRun.status === 'failed' && /timeout|aborted/i.test(lastRun.error ?? '') ? '（模型推理时间过长被中止，可重试、换用更快模型或降低思考强度）' : ''}
        </div>
      ) : null}

      {orderedExplorations.map(e => {
        const isCurrent = e.phase === 'initial' ? ov!.discoveryStatus?.initialCurrent : ov!.discoveryStatus?.synthesisCurrent
        const isCollapsedInitial = e.phase === 'initial' && Boolean(final)
        const body = (
          <>
            <details open={!isCollapsedInitial} style={{ marginBottom: 14 }}>
              <summary className="tiny-caption" style={{ cursor: 'pointer', fontWeight: 700, marginBottom: 6 }}>
                查看本轮工程推理与比较综述
              </summary>
              <div className="boxnote">
                <Blocks content={e.summary} />
              </div>
            </details>
            <div className="route-grid">
              {e.routes.map(r => {
                const altName = ov!.alternatives.find(a => a.id === r.alternativeId)?.name ?? r.alternativeId
                const isConfirmedRoute = ov!.route.confirmedAlternativeId === r.alternativeId
                // Per-route research progress: each route's questions unfold independently.
                const linkedQs = ov!.v4.questions.filter(x => x.status !== 'closed' && (x.alternativeIds ?? []).includes(r.alternativeId))
                const answeredQs = linkedQs.filter(x => x.status === 'answered').length
                return (
                  <div className="route-card" key={r.alternativeId} style={isConfirmedRoute ? { borderColor: 'rgba(13, 148, 136, 0.45)', background: 'linear-gradient(180deg, rgba(240, 253, 250, 0.55), #ffffff 42%)' } : undefined}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Badge tone={e.phase === 'synthesis' ? 'teal' : 'blue'}>
                          {e.phase === 'synthesis' ? '二次综合推荐候选' : '初筛探索路线'}
                        </Badge>
                        {isConfirmedRoute ? <Badge tone="teal">当前已确认主选路线</Badge> : null}
                      </div>
                      {r.sourceAlternativeIds.length ? (
                        <span className="tiny-caption">
                          重组自：{r.sourceAlternativeIds.map(id => ov!.alternatives.find(a => a.id === id)?.name?.split('·')[0]?.trim() || id).join(' + ')}
                        </span>
                      ) : null}
                    </div>
                    <h3>{altName}</h3>
                    <div className="route-meta-box">
                      <div><b>工业支撑：</b>{r.industrialSupport}</div>
                      <div style={{ marginTop: 4 }}><b>可行性：</b>{r.feasibility}</div>
                    </div>
                    <div className="route-tags">
                      <span style={{ fontWeight: 650 }}>证据缺口：</span>
                      {r.evidenceGaps.length ? r.evidenceGaps.map(g => <span key={g}>{g}</span>) : <span>无新增缺口</span>}
                    </div>
                    {e.phase === 'initial' ? (
                      <div style={{ marginTop: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span className="tiny-caption">本路线独立研究：已建 {linkedQs.length} / 建议 {r.researchDirections.length} 个方向</span>
                          <Badge tone={answeredQs ? 'teal' : linkedQs.length ? 'warn' : 'gray'}>
                            {answeredQs ? `${answeredQs} 个已有报告` : linkedQs.length ? '待完成' : '尚未建立'}
                          </Badge>
                        </div>
                        <div className="tiny-caption" style={{ fontWeight: 700, marginBottom: 4 }}>建议定向研究方向（点击建立独立研究问题）：</div>
                        {r.researchDirections.map(direction => {
                          const existingQ = ov!.v4.questions.find(q => q.direction === direction && q.status !== 'closed')
                          return (
                            <div key={direction} className="dtl-row" style={{ padding: '8px 0' }}>
                              <div className="grow" style={{ fontSize: 12 }}>
                                <span>{direction}</span>
                                {existingQ ? (
                                  <div style={{ marginTop: 3 }}>
                                    <Badge tone={Q_BADGE[existingQ.status]?.[1] ?? 'gray'}>
                                      {Q_BADGE[existingQ.status]?.[0] ?? existingQ.status}
                                    </Badge>
                                  </div>
                                ) : null}
                              </div>
                              <div className="actions">
                                {existingQ ? <a className="btn small text" href={href('research', pid)}>去研究 →</a> : null}
                                <Btn small kind="ghost"
                                  disabled={active ? '已有运行进行中' : !ov!.discoveryStatus?.initialCurrent ? '初筛已失效' : existingQ ? '已创建此方向' : ''}
                                  onClick={() => draftQuestion(r.alternativeId, direction)}>
                                  建立定向研究
                                </Btn>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </>
        )
        return (
          <div key={e.id} className="section-spacer" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
            {isCollapsedInitial ? (
              <details>
                <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontWeight: 700, fontSize: 14 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    第一轮：广泛技术路线初筛（已完成并转入第二轮综合）
                    <Badge tone={isCurrent ? 'teal' : 'warn'}>{isCurrent ? '依据有效' : '依据已变化'}</Badge>
                  </span>
                  <span className="tiny-caption">点击展开 {e.routes.length} 条第一轮初筛路线与定向研究记录 · {e.createdAt?.replace('T', ' ').slice(0, 16)}</span>
                </summary>
                <div style={{ marginTop: 12 }}>{body}</div>
              </details>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {e.phase === 'initial' ? '第一轮：广泛技术路线初筛' : '第二轮：研究综合与路线重组（最终候选）'}
                    <Badge tone={isCurrent ? 'teal' : 'warn'}>{isCurrent ? '依据有效' : '依据已变化，请更新'}</Badge>
                  </h3>
                  <span className="tiny-caption">生成时间：{e.createdAt?.replace('T', ' ').slice(0, 16)} · 共 {e.routes.length} 条路线</span>
                </div>
                {body}
              </>
            )}
          </div>
        )
      })}
      {items.length > 2 ? (
        <details style={{ marginTop: 14 }}>
          <summary className="tiny-caption" style={{ cursor: 'pointer', fontWeight: 650 }}>历史探索记录（{items.length} 轮）</summary>
          {items.map(e => <p key={e.id} className="tiny-caption">{e.createdAt} · {e.phase === 'initial' ? '初筛' : '综合'} · {e.routes.length} 条路线</p>)}
        </details>
      ) : null}
    </Panel>
  )
}
