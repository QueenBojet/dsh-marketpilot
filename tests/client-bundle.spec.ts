import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Minimal react stand-in: the bundle must only reach createElement at render time. */
const reactStub = {
  createElement: () => null,
  useCallback: (fn: unknown) => fn,
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
  useRef: () => ({ current: 0 }),
  useState: (initial: unknown) => [initial, () => {}],
}

describe('MarketPilot client bundle', () => {
  it('registers through __ModuleLoader__ and exports a loadable cordis client plugin', () => {
    const code = readFileSync(fileURLToPath(new URL('../client/client.js', import.meta.url)), 'utf8')
    let captured: { id: string; factory: (require: (name: string) => unknown) => unknown } | undefined
    const loaderWindow = { __ModuleLoader__: { load: (entry: typeof captured) => { captured = entry } } }
    new Function('window', 'require', code)(loaderWindow, (name: string) => (name === 'react' ? reactStub : {}))
    expect(captured).toBeDefined()
    expect(captured!.id).toBe('dsh-marketpilot')
    const plugin = captured!.factory((name: string) => (name === 'react' ? reactStub : {})) as {
      name: string
      inject: string[]
      apply(ctx: unknown): void
    }
    expect(plugin.name).toBe('marketpilot')
    expect(plugin.inject).toEqual(['slots', 'locale', 'sidebarRightTabs'])
    const localeBindings: string[] = []
    const registeredTabs: { id: string; kind: string }[] = []
    plugin.apply({
      effect: (callback: () => unknown) => { const dispose = callback(); return typeof dispose === 'function' ? dispose : () => {} },
      locale: {
        register: () => {},
        bind: (ns: string) => { localeBindings.push(ns); return (key: string) => key },
      },
      sidebarRightTabs: {
        register: (definition: { id: string; kind: string }) => { registeredTabs.push(definition); return () => {} },
      },
      slots: { inject: () => {}, register: () => () => {} },
    })
    expect(localeBindings).toContain('marketpilot')
    expect(registeredTabs).toHaveLength(1)
    expect(registeredTabs[0]).toMatchObject({ id: 'dsh-marketpilot/workbench', kind: 'marketpilot' })
  })
})
