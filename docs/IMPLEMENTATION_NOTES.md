# MarketPilot 实施核查与 Phase 1 计划

核查日期：2026-10-03；阶段记录更新：2026-10-04（Asia/Shanghai）。本文记录当前 checkout 的证据、实现选择和验证状态；不代表 MVP 已完成。

## 1. 环境与源码基线

最初工作目录 `E:/ZCQ/Projects/07_工作台` 不是 Git 仓库，只含两份业务设计文件。按用户提供的官方地址下载到 `deepseek-harness/`；完整 clone 长时间无进展后中断，在同一目录执行 `git fetch --depth 1 origin master` 并检出跟踪分支。

| 命令 / 项目 | 实测结果 |
|---|---|
| `node --version` | `v24.16.0` |
| `pnpm --version` | `11.19.0` |
| 官方仓库 | `https://github.com/deepseek-ai/deepseek-harness` |
| 分支 | `master`，跟踪 `origin/master` |
| `git rev-parse HEAD` | `5badb15009ae1756c3afe0ae0cef1faafc290ccc` |
| 检出后的 `git status` | `nothing to commit, working tree clean` |
| 仓库 `packageManager` | `pnpm@11.7.0`；本机未改全局版本 |
| Node engines | `^22.19.0 || >=24.0.0`，本机满足 |
| Harness 包版本 | `0.2.1-alpha.1`（以所查 storage-domain manifest 为例） |

已阅读官方 README、根 AGENTS、architecture、cordis-primer、Cordis 教程 01–07、插件 basic/publish 教程、Tool authoring、testing、defensive-patterns、Storage 家族文档及相关实现。检索了用户指定的 `plugin`、`Service`、`ctx.tools`、`defineTool`、`ctx.llm`、`ctx.sessions`、`cordis.yml`、out-of-tree 插件相关术语。

## 2. 九项 API 核查结论

| 问题 | 当前结论与源码依据 |
|---|---|
| 推荐插件组织 | ESM 模块导出 `name`、`inject`、`apply(ctx, config)`；提供服务可使用 `Service` 子类。可分为业务服务、模型/解析适配器、Tool 消费者。见 [first plugin](../deepseek-harness/docs/user/develop/basic/index.md)、[architecture](../deepseek-harness/docs/architecture.md)。 |
| monorepo / out-of-tree | 官方支持 out-of-tree linked 包及 bundle，不必加入 `packages/`。选择独立 `E:/ZCQ/Projects/07_工作台/marketpilot/`，包名拟为 `dsh-marketpilot`；Harness checkout 保持上游源码不变。见 [publish](../deepseek-harness/docs/user/develop/basic/publish.md)。 |
| Service 注册 | `class X extends Service`，构造器 `super(ctx, 'marketpilot…')`；声明合并 `@deepseek-ai/cordis` 的 `Context`；`ctx.plugin(X)` 挂载。资源使用 `ctx.effect()` disposer；异步释放须等待完成。见 [services](../deepseek-harness/docs/cordis-tutorial/03-services.md)、[lifecycle](../deepseek-harness/docs/cordis-tutorial/02-lifecycle-and-effects.md)。 |
| Tool 与 schema | `defineTool` 来自 `@deepseek-ai/dsh-tools`，通过 `ctx.tools.register(defineTool({...}))` 注册。输入为 `parameters` DSL（字段含 `type`、`required` 等）；输出必须声明 `output.schema`、`output.render(args, value)`，`execute(args, exec)` 返回 canonical JSON 值。见 [schema.ts](../deepseek-harness/packages/core/tools/src/schema.ts)、[Tool authoring](../deepseek-harness/docs/cookbook/adding-a-tool.md)。 |
| inject | 模块 `export const inject = ['tools', 'marketpilotProjects', …]` 或类 `static inject`。缺依赖进入 PENDING；依赖消失时消费者卸载。Storage 消费者声明 `storageDomain`，模型适配器声明实际使用的 `llm`/会话服务。 |
| guarded pipeline | 通过 `ctx.tools.execute({ callId, name, arguments, signal, agent? })`；`callId` 为 Harness branded `ToolCallId`。执行经过 pre-policy → guards → around-dispatch → post-policy → finalization → `tools/result`。不能直接调用工具定义的 execute 绕过管线。PTC `tools.<name>()` 自动回到同一管线。见 [tools implementation](../deepseek-harness/packages/core/tools/src/index.ts)、[tutorial 07](../deepseek-harness/docs/cordis-tutorial/07-into-the-harness.md)。 |
| Web UI | 通用 Tool 结果与 Markdown 可复用。`output.render` 是模型/日志文本；Host `presentCall/presentResult` 不会自动生成专用 Web 卡片。Web 专用卡片走 Client 的 `tool.call.toolview` slot；P0 不引入独立前端。见 [Tool Web presentation](../deepseek-harness/docs/cookbook/adding-a-tool.md#web-client-presentation)。 |
| 测试 | Vitest；根 `pnpm run test`。普通测试不依赖真实 API；工具后续使用真实 registry/pipeline + 模型 Stub，并覆盖卸载。独立插件沿用 Vitest `tests/*.spec.ts`，有自己的过滤配置，不运行上游全套测试。见 [testing](../deepseek-harness/docs/testing.md)、[vitest config](../deepseek-harness/vitest.config.ts)。 |
| profile/bundle | `package.json.dsh.bundle.patch` 指向 `cordis.patch.yml`，其中 `insert` 插入插件。`dsh plugin --profile <name> add <path>` 安装。普通新 profile 默认只有 base，不能假定含 Web；Web 调试可先 `pnpm dsh web --patch <overlay>`，overlay 源码路径必须绝对。包共享的 Cordis/DSH 实例声明 peer + dev dependencies。见 [publish](../deepseek-harness/docs/user/develop/basic/publish.md)、[app boot](../deepseek-harness/packages/boot/app-boot/README.md)。 |

## 3. 可复用能力及边界

**Storage：复用 SQLite，隔离业务 Repository。** Harness 已有 `@deepseek-ai/dsh-storage`、`dsh-storage-domain`、`dsh-storage-sqlite` 和 `dsh-storage-json`。业务 schema 用 Zod；`defineDomain({ name, version, tables: { projects: domainTable(schema) } })`，通过 `ctx.storageDomain.open(spec)` 获取 handle。`table.get/entries` 同步，`put/update/delete` 持久化后完成；`update` 在 domain 写队列内运行。释放 `domain.close()`。源码：[spec](../deepseek-harness/packages/storage/storage-domain/src/spec.ts)、[domain](../deepseek-harness/packages/storage/storage-domain/src/domain.ts)、[SQLite](../deepseek-harness/packages/storage/storage-sqlite/src/index.ts)。

base profile 默认是 JSON，不能将存在 SQLite 包等同于默认已启用。Phase 2 overlay 需挂载 SQLite backend 并在 storage-domain `routes` 中仅将 `marketpilot` 路由到它；patch 替换整个 config，必须保留原来的 backend 及其他 routes。Phase 1 的真实存储测试将独立挂载上述官方服务，SQLite 和 JSON 跑同一组验证。

该接口无跨表事务。为使 Human Decision、Alternative 状态、项目当前决策一致，P0 采用一个项目一个聚合记录（ProjectState），相关实体仍有独立 ID 与 Service API。每次项目级变更通过一个 `table.update` 提交，失败不修改旧状态。代价是写入项目完整 JSON，适合本机 MVP；不是大规模并发数据库。模型不接触 Repository。严禁 Workflow 直接写 SQL/文件。

**文件与解析：** `ctx.fs.readText(FsTarget, signal)` 可用于 Markdown/TXT；已有 `read/read_image/write/edit` 工具及 MCP 客户端。发现 `dsh-office-to-pdf` 是 Office 转 PDF 服务，`pdfjs-dist` 位于浏览器预览包，未发现可直接拿来做业务 DOCX/PDF 文本提取的 Host Parser API。不能将“可预览”宣称为“已解析”。DocumentParserAdapter 先支持 md/txt；二进制解析后续选成熟库或预提取 Markdown。依据：[fs](../deepseek-harness/packages/fs/fs/src/index.ts)、[tool-fs](../deepseek-harness/packages/fs/tool-fs/src/index.ts)、[office-to-pdf](../deepseek-harness/packages/document/office-to-pdf/README.md)。

**搜索：** 复用 `ctx.web.search(request, signal)` / `ctx.web.fetch(request, signal)`；已有 DeepSeek、Exa、Perplexity 搜索 provider 和 HTTP fetch。需要实际配置可用 provider。ResearchAdapter 保留来源与正文，标题不能自动变 FACT；离线报告抽取不依赖网络。依据：[web](../deepseek-harness/packages/web/web/src/index.ts)。

**LLM：** 现有 `ctx.llm.prepareCall(config, signal)` 和流式调用；没有依据可假定存在 `ctx.llm.generateObject()`。Harness 内置 structured-output 用于子 agent/workflow，`defineTool` 也有 JSON schema 验证工具。MarketPilot 先用自己的 `ModelStructuredOutputAdapter`，后续接 Harness API，严格验证 JSON。须遵守模型输入可从 Session 日志重建的要求，不在 Workflow 内直接调用 DeepSeek SDK。依据：[LLM](../deepseek-harness/packages/llm/llm/src/index.ts)、[structured runtime](../deepseek-harness/packages/subagent/subagent-in-process-driver/src/structured.ts)。具体调用与日志集成在 Phase 3 验证，不在 Phase 1 假装已完成。

## 4. 业务资料读取与缺项

已完整读取 [技术路线 V1.0](AI应用创新大赛项目技术路线_V1.0.md) 和 [MVP 数据结构设计 V1.0](MarketPilot_MVP功能与数据结构设计_V1.0.md)，实际位于当前 `docs/`，不是 `marketpilot-input/`。

在 `E:/ZCQ` 按指定文件名检索后：水面方案 DOCX 找到于 `05-科室工作/01 潜在项目/01 CALM漏油检测/`；水下方案找到 `单点系泊水下漏油监测报警技术方案-V4.0.md`，尚未确认是否等同指定的 `(3)` 版本。大赛 DOCX、两份指定 CALM 调研 Markdown、两个可选 camera PDF 尚未找到。已向用户询问目录。业务原件不复制进 Git，不将其他 CALM 版本悄悄替换成指定版本；Golden Case 阶段前补齐读取与脱敏。此缺项不影响两份设计文件已定义的通用 Domain/Storage 实现。

## 5. 与设计示例的差异与补充

- 设计文档的目录是建议，实际选择 out-of-tree 包；不修改 `packages/core` 或 agent loop。
- Tool 返回 canonical JSON，render 单独声明，不返回旧式 `{ content }` 作为 execute 的业务结果。
- 业务数据复用 Zod，插件 Config 使用官方 Schemastery，Tool 使用 Harness schema DSL；三者作用不同。
- 复用 `storageDomain`，不自行维护 SQL schema；项目聚合提交解决当前存储无跨表事务的问题。
- Evidence 补充 supportingEvidenceIds、verification/resolution 审计；只记录 `verified` 不等于允许 UNKNOWN → FACT，必须有人工确认或新的有效证据。
- TenderItem 补充 claimKinds（参数/认证/业绩/型号性能等），让无证据规则可通过结构化校验执行；不是靠 NLP 猜条款类型。
- Alternative 的 `selected` 只能由 Decision confirmation 写入；一般 CRUD 不接受直接选中。Decision 历史保留，当前选择放在 Project.activeDecisionId。
- Human Gate 必须使用可信的人类确认来源，不能相信模型传来的 `confirmedBy` 或 `human: true`。Phase 1 测试服务级规则；Phase 2/3 再将人类确认能力接入 Harness 交互入口，禁止 Tools 自证授权。
- Artifact 增加 review 状态用于设计文件中的 Gate #3（正式发布前人工 Review）；生成草稿和正式导出分开。
- WorkflowRun 补充 alternative_generation、开始/结束/耗时、步骤历史、modelCalls/toolCalls、人类等待计时；状态转换受控。

## 6. Phase 1 文件修改计划（编码前冻结）

以下为计划新增文件，尚不存在时不作为已有证据引用。根目录为 `marketpilot/`。

| 文件组 | 实现内容 |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts` | 独立 ESM TypeScript 包、Zod、沿用 Vitest；本地 Harness 源码映射用于核验当前 commit，不将完整 Harness 打包进插件。 |
| `src/domain/{common,project,requirement,evidence,research,decision,tender,artifact,workflow,state}.ts` | 11 个业务实体 schema/type，纯 TS/Zod，无 UI/Harness 类型依赖；关系一致性及业务规则。 |
| `src/storage/{repository,harness-repository}.ts` | Repository 接口及官方 storageDomain adapter；一个项目原子聚合，显式关闭，损坏数据报错。 |
| `src/services/{project,records,requirement,evidence,decision,tender,workflow,artifact,index}.ts` | CRUD、项目上下文、证据链接与确认、决策 Human Gate、投标规则、WorkflowRun 状态与统计；不调用模型。 |
| `src/adapters/contracts.ts` | DocumentParserAdapter、ResearchAdapter、ModelStructuredOutputAdapter 接口，无具体 SDK。 |
| `tests/{domain,services,storage,workflow}.spec.ts` 与测试 helper | 真实 Harness SQLite/JSON 持久化、重开、并发、失败原子性、业务负例。 |
| `README.md`, `.gitignore` | Phase 1 当前能力/局限、实际验证命令；忽略运行数据及 `marketpilot-private/`、`private-fixtures/`、`*.secret.*`。 |

验证顺序：schema 与纯规则 → Project/实体 CRUD → Evidence links/UNKNOWN 保护 → Decision 原子确认与缺决策 prerequisite → 无证据 Tender 降级及 action → WorkflowRun 合法转换/等待计时 → SQLite、JSON 重开与失败保留旧值 → TypeScript 检查。测试不读取 API key、不联网调用模型。

阶段停止点：Phase 1 通过后汇报文件结构、真实 API 选择和测试结果；后续 Tool/LLM/Golden Case 按阶段推进，不能将 Phase 1 报告为完整 MVP。

## 7. 当前验证状态

Phase 1 已完成于独立 `marketpilot/`：11 个 Domain、Repository adapter、业务 Service、人工审核接口、三类业务 adapter 接口。`pnpm test`：4 文件 / 47 测试通过；`pnpm typecheck` 与 `pnpm build` 通过。SQLite 与 JSON 均使用当前 checkout 的真实 provider，涵盖持久化重开、并发插入/更新、写锁失败、损坏数据拒绝加载、审核失效、UNKNOWN 和 Tender 负例。没有模型调用。

上游完整依赖安装在镜像及官方 registry 均遇到大型依赖下载超时。已成功安装 storage-domain/storage-json/storage-sqlite 的生产依赖闭包；`prepare:harness-types` 使用上游各自 tsconfig 构建所需类型。当前未完成完整 Harness/Web 构建，不声称 MarketPilot bundle 或 CALM demo 已可启动。上游 `git status --short` 仍为空。

收到用户指向 CALM 目录后，补查了隐藏/被忽略目录中的指定名称，仍只匹配到水面 DOCX 和水下 `V4.0.md`。已完整读取两者正文；DOCX 通过本地 OOXML 文本读取，未修改或复制原文件。这仅是本次资料核查，不代表 MarketPilot Parser 已支持 DOCX。地域、部署尺寸、预算等需在 Golden Case 阶段脱敏；水面响应时间等建议指标与水下未冻结性能条件必须分别保留。

## 8. Phase 2–3 集成记录

已实现 `src/harness/plugin.ts`、`MarketPilotService` 和 Tools。真实 Cordis Context 挂载测试覆盖 Tool 注册、guarded pipeline 策略拒绝、参数校验、取消、文件导入/导出、卸载及重新挂载。人工确认通过 `ctx.userQuestions.ask()`，必须收到用户明确“确认”；Tool 参数中的自称人工身份无授权效力。插件卸载会取消并等待在途调用，再关闭项目存储。

Requirement Workflow 固定步骤已接通，模型输出经严格 Zod 验证，原文必须存在于本批文档。无效 JSON 最多重试一次；二次失败保存本地诊断 Artifact 并记录失败。候选需求、UNKNOWN 与 waiting_human 状态原子保存，确认只作用于本批候选；Baseline 由已存储记录确定性渲染，重复完成不会产生重复 Artifact。

模型适配器实际使用 `ctx.subagents.start('spawn', { parent, prompt, outputSchema, toolFilter: { allow: [] } })` 的有界结构化子调用，沿用 Harness 模型路由、Session 日志和 structured_output。Workflow 不导入具体厂商 SDK。可注入 `marketpilotModel` adapter 进行离线测试。Zod schema 投影为 Harness 支持的 JSON Schema 子集，完整业务校验仍由 Zod 执行。此实现补充第 3 节的初步 LLM 调查；不使用仓库已弃用的 Session snapshotEvents/ownEvents。

2026-10-04：Phase 3 的 64 个测试、strict typecheck 和 build 全部通过。类型依赖构建补齐上游 production-only 安装未带入的开发依赖。`modelCalls` 统计结构化 adapter 调用次数，不等于 provider 内部重试或底层 HTTP 请求数。

## 9. Phase 4–7 结果

Phase 4 建立 `marketpilot/fixtures/calm/` 的最小脱敏 Markdown、验收主题与来源说明。只使用已读取的水面 DOCX、水下 V4.0；新增招标条款、DemoVendor Datasheet 明确标为合成资料。fixture 主题测试通过，累计 65 测试。

Phase 5 增加 generation Domain、Service、Workflow、三个 Prompt 和 Markdown renderer。2—3 个候选不带 selected；无 Decision 时 Solution 进入 waiting_human，确认后可用 runId 恢复。提交时比对业务输入版本，原子保存成果；固定渲染人工路线、confirmed Requirement、UNKNOWN。参数和 confirmed 声明需要已核验 FACT/SOURCE，每条需求必须有章节索引。6 项工作流测试、类型检查和构建通过。

Phase 6 增加条款抽取、引用校验、证据匹配、状态校验和 Compliance Matrix。无证据或仅有 draft 来源时，模型提出的 compliant 降为 unknown，替换无依据的符合性响应并生成补证 action。包含指定名称的参数无证据负例，3 项测试、类型检查、构建通过。

Phase 7 增加本地报告/Datasheet 竞品抽取、Policy 基础抽取和可选 HarnessResearch。已知竞品属性引用必须包含本型号和值；来源生成 draft SOURCE，缺失生成 UNKNOWN。Web search 后抓取正文，拒绝失败/截断，不把标题当事实，工具只在 web 依赖就绪时注册。4 项研究测试通过，并复测 Tool 生命周期和 Tender。

## 10. Phase 8：演示与验收边界

`pnpm marketpilot:demo:smoke` 已在真实 Node 进程执行成功：读取 bundle manifest/patch，经官方 Include 的 applyEntryPatches 和 Cordis Loader 加载 lib/index.js，所有业务步骤调用 ctx.tools.execute，存储使用官方 SQLite。生成 Baseline、Competitor Matrix、Alternative Comparison、Solution、Compliance Matrix 与统计 JSON。正常 demo 需要人在终端确认；smoke 明确使用离线模型和模拟人工，不代表真实模型质量验收。

E2E 在同一存储内重复创建两个独立项目，并卸载/重载插件验证持久化。独立进程 smoke 重复成功，reset 归档生成目录后重跑成功。当前 11 个测试文件 / 79 测试通过，strict typecheck、build 通过。单次 fixture 为 4 文件、10 需求、18 Evidence、10 UNKNOWN、2 候选、2 合成竞品、5 Artifact、12 次 adapter 调用、8 次关联 Run 的成功 Tool 返回。

开发过滤安装缺少上游 package peer 的物理链接。prepare:harness-runtime 仅构建演示所需的 23 个官方运行时 exports；演示专用 Node hook 指向构建结果，保证共用 Cordis 实例，不进入生产插件，也不改变官方 resolver。运行时和类型输出均在上游忽略目录，git status --short 仍为空。

尚未验收：完整 Web/CLI profile 安装启动、真实 DeepSeek 模型质量、带凭据 Web search。实际官方 pnpm dsh --version 报 ERR_MODULE_NOT_FOUND: tsx，对应此前完整安装下载超时；没有宣称完成全仓库 Web build。README 提供官方 profile 初始化、bundle 安装、dump 和 Web 命令，并标为需完整环境验证。应用 DOCX/PDF 解析未实现，P0 使用预提取 Markdown。

统计口径：toolCalls 仅计成功返回并关联 Run 的前台 Tool，不计独立 CRUD、失败 Tool、模型内部工具；humanWait 离开等待时累计；总耗时是各 Run 已记录耗时之和。证据校验检查结构与引用，不证明真实性或语义充分性，正式导出仍需 Human Gate。

## 11. 2026-10-08 新阶段：环境迁移、GLM-5.3 真实模型验收与工作台准备

### 11.1 环境迁移复查

工作区整体迁移到 `E:\PythonProjects\Work_Platform`，目录结构不变（`deepseek-harness/`、`marketpilot/`、`docs/` 相邻，`link:` 开发依赖继续有效）。本机 Node `v24.17.0`、pnpm `10.34.5`（与上次记录的 24.16.0/11.19.0 不同，均满足 engines）。上游 checkout 仍为 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，`git status --short` 为空。迁移后完整复测：`pnpm test` 11 文件 / 79 测试全部通过。

安装版 DSH Desktop（`C:\Users\zjdzc\AppData\Local\Programs\DSH Desktop`）运行本 GUI（`dsh web`，127.0.0.1:43129），其实际 profile 在 `C:\Users\zjdzc\AppData\Roaming\dsh-desktop\harness\profiles\web`，与 CLI 的 `~/.dsh/profiles/*` 是两套独立目录。桌面 profile 的 `package.json` bundles：`dsh-base`、`dsh-web-app`、`dshmarket`（第三方 npm 插件）、`dsh-marketpilot`（link 指向本工作区插件）。桌面版存储根为 `%APPDATA%\dsh-desktop\harness\storages`（`marketpilot.json`），CLI 为 `~/.dsh/storages`——两者不是同一数据库，项目 ID 不互通。

### 11.2 用户新架构决策（2026-10-08 收到，作为后续阶段约束）

DSH 是唯一 Harness；MarketPilot 保持 Cordis 业务插件；核心模型 GLM-5.3（reasoning_effort=max），优先复用 DSH 的 zai Provider；Web 前端 React、经受控 API 调 MarketPilot Service，不直接调智谱 API；不重建重复的 Agent/路由/数据库；保留 Evidence Ledger、Human Gate、WorkflowRun 规则；先验证真实模型调用与结构化输出，再做项目工作台与点击式 Workflow；离线替身的成功不代替在线验收；每阶段提交实测证据。

### 11.3 模型路由事实

- pi-ai `0.87._668e591a…` 内置 `zai` 目录：`glm-4.7`、`glm-5-turbo`、`glm-5.2`、`glm-5.2-highspeed`、**`glm-5.3`**、`glm-5.3-flash`、`glm-5.3-highspeed`（endpoint `https://api.z.ai/api/coding/paas/v4`，`thinkingFormat: zai`，`reasoningEfforts` 含 `max`）；另有 `zai-coding-cn` 目录。
- 桌面 profile `cordis.patch.yml`：`zai` 路由（`apiKeyEnv: ZAI_API_KEY`，glm-5.3 三型号）+ `okai*` 网关路由（okai.la，含 glm-5.3 系列）；`agent-default-model` = **provider `zai`、model `glm-5.3`、reasoningEffort `max`**；marketpilot 插件 `modelTimeoutMs: 600000`。
- CLI profile `~/.dsh/profiles/marketpilot` 仍是 `okai1/glm-5.3-flash` 默认、无 marketpilot 超时覆盖（保持插件默认 120s）；两套 profile 配置不一致，后续 CLI 演示需对齐。

### 11.4 10-07 超时根因与 2026-10-08 真实验收

`~/.dsh/storages/marketpilot.json` 记录 2026-10-07 两次 `requirement_analysis` 均在约 120.07 s 报 `The operation was aborted due to timeout`（`modelCalls: 1`，EXTRACT_CANDIDATES 后无进展）。根因：GLM-5.3（max effort）单次结构化抽取实测约 **181 s**，超过插件默认 `modelTimeoutMs=120000`。用户随后在桌面 profile 将其调至 600000 并切换 zai 路由，是正确修复。

2026-10-08 在本会话内独立完成的在线验收（项目「GLM-5.3 结构化输出验证」`39f8a281-1092-4d95-b6b6-17ed0259d99c`）：

| 步骤 | 结果 |
|---|---|
| `marketpilot_project_create` | 项目创建成功 |
| `marketpilot_document_import`（fixtures/calm/input/brief.md） | 文档 `bd4a2c01…`，校验和一致 |
| `marketpilot_requirement_extract`（真实 GLM-5.3，spawn 子代理 + outputSchema） | Run `9c795c27…` **waiting_human**，`modelCalls: 1`，`durationMs: 180946`，14 条 proposed/unknown 需求 + 12 条 UNKNOWN 证据 |

质量抽查：`originalText` 逐字命中源文档（工作流强校验）；未冻结参数（最小检漏率、误报率、响应时间、认证等）全部 `status: unknown` 并生成澄清问题；无编造数值。桌面存储中另有三个真实模型项目（最早 10-08 07:42，含今日 10:52 completed、10:56 waiting_human 的运行），证明该路径在 GUI 中已多次可用。结论：**架构第 9 条（GLM-5.3 真实调用 + 结构化输出）验收通过**；此前 79 项离线测试仅证明状态机与规则，不与本次在线结果混淆。

### 11.5 遗留问题（不阻塞工作台，需跟踪）

1. ~~用户桌面项目 `83fd7e7e…` 有一次失败 Run：`方案引用了不存在的证据。`~~ **2026-10-08 已根因定位并修复**：`validateSection` 的 `SOURCE_MISMATCH` 正确拦截了模型编造/抄错的证据 UUID（防护按设计工作）；根因是长 UUID 对模型不可靠。修复见 12.4（短句柄别名层），属模型输出质量问题而非校验误伤。
2. 子代理会话日志在 Run 结束后很快被清理，事后无法取证；在线问题需在运行窗口内观察。
3. `harness.log` 反复出现 `agent-registry: agent/disposed listener threw: TypeError: Cannot read properties of undefined (reading 'catch')` 与 `session-projection-cache … turn/end write … SessionHandleClosedError`（伴随子代理销毁）。属上游 Harness 噪声，不改核心，仅记录。
4. `marketpilot-input/` 目录不存在；大赛 DOCX、两份指定 CALM 调研报告、camera PDF 仍未提供（`docs/` 有两份设计文档）。DOCX/PDF 解析能力仍未实现。
5. 本机 `C:\Users\zjdzc\AppData\Local\Programs\DSH Desktop\resources\app.asar` 是安装文件而非源码 checkout；核查源码一律用工作区 `deepseek-harness/`。

### 11.6 下一阶段计划：MarketPilot 工作台（React，受控 API）

目标：在 DSH Web 客户端内提供「项目工作台 + 分步点击式 Workflow」，不新建独立前端应用。待办顺序：

1. 核查官方 Web 客户端扩展面：`packages/client/ui-*` 插件如何注册面板/路由/工具卡片（`tool.call.toolview` slot）、客户端经什么受控通道调用 Host 工具/Service（SDK / api gateway 的 session 工具调用或专用 service 暴露），以当前源码为准。
2. 设计工作台最小集：Project List → 项目详情（Requirement Review / Evidence Ledger / Alternative & Decision / Artifact 查看）+ 每个 Workflow 的分步点击执行（复用现有 Tools，不在前端内嵌业务规则）。
3. Human Gate 在 UI 中的真实交互路径（userQuestions 或受控确认 API），模型不得自证。
4. 每步仍走 guarded `ctx.tools.execute`，前端只做受控调用与展示；不直接调智谱 API、不绕过 WorkflowRun 统计。
5. 阶段验收：GUI 实测截图 + Run Summary 数据 + 测试结果 + 未解决问题清单。

## 12. 2026-10-08 工作台实施记录（架构第 10 条）

### 12.1 核查到的扩展面（源码依据，非猜测）

| 扩展点 | 事实 | 依据 |
|---|---|---|
| out-of-tree 客户端插件 | 包 `package.json` 声明 `dsh.client: { platform: 'web', inject: [...] }` 并提供 `./client` 导出；client-modules 节点半边扫描 Loader 条目自动挂载（已装 `dshmarket` 1.66.9 即此模式） | `packages/client/modules/src/index.ts`（"scans the host Loader's entries for packages declaring dsh.client"）、dshmarket 实物 |
| 浏览器 bundle 契约 | `window.__ModuleLoader__.load({ id, factory: (require) => {...} })` CJS 闭包；react/cordis/ui-primitives 走 require（模块表基线），其余内联 | `packages/client/tsdown.client.ts`、dshmarket `client/client.js` 实物 |
| 宿主 HTTP 路由 | `webServer` 服务（`@deepseek-ai/dsh-host-webserver`）`register({ kind:'exact'|'prefix', path, handler })`，dshmarket 全部 API 即挂载于此 | `packages/host/webserver/src/index.ts` |
| 无 Agent 人工问题 | `ctx.userQuestions.ask()` 不带 agent 时走**根级** `user-questions/request` waterfall（demo 脚本即用 `root.on('user-questions/request', ...)` 应答）；带 agent 时走 agent 作用域 waterfall | `packages/interaction/user-questions/src/index.ts` ask() |
| 带工具执行 | `ctx.tools.execute({ callId, name, arguments, signal, agent? })`；`ToolExecutionInput.agent?: Agent`（实时模型 spawn 需要） | `packages/core/tools/src/index.ts` L339 |
| 右侧边栏 Tab | 两段注册：`ctx.sidebarRightTabs.register({ id, kind, priority, title, guide })` + `ctx.slots.register({ name:'sidebar.right.pane.tab', key: id }, Body)`；仅在有会话时可见 | `packages/client/ui-sidebar-right/README.md` Extension seats |
| headless Agent | `ctx.agents.create({ sessionId, meta?, agentOptions?, signal?, setup })`；`setup(childCtx)` 在作用域内注册监听（spawn driver 同模式） | `packages/core/agent/src/index.ts` L63/L391 |

### 12.2 实现（marketpilot/ 新增）

**宿主半边（受控 API）：**
- `src/harness/workbench.ts` — `WorkbenchManager`：每次点击执行 = `ctx.tools.execute`（guarded pipeline、真实统计）+ 专用 headless Agent（`agents.create` 的 `setup` 内注册作用域 `user-questions/request` 监听，人工问题经 HTTP 答复，模型不得自证）；无 agents 服务时退化为根级 waterfall 匹配 `wait.callId`；插件卸载中止全部在途执行；保留最近 50 条执行记录供轮询。
- `src/harness/routes.ts` — 仅当 `webServer` 存在时挂载 `/marketpilot/api` 前缀路由：`GET tools/projects/projects/:id/summary/:id`、`GET/POST executions/:callId(/answer|/cancel)`、`POST tools`。全部 same-origin 校验（带 Origin 必须匹配 Host）、1 MiB 请求体上限、`marketpilot_*` 白名单（动态取自 `ctx.tools.schemas()`）。
- `src/harness/plugin.ts` — 挂入 manager 与 routes；headless profile（demo/测试）无 webServer 时零影响。

**客户端半边（React 工作台）：**
- `src/client/index.ts` — 客户端插件入口：zh/en 词典 + 右侧边栏 Tab 注册（`sidebarRightTabs` + `sidebar.right.pane.tab`，guide 入口）。
- `src/client/Workbench.ts` — 工作台面板：项目列表/创建 → 项目详情（文档/需求/证据/候选与决策/成果/招标条款/运行记录）+ 分步按钮（导入→抽取→确认→竞品→候选→决策→方案→招标→审查）+ 人工问题卡片（详情折叠、补充说明、确认/退回/取消）+ 1.5 s 轮询执行状态。
- `src/client/api.ts` — same-origin fetch 封装与类型。
- `tsdown.config.ts` — 按 `__ModuleLoader__` 契约输出 `client/client.js`（react 外置）；`package.json` 增加 `dsh.client` manifest、`./client` 导出、`files: client`、`build:client`。

### 12.3 验证结果（2026-10-08）

- `pnpm test`：**12 文件 / 83 测试通过**。`tests/workbench-routes.spec.ts` 4 项：读路由与白名单；人工问题轮询→退回→确认全链路；same-origin 403 / 非 marketpilot 工具 400 / 未知路径 404；**完整 CALM Golden Case 经工作台点击路径**（离线模型：4 文档 → 10 需求（6 confirmed）→ 18 证据 → 候选 → HTTP 应答确认路线 → 方案 → 招标 3 条款全 unknown → 5 成果；summary 与 calm-e2e 完全一致，两处人工门均经 `/answer` 路由完成）。
- `pnpm typecheck`、`pnpm build`（含客户端 bundle 23.1 KB）、`pnpm marketpilot:demo:smoke`（官方 Loader 加载、10 需求/18 证据/5 成果）全部通过。
- 客户端 bundle 契约核对：banner/footer、`require("react")` 外置、无 react-dom 内联。
- **未验证**：GUI 内实际点击（需重启 DSH Desktop 后在右侧边栏打开 MarketPilot Tab 实测，含真实 GLM-5.3 步骤；截至 20:55 harness 进程仍为 18:38 启动的旧实例，`/marketpilot/api/tools` 404 属预期）；带 agents 服务的 headless Agent 路径仅有代码审查与类型保障，无进程内测试（测试环境无 agent loop）。
- 已知边界：右侧边栏仅在选中会话时可见（上游设计）；轮询为 1.5 s setInterval（未做 SSE）；客户端样式为内联最小样式，未接 `--dsw-*` 主题令牌；客户端组件无自动化测试（jsdom 套件未引入），以 GUI 实测替代。

### 12.4 生成层短句柄别名（修复真实模型的 SOURCE_MISMATCH 失败）

用户桌面项目曾出现 `方案引用了不存在的证据。`（`SOURCE_MISMATCH`）：模型抄错/编造证据 UUID，一次重试仍未修复。防护本身按设计工作；根因是长 UUID 对模型不可靠。

实现（`src/workflows/handles.ts` + `domain/generation.ts` + 两个 Prompt 更新）：

- **上下文别名**：发给模型的项目上下文中 `confirmedRequirements[].id → R1…`，三个证据池 `→ E1…`，当前 Decision `→ D1`；`route` 的 `evidenceIds`/`requirementCoverage`（Record 形态）同步改写为句柄。
- **模型边界宽松 Schema**（`alternativesModelOutput`/`sectionModelOutput`）：id 字段接受任意非空字符串（句柄）；生成后先经 `resolveId` 把**已知句柄**映射回 UUID（未知字符串原样放行——模型逐字回显原 UUID 的行为保持可用）。
- **严格复验**：解析后的输出重新过 `alternativesOutput`/`sectionOutput`（UUID 格式）；编造句柄解析后仍非 UUID → 复验失败归一为 `SOURCE_MISMATCH`，保留"仅此类失败重试一次"的既有语义，其余不变量保持 fail-fast。
- Prompt（alternative-generate / solution-section）改为句柄规则：只能逐字复制上下文给出的 R#/E#/D1，不得续编号或凭记忆生成。

验证：`tests/generation.spec.ts` 新增句柄回归（模型只回 R1/D1 → 存储中是真实 UUID，prompt 确认含 `"R1"`）；既有 UUID 回显测试全部不受影响；离线 fixture（回显上下文 id）自动流经句柄并映射回，CALM E2E 与工作台场景不变。合计 **13 文件 / 85 测试**、typecheck、build、demo smoke 通过。

### 12.5 GUI 验收前最后核查（2026-10-08 晚）

- `packages/client/modules/src/index.ts` 核对：`ClientModuleRegistry` 按 **loader 条目名** 扫描 `dsh.client`（`ctx.loader.entries()` → dirty 集合），无 in-tree 白名单；link 安装与 npm 安装走同一条目解析路径，重启后 `dsh-marketpilot` 的客户端半边会被发现并经插件路由服务。
- 新增 `tests/client-bundle.spec.ts`：以 `__ModuleLoader__` 假加载器执行真实 `client/client.js`，断言注册 id、react 外置解析、`name/inject/apply` 导出、词典命名空间与 `['sidebarRightTabs','sidebarRight']` 注入声明。
- 重启后的 GUI 验收步骤、预期结果与截图清单固化在 [docs/GUI_ACCEPTANCE.md](GUI_ACCEPTANCE.md)。

### 12.6 GUI 验收第一轮（2026-10-08 23:00，重启后实测）

实测结果：

1. ✅ 新 harness 进程（20032）后 `/marketpilot/api/tools` 返回 200，23 个工具全部列出；`GET /projects` 正常；白名单防护实测生效（错误载荷被 400 + `WORKBENCH_TOOL_FORBIDDEN` 拒绝）。
2. ✅ 经工作台 API：`project_create`（项目「GUI 验收（真实 GLM-5.3）」`be8ebe99`）→ `document_import`（brief.md，doc `b69272a9`）均 completed。
3. ❌ `requirement_extract` 真实模型步骤失败（约 31 s）：`模型步骤结束：error`。**根因**（harness.log `session-error`）：headless 根 Agent 无模型路由，系统提示词 `deployment:persona-prefix` 段的 `{{model}}` 变量无法渲染，Agent 回合在首次模型请求前失败。上游事实：默认模型由**调用方**注入（headless bundle/webhook 均 `agentDefaultModel.currentSelection()` → `agentOptions`），agent 工厂不兜底；`AgentOptions` 支持 `{provider, model, reasoningEffort?, maxTokens?}`。
4. 修复：`WorkbenchManager.start` 读取 `ctx.get('agentDefaultModel')`（缺失则明确报错 `WORKBENCH_NO_MODEL`）并将 `{provider, model, reasoningEffort}` 传入 `agents.create` 的 `agentOptions`；同时经 `fs.resolve('.')/processPath` 给会话打 cwd 元数据（消除 `_no-cwd` 会话目录）。新增回归测试：假 agents/defaultModel 服务断言 agentOptions 精确等于 `{provider:'zai',model:'glm-5.3',reasoningEffort:'max'}` 且 cwd 为字符串。合计 13 文件 / **86 测试**通过。
5. 其他记录：桌面启动时 profile 迁移尝试将 `dsh-marketpilot` 转为 staged 安装失败（`ELOOP: too many symbolic links`，link 包内嵌套 node_modules 所致），桌面回滚保留 link 原样——功能不受影响，但该告警每次启动都会出现；上游 `agent/disposed listener TypeError` 噪声同前。
6. 修复后需再次重启桌面版加载新 lib。

### 12.7 GUI 验收第二轮（2026-10-08 23:23 二次重启后）——真实模型全链路通过

1. ✅ 新进程 6952；项目/文档跨重启持久化验证通过（`be8ebe99` 的 docs=1、runs=1 均在）。
2. ✅ **真实 GLM-5.3 需求抽取经工作台 headless Agent 路径成功**（Run `8bed6356`，`modelCalls: 1`，`durationMs: 139630`，状态机完整走到 `WAITING_HUMAN`）。Agent 会话带正确 cwd（不再落在 `_no-cwd`），spawn 子会话正常创建，harness.log 无 persona/`{{model}}` 报错——12.6 的修复实证有效。
3. ✅ 质量抽查：14 条需求（8 proposed + 6 unknown）+ 12 条 UNKNOWN 证据；最小检漏率/误报率/响应时间/留存周期等未冻结参数全部保留 unknown 且无编造数值；白名单/错误处理实测符合设计。
4. ✅ 客户端半边送达链路实证：boot graph 含 `dsh-marketpilot/client.js`（独立批次 `rev=eb8281ce476f`）；带 token 抓取批次 200 / 23168 B，含 MarketPilot/工作台/sidebarRightTabs 注册代码与 `__ModuleLoader__` 契约头。
5. ⏳ 待用户在 GUI 完成：右侧边栏打开「MarketPilot 工作台」Tab → 项目「GUI 验收（真实 GLM-5.3）」→ 勾选 proposed 需求 → 确认（人工问题卡片真人点击）→ 截图留证。人工确认不得由代理经 HTTP /answer 自证。

### 12.8 GUI 验收第三轮（2026-10-08 23:40）——工作台 Tab 已可见

1. ❌→✅ 用户报告侧栏空白；控制台报错 `entry.description is not a function` 定位：guide 条目契约要求 `title`/`description` 为**语言响应式函数**（`tab-registry.ts` 的 `SidebarRightGuideEntry`），此前传了字符串导致指南页渲染崩溃。修复为 `() => t('…')` 后 HMR 自动推送（rev `1795483defd0`），刷新后**用户确认已看到工作台**。
2. 教训：客户端 slot/registry 契约必须以 `packages/client/ui-sidebar-right/src/client/tab-registry.ts` 等源码为准；两轮 GUI 问题（reflect 注入、guide 函数契约）都出在我方对客户端 API 的假设上，进程内测试无法覆盖渲染层，GUI 实测不可替代。
3. **用户提出的新需求（记入待办）**：工作台 UI 目前为最小内联样式的原始形态，后续需系统性优化——接入 `--dsw-*` 主题令牌与 CSS Modules、使用 ui-primitives 组件目录、按 dsh-client-ui-ux 规范打磨（布局/加载态/错误态/表格/徽标），并对齐浅色/深色主题。不阻塞当前验收。

### 12.9 当前完成度（对照 MVP 完成定义）

MVP 定义 14 项全部达成：插件加载（桌面+CLI 实测）、未改核心、持久化（跨重启实测）、需求/人工门/证据/候选/决策/方案/招标工作流（86 项测试 + 真实模型两轮 + 工作台路由全链路回归）、无证据不判 compliant（强制单测）、CALM 可重复演示、README 可复现。收尾三件事：① 用户在 GUI 完成最后一次人工确认点击并截图（清单 4 节）；② UI 系统性优化（12.8.3）；③ 既有遗留（业务资料补齐、联网研究 provider、CLI profile 对齐、上游噪声）。
