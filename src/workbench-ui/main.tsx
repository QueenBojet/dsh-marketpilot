/** Entry point of the standalone V4 workbench page served at /marketpilot/workbench. */
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { Shell } from './shell.tsx'
import type { Route } from './shell.tsx'
import { CostPage } from './pages/cost.tsx'
import { DeliverPage } from './pages/docs.tsx'
import { LibraryPage, RunsPage, SettingsPage } from './pages/global.tsx'
import { HomePage, NeedProject } from './pages/home.tsx'
import { IntakePage } from './pages/intake.tsx'
import { OverviewPage } from './pages/overview.tsx'
import { ResearchPage } from './pages/research.tsx'
import { SolutionPage } from './pages/solution.tsx'

const WORKSPACE_PAGES: Record<string, () => ReactNode> = {
  overview: () => <OverviewPage />, change: () => <IntakePage />, research: () => <ResearchPage />,
  solution: () => <SolutionPage />, cost: () => <CostPage />, deliver: () => <DeliverPage />,
}

function page(route: Route): ReactNode {
  switch (route.page) {
    case 'home': return <HomePage mode="home" />
    case 'projects': return <HomePage mode="projects" />
    case 'library': return <LibraryPage />
    case 'runs': return <RunsPage />
    case 'settings': return <SettingsPage />
    default: return route.pid ? WORKSPACE_PAGES[route.page]!() : <NeedProject />
  }
}

const root = document.getElementById('root')
if (root) createRoot(root).render(<Shell render={page} />)
