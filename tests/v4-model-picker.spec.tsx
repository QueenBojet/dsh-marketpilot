// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ModelPicker } from '../src/workbench-ui/model-picker.tsx'

const selectModel = vi.hoisted(() => vi.fn())
vi.mock('../src/workbench-ui/store.tsx', () => ({ useStore: () => ({
  selection: { provider: 'first', model: 'model-a' }, selectModel,
  catalog: { providers: [{ id: 'first', name: 'First' }, { id: 'second', name: 'Second' }] },
  reloadModels: vi.fn(), toast: vi.fn(),
}) }))
it('opens outside the filtered sticky header and selects another DSH provider/model', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('&model=')
    ? { efforts: [{ id: 'low', name: 'Low' }], defaultEffort: 'low' }
    : { models: [{ id: url.includes('second') ? 'model-b' : 'model-a', name: 'Model' }] } })))
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<header style={{ backdropFilter: 'blur(13px)' }}><ModelPicker /></header>))
    await act(async () => container.querySelector('button')!.click())
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.closest('header'), 'fixed modal must escape the header containing block').toBeNull()
    const providers = dialog.querySelectorAll('select')[0]!
    await act(async () => { providers.value = 'second'; providers.dispatchEvent(new Event('change', { bubbles: true })) })
    const models = dialog.querySelectorAll('select')[1]!
    await act(async () => { models.value = 'model-b'; models.dispatchEvent(new Event('change', { bubbles: true })) })
    await act(async () => Array.from(dialog.querySelectorAll('button')).find(b => b.textContent === '使用此模型')!.click())
    expect(selectModel).toHaveBeenCalledWith({ provider: 'second', model: 'model-b', reasoningEffort: 'low' })
  } finally { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() }
})
