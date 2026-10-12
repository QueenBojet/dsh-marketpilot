/** 方案与决策: candidate routes, draft route, human route confirmation and the structured configuration list. */
import { useState } from 'react'
import { del, patch, post, pp, put } from '../api.ts'
import { Icon } from '../icons.tsx'
import { href } from '../shell.tsx'
import { useStore } from '../store.tsx'
import type { Alternative, ConfigItem } from '../types.ts'
import { Badge, Btn, Drawer, Empty, Field, Modal, PageHead, Panel, cx, fmtTime } from '../ui.tsx'

const ALT_STATUS: Record<Alternative['status'], [string, 'blue' | 'teal' | 'gray' | 'red']> = {
  draft: ['草稿', 'gray'], candidate: ['候选', 'blue'], selected: ['已选定', 'teal'], rejected: ['已否决', 'red'],
}
const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

function AltModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pid, act } = useStore()
  const blank = { name: '', summary: '', components: '', strengths: '', limitations: '', risks: '', unknowns: '' }
  const [f, setF] = useState(blank)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    const out = await act(() => post(pp(pid!, 'alternatives'), {
      name: f.name.trim(), summary: f.summary.trim(), components: lines(f.components), strengths: lines(f.strengths),
      limitations: lines(f.limitations), risks: lines(f.risks), unknowns: lines(f.unknowns), status: 'candidate',
    }), '已新增候选路线')
    if (out !== undefined) { setF(blank); onClose() }
  }
  const reason = !f.name.trim() ? '请填写路线名称' : !f.summary.trim() ? '请填写概要' : !lines(f.components).length ? '至少填写一个系统组成' : ''
  return (
    <Modal open={open} wide title="新增候选技术路线" subtitle="候选路线只是比选材料；进入工作方案需要人工确认。每行一项。" onClose={onClose}
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} onClick={save}>保存候选路线</Btn></>}>
      <Field label="路线名称 *"><input className="text-field" value={f.name} onChange={set('name')} /></Field>
      <Field label="概要 *"><textarea className="text-field" rows={2} value={f.summary} onChange={set('summary')} /></Field>
      <Field label="系统组成 *（每行一项）"><textarea className="text-field" rows={3} value={f.components} onChange={set('components')} /></Field>
      <div className="form-two">
        <Field label="优势"><textarea className="text-field" rows={3} value={f.strengths} onChange={set('strengths')} /></Field>
        <Field label="局限"><textarea className="text-field" rows={3} value={f.limitations} onChange={set('limitations')} /></Field>
        <Field label="风险"><textarea className="text-field" rows={3} value={f.risks} onChange={set('risks')} /></Field>
        <Field label="待核实"><textarea className="text-field" rows={3} value={f.unknowns} onChange={set('unknowns')} /></Field>
      </div>
    </Modal>
  )
}
function DecisionModal({ alt, onClose }: { alt: Alternative | undefined; onClose: () => void }) {
  const { ov, run, active } = useStore()
  const [why, setWhy] = useState('')
  const [reqs, setReqs] = useState<string[]>([])
  const [evs, setEvs] = useState<string[]>([])
  const [key, setKey] = useState<string>()
  const confirmed = ov!.requirements.filter(r => r.status === 'confirmed')
  if (alt?.id !== key) { setKey(alt?.id); setWhy(''); setReqs(confirmed.map(r => r.id)); setEvs([]) }
  const toggle = (xs: string[], set: (v: string[]) => void, id: string) => set(xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id])
  const submit = async () => {
    if (!alt) return
    const ex = await run('marketpilot_v4_route_confirm', { input: { alternativeId: alt.id, decision: `选定路线：${alt.name}`, rationale: why.trim(), requirementIds: reqs, evidenceIds: evs } },
      { ok: '技术路线已人工确认并记录' })
    if (ex?.status === 'completed') onClose()
  }
  const reason = !why.trim() ? '请填写选择理由' : !reqs.length ? '至少关联一条已确认需求' : active ? '已有运行进行中' : ''
  return (
    <Modal open={Boolean(alt)} wide title="人工确认技术路线" onClose={onClose}
      subtitle="确认仅作用于当前工作草稿；已发布的正式版本不受影响。系统会记录确认人、时间与理由，并需要在 Human Gate 中再次确认。"
      actions={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} onClick={submit}><Icon name="check" />确认并记录</Btn></>}>
      <div className="fieldcap">待确认路线</div>
      <div className="boxnote"><b>{alt?.name}</b><br />{alt?.summary}</div>
      <Field label="工程师选择理由 *"><textarea className="text-field" rows={4} value={why} onChange={e => setWhy(e.target.value)} placeholder="适用条件、接口要求、待核查事项等" /></Field>
      <div className="fieldcap">覆盖的已确认需求 *（{reqs.length}/{confirmed.length}）</div>
      {confirmed.length ? <div className="item-list">{confirmed.map(r => (
        <label key={r.id} className="check-row"><input type="checkbox" checked={reqs.includes(r.id)} onChange={() => toggle(reqs, setReqs, r.id)} /><span>{r.normalizedText}</span></label>))}</div>
        : <Empty>还没有已确认需求，请先在“资料与变更”中人工确认需求。</Empty>}
      {ov!.evidence.length ? <><div className="fieldcap">引用证据（可选）</div><div className="item-list">{ov!.evidence.map(e => (
        <label key={e.id} className="check-row"><input type="checkbox" checked={evs.includes(e.id)} onChange={() => toggle(evs, setEvs, e.id)} /><span>{e.title} · {e.status}</span></label>))}</div></> : null}
    </Modal>
  )
}

function RouteCards({ onDecide }: { onDecide: (a: Alternative) => void }) {
  const { ov, pid, act, run, active } = useStore()
  const [add, setAdd] = useState(false)
  const model = ov!.capabilities.model
  const draft = ov!.route.draftAlternativeId
  const choose = (a: Alternative) => act(() => put(pp(pid!, 'route/draft'), { alternativeId: a.id }),
    ov!.route.confirmedAlternativeId && ov!.route.confirmedAlternativeId !== a.id ? '已写入工作草稿；与已确认决策不一致，需要重新确认' : '已写入工作草稿')
  const confirmedReqs = ov!.requirements.filter(r => r.status === 'confirmed').length
  return (
    <>
      <div className="panel-heading"><div><h2>候选技术路线（{ov!.alternatives.length}）</h2><p>选择只写入工作草稿；确认需要人工记录理由。</p></div>
        <div className="actions">
          <Btn small kind="ghost" onClick={() => setAdd(true)}><Icon name="plus" />手工新增</Btn>
          <Btn small kind="teal" onClick={() => run('marketpilot_alternative_generate', {}, { ok: '已生成候选路线，请人工比选' }).then(() => {})} showReason
            disabled={!model.available ? `模型不可用：${model.reason}` : !confirmedReqs ? '需要至少一条已确认需求' : active ? '已有运行进行中' : ''}><Icon name="spark" />AI 生成候选</Btn>
        </div></div>
      {ov!.alternatives.length ? <div className="route-grid">{ov!.alternatives.map(a => (
        <div key={a.id} className={cx('route-card', draft === a.id && 'chosen')}>
          <Badge tone={ALT_STATUS[a.status][1]}>{ALT_STATUS[a.status][0]}</Badge>
          {ov!.route.confirmedAlternativeId === a.id ? <> <Badge tone="teal">已人工确认</Badge></> : null}
          <h3>{a.name}</h3><p>{a.summary}</p>
          <div className="tiny-caption">组成：{a.components.join('、')}</div>
          <div className="route-tags">{[...a.risks.map(x => `风险：${x}`), ...a.unknowns.map(x => `待核实：${x}`)].slice(0, 4).map(t => <span key={t}>{t}</span>)}</div>
          {a.strengths.length ? <div className="tiny-caption">优势：{a.strengths.join('；')}</div> : null}
          {a.limitations.length ? <div className="tiny-caption">局限：{a.limitations.join('；')}</div> : null}
          <div className="actions" style={{ marginTop: 14 }}>
            <Btn small kind={draft === a.id ? 'teal' : 'ghost'} disabled={a.status === 'rejected' ? '已否决的路线不能作为草稿' : draft === a.id ? '当前草稿已采用' : active ? '已有运行进行中' : ''} onClick={() => { void choose(a) }}>
              {draft === a.id ? '当前草稿采用' : '选为草稿路线'}</Btn>
            {draft === a.id ? <Btn small kind="primary" disabled={active ? '已有运行进行中' : ''} onClick={() => onDecide(a)}><Icon name="shield" />{ov!.route.confirmed ? '重新确认' : '人工确认'}</Btn> : null}
          </div>
        </div>))}</div> : <Empty>暂无候选路线。可手工新增，或在模型可用时由 AI 生成候选（仅作为比选建议）。</Empty>}
      <div className="reconcile-note" style={{ marginTop: 18 }}><Icon name="shield" /> AI 生成的路线只是建议，不能代替工程师确认；更换草稿路线会使路线确认失效，并提示重新核查成本与文档。</div>
      <AltModal open={add} onClose={() => setAdd(false)} />
    </>
  )
}
const blankItem = { group: '', name: '', model: '', params: '', quantity: '1', unit: '套', interface: '', installation: '', alternativeId: '' }

function ConfigDrawer({ item, open, onClose }: { item: ConfigItem | undefined; open: boolean; onClose: () => void }) {
  const { ov, pid, act } = useStore()
  const [f, setF] = useState(blankItem)
  const [reqs, setReqs] = useState<string[]>([])
  const [finds, setFinds] = useState<string[]>([])
  const [key, setKey] = useState<string>()
  const k = open ? item?.id ?? 'new' : undefined
  if (k !== key) {
    setKey(k)
    if (open) {
      setF(item ? { ...blankItem, ...Object.fromEntries(Object.keys(blankItem).map(n => [n, String((item as unknown as Record<string, unknown>)[n] ?? '')])) }
        : { ...blankItem, alternativeId: ov!.route.draftAlternativeId ?? '' })
      setReqs(item?.requirementIds ?? []); setFinds(item?.findingIds ?? [])
    }
  }
  const set = (n: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [n]: e.target.value })
  const qty = Number(f.quantity)
  const reason = !f.group.trim() ? '请填写分组' : !f.name.trim() ? '请填写名称' : !f.unit.trim() ? '请填写单位'
    : !/^\d+$/.test(f.quantity.trim()) || !Number.isSafeInteger(qty) ? '数量必须是非负整数' : ''
  const save = async () => {
    const body: Record<string, unknown> = { quantity: qty, requirementIds: reqs, findingIds: finds }
    for (const [n, v] of Object.entries(f)) if (n !== 'quantity' && v.trim()) body[n] = v.trim()
    const out = await act(() => item ? patch(pp(pid!, `config/${encodeURIComponent(item.id)}`), body) : post(pp(pid!, 'config'), body),
      '配置已保存；依赖的成本与文档审核已失效，请重新核查')
    if (out !== undefined) onClose()
  }
  const toggle = (xs: string[], s: (v: string[]) => void, id: string) => s(xs.includes(id) ? xs.filter(x => x !== id) : [...xs, id])
  return (
    <Drawer open={open} title={item ? '编辑配置项' : '新增配置项'} cap="配置是成本与方案正文的共同数据源" onClose={onClose}
      footer={<><Btn kind="ghost" onClick={onClose}>取消</Btn><Btn kind="primary" disabled={reason} onClick={save}>保存至工作草稿</Btn></>}>
      <div className="form-two">
        <Field label="分组 *"><input className="text-field" value={f.group} onChange={set('group')} placeholder="例如 传感器 / 通信 / 安装" /></Field>
        <Field label="名称 *"><input className="text-field" value={f.name} onChange={set('name')} /></Field>
        <Field label="型号"><input className="text-field" value={f.model} onChange={set('model')} /></Field>
        <Field label="关联路线"><select className="option-select" value={f.alternativeId} onChange={set('alternativeId')}>
          <option value="">（不限）</option>{ov!.alternatives.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="数量 *"><input className="num-input" type="number" min={0} step={1} value={f.quantity} onChange={set('quantity')} /></Field>
        <Field label="单位 *"><input className="text-field" value={f.unit} onChange={set('unit')} /></Field>
      </div>
      <Field label="关键参数"><textarea className="text-field" rows={2} value={f.params} onChange={set('params')} /></Field>
      <div className="form-two">
        <Field label="接口"><input className="text-field" value={f.interface} onChange={set('interface')} /></Field>
        <Field label="安装"><input className="text-field" value={f.installation} onChange={set('installation')} /></Field>
      </div>
      <div className="fieldcap">关联需求</div>
      {ov!.requirements.filter(r => r.status !== 'superseded').map(r => (
        <label key={r.id} className="check-row"><input type="checkbox" checked={reqs.includes(r.id)} onChange={() => toggle(reqs, setReqs, r.id)} /><span>{r.normalizedText}</span></label>))}
      {ov!.v4.findings.some(x => x.adoption === 'adopted') ? <><div className="fieldcap">依据的研究结论</div>
        {ov!.v4.findings.filter(x => x.adoption === 'adopted').map(x => (
          <label key={x.id} className="check-row"><input type="checkbox" checked={finds.includes(x.id)} onChange={() => toggle(finds, setFinds, x.id)} />
            <span>{x.statement}{x.verification !== 'verified' ? '（未核实）' : ''}</span></label>))}</> : null}
      <div className="reconcile-note" style={{ marginTop: 16 }}><Icon name="shield" /> 修改配置会使成本与文档审核失效；已发布的正式版本不会改变。</div>
    </Drawer>
  )
}
function ConfigTable() {
  const { ov, pid, act } = useStore()
  const [edit, setEdit] = useState<ConfigItem | 'new'>()
  const [showRemoved, setShowRemoved] = useState(false)
  const items = ov!.v4.configItems.filter(i => showRemoved || i.status === 'active')
  const altName = (id?: string) => ov!.alternatives.find(a => a.id === id)?.name
  const remove = (i: ConfigItem) => act(() => del(pp(pid!, `config/${encodeURIComponent(i.id)}`)), '已移除（保留记录）；依赖的审核已失效')
  const restore = (i: ConfigItem) => act(() => patch(pp(pid!, `config/${encodeURIComponent(i.id)}`), { status: 'active' }), '已恢复')
  return (
    <>
      <div className="panel-heading"><div><h2>方案设备配置清单</h2><p>数量为非负整数；成本行可“跟随配置”数量。</p></div>
        <div className="actions"><label className="tiny-caption"><input type="checkbox" checked={showRemoved} onChange={e => setShowRemoved(e.target.checked)} /> 显示已移除</label>
          <Btn small kind="primary" onClick={() => setEdit('new')}><Icon name="plus" />新增配置</Btn></div></div>
      {items.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>配置项</th><th>分组</th><th>数量</th><th>依据</th><th>状态</th><th /></tr></thead>
        <tbody>{items.map(i => (
          <tr key={i.id}>
            <td className="main-cell"><strong>{i.name}</strong><small>{[i.model, i.params, altName(i.alternativeId)].filter(Boolean).join(' · ') || '—'}</small></td>
            <td>{i.group}</td><td>{i.quantity} {i.unit}</td>
            <td className="tiny-caption">{i.requirementIds.length} 需求 · {i.findingIds.length} 结论</td>
            <td><Badge tone={i.status === 'active' ? 'teal' : 'gray'}>{i.status === 'active' ? '有效' : '已移除'}</Badge></td>
            <td>{i.status === 'active' ? <><button type="button" className="mini-action" onClick={() => setEdit(i)}>编辑</button>
              <button type="button" className="mini-action" onClick={() => void remove(i)}>移除</button></>
              : <button type="button" className="mini-action" onClick={() => void restore(i)}>恢复</button>}</td>
          </tr>))}</tbody></table></div> : <Empty>暂无配置项。确认技术路线后，在此维护设备、通信、安装与服务配置。</Empty>}
      <ConfigDrawer open={Boolean(edit)} item={edit === 'new' ? undefined : edit} onClose={() => setEdit(undefined)} />
    </>
  )
}

export function SolutionPage() {
  const { ov, pid } = useStore()
  const [tab, setTab] = useState<'routes' | 'config'>('routes')
  const [decide, setDecide] = useState<Alternative>()
  if (!ov || !pid) return <Empty>正在加载项目…</Empty>
  const draft = ov.alternatives.find(a => a.id === ov.route.draftAlternativeId)
  const conf = ov.alternatives.find(a => a.id === ov.route.confirmedAlternativeId)
  const latest = [...ov.baselines].sort((a, b) => b.number - a.number)[0]
  const mismatch = Boolean(draft && conf && draft.id !== conf.id)
  return (
    <>
      <PageHead eyebrow="方案与决策" title="技术路线与配置"
        lede="围绕候选路线比选、人工决策和结构化配置持续修订；草稿可随时修改，正式版本只能由人工发布。"
        actions={<><a className="btn ghost" href={href('research', pid)}><Icon name="microscope" />查看研究依据</a>
          <a className="btn primary" href={href('deliver', pid)}><Icon name="check" />去发布版本</a></>} />
      {mismatch ? <div className="reconcile-note"><Icon name="shield" /> 草稿路线「{draft!.name}」与已确认决策「{conf!.name}」不一致：路线确认已失效，请重新人工确认。</div> : null}
      <div className="summary-grid">
        <div className="summary-box"><div className="cap"><Icon name="layers" />当前正式版本</div><div className="val">{latest?.label ?? '未发布'}</div><div className="detail">正式版本不可修改，草稿编辑不会覆盖</div></div>
        <div className="summary-box"><div className="cap"><Icon name="file" />草稿路线</div><div className="val" style={{ fontSize: 17 }}>{draft?.name ?? '未选择'}</div><div className="detail">{ov.v4.draftRoute ? `${fmtTime(ov.v4.draftRoute.selectedAt)} · ${ov.v4.draftRoute.by}` : '从候选路线中选择'}</div></div>
        <div className="summary-box"><div className="cap"><Icon name="shield" />人工决策</div><div className="val" style={{ fontSize: 18 }}>{ov.route.confirmed ? '已确认' : '待确认'}</div><div className="detail">{ov.route.decision ? `${ov.route.decision.confirmedBy} · ${fmtTime(ov.route.decision.confirmedAt)}` : '需要记录理由与覆盖需求'}</div></div>
      </div>
      <div className="dual-grid">
        <Panel title="方案工作空间" extra={<div className="segment">{([['routes', '技术路线'], ['config', '设备配置']] as const).map(([k, t]) =>
          <button key={k} type="button" className={cx(tab === k && 'active')} onClick={() => setTab(k)}>{t}</button>)}</div>}>
          {tab === 'routes' ? <RouteCards onDecide={setDecide} /> : <ConfigTable />}
        </Panel>
        <Panel title="工程决策记录">
          <div className="rail-status"><h3>{ov.route.confirmed ? '技术路线已确认' : '技术路线待确认'}</h3>
            <p>{ov.route.decision ? ov.route.decision.rationale : '尚无与当前草稿一致的人工决策。'}</p></div>
          {ov.decisions.length ? <><div className="micro-title" style={{ marginTop: 14 }}>历史决策（{ov.decisions.length}）</div>
            {[...ov.decisions].sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt)).map(d => (
              <div key={d.id} className="dtl-row"><div><strong>{ov.alternatives.find(a => a.id === d.alternativeId)?.name ?? d.alternativeId}</strong>
                <small>{d.confirmedBy} · {fmtTime(d.confirmedAt)}</small></div>
                {d.id === ov.route.decision?.id ? <Badge tone="teal">当前</Badge> : <Badge tone="gray">历史</Badge>}</div>))}</> : null}
          <Btn kind="primary" disabled={!draft ? '请先选择草稿路线' : ''} onClick={() => draft && setDecide(draft)}><Icon name="shield" />{ov.route.confirmed ? '重新确认路线' : '确认本轮技术路线'}</Btn>
        </Panel>
      </div>
      <DecisionModal alt={decide} onClose={() => setDecide(undefined)} />
    </>
  )
}
