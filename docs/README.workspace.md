# MarketPilot 项目说明与续开发指南

文档更新：2026-10-08（Asia/Shanghai）。本次更新：工作区迁移复查、GLM-5.3 在线验收结论与下一阶段（工作台）计划；详见[实施记录第 11 节](docs/IMPLEMENTATION_NOTES.md)。

## 0. 2026-10-08 状态速览

- 工作区已迁移至 `E:\PythonProjects\Work_Platform`（结构不变，79 项测试复测通过）。
- 安装版 DSH Desktop 运行 GUI，其 profile 在 `%APPDATA%\dsh-desktop\harness\profiles\web`，已装本插件并配置 `zai/glm-5.3, reasoningEffort=max`、`modelTimeoutMs=600000`。
- **GLM-5.3 真实模型调用 + 结构化输出已在线验收通过**（requirement_extract 实测 181 s，waiting_human 正确，14 需求 + 12 UNKNOWN，原文逐字校验通过）。此前 10-07 两次失败根因即默认 120 s 超时小于实际耗时。
- 下一阶段：MarketPilot 工作台（React 受控 API + 分步点击式 Workflow），见实施记录 11.6。
- **重启桌面版后的 GUI 验收**按 [docs/GUI_ACCEPTANCE.md](docs/GUI_ACCEPTANCE.md) 执行。

## 0.1 MarketPilot 工作台（2026-10-08 已实现，待 GUI 实测）

插件现含**项目工作台**：宿主半边在 `webServer` 上挂载受控 HTTP API（`/marketpilot/api/*`，same-origin），浏览器半边是右侧边栏「MarketPilot 工作台」Tab（React，`dsh.client` 客户端插件）。

- 分步点击流程：新建项目 → 导入 md/txt → 抽取需求（真实 GLM-5.3 结构化输出）→ 人工确认（问题卡片确认/退回）→ 竞品抽取 → 生成候选路线 → 人工确认技术路线 → 生成方案 → 招标条款抽取与符合性审查。
- 每步仍走 guarded `ctx.tools.execute` 与 WorkflowRun 统计；人工门经 `userQuestions`（headless Agent 作用域监听 + HTTP 应答），模型不能自证。
- 启用方式：`pnpm build`（同时产出 `client/client.js`）后**重启 DSH Desktop**，选中任一会话，在右侧边栏「+」/指南中打开 MarketPilot 工作台。宿主 profile 需含 `webServer`（桌面 Web 即有）。
- 测试：`tests/workbench-routes.spec.ts` 覆盖读路由、人工问题全链路（退回+确认）、跨域 403、工具白名单 400、未知路径 404，以及**完整 CALM Golden Case 的工作台点击路径**（两处人工门经 HTTP 应答）；合计 85 项测试通过（含生成层短句柄别名回归与客户端 bundle 冒烟）。

## 1. 项目目标

MarketPilot 是面向智能船舶与无人系统市场工作的 AI 调研与方案生成助手，以独立插件接入 DeepSeek Harness。CALM 单点系泊漏油监测是 Golden Case，用于验证通用业务流程，不应成为 Domain 中硬编码的业务逻辑。

```text
客户资料 → Requirement Baseline → Evidence Ledger
        → 竞品分析 → Alternative → Human Decision
        → Solution.md → Tender Compliance Matrix
```

当前已实现可重复运行的本地闭环。下一步重点是完整 Harness Web/profile 集成与真实模型验证，不需要重新实现 Domain、Storage 或现有 Workflow。

## 2. 从哪里开始

| 文档 | 用途 |
|---|---|
| 本 README | 交接状态、关键决策、接续工作顺序 |
| [插件 README](marketpilot/README.md) | 安装、测试、demo、模型配置、Tool 使用和限制 |
| [实施记录](docs/IMPLEMENTATION_NOTES.md) | 官方 API 核查、源码依据、设计差异和分阶段验证历史 |
| [技术路线 V1.0](docs/AI应用创新大赛项目技术路线_V1.0.md) | 业务定位、系统边界与总体路线 |
| [MVP 功能与数据结构 V1.0](docs/MarketPilot_MVP功能与数据结构设计_V1.0.md) | Domain、Workflow、Human Gate 和验收要求 |
| [CALM fixture 说明](marketpilot/fixtures/calm/README.md) | 脱敏资料来源、合成数据与离线替身的边界 |

实施记录包含早期阶段的历史状态；当前运行方式以插件 README 为准，后续修改应同步更新验证结果和本交接说明。

## 3. 工作目录与版本

当前工作区：`E:\PythonProjects\Work_Platform`（2026-10-08 自 `E:\ZCQ\Projects\07_工作台` 迁移，目录结构不变）。

```text
Work_Platform/
├─ README.md                 # 本交接入口
├─ docs/                     # 两份业务设计与实施记录
├─ deepseek-harness/          # 官方源码 checkout
└─ marketpilot/              # 独立业务插件，后续主要修改位置
   ├─ src/
   ├─ tests/
   ├─ fixtures/calm/
   ├─ scripts/
   ├─ cordis.patch.yml
   └─ .marketpilot/           # 被忽略的本地生成数据
```

| 项目 | 当前基线 |
|---|---|
| 官方仓库 | <https://github.com/deepseek-ai/deepseek-harness> |
| Harness commit | `5badb15009ae1756c3afe0ae0cef1faafc290ccc` |
| Harness 包版本 | `0.2.1-alpha.1` |
| Cordis 版本 | `4.0.5-alpha.1` |
| 本地已验证环境 | Node `24.17.0`、pnpm `10.34.5`（2026-10-08 迁移后复测） |
| 运行时模型 | zai Provider / `glm-5.3` / reasoningEffort `max`（桌面 profile 配置） |
| MarketPilot 包名 | `dsh-marketpilot`，当前为 private 开发包 |

2026-10-05 核查时，官方 checkout 的 `git status --short` 为空。工作区根目录及 `marketpilot/` 本身尚未初始化 Git，插件源码因此不属于官方 checkout 的版本管理；备份或后续建立独立仓库时应包含插件、设计文件和本 README，并保留已有忽略规则。现有 `link:` 开发依赖依赖两个目录相邻，移动前需处理路径。

## 4. 已完成与尚未验收

| 阶段 | 当前结果 |
|---|---|
| Phase 1：Domain / Storage / Service | 11 个实体、校验、CRUD、引用、SQLite/JSON 持久化及业务保护规则已实现 |
| Phase 2：Harness Integration | Cordis Service、插件生命周期、schema Tools、guarded execution、人工审核与导出已实现 |
| Phase 3：Requirement Workflow | 提取、规范化、UNKNOWN/冲突、人工确认和 Baseline 已接通 |
| Phase 4：Golden Case | 脱敏 Markdown、合成负例、fixture 主题与重复执行测试已建立 |
| Phase 5：Alternative / Decision / Solution | 候选路线、真实 Human Gate、等待/恢复、方案与引用索引已实现 |
| Phase 6：Tender Review | 条款提取、证据规则、状态降级、Action 与 Compliance Matrix 已实现 |
| Phase 7：Competitor / Policy | 本地资料抽取、型号引用保护、UNKNOWN、基础标准信息与可选 Web adapter 已实现 |
| Phase 8：Demo / README | 本地独立进程 demo、重复运行、重置、导出及说明已验证；完整 Web 和真实模型仍待验收 |

最近一次验证记录：11 个测试文件、79 个测试通过；`pnpm typecheck`、`pnpm build` 通过。没有调用真实 DeepSeek API，也没有运行整个 Harness 仓库的全量测试。

独立进程 demo 会读取实际 bundle manifest 和 patch，经官方 Include、Cordis Loader 加载构建后的插件，使用官方 SQLite 和 `ctx.tools.execute`。它使用离线模型替身，不能据此宣称真实模型的抽取质量、方案质量或性能已经通过验收。

## 5. 立即恢复本地工作

当前机器已有开发依赖和构建产物时，在插件目录运行：

```powershell
Set-Location 'E:\PythonProjects\Work_Platform\marketpilot'
pnpm test
pnpm typecheck
pnpm build
pnpm marketpilot:demo:smoke
```

新环境、缺少上游类型声明或运行时映射时，先按[插件安装步骤](marketpilot/README.md)安装过滤依赖，再执行 `pnpm prepare:harness-types`、`pnpm prepare:harness-runtime`。这两个开发脚本不修改官方源码；本地 demo 的解析 hook 不属于生产 profile 加载机制。

其他常用命令：

| 命令 | 行为 |
|---|---|
| `pnpm marketpilot:demo` | 离线模型，要求人在终端逐项确认 |
| `pnpm marketpilot:demo:smoke` | 离线模型与明确标注的模拟人工，供自动回归 |
| `pnpm marketpilot:demo:reset` | 归档带专用标记的生成目录，下次创建空数据库；保留输入 fixture |

Golden Case 的稳定预期：4 份文档、10 条需求（6 confirmed、4 unknown）、18 条 Evidence（含 10 UNKNOWN）、2 个候选路线、2 个合成竞品、5 个 Markdown Artifact。生成文件位于 `marketpilot/.marketpilot/demo/<时间戳>-<随机后缀>/`，数据库为该 demo 目录下的 `marketpilot.db`。

成果包括 Requirement Baseline、Competitor Matrix、Alternative Comparison、Solution、Compliance Matrix 和 Run Summary。合成招标负例会故意提出无证据 compliant，保存后必须降为 unknown 并生成补证 Action。

## 6. 代码入口与架构决策

| 入口 | 后续修改时关注 |
|---|---|
| [插件入口](marketpilot/src/harness/plugin.ts)、[主 Service](marketpilot/src/harness/service.ts) | `inject`、注册、资源释放、取消及模型 adapter 选择 |
| [Domain 聚合](marketpilot/src/domain/state.ts) | 同项目引用、已确认需求、选中路线与 Decision 一致性 |
| [Repository](marketpilot/src/storage/harness-repository.ts) | 官方 storageDomain；一个项目一条原子聚合记录 |
| [Service 工厂](marketpilot/src/services/index.ts) | 业务 API、注入 HumanGate；无全局业务 singleton |
| [Tool 注册](marketpilot/src/tools/register.ts) | 输入 schema、canonical JSON、render、guarded Tool 调用与统计 |
| [结构化模型 adapter](marketpilot/src/adapters/harness-model.ts) | 使用 Harness subagents/spawn、父 Agent 路由和结构化输出；最终 Zod 校验 |
| [Workflow](marketpilot/src/workflows/) | 固定步骤、前置条件、重试、失败、等待与恢复 |
| [Prompt](marketpilot/src/prompts/)、[渲染](marketpilot/src/render/) | 模型候选输出与固定业务索引分开生成 |
| [Golden Case 场景](marketpilot/fixtures/calm/scenario.ts) | 通过真实 Tools 复用演示与 E2E 流程 |
| [E2E 测试](marketpilot/tests/calm-e2e.spec.ts) | 重复项目隔离、业务约束、卸载/重载后的持久化 |

关键决策：业务代码采用 out-of-tree 包；Service 使用当前 Cordis 模式；Tool 使用当前 `defineTool` API。业务 schema 用 Zod，插件配置用 Schemastery。Workflow 不直接操作 SQL、文件存储实现或具体 LLM SDK。

官方存储没有跨表事务，因此项目聚合一次提交，保证 Decision 与选中 Alternative 一致。当前适用于单进程、小型项目，不具备跨进程写协调、多租户权限或自动迁移。生产 bundle 继承 profile 路由，官方 base 默认 JSON；本地 demo 明确使用 SQLite，两者不能混为同一数据库。

## 7. 接下来按什么顺序做

### 第一优先：MarketPilot 工作台（React，受控 API）

2026-10-08 起的新第一优先。按[实施记录 11.6](docs/IMPLEMENTATION_NOTES.md#116-下一阶段计划marketpilot-工作台react受控-api) 执行：先核查 `packages/client/ui-*` 与客户端→Host 受控调用通道的当前源码事实，再实现 Project List、Requirement Review、Evidence Ledger 与分步点击式 Workflow。前端只做受控调用与展示，业务规则仍在 Tools/Workflow，Human Gate 不降级为模型自证。每步走 guarded `ctx.tools.execute`，不直接调智谱 API。

### 第二优先：完成完整 Harness Web/profile 验证

安装版 DSH Desktop 已加载本插件（工具可调用、存储落盘），Web 侧基本打通；剩余：从源码仓库构建并启动官方 Web 的复验、dump 中 MarketPilot 层核对、重启后项目恢复验证。上次完整依赖安装因大型下载超时未完成，官方 `pnpm dsh --version` 曾报 `ERR_MODULE_NOT_FOUND: tsx`，接手先复核。

### 第三优先：真实模型小样本验收（已开始，持续扩展）

requirement_extract 已于 2026-10-08 在线验收通过（181 s）。继续扩展：candidate 路线、Solution、Tender、Competitor 的在线小样本验证；定位「方案引用了不存在的证据」失败 Run 的具体层次（adapter/schema/prompt/Service），不用离线替身结果替代实测。凭据由 Harness 管理，不写入 fixture 或日志。

### 第四优先：补齐材料与联网研究验证

原业务目录 `E:\ZCQ\05-科室工作\01 潜在项目\01 CALM漏油检测` 在 2026-10-08 迁移后已不存在（`E:\ZCQ` 整体消失），已读过的水面 DOCX 与水下 `V4.0.md` 原件目前仅剩脱敏 fixture 版本；大赛 DOCX、两份指定调研报告和可选 camera PDF 从未找到，需用户重新提供。水下 V4.0 与指定 V4.0(3) 的对应关系仍未确认。

获得缺失资料后记录版本、读取并脱敏，再决定是否扩展 fixture。配置真实 Web search/fetch provider 后，验证搜索正文生成 draft SOURCE、错误与截断处理；标题不能成为已核验事实，同系列型号不能继承参数。

### 后续增强：DOCX/PDF 与比赛数据

当前应用仅支持 UTF-8 md/txt。若需要二进制导入，应实现 DocumentParserAdapter 并增加正常、损坏、空文档、超限及取消测试，不能把人工预提取 Markdown 视为 parser 已实现。该增强不阻塞已有 P0 本地演示。

### 后续增强：工作台 UI 系统性优化（用户 2026-10-08 提出）

当前右侧边栏工作台为最小内联样式的原始 UI，功能完整但视觉原始。后续优化方向：接入主题令牌与 CSS Modules（遵循上游 docs/web-styling.md）、复用 ui-primitives 组件目录（Button/DisclosureRow/Tooltip/Menu 等）、按 dsh-client-ui-ux 规范打磨布局与加载/错误/空态、需求与条款表格化、状态徽标体系、浅色/深色主题适配。属于打磨项，不阻塞 MVP 验收。

比赛统计要分别记录真实模型耗时、人工等待、正确率和人工基线。当前 modelCalls 是 adapter 调用数，toolCalls 仅计成功返回并关联 Run 的工具，duration 是各 Run 已记录耗时之和，不代表底层 HTTP 次数或人工增效。

## 8. 后续开发必须保留的规则

- 不修改 `packages/core` 或 Harness Agent Loop；遇到 API 差异，以当前官方源码为准并记录依据。
- UNKNOWN 不能未经人工或有效新证据变为 FACT；保留原声明与核验记录。
- 最终路线由 Human Gate 生成 Decision；模型不能通过参数自证人工授权。
- 无已核验证据的参数、认证、业绩和型号性能，不能保存为 compliant；必须保留未知并生成行动项。
- confirmed Requirement 与 Human Decision 优先；具体参数有证据，建议与确认值可区分，方案保留 UNKNOWN。
- 模型输出严格做运行时校验；不从 Markdown 表格反解析业务数据，不吞掉异常。
- 普通测试不依赖 API key；脱敏 fixture 不包含真实客户、地点、预算或报价；合成厂家与数据保持明确标注。
- 阶段修改后运行对应测试与必要类型检查/构建，更新验证日期和结果。未运行的集成检查必须标为未验证。

## 9. 交接给下一位工程师或 Agent

可直接使用下面的任务描述继续工作：

> 继续 MarketPilot 项目。先读工作区 README、marketpilot/README.md 和 docs/IMPLEMENTATION_NOTES.md，并核对当前 Git 与依赖状态。现有 Domain、存储、Tools、业务 Workflow 和 CALM 离线演示已经实现，上一轮为 79 个测试通过；不要重写这些模块。优先恢复完整 DeepSeek Harness 环境，验证 Web profile 加载、真实人工问题和持久化，再完成真实模型的小样本验收。保持官方核心不变，不将离线替身结果当作真实模型质量证明。所有变更按阶段验证并更新交接文档。
