/** App shell: sidebar, topbar, workflow stage bar, mobile tab bar and hash routing between global pages and project workspaces. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './icons.tsx'
import { StoreProvider, useStore } from './store.tsx'
import { Badge, cx } from './ui.tsx'
import { ModelPicker } from './model-picker.tsx'
import type { Overview } from './types.ts'
import { currentResearchDirections } from './research-progress.ts'

export const GLOBAL_PAGES = ['home', 'projects', 'library', 'runs'] as const
export const WORKSPACES = ['overview', 'discovery', 'change', 'research', 'solution', 'cost', 'deliver'] as const
export type PageId = typeof GLOBAL_PAGES[number] | typeof WORKSPACES[number] | 'settings'

export const NAMES: Record<PageId, string> = {
  home: '工作台', projects: '我的项目', library: '研究资料库', runs: '运行记录', settings: '设置',
  overview: '项目总览', discovery: '需求访谈', change: '资料与变更', research: '智能研究', solution: '方案与决策', cost: '成本与报价', deliver: '文档与交付',
}
const ICONS: Record<PageId, string> = {
  home: 'home', projects: 'folder', library: 'library', runs: 'clock', settings: 'settings',
  overview: 'activity', discovery: 'chat', change: 'diff', research: 'microscope', solution: 'layers', cost: 'coins', deliver: 'book',
}
const isWorkspace = (p: string): p is typeof WORKSPACES[number] => (WORKSPACES as readonly string[]).includes(p)
const LAST = 'marketpilot.v4.project'

export interface Route { page: PageId; pid: string | undefined }

/** Bottom tab bar labels (≤760px); concise labels so all tabs fit without horizontal overflow. */
const SHORT: Record<string, string> = { overview: '总览', discovery: '需求', change: '资料', research: '研究', solution: '方案', cost: '成本', deliver: '交付' }

/** `#/overview?p=<projectId>` — the project id travels in the hash so every view is bookmarkable. */
export function parseHash(hash: string): Route {
  const m = /^#\/([a-z]+)(?:\?p=([^&]+))?/.exec(hash)
  const page = (m?.[1] && m[1] in NAMES ? m[1] : 'home') as PageId
  const pid = m?.[2] ? decodeURIComponent(m[2]) : (localStorage.getItem(LAST) ?? undefined)
  return { page, pid: pid || undefined }
}
export const href = (page: PageId, pid?: string) => `#/${page}${pid ? `?p=${encodeURIComponent(pid)}` : ''}`
export function go(page: PageId, pid?: string) {
  if (pid) localStorage.setItem(LAST, pid)
  window.location.hash = href(page, pid ?? parseHash(window.location.hash).pid)
}

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => { setRoute(parseHash(window.location.hash)); window.scrollTo({ top: 0 }) }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

function NavItem({ id, route, dot, badge }: { id: PageId; route: Route; dot?: 'warn' | 'red' | false; badge?: string }) {
  return (
    <a className={cx('nav-item', route.page === id && 'active')} href={href(id, route.pid)} aria-current={route.page === id ? 'page' : undefined}>
      <Icon name={ICONS[id]} />
      <span className="nav-label">{NAMES[id]}</span>
      {badge ? <span className="nav-pill">{badge}</span> : null}
      {dot ? <span className={cx('nav-dot', dot === 'red' && 'red')} title="有待处理或已失效事项" /> : null}
    </a>
  )
}

type StepTone = 'complete' | 'current' | 'warn' | 'stale' | 'idle'
interface StageStep { key: string; num: string; title: string; sub: string; page: PageId; tone: StepTone }

function buildStages(ov: Overview): StageStep[] {
  const guided = Boolean(ov.v4.discovery)
  const confirmedReqs = ov.requirements.filter(r => r.status === 'confirmed').length
  const fixedNotes = (ov.v4.supportNotes ?? []).filter(n => n.status === 'fixed').length
  const draftNotes = (ov.v4.supportNotes ?? []).filter(n => n.status === 'draft').length
  const pendingChanges = ov.v4.changes.filter(c => c.status === 'pending').length
  const explorations = ov.v4.explorations ?? []
  const hasInit = explorations.some(e => e.phase === 'initial')
  const hasSyn = explorations.some(e => e.phase === 'synthesis')
  const answered = ov.v4.questions.filter(q => q.status === 'answered').length
  const directions = guided ? currentResearchDirections(ov) : 0
  const needsRevQ = ov.v4.questions.some(q => q.status === 'needs_review') || ov.v4.findings.some(f => f.needsReview)
  const activeCfg = ov.v4.configItems.filter(c => c.status === 'active').length
  const validCost = Object.values(ov.cost.reviews).filter(r => r === 'valid').length
  const staleCost = Object.values(ov.cost.reviews).some(r => r === 'stale')
  const staleDoc = ov.docs.some(d => d.review === 'stale' || d.outdated.length > 0)
  const validDoc = ov.docs.some(d => d.review === 'valid')
  const latestBase = [...ov.baselines].sort((a, b) => b.number - a.number)[0]

  const s1: StageStep = guided
    ? {
        key: 'discovery', num: '1', title: '需求访谈', page: 'discovery',
        tone: ov.discoveryStatus?.confirmed ? 'complete' : 'warn',
        sub: ov.discoveryStatus?.confirmed ? `已确认 (${confirmedReqs}项)` : ov.v4.discovery?.proposal ? '新建议待保存' : '待人工确认',
      }
    : {
        key: 'discovery', num: '1', title: '需求访谈', page: 'discovery',
        tone: confirmedReqs ? 'complete' : 'idle',
        sub: confirmedReqs ? `标准模式 (${confirmedReqs}项)` : '可按需开启',
      }

  const s2: StageStep = {
    key: 'change', num: '2', title: '资料与支撑', page: 'change',
    tone: pendingChanges || draftNotes ? 'warn' : (fixedNotes || confirmedReqs || ov.documents.length) ? 'complete' : 'idle',
    sub: guided
      ? `${ov.documents.length} 资料 · ${fixedNotes} 固化${draftNotes ? ` (${draftNotes}草稿)` : ''}`
      : `${ov.documents.length} 资料 · ${confirmedReqs} 需求${pendingChanges ? ` (${pendingChanges}待处理)` : ''}`,
  }

  const s3: StageStep = guided
    ? {
        key: 'initial', num: '3', title: '多路线初筛', page: 'solution',
        tone: ov.discoveryStatus?.initialCurrent ? 'complete' : hasInit ? 'stale' : 'idle',
        sub: ov.discoveryStatus?.initialCurrent
          ? `${explorations.filter(e => e.phase === 'initial').at(-1)?.routes.length ?? 0} 条候选有效`
          : hasInit ? '依据已变·需更新' : '待头脑风暴',
      }
    : {
        key: 'initial', num: '3', title: '候选路线', page: 'solution',
        tone: ov.alternatives.length ? 'complete' : 'idle',
        sub: ov.alternatives.length ? `${ov.alternatives.length} 条候选方案` : '待生成候选',
      }

  const s4: StageStep = {
    key: 'research', num: '4', title: '定向研究', page: 'research',
    tone: needsRevQ ? 'warn' : (guided ? directions >= 2 : answered >= 1) ? 'complete' : ov.v4.questions.length ? 'current' : 'idle',
    sub: needsRevQ ? '研究结论待复核' : ov.v4.questions.length ? guided ? `${directions}/2 个有效方向` : `${answered}/${ov.v4.questions.length} 份报告` : '待建立问题',
  }

  const s5: StageStep = {
    key: 'decision', num: '5', title: '综合与决策', page: 'solution',
    tone: ov.route.confirmed ? 'complete' : (ov.route.decision || (guided && hasSyn && !ov.discoveryStatus?.synthesisCurrent)) ? 'stale' : (ov.route.draftAlternativeId || hasSyn) ? 'warn' : 'idle',
    sub: ov.route.confirmed ? `已确认 · ${activeCfg} 项配置` : ov.route.decision ? '路线确认已失效' : hasSyn ? '待人工确认路线' : '待综合与确认',
  }

  const s6: StageStep = {
    key: 'cost', num: '6', title: '成本与报价', page: 'cost',
    tone: staleCost ? 'stale' : validCost > 0 ? 'complete' : ov.v4.costLines.length > 0 ? 'warn' : 'idle',
    sub: staleCost ? '成本审核已失效' : validCost > 0 ? `审核 ${validCost}/3 有效` : ov.v4.costLines.length ? `${ov.v4.costLines.length} 行待审核` : '待核算 BOM',
  }

  const s7: StageStep = {
    key: 'deliver', num: '7', title: '文档与交付', page: 'deliver',
    tone: staleDoc ? 'stale' : latestBase ? 'complete' : validDoc ? 'complete' : ov.docs.length ? 'warn' : 'idle',
    sub: staleDoc ? '依据变化待同步' : latestBase ? `已发布 ${latestBase.label}` : validDoc ? '文档审核有效' : ov.docs.length ? `${ov.docs.length} 份草稿待审` : '待撰写交付',
  }

  return [s1, s2, s3, s4, s5, s6, s7]
}

function WorkflowStepper({ ov, route }: { ov: Overview; route: Route }) {
  const steps = buildStages(ov)
  const staleAlerts: { label: string; to: PageId }[] = []
  if (ov.v4.discovery && !ov.discoveryStatus?.confirmed && route.page !== 'discovery') {
    staleAlerts.push({ label: '需求简报尚未人工确认（或修改后待重新确认）', to: 'discovery' })
  }
  if (ov.v4.discovery && (ov.v4.explorations ?? []).some(e => e.phase === 'initial') && !ov.discoveryStatus?.initialCurrent) {
    staleAlerts.push({ label: '多路线初筛依据已变化，请更新初筛', to: 'solution' })
  }
  if (ov.v4.discovery && (ov.v4.explorations ?? []).some(e => e.phase === 'synthesis') && !ov.discoveryStatus?.synthesisCurrent) {
    staleAlerts.push({ label: '综合判断依据已变化，请重新执行二次头脑风暴', to: 'solution' })
  }
  if (ov.route.decision && !ov.route.confirmed) {
    staleAlerts.push({ label: '当前技术路线确认已失效，需重新人工确认', to: 'solution' })
  }
  if (Object.values(ov.cost.reviews).some(r => r === 'stale')) {
    staleAlerts.push({ label: '成本审核因配置/价格变化已失效', to: 'cost' })
  }
  if (ov.docs.some(d => d.review === 'stale' || d.outdated.length > 0)) {
    staleAlerts.push({ label: '交付文档章节与最新项目依据不一致，审核已失效', to: 'deliver' })
  }

  return (
    <div className="workflow-shell">
      <div className="roadmap" role="navigation" aria-label="工程方案流转阶段">
        {steps.map((s, idx) => {
          const isCurrentPage = route.page === s.page && (s.key !== 'initial' || !ov.discoveryStatus?.initialCurrent)
          return (
            <div key={s.key} className="roadmap-item">
              <a href={href(s.page, ov.project.id)} className={cx('unit', s.tone, isCurrentPage && 'active-page')}>
                <span className="unit-num">{s.tone === 'complete' ? '✓' : s.tone === 'stale' ? '!' : s.num}</span>
                <div className="unit-text">
                  <strong>{s.title}</strong>
                  <small>{s.sub}</small>
                </div>
              </a>
              {idx < steps.length - 1 ? <div className={cx('stem', s.tone === 'complete' && 'done')} /> : null}
            </div>
          )
        })}
      </div>
      {staleAlerts.length ? (
        <div className="phase-banner" role="status">
          <Icon name="shield" size={16} />
          <div className="grow">
            <strong>上游依据联动提醒：</strong>
            {staleAlerts.map((a, i) => (
              <span key={a.label}>
                {i > 0 ? ' · ' : ''}
                <a href={href(a.to, ov.project.id)} className="banner-link">{a.label} →</a>
              </span>
            ))}
          </div>
          {ov.v4.discovery && !ov.discoveryStatus?.confirmed && route.page !== 'discovery' ? (
            <a className="btn small teal" href={href('discovery', ov.project.id)}>进入需求访谈 →</a>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Frame({ route, children }: { route: Route; children: ReactNode }) {
  const { ov, pid } = useStore()
  const pendingChanges = (ov?.v4.changes.some(c => c.status === 'pending') || (ov?.v4.supportNotes ?? []).some(n => n.status === 'draft')) ?? false
  const staleCost = ov ? Object.values(ov.cost.reviews).some(r => r === 'stale') : false
  const staleDoc = ov ? ov.docs.some(d => d.review === 'stale' || d.outdated.length > 0) : false
  const unconfirmedDiscovery = Boolean(ov?.v4.discovery && !ov.discoveryStatus?.confirmed)
  const latestBase = ov ? [...ov.baselines].sort((a, b) => b.number - a.number)[0] : undefined

  const dotFor = (id: PageId): 'warn' | 'red' | false => {
    if (!ov) return false
    if (id === 'discovery' && unconfirmedDiscovery) return 'warn'
    if (id === 'change' && pendingChanges) return 'warn'
    if (id === 'research' && (ov.v4.questions.some(q => q.status === 'needs_review') || ov.v4.findings.some(f => f.needsReview))) return 'warn'
    if (id === 'solution' && !ov.route.confirmed) return ov.route.decision ? 'red' : 'warn'
    if (id === 'cost' && staleCost) return 'red'
    if (id === 'deliver' && staleDoc) return 'red'
    return false
  }

  return (
    <div className="app">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand">
          <div className="mark">M</div>
          <div>
            <div className="brand-name">MarketPilot <span className="brand-cn">智策</span></div>
            <div className="brand-sub">ENGINEERING AI WORKBENCH</div>
          </div>
        </div>
        <div className="nav-cap">全局空间 · WORKSPACE</div>
        {GLOBAL_PAGES.map(id => <NavItem key={id} id={id} route={route} />)}
        <div className="nav-cap">当前工程项目 · PROJECT</div>
        {pid && ov ? (
          <a className="nav-project" href={href('overview', pid)}>
            <div className="project-ico"><Icon name="layers" size={18} /></div>
            <div className="grow" style={{ minWidth: 0 }}>
              <b>{ov.project.name}</b>
              <small>{ov.project.customer || '合成/内部工程项目'} · 修订 {ov.revision}</small>
              <div className="nav-project-tags">
                <span className="nav-mini-tag">{ov.v4.discovery ? 'V4 引导探索' : '标准兼容'}</span>
                {latestBase ? <span className="nav-mini-tag teal">{latestBase.label}</span> : null}
              </div>
            </div>
          </a>
        ) : (
          <a className="nav-project" href={href('projects')}>
            <div className="project-ico"><Icon name="plus" size={18} /></div>
            <div><b>未选择项目</b><small>在“我的项目”中创建或选择</small></div>
          </a>
        )}
        {pid ? WORKSPACES.map(id => <NavItem key={id} id={id} route={route} dot={dotFor(id)} />) : null}
        <div className="nav-bottom">
          <NavItem id="settings" route={route} />
          <div className="profile">
            <div className="avatar">工</div>
            <div>
              <strong style={{ color: '#e2e8f0', fontSize: 12 }}>工程师工作空间</strong>
              <small>DSH 受控运行 · Human Gate</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            {ov && isWorkspace(route.page) ? (
              <>
                <a href={href('projects')} className="crumb-link">项目</a>
                <span>/</span>
                <a href={href('overview', pid)} className="crumb-link">{ov.project.name}</a>
                <span>/</span>
              </>
            ) : null}
            <strong>{NAMES[route.page]}</strong>
            {ov && isWorkspace(route.page) ? (
              <Badge tone={latestBase ? 'teal' : 'gray'}>{latestBase ? `正式基线 ${latestBase.label}` : `草稿 Rev.${ov.revision}`}</Badge>
            ) : null}
          </div>
          <div className="tools">
            {ov ? (
              <span className={cx('chip-online', !ov.capabilities.research.available && 'off')} title={ov.capabilities.research.reason}>
                <span className="online-dot" />
                {ov.capabilities.research.mode === 'unverified' ? '联网搜索：就绪' : ov.capabilities.research.available ? '联网搜索：已连接' : '仅本地知识库'}
              </span>
            ) : null}
            <ModelPicker />
            <a className="icon-btn" href={href('settings', route.pid)} title="设置" aria-label="设置"><Icon name="settings" /></a>
          </div>
        </header>
        <main className="workspace" id="page">
          {ov && isWorkspace(route.page) ? <WorkflowStepper ov={ov} route={route} /> : null}
          {children}
        </main>
      </div>
      {pid ? (
        <nav className="mobile-tabbar" aria-label="项目工作区">
          {(['overview', 'discovery', 'change', 'research', 'solution', 'cost', 'deliver'] as const).map(id => (
            <a key={id} className={cx(route.page === id && 'active')} href={href(id, pid)}><Icon name={ICONS[id]} />{SHORT[id] ?? NAMES[id]}</a>
          ))}
        </nav>
      ) : null}
    </div>
  )
}

/** Loads the project overview whenever the routed project changes. */
function Loader({ route, children }: { route: Route; children: ReactNode }) {
  const { refresh } = useStore()
  useEffect(() => { void refresh() }, [route.pid, refresh])
  return <Frame route={route}>{children}</Frame>
}

export function Shell({ render }: { render: (route: Route) => ReactNode }) {
  const route = useRoute()
  return <StoreProvider pid={route.pid}><Loader route={route}>{render(route)}</Loader></StoreProvider>
}
