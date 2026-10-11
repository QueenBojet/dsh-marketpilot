# MarketPilot V3.3 — M0 工作流设计与源码审查

日期：2026-10-11（Asia/Shanghai）。范围：M0 + M1；不进入 M2—M5。

## 1. 重查基线与约束

- 仓库：`marketpilot` / `dsh-marketpilot`，执行前 `main @ 510caa0f35932642a13c6a6d0ab2dbe22c9c8d22`，`git status --short` 为空。
- 相邻只读 DSH：`5badb15009ae1756c3afe0ae0cef1faafc290ccc`。Node v24.14.0，pnpm 11.19.0。
- 首先实测 V3.2.1 基线：23 文件 / 178 测试通过。`UI_V3_2_1_CLOSEOUT.md` 的 11 分钟 / 7 次 GLM 调用是历史记录，不计本轮在线验收。
- 请求文件实际在 `../docs/Codex MarketPilot V3.3 页面与工作流优化提示词.md`（磁盘名称使用空格）。已审查 README、workspace 指南、V3.2 两阶段、V3.2.1 结项和 DEMO_SCRIPT。
- DSH 官方接口证据：`packages/client/web/src/{platform,seed}.ts` 的冻结模块列表包括 ui-primitives；`packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` 的 `main` keyed 与 `sidebar.panellist` 契约；本插件 `src/client/index.ts` 的注册不改动。仅新增 React/Cordis 已有能力，无新依赖。
- 保留 UUID、codeBook、StorageDomain、Evidence Ledger、Human/Decision Gate、GLM Provider 路由与 Solution 原子提交。未修改相邻 DSH 源码。

## 2. 实际入口及执行链

| 阶段 | React / 点击入口 | guarded Tool → Workflow / Service | 读取与边界 |
|---|---|---|---|
| S0 项目/资料 | `ProjectsPage` 的创建；`RequirementsPage` → `DocumentUploader` | `marketpilot_project_create` → `ProjectService.create`；上传 HTTP → `documents.add`；路径导入工具 → `HarnessDocumentParser` | `api.project/documents`；UTF-8 .md/.txt。浏览器上传不用服务器路径；PDF/DOCX 未实现 |
| S1 需求基线 | `RequirementsPage.startExtraction/confirmSelected` | `marketpilot_requirement_extract` → `RequirementAnalysisWorkflow.start` → `RequirementService.saveAnalysis`；`marketpilot_requirement_confirm` → `RequirementService.confirm/finalizeAnalysis` | `requirements` / `runs` / 单记录详情；必须用本批 runId 与 output.requirementIds，Human Gate 保留 |
| S2 研究 | `ResearchPage.startExtract`，竞品/政策 tabs | `marketpilot_competitor_extract/policy_extract` → `ResearchWorkflow.start` → `ResearchService` 保存结构化结果；`marketpilot_research_search` → `HarnessResearch.search` → `ResearchService.importSearch` | competitors / policies / documents；现 UI 只实现本地提取。搜索工具存在不等于 Provider 可用 |
| S3 证据 | `EvidencePage.beginVerify/submitVerify` | `marketpilot_evidence_verify` → `EvidenceService.verify` → `harnessHumanGate` | evidence / evidenceOne；UNKNOWN 不自行升 FACT；本阶段可返回补证 |
| S4 路线 | `AlternativesPage` 候选卡 / `submit`；新增顶区生成 CTA | `marketpilot_alternative_generate` → `AlternativeWorkflow.start` → `GenerationService.alternatives`；`marketpilot_decision_confirm` → `DecisionService.confirm` | alternatives / requirements / evidence；必须 confirmed ≥1，Decision 是真实人工记录 |
| S5 方案 | `SolutionPage` 生成 / 版本 / 阅读；新增顶区生成或恢复 CTA | `marketpilot_solution_generate` → `SolutionWorkflow.start` → `GenerationService.solution` | artifacts 元数据与正文详情；保留 GENERATE_OUTLINE → GENERATE_SECTIONS → TRACE_* → SAVE_ARTIFACT；没有独立提纲确认/单章重生成 API |
| S6 可选投标 | `TenderPage` 抽取、审查所选/全部、详情证据跳转 | `marketpilot_tender_extract/review` → `TenderWorkflow.extract/review` → `TenderService.saveExtraction/saveReview` | tender-items / documents；`validateTenderStatus` 强制 verified FACT/SOURCE；无 tender 文档为可选 |
| S7 成果 | `ArtifactsPage.startExport` / 阅读器 | `marketpilot_artifact_export` → `ArtifactService.approve`（Human Gate）→ Harness fs `createIfAbsent` | artifacts / artifact；浏览器不写文件，不覆盖旧路径；reviewStatus 不等于已导出 |
| 任务 | `TasksPage` / `WorkflowSurface` / `TaskProgress` | `WorkbenchManager.start/drive/answer/cancel` → `ctx.tools.execute`；`executionStore.start/answer/cancel` | executions（宿主内存）与 WorkflowRun（持久化）；切页不断任务，重启丢失的 gate 不可伪恢复 |

公共路由见 `src/harness/routes.ts:mountWorkbenchRoutes`；项目聚合原始详情见 `projectDetail`。全部生产写操作仍走原 guarded tools 或已受控上传，新增导航不直接调用 Service 写入。

## 3. 设计决策与只读 API

比较：A）客户端并行拼接八个列表；B）服务端一次聚合快照投影。采用 B。A 可少一个路由，但页面字段缺失/分页截断、项目修订与 Run 刷新不一致会导致阶段矛盾。B 复用现有仓储，只加一个只读接口，不加数据库或迁移。

`GET /marketpilot/api/projects/:id/workflow` → `MarketPilotService.workflowOverview` → `projectWorkflowOverview`。一次同步仓储快照 + 同项目 `WorkbenchManager.list` + `workflowCapabilities`，返回 revision、S0—S7、当前优先动作、真实步骤、待办、最新成果、UNKNOWN/更新提示、能力。无文档正文、无凭据；不存在项目明确报错。`tests/phase4-routes.spec.ts` 实测绑定与内容边界。

**唯一导航状态**：八分区左栏与流程卡使用此投影；导航选中仍是 `aria-current="page"`，业务状态是 `data-status`，当前建议阶段是 `currentStage`。S0/S1 同属资料与需求分区：空项目显示 S0 顶区，其余显示 S1。旧 `stageState` 仅供旧组件调用兼容，不作为 M1 实际项目的判定来源。

**一致性和刷新**：`useProjectWorkflow` 每 3 秒请求服务端快照，执行状态改变时立即刷新；请求不重叠，取消过期响应，校验 projectId/八阶段结构。失败明确提示并暂停执行，不变成空列表。详情刷新保留相同项目子页面挂载，避免上传/后台任务刷新清空选择；跨项目旧响应拒绝。没有百分比进度，只有 Run 记录过的步骤。

## 4. 状态映射（只读，不创造持久化 Run 状态）

| 投影状态 | 真相来源 |
|---|---|
| not_started | 没有本阶段结果且输入前提不足 |
| ready | 当前输入/人工前提可执行；S0 无资料也 ready（上传），不虚标完成 |
| running | 同项目/阶段存在真实 Workbench running execution |
| waiting_human | 真正 live 问题，或最新需求等待仍含本批 proposed，或可恢复的 Solution waiting Run |
| completed | 各阶段实际结果满足完成条件；不依据单向 Project.status 推算先前阶段完成 |
| needs_attention | 待核验证据、活跃 UNKNOWN、需求待审、投标不足、取消或无宿主 owner 的 running 历史、不可恢复等待 |
| failed | 最新相关 Run failed，或最新宿主执行失败（包括创建 Run 前模型失败）；显示错误和重试路径 |
| skipped_optional | 没有带正文的 tender Document，不视为整项目失败 |
| unavailable | 输入可以准备但缺少真实模型 capability；已存结果仍可阅读 |

优先级：live gate → live 执行 → 可恢复等待 / 最新失败；其余按实体条件给下一动作。S2 分别取竞品/政策最新 Run，一路失败不会被另一路成功掩盖。`markSupersededWaits` 使用所有同项目历史先打标再取最新，同类型旧等待不算待办。

**能力诚实性**：模型检查官方 `subagents.getProvider`、`llm.listProviders`、`agentDefaultModel.currentSelection` 与 agents；只证明路由已注册，不证明网络/余额/模型质量。显式注入 adapter 标 offline/test。DSH 当前 WebRuntime 只有 search/fetch 执行 API，无只读 Provider 选择 API；没有 web 为 unavailable，有 web 则 unverified，不为探测发请求、不读取私有 Map、不提供伪联网 CTA。可用性的进一步核验留 M3。

## 5. 每阶段进入/执行/完成与下一步

所有已创建项目的八个分区均可自由进入，禁用的是不满足条件的写操作，不阻止阅读和补证。

| 阶段 | 可执行 | 完成 / 下一步 |
|---|---|---|
| S0 | 已创建项目即可上传；原上传格式/大小/UTF-8 校验 | 有非空文本 Document → S1；无资料明确导入 |
| S1 | 文档选择 + 模型；确认用本批 IDs 和 runId + Human Gate | confirmed ≥1 提供 S4 路径，剩余 proposed/UNKNOWN 继续审查；不要求 S2 同时完成 |
| S2 | 有本地来源 + 模型；方向独立 | 至少一种真实研究结果；两方向单独状态，发现缺口回 S3/S0；不伪造“已跳过研究” |
| S3 | 有活跃证据，可通过原工具核验 | 无待核验/未决 UNKNOWN 才 completed；允许 UNKNOWN 保留进入草稿，不支持强合规 |
| S4 | confirmed ≥1 + 模型生成；选择/理由后原 Decision Gate | activeDecisionId 必须指向真实 Decision → S5 |
| S5 | confirmed ≥1 + 有效 active Decision + 模型 | solution Artifact 存在 → tender 有资料时 S6，否则 S7；旧 Solution wait 明确恢复相同 runId |
| S6 | 有 tender 文本 + 模型；审查有选中条款 | 已有响应且无未决符合性不足才完成；缺口仍可回 S3，未强制所有项目投标 |
| S7 | 有 Artifact 可阅读；导出填写新路径并经原人工门 | approved 仅证明复核；只有保留的同项目成功导出执行对应真实 approved Artifact 才投影 completed |

研究/证据是迭代节点。成果生成后文档/需求/证据/Decision updatedAt 更新会显示“可能过期”，只读提醒、不覆盖 Decision/Artifact。既有业务版本哈希与 STALE_CONTEXT 原样保留。旧成果未存依赖版本，不能精确比较，所以本轮仅用时间戳提示可能影响。

## 6. IA 与组件树

```text
DSH main[key=marketpilot] → MarketPilotPanel（原注册）
  navigation store（同一 projectId / section；每项目工作模式偏好）
  ProjectOverviewPage
    ProjectHeader + 引导/专业切换 + 能力摘要/真实状态刷新
    WorkflowContext（服务端只读快照与现有执行注册表）
    ProjectStageNav（原八分区，同一投影）
    overview → ProjectWorkflowOverview
      StageActionBar（优先动作/输入/执行/结果/复核）
      最新成果 + 人工待办 + ProjectStepCard[S0..S7]
      PrerequisiteHint（原因 + 原分区修复路径）
      折叠项目统计/历史
    专业分区 → StageActionBar + 原表格/详情/阅读器/WorkflowSurface
```

顶区 CTA 对 S4/S5 的生成调用 `executionStore.start(tool,args)`；已有候选时 S4 定位原人工决策表单，其余定位原本需选择资料/记录的表单，不在未选择时自动跑全部。进行中/人工等待 CTA 只定位，不发第二次调用；即时 execution registry 和启动锁防重复。所有原页面按钮也检查模型/confirmed/Decision/数据读取，附近保留缺项说明与链接。无模型仅阻止生成，已有候选的人工 Decision Gate 仍可使用。无附加路由或状态管理依赖。

视觉差异：延续 V3.2.1 tokens/阅读器/候选摘要卡；首页计数墙换为当前行动、成果和流程卡，历史下沉；每阶段有同构顶区。1024 保留既有横向紧凑导航，流程卡两列；1440 四列；无新增 sticky 覆盖控件。专业模式折叠流程图，两模式没有第二套业务数据。

## 7. 兼容性与数据边界

| 情况 | M1 行为 |
|---|---|
| 老项目 / codeBook 缺失或 JSON null | 原投影/编号函数保留；新路由只读不冻结、不迁移、不重编号 |
| 老成果 / 无新摘要 | 原阅读器与显示层编号替换保留，全部历史版本可读 |
| 遗留 supersededWait | 无可回答人工门，不计待办；原任务中心历史保留 |
| 宿主重启 / in-memory gate 丢失 | 运行历史明确需处理；只有可恢复批次和方案 Run 可继续，其余显式重试 |
| 两批需求 / 跨项目 IDs | 原服务端批次与项目校验不动；快照与执行也按 projectId 过滤 |
| CALM 合成 Datasheet / tender | fixture 仍标 synthetic；离线 smoke 单独数据库，模拟人工不代表生产授权 |
| 真实存量 GLM 项目 | 只读 GUI 核验历史事实；本轮不重跑真实模型，不把历史 GLM 输出算新模型验收 |
| 导出历史 | 当前无持久化导出路径历史；不把 approved 猜成“已导出”，宿主重启后不能证明既往导出 |

## 8. 验证清单与截图矩阵

- 基线 178 个测试保留（3 个导航夹具/旧强制投标断言改为新真实投影契约，没有删除旧测试）。
- 新增纯投影：空项目、失真 Project.status、confirmed/Decision 跳转、方案/可选 tender、批次 wait、superseded/无批次 wait、恢复 runId、live gate、防伪运行、失败步骤/原因、研究方向隔离、UNKNOWN、无 Provider、跨项目、不变更状态、可能过期、approve/export 分离。
- 新增真实 React 交互：空项目不可生成路线、待审批次定位不执行、Decision 到方案且 guarded CTA、成果导航、双模式/返回、读失败/重试、运行任务定位不重跑、失败恢复提示。
- 原 HTTP CALM 全链路、Human Gate/cancel/跨项目、STALE_CONTEXT、编号与 null-codeBook、filter 外 focus、模块冻结白名单、全部旧测试须通过。离线 CALM smoke 证明持久化闭环，不证明真实 GLM。
- GUI 目标：空项目 + 存量 CALM，1440×900 / 1024×768、浅/深；正常、UNKNOWN、等待、失败、跳转返回。实际截图/状态对账与未覆盖情形在 `V3_3_M1_ACCEPTANCE.md`，不将 jsdom 冒充桌面。

## 9. 风险与实施停止条件

一次性只读 projection 是最小新增 API，3 秒轮询仍是本地单用户工作台方案；后续可在宿主支持时改事件订阅。输入时间戳不能替代持久化依赖版本；不会自动失效/覆盖旧成果。联网只读检测与导出历史缺口明确留后续。M1 结束后停止，须用户验收才推进 M2。

M2 建议：将批次审阅与证据补证队列作为第一目标；保持正确 runId、过滤选择范围、旧编号和 Gate 不变，增加输入变化的只读下游影响清单。独立设计持久化依赖版本后再考虑提纲确认或单章重生成。

## 10. M3 研究中心设计复核（2026-10-11）

M3 以 `d1ebb325` 的 M2 为基线。采用直接计划：扩展现有提取契约和只读快照，保留工具、工作流及服务端原子保存；不增加第二套研究引擎。没有现存 graphify 索引，未为本阶段安装依赖或创建全仓图。

| 用户操作 / 设计决定 | 实际代码路径与事实 |
|---|---|
| 本地 / 在线两个入口 | `src/client/pages/ResearchPage.tsx`：本地选择资料后调用原 guarded tool；在线展示真实 capability reason 和本地替代路径 |
| 官方能力重新核查 | 上游 `packages/web/web/src/index.ts` 的 Provider 注册接口公开，但注册表、配置选择及 resolveProvider 私有；官方 settings 的凭据 configured 标志不能证明 search/fetch 选择可用。现有 `src/harness/capabilities.ts` 的 unverified 结论保持，不探查私有属性、不更改 Profile |
| 研究目的 | `ResearchWorkflow.start`：可选 purpose trim/min/max(2000) 验证后写入 Run.input，并传入原结构化提示词；旧调用可省略 |
| 同一版本的结果与来源 | `researchOverview` / `MarketPilotService.researchOverview` / GET `/projects/:id/research`：一次 repository 快照的 revision、两路结果、关联证据、文档元数据、研究 Run 和永久编号 |
| 页面刷新 | `useResearchOverview` 每 3 秒读真实快照，有明确错误、项目归属校验和卸载后响应隔离；没有本地伪状态写入 |
| 两路执行 | 两个 `useToolWorkflow` 分别追踪 competitor_analysis / policy_analysis；为避免同时修改项目造成 STALE_CONTEXT，当前页面一次启动一个研究任务，切方向仍可查看各自状态 |
| 参数口径 | 可选 `Competitor.parameterContexts[name]={unit,conditions,evidenceId}`；提取字段缺失为 null。保存前校验准确型号、值、单位、条件在同一原文引用，状态校验关联证据属于该产品 |
| 对照 | `parameterComparison` 按参数名/单位/条件的精确值分行；至少两个产品的 SOURCE/FACT 引用有效、未驳回/废止、属于该型号且含所展示字段时标为同口径摘录。保留 draft 含义，不转换单位、不打分、不排名 |
| 政策 | 可选 scope 进入原提取服务；发行方/文号/版本/范围须在引用原文中，强制/推荐须有文本标示。UI 始终提示版本和现行效力待核验；文本校验不取代法务或工程审核 |
| 补证环 | `ResearchSources` → `actions.focusRecord` → 原 EvidencePage 精确详情；原文复用 `DocumentSource`，补充来源仍导航到已有上传区 |

数据兼容：旧 `performance`、UUID、codeBook、SOURCE/UNKNOWN、Decision 和 Artifact 保留。新字段可省略，新代码可读取旧项目；没有迁移、删除或隐式覆盖。已产生 M3 parameterContexts 的新数据不能直接交给 M2 的 strict schema，回退 UI 时必须保留新字段读取能力，不能靠删除数据回退。

验证与停止条件见 `V3_3_M3_ACCEPTANCE.md`。联网不标记完成；M3 交付后停止，用户验收后再实施 M4。

## 11. M4 路线、方案与可选投标设计复核（2026-10-11）

基线为 `main @ a9865eedb74ec7781201b2f782e709575f5240a4`，开始时工作区干净。重新核对总提示词 M4、M3 验收及 V3.2.1 记录，沿用直接计划，按现有工具、工作流和原子保存路径实施；不拆分 SolutionWorkflow，不引入新依赖。

| 用户操作 / 设计决定 | 实际代码与服务端依据 |
|---|---|
| 同一次读取的路线、方案、招标事实 | `services/design-overview.ts` / `MarketPilotService.designOverview` / GET `/projects/:id/design` 从一个 repository revision 返回路线、需求、证据、Decision、成果元数据、最小 Run、资料元数据和永久编号；不返回成果正文或资料正文 |
| 真实状态刷新 | `useDesignOverview` 每3秒读取，不重叠请求；卸载隔离，校验 projectId / 记录归属，失败明确显示并阻断写操作 |
| 摘要与矩阵 | `AlternativesPage` 保留展开卡、需求覆盖矩阵，增加实际字段矩阵、真实 completed Run 批次和全部历史入口；卡片正文和展开按钮不选择，radio 明确选择，无自造分数 |
| 人工决策摘要 | `routeReview` 区分 confirmed MUST 的 full / 不足、未确认 MUST、风险 / UNKNOWN、有效 verified FACT / SOURCE 引用；人工理由原样呈现，full 是存储响应，不代表工程性能或已核验合规 |
| 摘要后的真实 Gate | 打开摘要不调用工具；第二步调用原 `marketpilot_decision_confirm`。新增 optional expectedVersion 由原 businessVersion 派生；Gate 前拒绝 STALE_CONTEXT，Gate 后保留 STALE_REVIEW，防快速重复提交；旧调用可省略 |
| 方案版本与来源 | `SolutionPage` 以 createdAt / id 排序，审批 updatedAt 不重排生成版本；目录以 heading occurrence 跳转，忽略 fenced code 中假标题；正文引用排除编号附录，永久 EVD 编号跳精确证据详情 |
| 存档与当前补证的关系 | 方案展示当前台账待复核清单并明确其可能晚于存档；历史 Decision 优先读成果 dependencies，缺省读对应 Run.output.decisionId，不用当前 Decision 冒充历史 |
| 成果输入指纹 | `Artifact.dependencies` optional / server-owned，保存 requirementsVersion、decisionVersion、decisionId、sourcesVersion。`artifact-context.ts` 对对象键及记录集合排序后 SHA256；在原需求、研究、路线、方案、符合性事务和通用保存中捕获，不另起写事务 |
| 可能过期 / 历史缺口 | 只读 `current / possibly_stale / untracked`，显示变化范围，链接回需求、证据、路线。旧成果无快照则 untracked，不补写推测版本、不改原文；手动修改内容后移除无法证明的快照 |
| 可选招标 | 没有带正文 tender 资料时 skipped_optional，可去成果或上传区；条款搜索、状态筛选、12行分页；切筛选/页清选择，审查所选仅提交可见项，审查全部使用全部真实条款；原 compliant 证据闸门不变 |
| 矩阵导出 | 既有导航 store 增加 artifact focus，招标按钮定位真实符合性成果；再输入新绝对路径，经既有 guarded export / Human Gate，不在页面直接写文件 |
| 合成来源与小屏 | 路线、方案、成果和招标提示 synthetic；复用宿主主题变量。真实原生验收发现长路线表头相互重叠，已限定矩阵表头换行，1024仍使用表格内滚动 |

指纹排除 Artifact、codeBook、Run telemetry、project.status / updatedAt，包含需求、人工 Decision、资料、非 DECISION 证据、研究和适用的选定路线 / 招标条款。每个成果类型在单次投影中只计算一次当前指纹。来源变化采用保守的“可能过期”，不自动撤销人工 Decision、审核或存量成果；指纹也不等于可重放的完整旧输入快照。

持久化、UUID、永久 codeBook、原生 main slot、Cordis、Provider、Evidence Ledger 和 Human Gate 保持。新代码可读旧项目；已写 dependencies 的新数据不能交给 M3 的旧 strict schema，回退 UI 须保留新字段读取契约并先备份，不能靠删除持久化字段回退。

真实 GUI、249项回归、离线 CALM smoke、存量一致性和限制见 `V3_3_M4_ACCEPTANCE.md`。M4 后停止；M5 才执行真实 GLM 关键工作流、全局 GUI / 演示 / 发布终验。
