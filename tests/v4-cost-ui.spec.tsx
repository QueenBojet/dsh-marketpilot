// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { CostPage } from '../src/workbench-ui/pages/cost.tsx'
import { StoreProvider, useStore } from '../src/workbench-ui/store.tsx'
import { harness } from './v4-harness.ts'

let root: Root | undefined
let container: HTMLDivElement | undefined
function LoadedCost() {
  const { refresh } = useStore()
  useEffect(() => { void refresh() }, [refresh])
  return <CostPage />
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount() })
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

async function setupCost(beforePost?: (attempt: number) => Promise<void>) {
  const host = await harness()
  const pid = host.project.id
  const item = await host.services.v4.solution.addConfig(pid, { group: 'test', name: 'Synthetic device', quantity: 4, unit: 'unit' })
  let posts = 0
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('/marketpilot/api/', '')
    if (init?.method === 'POST' && path.endsWith('/cost-lines')) { posts++; await beforePost?.(posts) }
    const result = await host.call(init?.method ?? 'GET', path,
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined)
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body }
  }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<StoreProvider pid={pid}><LoadedCost /></StoreProvider>) })
  return { ...host, pid, item, posts: () => posts }
}

it('creates one BOM row when sync is clicked twice during an outstanding request', async () => {
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const host = await setupCost(() => pending)
  const { pid, item } = host
  const sync = [...container!.querySelectorAll('button')].find(b => b.textContent?.includes('按配置一键生成 BOM 行'))!
  expect(sync).toBeDefined()
  // Both events enter before React commits the button's busy state.
  await act(async () => { sync.click(); sync.click() })
  const disabledDuringRequest = sync.disabled
  await act(async () => {
    release()
    await vi.waitFor(() => expect(host.services.v4.solution.cost(pid).result.lines.length).toBeGreaterThan(0))
    await new Promise(resolve => setTimeout(resolve, 30))
  })
  expect(disabledDuringRequest).toBe(true)
  expect(host.posts()).toBe(1)
  const rows = host.services.v4.solution.cost(pid).result.lines
  expect(rows.map(r => r.quantity)).toEqual([4])
  const overview = (await host.call('GET', `projects/${pid}/v4/overview`)).body as { v4: { costLines: { configItemIds: string[] }[] } }
  expect(overview.v4.costLines[0]!.configItemIds).toEqual([item.id])
})

it('persists a human-entered cost line note', async () => {
  const host = await setupCost()
  await act(async () => { [...container!.querySelectorAll('button')].find(b => b.textContent?.includes('新增成本行'))!.click() })
  const input = (label: string) => [...document.querySelectorAll('label.form-label')]
    .find(el => el.querySelector('span')?.textContent === label)!.querySelector<HTMLInputElement>('input')!
  await act(async () => {
    const field = input('名称 *'); field.value = 'Synthetic cost line'; Simulate.change(field)
  })
  await act(async () => {
    const field = input('备注'); field.value = 'Needs supplier verification'; Simulate.change(field)
  })
  await act(async () => { [...document.querySelectorAll('button')].find(b => b.textContent === '保存')!.click() })
  const overview = (await host.call('GET', `projects/${host.pid}/v4/overview`)).body as { v4: { costLines: { note: string }[] } }
  expect(overview.v4.costLines[0]!.note).toBe('Needs supplier verification')
})

it('reports a partially completed sync and retries only the remaining configuration', async () => {
  const host = await setupCost(async attempt => { if (attempt === 2) throw new Error('Simulated request failure') })
  await host.services.v4.solution.addConfig(host.pid, { group: 'test', name: 'Second device', quantity: 1, unit: 'unit' })
  await act(async () => { root!.render(<StoreProvider pid={host.pid}><LoadedCost key="reload" /></StoreProvider>) })
  const sync = () => [...container!.querySelectorAll('button')].find(b => b.textContent?.includes('按配置一键生成 BOM 行'))!
  await act(async () => { sync().click(); await new Promise(resolve => setTimeout(resolve, 60)) })
  expect(container!.querySelector('.toast')?.textContent).toContain('已创建 1/2 行')
  expect(host.services.v4.solution.cost(host.pid).result.lines).toHaveLength(1)
  await act(async () => { sync().click(); await new Promise(resolve => setTimeout(resolve, 60)) })
  expect(host.services.v4.solution.cost(host.pid).result.lines).toHaveLength(2)
  expect(host.posts()).toBe(3)
})
