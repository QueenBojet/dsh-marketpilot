# MarketPilot V3.3 — M2 实施与验收记录

日期：2026-10-11（Asia/Shanghai）。**M2 实施完成，停止在 M2，等待用户验收。**本轮承接用户“继续后续的工作”，只实施提示词中的需求/证据闭环；M3—M5 尚未实施。

## 1. 基线与范围

- 本轮开始：本地 `main @ 9031521aa62554d1164254d0077024b10a46e593`，工作区干净。这是已交付的 M0/M1 提交，比提示词的 `510caa0f` 前移一轮。
- 开始时复跑 M1 基线：26 文件 / 209 测试通过。V3.2.1 的 178 测试和历史 GLM 在线验收继续保留；历史记录见 [UI_V3_2_1_CLOSEOUT.md](UI_V3_2_1_CLOSEOUT.md)，不作为本轮在线复验。
- 相邻只读 DSH：`5badb15009ae1756c3afe0ae0cef1faafc290ccc`，结束检查时仍未修改；Node v24.14.0、pnpm 11.19.0。
- 保留原生全宽主面板、Cordis、StorageDomain、UUID/codeBook、Evidence Ledger、模型 Provider、Human/Decision Gate 和 Solution 原子事务。没有依赖新增、数据库迁移、存量数据删除、模型配置修改或推送。
- GUI 使用原有空 QA 项目和两个原有 CALM 项目。仅做导航、选择、筛选、阅读与展开；没有确认存量需求、核验证据或生成新成果。

## 2. M2 工作流设计审查结论

M0/M1 总体设计见 [V3_3_WORKFLOW_AUDIT.md](V3_3_WORKFLOW_AUDIT.md)。M2 采用同一项目聚合状态的只读审阅投影，不建立第二份业务状态。

| 关键约束 | 实施决定与源码 |
|---|---|
| 本批确认不能猜 runId | `projectReviewOverview` 从真实 Run.output.requirementIds 得到批次；默认选最新可恢复等待；`RequirementsPage.confirmSelected` 只提交所选批次、当前页、proposed 的交集 |
| 历史等待不可当作 Gate | 复用 `markSupersededWaits`；全部批次及 superseded 批次只读。后台工具继续验证 projectId/runId/requirementIds 归属 |
| 筛选后的选择范围透明 | 25 条需求/页，MUST/SHOULD/COULD、状态、正文/编号搜索、批次筛选；显示当前页/筛选结果/选中数；切换批次、筛选、搜索或页码清空选择 |
| UNKNOWN 不能假消除 | `evidenceReviewGroup` 将活跃 UNKNOWN（包括已人工核验且仍为 UNKNOWN）归入需补证；rejected/superseded 独立显示，不能计入已核验事实组 |
| 补证不能覆盖旧成果 | 聚合 UNKNOWN 与未完成投标条款，按来源关联需求/证据；提供补资料、继续本地研究、对应工作区入口。时间戳仅表示可能影响，旧 Decision/Artifact 原样保留 |
| 状态变化应自动刷新 | `useProjectReview` 每 3 秒读取真实 revision；变化后刷新文档、需求、证据和已打开详情；同一页选择不因普通轮询丢失。筛选请求序号拒绝晚到响应 |
| 失败不能伪装空数据 | 审阅/列表错误明确显示；需求确认与证据核验禁用；文档/需求读取失败不渲染假 0 或正常空态；明示详情定位失败 |
| 来源是数据，不是指令 | 单文档正文 API 按项目绑定；前端按需加载并验证结构，以 `<pre>` 原样显示；不执行上传文本、不解析其 HTML |

投影 API：`GET /marketpilot/api/projects/:id/review`，包含 revision、批次、行动组计数、永久短编号、关联链接、补证清单及只读影响记录。`GET /projects/:id/documents/:docId` 仅返回该项目指定文档的元信息与正文。原列表增加 runId/priority/review 过滤，不修改持久化实体。

所有确认/核验仍调用 `executionStore.start` 和原 guarded Tool。局部确认成功不等于批次基线已生成：只有返回的真实 Run.status 为 completed 才显示“基线已生成”，否则提示剩余待审项。

新增真实 Harness 回归抓获了取消状态问题：DSH 将取消的 Human Gate 包装成 `isError` 返回，工作台原先显示 failed。`WorkbenchManager.drive` 仅对已 abort 的错误返回改为 cancelled；没有改变审核授权或写事务。

## 3. 实际修改代码及前后交互

| 文件/模块 | 改动 |
|---|---|
| `src/domain/project-review.ts`、`src/harness/service.ts` | 原子只读审阅快照；真实批次、补证分类、codeBook、时间戳影响 |
| `src/harness/routes.ts`、`src/client/api.ts` | 审阅/来源正文 API；需求批次与优先级过滤、编号/原文搜索、证据行动组与分页 |
| `src/client/hooks/useProjectReview.ts`、`useExecution.ts`、`usePhase4.ts` | revision 轮询、同项目刷新、过期响应保护、明确错误恢复 |
| `RequirementsPage.tsx`、`RequirementTable.tsx` | 上传/选择、提取、批次审阅、补证分区；正确确认范围；历史只读；分页与选择清空 |
| `EvidencePage.tsx` | 行动分组、计数、分页、补证/影响列表；过滤外详情定位；失败时禁核验；仍需明确选择核验目标 |
| `ReviewSupport.tsx`、`SourceDrawer.tsx` | 来源原文、永久编号的补证链接、需求↔证据跳转、下游影响提示；补充来源返回展开的上传区 |
| `ProjectOverviewPage.tsx`、`locales.ts`、`styles.ts` | 将原导航动作传给需求页；中英文业务文案、COULD、宿主主题样式 |
| `src/harness/workbench.ts` | 修正已取消 Human Gate 的错误返回状态 |
| `tests/project-review.spec.ts`、`v33-review-client.spec.tsx` | 新增领域及点击回归；旧 routes/client 测试补充真实 API 契约与 Human Gate 断言 |
| `scripts/acceptance-v33-m2.mjs` | 可重复的真实 Desktop 托管页面验收，不注入数据或调用模型 |

以前需求页隐式依赖最新 waiting run，列表可能混入其它批次；现在批次可见且确认范围受限。以前证据主要按实体 status/kind 找记录；现在首先显示人工行动组，UNKNOWN 有明确补证入口。以前只看到来源名/位置；现在可查看完整原文、跳对应需求，再返回相关证据。以前审核后依赖重载；现在读取真实 revision 更新，详情仍绑定原记录。

## 4. 验证记录

最终源码 typecheck/test/build 于本地时间 **13:25** 完成；构建后的客户端注册回归通过；CALM 离线 smoke 于 **13:15** 完成。所有测试保留，没有删旧测试换取全绿。

```powershell
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false test
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false exec vitest run tests/client-bundle.spec.ts
pnpm --config.verify-deps-before-run=false marketpilot:demo:smoke
node scripts/acceptance-v33.mjs --check-idle
node scripts/acceptance-v33-m2.mjs
git -c core.autocrlf=false diff --check
```

`--config.verify-deps-before-run=false` 沿用 M1：绕开 pnpm 11 对本环境相邻 link 依赖的非 TTY 自动重装预检，运行的仍是原项目脚本；未修改依赖或 pnpm 配置。

| 检查 | 实际结果 |
|---|---|
| typecheck | `tsc --noEmit` 成功 |
| tests | **28 文件 / 224 项全部通过**；在 209 的 M1 基线上新增 15 项 |
| build | TypeScript + tsdown 成功；client.js **324.09 kB / gzip 65.91 kB** |
| 构建后注册回归 | 5/5，原主面板/侧栏/冻结模块白名单继续可加载 |
| CALM smoke | 官方 Cordis Loader、SQLite、guarded Tools；4 文档、10 需求、18 证据、10 UNKNOWN、5 成果、12 次离线 fixture 模型调用 |
| GUI | **12 张最终 CDP 页面截图 + 1 张原生窗口截图**；3 组后端/交互检查、0 页面异常、0 新执行/真实模型调用 |
| 数据保护 | GUI 前后三个项目详情快照 SHA-256 相等，宿主 execution callIds 相等 |

15 项新增：3 个投影测试、9 个 React 测试、1 个两批真实提取/HTTP 测试、2 个 UNKNOWN/REJECT 真 Human Gate 取消/确认测试。覆盖两批不串 runId、跨项目拒绝、分页/筛选清空、来源正文、过滤外定位、详情随 revision 更新、读取失败恢复、晚到响应、局部确认不假报基线完成、UNKNOWN 保持/拒绝不变 FACT。Human Gate 路由测试使用官方组件和独立 SQLite 测试库；模型提取为明确的离线 fixture。

Node 24 的 SQLite ExperimentalWarning 不导致失败。离线模型和测试人工确认不代表新一轮真实 GLM 生成或生产人工授权。

## 5. 真实 GUI 与截图

已启动安装版 DSH Desktop，从原生侧栏入口打开 MarketPilot 全宽主面板。主矩阵由 Chrome CDP 访问该 Desktop 实际托管页面，加载真实后端和插件；没有 mocked API。原生窗口额外截图证明壳层与原主面板保留。会话 token 仅在内存使用，不写入截图/JSON/日志。

重启前检查无 live Workbench execution/Gate。曾发现新 Desktop 还未就绪时脚本可能使用日志中的上一代端点；加入最终 recordCodes 契约断言，待新宿主就绪后重跑，目录中保留的是最后通过的截图。

事实文件：[m2-facts.json](gui-acceptance/v3.3-m2/m2-facts.json)。CALM 待审项目真实批次 23 条（16 proposed、7 unknown）；成熟项目 revision 157，28 需补证、10 已核验、31 行动项、6 决策/成果影响记录。来源原文逐字等于正文 API，跨模块往返仍为同项目；没有全页水平溢出。

| 截图（目录 `docs/gui-acceptance/v3.3-m2/`） | 尺寸/验证范围 |
|---|---|
| [m2-empty-inputs-light-1440.png](gui-acceptance/v3.3-m2/m2-empty-inputs-light-1440.png) | 1440×900，空项目输入/禁确认 |
| [m2-empty-inputs-dark-1024.png](gui-acceptance/v3.3-m2/m2-empty-inputs-dark-1024.png) | 1024×768，空项目深色 |
| [m2-waiting-batch-light-1440.png](gui-acceptance/v3.3-m2/m2-waiting-batch-light-1440.png) | 1440×900，真实待审批次/范围 |
| [m2-priority-selection-cleared-1024.png](gui-acceptance/v3.3-m2/m2-priority-selection-cleared-1024.png) | 1024×768，优先级改变后清选择 |
| [m2-calm-needs-support-light-1440.png](gui-acceptance/v3.3-m2/m2-calm-needs-support-light-1440.png) | 1440×900，CALM 补证组 |
| [m2-calm-needs-support-light-1024.png](gui-acceptance/v3.3-m2/m2-calm-needs-support-light-1024.png) | 1024×768，紧凑导航/浅色 |
| [m2-calm-needs-support-dark-1024.png](gui-acceptance/v3.3-m2/m2-calm-needs-support-dark-1024.png) | 1024×768，补证/深色 |
| [m2-calm-backlog-1366.png](gui-acceptance/v3.3-m2/m2-calm-backlog-1366.png) | 1366×768，行动清单与永久短编号 |
| [m2-evidence-source-light-1440.png](gui-acceptance/v3.3-m2/m2-evidence-source-light-1440.png) | 1440×900，来源原文与对应需求 |
| [m2-evidence-to-requirement-1440.png](gui-acceptance/v3.3-m2/m2-evidence-to-requirement-1440.png) | 1440×900，证据到需求详情 |
| [m2-add-source-return-1440.png](gui-acceptance/v3.3-m2/m2-add-source-return-1440.png) | 1440×900，返回展开的上传区 |
| [m2-downstream-impact-1440.png](gui-acceptance/v3.3-m2/m2-downstream-impact-1440.png) | 1440×900，旧决策/成果只读影响 |
| [m2-native-desktop-panel.png](gui-acceptance/v3.3-m2/m2-native-desktop-panel.png) | 2560×1392，原生 Desktop 主面板入口 |

GUI 未直接执行两批确认、分页写审核、取消 Gate 或模拟网络故障；这些由 React 和真实路由回归覆盖，不为截图改写存量 CALM 或消耗模型额度。

## 6. 已解决、边界与 M3 建议

已解决：需求批次/确认范围不够透明；历史等待易被误用；筛选/分页提交隐藏行；来源原文缺少入口；UNKNOWN 核验与补证混淆；补证清单缺少跨模块跳转；详情轮询后陈旧；读取失败被当作空态；取消审核被报 failed；局部确认假称完整基线生成。

仍有边界：

1. 模型维持当前宿主 **zai / glm-5.3-flash / max**。V3.2.1 的 glm-5.3/max 在线记录是历史验收；本轮没有改配置或重新调用真实模型。
2. 官方联网 Provider 仍未确认可用，M1 capability 为 unverified。本轮仅提供继续本地资料研究，不增加搜索 SDK 或绕行网络请求。
3. 仅支持 UTF-8 `.md/.txt`；PDF/DOCX 解析未实施。
4. 下游提示使用 updatedAt/createdAt；旧成果缺少完整依赖版本，不能证明精确因果或自动使旧结果失效。按钮进入对应工作区，具体成果版本仍从原版本列表选择。
5. 补证清单聚合活跃 UNKNOWN 和未完成 tender 条款，尚不抽取方案正文中的任意问题，也不自动找补证材料。大规模项目仍需后续服务器分页和投影缓存评估。
6. 3 秒轮询有短暂同步延迟；本轮不改宿主事件协议。已打开不可变来源按需读取，不做文档解析/定位高亮。

M3 建议：先核查官方 DSH search/fetch Provider；优先完成本地竞品/政策研究的资料、目的、执行、结果结构和同口径参数对照。在线能力可用时，再按官方 Tool 路径保留来源 URL/日期/原文引用。参数条件/单位不一致和法规版本待核验应显式展示；沿用本轮补证链接与 UNKNOWN 闸门。联网未就绪应作为清晰阻断项，不能声明线上研究完成。

**本轮到此停止。代码与报告提交本地，未推送；等待 M2 验收后再执行 M3。**
