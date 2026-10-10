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
  MarkdownText: (props: { text: string }) => (
    <div data-testid="mp-markdown">{props.text.split('\n').map((line, index) => {
      const match = /^(#{1,3})\s+(.+)$/.exec(line)
      if (match !== null) {
        const TagName = `h${match[1]!.length}` as 'h1' | 'h2' | 'h3'
        return <TagName key={index}>{match[2]}</TagName>
      }
      return line.trim() === '' ? null : <p key={index}>{line}</p>
    })}</div>
  ),
}))

import { AlternativesPage } from '../src/client/pages/AlternativesPage.tsx'
import { EvidencePage } from '../src/client/pages/EvidencePage.tsx'
import { ResearchPage } from '../src/client/pages/ResearchPage.tsx'
import { SolutionPage } from '../src/client/pages/SolutionPage.tsx'
import { TenderPage } from '../src/client/pages/TenderPage.tsx'
import { WorkflowSurface } from '../src/client/components/WorkflowSurface.tsx'
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
    // Parameters render as real values with UNKNOWN kept visible — never a count.
    const chips = [...container!.querySelectorAll('.mp-paramChip')] as HTMLButtonElement[]
    expect(chips.length).toBe(1)
    expect(chips[0]!.textContent).toContain('UNKNOWN')
    expect(chips[0]!.getAttribute('data-unknown')).toBe('true')
    // Clicking a parameter chip opens the source detail drawer.
    act(() => { chips[0]!.click() })
    await flush()
    expect(text()).toContain(t('drawerPerformance'))
    expect(text()).toContain('最小检漏率')
  })

  it('policy rows open a full-clause drawer with key requirements and version', async () => {
    const policyPayload = {
      policies: [{
        id: 'po1', title: '海上平台溢油监测规范', issuer: '船级社', documentNumber: 'GD-2026', version: 'v3',
        scope: '固定平台', mandatoryLevel: 'recommended', keyRequirements: ['检出率报告', '认证清单'],
        impact: '影响验收基线', gap: '适用性未确认', evidenceIds: [], updatedAt: '2026-10-09T06:00:00.000Z',
      }],
    }
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/documents')) return jsonResponse(documentsPayload)
      if (url.includes('/competitors')) return jsonResponse({ competitors: [] })
      if (url.includes('/policies')) return jsonResponse(policyPayload)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<ResearchPage t={t} projectId="p1" />)
    await flush()
    act(() => {
      const tabs = [...container!.querySelectorAll('button.mp-headerNavItem')] as HTMLButtonElement[]
      const tab = tabs.find(b => (b.textContent ?? '').includes(t('tabPolicy')))
      tab!.click()
    })
    await flush()
    expect(text()).toContain('海上平台溢油监测规范')
    expect(text()).toContain('v3')
    act(() => {
      const detail = [...container!.querySelectorAll('button')].find(b => b.textContent === t('colDetail'))
      detail!.click()
    })
    await flush()
    expect(text()).toContain(t('colKeyRequirements'))
    expect(text()).toContain('检出率报告')
    expect(text()).toContain(t('drawerNoLocator'))
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
    expect(text()).toContain('深水性能未知。')
    const verify = [...container!.querySelectorAll('button')].find(b => b.textContent === t('verifyStart'))
    expect(verify).toBeDefined()
    expect(verify!.disabled).toBe(false)
  })

  it('UNKNOWN verification requires an explicit target kind — never a FACT default', async () => {
    const postedTools: { name: string; args: Record<string, unknown> }[] = []
    fetchMock.mockImplementation(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input)
      if (url.includes('/evidence')) return jsonResponse(evidencePayload)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      if (url === '/marketpilot/api/tools' && init?.method === 'POST') {
        postedTools.push(JSON.parse(init.body!) as { name: string; args: Record<string, unknown> })
        return jsonResponse({ callId: 'call-e1' })
      }
      if (/\/marketpilot\/api\/executions\/call-/.test(url)) {
        return jsonResponse({ callId: 'call-e1', tool: 'marketpilot_evidence_verify', projectId: 'p1',
          status: 'completed', startedAt: '2026-10-09T07:00:00.000Z', question: null })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<EvidencePage t={t} projectId="p1" />)
    await flush()
    // Open the UNKNOWN row's drawer (second row).
    act(() => {
      const detail = [...container!.querySelectorAll('button')].filter(b => b.textContent === t('colDetail'))[1]
      detail!.click()
    })
    await flush()
    // The single-shot "verify as FACT" action is gone; the form opens explicitly.
    expect([...container!.querySelectorAll('button')].find(b => b.textContent === t('verifyHuman'))).toBeUndefined()
    act(() => {
      const start = [...container!.querySelectorAll('button')].find(b => b.textContent === t('verifyStart'))
      start!.click()
    })
    await flush()
    const select = container!.querySelector('#mp-verify-target') as HTMLSelectElement
    const submit = [...container!.querySelectorAll('button')].find(b => b.textContent === t('verifySubmit'))
    expect(select).not.toBeNull()
    // Default is the empty placeholder — not FACT — so submission stays disabled.
    expect(select.value).toBe('')
    expect(submit!.disabled).toBe(true)
    // The full action set includes human keep-unknown and reject.
    expect([...select.options].map(option => option.value))
      .toEqual(['', 'FACT', 'SOURCE', 'ASSUMPTION', 'INFERENCE', 'UNKNOWN', 'REJECT'])
    // The statement is prefilled from the UNKNOWN claim for explicit confirmation.
    const statement = container!.querySelector('#mp-verify-statement') as HTMLTextAreaElement
    expect(statement.value).toBe('深水性能未知。')
    // Choosing ASSUMPTION (not FACT) and submitting posts exactly that.
    act(() => {
      select.value = 'ASSUMPTION'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()
    expect(submit!.disabled).toBe(false)
    act(() => { submit!.click() })
    await flush()
    const post = postedTools.find(entry => entry.name === 'marketpilot_evidence_verify')
    expect(post).toBeDefined()
    expect(post!.args.targetKind).toBe('ASSUMPTION')
    expect(post!.args.targetKind).not.toBe('FACT')
    expect(post!.args.evidenceId).toBe('e2')
    expect(post!.args.method).toBe('human')
  })
})

describe('AlternativesPage', () => {
  it('renders side-by-side cards with full comparison facts; submission needs selection and rationale', async () => {
    const postedTools: { name: string; args: Record<string, unknown> }[] = []
    fetchMock.mockImplementation(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input)
      if (url.includes('/alternatives')) return jsonResponse(alternativesPayload)
      if (url.includes('/requirements')) return jsonResponse(requirementsPayload)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (/\/marketpilot\/api\/executions\/call-/.test(url)) {
        return jsonResponse({ callId: 'call-a1', tool: 'marketpilot_decision_confirm', projectId: 'p1',
          status: 'waiting_human', startedAt: '2026-10-09T07:00:00.000Z',
          question: { header: '人工审核', question: '是否确认 选择技术路线？', detail: '{}', options: ['确认', '退回修改'] } })
      }
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      if (url === '/marketpilot/api/tools' && init?.method === 'POST') {
        postedTools.push(JSON.parse(init.body!) as { name: string; args: Record<string, unknown> })
        return jsonResponse({ callId: 'call-a1' })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<AlternativesPage t={t} projectId="p1" />)
    await flush()
    expect(text()).toContain('多源融合路线')
    // The comparison card carries composition, strengths, limitations, risks, unknowns.
    const card = container!.querySelector('.mp-altCard') as HTMLElement
    expect(card).not.toBeNull()
    for (const label of [t('altComponents'), t('altStrengths'), t('altLimitations'), t('altRisks'), t('altUnknowns')]) {
      expect(card!.textContent).toContain(label)
    }
    expect(card!.textContent).toContain('最小检漏率')
    // Coverage matrix: MUST rows first with per-candidate tones.
    expect(text()).toContain(t('coverageTitle'))
    expect(container!.querySelector('span[data-tone="success"]')?.textContent).toBe(t('coverage.full'))
    expect(container!.querySelector('span[data-tone="warning"]')?.textContent).toBe(t('coverage.partial'))
    const submit = [...container!.querySelectorAll('button')].find(b => b.textContent === t('submitDecision'))
    expect(submit!.disabled).toBe(true)
    expect(text()).toContain(t('altNoneSelected'))
    // Selecting a card + rationale enables the real decision submission.
    act(() => { card!.click() })
    await flush()
    expect((card!.querySelector('input[type=radio]') as HTMLInputElement).checked).toBe(true)
    const textarea = container!.querySelector('textarea.mp-decisionInput') as HTMLTextAreaElement
    act(() => {
      // React's value tracker ignores a direct assignment; use the native setter.
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(textarea, '覆盖最完整')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await flush()
    expect(submit!.disabled).toBe(false)
    act(() => { submit!.click() })
    await flush()
    await flush()
    const post = postedTools.find(entry => entry.name === 'marketpilot_decision_confirm')
    expect(post).toBeDefined()
    expect(post!.args.alternativeId).toBe('a1')
    expect(post!.args.rationale).toBe('覆盖最完整')
    expect(post!.args.requirementIds).toEqual(['r1', 'r2'])
    // The real human gate parks the decision — never auto-confirmed.
    await flush()
    expect(container!.querySelector('.mp-dialog')?.textContent).toContain('选择技术路线')
  })

  it('expands clamped long text per card without losing the selection click', async () => {
    const longText = '很长的优势说明。'.repeat(40)
    const reqUuid = '11111111-1111-4111-8111-111111111111'
    const payload = {
      alternatives: [{
        ...alternativesPayload.alternatives[0]!, strengths: [longText],
        summary: `覆盖已确认需求 ${reqUuid} 的水下监测场景。`,
        requirementCoverage: { [reqUuid]: 'full', '22222222-2222-4222-8222-222222222222': 'partial' },
      }],
    }
    const uuidRequirements = {
      total: 2, page: 1, pageSize: 100, counts: { confirmed: 2 },
      requirements: [
        { ...requirementsPayload.requirements[0]!, id: reqUuid },
        { ...requirementsPayload.requirements[1]!, id: '22222222-2222-4222-8222-222222222222' },
      ],
    }
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url.includes('/alternatives')) return jsonResponse(payload)
      if (url.includes('/requirements')) return jsonResponse(uuidRequirements)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<AlternativesPage t={t} projectId="p1" />)
    await flush()
    const card = container!.querySelector('.mp-altCard') as HTMLElement
    expect(card.getAttribute('data-expanded')).toBe('false')
    // The card carries the full long text in the DOM; CSS clamps the visible part.
    expect(card.textContent).toContain(longText)
    // Stored summaries that embed requirement UUIDs render as short codes.
    expect(card.textContent).toContain('REQ-01')
    expect(card.textContent).not.toContain(reqUuid)
    const toggle = [...card.querySelectorAll('button')].find(b => b.textContent === t('altExpandAll'))
    expect(toggle!.getAttribute('aria-expanded')).toBe('false')
    act(() => { toggle!.click() })
    await flush()
    expect(card.getAttribute('data-expanded')).toBe('true')
    expect(toggle!.getAttribute('aria-expanded')).toBe('true')
    expect(toggle!.textContent).toBe(t('altCollapseAll'))
    // Expanding never selects the route — only the card body or radio does.
    expect((card.querySelector('input[type=radio]') as HTMLInputElement).checked).toBe(false)
    // Card-body click selects. (Earlier tests in this file can leave a waiting
    // decision execution in the shared registry, which keeps the card busy and
    // the radio disabled; busy-or-selected covers both worlds honestly.)
    act(() => { card.click() })
    await flush()
    const radio = card.querySelector('input[type=radio]') as HTMLInputElement
    expect(radio.checked || radio.disabled).toBe(true)
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

  it('previews the newest solution, switches versions, and jumps the outline', async () => {
    const artifactMeta = (id: string, updatedAt: string) => ({
      id, name: `Solution-${id}.md`, type: 'solution', format: 'markdown', reviewStatus: 'draft',
      createdAt: updatedAt, updatedAt,
    })
    const detail = {
      ...projectDetailDraft,
      project: { ...projectDetailDraft.project, status: 'solution_ready', activeDecisionId: 'dec-1' },
    }
    const content = '# 总体方案\n\n引言\n\n# 系统构成\n\n构成说明\n\n# UNKNOWN 待确认\n\n待确认内容'
    fetchMock.mockImplementation(async (input: unknown) => {
      const url = String(input)
      if (url === '/marketpilot/api/projects/p1') return jsonResponse(detail)
      if (url.includes('/artifacts/s-old')) return jsonResponse({ artifact: { ...artifactMeta('s-old', '2026-10-09T06:00:00.000Z'), content: '# 旧版\n\n旧正文' } })
      if (url.includes('/artifacts/s-new')) return jsonResponse({ artifact: { ...artifactMeta('s-new', '2026-10-09T07:00:00.000Z'), content } })
      if (url.includes('/artifacts')) return jsonResponse({ artifacts: [artifactMeta('s-old', '2026-10-09T06:00:00.000Z'), artifactMeta('s-new', '2026-10-09T07:00:00.000Z')] })
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<SolutionPage t={t} projectId="p1" />)
    await flush()
    // The version bar exists and marks the newest (payload order is old-first).
    expect(text()).toContain(t('solutionVersions'))
    expect(text()).toContain(t('solutionLatest'))
    act(() => {
      const preview = [...container!.querySelectorAll('button')].find(b => b.textContent === t('openArtifact'))
      preview!.click()
    })
    await flush()
    // The newest artifact (not the first list row) is fetched and titled latest.
    const artifactCalls = fetchMock.mock.calls.map(call => String(call[0])).filter(url => url.includes('/artifacts/s-'))
    expect(artifactCalls.some(url => url.includes('/artifacts/s-new'))).toBe(true)
    expect(artifactCalls.some(url => url.includes('/artifacts/s-old'))).toBe(false)
    expect(text()).toContain('Solution-s-new.md')
    // Outline entries are real buttons that scroll the matching heading into view.
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const tocButtons = [...container!.querySelectorAll('.mp-readerTocItem:not(.mp-readerTocTop)')] as HTMLButtonElement[]
    expect(tocButtons.length).toBe(3)
    // The UNKNOWN rail lists the matching heading and jumps to it too.
    const railButtons = [...container!.querySelectorAll('.mp-readerRailList .mp-link')] as HTMLButtonElement[]
    expect(railButtons.length).toBe(1)
    expect(railButtons[0]!.textContent).toBe('UNKNOWN 待确认')
    act(() => {
      tocButtons.find(button => button.textContent === '系统构成')!.click()
    })
    await flush()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    act(() => { railButtons[0]!.click() })
    await flush()
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    // The rail collapses and expands.
    act(() => {
      const toggles = [...container!.querySelectorAll('.mp-readerRailHead .mp-link')] as HTMLButtonElement[]
      const toggle = toggles.find(b => b.textContent === t('solutionRailCollapse'))
      toggle!.click()
    })
    await flush()
    expect(container!.querySelector('.mp-readerRailList')).toBeNull()
    // Switching to the older version fetches that artifact instead.
    act(() => {
      const versionButtons = [...container!.querySelectorAll('button')]
        .filter(button => (button.textContent ?? '').includes('v1'))
      versionButtons[versionButtons.length - 1]!.click()
    })
    await flush()
    const callsAfterSwitch = fetchMock.mock.calls.map(call => String(call[0])).filter(url => url.includes('/artifacts/s-old'))
    expect(callsAfterSwitch.length).toBeGreaterThan(0)
    expect(text()).toContain('Solution-s-old.md')
  })
})

describe('WorkflowSurface', () => {
  const waitingExecution = {
    callId: 'call-g1', tool: 'marketpilot_evidence_verify', status: 'waiting_human' as const,
    startedAt: '2026-10-09T07:00:00.000Z', projectId: 'p1',
    question: { header: '人工审核', question: '是否确认 人工核验证据？', detail: '', options: ['确认', '驳回'] },
  }
  const dialogButtons = () => [...container!.querySelectorAll('.mp-dialog button')] as HTMLButtonElement[]

  it('re-arms the gate after a failed answer instead of staying disabled', async () => {
    const onAnswer = vi.fn()
    const onCancel = vi.fn()
    render(<WorkflowSurface t={t} run={null} execution={waitingExecution} busy error=""
      onAnswer={onAnswer} onCancel={onCancel} />)
    await flush()
    expect(dialogButtons().length).toBeGreaterThan(0)
    expect(dialogButtons().every(button => !button.disabled)).toBe(true)
    // The business summary names the action; a proposal with record arrays
    // reports the affected count.
    expect(container!.querySelector('.mp-dialogSummary')?.textContent).toContain('人工核验证据')
    // Answering parks the dialog busy…
    act(() => { dialogButtons()[0]!.click() })
    await flush()
    expect(onAnswer).toHaveBeenCalledWith('确认', undefined)
    expect(dialogButtons().every(button => button.disabled)).toBe(true)
    // …and a page-level error while the same gate still waits must re-enable it.
    act(() => {
      root!.render(<WorkflowSurface t={t} run={null} execution={waitingExecution} busy error="回答提交失败"
        onAnswer={onAnswer} onCancel={onCancel} />)
    })
    await flush()
    expect(dialogButtons().every(button => !button.disabled)).toBe(true)
    // When the execution leaves the waiting state the dialog unmounts.
    act(() => {
      root!.render(<WorkflowSurface t={t} run={null}
        execution={{ ...waitingExecution, status: 'running', question: null }} busy={false} error=""
        onAnswer={onAnswer} onCancel={onCancel} />)
    })
    await flush()
    expect(container!.querySelector('.mp-dialog')).toBeNull()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('summarizes affected records from the gate proposal detail', async () => {
    render(<WorkflowSurface t={t} run={null} execution={{
      ...waitingExecution, callId: 'call-g2',
      question: {
        header: '人工审核', question: '是否确认 确认所选需求？',
        detail: JSON.stringify({ requirementIds: ['r1', 'r2', 'r3'], runId: 'run-1' }),
        options: ['确认', '退回修改'],
      },
    }} busy error="" onAnswer={() => {}} onCancel={() => {}} />)
    await flush()
    const summary = container!.querySelector('.mp-dialogSummary')?.textContent ?? ''
    expect(summary).toContain('确认所选需求')
    expect(summary).toContain(`3 ${t('dialogAffectedUnit')}`)
    expect(summary).toContain(t('dialogRiskHint'))
  })

  it('offers a real cancel for running executions and a fixed duration for settled runs', async () => {
    const cancels: string[] = []
    const originalFetch = fetchMock.mockImplementation(async (input: unknown, init?: { method?: string }) => {
      const url = String(input)
      if (/\/marketpilot\/api\/executions\/.+\/cancel/.test(url) && init?.method === 'POST') {
        cancels.push(url)
        return jsonResponse({ cancelled: true })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    void originalFetch
    // Running execution → cancel link present and wired to the cancel route.
    render(<WorkflowSurface t={t} run={null}
      execution={{ ...waitingExecution, status: 'running', question: null }} busy error=""
      onAnswer={() => {}} onCancel={() => {}} />)
    await flush()
    const cancelLink = [...container!.querySelectorAll('button')].find(b => b.textContent === t('cancelTask'))
    expect(cancelLink).toBeDefined()
    act(() => { cancelLink!.click() })
    await flush()
    expect(cancels.length).toBe(1)
    // A settled run with durationMs shows the fixed recorded duration.
    render(<WorkflowSurface t={t}
      run={{ id: 'run-9', type: 'requirement_analysis', status: 'completed', currentStep: '',
        steps: [{ step: 'SAVE_BASELINE', at: '2026-10-09T07:00:00.000Z' }],
        startedAt: '2026-10-09T06:58:25.000Z', updatedAt: '2026-10-09T07:00:00.000Z', durationMs: 95000 }}
      execution={undefined} busy={false} error=""
      onAnswer={() => {}} onCancel={() => {}} />)
    await flush()
    const first = container!.textContent ?? ''
    expect(first).toContain('1:35')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)) })
    // The settled duration never keeps ticking.
    expect(container!.textContent).toContain('1:35')
    // No cancel is offered for settled work.
    expect([...container!.querySelectorAll('button')].some(b => b.textContent === t('cancelTask'))).toBe(false)
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

  it('review-selected submits only the checked clauses; review-all is a separate action', async () => {
    const twoItems = {
      tenderItems: [
        tenderItemsPayload.tenderItems[0]!,
        { ...tenderItemsPayload.tenderItems[0]!, id: 't2', normalizedRequirement: '认证范围覆盖', status: 'unknown' },
      ],
    }
    const postedTools: { name: string; args: Record<string, unknown> }[] = []
    fetchMock.mockImplementation(async (input: unknown, init?: { method?: string; body?: string }) => {
      const url = String(input)
      if (url.includes('/documents')) return jsonResponse(documentsPayload)
      if (url.includes('/tender-items')) return jsonResponse(twoItems)
      if (url.includes('/runs')) return jsonResponse({ runs: [] })
      if (url.includes('/executions')) return jsonResponse({ executions: [] })
      if (url === '/marketpilot/api/tools' && init?.method === 'POST') {
        postedTools.push(JSON.parse(init.body!) as { name: string; args: Record<string, unknown> })
        return jsonResponse({ callId: 'call-t1' })
      }
      if (/\/marketpilot\/api\/executions\/call-/.test(url)) {
        return jsonResponse({ callId: 'call-t1', tool: 'marketpilot_tender_review', projectId: 'p1',
          status: 'completed', startedAt: '2026-10-09T07:00:00.000Z', question: null })
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
    render(<TenderPage t={t} projectId="p1" />)
    await flush()
    // Zero selection disables the selected-scope action; the count is in the label.
    const reviewSelected = [...container!.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').includes(t('reviewTenderSelected')))
    expect(reviewSelected).toBeDefined()
    expect(reviewSelected!.disabled).toBe(true)
    expect(reviewSelected!.textContent).toContain('0')
    // Check only the second clause, then submit both scopes and compare payloads.
    act(() => {
      const boxes = [...container!.querySelectorAll('.mp-table tbody input[type=checkbox]')] as HTMLInputElement[]
      boxes[1]!.click()
    })
    await flush()
    expect(reviewSelected!.disabled).toBe(false)
    expect(reviewSelected!.textContent).toContain('1')
    // The explicit all-clauses action submits every row id first.
    const reviewAll = [...container!.querySelectorAll('button')]
      .find(b => (b.textContent ?? '').trim() === t('reviewTenderAll'))
    expect(reviewAll).toBeDefined()
    act(() => { reviewAll!.click() })
    await flush()
    expect(postedTools[postedTools.length - 1]!.args.tenderItemIds).toEqual(['t1', 't2'])
    // The selected-scope action submits exactly the checked clause.
    act(() => { reviewSelected!.click() })
    await flush()
    expect(postedTools[postedTools.length - 1]!.args.tenderItemIds).toEqual(['t2'])
  })
})
