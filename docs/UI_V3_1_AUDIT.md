# MarketPilot UI / UX V3.1 — UX-0 审查报告（AUDIT）

> 阶段：UX-0（信息架构与样式方案，不改大面积代码）
> 日期：2026-10-09
> 执行：DSH 编程 Agent（GLM-5.3 Max，reasoning effort=max）
> 审查基线：`marketpilot` Git tree `70631a8bcb191b94865a087d7e661696ec21c4fb`（与设计文档 `docs/MarketPilot_UI_V3.1_审查与交互优化设计.md` 的审查基线一致，V3.0 后无业务代码改动）
> 实测环境：正在运行的 DSH Desktop Web GUI（127.0.0.1，真实用户数据，8 个真实项目）
> 上游对照：`deepseek-harness/`（`packages/client/web/src/platform.ts` 等，只读）

---

## 一、结论摘要

1. 设计文档 §2 的 15 项审查结论（UX-01…UX-15）**逐项与当前源码核对：15 项全部仍存在，无一与源码不符**。行号证据见 §二。
2. 真实 GUI 实测（16 张截图，浅色 + 深色 + 1024 窄视口，页面错误 0）确认了所有 P0 项的用户可见后果：首页 `—` 占位、项目页三层导航 + 八数字卡、方案阅读器 761px 宽装 15138px 高的长文、技术路线三张候选卡一屏只见一张。
3. 信息架构方案（§四）与组件拆分（§五）已按用户提供的 `docs/MarketPilot_UI_V3.1_交互原型.html` 对齐：单一纵向阶段导航 + 项目摘要头 + 阶段工作区统一「输入→执行→结果→复核」。
4. UI-R1 四项高信任度修复（设计文档 §7）已定位到精确行号与测试策略，可在用户确认后立即执行（不依赖视觉改版）。

## 二、源码逐项核对表（设计文档 §2 → 当前代码）

| ID | 设计文档结论 | 当前源码证据 | 核对结果 | 优先级 |
|---|---|---|---|---|
| UX-01 | 首页待审核/运行中以 `—` 占位 + “即将支持” | `pages/HomePage.tsx:54-63`（`statPending`/`statRunning` 恒为 `—`，`statPendingSoon`/`statRunningSoon` 提示）。实测：首页统计卡显示“— 待审核事项 待接入：需求审核视图（后续阶段）” | **仍存在**，与实测一致 | P0 |
| UX-02 | 六阶段胶囊 + 八分区 + DSH 左栏三层导航；八个数字卡 | `pages/ProjectOverviewPage.tsx:171-184`（`mp-phaseBar` 六胶囊）、`:190-200`（`mp-sidenav` 八项）、`:203-212`（`mp-countGrid` 八卡）。实测：6 胶囊 + 8 导航 + 8 数字卡 | **仍存在**，与实测一致 | P0 |
| UX-03 | 需求页 render 阶段 setState/refetch | `pages/RequirementsPage.tsx:98-109`：render 中直接 `setSeenMarker/setNotice/setSelectedRequirements/refreshAll()`。对照：`hooks/usePhase4.ts:91-101` 的 `useToolWorkflow` 已用 `useEffect` 处理同类 settled marker，迁移模式现成 | **仍存在** | P0 |
| UX-04 | 投标“符合性审查”提交全部行而非所选 | `pages/TenderPage.tsx:26`（`selectedItems` 状态存在）、`:67-73`（按钮提交 `rows.map(row=>row.id)`，选择态不参与；零选择也不禁用） | **仍存在** | P0 |
| UX-05 | 方案页取第一份 solution；目录 `<span>` 无跳转；侧抽屉阅读 | `pages/SolutionPage.tsx:40`（`.find(type==='solution')` 取首份）、`:96-101`（目录为 `mp-caption` span）、`:72-86`（`mp-reader` 抽屉）。实测：阅读器宽 761px，正文滚动高 15138px（15 章方案） | **仍存在**，实测数据见 §三 | P0 |
| UX-06 | UNKNOWN 核验按钮直接传 `targetKind:'FACT'` | `pages/EvidencePage.tsx:129-141`：`targetKind: open.kind === 'UNKNOWN' ? 'FACT' : open.kind`，method 恒 `human`，无目标类型选择器、无理由输入、无支撑证据展示 | **仍存在** | P0 |
| UX-07 | 竞品“参数”列只显示属性条数；证据 ID 串列；政策无详情链路 | `pages/ResearchPage.tsx:39`（`Object.keys(row.performance).length`）、`:183-184`（`evidenceIds.join(' · ')`）、政策表 `:142-149` 无行点击 | **仍存在** | P1 |
| UX-08 | 候选路线纵向叠加，理由输入在页尾 | `pages/AlternativesPage.tsx:60-86`（`mp-taskList` 纵向卡）、`:88-117`（覆盖矩阵在下）、`:118-136`（理由+提交在页尾）。实测：1440×900 视口内仅路线 A 一张卡完整可见，B/C 与决策区需滚动 | **仍存在**，实测截图 `07-alternatives-light.png` 直接证实 | P0 |
| UX-09 | 审核对话框展示原始问题；`answerBusy` 无复位链路 | `components/HumanReviewDialog.tsx:27-33`（原始 header/question/detail `<pre>`）；`components/WorkflowSurface.tsx:25,39-40`：`setAnswerBusy(true)` 后**全组件无任何 `setAnswerBusy(false)`**——同页后续新 Gate 将永久禁用按钮 | **仍存在**（`RequirementsPage` 本地 `reviewBusy` 有复位，但 `WorkflowSurface` 共享路径无） | P0 |
| UX-10 | TaskCard 找不到精确 runId 时按 type 回退 | `components/TaskCard.tsx:50-51`：`all.find(id===runId) ?? all.find(type===runType) ?? null` | **仍存在** | P0 |
| UX-11 | `useProjectRuns` 只加载一次 | `hooks/useExecution.ts:123-131`：mount 时 `refresh()` 一次，无失效/定时更新；工作流 settle 后概览阶段条不刷新 | **仍存在** | P1 |
| UX-12 | 上传 rejected 计数未提示；类型枚举英文直出 | `components/DocumentUploader.tsx:30-31,52`（`rejected` 计算后 `void rejected` 丢弃；部分不支持文件被静默过滤）、`:78`（`DOC_KINDS` 英文原样渲染） | **仍存在** | P0 |
| UX-13 | Drawer 以孤立 UUID 展示引用，缺跨模块跳转 | `pages/EvidencePage.tsx:121-125`（`relatedRequirementIds.join`）、`pages/TenderPage.tsx:152-153`、`pages/ResearchPage.tsx:183-184`；`SourceDrawer` 本身有原文/定位但无关联跳转 | **仍存在** | P1 |
| UX-14 | 样式集中单串 + 页面散布 inline style | `src/client/styles.ts:11-118`（单 `PANEL_CSS` 字符串注入）；`HomePage.tsx:42-45,75`、`ProjectOverviewPage.tsx:158-161` 等多处 `style={{...}}` | **仍存在** | P1 |
| UX-15 | 新建项目仅名称输入 | `pages/ProjectsPage.tsx:51-66`：单个名称 `Input` + 创建按钮；industry/customer/scenario 无入口（服务端 `marketpilot_project_create` 已支持） | **仍存在** | P1 |

补充核对（设计文档未列、实测发现）：

- 完成态任务的耗时显示基于 `Date.now()` 挂载差值而非 run 的 `durationMs`（`hooks/useExecution.ts:78-86` + `TaskProgress.tsx:21-23`），与 UX-5 阶段第 4 条相关。
- `ArtifactsPage.tsx` 列表有 `reviewStatus` 徽标与日期，但无版本选择、无导出审批入口（对应遗留项“Artifact 导出审批 UI”）。
- 冻结模块表核对：`tests/client-bundle.spec.ts:138-143` 与上游 `packages/client/web/src/platform.ts` 的 `PLATFORM_MODULES` 完全一致（9 个 specifier）。**任何新增 npm UI 依赖不可在运行时加载，V3.1 只能继续使用 ui-primitives 现有导出**（含 `Modal`、`RiskConfirmation`、`SegmentedTabs`、`SegmentedControl`、`Pill`、`DisclosureRow`、`Tooltip`、`Checkbox`、`Switch`、`relativeTime` 等，当前客户端仅用了其中约 6 个）。

## 三、真实 GUI 实测记录

### 3.1 方法与合规

- 工具：`marketpilot/.marketpilot/gui-acceptance/tools/cdp-ux0.mjs`、`cdp-ux0-dark.mjs`（V3.0 同款 CDP 无头 Chrome 方案）。
- 鉴权：令牌从 `%APPDATA%\dsh-desktop\logs\harness.log` 运行时读取，仅进内存，不落入任何文件/文件名。
- **只读约束**：全程仅导航点击与只读路由；未触发任何 `marketpilot_*` 工具、未代答任何 Human Gate。
- 深色主题：通过**真实设置 UI**（设置 → 外观 → 深色主题方块）切换，拍完后同路径恢复浅色（`light restored: true` 已断言）。
- 页面错误：两次完整通过均为 **0**（`Runtime.exceptionThrown` + console error）。

### 3.2 截图清单（`docs/gui-acceptance/v3.1/ux0/`，随仓库提交；原始生成目录 `.marketpilot/` 本地保留）

| 文件 | 内容 | 读图核验 |
|---|---|---|
| `01-home-light.png` | 首页浅色：统计卡两张 `—` 占位实拍 | flash ✓ |
| `02-projects-light.png` | 项目列表（8 个真实项目） | DOM 等待断言（读图代理多次超时，行数=8 已由 DOM 记录） |
| `03-project-overview-light.png` | 概览：6 胶囊 + 8 分区导航 + 8 数字卡 | flash ✓ |
| `04-requirements-light.png` | 需求工作区（19 行需求 + 步骤时间线） | flash ✓ |
| `05-research-light.png` | 竞品/政策研究 | flash ✓ |
| `06-evidence-light.png` | 证据台账（38 行） | flash ✓ |
| `07-alternatives-light.png` | 技术路线：**视口内仅路线 A 一张卡**（UX-08 实证） | flash ✓（记录了问题本身） |
| `08-solution-reader-light.png` | 方案阅读抽屉（761px 宽 / 15138px 滚动高） | flash ✓ |
| `09-tender-light.png` | 投标检查（3 条款） | flash ✓ |
| `10-tasks-light.png` | 任务中心空态 | flash ✓ |
| `11-home-dark.png` | 首页深色（真实设置 UI 切换） | flash ✓ |
| `12-project-overview-dark.png` | 概览深色，无弹窗遮挡 | flash ✓ |
| `13-requirements-dark.png` | 需求工作区深色 | flash ✓ |
| `14-solution-reader-dark.png` | 方案阅读抽屉深色 | flash ✓ |
| `15-project-overview-1024.png` | 1024×768 窄视口：无水平溢出（DOM 断言） | flash ✓ |
| `ux0-facts.json` | 全部 DOM 事实数据（见下） | — |

关键实测数据（`ux0-facts.json`）：

```json
{
  "themeSource": "light",
  "homeStats": ["8项目", "—待审核事项 待接入：需求审核视图（后续阶段）", "—进行中任务 待接入：任务中心（后续阶段）"],
  "projectRows": ["CALM 漏油监测桌面版演示", "...共 8 个"],
  "overviewPhaseChips": 6, "overviewNavItems": 8, "overviewCountCards": 8,
  "requirementRows": 19, "evidenceRows": 38, "alternativeCards": 3,
  "tenderRows": 3, "taskCards": 0,
  "readerWidth": 761, "readerScrollHeight": 15138,
  "narrowHasHorizontalScroll": false, "pageErrors": 0
}
```

### 3.3 视觉观察（结合截图与读图结论）

- 浅色/深色主题均正常：`--dsw-*` token 生效，深色下表格/按钮/徽标清晰可辨，无对比度崩坏。
- 1440×900 下信息密度尚可，但概览页首屏被“阶段胶囊 + 八数字卡”占满，业务摘要（下一步该做什么）只在最下方 `mp-nextHint` 一行。
- 1024×768 无水平溢出（`mp-layout` 已有 1024 断点折叠侧导航），响应式基础好。
- 任务中心空态文案与实际一致（无假数据）。
- 阅读器深浅色均可读，但 761px 宽 + 无目录跳转使 15 章文档导航成本高。

## 四、信息架构方案（UX-1 实施蓝图）

对齐用户原型 `MarketPilot_UI_V3.1_交互原型.html`，DSH 外层（左栏会话/工作区/插件）不动：

```text
┌───────────────────────────────────────────────────────────────────────┐
│ MarketPilot  / 我的项目 / CALM 漏油监测        [真实模型与运行状态只读] │
├───────────────────────────────────────────────────────────────────────┤
│ 项目名 CALM 漏油监测    [状态Tag]  [需求 8/19] [未知 5] [待审 N]       │
│                                                          [导入资料]     │
├──────────────┬────────────────────────────────────────────────────────┤
│ 项目阶段      │  ① 输入资料/本轮目标（本阶段要做什么）                  │
│ ○ 项目概览   │  ② 主操作（分析所选资料 / 生成候选 / …，prerequisite     │
│ ✓ 客户需求   │     不满足时写明具体原因，不只灰按钮）                   │
│ ◉ 竞品政策   │  ③ 结果区（表格/矩阵/卡片，UNKNOWN 显示 unknown）        │
│ ○ 证据核验   │  ④ 问题与风险摘要（UNKNOWN/冲突/待补证）                 │
│ ○ 路线比选   │ [底部操作区：已选 N 条 | 提交人工确认 | 进入下一步]      │
│ ○ 技术方案   │                                                        │
│ ○ 招标审查   │                                                        │
│ ◇ 项目成果   │                                                        │
└──────────────┴────────────────────────────────────────────────────────┘
```

要点：

1. **删除 `mp-phaseBar` 六胶囊**，`mp-sidenav` 升级为带阶段状态（done/current/running/waiting/error/pending）的 `ProjectStageNav`——阶段状态与页面选择分别建模（沿 `phaseState()` 的 run-真相优先逻辑，迁移到 `stores.ts` 的 section 上）。
2. **概览八数字卡 → 摘要头 + NextActionCard + ProjectActivity**：已确认需求、UNKNOWN、待审事项、当前阶段、最新成果、下一步操作；其余计数降为次级信息。
3. **首页真实统计**：`GET /executions`（无 projectId，workbench.list() 含全部在途执行）可得全局“运行中/等待人工”数；`GET /summary/:id` + 各项目 requirement counts 可得“待审核”。若无单端点聚合，首页按项目数 N≤8 做并行读（可接受），或标记“暂无数据”——不再显示永久 `—`。
4. **不新增外层 DSH UI**：顶栏仍是 MarketPilot 自有 `AppHeader`（面包屑 + 三导航），不重复 DSH 左栏功能。
5. 打开项目默认定位第一个待处理阶段；顶栏面包屑可返回项目列表（沿用 `stores.ts` 的 view 建模，仅加 section 默认推导）。

## 五、组件/DOM 清单与文件修改范围

### 5.1 新增/拆分组件（`src/client/components/`）

| 组件 | 职责 | 替换的现有代码 |
|---|---|---|
| `ProjectHeader.tsx` | 项目名 + 状态 + 统计 chips + 主 CTA + 返回 | `ProjectOverviewPage.tsx:158-170` |
| `ProjectStageNav.tsx` | 单一纵向阶段导航（含阶段状态徽标） | `mp-phaseBar` + `mp-sidenav`（UX-02） |
| `NextActionCard.tsx` | 下一步动作卡（原因 + 按钮 + prerequisite 说明） | `mp-nextHint` |
| `ProjectActivity.tsx` | 最近运行/成果/待办列表 | 概览 countGrid 的部分职责 |
| `StageFooter.tsx` | 各阶段底部 sticky 操作条（已选 N \| 提交确认 \| 下一步） | 各页零散 `mp-taskActions` |
| `EvidenceVerifyForm.tsx` | UNKNOWN 核验表单（目标类型 4 选 1 + 理由 + 支撑证据） | `EvidencePage.tsx:128-143`（UX-06） |
| `SourceInspector.tsx` | 主张→摘录→来源→关联记录 的统一详情面板 | 各 Drawer 的 UUID 串列（UX-13） |

优先复用 ui-primitives 现有导出：`SegmentedTabs`（竞品/政策、需求筛选）、`SegmentedControl`（视图切换）、`Modal`（HumanReviewDialog 升级，含焦点管理）、`RiskConfirmation`（决策/导出审批二次确认）、`Tooltip`、`Checkbox`、`Pill`、`DisclosureRow`（来源原文折叠）、`relativeTime`（时间显示）。**全部在冻结模块表内，无需新增依赖。**

### 5.2 页面与基础设施修改

| 文件 | 修改 |
|---|---|
| `pages/HomePage.tsx` | 真实统计卡（UX-01）+ 最近项目 + “需要处理”待办卡 |
| `pages/ProjectOverviewPage.tsx` | 换 ProjectHeader/ProjectStageNav；概览改摘要式（UX-02） |
| `pages/RequirementsPage.tsx` | render-phase setState 迁移 useEffect（UX-03/UI-R1）；表格列补 ID/MUST/来源；sticky StageFooter |
| `pages/TenderPage.tsx` | 审查所选/审查全部分离 + 动态 N（UX-04/UI-R1） |
| `pages/SolutionPage.tsx` | 最新版本选择 + 目录锚点跳转 + 全页阅读器（UX-05/UI-R1） |
| `pages/EvidencePage.tsx` | EvidenceVerifyForm（UX-06/UI-R1）；三视图（待核验/已核验/未知矛盾） |
| `pages/ResearchPage.tsx` | 参数可点击查看摘录、政策详情、SourceInspector（UX-07） |
| `pages/AlternativesPage.tsx` | 2-3 列并排 + 覆盖矩阵同屏 + 底部固定决策栏（UX-08） |
| `pages/TasksPage.tsx` + `TaskCard.tsx` | 精确 runId 关联 + durationMs 固定耗时（UX-10） |
| `components/HumanReviewDialog.tsx` + `WorkflowSurface.tsx` | 业务化摘要 + answerBusy 复位（UX-09） |
| `components/DocumentUploader.tsx` | 逐文件成功/失败 + rejected 明示 + 类型中文化（UX-12） |
| `hooks/useExecution.ts` | useProjectRuns 失效刷新（UX-11）；完成态 durationMs |
| `pages/ProjectsPage.tsx` | 一步创建弹窗（名称/行业/客户/场景）（UX-15，P1） |
| `styles.ts` | 保持注入机制，按页面拆分模块字符串再合并（UX-14，不换 CSS Modules 工艺） |

### 5.3 视觉规范（对设计文档 §4 的落实）

- 主工作区最大宽度 1440px（矩阵页允许更宽）；阶段侧栏 208px，<1024px 折叠为横向 chips。
- 正文 14px（`--dsw-alias-label-*` 层级不变）；页面标题 22px；分区标题 16px。
- 控件高 36-40，radius 全走 `--dsw-radius-*`；状态 = 颜色 + 文案 + StateDot/Tag（不单靠颜色）。
- 表格：`mp-tableWrap` 横向滚动保留，表头 sticky（`position:sticky; top:0`），长文本 `text-overflow` + 详情抽屉。
- 警示色仅用于待审核/危险/UNKNOWN；空状态说明“为何为空 + 下一步点哪里”。
- 全部颜色继续走 `--dsw-*` alias token，禁止字面色值（现有代码已合规，新增代码延续）。

### 5.4 验收计划（每阶段通用 + 阶段专项）

通用门槛：`pnpm typecheck && pnpm build && pnpm test`；冻结导入表测试绿；真实 Desktop 截图（1440×900 / 1366×768 / 1024×768 × 浅/深）；控制台 0 error；原有业务路径（列表/详情/工具调用/人工门）不回退。

- UX-1：三宽度截图无重叠/溢出/双滚动；首页无永久 `—`；全部原页面可达。
- UX-2：需求提取 settle 只刷新一次（React 测试断言 refresh 调用次数）；UNKNOWN 表单默认非 FACT；Human Gate 真实路径。
- UX-3：一个视口内 3 候选关键条件并排 + 真实 Decision 提交。
- UX-4：15 章方案目录点击跳转（DOM 断言 scrollIntoView/锚点）；审查所选仅传所选 ID（测试断言请求参数）。
- UX-5：任务卡精确 runId；取消/错误恢复；CALM 端到端点击。

## 六、UI-R1（四项信任修复）— 已执行 ✅

用户于 UX-0 汇报后确认“立即执行”。四项修复全部落地并有回归测试（2026-10-09）：

1. **RequirementsPage render-phase setState**（UX-03/UI-R1-1）：settled marker 处理迁移至 `useEffect`（`RequirementsPage.tsx`，沿用 `useToolWorkflow` 模式）。测试 `phase2-client.spec.tsx > settles one completed confirm exactly once` 断言：同一 `callId:status` 只触发一次 refresh，后续渲染不再请求，且显示基线生成通知。
2. **TenderPage 所选审查**（UX-04/UI-R1-2）：新增“审查所选（N）”主按钮（仅传 `selectedItems`，零选择禁用、计数动态显示）与独立的“审查全部条款”。测试断言两次提交的 `tenderItemIds` 分别等于所选子集与全量。
3. **SolutionPage 版本与目录**（UX-05/UI-R1-3）：按 `updatedAt → createdAt → id` 降序取最新方案；版本条（vN · 时间 · 最新徽标）可切换回看；阅读器改为 1200px 居中宽版（原 761px 侧抽屉）；目录为真实按钮，点击 `scrollIntoView` 定位到对应标题，含“返回顶部”。测试断言：新版本优先加载、旧版本可切换、目录按钮触发 `scrollIntoView`。
4. **EvidencePage UNKNOWN 核验表单**（UX-06/UI-R1-4）：单一“人工核验（默认 FACT）”按钮替换为“开始核验 → 显式表单”：核验后的分类下拉（FACT/SOURCE/ASSUMPTION/INFERENCE，**默认空占位**）、确认后的声明（预填可改）、支撑证据展示；未选分类或空声明时提交禁用。测试断言：默认值非 FACT、选择 ASSUMPTION 后提交的 `targetKind` 精确等于所选值。
   - **API gap 记录**：`marketpilot_evidence_verify` 的 `targetKind` 枚举为 `['FACT','SOURCE','ASSUMPTION','INFERENCE']`——**“保持未知”与“驳回”两个业务动作当前后端无对应端点**，UI 未造假按钮；如需支持须先扩展服务端（新 action 或放宽枚举），留待 UX-2 与用户确认。

实测（`docs/gui-acceptance/v3.1/ux0-r1/`）：`审查所选（0→1）` 禁用/启用、版本条 `v1 · 2026/10/8 · 最新`、阅读器 1202px、目录 13 项 + 返回顶部跳转、核验下拉默认空、提交禁用、页面错误 0；深色宽阅读器截图已留存（`r1-4`）。

验证矩阵：`pnpm typecheck` ✅、`pnpm build` ✅、`pnpm test` 124/124 ✅（原 120 + 新增 4）、`pnpm marketpilot:demo:smoke` ✅（离线 fixture：12 model calls / 8 tool calls）。

## 七、UX-1（主工作区信息架构与视觉统一）— 已执行 ✅

用户确认视觉方向后执行（2026-10-09）：

1. **首页真实统计（UX-01）**：`useHomeStats` 以 `GET /executions`（全局在途执行）+ 每项目 `GET /runs?active=1`（waiting_human）计算真实“进行中任务/待审核事项”；聚合失败显示“暂无数据”，绝不显示假 0 或 `—`。新增“需要处理”侧栏列出待审项目并可直接跳转。实测：`8项目 / 4待审核事项 / 0进行中任务` + 4 个待审项目名。
2. **单一纵向阶段导航（UX-02）**：删除 `mp-phaseBar` 六胶囊；新 `ProjectStageNav` 组件八项导航，六业务阶段携带 run-真相状态点（done/current/pending/running/waiting/error），`title` 提示状态含义；导航选择与业务阶段状态分别建模不变。1024px 折叠为横向换行（实测 `row/wrap`）。
3. **项目摘要头（UX-02）**：新 `ProjectHeader`：项目名+状态+行业/场景/更新时间+统计 chips（需求 x/y、UNKNOWN、待人工审核，超阈值警示色）+返回。
4. **概览摘要化（UX-02）**：新 `NextActionCard`（下一步动作 + 跳转到负责该步骤的分区；等待人工时覆盖显示）+ 6 张聚焦摘要卡（原 8 张数字墙）+ 新 `ProjectActivity` 最近 5 条运行。
5. **样式**：`--dsw-*` token 全覆盖新增类；`mp-stage*`/`mp-projectHeader`/`mp-nextCard`/`mp-activity`/`mp-homeGrid`/`mp-attention`；1440/1366/1024 断点，720 单列。

验证：typecheck ✅ / build ✅（206.77 kB）/ test 125/125 ✅ / demo:smoke ✅；截图 `ux1-01…06`（1440 首页+项目、1366、1024、深色×2），1440/1366/1024 无水平溢出，页面错误 0，深色真实设置 UI 切换后已恢复浅色。

## 八、UX-2（需求审核 + Evidence 审核 + 后端扩展）— 已执行 ✅

UX-1 验收通过后执行；用户同轮批准扩展 Evidence 后端（2026-10-10）：

1. **后端扩展（用户批准）**：`marketpilot_evidence_verify` 的 `targetKind` 新增 `UNKNOWN`（人工确认保持未知：kind 保持 UNKNOWN、status→verified、fromKind 留档）与 `REJECT`（人工驳回：statement/kind 不变、status→rejected）。两者**禁止 new_evidence 自动路径**（`UNKNOWN_PROTECTED`）；服务端 schema + 工具 schema 同步；测试 `services.spec.ts > supports human keep-unknown and reject resolutions`。
2. **核验表单接入新动作**：下拉 7 项（空占位 + FACT/SOURCE/ASSUMPTION/INFERENCE/保持未知/驳回），默认仍为空。实测 `verifyOptions` 与 `verifyDefault:""`。
3. **需求表排序**：待确认 → 冲突 → 未知 → 已确认（同级保持提取顺序）；优先级本地化 MUST/SHOULD。实测前 5 行“未知待补”最后“已确认”。
4. **上传逐文件反馈（UX-12）**：不支持格式按文件名显式拒绝（不静默过滤、不发请求）；每文件 ✓/✗ 结果行；类型下拉中文化。实测 `✗ 不支持的格式.docx — 不支持的格式（仅支持 .md/.txt…）` 且未产生服务端写入。
5. **HumanReviewDialog 业务化摘要（UX-09）**：顶部摘要块（操作名、影响记录数（解析 gate 提案 JSON 的数组）、风险提示）；完整提案 JSON 保留在折叠审计区；`answerBusy` 在 gate 状态变化/错误出现/换 gate 时自动复位（测试证明失败后按钮重新可用）。
6. **Drawer 溯源（UX-13 部分）**：关联需求/证据改为短号展示；Evidence 抽屉补 sourceUrl 链接；无 locator/来源记录时显示“原始上下文未能定位”（需求/证据/投标/研究四个抽屉统一）。

验证：typecheck ✅ / build ✅（215.08 kB）/ test **130/130** ✅ / demo:smoke ✅（新进程走新服务端代码：12 model calls）；live GUI 三张截图 + DOM 事实，页面错误 0。

**边界（如实说明）**：Desktop 宿主进程仍在内存中运行旧版服务端代码——**“保持未知/驳回”经 live 工作台提交需宿主重启后生效**（客户端表单/展示已全部生效；服务端行为由服务测试与新进程 smoke 证明）。不代用户重启宿主（会中断本会话）。

## 九、UX-3（竞品研究 + 技术路线并列比选）— 已执行 ✅

UX-2 验收通过后执行（2026-10-10）：

1. **竞品矩阵参数化（UX-07）**：“参数”列从属性条数改为前三个真实参数徽章（`检出率: UNKNOWN` 警示色保留），点击徽章打开详情抽屉；抽屉补认证区块。
2. **政策详情链路（UX-07）**：政策表新增版本/适用范围列；行详情抽屉（颁布者/文号/版本/强制性/适用范围/关键要求/影响/差距/证据短号）；无证据标注“未能定位”。
3. **本地模式声明**：`researchLocalMode` 移入工具条常显；无联网 provider 时不提供在线按钮（不造假）。
4. **候选并排比选（UX-08）**：`mp-altGrid` 三列等宽（2 候选两列；<1024 回退 auto-fit 换行）；每卡 组成/优势/限制/风险/未知 完整五区（实测 3×5 全渲染）；整卡可点击选择（radio 键盘可达 + 选中描边）；MUST 需求行优先的覆盖矩阵同页；底部粘性决策条（所选路线名 + 理由必填 + 提交）走真实 Decision Gate。
5. 实测：`cardTops [283,283,283]`（三卡同视口一行）、选中卡与决策条名称联动、页面错误 0；深色截图 ux3-04。

验证：typecheck ✅ / build ✅（225.56 kB）/ test **131/131** ✅（新增：参数徽章 UNKNOWN 可见且可打开抽屉、政策抽屉关键要求、三卡五区结构、卡片选择→决策提交参数与真实 Human Gate 停靠）。

**如实说明**：live 首项目无政策行，政策抽屉由单测覆盖（数据依赖，非 UI 缺陷）；候选卡信息密集，优势/限制等分区在 1440×900 首屏之下需滚动（卡等高并排，设计接受）。

## 十、UX-4（方案阅读 / 投标 / 成果）— 已执行 ✅

UX-3 验收通过后执行（2026-10-10）：

1. **三栏方案阅读器**：目录（13 项可跳转）/ Markdown 正文 / 右侧“UNKNOWN 与待确认”栏（从文档章节自动提取：设计边界与待确认条件、UNKNOWN、假设、风险与后续工作，点击跳转、可收起）。实测 rail 4 条真实条目、阅读器 1202px。
2. **成果导出审批（遗留项补齐）**：成果阅读器顶部导出条——说明审批语义、要求新的绝对路径、空路径禁用；提交走 `marketpilot_artifact_export` 真实工具 + Human Gate。列表新增“生成时间”列（与更新时间并列）。测试断言提交参数（artifactId/path/projectId）并停靠真实审核对话框。
3. **投标“待补证”导航**：条款抽屉中无证据条款显示“保持待补证”说明 +“去证据台账”跳转（经 onGoEvidence 切换项目分区）。测试断言点击后 store section 切到 evidence；live 首项目首条已有证据故不显示（数据依赖，行为正确）。
4. 阅读器安全渲染不变（MarkdownText）；无 Decision 禁用生成不变（后端 prerequisite 兜底）。

验证：typecheck ✅ / build ✅（233.24 kB）/ test **132/132** ✅；live 截图 ux4-01…03 + DOM 事实（rail 条目、导出提示、禁用态、列名），页面错误 0；导出仅填表截图、**未提交**（避免真实写文件）。

## 十一、UX-5（任务中心 / 错误恢复 / 整体回归 / 终验）— 已执行 ✅

用户指示“不需要审批，直接完成全部 UX”后执行（2026-10-10）：

1. **TaskCard 精确 runId**：删除同类型回退匹配；无精确 runId 显示“暂无对应运行记录（仅按精确 runId 关联，不做同类型猜测）”；找到时以 run.durationMs 显示固定耗时。单测：同类型 lookalike run 的步骤不泄漏、缺失文案出现。
2. **运行中真实取消**：WorkflowSurface 对 running 执行显示取消链接（走既有 cancel 路由，单测断言 POST）；完成态不提供取消。
3. **固定耗时**：TaskProgress 对已结算且有 durationMs 的 run 显示固定值（单测断言不随时间增长）；formatDuration 共享工具。
4. **阶段状态失效刷新**：ProjectOverviewPage 在 tracked execution settle（callId:status marker）时刷新 runs 快照——无定时器、每 marker 一次。
5. **抽屉键盘行为**：新 `useDrawerKeys`（Escape 关闭、Tab 循环、焦点回退）应用于需求/证据/投标/研究×2/方案/成果共 7 个对话框；HumanReviewDialog 有意豁免（gate 不得 Escape 默认作答）。live 实测 Escape 关闭证据抽屉；单测断言焦点回到触发元素。
6. **CALM live 点击**：首项目 7 个分区全部 present、首页真实统计、页面错误 0（ux5-facts）。

验证：typecheck ✅ / build ✅（238.07 kB）/ test **134/134** ✅ / demo:smoke ✅。终验文档：`docs/UI_V3_1_FINAL_ACCEPTANCE.md`。

## 十二、V3.1 全部阶段完成

UX-0（审查）→ UI-R1（四项信任修复）→ UX-1（主工作区 IA）→ UX-2（需求/证据 + 后端扩展）→ UX-3（研究/比选）→ UX-4（方案/投标/成果）→ UX-5（任务中心/恢复/回归/终验）全部交付并验证；DSH Core 零修改，人工门链路零妥协。
