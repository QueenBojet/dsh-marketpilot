// @vitest-environment jsdom
/**
 * V3.2.1 closeout regressions: superseded waiting records are never counted
 * as todos, the next-action card jumps to the section that owns the real
 * pending run, and cross-module jumps survive filters and pagination through
 * the single-record detail routes.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: React.ComponentProps<'button'>) => <button {...props} />,
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Tag: (props: { tone?: string; className?: string; children?: React.ReactNode }) => (
    <span data-tone={props.tone} className={props.className}>{props.children}</span>
  ),
  StateDot: (props: { state?: string }) => <span data-testid="mp-stub-statedot" data-state={props.state} />,
  MarkdownText: (props: { text: string }) => <div>{props.text}</div>,
  IconListPenOutlineRegular: () => <svg aria-hidden="true" />,
}))

import { HomePage } from '../src/client/pages/HomePage.tsx'
import { RequirementsPage } from '../src/client/pages/RequirementsPage.tsx'
import { EvidencePage } from '../src/client/pages/EvidencePage.tsx'
import { NextActionCard, waitSectionOf } from '../src/client/components/NextActionCard.tsx'
import { RunHistoryCard } from '../src/client/components/TaskCard.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]

interface JsonLike { ok: boolean; status: number; json(): Promise<unknown> }
const jsonResponse = (payload: unknown): JsonLike => ({ ok: true, status: 200, json: async () => payload })
const jsonError = (status: number, error: string): JsonLike => ({ ok: false, status, json: async () => ({ error }) })

let fetchMock: ReturnType<typeof vi.fn>
let container: HTMLElement | undefined
let root: Root | undefined

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  fetchMock = vi.fn()
  ;(globalThis as { fetch: unknown }).fetch = fetchMock
})

afterEach(() => {
  act(() => { root?.unmount() })
  container?.remove()
  container = undefined
  root = undefined
  vi.restoreAllMocks()
})

function render(node: React.ReactNode): HTMLElement {
  container = document.createElement('div')
  document.body.append(container)
  const created = createRoot(container)
  root = created
  act(() => { created.render(node) })
  return container
}

async function flush(): Promise<void> {
  await act(async () => {})
}

function text(): string {
  return container?.textContent ?? ''
}

describe('NextActionCard', () => {
  it('jumps to the section that owns the pending run, not the status baseline', () => {
    const gone: string[] = []
    render(
      <NextActionCard t={t} status="alternatives_ready" waiting={1} waitingType="requirement_analysis"
        onGo={section => { gone.push(section) }} />,
    )
    act(() => {
      const go = [...container!.querySelectorAll('button')].find(b => b.textContent === t('nextActionGo'))
      go!.click()
    })
    expect(gone).toEqual(['requirements'])
  })

  it('routes a solution wait to the alternatives section while the Decision is missing', () => {
    expect(waitSectionOf('solution_generation', undefined)).toBe('alternatives')
    expect(waitSectionOf('solution_generation', 'dec-1')).toBe('solution')
    expect(waitSectionOf('requirement_analysis', undefined)).toBe('requirements')
    expect(waitSectionOf('competitor_analysis', undefined)).toBeUndefined()
    const gone: string[] = []
    render(
      <NextActionCard t={t} status="requirements_ready" waiting={2} waitingType="solution_generation"
        onGo={section => { gone.push(section) }} />,
    )
    act(() => {
      const go = [...container!.querySelectorAll('button')].find(b => b.textContent === t('nextActionGo'))
      go!.click()
    })
    expect(gone).toEqual(['alternatives'])
  })

  it('keeps the status baseline hint when nothing is waiting', () => {
    render(<NextActionCard t={t} status="solution_ready" waiting={0} onGo={() => {}} />)
    expect(text()).toContain(t('next.solution_ready'))
  })
})

describe('RunHistoryCard superseded waits', () => {
  const baseRun = {
    id: 'run-old', type: 'requirement_analysis', status: 'waiting_human', currentStep: 'WAITING_HUMAN',
    startedAt: '2026-10-09T04:00:00.000Z', updatedAt: '2026-10-09T04:01:00.000Z',
    steps: [{ step: 'WAITING_HUMAN', at: '2026-10-09T04:01:00.000Z' }],
    projectId: 'p1', projectName: '遗留项目',
  }

  it('reports a superseded wait as history, not as a live approval', () => {
    render(<RunHistoryCard t={t} run={{ ...baseRun, supersededWait: true }} onOpenProject={() => {}} />)
    expect(text()).toContain(t('runStatus.superseded_wait'))
    expect(text()).toContain(t('supersededWaitHint'))
    expect(text()).not.toContain(t('runStatus.waiting_human'))
  })

  it('keeps the live approval label for a recoverable wait', () => {
    render(<RunHistoryCard t={t} run={baseRun} onOpenProject={() => {}} />)
    expect(text()).toContain(t('runStatus.waiting_human'))
    expect(text()).not.toContain(t('runStatus.superseded_wait'))
  })
})

describe('HomePage todo statistics', () => {
  const homeActions = {
    goHome: () => {}, goProjects: () => {}, goTasks: () => {},
    openProject: () => {}, setSection: () => {}, focusRecord: () => {},
  }
  const projectsPayload = {
    projects: [
      { id: 'p1', name: '含遗留等待', scenario: '监测', status: 'researching', updatedAt: '2026-10-09T08:00:00.000Z' },
    ],
  }

  it('counts only recoverable waits: superseded records stay out of the todos', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects') return jsonResponse(projectsPayload)
      if (url === '/marketpilot/api/executions') return jsonResponse({ executions: [] })
      if (url.includes('/runs')) {
        return jsonResponse({
          runs: [
            { id: 'run-stale', type: 'requirement_analysis', status: 'waiting_human', supersededWait: true },
            { id: 'run-live', type: 'solution_generation', status: 'waiting_human' },
          ],
        })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<HomePage t={t} actions={homeActions} />)
    await flush()
    await flush()
    // 统计卡：项目 1 · 待办 1（可恢复）· 运行 0 —— 遗留等待不计入待办。
    const values = [...container!.querySelectorAll('.mp-cardValue')].map(el => el.textContent)
    expect(values).toEqual(['1', '1', '0'])
    expect(text()).toContain(t('statPending'))
    const attention = container!.querySelector('.mp-attentionList')
    expect(attention?.textContent).toContain('含遗留等待')
    expect(attention?.textContent).toContain('1')
  })
})

describe('cross-module jump fallbacks (V3.2.1)', () => {
  const remoteId = '99999999-9999-4999-8999-999999999999'
  const requirementDetail = {
    id: remoteId, shortId: 'REQ-07', originalText: '分页外需求原文', normalizedText: '系统应支持分页外跳转',
    type: 'functional', priority: 'must', status: 'proposed', sourceDocumentId: 'd1',
    sourceDocumentName: 'brief.md', sourceLocator: '第 7 条', updatedAt: '2026-10-09T02:00:00.000Z',
  }
  const pageRequirements = {
    total: 1, page: 1, pageSize: 100, counts: { proposed: 1 },
    requirements: [{
      id: '10000000-0000-0000-0000-000000000001', shortId: 'REQ-01', originalText: '页内原文',
      normalizedText: '系统应连续监测', type: 'functional', priority: 'must', status: 'proposed',
      sourceDocumentId: 'd1', sourceDocumentName: 'brief.md', updatedAt: '2026-10-09T01:00:00.000Z',
    }],
  }
  const documentsPayload = {
    documents: [
      { id: 'd1', name: 'brief.md', kind: 'customer_requirement', importedAt: '2026-10-09T00:00:00.000Z', bytes: 120, hasText: true },
    ],
  }

  it('requirements: a jump target excluded by the current page still opens its drawer', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === `/marketpilot/api/projects/p1/requirements/${remoteId}`) {
        return jsonResponse({ requirement: requirementDetail })
      }
      if (url.startsWith('/marketpilot/api/projects/p1/requirements')) return jsonResponse(pageRequirements)
      if (url.startsWith('/marketpilot/api/projects/p1/documents')) return jsonResponse(documentsPayload)
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse({ runs: [] })
      if (url.startsWith('/marketpilot/api/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<RequirementsPage t={t} projectId="p1" focus={{ kind: 'requirement', id: remoteId }} />)
    await flush()
    await flush()
    expect(container!.querySelector('.mp-drawer')).not.toBeNull()
    expect(text()).toContain('分页外需求原文')
    expect(text()).toContain('第 7 条')
  })

  it('requirements: a jump to a deleted record shows the explicit miss notice', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes(`/requirements/${remoteId}`)) return jsonError(404, '需求记录不存在。')
      if (url.startsWith('/marketpilot/api/projects/p1/requirements')) return jsonResponse(pageRequirements)
      if (url.startsWith('/marketpilot/api/projects/p1/documents')) return jsonResponse(documentsPayload)
      if (url.startsWith('/marketpilot/api/projects/p1/runs')) return jsonResponse({ runs: [] })
      if (url.startsWith('/marketpilot/api/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<RequirementsPage t={t} projectId="p1" focus={{ kind: 'requirement', id: remoteId }} />)
    await flush()
    await flush()
    expect(text()).toContain(t('jumpMissing'))
    expect(container!.querySelector('.mp-drawer')).toBeNull()
  })

  it('evidence: a jump target excluded by the ledger filter still opens its drawer', async () => {
    const remoteEvidence = {
      id: remoteId, kind: 'SOURCE', status: 'verified', title: '页外证据', statement: '过滤外的证据声明。',
      sourceType: 'customer', sourceName: '客户纪要', supportingEvidenceIds: [],
      relatedRequirementIds: [], relatedCompetitorIds: [], updatedAt: '2026-10-09T03:00:00.000Z',
    }
    const ledgerPage = {
      total: 1, page: 1, pageSize: 50, counts: { verified: 1 },
      evidence: [{
        id: '10000000-0000-0000-0000-000000000002', kind: 'UNKNOWN', status: 'draft', title: '页内证据',
        statement: '页内声明。', sourceType: 'customer', supportingEvidenceIds: [],
        relatedRequirementIds: [], relatedCompetitorIds: [], updatedAt: '2026-10-09T03:01:00.000Z',
      }],
    }
    const detail = {
      project: { id: 'p1', name: '跳转项目', status: 'draft', updatedAt: '2026-10-09T00:00:00.000Z' },
      documents: [], requirements: [], evidence: [], alternatives: [], decisions: [],
      tenderItems: [], artifacts: [], workflowRuns: [],
    }
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === `/marketpilot/api/projects/p1/evidence/${remoteId}`) return jsonResponse({ evidence: remoteEvidence })
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(detail)
      if (url.includes('/evidence')) return jsonResponse(ledgerPage)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<EvidencePage t={t} projectId="p1" actions={{ goHome: () => {}, goProjects: () => {}, goTasks: () => {},
      openProject: () => {}, setSection: () => {}, focusRecord: () => {} }} focus={{ kind: 'evidence', id: remoteId }} />)
    await flush()
    await flush()
    expect(container!.querySelector('.mp-drawer')).not.toBeNull()
    expect(text()).toContain('过滤外的证据声明。')
  })
})
