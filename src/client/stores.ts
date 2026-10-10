/**
 * Navigation store for the MarketPilot main panel. The `main` keyed slot
 * renders only the active entry, so the current view (and the open project +
 * section) lives in this registration-owned store and survives panel
 * switches and Session changes — the ui-plugin-manager navigation-store
 * pattern, minus its "reset when leaving the panel" step.
 */
import { defineStore, type ActionsDecl, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'

/** One project workspace section; `overview` is the Phase 1 landing section. */
export type ProjectSection =
  | 'overview' | 'requirements' | 'research' | 'evidence'
  | 'alternatives' | 'solution' | 'tender' | 'artifacts'

/** A cross-module jump target: land on a section and highlight one record. */
export type ProjectFocus = { readonly kind: 'requirement' | 'evidence'; readonly id: string }

/** Which page the main panel shows. */
export type MarketPilotView =
  | { readonly kind: 'home' }
  | { readonly kind: 'projects' }
  | { readonly kind: 'tasks' }
  | { readonly kind: 'project'; readonly projectId: string; readonly section: ProjectSection;
      readonly focus?: ProjectFocus | undefined }

export interface MarketPilotNavigationState {
  view: MarketPilotView
}

type NavigationActionsDecl = {
  goHome: (draft: MarketPilotNavigationState) => void
  goProjects: (draft: MarketPilotNavigationState) => void
  goTasks: (draft: MarketPilotNavigationState) => void
  openProject: (draft: MarketPilotNavigationState, projectId: string) => void
  setSection: (draft: MarketPilotNavigationState, section: ProjectSection) => void
  focusRecord: (draft: MarketPilotNavigationState, section: ProjectSection, kind: 'requirement' | 'evidence', id: string) => void
} & ActionsDecl<MarketPilotNavigationState>

/** The bound (draft-peeled) action shape components receive. */
export type MarketPilotActions = {
  goHome(): void
  goProjects(): void
  goTasks(): void
  openProject(projectId: string): void
  setSection(section: ProjectSection): void
  focusRecord(section: ProjectSection, kind: 'requirement' | 'evidence', id: string): void
}

/** Snapshot-selector hook the slot renderer synthesizes from the store seat. */
export type UseMarketPilotState = <T>(selector: (state: MarketPilotNavigationState) => T) => T

/**
 * Create the panel navigation store before the first render.
 * @returns the registration-owned store handle.
 */
export function createMarketPilotStore(): EngineStoreHandle<MarketPilotNavigationState, NavigationActionsDecl> {
  return defineStore({
    init: (): MarketPilotNavigationState => ({ view: { kind: 'home' } }),
    actions: {
      goHome: draft => { draft.view = { kind: 'home' } },
      goProjects: draft => { draft.view = { kind: 'projects' } },
      goTasks: draft => { draft.view = { kind: 'tasks' } },
      openProject: (draft, projectId) => { draft.view = { kind: 'project', projectId, section: 'overview' } },
      setSection: (draft, section) => {
        if (draft.view.kind !== 'project') return
        // Plain section navigation clears any stale cross-module focus.
        draft.view = { kind: 'project', projectId: draft.view.projectId, section }
      },
      focusRecord: (draft, section, kind, id) => {
        if (draft.view.kind !== 'project') return
        draft.view = { kind: 'project', projectId: draft.view.projectId, section, focus: { kind, id } }
      },
    },
  })
}
