/**
 * MarketPilot client entry: a "MarketPilot 工作台" right-sidebar tab hosting
 * the click-driven workbench. Built into the __ModuleLoader__ factory bundle
 * at client/client.js; react resolves through the host module table.
 *
 * The registration follows ui-sidebar-documentpreview's proven shape: the
 * tab-type registry is a module-level inject (reflect-provided services only
 * resolve there), and both registrations ride labelled effects so plugin
 * teardown withdraws the tab and its body.
 */
import { createElement as h } from 'react'
import { WorkbenchPanel, type WorkbenchText, type WorkbenchTextKey } from './Workbench.ts'

const NS = 'marketpilot'

const zh: Record<WorkbenchTextKey | 'tabTitle' | 'guideTitle' | 'guideDescription', string> = {
  tabTitle: 'MarketPilot 工作台', guideTitle: 'MarketPilot 工作台', guideDescription: '项目、需求、证据与分步 Workflow',
  refresh: '刷新', createProject: '新建项目', projectName: '项目名称', create: '创建', back: '返回项目列表',
  documents: '文档', requirements: '需求', evidence: '证据台账', alternatives: '候选路线与决策', decisions: '决策',
  artifacts: '成果', runs: '运行记录', importDoc: '导入文档', docPath: '文档绝对路径（.md/.txt）', docKind: '类型',
  importGo: '导入', extract: '抽取需求', confirmSelected: '确认所选需求', unknownCount: 'UNKNOWN',
  generateAlternatives: '生成候选路线', pickRoute: '选择一条候选路线并填写理由', confirmRoute: '确认技术路线',
  rationale: '选择理由（必填）', generateSolution: '生成技术方案', viewArtifact: '查看', tenderExtract: '抽取招标条款',
  tenderReview: '符合性审查', tenderItems: '招标条款', noProject: '暂无项目，请先创建。', loading: '加载中…',
  running: '执行中', confirmLabel: '确认', rejectLabel: '退回修改', cancelRun: '取消', reason: '查看详情',
  customReason: '补充说明（可选）', selectDocs: '请选择文档', selectRequirements: '没有等待确认的运行', loadError: '加载失败',
  status: '状态', summary: '统计',
}

const en: typeof zh = {
  tabTitle: 'MarketPilot Workbench', guideTitle: 'MarketPilot Workbench', guideDescription: 'Projects, requirements, evidence, step-by-step workflows',
  refresh: 'Refresh', createProject: 'New project', projectName: 'Project name', create: 'Create', back: 'Back to projects',
  documents: 'Documents', requirements: 'Requirements', evidence: 'Evidence', alternatives: 'Routes & decision', decisions: 'Decisions',
  artifacts: 'Artifacts', runs: 'Runs', importDoc: 'Import document', docPath: 'Absolute document path (.md/.txt)', docKind: 'Kind',
  importGo: 'Import', extract: 'Extract requirements', confirmSelected: 'Confirm selected', unknownCount: 'UNKNOWN',
  generateAlternatives: 'Generate routes', pickRoute: 'Pick one route and state the rationale', confirmRoute: 'Confirm route',
  rationale: 'Rationale (required)', generateSolution: 'Generate solution', viewArtifact: 'View', tenderExtract: 'Extract clauses',
  tenderReview: 'Compliance review', tenderItems: 'Tender clauses', noProject: 'No projects yet — create one.', loading: 'Loading…',
  running: 'running', confirmLabel: 'Confirm', rejectLabel: 'Revise', cancelRun: 'Cancel', reason: 'Details',
  customReason: 'Note (optional)', selectDocs: 'Select documents first', selectRequirements: 'No run waiting for confirmation', loadError: 'Load failed',
  status: 'Status', summary: 'Summary',
}

/** The locale-service subset this entry uses. */
interface LocaleService {
  register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): void
  bind(namespace: string): (key: string) => string
}

/** The tab-type registry surface (ui-sidebar-right's reflect-provided service). */
interface SidebarRightTabs {
  register(definition: {
    id: string
    kind: string
    priority?: 'extension' | 'builtin' | 'fallback'
    title: (address?: string) => string
    guide?: { id: string; title: () => string; description?: () => string }[]
  }): () => void
}

/** The slots-service subset this entry uses. */
interface SlotsService {
  inject(name: string, register: () => unknown): () => void
  register(options: Record<string, unknown>, component: () => unknown): unknown
}

interface WorkbenchClientContext {
  effect(callback: () => void | (() => void), label?: string): void
  locale: LocaleService
  sidebarRightTabs: SidebarRightTabs
  slots: SlotsService
}

export const name = 'marketpilot'
export const inject = ['slots', 'locale', 'sidebarRightTabs']

export function apply(ctx: WorkbenchClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'marketpilot: dictionaries')
  const t = ctx.locale.bind(NS)
  const text = t as WorkbenchText
  const definition = {
    id: 'dsh-marketpilot/workbench',
    kind: 'marketpilot',
    priority: 'extension' as const,
    title: () => t('tabTitle'),
    // Guide-entry title/description are locale-reactive thunks in the tab registry's contract.
    guide: [{ id: 'workbench', title: () => t('guideTitle'), description: () => t('guideDescription') }],
  }
  ctx.effect(() => ctx.sidebarRightTabs.register(definition), 'marketpilot: sidebar tab type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: definition.id },
    () => h(WorkbenchPanel, { t: text }),
  )), 'marketpilot: workbench tab body')
}
