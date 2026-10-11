/**
 * The MarketPilot main panel: the registration-level component of the `main`
 * keyed slot. It reads the navigation store the registration declared and
 * dispatches to page components with plain data and callbacks — pages stay
 * framework-free and testable with props alone.
 */
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

/**
 * Render the panel shell and the active page.
 * @param props - locale text, the store selector hook, and bound actions.
 * @returns the panel tree.
 */
export function MarketPilotPanel({ t, useStore, actions }: MarketPilotPanelProps) {
  const view = useStore(state => state.view)
  const mode = useStore(state => state.view.kind === 'project' ? state.workflowModes?.[state.view.projectId] ?? 'guided' : 'guided')
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
