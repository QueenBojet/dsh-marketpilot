# MarketPilot V3.3 M3 验收报告

## 基线与结论

2026-10-11，M3 从 `main @ d1ebb325da66f7b2a842cda23d4eb6181c6448d8` 开始，执行前工作区干净。重新阅读总提示词 M3、M2 验收及 `UI_V3_2_1_CLOSEOUT.md`；历史 V3.2.1 的 178 项回归与 GLM-5.3/max 验收属于历史证据，不计作本轮在线复验。

只读上游 DSH 为 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，结束时无上游修改。Node v24.14.0，pnpm 11.19.0。实际 Desktop 注册模型为 **zai / glm-5.3-flash / max**，未修改模型或 Profile。

**M3 本地研究中心代码、回归和真实宿主页面验收通过；在线研究仍为 blocker / unverified。** 本轮没有真实 GLM 或 search/fetch 调用。完成 M3 后停止，不实施 M4。

## 设计审查与实际实现

设计复核详见 `V3_3_WORKFLOW_AUDIT.md` 第 10 节。沿用 DSH 原生全宽主面板、Cordis 插件、Provider、StorageDomain 和受控工具，没有新增依赖、路由框架、模型 SDK 或前端直连模型。

| 问题 | 本轮实际改动 |
|---|---|
| 两种研究能力混淆 | 本地文档分析和在线搜索研究两个可点击入口；在线以真实 capability reason 说明阻断，并可返回本地资料研究 |
| 输入范围不清楚 | 资料 kind 筛选、名称搜索、仅提交可见所选资料；切换筛选/方向清空选择，无正文资料不能选择；复用已有上传入口 |
| 研究目的只是页面文本 | purpose 可选、最多2000字符，传给原提取工具，写入真实 Run.input 和模型提示词；历史缺失目的如实说明 |
| 两路任务串状态 | competitor/policy 独立 workflow hook、状态表面和历史输入；在同一页面串行启动，防止并发写入造成过期上下文；快速重复点击只提交一次 |
| 结果缺少查询 | 竞品/政策搜索和每页12行分页；保留性能 UNKNOWN、技术、限制、接口、认证、案例、优势及政策全部条款详情 |
| 参数数值口径混用 | 2–4准确型号选择与矩阵；新增可选 unit/conditions/evidenceId，原文校验后保存。不同口径分行，缺失值 UNKNOWN；同口径须至少两个有效的本型号引用，不换算、不排名 |
| 合成数据可能误认真实 | 来源文件带 synthetic/合成/演示标识时，竞品列表和矩阵明确显示演示提示，原文也完整保留 |
| 政策范围提取缺口 | scope 加入真实提取；发行方/文号/版本/范围逐字校验，强制/推荐要求原文标示。版本及现行效力始终待核验，不认定法律效力或工程合规 |
| 来源只是短 UUID | 永久 EVD 编号、SOURCE/UNKNOWN 及真实核验状态、位置、来源名称、导入日期、引用原文；按需加载原始文档；一键跳到 EvidencePage 精确详情或补充来源 |
| 切页后结果需手动刷新 | 新只读 `/projects/:id/research` 返回同一 revision 的结果、来源、Run、codeBook 投影；3秒轮询，项目归属校验，失败显示明确错误 |

核心修改：

- `src/client/pages/ResearchPage.tsx`、`components/ResearchResults.tsx`、`hooks/useResearchOverview.ts`、`api.ts`、`locales.ts`、`styles.ts`、`pages/ProjectOverviewPage.tsx`。
- `src/domain/research-review.ts`、`research.ts`、`research-analysis.ts`、`state.ts`。
- `src/workflows/research.ts`、`src/tools/research.ts`、`src/services/research.ts`、`src/harness/service.ts`、`routes.ts` 及两份提取提示词。
- 新增 `tests/research-v33.spec.ts`、`research-client-v33.spec.tsx`；原 phase4 客户端/路由测试更新到真实新快照契约，没有删除旧回归。
- `scripts/acceptance-v33-m3.mjs` 与本报告、审查补充、截图和 facts。

旧项目、新 optional 字段、永久 UUID/codeBook、SOURCE/UNKNOWN 与 Human/Decision Gate 保留；`businessVersion`/`STALE_CONTEXT` 和原子保存保留。补证不会自动改写已有 Decision 或 Artifact，SolutionWorkflow 事务未拆分。

## 官方联网能力复核

上游 `packages/web/web/src/index.ts` 的 WebRuntime 只有公开的注册与执行接口；search/fetch 注册表、所选 Provider ID 和 resolveProvider 都是私有实现。官方 base Profile 的缺省路由为 deepseek-official / http，但注册 Web、配置缺省路由或设置页的凭据 configured 标志均不能证明当前宿主实际可用。运行时真实投影为 `available=false, mode=unverified`。

现有 `marketpilot_research_search` → `HarnessResearch.search` → 官方 `web.search/web.fetch` → `ResearchService.importSearch` 保留。既有导入服务已保存真实正文、URL、importedAt 与未核验 SOURCE，因此本轮无需另造网页导入接口。适配器会拒绝非2xx和截断正文，搜索摘要不会被替换为事实。本轮不执行未验证的在线操作，也不添加 SDK、代理或 HTTP 绕行。

后续须由官方宿主提供可靠的只读 search/fetch 可用性接口，或单独完成合法官方路径的真实能力验证；再实现研究问题、抓取状态、来源确认列表及1–2公开来源测试。**目前没有在线来源 URL/日期/原文验收，不能标为线上研究完成。**

## 测试记录

所有命令在仓库根运行。pnpm 11 对已有本地链接会在非 TTY 执行前触发依赖重装预检；仅以命令行 `--config.verify-deps-before-run=false` 关闭此预检，未修改依赖、lock 或配置。

| 命令 | 结果 |
|---|---|
| `pnpm --config.verify-deps-before-run=false typecheck` | 通过 |
| `pnpm --config.verify-deps-before-run=false test` | **30文件 / 236测试全部通过**（M2基线224 + 本轮12） |
| `pnpm --config.verify-deps-before-run=false build` | 通过；客户端348.08kB，gzip72.30kB |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/client-bundle.spec.ts` | 最终构建后5/5通过 |
| `pnpm --config.verify-deps-before-run=false marketpilot:demo:smoke` | 官方 Cordis Loader + SQLite + guarded tools 全链通过；独立演示数据库；**离线模型、模拟人工**；4资料/10需求/18证据/5成果，12次离线 adapter调用 |
| `node scripts/acceptance-v33.mjs --check-idle` | 重启前0活动工作台任务或 live gate |
| `node scripts/acceptance-v33-m3.mjs` | 最终12张截图，0页面异常，0新 execution，存量快照哈希不变 |
| `git diff --check` | 通过 |

新增证明：目的进入提示词和Run、确切引用/单位/条件、口径分行、旧记录缺口、缺失值 UNKNOWN、拒绝编造条件及原子不落库、拒绝输入变化与跨项目文档、政策元数据/强制性无原文拒绝、既有 CALM fixtures 本地提取与投影、拒绝驳回/错产品/摘要引用的同口径声明、筛选清空选择、目的提交、方向隔离、四产品上限、原文按字面渲染及跨模块跳转、在线阻断、跨项目快照拒绝、快速重复点击防重复。

测试修复过程：新测试的文件路径误指向不存在的 examples，已改为既有 fixtures/calm/input；React工具调用夹具修正为原 `/tools {name,args}` 契约；泛型 mock 的 typecheck 问题改为明确类型的捕获 adapter。最终上述验证全绿。

## 真实 GUI 与截图

真实安装的 DSH Desktop 已运行，新后端以 `/research` 最终契约断言确认加载。矩阵截图来自现存 **CALM 漏油监测桌面版演示，revision 157，DemoVendor / DEMO-A、DEMO-B**：旧记录没有测试条件/单位，因此显示 UNKNOWN，未伪造性能。该项目无政策记录，政策 GUI 验证诚实空态和真实历史；有条款的政策详情由 React 与真实服务测试覆盖，不假称 Desktop 已验证政策数据。

12张托管页面截图加1张原生窗口截图位于 `docs/gui-acceptance/v3.3-m3/`，事实见 `m3-facts.json` 与 `m3-native-facts.json`。CDP控制的是真实 Desktop 托管页面、真实后端和React，不是 jsdom 或 mock server；屏幕尺寸是浏览器视口，原生窗口另行观察和截图。矩阵在1024使用表格内部横向滚动，页面没有横向溢出。

| 文件 | 视口 |
|---|---|
| m3-empty-local-light-1440.png | 1440×900 |
| m3-empty-local-dark-1024.png | 1024×768 |
| m3-online-blocker-1440.png | 1440×900 |
| m3-calm-local-light-1440.png | 1440×900 |
| m3-calm-local-light-1024.png | 1024×768 |
| m3-calm-matrix-light-1440.png | 1440×900 |
| m3-calm-matrix-light-1366.png | 1366×768 |
| m3-calm-matrix-dark-1024.png | 1024×768 |
| m3-calm-source-drawer-1440.png | 1440×900 |
| m3-research-to-evidence-1440.png | 1440×900 |
| m3-calm-policy-light-1440.png | 1440×900 |
| m3-policy-history-1366.png | 1366×768 |
| m3-native-desktop-research-2560.png | 原生2560×1392窗口 |

存量空项目/CALM读取前后的完整 project detail 哈希一致，execution ID 列表一致；主题恢复浅色；所有来源正文与后端逐字对账。Session token 只在脚本内存读取，未进入报告、facts或截图。

GUI首次在重启后过早读取旧代 endpoint，等待 Desktop shell 超时；宿主就绪后重跑通过。原生窗口加载时布局发生变化，computer-use 报 bounds changed，重新观察后继续；这些不记为应用页面异常。未发送故障报告，也未修改或删除存量资料。

## 已解决、剩余问题和回退边界

本地研究输入、目的、任务隔离、结果查询、准确型号对照、政策范围/元数据、原文追溯、永久编号跳转和补证路径已实现。网络真实能力尚未验证；本轮未验证真实模型对新增可选字段的提取质量，需要M5真实GLM验收。

旧数据未保存参数口径时不可直接作数值比较，须补齐来源后再提取；逐字同口径仍不证明实验本身可靠。政策字符串校验不替代现行版本、适用性、法务/认证审核。资料解析仍为UTF-8 `.md/.txt`，未扩展PDF/DOCX。

新增字段为向后兼容读旧项目；M3已写新 parameterContexts 的数据，M2旧 strict schema不认识它。若回退UI，保留M3字段读取契约，先备份，不能删除参数证据或通过覆盖存量快照回退。3秒快照轮询及来源列表适用于当前本地项目规模，大项目可后续做服务端分页/事件订阅。

## M4 实施建议与停止点

验收M3后，再优先实施路线摘要/矩阵切换与真实 Decision Gate 决策摘要，展示MUST覆盖、风险、未确认条件及人工理由；然后完善方案目录、历史版本、证据跳转和过期提示；招标保持可选，未核验参数不能构成 compliant。

保持 SolutionWorkflow 的版本约束和完整写入事务，提纲确认/单章重生成须独立持久化设计。联网阻断应单独完成官方能力验证；不以M4页面优化名义绕行。**当前停止于M3，等待用户验收。**
