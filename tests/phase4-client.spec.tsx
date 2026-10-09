// @vitest-environment jsdom
/** Phase 4 page render tests: research, evidence, alternatives, solution, tender. */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: React.ComponentProps<'button'>) => <button {...props} />,
  Input: (props: React.ComponentProps<'input'>) => <input {...props} />,
  Tag: (props: { tone?: string; className?: string; children?: React.ReactNode }) => (
    <span data-tone={props.tone} className={props.className}>{props.children}</span>
  ),
  StateDot: () => <span data-testid="mp-stub-statedot" />,
  IconListPenOutlineRegular: () => <svg aria-hidden="true" />,
  MarkdownText: (props: { text: string }) => <div data-testid="mp-markdown">{props.text}</div>,
}))

import { AlternativesPage } from '../src/client/pages/AlternativesPage.tsx'
import { EvidencePage } from '../src/client/pages/EvidencePage.tsx'
import { ResearchPage } from '../src/client/pages/ResearchPage.tsx'
import { SolutionPage } from '../src/client/pages/SolutionPage.tsx'
import { TenderPage } from '../src/client/pages/TenderPage.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]

interface JsonLike { ok: boolean; status: number; json(): Promise<unknown> }
const jsonResponse = (payload: unknown): JsonLike => ({ ok: true, status: 200, json: async () => payload })

const documentsPayload = {
  documents: [
    { id: 'd1', name: 'datasheet.md', kind: 'competitor_datasheet', importedAt: '2026-10-09T06:00:00.000Z', bytes: 400, hasText: true },
    { id: 'd2', name: 'tender.md', kind: 'tender', importedAt: '2026-10-09T06:00:00.000Z', bytes: 300, hasText: true },
  ],
}

const competitorsPayload = {
  competitors: [{
    id: 'c1', company: 'TestCo', product: 'Sonar-1', technology: '多波束', targetScenario: '水面',
    performance: { 最小检漏率: null }, interfaces: [], certifications: [], cases: [],
    strengths: ['成熟'], limitations: ['深水未验证'], evidenceIds: ['e1'], updatedAt: '2026-10-09T06:00:00.000Z',
  }],
}

const evidencePayload = {
  total: 2, page: 1, pageSize: 50, counts: { draft: 1, UNKNOWN: 1 },
  evidence: [
    { id: 'e1', kind: 'SOURCE', status: 'verified', title: '客户纪要', statement: '客户要求连续监测。', sourceType: 'customer', sourceName: '纪要', supportingEvidenceIds: [], relatedRequirementIds: ['r1'], relatedCompetitorIds: [], updatedAt: '2026-10-09T06:00:00.000Z' },
    { id: 'e2', kind: 'UNKNOWN', status: 'draft', title: '待确认', statement: '深水性能未知。', sourceType: 'model', supportingEvidenceIds: [], relatedRequirementIds: [], relatedCompetitorIds: [], updatedAt: '2026-10-09T06:00:00.000Z' },
  ],
}

const alternativesPayload = {
  alternatives: [{
    id: 'a1', name: '多源融合路线', summary: '多源观测+人工复核', components: ['传感器', '平台'],
    strengths: [], limitations: [], risks: [], unknowns: ['最小检漏率'],
    requirementCoverage: { r1: 'full', r2: 'partial' }, evidenceIds: ['e1'], status: 'candidate',
    updatedAt: '2026-10-09T06:00:00.000Z',
  }],
}

const requirementsPayload = {
  total: 2, page: 1, pageSize: 100, counts: { confirmed: 2 },
  requirements: [
    { id: 'r1', shortId: 'r1', originalText: '原文', normalizedText: '连续监测', type: 'functional', priority: 'must', status: 'confirmed', sourceDocumentId: 'd1', updatedAt: '2026-10-09T06:00:00.000Z' },
    { id: 'r2', shortId: 'r2', originalText: '原文2', normalizedText: '夜间作业', type: 'functional', priority: 'should', status: 'confirmed', sourceDocumentId: 'd1', updatedAt: '2026-10-09T06:00:00.000Z' },
  ],
}

const tenderItemsPayload = {
  tenderItems: [{
    id: 't1', originalText: '检出率不低于 95%', normalizedRequirement: '检出率≥95%', claimKinds: ['technical_parameter'],
    status: 'unknown', requirementIds: [], evidenceIds: [], updatedAt: '2026-10-09T06:00:00.000Z',
  }],
}

const projectDetailDraft = {
  project: { id: 'p1', name: 'P', status: 'draft', updatedAt: '2026-10-09T06:00:00.000Z' },
  documents: [], requirements: [], evidence: [], alternatives: [], decisions: [], tenderItems: [], artifacts: [], workflowRuns: [],
}

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

describe('ResearchPage', () => {
  it('renders tabs, documents and the competitor matrix; extraction needs a selected document', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/documents')) return jsonResponse(documentsPayload)
      if (url.includes('/competitors')) return jsonResponse(competitorsPayload)
      if (url.includes('/policies')) return jsonResponse({ policies: [] })
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<ResearchPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain(t('tabCompetitor'))
    expect(text()).toContain(t('researchLocalMode'))
    expect(text()).toContain('datasheet.md')
    const extract = [...container!.querySelectorAll('button')].find(b => b.textContent === t('extractCompetitors'))
    expect(extract!.disabled).toBe(true)
    act(() => {
      const box = container!.querySelector('.mp-docItem input[type=checkbox]') as HTMLInputElement
      box.click()
    })
    await flush()
    expect(text()).toContain('TestCo')
    expect(text()).toContain('深水未验证')
  })
})

describe('EvidencePage', () => {
  it('renders the ledger with chips and opens the drawer with human verification', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/evidence')) return jsonResponse(evidencePayload)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<EvidencePage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain('客户要求连续监测。')
    expect(container!.querySelector('span[data-tone="success"]')?.textContent).toBe(t('evidenceStatus.verified'))
    act(() => {
      const detail = [...container!.querySelectorAll('button')].filter(b => b.textContent === t('colDetail'))[1]
      detail!.click()
    })
    await flush()
    expect(text()).toContain(t('verifyHint'))
    const verify = [...container!.querySelectorAll('button')].find(b => b.textContent === t('verifyHuman'))
    expect(verify).toBeDefined()
    expect(verify!.disabled).toBe(false)
  })
})

describe('AlternativesPage', () => {
  it('renders cards and the coverage matrix; submission needs selection and rationale', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/alternatives')) return jsonResponse(alternativesPayload)
      if (url.includes('/requirements')) return jsonResponse(requirementsPayload)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<AlternativesPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain('多源融合路线')
    expect(text()).toContain(t('coverageTitle'))
    expect(container!.querySelector('span[data-tone="success"]')?.textContent).toBe(t('coverage.full'))
    expect(container!.querySelector('span[data-tone="warning"]')?.textContent).toBe(t('coverage.partial'))
    const submit = [...container!.querySelectorAll('button')].find(b => b.textContent === t('submitDecision'))
    expect(submit!.disabled).toBe(true)
  })
})

describe('SolutionPage', () => {
  it('disables generation without a decision and shows the hint', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(projectDetailDraft)
      if (url.includes('/artifacts')) return jsonResponse({ artifacts: [] })
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<SolutionPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain(t('noDecisionYet'))
    const generate = [...container!.querySelectorAll('button')].find(b => b.textContent === t('generateSolution'))
    expect(generate!.disabled).toBe(true)
  })
})

describe('TenderPage', () => {
  it('extraction needs a tender document; items render with the unknown status', async () => {
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/documents')) return jsonResponse(documentsPayload)
      if (url.includes('/tender-items')) return jsonResponse(tenderItemsPayload)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<TenderPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain('tender.md')
    expect(text()).toContain(t('tenderCompliantNeedsEvidence'))
    expect(text()).toContain('检出率≥95%')
    expect(container!.querySelector('span[data-tone]')?.textContent).toBe(t('tenderStatus.unknown'))
  })
})
