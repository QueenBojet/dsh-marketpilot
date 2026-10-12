// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: () => <span />, IconListPenOutlineRegular: () => <svg />,
  Tag: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  MarkdownText: ({ text }: { text: string }) => <div>{text.split('\n').map((line, i) => /^##? /.test(line) ? <h2 key={i}>{line.replace(/^#+ /, '')}</h2> : <p key={i}>{line}</p>)}</div>,
}))
import { AlternativesPage } from '../src/client/pages/AlternativesPage.tsx'
import { SolutionPage } from '../src/client/pages/SolutionPage.tsx'
import { TenderPage } from '../src/client/pages/TenderPage.tsx'
import { ArtifactsPage } from '../src/client/pages/ArtifactsPage.tsx'
import { marketpilotLocales } from '../src/client/locales.ts'
import { executionStore } from '../src/client/hooks/executionStore.ts'
import { designOverview } from '../src/services/design-overview.ts'
import { captureArtifactDependencies } from '../src/services/artifact-context.ts'
import { fields, withInputs, workflowState, withDecision } from './workflow-fixtures.ts'
import type { ProjectState } from '../src/domain/state.ts'
import type { MarketPilotActions } from '../src/client/stores.ts'
import { WorkflowContext } from '../src/client/components/ProjectWorkflowOverview.tsx'
import { projectWorkflowOverview } from '../src/domain/project-workflow.ts'
import { capabilities } from './workflow-fixtures.ts'

const t = (key: keyof typeof marketpilotLocales.zh) => marketpilotLocales.zh[key]
let root: Root, container: HTMLElement, state: ProjectState, readFailure: boolean, wrongProject: boolean, wrongArtifact: boolean
const response = (payload: unknown) => ({ ok: true, status: 200, json: async () => payload })
const flush = async () => { await act(async () => {}) }
const button = (label: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === label)!
const click = async (element: HTMLElement) => { act(() => { element.click() }); await flush() }
const actions: MarketPilotActions = { goHome: vi.fn(), goProjects: vi.fn(), goTasks: vi.fn(), openProject: vi.fn(), setSection: vi.fn(), focusRecord: vi.fn() }
async function mount(page: ReactNode) { act(() => { root.render(page) }); await flush() }
async function input(label: string, value: string, select = false) {
  const element = [...container.querySelectorAll('[aria-label]')].find(el => el.getAttribute('aria-label') === label)!
  const proto = select ? HTMLSelectElement.prototype : element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value); element.dispatchEvent(new Event(select ? 'change' : 'input', { bubbles: true })) }); await flush()
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  state = withInputs(workflowState()); readFailure = false; wrongProject = false; wrongArtifact = false
  state.alternatives.push({ ...fields('alt1'), name: '路线 A', summary: '记录摘要', components: ['模块 A'], strengths: ['记录优势'], limitations: ['适用场景待确认'], risks: ['现场适应性待验证'], unknowns: ['检出率 UNKNOWN'], requirementCoverage: { req1: 'partial' }, evidenceIds: [], status: 'candidate' })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.endsWith('/design')) {
      if (readFailure) throw new Error('DESIGN_READ_FAILED')
      return response({ ...designOverview(state), projectId: wrongProject ? 'p2' : 'p1' })
    }
    if (url.includes('/artifacts/')) {
      const artifact = state.artifacts.find(row => row.id === url.split('/').at(-1))
      return response({ artifact: wrongArtifact ? { ...artifact, id: 'other-artifact' } : artifact })
    }
    if (url.includes('/executions')) return response({ executions: [] })
    if (url.includes('/runs')) return response({ runs: [] })
    throw new Error(`Unexpected ${url}`)
  }))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(() => { act(() => { root.unmount() }); container.remove(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

const guidedPage = (page: ReactNode) => <WorkflowContext.Provider value={{ mode: 'guided', snapshot: projectWorkflowOverview(state, capabilities, []), error: '' }}>{page}</WorkflowContext.Provider>

it('guided routes fold full coverage and retain a real human preview before execution', async () => {
  const start = vi.spyOn(executionStore, 'start').mockResolvedValue('gate-test')
  await mount(guidedPage(<AlternativesPage t={t} projectId="p1" actions={actions} />))
  expect(container.querySelectorAll('.mp-altCard')).toHaveLength(1)
  const details = container.querySelector<HTMLDetailsElement>('.mp-routeDetails')!
  expect(details.open).toBe(false)
  expect(details.textContent).toContain('Test requirement')
  expect(container.querySelector('.mp-routeSources')?.textContent).toContain('检出率 UNKNOWN')
  await click(container.querySelector('input[type=radio]')!)
  await input(t('rationale'), '真人确认测试理由')
  await click(button(t('submitDecision')))
  expect(container.querySelector('[role=dialog]')?.textContent).toContain('现场适应性待验证')
  expect(start).not.toHaveBeenCalled()
  await click(button(t('design.openHumanGate')))
  expect(start).toHaveBeenCalledOnce()
  expect(start).toHaveBeenCalledWith('marketpilot_decision_confirm', expect.objectContaining({ alternativeId: 'alt1', rationale: '真人确认测试理由' }))
})

it('guided solution switches exact saved summaries and exports the selected version without starting a model', async () => {
  state = withDecision()
  state.artifacts.push({ ...fields('old'), name: '旧方案', type: 'solution', format: 'markdown', reviewStatus: 'draft', content: '# 旧方案\n## 方案摘要\n选定路线：旧路线 A\n旧版本 UNKNOWN\n# 旧审计\n原始证据' },
    { ...fields('new'), createdAt: '2026-10-12T01:00:00.000Z', name: '新方案', type: 'solution', format: 'markdown', reviewStatus: 'approved', content: '# 新方案\n## 方案摘要\n选定路线：新路线 B\n人工 Decision：历史审核信息\n# 新审计\n完整正文' })
  const original = structuredClone(state)
  const start = vi.spyOn(executionStore, 'start').mockResolvedValue('unexpected')
  await mount(guidedPage(<SolutionPage t={t} projectId="p1" actions={actions} />))
  expect(container.querySelector('.mp-solutionSummary')?.textContent).toContain('新路线 B')
  expect(container.querySelector('.mp-solutionSummary')?.textContent).not.toContain('历史审核信息')
  expect(container.querySelector<HTMLDetailsElement>('.mp-solutionAudit')?.open).toBe(false)
  expect(container.querySelector('.mp-solutionAudit')?.textContent).toContain('历史审核信息')
  await input(t('solutionVersions'), 'old', true)
  expect(container.querySelector('.mp-solutionSummary')?.textContent).toContain('旧版本 UNKNOWN')
  expect(container.querySelector('.mp-solutionRoute')?.textContent).toContain('旧路线 A')
  expect(container.querySelector('.mp-solutionRoute')?.textContent).not.toContain('新路线 B')
  await click(button(t('guided.reviewExport')))
  expect(actions.focusRecord).toHaveBeenLastCalledWith('artifacts', 'artifact', 'old')
  await click(button(t('openArtifact')))
  expect(container.querySelector('.mp-solutionMarkdown')?.textContent).toContain('原始证据')
  expect(container.querySelector('.mp-readerLayout')?.getAttribute('data-rail')).toBe('closed')
  expect(start).not.toHaveBeenCalled()
  expect(state).toEqual(original)
})

it('rejects a wrong artifact detail instead of displaying it as the selected solution version', async () => {
  state = withDecision(); wrongArtifact = true
  state.artifacts.push({ ...fields('art1'), name: '方案', type: 'solution', format: 'markdown', reviewStatus: 'draft', content: 'Wrong detail content' })
  await mount(guidedPage(<SolutionPage t={t} projectId="p1" />))
  expect(container.textContent).toContain('ARTIFACT_DETAIL_INVALID')
  expect(container.querySelector('.mp-solutionExcerpt')).toBeNull()
})

it('separates expansion, selection and preview, compares real fields, and submits once with the frozen input version', async () => {
  const start = vi.spyOn(executionStore, 'start').mockResolvedValue('gate-test')
  await mount(<AlternativesPage t={t} projectId="p1" actions={actions} />)
  await click(button(t('altExpandAll')))
  await click(container.querySelector('.mp-altCardSummary')!)
  expect(container.querySelector('input:checked')).toBeNull(); expect(start).not.toHaveBeenCalled()
  await click(button(t('design.matrixView')))
  expect(container.querySelector('.mp-routeMatrix')?.textContent).toContain('适用场景待确认')
  await click(container.querySelector('input[type=radio]')!)
  await input(t('rationale'), '人工接受草稿风险，并要求现场补证。')
  await click(button(t('submitDecision')))
  expect(start).not.toHaveBeenCalled()
  const dialog = container.querySelector('[aria-label="'+t('design.decisionSummary')+'"]')!
  expect(dialog.textContent).toContain('0 / 1'); expect(dialog.textContent).toContain('REQ-01')
  expect(dialog.textContent).toContain(t('design.noVerifiedSource')); expect(dialog.textContent).toContain('检出率 UNKNOWN')
  const submit = button(t('design.openHumanGate'))
  act(() => { submit.click(); submit.click() }); await flush()
  expect(start).toHaveBeenCalledTimes(1)
  expect(start).toHaveBeenCalledWith('marketpilot_decision_confirm', expect.objectContaining({ projectId: 'p1', alternativeId: 'alt1', requirementIds: ['req1'], expectedVersion: designOverview(state).reviewVersion }))
})

it('polling input changes blocks an open decision preview without overwriting its rationale', async () => {
  vi.useFakeTimers()
  const start = vi.spyOn(executionStore, 'start').mockResolvedValue('unexpected')
  await mount(<AlternativesPage t={t} projectId="p1" />)
  await click(container.querySelector('input[type=radio]')!); await input(t('rationale'), '保留人工理由')
  await click(button(t('submitDecision')))
  state.documents.push({ ...fields('newdoc'), name: '补证.md', kind: 'report', textContent: '新的证据', importedAt: fields('newdoc').createdAt })
  await act(async () => { vi.advanceTimersByTime(3000) })
  expect(container.textContent).toContain(t('design.stalePreview'))
  expect(button(t('design.openHumanGate')).disabled).toBe(true)
  expect(container.textContent).toContain('保留人工理由'); expect(start).not.toHaveBeenCalled()
})

it('requires confirmed requirements and rejects unreadable or cross-project snapshots', async () => {
  state.requirements[0]!.status = 'proposed'
  await mount(<AlternativesPage t={t} projectId="p1" />)
  expect(button(t('generateAlternatives')).disabled).toBe(true)
  act(() => { root.unmount() }); root = createRoot(container); wrongProject = true
  await mount(<SolutionPage t={t} projectId="p1" />)
  expect(container.textContent).toContain('DESIGN_SNAPSHOT_INVALID'); expect(button(t('generateSolution')).disabled).toBe(true)
  wrongProject = false; readFailure = true
  await click(button(t('retry')))
  expect(container.textContent).toContain('DESIGN_READ_FAILED')
})

it('orders solution versions by generation time, preserves legacy content, and links actual body sources to the evidence drawer', async () => {
  state = withDecision()
  state.evidence.push(...['ev1', 'ev2'].map(id => ({ ...fields(id), kind: 'SOURCE' as const, title: id === 'ev1' ? '正文引用' : '仅附录记录', statement: '原文', sourceType: 'vendor' as const, status: 'verified' as const, supportingEvidenceIds: [], relatedRequirementIds: [], relatedCompetitorIds: [], relatedAlternativeIds: [] })))
  const content = '# 重复标题\n正文 [EVD-01]\n# 重复标题\n历史风险原文\n## 附录：编号对照\nEVD-02'
  state.artifacts.push({ ...fields('art-old'), updatedAt: '2030-01-01T00:00:00.000Z', name: '旧方案.md', type: 'solution', format: 'markdown', content, reviewStatus: 'approved', review: { reviewer: 'test', reviewedAt: fields('r').createdAt, reason: 'test only' } },
    { ...fields('art-new'), createdAt: '2026-10-12T00:00:00.000Z', name: '新方案.md', type: 'solution', format: 'markdown', content, reviewStatus: 'draft' })
  await mount(<SolutionPage t={t} projectId="p1" actions={actions} />)
  await click(button(t('openArtifact')))
  expect(container.querySelector('.mp-drawerTitle')?.textContent).toContain('新方案.md')
  const links = container.querySelector('[aria-label="'+t('design.sourceTrace')+'"]')!
  expect(links.textContent).toContain('正文引用'); expect(links.textContent).not.toContain('仅附录记录')
  await click(links.querySelector('button')!); expect(actions.focusRecord).toHaveBeenCalledWith('evidence', 'evidence', 'ev1')
  expect(container.textContent).toContain(t('design.decisionUnknown'))
  const targets: string[] = []
  Element.prototype.scrollIntoView = function () { targets.push(this.textContent ?? '') }
  const toc = container.querySelectorAll<HTMLButtonElement>('.mp-readerTocItem[data-level="1"]')
  await click(toc[1]!); expect(targets).toEqual(['重复标题'])
  expect(state.artifacts[0]!.content).toBe(content)
})

it('renders stale dependency reasons and actionable current UNKNOWN records without implying they belong to the old version', async () => {
  state = withDecision()
  state.artifacts.push({ ...fields('art1'), name: '已保存方案', type: 'solution', format: 'markdown', content: '# 风险\n原存档', reviewStatus: 'draft', dependencies: captureArtifactDependencies(state, 'solution') })
  state.evidence.push({ ...fields('unknown1'), kind: 'UNKNOWN', title: '新发现检漏率缺口', statement: '待补证', sourceType: 'model', status: 'draft', supportingEvidenceIds: [], relatedRequirementIds: [], relatedCompetitorIds: [], relatedAlternativeIds: [] })
  await mount(<SolutionPage t={t} projectId="p1" actions={actions} />); await click(button(t('openArtifact')))
  expect(container.textContent).toContain(t('design.context.possibly_stale'))
  const issues = container.querySelector('[aria-label="'+t('design.projectIssues')+'"]')!
  expect(issues.textContent).toContain('新发现检漏率缺口'); expect(container.textContent).toContain(t('design.projectIssuesHint'))
  await click(issues.querySelector('button')!); expect(actions.focusRecord).toHaveBeenCalledWith('evidence', 'evidence', 'unknown1')
})

it('tender is optional without text; filters clear scope while review-all uses all project clauses', async () => {
  const start = vi.spyOn(executionStore, 'start').mockResolvedValue('review-test')
  await mount(<TenderPage t={t} projectId="p1" actions={actions} />)
  expect(container.querySelector('[data-status="skipped_optional"]')).not.toBeNull()
  await click(button(t('design.goArtifacts'))); expect(actions.setSection).toHaveBeenCalledWith('artifacts')
  act(() => { root.unmount() }); root = createRoot(container)
  state.documents.push({ ...fields('tenderDoc'), name: 'synthetic-tender.md', kind: 'tender', textContent: '合成招标条款', importedAt: fields('t').createdAt })
  state.tenderItems.push(...['t1', 't2'].map(id => ({ ...fields(id), originalText: id, normalizedRequirement: id, claimKinds: ['technical_parameter' as const], status: 'unknown' as const, requirementIds: [], evidenceIds: [] })))
  await mount(<TenderPage t={t} projectId="p1" actions={actions} />)
  await click(container.querySelector('.mp-table input')!); expect(button(t('reviewTenderSelected')+'（1）').disabled).toBe(false)
  await input(t('design.tenderSearch'), 't2')
  expect(button(t('reviewTenderSelected')+'（0）').disabled).toBe(true)
  await click(container.querySelector('.mp-table input')!); await click(button(t('reviewTenderSelected')+'（1）'))
  expect(start).toHaveBeenLastCalledWith('marketpilot_tender_review', { projectId: 'p1', tenderItemIds: ['t2'] })
  await click(button(t('reviewTenderAll')))
  expect(start).toHaveBeenLastCalledWith('marketpilot_tender_review', { projectId: 'p1', tenderItemIds: ['t1', 't2'] })
  expect(container.textContent).toContain(t('design.synthetic'))
})

it('focuses a compliance artifact and keeps export behind the guarded human tool', async () => {
  state.artifacts.push({ ...fields('matrix1'), name: '符合性矩阵.md', type: 'compliance_matrix', format: 'markdown', reviewStatus: 'draft', content: '# 未核验参数仍为 unknown' })
  const start = vi.spyOn(executionStore, 'start').mockResolvedValue('export-test')
  await mount(<TenderPage t={t} projectId="p1" actions={actions} />)
  await click(button(t('design.exportCompliance')))
  expect(actions.focusRecord).toHaveBeenCalledWith('artifacts', 'artifact', 'matrix1')
  act(() => { root.unmount() }); root = createRoot(container)
  await mount(<ArtifactsPage t={t} projectId="p1" focus={{ kind: 'artifact', id: 'matrix1' }} />)
  expect(container.querySelector('[role="dialog"]')?.textContent).toContain('符合性矩阵.md')
  await input(t('exportPathPlaceholder'), 'E:\\exports\\matrix-new.md'); await click(button(t('exportArtifact')))
  expect(start).toHaveBeenCalledWith('marketpilot_artifact_export', { projectId: 'p1', artifactId: 'matrix1', path: 'E:\\exports\\matrix-new.md' })
})
