import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Minimal react stand-in: the bundle must only reach createElement/jsx at
 * render time, never during module initialization.
 */
const reactStub = {
  createElement: () => null,
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
  useRef: () => ({ current: 0 }),
  useState: (initial: unknown) => [initial, () => {}],
}

interface Registration { options: Record<string, unknown>; component: unknown }

interface LoadedPlugin {
  name: string
  inject: string[]
  apply(ctx: unknown): void
}

/** Store-engine stand-in: the registration only needs a creatable handle. */
const storeStub = {
  defineStore: () => ({
    create: () => ({ getSnapshot: () => ({ view: { kind: 'home' } }), subscribe: () => () => {}, actions: {} }),
  }),
}

/** Load the built bundle through the __ModuleLoader__ handoff and return the plugin. */
function loadPlugin(): LoadedPlugin {
  const code = readFileSync(fileURLToPath(new URL('../client/client.js', import.meta.url)), 'utf8')
  const requireStub = (name: string): unknown => {
    if (name === 'react') return reactStub
    if (name === '@deepseek-ai/dsh-client-store') return storeStub
    return {}
  }
  let captured: { id: string; factory: (require: (name: string) => unknown) => unknown } | undefined
  const loaderWindow = { __ModuleLoader__: { load: (entry: typeof captured) => { captured = entry } } }
  new Function('window', 'require', code)(loaderWindow, requireStub)
  expect(captured).toBeDefined()
  expect(captured!.id).toBe('dsh-marketpilot')
  return captured!.factory(requireStub) as LoadedPlugin
}

/** A fake client context recording effects, slot injections, and registrations. */
function fakeContext() {
  const injections: Array<{ name: string; register: () => unknown }> = []
  const registrations: Registration[] = []
  const localeBindings: string[] = []
  const registeredTabs: { id: string; kind: string }[] = []
  const selectPanelCalls: string[] = []
  const ctx = {
    effect: (callback: () => void | (() => void)) => { const dispose = callback(); return typeof dispose === 'function' ? dispose : () => {} },
    locale: {
      register: () => {},
      bind: (ns: string) => { localeBindings.push(ns); return (key: string) => key },
    },
    sidebarRightTabs: { register: (definition: { id: string; kind: string }) => { registeredTabs.push(definition); return () => {} } },
    layout: { selectPanel: (id: string) => { selectPanelCalls.push(id) } },
    slots: {
      inject: (name: string, register: () => unknown) => { injections.push({ name, register }); return () => {} },
      register: (options: Record<string, unknown>, component: unknown) => { registrations.push({ options, component }); return () => {} },
    },
  }
  return { ctx, injections, registrations, localeBindings, registeredTabs, selectPanelCalls }
}

/** Drive one recorded slots.inject callback to completion (generator or function). */
function drive(injection: { register: () => unknown }): void {
  const result = injection.register()
  if (typeof result === 'object' && result !== null && Symbol.iterator in (result as object)) {
    for (const _ of result as Iterable<unknown>) { void _ }
  }
}

describe('MarketPilot client bundle', () => {
  it('registers through __ModuleLoader__ and exports a loadable cordis client plugin', () => {
    const plugin = loadPlugin()
    expect(plugin.name).toBe('marketpilot')
    expect(plugin.inject).toEqual(['slots', 'locale', 'sidebarRightTabs', 'layout'])
  })

  it('registers the main panel with the marketpilot key and a store, never conversation', () => {
    const plugin = loadPlugin()
    const fake = fakeContext()
    plugin.apply(fake.ctx)
    const main = fake.injections.find(entry => entry.name === 'main')
    expect(main).toBeDefined()
    drive(main!)
    const registration = fake.registrations.find(entry => entry.options['name'] === 'main')
    expect(registration).toBeDefined()
    expect(registration!.options['key']).toBe('marketpilot')
    expect(registration!.options['key']).not.toBe('conversation')
    expect(registration!.options['locale']).toBe('marketpilot')
    expect(typeof registration!.options['store']).toBe('object')
    expect(typeof registration!.component).toBe('function')
  })

  it('registers the sidebar entry with the same id and a resolvable label', () => {
    const plugin = loadPlugin()
    const fake = fakeContext()
    plugin.apply(fake.ctx)
    const panelList = fake.injections.find(entry => entry.name === 'sidebar.panellist')
    expect(panelList).toBeDefined()
    drive(panelList!)
    const registration = fake.registrations.find(entry => entry.options['name'] === 'sidebar.panellist')
    expect(registration).toBeDefined()
    expect(registration!.options['id']).toBe('marketpilot')
    expect(typeof registration!.options['order']).toBe('number')
    expect((registration!.options['label'] as () => string)()).toBe('panelTitle')
  })

  it('keeps the legacy right-sidebar tab as a jump entry', () => {
    const plugin = loadPlugin()
    const fake = fakeContext()
    plugin.apply(fake.ctx)
    expect(fake.localeBindings).toContain('marketpilot')
    expect(fake.registeredTabs).toHaveLength(1)
    expect(fake.registeredTabs[0]).toMatchObject({ id: 'dsh-marketpilot/workbench', kind: 'marketpilot' })
    const tabBody = fake.injections.find(entry => entry.name === 'sidebar.right.pane.tab')
    expect(tabBody).toBeDefined()
    drive(tabBody!)
    const registration = fake.registrations.find(entry => entry.options['name'] === 'sidebar.right.pane.tab')
    expect(registration!.options['key']).toBe('dsh-marketpilot/workbench')
    // The tab body factory must be renderable without touching real services.
    expect(() => (registration!.component as () => unknown)()).not.toThrow()
  })

  it('resolves runtime imports only from the frozen host module table', () => {
    const code = readFileSync(fileURLToPath(new URL('../client/client.js', import.meta.url)), 'utf8')
    const specifiers = new Set<string>()
    for (const match of code.matchAll(/require\((['"])([^'"]+)\1\)/g)) specifiers.add(match[2]!)
    expect(specifiers.size).toBeGreaterThan(0)
    const frozen = new Set([
      'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
      '@deepseek-ai/dsh-client-ui-primitives', '@deepseek-ai/dsh-client-ui-dockkit',
    ])
    expect([...specifiers].filter(name => !frozen.has(name))).toEqual([])
  })
})
