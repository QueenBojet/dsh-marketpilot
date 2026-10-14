/** Global panel header: brand, view navigation, and the disabled task-center entry. */
import { IconListPenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarketPilotText } from '../locales.ts'
import type { MarketPilotActions, MarketPilotView } from '../stores.ts'

/**
 * Render the panel header.
 * @param props.t - the locale-bound text function.
 * @param props.view - the current navigation view (drives aria-current).
 * @param props.actions - bound store actions.
 * @returns the header row.
 */
export function AppHeader({ t, view, actions }: {
  t: MarketPilotText
  view: MarketPilotView
  actions: MarketPilotActions
}) {
  return (
    <header className="mp-header">
      <div className="mp-brand">
        <span className="mp-brandMark"><IconListPenOutlineRegular size={18} /></span>
        <span className="mp-brandName">{t('productName')}</span>
        <span className="mp-brandDesc">{t('productDescription')}</span>
      </div>
      <a
        href="/marketpilot/workbench"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="打开 MarketPilot V4 独立网页工作台"
        style={{ color: '#255fca', fontWeight: 700, border: '1px solid #d5e3fa',
          borderRadius: 9, padding: '7px 12px', textDecoration: 'none', whiteSpace: 'nowrap' }}
      >打开 V4 独立工作台 ↗</a>
      <nav className="mp-headerNav" aria-label={t('panelTitle')}>
        <button
          type="button" className="mp-headerNavItem"
          aria-current={view.kind === 'home' ? 'page' : undefined}
          onClick={() => { actions.goHome() }}
        >
          {t('navHome')}
        </button>
        <button
          type="button" className="mp-headerNavItem"
          aria-current={view.kind !== 'home' ? 'page' : undefined}
          onClick={() => { actions.goProjects() }}
        >
          {t('navProjects')}
        </button>
        <button
          type="button" className="mp-headerNavItem"
          aria-current={view.kind === 'tasks' ? 'page' : undefined}
          onClick={() => { actions.goTasks() }}
        >
          {t('navTasks')}
        </button>
      </nav>
    </header>
  )
}
