# MarketPilot V3.3 — M1 实施与验收记录

日期：2026-10-11（Asia/Shanghai）。状态：**M0 + M1 实施完成，提交用户验收；停止在 M1**。M2—M5 未实施。真实生成失败的 GUI 截图尚缺，不能据此宣称完整场景验收通过。

## 1. 基线与数据保护

- 开始前重新核对：`main @ 510caa0f35932642a13c6a6d0ab2dbe22c9c8d22`，工作区干净；V3.2.1 基线实测 23 文件 / 178 个测试通过。
- 相邻只读 DSH 为 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`；交付检查时仍为此 HEAD，工作区干净。
- Node v24.14.0，pnpm 11.19.0。先阅读 V3.3 提示词、V3.2.1 结项和已有工作区/演示文档；设计审查见 [V3_3_WORKFLOW_AUDIT.md](V3_3_WORKFLOW_AUDIT.md)。
- 保留原生 `main[key=marketpilot]`、Cordis 注册、模型 Provider、StorageDomain、UUID/codeBook、Evidence Ledger、Human/Decision Gate、Solution 原子事务与版本约束。无新增依赖、数据库迁移或存量数据删除。
- GUI 只创建/复用一个命名为 `V3.3 M1 GUI 空项目 · synthetic QA` 的空项目；存量 CALM 和 V3P2 项目只读。离线 smoke 使用独立测试数据库和输出目录。
- 代码与验收资料提交本地；未推送或发布。构建产物继续遵循仓库已有 ignore 和构建方式。

## 2. 实际代码与点击流程

| 模块 | 实施内容 |
|---|---|
| `src/domain/project-workflow.ts` | S0—S7 九种只读状态；根据真实实体、最新 Run、同项目宿主执行与能力派生。可选投标、批次等待、原 runId 恢复、失败/中断、UNKNOWN、可能过期、审批与导出分离 |
| `src/harness/capabilities.ts`、`service.ts`、`routes.ts` | 官方注册表能力检查与 `GET /marketpilot/api/projects/:id/workflow`；一次聚合快照，不输出文档正文或凭据 |
| `src/client/components/ProjectWorkflowOverview.tsx` | 实际 `ProjectWorkflowOverview`、`ProjectStepCard`、`PrerequisiteHint`、`StageActionBar`；共用流程上下文、真实 CTA、缺项链接、步骤/错误展示 |
| `src/client/hooks/useProjectWorkflow.ts`、`api.ts` | 每 3 秒读后端快照，执行状态变化立即刷新；同项目校验、不重叠请求、过期响应拒绝、失败明确提示 |
| `src/client/pages/ProjectOverviewPage.tsx` | 首屏当前阶段、下一步、最新成果、待办与八张卡片；历史折叠；引导/专业模式共用 projectId 与导航 |
| `MarketPilotPanel.tsx`、`stores.ts`、`ProjectStageNav.tsx` | 每项目工作模式偏好；原八分区保留；导航与卡片使用同一投影；读取失败时不回退为 Project.status 推测的完成态；需补证显示警示 |
| `RequirementsPage.tsx`、`ResearchPage.tsx`、`AlternativesPage.tsx`、`SolutionPage.tsx`、`TenderPage.tsx` | 原按钮落实输入/能力条件；方案须有真实 active Decision 和 confirmed 需求。无模型阻止生成，但仍允许对已有路线发起原人工 Decision Gate |
| `useProjects.ts`、`usePhase4.ts`、`WorkflowSurface.tsx` | 同项目刷新保持子页面/选择；跨项目旧响应拒绝；失联执行不当作可回答 Gate，也不永久阻塞重试 |
| `ProjectHeader.tsx`、`locales.ts`、`styles.ts` | 区分需求待澄清与证据 UNKNOWN；旧状态标明“记录状态”；延续 `--dsw-*`、浅/深色、1024 紧凑横向导航 |
| `scripts/acceptance-v33.mjs`、新增/调整 tests | 可重复 Desktop 托管页面验收与业务/React/HTTP/插件加载回归 |

操作行为：首页下一步进入对应工作区；S4/S5 工作区顶区可以通过 `executionStore.start(tool,args)` 执行；需选择文档/条款/路径的阶段定位原表单。运行中/等待人工只定位，不新发任务。卡片和缺项链接始终允许阅读和补证；UNKNOWN 保留，不阻止草稿，也不自动升为 FACT。

## 3. 最终验证记录

2026-10-11 10:51 完成离线 smoke；10:53 重启 Desktop 加载服务端投影；10:56—10:57 完成最终 React 构建、209 测试与截图复验（本地时间）。

```powershell
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false test
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false exec vitest run tests/client-bundle.spec.ts
pnpm --config.verify-deps-before-run=false marketpilot:demo:smoke
node scripts/acceptance-v33.mjs
git -c core.autocrlf=false diff --check
```

`--config.verify-deps-before-run=false` 仅跳过本环境 pnpm 11 启动脚本前对相邻 link 依赖的自动重装核验。无此开关时 pnpm 在非 TTY 中报 `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`，尚未进入项目脚本。以上命令运行的仍是 `typecheck` / `test` / `build` 原脚本；没有修改依赖、lockfile 或 pnpm 配置。

| 验证 | 实际结果 |
|---|---|
| typecheck | `tsc --noEmit` 成功 |
| 全量 tests | **26 文件 / 209 测试通过**，保留 178 个基线测试；新增 31 个业务/交互/能力/store 测试 |
| build | TypeScript 服务端与 tsdown 客户端成功；`client/client.js` 297.53 kB / gzip 60.75 kB |
| 构建后插件注册回归 | 5/5；原主面板、侧栏入口、旧跳转入口、冻结模块白名单通过 |
| CALM 离线 smoke | 官方 Cordis Loader + SQLite + guarded Tools 闭环；4 文档、10 需求、18 证据、10 UNKNOWN、5 成果、12 次离线模型调用 |
| GUI | 最终构建重启 Desktop 后复验：**14 截图、9 组检查、0 页面异常**；无新模型调用 |
| diff check | 无行尾空白错误 |

离线 smoke 明确 `OFFLINE MODEL FIXTURE` / `simulated-test-only`，不代表在线模型或生产人工授权。SQLite ExperimentalWarning 为 Node 24 的提示，本轮未导致失败。

补充覆盖：17 个服务端投影测试、9 个 React 点击测试、4 个能力测试、1 个工作模式 store 测试；原 HTTP 测试补充快照绑定与无正文断言。旧首页夹具适配新投影契约，无删除旧测试。新增 React Context 合法初始化后，插件加载测试增加真实 `createContext` 支持，保持原注册断言。

## 4. 真实 GUI 与后端对账

通过已安装 DSH Desktop 启动真实宿主。截图使用 Chrome CDP 打开 **该 Desktop 托管的 Web 页面与实际插件**；未使用 mocked API 或 jsdom 页面。不是截图原生窗口外框。会话 token 只在内存用于本机宿主访问，不输出、不写入验收资料。

重启前 `node scripts/acceptance-v33.mjs --check-idle` 已确认没有 live Workbench execution / Gate。复验脚本恢复浅色模式；存量 Run、Decision、Artifact 保留。

事实记录：[v33-facts.json](gui-acceptance/v3.3-m1/v33-facts.json)。关键断言：DOM 当前阶段/八卡状态逐项等于 workflow API；UNKNOWN 等于项目中活跃 UNKNOWN 记录；无全页横向溢出；1024 导航为 row、高 35px；补证跳转与返回同一项目；专业模式返回保留；等待定位前后执行 callIds 完全一致。

| 项目/状态 | 后端事实与页面结论 |
|---|---|
| synthetic QA 空项目 | revision 0，当前 S0 ready；0 UNKNOWN / 0 waiting；S4/S5 不可生成；S6 skipped_optional |
| CALM 漏油监测桌面版演示 | revision 157，当前 S6 needs_attention；28 个活跃证据 UNKNOWN；S0/S1/S2/S4/S5 completed，S3 needs_attention，S7 ready。补证落 S3 并返回原项目 |
| CALM 正式演示（现场确认用） | revision 12，当前 S1 waiting_human；1 个可恢复等待；点击落“01 资料与需求”，无新 execution |
| V3P2 自验收 04:46 | revision 74，历史方案可读，当前 S6 needs_attention；8 个 UNKNOWN；专业模式切页/返回保留 |

所有截图在 `docs/gui-acceptance/v3.3-m1/`：

| 截图 | 尺寸 | 证明范围 |
|---|---|---|
| [v33-empty-light-1440.png](gui-acceptance/v3.3-m1/v33-empty-light-1440.png) | 1440×900 | 空项目首屏、全部八阶段 |
| [v33-empty-light-1024.png](gui-acceptance/v3.3-m1/v33-empty-light-1024.png) | 1024×768 | 浅色紧凑导航/两列流程卡 |
| [v33-empty-dark-1440.png](gui-acceptance/v3.3-m1/v33-empty-dark-1440.png) | 1440×900 | 空项目深色 |
| [v33-empty-dark-1024.png](gui-acceptance/v3.3-m1/v33-empty-dark-1024.png) | 1024×768 | 深色紧凑导航 |
| [v33-calm-light-1440.png](gui-acceptance/v3.3-m1/v33-calm-light-1440.png) | 1440×900 | CALM 真实存量成果、UNKNOWN、S6 优先待办 |
| [v33-calm-light-1024.png](gui-acceptance/v3.3-m1/v33-calm-light-1024.png) | 1024×768 | CALM 浅色紧凑布局 |
| [v33-calm-dark-1440.png](gui-acceptance/v3.3-m1/v33-calm-dark-1440.png) | 1440×900 | CALM 深色 |
| [v33-calm-dark-1024.png](gui-acceptance/v3.3-m1/v33-calm-dark-1024.png) | 1024×768 | CALM 深色紧凑布局 |
| [v33-empty-routes-blocked-1440.png](gui-acceptance/v3.3-m1/v33-empty-routes-blocked-1440.png) | 1440×900 | 无 confirmed 需求：路线生成禁用和补齐入口 |
| [v33-calm-light-1366.png](gui-acceptance/v3.3-m1/v33-calm-light-1366.png) | 1366×768 | 额外中间尺寸 |
| [v33-calm-evidence-feedback-1440.png](gui-acceptance/v3.3-m1/v33-calm-evidence-feedback-1440.png) | 1440×900 | 跨模块补证落地，原证据工作区保留 |
| [v33-existing-solution-1440.png](gui-acceptance/v3.3-m1/v33-existing-solution-1440.png) | 1440×900 | V3P2 历史成果与真实阶段 |
| [v33-professional-1440.png](gui-acceptance/v3.3-m1/v33-professional-1440.png) | 1440×900 | 专业模式保留成果/待办，仅折叠阶段图 |
| [v33-existing-wait-landing-1440.png](gui-acceptance/v3.3-m1/v33-existing-wait-landing-1440.png) | 1440×900 | CALM 可恢复需求等待实际落地 |

**GUI 未覆盖项**：当前存量项目无 failed Run，故没有真实生成失败截图；无 Provider、失败/超时、中断等由 React/业务及原回归测试覆盖，未宣称这些场景的真实 GUI 已验收。未为截图制造模型故障或消耗真实模型额度。

## 5. 已解决与待解决

已解决：页面各自操作缺少项目级引导；单向 Project.status 不能准确表达阶段；缺项时仍可点击生成；等待/运行导航容易重复执行；审批被误认成导出；真实 UNKNOWN、失败原因与已记录步骤没有统一入口；详情刷新导致选择丢失；丢失的宿主任务冒充可回答 Gate；无模型错误限制已有路线人工审核；读失败仍推断导航完成态。

待解决/边界：

1. 当前宿主只读能力检查显示 **`zai / glm-5.3-flash / max`**，与 V3.2.1 历史验收的 `glm-5.3 / max` 不同。本轮未改 Profile 或 Provider，未新增真实模型调用。保留原模型架构与配置选择能力，但本次不构成 GLM-5.3 Max 在线复验。
2. Harness Web 已加载，上游没有公开只读 Provider 选择接口：显示 `unverified`，只提供现有本地资料研究。未联网探测、未增加第三方搜索或伪联网按钮。
3. 真实失败 GUI 截图缺口须后续补验；本轮已如实保留在 facts.gaps。
4. 旧成果没有完整持久化依赖版本，当前以 updatedAt 提醒“可能过期”；不会隐式覆盖旧 Decision/Artifact。新提纲审批或单章重生成需要单独事务设计。
5. 导出执行历史目前在宿主内存中；重启后无法证明旧导出。`approved` 仅代表审核，S7 不假称导出完成。
6. 补证行动项聚合队列、需求/证据页面深度重组、研究矩阵、PDF/DOCX、事件订阅不属于本轮 M1。

## 6. M2 建议与停止点

验收 M1 后，先实施需求/证据的“输入→提取→批次审阅→补证”闭环：按真实 runId 展示本批范围和待澄清项；保留筛选/分页外定位、来源追溯、永久短编号和 Human Gate；将方案/投标发现的缺口聚合为可操作队列，并提供补充资料与只读下游影响提示。

M2 应优先验证两批需求不串 runId、跨项目拒绝、过滤后的选择范围、UNKNOWN 保留与人工中断，再验证同项目切页/刷新。联网 Provider 配置与真实 GLM 再验按独立范围安排。

**本轮到此停止，不执行 M2—M5，等待用户验收。**
