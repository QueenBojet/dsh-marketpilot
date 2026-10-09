/**
 * MarketPilot client entry (V3): a full-width `main` keyed panel plus the
 * `sidebar.panellist` navigation entry, following ui-plugin-manager's proven
 * registration shape. The legacy right-sidebar tab is downgraded to a jump
 * button that selects the main panel. Built into the __ModuleLoader__ factory
 * bundle at client/client.js; react, the client store, and ui-primitives
 * resolve through the host's frozen module table.
 */
import { createElement as h } from 'react'
import { MarketPilotPanel } from './MarketPilotPanel.tsx'
import { LegacyWorkbenchTab } from './components/LegacyWorkbenchTab.tsx'
import { MarketPilotIcon } from './components/MarketPilotIcon.tsx'
import { PANEL_ID, type MarketPilotClientContext } from './context.ts'
import { marketpilotLocales, NS, type MarketPilotText } from './locales.ts'
import { createMarketPilotStore } from './stores.ts'
import { injectPanelStyles } from './styles.ts'

export const name = 'marketpilot'
export const inject = ['slots', 'locale', 'sidebarRightTabs', 'layout']

/**
 * Contribute the MarketPilot main workspace, its sidebar entry, and the
 * downgraded legacy tab.
 * @param ctx - the browser plugin context.
 */
export function apply(ctx: MarketPilotClientContext): void {
  // Concise arrow bodies: register() returns the idempotent disposer and
  // throws on a duplicate (ns, locale), so dropping it would crash a reload.
  ctx.effect(() => ctx.locale.register(NS, marketpilotLocales), 'marketpilot: dictionaries')
  ctx.effect(() => injectPanelStyles(), 'marketpilot: panel styles')
  const t = ctx.locale.bind(NS) as MarketPilotText

  // The workspace page: a root-scoped keyed panel with its navigation store
  // shared across renders, installed and rolled back atomically.
  ctx.slots.inject('main', function* mainRegistration() {
    const handle = createMarketPilotStore()
    const instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    yield ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, store }, MarketPilotPanel)
  })

  // The sidebar entry; the sidebar owns the button and resolves the label.
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 10,
    label: () => t('panelTitle'),
    locale: NS,
  }, MarketPilotIcon))

  // Legacy right-sidebar tab, downgraded to a jump entry into the main panel.
  const definition = {
    id: 'dsh-marketpilot/workbench',
    kind: 'marketpilot',
    priority: 'extension' as const,
    title: () => t('tabTitle'),
    guide: [{ id: 'workbench', title: () => t('guideTitle'), description: () => t('guideDescription') }],
  }
  ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'marketpilot: sidebar tab type')
  // Bare slots.inject (not wrapped in ctx.effect): the contribution is
  // fiber-bound like the two registrations above, matching ui-plugin-manager.
  ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: definition.id },
    () => h(LegacyWorkbenchTab, { t, open: () => { ctx.layout.selectPanel(PANEL_ID) } }),
  ))
}
