// @vitest-environment jsdom
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { ResearchPage } from '../src/workbench-ui/pages/research.tsx'
import { StoreProvider, useStore } from '../src/workbench-ui/store.tsx'
import type { RunDeps } from '../src/services/v4/base.ts'
import { harness, run as gatedRun } from './v4-harness.ts'

let root: Root | undefined
let container: HTMLDivElement

function LoadedResearch() {
  const { refresh } = useStore()
  useEffect(() => { void refresh() }, [refresh])
  return <ResearchPage />
}

const brief = { objective: '连续监测厂界甲烷', scenario: '室外厂界', scope: '四点监测', constraints: '预算待报价',
  acceptance: ['连续采集四个点位数据'], openQuestions: [] }
const route = (name: string) => ({ name, summary: `${name}候选`, components: ['采集设备'], strengths: [], limitations: [], risks: [],
  industrialSupport: '工业应用类别待核实', feasibility: '需现场验证', evidenceGaps: ['案例未核实'], researchDirections: [`${name}环境可靠性`] })

async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === label)
  expect(button, label).toBeDefined()
  await act(async () => { button!.click() })
}

/**
 * Poll across separate act scopes: state updates scheduled by async code (the run driver's
 * polling loop) only flush into the DOM at an act boundary, never inside one long act.
 */
async function until(check: () => boolean, label: string, rounds = 40, pause = 250) {
  for (let i = 0; i < rounds; i++) {
    if (check()) return
    await act(async () => { await new Promise(resolve => setTimeout(resolve, pause)) })
  }
  throw new Error(`condition not met: ${label}`)
}

const drawerSteps = (): HTMLTextAreaElement | undefined => {
  const areas = document.querySelector('aside.drawer.open')?.querySelectorAll('textarea')
  return areas?.[0] as HTMLTextAreaElement | undefined
}
const drawerQueries = (): HTMLTextAreaElement | undefined => {
  const areas = document.querySelector('aside.drawer.open')?.querySelectorAll('textarea')
  return areas?.[1] as HTMLTextAreaElement | undefined
}

/** Guided project with one open research question, a fixed support note, and an offline model
 *  queue: the auto-drafted plan first, then the research report. */
async function setupAutoPlanProject() {
  const host = await harness()
  const pid = host.project.id
  const s = host.services.v4
  await s.discovery.enable(pid)
  await s.discovery.saveBrief(pid, brief)
  // Brief confirmation and note fixing are human gates: approve them through the execution route.
  await gatedRun(host.call, pid, 'marketpilot_v4_discovery_confirm', {})
  const intake = await s.intake.intake(pid, { label: '现场资料', files: [{ name: '现场.txt', kind: 'other', textContent: '现场共有四个监测点位。' }] })
  const note = await s.discovery.saveNote(pid, { category: 'fact', title: '点位数量', content: '现场四点', relevance: '确定配置数量',
    documentId: intake.documentIds[0], quote: '现场共有四个监测点位。' })
  await gatedRun(host.call, pid, 'marketpilot_v4_support_fix', { noteId: note.id })
  // Brainstorm last: fixing support notes afterwards would invalidate the exploration.
  const initial: RunDeps = { route: { provider: 'test', model: 'test', source: 'override' }, signal: new AbortController().signal,
    model: { async generate({ schema }) { return schema.parse({ summary: '初筛比较', routes: [route('点式'), route('开路'), route('抽取')] }) } } }
  await s.discovery.brainstorm(pid, 'initial', initial)
  // The harness closes its bootstrap repository; read state through the live plugin service.
  const state = () => host.root.marketpilot.projectState(pid)
  const altId = state().v4!.explorations!.at(-1)!.routes[0]!.alternativeId
  await s.research.addQuestion(pid, { title: '高湿工况可靠性', direction: '高湿工况可靠性', decisionUse: '比较路线可靠性', alternativeIds: [altId] })
  const answers = [
    { steps: ['第一步：核对固定支撑摘要', '第二步：对比路线工况参数'], queries: ['激光 甲烷 高湿 可靠性'], mode: 'local' as const },
    { report: '## 结论\n依据固化资料完成自动提示词研究。', findings: [] },
  ]
  host.root.provide('marketpilotModel', { async generate({ schema }) { return schema.parse(answers.shift()) } })
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const result = await host.call(init?.method ?? 'GET', url.replace('/marketpilot/api/', ''),
      typeof init?.body === 'string' ? JSON.parse(init.body) : undefined)
    return { ok: result.status >= 200 && result.status < 300, status: result.status, json: async () => result.body }
  }))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => { root!.render(<StoreProvider pid={pid}><LoadedResearch /></StoreProvider>) })
  return { host, pid, state }
}

afterEach(async () => {
  if (root) await act(async () => { root!.unmount() })
  root = undefined
  container?.remove()
  vi.unstubAllGlobals()
})

it('starts research from auto-generated prompts: draft fills the drawer, one confirmation runs it', async () => {
  const { state } = await setupAutoPlanProject()
  // The start button is live without a confirmed plan — prompts are generated automatically now.
  await until(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === '开始研究'), 'page loaded with the start button')
  expect(container.textContent).toContain('未制定；点击“开始研究”将自动生成计划草稿')
  await click('开始研究')
  // The drawer opens and the model drafts the prompts by itself; nobody typed them.
  await until(() => drawerSteps()?.value.includes('第一步：核对固定支撑摘要') ?? false, 'auto-draft fills the steps')
  expect(drawerQueries()!.value).toContain('激光 甲烷 高湿 可靠性')
  expect(state().v4!.questions[0]!.plan).toBeUndefined()
  // One human confirmation saves the plan and chains straight into the research run.
  await click('确认计划并开始研究')
  await until(() => {
    const q = state().v4!.questions[0]!
    return q.status === 'answered' && (q.report ?? '').includes('自动提示词研究')
      && q.plan?.steps.length === 2 && Boolean(q.plan?.confirmedAt && q.plan?.confirmedBy)
  }, 'plan confirmed and research answered')
}, 30_000)

it('does not auto-draft again once a plan is confirmed; the drawer shows the saved prompts', async () => {
  const { state } = await setupAutoPlanProject()
  await until(() => [...document.querySelectorAll('button')].some(b => b.textContent?.trim() === '开始研究'), 'page loaded with the start button')
  await click('开始研究')
  await until(() => drawerSteps()?.value.includes('第一步：核对固定支撑摘要') ?? false, 'auto-draft fills the steps')
  await click('确认计划并开始研究')
  await until(() => state().v4!.questions[0]!.status === 'answered', 'research answered')
  // Reopening the plan shows the confirmed prompts; no further model call happens (queue empty).
  const runsBefore = state().v4!.runs.length
  await click('修改计划')
  await until(() => drawerSteps()?.value.includes('第一步：核对固定支撑摘要') ?? false, 'saved plan shown on reopen')
  expect(document.querySelector('aside.drawer.open')!.textContent).toContain('上次确认')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 750)) })
  expect(state().v4!.runs.length).toBe(runsBefore)
}, 30_000)
