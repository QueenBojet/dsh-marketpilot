/**
 * Minimal client-side service faces the MarketPilot browser half consumes.
 * External-plugin contract: only `react`, `@deepseek-ai/dsh-client-store` and
 * `@deepseek-ai/dsh-client-ui-primitives` are runtime imports; every other
 * harness package stays type-only or behind these structural interfaces.
 */

/** The main-panel key shared by the `main` registration and `sidebar.panellist` id. */
export const PANEL_ID = 'marketpilot'

/** The locale-service subset this plugin uses. */
export interface LocaleService {
  register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): () => void
  bind(namespace: string): (key: string) => string
}

/** The tab-type registry surface (ui-sidebar-right's reflect-provided service). */
export interface SidebarRightTabs {
  register(definition: {
    id: string
    kind: string
    priority?: 'extension' | 'builtin' | 'fallback'
    title: (address?: string) => string
    guide?: { id: string; title: () => string; description?: () => string }[]
  }): () => void
}

/** The slots-service subset this entry uses. */
export interface SlotsService {
  inject(name: string, register: () => unknown): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The layout-service subset: selecting the global main panel. */
export interface LayoutService {
  selectPanel(panelId: string | null): void
}

/** The browser context cordis hands to `apply`. */
export interface MarketPilotClientContext {
  effect(callback: () => void | (() => void), label?: string): void
  locale: LocaleService
  sidebarRightTabs: SidebarRightTabs
  slots: SlotsService
  layout: LayoutService
}
