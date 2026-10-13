// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { StoreProvider, useStore } from '../src/workbench-ui/store.tsx'

it('hides the previous project immediately and ignores responses from obsolete refreshes', async () => {
  const pending: { url: string; resolve: (v: unknown) => void; reject: (e: Error) => void }[] = []
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('model-catalog')
    ? Promise.resolve({ ok: true, json: async () => ({ providers: [], initial: null }) })
    : new Promise((resolve, reject) => pending.push({ url, resolve: data => resolve({ ok: true, json: async () => data }), reject }))))
  const node = document.createElement('div')
  const root = createRoot(node)
  let refresh!: () => Promise<void>
  function View({ pid }: { pid: string }) {
    const s = useStore(); refresh = s.refresh
    useEffect(() => { void s.refresh() }, [pid, s.refresh])
    return <div>{s.pid}|{s.ov?.project.name ?? 'empty'}|{s.error ?? ''}|{String(s.loading)}</div>
  }
  const render = (pid: string) => root.render(<StoreProvider pid={pid}><View pid={pid} /></StoreProvider>)
  try {
    await act(async () => { render('old') })
    await act(async () => { pending.shift()!.resolve({ project: { id: 'old', name: 'OLD PRIVATE CONTENT' } }) })
    expect(node.textContent).toContain('OLD PRIVATE CONTENT')
    let obsolete!: Promise<void>
    await act(async () => { obsolete = refresh() })
    const oldRequest = pending.shift()!
    await act(async () => { render('new') })
    expect(node.textContent).not.toContain('OLD PRIVATE CONTENT')
    expect(node.textContent).toBe('new|empty||true')
    await act(async () => { oldRequest.reject(new Error('old request failed')); await obsolete })
    expect(node.textContent).toBe('new|empty||true')
    await act(async () => { pending.shift()!.resolve({ project: { id: 'new', name: 'NEW PROJECT' } }) })
    expect(node.textContent).toBe('new|NEW PROJECT||false')
  } finally {
    await act(async () => { root.unmount() })
    vi.unstubAllGlobals()
  }
})
