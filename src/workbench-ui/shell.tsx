/** App shell: sidebar, topbar, mobile tab bar and hash routing between global pages and project workspaces. */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Icon } from './icons.tsx'
import { StoreProvider, useStore } from './store.tsx'
import { cx } from './ui.tsx'

export const GLOBAL_PAGES = ['home', 'projects', 'library', 'runs'] as const
export const WORKSPACES = ['overview', 'change', 'research', 'solution', 'cost', 'deliver'] as const
export type PageId = typeof GLOBAL_PAGES[number] | typeof WORKSPACES[number] | 'settings'

export const NAMES: Record<PageId, string> = {
  home: '工作台', projects: '我的项目', library: '研究资料库', runs: '运行记录', settings: '设置',
  overview: '项目总览', change: '资料与变更', research: '智能研究', solution: '方案与决策', cost: '成本与报价', deliver: '文档与交付',
}
const ICONS: Record<PageId, string> = {
  home: 'home', projects: 'folder', library: 'library', runs: 'clock', settings: 'settings',
  overview: 'activity', change: 'diff', research: 'microscope', solution: 'layers', cost: 'coins', deliver: 'book',
}
const isWorkspace = (p: string): p is typeof WORKSPACES[number] => (WORKSPACES as readonly string[]).includes(p)
const LAST = 'marketpilot.v4.project'

export interface Route { page: PageId; pid: string | undefined }

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

function NavItem({ id, route, dot }: { id: PageId; route: Route; dot?: boolean }) {
  return (
    <a className={cx('nav-item', route.page === id && 'active')} href={href(id, route.pid)} aria-current={route.page === id ? 'page' : undefined}>
      <Icon name={ICONS[id]} /><span>{NAMES[id]}</span>{dot ? <span className="nav-dot" title="有待处理事项" /> : null}
    </a>
  )
}

function Frame({ route, children }: { route: Route; children: ReactNode }) {
  const { ov, pid } = useStore()
  const pending = ov?.v4.changes.some(c => c.status === 'pending') ?? false
  const cap = ov?.capabilities.model
  return (
    <div className="app">
      <aside className="sidebar" aria-label="主导航">
        <div className="brand"><div className="mark">M</div><div>
          <div className="brand-name">MarketPilot <span className="brand-cn">智策</span></div>
          <div className="brand-sub">ENGINEERING INTELLIGENCE</div></div></div>
        <div className="nav-cap">WORKSPACE</div>
        {GLOBAL_PAGES.map(id => <NavItem key={id} id={id} route={route} />)}
        <div className="nav-cap">CURRENT PROJECT</div>
        {pid && ov ? (
          <a className="nav-project" href={href('overview', pid)}>
            <div className="project-ico"><Icon name="layers" size={18} /></div>
            <div><b>{ov.project.name}</b><small>{ov.project.customer || '未填写客户'} · 修订 {ov.revision}</small></div>
          </a>
        ) : <a className="nav-project" href={href('projects')}><div className="project-ico"><Icon name="plus" size={18} /></div><div><b>未选择项目</b><small>在“我的项目”中创建或选择</small></div></a>}
        {pid ? WORKSPACES.map(id => <NavItem key={id} id={id} route={route} dot={id === 'change' && pending} />) : null}
        <div className="nav-bottom">
          <NavItem id="settings" route={route} />
          <div className="profile"><span className="avatar">工</span><span>工程师工作空间<small>本机独立网页 · 仅回环地址</small></span></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">工作台{ov && isWorkspace(route.page) ? <><span>/</span>{ov.project.name}</> : null}<span>/</span><strong>{NAMES[route.page]}</strong></div>
          <div className="tools">
            {cap ? <span className={cx('chip-online', !cap.available && 'off')} title={cap.reason}>
              <span className="online-dot" />{cap.available ? `模型可用 · ${cap.mode === 'offline' ? '离线夹具' : cap.model ?? cap.provider ?? 'DSH'}` : '模型不可用'}
            </span> : null}
            <a className="icon-btn" href={href('settings', route.pid)} title="设置" aria-label="设置"><Icon name="settings" /></a>
          </div>
        </header>
        <main className="workspace" id="page">{children}</main>
      </div>
      {pid ? (
        <nav className="mobile-tabbar" aria-label="项目工作区">
          {(['overview', 'change', 'research', 'solution', 'deliver'] as const).map(id => (
            <a key={id} className={cx(route.page === id && 'active')} href={href(id, pid)}><Icon name={ICONS[id]} />{NAMES[id].slice(0, 4)}</a>
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
