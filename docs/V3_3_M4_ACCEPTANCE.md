# MarketPilot V3.3 M4 验收报告

## 基线与结论

2026-10-11，M4 从 `main @ a9865eedb74ec7781201b2f782e709575f5240a4` 开始，工作区干净。重读总提示词 M4、M3 验收和 `UI_V3_2_1_CLOSEOUT.md`；V3.2.1 的178项回归及真实GLM记录作为历史基线，未冒充本轮模型验收。

只读上游 DSH 为 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，保持无改动。安装的 Desktop 设置页显示 **0.2.0-rc.2**；Node v24.14.0，pnpm 11.19.0。实际宿主模型仍为 **zai / glm-5.3-flash / max**，没有修改模型、Profile 或凭据。

**M4 已实施可运行 React 与真实后端代码，并通过回归、构建、离线 CALM 和真实宿主页面验收。** 本轮未发起真实 GLM / search / fetch、未回答存量 Human Gate、未正式导出。完成后本地提交，停止等待用户验收，不进入 M5，不推送。

## 实际实现与前后交互

设计审查见 `V3_3_WORKFLOW_AUDIT.md` 第11节。保留 DSH 原生主面板、Cordis 插件、GLM Provider、StorageDomain、Evidence Ledger、Human Gate 和 SolutionWorkflow 原子提交；没有新增依赖或改动锁文件。

| 问题 | M4 的可点击行为 |
|---|---|
| 阅读卡片容易误选路线，长正文难比较 | 展开与选择分离，仅 radio 选择；摘要 / 矩阵可切换，原覆盖矩阵保留；长名称在列内换行，表格内滚动 |
| 多轮路线混在一起 | 使用真实 completed alternative Run 的 output.alternativeIds 显示批次，另有全部历史入口，存量路线不删除 |
| 人工确认缺少完整摘要 | 选路线并填写理由 → 查看 MUST full / 不足、未确认 MUST、风险、UNKNOWN、已核验引用及理由 → 提交至真实 Decision Gate；打开摘要不启动执行 |
| 摘要读完后项目可能已变 | 客户端轮询标记过期，服务端 expectedVersion 再校验；在 Gate 前拒绝 STALE_CONTEXT，在 Gate 期间变化仍拒绝 STALE_REVIEW |
| 历史方案和当前选择混淆 | 最新 / 历史方案按生成 createdAt / id 排序；历史 Decision 来自 dependencies 或相应 Run.output，不从当前 activeDecisionId 猜测 |
| 方案只是一段长正文 | 章节目录、风险 / UNKNOWN 提醒、当前台账待复核清单、正文证据列表；点击 EVD 编号直接到精确证据详情，可继续补证 |
| 补证后下游成果仍像最新 | 新成果保存服务端输入指纹，详情及列表显示 current / possibly_stale / untracked，变化时提示复核 / 重新生成，不无声覆盖原文 |
| 无招标也像必经流程 | 无可读 tender 文档明确 skipped_optional，可直接去成果或补充资料 |
| 条款筛选后选择范围不清 | 名称搜索、状态筛选、12行分页；切筛选 / 页清选择；所选只提交可见条款，全部审查仍使用全项目条款 |
| 投标矩阵导出入口不连续 | 招标页定位最新真实 compliance_matrix → 成果阅读器 → 输入新绝对路径 → 原 guarded export / Human Gate；无路径时按钮禁用 |

“MUST full”表示存储的需求响应覆盖，不是实际检测性能、设备认证或已核验合规。UNKNOWN 与未核验参数保持原义，不能支持 compliant；原领域校验、降级及人审约束完整保留。

核心代码：

- `src/client/pages/AlternativesPage.tsx`、`SolutionPage.tsx`、`TenderPage.tsx`、`ArtifactsPage.tsx`、`ProjectOverviewPage.tsx`；`components/ArtifactContextNotice.tsx`、`hooks/useDesignOverview.ts`、`api.ts`、`stores.ts`、`styles.ts`、中英文 locales。
- `src/domain/route-review.ts`、`artifact.ts`、`decision.ts`、`state.ts`；`src/services/artifact-context.ts`、`design-overview.ts`、`artifact.ts`、`decision.ts` 及现有生成 / 需求 / 研究 / 招标保存事务。
- `src/harness/service.ts`、`routes.ts` 只读 `/projects/:id/design`；`src/tools/project.ts` 的兼容 optional expectedVersion。
- 新增 `tests/design-v33.spec.ts`、`design-client-v33.spec.tsx`、`design-client-fixture.ts`；旧 phase3 / phase4 / V3.3 工作流测试夹具接入新只读契约，没有删除旧回归。
- `scripts/acceptance-v33-m4.mjs`、本报告、工作流审查补充及截图 / facts。

## 真实后端与数据兼容

`/design` 在一个 repository revision 中返回路线、需求、证据、Decision、招标条款、成果元数据及 context、最小 Run、资料元数据和永久编号；资料正文 / 成果正文仍按需读取。`useDesignOverview` 每3秒轮询，防请求重叠及卸载后响应污染，校验项目归属，失败显式报错并禁用写操作。页面没有假进度或本地伪完成状态。

新 optional `Artifact.dependencies` 是服务端拥有的版本1指纹：requirementsVersion / decisionVersion / sourcesVersion 为 SHA256，另含生成时 decisionId。对象键和记录集合排序后计算，排除成果、codeBook、Run telemetry、project.status / updatedAt；包括需求、人工 Decision、资料、非 DECISION 证据、研究以及适用的路线 / 招标条款。原子保存中捕获；单次只读投影按成果类型缓存当前指纹，避免每个历史版本重复 hash 大正文。

旧记录缺少快照如实 untracked，不迁移、不推测、不回填；手动编辑无法证明原生成上下文，变为 untracked。新成果输入不同则 possibly_stale，显示变化范围和返回复核入口。该状态不会自动覆盖正文、删除数据、撤销人工决策或把 approved 猜成已导出。指纹用于变化检测，并不是可重放的完整旧输入副本。

UUID、codeBook、资料原文、时间戳和历史成果保留。新代码可读旧项目，但 M3 旧 strict schema 无法读取新增 dependencies；回退 UI 时必须保留新字段读取契约，先做数据备份，不能通过删字段或覆盖存量快照回退。

## 测试记录

命令均在仓库根执行。pnpm 11 对本地链接依赖的非 TTY 预检可能尝试重装；仅用 `--config.verify-deps-before-run=false` 命令参数关闭该预检，未改配置、依赖或锁文件。

| 命令 | 结果 |
|---|---|
| `pnpm --config.verify-deps-before-run=false typecheck` | 最终代码通过 |
| `pnpm --config.verify-deps-before-run=false test` | **32文件 / 249测试全部通过**；M3基线236 + 本轮13，保留V3.2.1及后续回归 |
| `pnpm --config.verify-deps-before-run=false build` | 最终代码通过；客户端382.19kB，gzip78.61kB |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/client-bundle.spec.ts` | 最终构建后5/5通过，宿主模块冻结契约保持 |
| `pnpm --config.verify-deps-before-run=false marketpilot:demo:smoke` | 官方Cordis Loader + SQLite + guarded tools全链通过；隔离演示数据库；**离线模型、模拟人工**；4资料 / 10需求 / 18证据 / 5成果、12次离线adapter调用 |
| `node scripts/acceptance-v33.mjs --check-idle` | 官方重启前0活动工作台执行 / live gate |
| `node scripts/acceptance-v33-m4.mjs` | 最终15张托管截图；0页面异常 / 新execution，两个存量项目完整detail哈希不变 |
| `git diff --check` | 通过 |

新增测试证明：真实SolutionWorkflow原子捕获依赖、审批和telemetry不伪失效、需求 / 证据变化标记、旧正文及永久编号不漂移、新Decision与历史版本分别关联、旧数据缺口 / 伪造依赖拒绝、Gate前与Gate期间输入变化拒绝、MUST覆盖与已核验来源区分、展开 / 选择 / 摘要 / 提交分离、防快速重复提交、轮询变化阻断摘要、跨项目及读失败拒绝、按生成时间排序、重复标题目录与正文来源跳转、当前UNKNOWN提示、可选招标 / 过滤选择 / 全部审查、符合性成果定位和原受控导出。

现有CALM HTTP、未confirmed不可生成路线、无人工Decision不可生成方案、无verified FACT / SOURCE不可compliant、取消 / 人工门 / 过期上下文 / null-codeBook / 编号 / 跨项目等回归全部保持。离线smoke证明持久化闭环，不代表真实GLM质量或真实人工授权。最后一次production改动只修表头换行，随后完整typecheck / test / build及bundle检查通过。

## 真实 GUI 与截图

使用已安装DSH Desktop的真实后端、原生主面板和React代码。CDP控制该宿主托管页面，未注入fixture、未用mock server或jsdom替代；原生窗口另用computer-use观察、点击并截图。托管截图视口分别为1440×900、1366×768、1024×768，矩阵内部滚动，页面无横向溢出。浅色 / 深色已验收并恢复浅色。

项目为现存 **V3.3 M1 GUI 空项目 · synthetic QA（revision 0）** 和 **CALM 漏油监测桌面版演示（revision 157）**。CALM有3条真实存储路线，当前B已选；只预览候选A，MUST覆盖与真实后端对账为 **7 / 10 full**，未提交Gate。存量5份成果均生成于依赖字段之前，准确显示 untracked；方案正文38个引用可追溯，点击待核验 **EVD-13** 到证据详情；投标导出入口准确定位 **ART-03** 符合性矩阵。

新快照 / 过期状态 / 多版本切换 / 真实受控写入由服务端与React回归、隔离离线smoke证明；本轮Desktop没有创建新成果，不能宣称Desktop已生成新dependencies或已正式导出。旧模板保持原文，历史符合性正文中的空列或旧内嵌编号不擅自补全。

截图目录 `docs/gui-acceptance/v3.3-m4/`；事实为 `m4-facts.json` 与 `m4-native-facts.json`。

| 文件 | 尺寸 / 场景 |
|---|---|
| m4-empty-routes-light-1440.png | 1440×900，未confirmed禁止生成候选 |
| m4-empty-solution-light-1440.png | 1440×900，无人工Decision禁止生成方案 |
| m4-optional-tender-light-1440.png | 1440×900，无tender的可选分支 |
| m4-optional-tender-dark-1024.png | 1024×768，深色可选空态 |
| m4-calm-summary-light-1440.png | 1440×900，候选摘要 / 展开卡 |
| m4-calm-matrix-light-1366.png | 1366×768，路线矩阵 |
| m4-calm-matrix-dark-1024.png | 1024×768，深色矩阵 / 长表头换行 |
| m4-calm-decision-preview-light-1440.png | 1440×900，MUST不足 / 风险 / 人工理由摘要 |
| m4-calm-solution-versions-light-1440.png | 1440×900，版本与历史依赖缺口 |
| m4-calm-solution-reader-light-1440.png | 1440×900，方案 / 目录 / 当前补证 / 来源 |
| m4-calm-solution-reader-light-1366.png | 1366×768，方案阅读 |
| m4-calm-solution-reader-dark-1024.png | 1024×768，深色阅读器 |
| m4-solution-to-evidence-light-1440.png | 1440×900，精确EVD-13详情 |
| m4-calm-tender-light-1440.png | 1440×900，真实条款筛选 / 审查入口 |
| m4-compliance-export-reader-light-1440.png | 1440×900，ART-03与受控导出入口 |
| m4-native-desktop-matrix-2560.png | 原生2560×1392窗口，DSH主面板与路线矩阵 |

脚本对两个项目完整detail前后SHA256、execution callId集合、页面异常和溢出作断言；结果存量不变、0新执行 / 模型调用。Session token仅在脚本内存读取，未进入facts、报告或截图。原生只执行导航、视图和主题操作，未改业务数据、提交门或发送消息。

GUI脚本早期把导航称作“投标符合性”，已改实际“06 投标检查”；在阅读器打开时设置关闭定位命中了阅读器，已改为切主题前关闭阅读器、切完重开。两项属于验收脚本修复，未计作应用页面异常。原生视觉复核额外发现长路线表头重叠，已修限定矩阵表头换行，重建后复验。

## 已解决与剩余边界

已解决：路线对比 / 批次 / 人工摘要 / 防过期提交，方案版本 / 目录 / 历史Decision / 正文引用 / 补证跳转，成果依赖提示，可选招标 / 审查范围 / 矩阵定位导出，真实状态刷新及失败提示，长表头布局。

剩余：

- 本轮未验证真实GLM对M3新增字段的提取质量及M4完整点击生成质量；当前真实路由名称glm-5.3-flash/max，真实调用以M5记录为准。
- 官方search/fetch仍 `available=false, mode=unverified`，没有在线URL / 日期 / 原文验收，不宣称线上研究完成，不加SDK / 代理 / 绕行。
- 解析仍为UTF-8 `.md/.txt`；没有提纲确认、单章重新生成或SolutionWorkflow大规模拆分。
- 历史成果缺少完整旧输入快照，只能untracked；输入指纹是保守变化提示，不能独立证明方案有效、参数真实或认证合规。
- 旧符合性模板阅读忠实保留存档，个别旧内嵌编号或表格空列须人工结合正文复核；后续新生成质量与历史显示保真列入M5。
- 导出路径持久化历史仍为既有缺口；本轮只验证准确入口和Gate契约，没有实际正式导出；3秒轮询适用于当前本地工作台规模。

## M5 建议与停止点

用户验收M4后再进入M5：完成空项目 / 需求项目 / 完整CALM、无provider、模型失败、超时 / 取消 / 人工中断、重复点击、重载、null-codeBook、superseded等待、跨项目和方案历史版本的全局回归；按三种视口 / 两种主题验证真实GUI。至少执行一条官方路径真实GLM-5.3/max关键工作流，保留耗时、调用数、人工等待、失败 / 重试及成果位置；对新的依赖状态与人工导出作真实持久化对账。

再修订 `DEMO_SCRIPT.md`，用预备审核样例和一个可控节点完成不超过10分钟的演示，形成 `V3_3_FINAL_ACCEPTANCE.md` 与上线 / 回退指引。联网能力若仍不可证明，继续作为明确阻断项。**本轮停在M4，本地提交后等待验收。**
