import { describe, expect, it } from 'vitest'
import { createMarketPilotStore } from '../src/client/stores.ts'

describe('MarketPilot navigation store', () => {
  it('starts on home and walks home → projects → project → section', () => {
    const instance = createMarketPilotStore().create()
    expect(instance.getSnapshot().view).toEqual({ kind: 'home' })
    instance.actions.goProjects()
    expect(instance.getSnapshot().view).toEqual({ kind: 'projects' })
    instance.actions.openProject('p1')
    expect(instance.getSnapshot().view).toEqual({ kind: 'project', projectId: 'p1', section: 'overview' })
    instance.actions.setSection('requirements')
    expect(instance.getSnapshot().view).toEqual({ kind: 'project', projectId: 'p1', section: 'requirements' })
    instance.actions.goHome()
    expect(instance.getSnapshot().view).toEqual({ kind: 'home' })
  })

  it('opening another project resets the section to overview', () => {
    const instance = createMarketPilotStore().create()
    instance.actions.openProject('p1')
    instance.actions.setSection('tender')
    instance.actions.openProject('p2')
    expect(instance.getSnapshot().view).toEqual({ kind: 'project', projectId: 'p2', section: 'overview' })
  })

  it('setSection outside a project view is a no-op', () => {
    const instance = createMarketPilotStore().create()
    instance.actions.setSection('evidence')
    expect(instance.getSnapshot().view).toEqual({ kind: 'home' })
  })

  it('notifies subscribers on every navigation change', () => {
    const instance = createMarketPilotStore().create()
    let notified = 0
    const unsubscribe = instance.subscribe(() => { notified += 1 })
    instance.actions.goProjects()
    instance.actions.openProject('p1')
    expect(notified).toBe(2)
    unsubscribe()
    instance.actions.goHome()
    expect(notified).toBe(2)
  })
})
