// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { IntakePage } from '../src/workbench-ui/pages/intake.tsx'
import { StoreProvider, useStore } from '../src/workbench-ui/store.tsx'
import { b64, harness } from './v4-harness.ts'

let root: Root | undefined
let container: HTMLDivElement

function LoadedIntake() {
  const { refresh } = useStore()
  useEffect(() => { void refresh() }, [refresh])
  return <IntakePage />
}

async function click(label: string) {
  const button = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  expect(button, label).toBeDefined()
  await act(async () => { button!.click() })
}

async function setupPage() {
  const host = await harness()
  const pid = host.project.id
  await host.call('POST', `projects/${pid}/v4/intake`, {
    label: '合成需求', files: [{ name: 'test.txt', kind: 'customer_requirement', dataBase64: b64('系统应记录报警。') }],
  })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const result = await host.call(init?.method ?? 'GET', url.replace('/marketpilot/api/', ''),
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined)
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body }
  }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<StoreProvider pid={pid}><LoadedIntake /></StoreProvider>) })
  return { ...host, pid }
}

async function waitForGate() {
  await act(async () => {
    await vi.waitFor(() => expect(container.querySelector('[role="dialog"]')?.textContent).toContain('Human Gate'), { timeout: 2500 })
  })
}

async function waitForRunEnd() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
}

afterEach(async () => {
  if (root) await act(async () => { root!.unmount() })
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

it('single adoption reaches the real gate and creates only a proposed requirement after confirmation', async () => {
  const { services, pid } = await setupPage()
  await click('处理')
  await click('采纳为需求')
  await waitForGate()
  expect(services.requirements.list(pid)).toHaveLength(0)
  await click('确认')
  await waitForRunEnd()
  expect(services.requirements.list(pid).map(r => r.status)).toEqual(['proposed'])
  expect(container.querySelector('aside[aria-hidden="false"]')).toBeNull()
})

it('cancelled single adoption retains the pending change and the open drawer', async () => {
  const { services, pid } = await setupPage()
  await click('处理')
  await click('采纳为需求')
  await waitForGate()
  await click('取消运行')
  await waitForRunEnd()
  expect(services.requirements.list(pid)).toHaveLength(0)
  expect(container.querySelector('aside[aria-hidden="false"]')).not.toBeNull()
})

it('bulk adoption also requires a gate and preserves the selection on cancellation', async () => {
  const { services, pid } = await setupPage()
  const selected = container.querySelector<HTMLInputElement>('input[aria-label="选择"]')!
  await act(async () => { selected.click() })
  await click('批量采纳')
  await waitForGate()
  expect(services.requirements.list(pid)).toHaveLength(0)
  await click('取消运行')
  await waitForRunEnd()
  expect(selected.checked).toBe(true)
  await click('批量采纳')
  await waitForGate()
  await click('确认')
  await waitForRunEnd()
  expect(services.requirements.list(pid).map(r => r.status)).toEqual(['proposed'])
})
