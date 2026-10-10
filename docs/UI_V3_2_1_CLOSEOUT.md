# MarketPilot UI V3.2.1 — 定向质量收口

日期：2026-10-10 · 基线：V3.2（`9dfc0fc`）· 性质：**修复与验收收口，无 UI 重构** —— 保留 V3.2 全部页面结构、组件、配色与已验证的人工审批流。
截图：`docs/gui-acceptance/v3.2.1/`（真实 DSH Desktop + CDP，宿主加载 V3.2.1 构建后补充）

## 0. 源码审查结论（先审后改）

| # | 用户问题 | 审查确认的根因 |
|---|---|---|
| 1 | 首页待办统计与任务中心 | `WorkflowService` 的 `waiting_human` 是持久化状态；重跑/重新生成后旧运行**永远停留**在等待态，`useHomeStats` 与任务中心把这类**遗留中断等待**和真实可恢复审批同等计数/排序 |
| 2 | 下一步提示不统一 | `NextActionCard` 用项目状态基线猜跳转目标，且"待人工审核 · N"包含上条的遗留计数，与实际工作流记录、Decision 状态脱节 |
| 3 | 短编号长期稳定性 | `buildShortCodeIndex` 是纯派生映射（createdAt+id 排序）；一旦发生删除（服务层 `RecordService.delete` 存在），后续记录编号前移，已导出成果与台账中的 `REQ-xx` 永久错位 |
| 4 | 跨模块跳转失效 | 需求/证据页的 `focus` 效果只在**当前筛选+分页结果**里查找目标记录，找不到就静默失败 |
| 5 | sectionActive 与截图不一致 | 验收脚本读 `.mp-stageItem[data-state='current']` —— 这是**业务阶段徽标**（done/current/waiting…），不是导航选中态（`aria-current="page"`）；`v32b-facts.json` 因此记录了 `sectionActive: "05 方案生成"` 而截图实际落在 03 证据审查 |
| 6 | 方案摘要/编号/引用验证 | V3.2 仅离线冒烟验证新模板（离线模型替身），真实 GLM-5.3 Max 的在线验收缺失 |

## 1. 逐项修复（最小差异）

### 1.1 区分可恢复审批与遗留中断等待（修复 #1）

- 新增纯函数 `src/domain/runs.ts`：`isSupersededWait` —— 等待运行被**同类型更新的运行**取代即为遗留；`markSupersededWaits` 在服务端投影打标（`supersededWait: true`，附加字段，不改历史数据）。
- 两个 runs 路由（`/runs`、`/projects/:id/runs`）在截断/排序前打标；旧客户端忽略该字段，行为不变。
- `useHomeStats`：待办计数只统计非 superseded 的等待；遗留等待保留在任务中心历史里但排序沉底。
- `RunHistoryCard`：遗留等待显示 `遗留等待` 标签 + 说明文案（新增文案键 `runStatus.superseded_wait`、`supersededWaitHint`，中英双语），不再呈现为可审批。
- 可恢复的判定保持诚实：**最新一次**同类等待 = 真实可恢复审批（需求批次可确认、方案可恢复）；实时执行等待（带问题的门）仍是首页"运行任务"真相。

### 1.2 统一下一步提示（修复 #2）

- `NextActionCard` 新增 `waitingType` / `activeDecisionId`：存在可恢复等待时，标题 `待人工审核 · N`，正文按运行类型给文案（`nextWait.requirement_analysis` / `nextWait.solution_generation` / `nextWait.generic`），跳转目标 `waitSectionOf()` 按真实等待定位（需求等待 → 01；无 Decision 的方案等待 → 04 技术路线；有 Decision → 05）。无等待时保持 V3.2 状态基线文案与目标，旧项目零影响。
- `ProjectOverviewPage` / `ProjectHeader` 的 `waiting` 全部改为非遗留计数 —— 阶段导航、页头徽标、下一步卡片三处同一真相。

### 1.3 短编号持久化映射 + 历史快照（修复 #3）

- 状态新增可选 `codeBook`（`{ seq, codes }`，`stateSchema` 可选字段，**旧项目无需迁移**）：`applyShortCodeBook` 在仓储写入路径（`harness-repository.update`，单点注入，非 DSH 核心）为每个无码记录固定 `(createdAt, id)` 序号 —— 首次写入时与原派生编号**完全一致**，此后永不改变；删除退役编号不复用，新记录从族内高水位继续。
- `buildShortCodeIndex` 接受 `codeBook`：冻结编号优先，未冻结记录派生时跳过已冻结号段。服务端全部投影（detail、requirements 路由、render/baseline、render/generation、render/compliance、research 服务）与客户端 `projectShortCodeIndex` 均传入。
- **历史成果快照方案**：编号对照附录（code + 记录 id 前 8 位）在生成时写入成果正文，本身就是快照；配合持久化 codeBook，编号永不漂移，历史附录永久可回溯。 AlternativesPage 的 REQ/EVD 局部索引暂沿用派生映射（删除入口当前未暴露给任何工具，见 §5）。
- 实证：离线 CALM 冒烟后 SQLite 落库 `codeBook.seq = { document:4, requirement:10, evidence:18, artifact:5, alternative:2, decision:1, tenderItem:3 }`，与黄金用例逐族计数一致。

### 1.4 跳转在被筛选/分页排除时不再失效（修复 #4）

- 新增两条只读详情路由：`GET /projects/:id/requirements/:rid`、`GET /projects/:id/evidence/:eid`，返回与列表完全相同的投影（404 = 记录不存在）。
- `RequirementsPage` / `EvidencePage`：focus 目标不在当前页时按 id 取单条打开抽屉；目标已删除时显示明确提示（`jumpMissing`），绝不静默。

### 1.5 验收脚本精确 DOM 断言（修复 #5）

- `cdp-v32b.mjs`（V3.2 存档脚本）与新增 `cdp-v321.mjs`：`sectionActive` 改读 `aria-current="page"`；业务阶段徽标单独记录为 `stageBusinessState`。V3.2 phase-2 的记录事实勘误：截图本身正确（落在 03 证据审查），错的是 `sectionActive` 字段的取值口径。

### 1.6 GLM-5.3 Max 在线验收（修复 #6，明确在线/离线边界）

- **在线**（`cdp-v321-glm.mjs`，真实 zai/glm-5.3 max，经工作台受控工具路径，无门可绕——方案生成在 Decision 已确认后本就无人工门）：对真实项目重新生成方案，校验摘要块（DEC/ALT 编号、覆盖率 N/M 对账已确认需求、未决 UNKNOWN 数对账台账）、正文无裸 UUID、正文引用编号 ⊆ 附录、附录每条 id 前 8 位可回溯到真实记录。
- **离线**（本轮已执行）：CALM 冒烟（离线模型替身 + 显式模拟人工）只证明管线、模板与持久化，**不作为**模型输出质量证明。历史存量方案无摘要块属预期（显示层负责其可读性）。

## 2. 红线自查

- 未改 DSH 核心（改动全部在 `marketpilot/`，`stateSchema` 为插件自有域）；未绕过 Human Gate（审核/Decision/核验路径零改动，跳转与统计只读）；未删项目数据（codeBook 为附加字段，旧行为完全保留）。
- 旧项目兼容：无 codeBook 的项目继续派生映射，下一次写入冻结为相同编号；无 superseded 字段的旧运行按可恢复等待处理（与 V3.2 行为一致）。

## 3. 测试与构建（2026-10-10）

- `pnpm typecheck` ✅ · `pnpm test` ✅ **177 / 177**（V3.2 基线 159 + 新增 18）
- 新增回归：codeBook 冻结/删除稳定/续号/旧数据首写复现派生编号（shortcodes、storage×2）；单记录路由 200/404 与 supersededWait 打标（phase4-routes）；NextActionCard 目标定位、RunHistoryCard 遗留标签、首页遗留不计待办、需求/证据页筛选外跳转回退（v321-closeout，9 例）
- `pnpm build` ✅（client 270.9 kB，无新依赖）· `marketpilot:demo:smoke` ✅（12 模型调用、5 成果，codeBook 落库核验通过）
- 真实 GUI + GLM 在线验收：待宿主重启加载新构建后执行（见 §6）。

## 4. 截图清单（docs/gui-acceptance/v3.2.1/，宿主重启后补充）

| 文件 | 内容 |
| --- | --- |
| v321-01-home-1440.png | 首页：真实待办计数（遗留等待不计入） |
| v321-02-tasks-1440.png | 任务中心：遗留等待标签 + 沉底排序 |
| v321-03-tender-jump-landing-1440.png | 投标抽屉 EVD 跳转落点（aria-current 精确断言） |
| v321-04-requirements-codes-1440.png | 需求表 REQ 编码 + 冻结编号 |
| v321-05-solution-reader-1440.png | 方案阅读器（在线新生成方案的摘要块/编号/附录） |
| v321-06-home-1024.png / v321-07-home-dark.png | 1024 与深色回归 |

## 5. 剩余业务能力缺口（收口评估）

### 5.1 联网竞品研究 — 最小实现路线

现状：业务侧已就绪 —— `marketpilot_research_search` 工具、`HarnessResearchAdapter`（draft SOURCE、来源 URL、截断即报错、UNKNOWN 保留）与证据闸门都已实现并测试；缺口只在**宿主环境**：DSH Web 的联网搜索/抓取 provider 未在桌面 profile 配置。

最小路线（配置级，零新代码）：
1. 桌面 profile 启用 dsh web 的 search/fetch provider（联网能力属宿主配置，不在插件内自建 HTTP 客户端 —— 保持同源与安全边界）。
2. 用 `research_search` 抓 1–2 个真实竞品条目 → `competitor_extract` 入库 → 证据审查核验为 SOURCE → 进入方案引用链路。
3. 验收口径：来源 URL 可回访 + 抽取结果核验为 SOURCE 后才可支撑 compliant 结论（现有闸门已强制）。
风险：搜索结果信噪比 → 由证据闸门兜底（draft → 人工核验）；不做自动抓取定时任务（超范围）。

### 5.2 DOCX/PDF 解析 — 最小实现路线

现状：`HarnessDocumentParser` 仅支持 UTF-8 Markdown/TXT（上传路由按 `maxDocumentBytes` 限流）。需求来源与招标文件常为 DOCX/PDF。

最小路线（分两级，先 DOCX）：
- **DOCX（V3.3 可做，零第三方依赖）**：DOCX 是 ZIP 容器 —— Node 内置 `zlib.inflateRawSync` + 自实现 ZIP 本地文件头/中央目录解析（~100 行）抽出 `word/document.xml`，按 `<w:p>` 段落切分、剥标签为纯文本，保留大小上限与损坏文件显式报错（与现有 `UPLOAD_TOO_LARGE` 行为一致）。校验点：段落顺序、表格文本不丢、测试含损坏/空文件负例。
- **PDF（建议保持出栈外）**：文本层 PDF 可做最小提取（内容流文本操作符 + 常见编码），但字体子集/_cid 编码长尾大；扫描件需 OCR，完全出范围。建议：V3.2.1 后若必须支持，先走"文本层 PDF 尝试提取、失败给出明确重试/转档指引"，不承诺扫描件；或依赖宿主外部转换器（LibreOffice headless），插件只收纯文本 —— 但这引入外部进程依赖，需单独立项评估。
- 共同约束：解析层继续只产文本 + 校验和，业务闸门（UNKNOWN/证据核验）不变；不引入会放大供应链风险的重量级解析依赖。

### 5.3 其他遗留（低优先）

- `marketpilot_tender_review` 符合性矩阵的"补证行动项"尚无任务中心入口（可从投标页跳证据审查，但无聚合视图）。
- 短编号的 `AlternativesPage` 局部索引在（未来）启用删除工具后需接入 codeBook；当前无删除工具暴露，风险未激活。
- 联网研究无断点续抓/去重策略（首次联网验收后再评估）。

## 6. 环境与验收状态

| 项 | 状态 |
| --- | --- |
| 代码 + 回归 + 构建 + 离线冒烟 | ✅ 2026-10-10 |
| 真实 GUI（宿主加载 V3.2.1 构建） | ⏳ 需重启 DSH Desktop 后执行 `cdp-v321.mjs` |
| GLM-5.3 Max 在线方案验收 | ⏳ 需桌面 profile（zai/glm-5.3, max）在线执行 `cdp-v321-glm.mjs` |
