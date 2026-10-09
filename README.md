# MarketPilot

继续开发请先阅读[项目说明与续开发指南](docs/README.workspace.md)，其中记录交接基线、未完成验收和下一步顺序；仓库核查与分阶段验证见[实施记录](docs/IMPLEMENTATION_NOTES.md)，UI V3 重构见[实施日志](docs/UI_V3_IMPLEMENTATION_LOG.md)。本文件侧重插件安装、运行与使用；以下测试结果来自 2026-10-09 的验证记录。

DeepSeek Harness 的独立业务插件：需求基线 → 证据台账 → 竞品/候选路线 → 人工 Decision → 技术方案 → 投标符合性矩阵。业务代码位于本包，不修改 Harness 核心或 agent loop。

本地业务闭环已打通：官方 Cordis Loader 读取 bundle patch、加载构建后的插件，使用官方 SQLite、guarded Tools、Human Gate 和 Markdown Artifact。120 个测试、strict typecheck、build 通过，CALM 离线演示可重复执行，且完整 Golden Case 已通过工作台 HTTP 点击路径（含 HTTP 应答人工门）在进程内验证；真实 GLM-5.3（zai Provider，max effort）已在线验收**全链路**——需求提取→人工确认→候选路线生成→人工 Decision→方案生成→投标条款抽取与符合性审查（V3 主面板 CDP + flash 双通道核验）。生成层使用短句柄（R#/E#/D1）降低真实模型抄错 UUID 的失败率。联网搜索与 GUI 全流程截图留证仍待完成；离线替身和模拟人工确认不代表这些验收通过。

## 0. 项目工作台（Web UI V3 主面板）

本包自带 Web 客户端插件（`dsh.client`）与受控 HTTP API。**V3.0 起 MarketPilot 是全宽主工作区**：左侧边栏「MarketPilot 智策」图标 → `main` keyed 槽的 `marketpilot` 面板。**八个分区全部真实页面化**：项目概览（六阶段条 + 统计卡）→ 01 资料与需求（上传/提取/确认/表格/抽屉）→ 02 情报研究（竞品/政策）→ 03 证据审查（核验 Gate）→ 04 技术路线（候选/覆盖矩阵/Decision）→ 05 方案生成（Markdown 安全预览）→ 06 投标检查（条款/审查）→ 项目成果（reviewStatus + MarkdownText）→ 任务中心（跨项目执行索引 + 步骤时间线）。

### 加载与打开

```powershell
cd E:\PythonProjects\Work_Platform\marketpilot
pnpm build          # 产出 lib/ + client/client.js
# 完全退出 DSH Desktop（托盘右键）→ 重新启动
# 点击左侧边栏「MarketPilot 智策」图标进入主面板
```

- 宿主半边：`src/harness/routes.ts` 在 `webServer` 上挂载 `/marketpilot/api/*`（same-origin、跨域 403、仅 loopback 监听；上传按 `maxDocumentBytes` 限流；五域投影路由不含正文，内容仅在详情路由）；`src/harness/workbench.ts` 为每次点击创建 guarded Tool 执行（执行记录含 projectId/runId），人工问题经根瀑布停靠（Phase 2 修复：无头 Agent 的会话转发层不截获工作台门问题）。
- 浏览器半边：`src/client/`（react、TSX、`--dsw-*` 主题 token、ui-primitives、模块级执行注册表——页面切换不打断后台任务、刷新后从服务端领养在途执行）。`pnpm build` 经 tsdown 产出 `client/client.js`（`__ModuleLoader__` 契约；运行时仅依赖冻结模块表内包）。
- 右侧边栏旧 Tab 已降级为跳转按钮。

### 安全边界

- **单用户本地使用**：DSH Desktop 仅监听 `127.0.0.1`，Web GUI 有进程令牌鉴权；`/marketpilot/api` 做同源校验（跨域 403）。当前版本不支持对外网监听或多租户；远程部署前须补齐认证与授权。
- 项目/执行/运行 ID 绑定：所有工具调用带 projectId；确认/导出校验 runId 归属；跨项目 runId 拒绝（有测试覆盖）。
- 重启中断：前端显示"任务中断需重试"，不虚称审批可恢复。

### 验收与演示

- 正式验收文档：[docs/UI_V3_GUI_ACCEPTANCE.md](docs/UI_V3_GUI_ACCEPTANCE.md)（九项截图 + 真实 GLM 耗时 + 安全审计 + 人工门记录）。
- 比赛演示脚本：[docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)（含备用方案与关键数据）。
- 实施日志：[docs/UI_V3_IMPLEMENTATION_LOG.md](docs/UI_V3_IMPLEMENTATION_LOG.md)（V3.0 四阶段完整记录 + 3 个真实缺陷修复）。
- 测试覆盖：路由与人工门全链路（`tests/workbench-routes.spec.ts`）；上传/投影/runId 绑定/跨项目拒绝（`tests/phase2-routes.spec.ts`）；五域投影（`tests/phase4-routes.spec.ts`）；页面渲染 ×5（`tests/phase2-client.spec.tsx` + `tests/phase3-client.spec.tsx` + `tests/phase4-client.spec.tsx`）；模块表纯度（`tests/client-bundle.spec.ts`）；CALM Golden Case E2E（`tests/calm-e2e.spec.ts`）。

## 1. 安装与验证

验证基线：Harness `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，Node `24.16.0`，pnpm `11.19.0`。上游 packageManager 为 pnpm `11.7.0`。本地演示要求 Node 24，使用其 SQLite、TypeScript 类型擦除与模块解析 hook。保持以下相邻目录：

```text
工作台/
├─ deepseek-harness/   # https://github.com/deepseek-ai/deepseek-harness
├─ marketpilot/
└─ docs/IMPLEMENTATION_NOTES.md
```

新环境先克隆官方仓库并检出上述 commit。完整 Harness 的官方步骤是仓库根目录下 `pnpm install`、`pnpm run build`。本环境的大型依赖下载超时，以下只安装演示及类型检查所需的生产依赖闭包。在 `marketpilot` 目录运行：

```powershell
pnpm --dir ../deepseek-harness --filter @deepseek-ai/dsh-storage-domain... --filter @deepseek-ai/dsh-storage-json... --filter @deepseek-ai/dsh-storage-sqlite... --filter @deepseek-ai/dsh-tools... --filter @deepseek-ai/dsh-user-questions... --filter @deepseek-ai/dsh-fs-local... --filter @deepseek-ai/dsh-subagent... --filter @deepseek-ai/dsh-cmdline... --filter @deepseek-ai/dsh-web... install --prod --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
pnpm prepare:harness-types
pnpm prepare:harness-runtime
pnpm test
pnpm typecheck
pnpm build
```

`prepare:harness-types` 按官方各包自己的 tsconfig 生成声明，`prepare:harness-runtime` 按官方 package exports 构建演示所需的 23 个运行时入口。只写上游被忽略的 `lib/`，不改源码。演示专用 `demo-resolution.mjs` 将过滤安装后的 peer imports 指向这些官方构建文件；生产 `dsh` 使用其自己的 profile resolver。此流程不证明完整 Web 已构建。

## 2. CALM Golden Case

```powershell
# 离线模型替身；需要人在终端逐项输入“确认”
pnpm marketpilot:demo

# 自动回归：离线模型替身 + 明确标注的模拟人工
pnpm marketpilot:demo:smoke

# 将生成目录移入备份；下次 demo 创建空数据库
pnpm marketpilot:demo:reset
```

演示始终使用 `fixtures/calm/offline-model.ts`，不读取 API key、不联网。默认交互命令不会自动批准 Human Gate。`--test-human` 仅存在于演示脚本；生产 Tools 没有自动跳过审核的参数。smoke 验证状态机、引用、持久化和导出，不评估模型理解质量。

演示依次创建新项目、导入 4 份资料、抽取并确认需求、核验两段技术来源、抽取合成竞品、生成候选路线、验证无 Decision 的等待、确认路线、恢复方案生成、提取及审核招标条款，最后审核并导出成果。每次生成独立项目和输出目录，旧记录保留。

预期：10 条 Requirement（6 confirmed、4 unknown）、18 条 Evidence（含 10 UNKNOWN）、2 条 Alternative、2 个合成 Competitor、5 个 Artifact。招标离线替身故意提出无证据 compliant，验证 3 个条款都降为 unknown，并替换无依据的符合性响应。

SQLite 在 `.marketpilot/demo/marketpilot.db`；`.marketpilot/demo/<时间戳>-<随机后缀>/` 内包含 `Requirement Baseline.md`、`Competitor Matrix.md`、`Alternative Comparison.md`、`Solution.md`、`Compliance Matrix.md` 和 `Run Summary.json`。重置只归档带专用标记的生成目录，不改 fixture 输入；备份保留于 `.marketpilot/demo-archive-*`。

## 3. 安装到 Harness profile / 打开 Web

本包 manifest 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`。以下是当前官方文档支持的命令，需要先成功完成整个 Harness 的安装与构建。本机 `pnpm dsh --version` 仍报缺少 `tsx`，因此这些 Web 步骤尚未启动验证。

在 `deepseek-harness` 目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm run build

# 仅首次创建新的 Web profile；dump 不启动模型
pnpm dsh marketpilot --from-default-profile web --dump-config
pnpm dsh plugin --profile marketpilot add ../marketpilot
pnpm dsh --profile marketpilot --dump-config
pnpm dsh marketpilot --no-open
```

已有 profile 时跳过 `--from-default-profile`。浏览器地址由 Harness 打印，官方默认 `http://127.0.0.1:3080`。使用现有聊天、人工问题组件和通用 Tool 结果，不需要独立 MarketPilot 前端。

bundle 继承 profile 的 storageDomain 路由，官方 base 默认 JSON，本地 demo 明确使用 SQLite。已有 SQLite provider 时可在 storage-domain 配置加入 `routes: { marketpilot: sqlite }`。官方 patch 会替换整份 config，必须保留原 backend 和其他 routes。不要在已有数据后随意切换后端；本 MVP 没有自动迁移。

## 4. 配置真实模型与业务使用

在 Harness 的 Models 页面配置 DeepSeek 凭据及当前会话模型，或按官方方式提供 `DEEPSEEK_API_KEY`。凭据由 Harness 管理，不写入本包或 fixture。MarketPilot 通过 `ctx.subagents` 的 `spawn` provider 调用结构化模型，继承父 Agent 路由与 Session 日志，子调用禁用全局工具，仅保留 Harness 结构化结果出口。

默认配置：`maxDocumentBytes=2097152`、`structuredProvider=spawn`、`modelTimeoutMs=120000`。缺 Agent、subagents 或可用 provider 时明确报错。JSON schema 失败最多重试一次，不从 Markdown 表格反解析；Workflow 不导入具体厂商 SDK。

在 Web 聊天中让模型按顺序调用下列工具；文档路径使用绝对路径，后续 ID 读取前一步结果：

1. `marketpilot_project_create`，然后 `marketpilot_document_import` 导入 md/txt。
2. `marketpilot_requirement_extract` 返回 waiting_human 和 run ID。审核后 `marketpilot_requirement_confirm` 传入本批 proposed 需求 ID、runId，生成 Baseline。
3. `marketpilot_evidence_add/list/verify/link` 管理台账；`marketpilot_competitor_extract` 抽取报告/Datasheet。
4. `marketpilot_alternative_generate` 生成 2—3 个候选；`marketpilot_decision_confirm` 请求真实人工选择。
5. `marketpilot_solution_generate` 生成方案；此前无 Decision 等待的 Run 可用相同 runId 恢复。
6. 导入招标文件，运行 `marketpilot_tender_extract`、`marketpilot_tender_review`。
7. `marketpilot_artifact_list/export` 查看、人工审核并导出；必须写入新文件，不覆盖已有内容。

还提供 `marketpilot_project_get`、`marketpilot_requirement_list`、`marketpilot_run_summary`、`marketpilot_competitor_list`、`marketpilot_policy_extract/list`。当 `web` 服务可用时挂载 `marketpilot_research_search`，需配置实际 search/fetch provider。搜索抓取正文，保存 draft SOURCE，不将标题或搜索摘要当作事实；网络失败、正文截断明确报错。

## 5. 数据与业务约束

Domain 是独立 TypeScript/Zod，包含 11 个实体。Repository 复用 storageDomain，每个项目是一次原子写入的聚合记录。Workflow 只调用 Service；候选路线、方案、竞品、投标结果提交时比对业务输入版本，拒绝保存并发修改前的旧结果。

UNKNOWN 分类变更只能通过 Evidence.verify，保留原分类、声明与核验记录；自动解决需要新增、已核验且声明完全一致的 FACT/SOURCE，否则必须人工。Decision 由 `ctx.userQuestions` 的明确确认产生，模型不能自证。方案固定渲染人工路线、confirmed Requirement、开放 UNKNOWN；正文区分证据支持、建议、未知，具体参数需要已核验 FACT/SOURCE。

投标 compliant 必须有已核验 FACT/SOURCE，比“仅严格条款必须有证据”的最低要求更严格。竞品参数引用须包含准确型号和值，缺失为 UNKNOWN，不继承相邻型号。证据检查是结构与引用校验，不证明资料真实性或语义充分性；正式导出须人工审核。

适用范围是单进程、小型项目；没有多租户权限、跨进程写协调或自动 schema 迁移。Artifact 正文保存在项目记录，导出走 Harness fs。未运行整个 Harness 的全量测试。

## 6. 资料与解析边界

应用只支持有大小上限的完整 UTF-8 `.md/.txt`。DocumentParserAdapter 已保留，DOCX/PDF 解析尚未实现。CALM Markdown 是已读水面 DOCX、水下 `V4.0.md` 的最小脱敏整理，不代表应用支持 DOCX。合成 Datasheet 和招标条款不是实际厂商性能或客户要求。

大赛 DOCX、两份指定 CALM 调研报告、可选 camera PDF 尚未找到；水下 V4.0 是否等同指定 V4.0(3) 尚未确认。见 [fixture 说明](fixtures/calm/README.md)。未复制真实客户、地点、报价和部署细节。`.gitignore` 排除 `marketpilot-private/`、`private-fixtures/`、`*.secret.*` 及运行数据。

## 7. 代码与统计

| 路径 | 内容 |
|---|---|
| `src/domain/` | 实体、schema、业务约束 |
| `src/storage/`, `src/services/` | Repository、CRUD、人工 gate、原子提交 |
| `src/harness/`, `src/tools/` | Cordis 生命周期、依赖、guarded Tools |
| `src/adapters/` | 人工、解析、结构化模型与 Web adapter |
| `src/workflows/` | 固定状态机 |
| `src/prompts/`, `src/render/` | 外置 Prompt、Markdown 输出 |
| `fixtures/calm/`, `tests/` | 脱敏输入、离线替身、E2E、负例 |

WorkflowRun 记录 start/end、步骤、错误、durationMs、humanWaitMs、modelCalls、toolCalls。modelCalls 是 adapter 请求次数（含本层重试），不是 provider 内部 HTTP 数。toolCalls 是成功返回并关联该 Run 的前台 Tool 次数，不包括无 Run 的 CRUD、失败 Tool 或模型内部工具。Run Summary 耗时是各 Run 已记录耗时之和；离线替身的毫秒数不能代表真实模型速度或人工增效。

仓库核查、API、阶段结果和环境缺口见 [IMPLEMENTATION_NOTES](docs/IMPLEMENTATION_NOTES.md)。
