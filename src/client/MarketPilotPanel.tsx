/**
 * The MarketPilot main panel: the registration-level component of the `main`
 * keyed slot. Selecting the plugin pops the V4 standalone workbench out into
 * its own named window — reused and focused on later activations so the
 * workbench never reloads — while the panel itself shows a launch card with a
 * manual fallback and the V3 native panel behind one click. The native branch
 * reads the navigation store the registration declared and dispatches to page
 * components with plain data and callbacks.
 */
import { useEffect, useState } from 'react'
import { AppHeader } from './components/AppHeader.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { ProjectOverviewPage } from './pages/ProjectOverviewPage.tsx'
import { ProjectsPage } from './pages/ProjectsPage.tsx'
import { TasksPage } from './pages/TasksPage.tsx'
import type { MarketPilotText } from './locales.ts'
import type { MarketPilotActions, UseMarketPilotState } from './stores.ts'

/** The framework-derived props the slot renderer supplies. */
export interface MarketPilotPanelProps {
  t: MarketPilotText
  useStore: UseMarketPilotState
  actions: MarketPilotActions
}

/** The named window the standalone workbench lives in. */
export const WORKBENCH_WINDOW = 'marketpilot-v4-workbench'

/** Reuse the named workbench window (focus without reload) or open it fresh. */
function launchWorkbenchWindow(): boolean {
  try {
    const win = window.open('', WORKBENCH_WINDOW)
    if (win && !win.closed) {
      if (win.location.href === 'about:blank' || win.location.pathname !== '/marketpilot/workbench') {
        win.location.assign('/marketpilot/workbench')
      }
      win.focus()
      return true
    }
    if (win === null) return Boolean(window.open('/marketpilot/workbench', WORKBENCH_WINDOW))
    return false
  } catch {
    return false
  }
}

/**
 * Render the launch card, or the classic native panel when explicitly opened.
 * @param props - locale text, the store selector hook, and bound actions.
 * @returns the panel tree.
 */
export function MarketPilotPanel({ t, useStore, actions }: MarketPilotPanelProps) {
  // Hooks must run unconditionally: the classic branch subscribes to the store.
  const [classic, setClassic] = useState(false)
  const [launched, setLaunched] = useState<'opening' | 'opened' | 'blocked'>('opening')
  const view = useStore(state => state.view)
  const mode = useStore(state => state.view.kind === 'project' ? state.workflowModes?.[state.view.projectId] ?? 'guided' : 'guided')
  useEffect(() => {
    if (classic) return
    setLaunched(launchWorkbenchWindow() ? 'opened' : 'blocked')
  }, [classic])
  if (!classic) {
    return (
      <div className="mp-launchRoot">
        <div className="mp-launchCard">
          <h3 className="mp-launchTitle">{t('productName')}</h3>
          <p className="mp-launchText">
            {launched === 'blocked' ? t('workbenchOpenBlocked') : t('workbenchOpened')}
          </p>
          <a className="mp-launchOpen" href="/marketpilot/workbench" target={WORKBENCH_WINDOW}>{t('openWorkbench')}</a>
          <button type="button" className="mp-launchClassic" title={t('classicPanelHint')} onClick={() => { setClassic(true) }}>
            {t('classicPanel')}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className="mp-root">
      <AppHeader t={t} view={view} actions={actions} />
      <div className="mp-scroll">
        <div className="mp-content">
          {view.kind === 'home' ? <HomePage t={t} actions={actions} /> : null}
          {view.kind === 'projects' ? <ProjectsPage t={t} actions={actions} /> : null}
          {view.kind === 'tasks' ? <TasksPage t={t} actions={actions} /> : null}
          {view.kind === 'project' ? <ProjectOverviewPage key={view.projectId} t={t} actions={actions} view={view} mode={mode} /> : null}
        </div>
      </div>
    </div>
  )
}
