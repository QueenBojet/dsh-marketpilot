# DSH 编程 Agent：MarketPilot UI / UX V3.1 分阶段优化提示词

> 在 DeepSeek Harness 编程环境中使用 GLM-5.3 Max 执行。  
> 对应设计：`MarketPilot_UI_V3.1_审查与交互优化设计.md`。  
> 本轮任务是**打磨现有 V3.0**，不是再做一次 V4.0 全盘重构。  
> 开发模式：每个阶段实测、截图、测试、报告，关键视觉阶段等用户确认。

## 一、直接复制给 DSH 的首轮提示词

```text
你是当前 DeepSeek Harness（DSH）开发环境中的 MarketPilot 高级前端工程师与交互设计师。使用已经配置的 GLM-5.3（reasoning effort=max）完成源码阅读、代码实现和测试，不另建 AI 框架。

我已经完成 MarketPilot V3.0 的五个 Phase。此次任务是对已完成插件进行 V3.1 UI / UX 质量提升，禁止推倒重写或侵入 DSH 核心。

工作区：E:\PythonProjects\Work_Platform
业务仓库：marketpilot/
上游参考：deepseek-harness/

先阅读：
1. marketpilot/PROJECT_SUMMARY.md（如文件不存在，先寻找用户提供的同名文件，不要猜路径）
2. marketpilot/docs/MarketPilot_UI_V3.1_审查与交互优化设计.md（若我放在其他目录，请搜索文件名）
3. marketpilot/src/client/**
4. marketpilot/src/harness/{plugin,routes,workbench,service}.ts
5. marketpilot/tests/{phase2-client,phase3-client,phase4-client,client-bundle,client-panel}.spec.tsx（以实际文件为准）
6. deepseek-harness/packages/client/ui-layout、ui-sidebar、ui-plugin-manager、ui-primitives 当前实现与主题规范。

固定约束：
- MarketPilot 保持 DSH Cordis 插件，继续使用原生 root `main` keyed slot 与 `sidebar.panellist`。
- 保留 GLM-5.3 Max 路由、Evidence Ledger、Human Gate、Project StorageDomain 与 guarded Tool 执行。
- 不修改 DSH Agent Loop 或者当前业务 Domain/Service，除非具体 UI 行为证明确实需要，并单独解释。
- 不删除数据库、项目、工作流记录及已有 fixture。
- 不用假的 AI 输出、模拟任务进度或自动代替人工审批。
- 遵循现有 client frozen module table 的运行时导入规则，不能假定新增 npm UI 依赖可直接加载。
- 不泄露 Desktop 进程令牌、API Key 或项目敏感文件。

请先执行 UX-0：
A. 基于当前最新代码逐文件核对 V3.1 设计审查表，标注已解决/仍存在/与源码不符。
B. 采用浏览器或 DSH Desktop 实测已有 UI，输出至少四张真实截图：首页、项目概览、需求审核、方案阅读；补充深色主题截图。仅当现有环境允许且不会绕过人工审批时可自动化截图。
C. 设计一个主面板信息架构：DSH 外层导航不重复，项目内使用单套纵向阶段导航，主内容区强调输入→执行→结果→复核。
D. 给出可实施的视觉规范、DOM/React 组件清单、代码修改文件清单和验收计划。
E. 将结论写入 docs/UI_V3_1_AUDIT.md，不在 UX-0 阶段大面积改代码。
完成后向我提供真实 UI 截图和建议，并等待我确认首轮视觉方向。
```

## 二、UX-1：主工作区信息架构与视觉统一

执行前提：UX-0 的视觉方向已由用户确认。

```text
现在执行 UX-1，只优化工作台首页、主面板导航和项目详情框架。

目标：
1. MarketPilot 进入 DSH 主面板后首屏专业、简洁，具备清楚的当前任务与下一步操作。
2. 删除重复的阶段胶囊/二次导航；改成单一项目纵向阶段导航 + 项目摘要头。
3. 首页移除“待办/运行中 —”的占位统计：若可安全调用真实 summary/runs 计算，展示真实值；若暂时无 API，明确标记“暂无数据”而非假的指标。
4. 项目概览减少八个数字卡的堆叠，优先展示已确认需求、UNKNOWN、待审事项、当前阶段、最新成果、下一步操作。
5. 现有 DSH 深色/浅色主题都必须正常；仅使用受支持的 --dsw-* token。
6. 组件拆分为 ProjectHeader、ProjectStageNav、NextActionCard、ProjectActivity 等；不新增另一套外层 DSH UI。
7. 逐屏优化合理字体、间距、表格、状态色和响应式。

修改范围建议：
src/client/MarketPilotPanel.tsx
src/client/pages/{HomePage,ProjectsPage,ProjectOverviewPage}.tsx
src/client/components/{AppHeader,PageHeader,StatusTag,DataTable,States}.tsx
src/client/styles.ts及拆分模块（保持当前动态客户端 CSS 打包机制）。

验收：
- pnpm typecheck && pnpm build && pnpm test
- Client module frozen imports 测试通过
- 实际 DSH Desktop 浅色/深色 GUI 截图（1440x900、1366x768、1024x768）
- 原来的项目列表/详情/工具调用仍可使用
- 出具本阶段 changed files 与 unresolved list
- 交付截图后等待用户确认 UI，再进入 UX-2。
```

## 三、UX-2：需求审核 + Evidence 审核

```text
执行 UX-2：优化工作流最频繁的人机交互——需求提取、资料选择、证据核验。

强制修正：
1. RequirementsPage 的 render-phase setState/refresh 移入 useEffect 或受控缓存更新；测试刷新不会重复触发请求。
2. 需求表显示 ID、MUST/SHOULD、状态、来源；待确认和冲突行优先；本批确认依赖精确 runId 和 batch IDs。
3. 提取按钮与文件选择、任务进度保持在可视范围，执行中允许取消。
4. 文件上传必须逐文件显示成功/失败；不支持 PDF/DOCX 时明确拒绝/提示转换，不能静默过滤。
5. Evidence 页面 UNKNOWN 不得默认转 FACT：增加“保持未知 / 转为事实 / 转为工程假设 / 驳回”的显式选择器和核验理由。转 FACT 时明确人工依据或可信已核验证据，并继续走后端 Human Gate。若当前 service 缺某个业务动作，先说明 API gap，不能写一个只改颜色的假按钮。
6. 所有 Drawer 显示来源原文摘录、定位、关联需求，而非只列 UUID；缺原始上下文时标记未能定位。
7. HumanReviewDialog 改为业务化摘要：操作类型、影响记录数、风险、确认按钮；修复 answerBusy 异常后无法复位的潜在问题，不改变真实审批链。

验收：需求提取/人工确认/证据核验实际路径；增加 React 回归测试，UNKNOWN 默认不能变 FACT，原始数据不被自动覆盖。
本阶段结束报告、截图、测试并等待确认。
```

## 四、UX-3：竞品研究与技术路线并列比选

```text
执行 UX-3：重整研究与方案对比页面，不改变真实研究/决策规则。

1. ResearchPage 为本地资料研究显示清晰模式说明，不能冒充实时联网；未来真实 research_search provider 启用时才开放在线按钮。
2. 竞品矩阵：厂家、准确型号、原理、关键参数、应用限制、已核验证据；参数数字必须可点击查看摘录，不能仅统计属性数。
3. 政策表：版本、颁布者、适用范围、要求及证据；不确定标准适用性明确 unknown。
4. AlternativesPage 改为 2—3 列并排候选；每列显示组成/优点/限制/风险/未知条件；候选切换有明显的键盘与视觉焦点。
5. 将确认需求覆盖矩阵与候选放到同一比较视野；必须逐项覆盖 confirmed 需求。
6. 选择路线输入审核理由，通过真实 Decision Human Gate；已选中路线不能仅靠前端切换而改变项目决策。
7. 视口不足时响应式变成单列与分组 tabs；不得把表格压到不可读。

交付：代码、浅暗色真实截图、一次 CALM 候选比选人工操作验收、测试结果。待确认后下一阶段。
```

## 五、UX-4：技术方案、投标与成果阅读

```text
执行 UX-4：让长技术方案能阅读、比对、查证，修复投标条款选择语义。

必须项：
1. SolutionPage 方案选择由第一条改为最新生成/合法版本；提供明确的历史版本列表。
2. 方案正文不要再受侧抽屉狭窄限制，改全页文档阅读器；目录是真正可以点击跳转的链接，支持返回顶部。
3. 无 activeDecisionId 不允许以项目状态误认为有决策；后端仍做最终 prerequisite check。
4. Markdown 安全预览继续使用 DSH 官方 MarkdownText，保留 UNKNOWN/假设/风险章节。
5. 成果列表清楚显示 draft/approved 和生成时间；导出审批与生成内容分开，调用既有安全 Human Gate。
6. TenderPage “审查所选”只能传用户选中的 selectedItems，另设“审查全部”显式动作；按钮文案动态显示实际处理的 N 项。
7. 对缺证据的投标条款显示“待补证”，可导航至证据记录，不可无依据改判为 compliant。

新增针对上述行为的组件/路由测试。截图验证至少一份15章方案的目录跳转与长文阅读。
```

## 六、UX-5：任务中心、错误恢复与回归

```text
执行 UX-5：统一实际执行状态、错误反馈、状态恢复，并做整体回归。

1. 运行中任务显示真实步骤名与起止时间，不造百分比。
2. TaskCard 只按精确 runId 关联日志；缺少明确 ID 时显示“暂无对应运行记录”，绝不猜同类型。
3. WorkflowSurface 页面内支持运行中的真实取消操作，人工等待由 Human Gate 真正处理；如果取消已完成不可调用。
4. 非活动或已完成任务用真实 durationMs 显示固定耗时，不能继续增加。
5. 切换项目/页面/会话仍能看到同项目进行中的任务；Host 重启仅报告中断，不伪称续跑成功。
6. useProjectRuns 的阶段状态应适度刷新/失效更新，避免任务成功但阶段导航仍旧。
7. 弹窗/Drawer 的 Escape、焦点陷阱、焦点回退、关闭遮罩、键盘操作要经过测试（优先复用 DSH primitive）。
8. 执行 pnpm typecheck、pnpm build、pnpm test、pnpm marketpilot:demo:smoke。
9. 在真正运行的 DSH Desktop 做 CALM 端到端点击测试。真实模型调用和离线 fixture 必须分开标记；人工 Gate 不自动点“确认”。
10. 生成 docs/UI_V3_1_FINAL_ACCEPTANCE.md：截图清单、运行数据、未完成项、与基线相比的改变。
```

## 七、每个阶段的统一输出格式

DSH Agent 每结束一个阶段必须回答：

```text
阶段：UX-N
Git commit：<当前 SHA>（若未提交，写未提交）
修改文件：...
界面变化：...（附真实截图的本地路径）
交互变化：...（附用户操作与后台执行对应关系）
类型/构建/单测/Smoke：...
真实 Desktop GUI 验收：通过/未测/失败（不可用单元测试代替）
发现问题：...
风险与回退：...
下一阶段：等待用户确认/可继续
```

**验收证据必须可复现。** 对 GLM 的模型输出，不把离线替身数据说成真实推理；对人类批准，不让代理伪造鼠标确认；不在 Git 里上传本地的安全凭据与非脱敏业务资料。

## 八、首批可单独立即执行的 Bugfix 提示词（不必等待大规模美化）

```text
请先修复四个与视觉无关但影响信任的 UI 行为，范围严格限定在相应页面和对应测试：
1. RequirementsPage.tsx：禁止在 render 时 setState/refetch，迁移到 useEffect；同一 completed callId 仅处理一次。
2. TenderPage.tsx：审查所选按钮应提交 selectedItems 数组；明确区分审查全部，零选择禁用。
3. SolutionPage.tsx：选择最新 solution artifact，并使目录具备点击跳转；不得错误展示老方案。
4. EvidencePage.tsx：移除 UNKNOWN 默认 targetKind='FACT' 的交互，明确核验种类、理由与现有证据，走原有 Human Gate。
要求写测试证明修复，不修改 DSH Core，不删旧数据。完成后给我显示测试结果与 GUI 截图。
```
