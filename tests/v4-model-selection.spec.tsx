// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { MODEL_KEY, useModelSelection } from '../src/workbench-ui/model-selection.ts'

let root: Root | undefined
let view: ReturnType<typeof useModelSelection>
function Probe() { view = useModelSelection(); return <span>{view.selection?.model}</span> }
async function mount(initialModel = 'host-model') {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ providers: [{ id: 'dsh', name: 'DSH' }], initial: { provider: 'dsh', model: initialModel } }) })))
  const container = document.createElement('div')
  root = createRoot(container)
  await act(async () => { root!.render(<Probe />) })
}
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; localStorage.clear(); vi.unstubAllGlobals() })

it('keeps an explicit model and effort after remount and host default changes', async () => {
  await mount()
  expect(view!.selection?.model).toBe('host-model')
  await act(async () => view!.selectModel({ provider: 'dsh', model: 'chosen-model', reasoningEffort: 'low' }))
  await act(async () => root!.unmount())
  await mount('changed-host-model')
  expect(view!.selection).toEqual({ provider: 'dsh', model: 'chosen-model', reasoningEffort: 'low' })
  expect(JSON.parse(localStorage.getItem(MODEL_KEY)!)).toEqual(view!.selection)
})

it('retains an unavailable saved route for explicit correction rather than switching silently', async () => {
  localStorage.setItem(MODEL_KEY, JSON.stringify({ provider: 'removed', model: 'old-model' }))
  await mount()
  expect(view!.selection).toEqual({ provider: 'removed', model: 'old-model' })
  expect(view!.catalog?.providers).toEqual([{ id: 'dsh', name: 'DSH' }])
})
