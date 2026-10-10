# MarketPilot UI V3.2 — 第一阶段定向优化修复说明

日期：2026-10-10 · 基线：V3.1 完成态（main @ `ef7baf2`） · 状态：**待人工验收**
截图：`docs/gui-acceptance/v3.2/`（真实 DSH Desktop，headless Chrome + CDP，非 Mock 页面）

## 范围

只做第一阶段 6 项；第二阶段（详情面板短编号跳转、首页重构、DEMO_SCRIPT 更新等）未开始。
红线全部遵守：未改 DSH 核心 Agent Loop；未绕过 Human Gate / 证据闸门；UUID 主键未动；未删数据；
所有显示层短编号均可通过「编号对照」回溯到真实记录。

## 逐项修复

### 1. 成果阅读页单栏布局（原 224px 空首列）

- 问题：`ArtifactsPage` 复用 `.mp-readerLayout`（导轨 + 目录 + 正文三栏网格），Markdown 正文落在
  224px 首列，几乎不可读。
- 修复：阅读态改为 `<article class="mp-readerSingle">` 真单栏（max-width 880px 居中，纵向滚动）；
  表格统一 `display:block; width:max-content; overflow-x:auto` 横向滚动不再撑破。
- 证据：`v32-05-artifacts-reader-1440.png` / `v32-13-artifacts-reader-dark.png`；
  事实检查 `artifactReader.singleColumn=true, legacyGrid=false`。
- 回归：`phase3-client.spec.tsx`「reads in a true single-column layout — no reserved 224px side grid column」。

### 2. 技术路线对比页可读性（默认摘要 + 展开，Decision Gate 保留）

- 修复：卡片默认显示名称 / 关键组成 / 优势 / 限制 / 风险摘要，长文本 CSS 两行截断；
  卡片底部「展开 / 收起」按钮（`aria-expanded`、`data-expanded`，`stopPropagation` 不触发选中）。
  决策条（真实 Decision Gate，走 `marketpilot_decision_confirm` 工作流 + 人工审核）保留；
  **改为常规文档流**，不再 sticky 悬浮——修复滚动时遮挡覆盖矩阵正文的问题（1024px 下原本就是 static，现在全宽一致）。
- 证据：`v32-03-alternatives-1440.png`（默认截断）、`v32-04-alternatives-expanded-1440.png`（展开）、
  `v32-11-alternatives-1024.png`（static 决策条）。事实检查 `altExpanded="true"`、`decisionBar1024.position="static"`。
- 回归：`phase4-client.spec.tsx`「expands clamped long text per card without losing the selection click」
  （断言展开翻转、stopPropagation 不选中、存库摘要中的 UUID 显示为短编号）。

### 3. 短编号体系（REQ/EVD/ALT/DEC/TND/DOC/ART-两位序号）替代裸 UUID

- 设计：新纯函数模块 `src/domain/shortcodes.ts`（客户端 bundle 无新依赖）。编号 = 家族前缀 + 按
  `createdAt ?? updatedAt` 排序的序号（同刻按 id 决胜），同项目同输入确定性可复现；`replace()`
  仅替换已知 UUID，未知 id 原样保留；`renderCodeAppendix()` 在文档尾部输出「附录：编号对照」，
  含记录 id 前 8 位，来源追溯不丢失。数据库主键、关联全部仍是 UUID。
- 服务端（生成内容层面）：`render/{generation,baseline,compliance}.ts` 全部改为短编号 + 附录；
  研究页竞品矩阵、需求投影（`shortId`）、跨模块路由同理。
- 客户端（显示层面，兼容旧数据）：成果阅读器 / 方案阅读器 / 投标抽屉 / 路线对比卡在渲染前
  做显示替换，并附「编号对照」折叠面板；旧 runs 存量的 UUID 文本无需重跑即可正常阅读。
- 证据：`v32-05`（REQ-19/REQ-05/DOC-01 + 对照面板）、`v32-06`（方案阅读器）、`v32-07`（投标抽屉）、
  `v32-03`（路线卡 REQ-06）。事实检查三处 `rawUuidVisible=false`。
- 回归：`tests/shortcodes.spec.ts`（8 用例：确定性、大小写、未知 id、家族独立、附录）+
  `generation.spec.ts` / `requirement-workflow.spec.ts`（模板短编号断言）+
  `phase3-client`（阅读器替换 + 对照面板）+ `phase4-client`（路线卡替换）。

### 4. 任务中心合并持久化运行历史

- 修复：新增跨项目路由 `GET /marketpilot/api/runs?limit=`（每项目取最近 20 条，拼项目名，按开始时间倒序）；
  `TasksPage` 分「实时执行」与「历史运行」两区；历史来自持久化 WorkflowRun（宿主重启不丢），
  同一 runId 的行去重不重复展示；历史行可展开持久化步骤、失败原因，可一键回项目。
  客户端带降级：跨项目路由不可用（旧宿主进程）时按项目逐个拉取合并——当前未重启的宿主上历史即可见。
- 证据：`v32-08-tasks-1440.png`（历史运行 28 条，等待审核置顶）、`v32-15-tasks-dark.png`。
- 回归：`phase2-routes.spec.ts`「lists persisted runs across projects」；
  `phase3-client`（历史合并渲染、与实时执行去重、跨项目路由缺失时降级）。

### 5. 1024×768 响应式

- 修复：≤1200px 隐藏品牌描述；≤1024px：顶部导航单行紧凑（52px）、阶段列表横向单行滚动
  （`overflow-x:auto`，不折行不占首屏）、页面留白与栅格间距收紧。
- 证据：`v32-09-home-1024.png`（导航单行）、`v32-10-project-overview-1024.png`（阶段条 35px 单行可横滚）。
  事实检查 `header1024.navWrapped=false`、`stageStrip1024.rows=35, scrollable=true`。
- 回归：样式属 CSS 行为，由截图 + 事实检查覆盖（1024 布局规则无独立逻辑分支）。

### 6. 阶段与运行状态一致性

- 修复：新 `advanceProjectStatus(s, next)` 只进不退的状态基线（`requirements_ready → researching →
  alternatives_ready → decision_confirmed → solution_ready → tender_review`）；需求确认、研究提交、
  路线生成、方案生成、投标抽取/审查完成后相应前移。前端 `ProjectStageNav` 修正阶段映射
  （`requirements_ready→02`、`solution_ready→05` 基线为「下一工作阶段」），运行记录真相优先于基线
  （run 完成即 done、waiting 即 current 的叠加规则保留）。
- 已知边界：**存量项目**（如 CALM 演示项目）的状态是旧代码写入的，本阶段不回填历史数据
  （不删改数据红线）；其阶段提示将随下一次真实运行自动前移。新完成的运行已按新规则推进
  （单测覆盖全链路 forward-only 断言）。
- 回归：`generation.spec.ts`「advances the project status baseline forward-only as workflows complete」；
  `phase3-client`「keeps the stage baseline consistent after a successful solution generation」。

## 测试与构建

- `pnpm typecheck` ✅（exactOptionalPropertyTypes 严格模式）
- `pnpm test` ✅ **152 / 152**（V3.1 基线 134 + 新增 18：shortcodes 8、路由/客户端/阶段 10）
- `pnpm build` ✅（client.js 256.6 kB，无新增 npm 依赖）
- `pnpm run marketpilot:demo:smoke` ✅（离线全链路：12 模型调用、5 成果、无人工阻塞）

## 截图清单（docs/gui-acceptance/v3.2/，1440×900 / 1024×768 / 明暗）

| 文件 | 内容 |
| --- | --- |
| v32-01-home-1440.png | 首页（真实统计：8 项目 / 4 待审核） |
| v32-02-project-overview-1440.png | 项目概览 + 阶段导航 |
| v32-03 / v32-04-alternatives-*.png | 路线对比默认 / 展开态（短编号 + 决策条） |
| v32-05-artifacts-reader-1440.png | 成果单栏阅读器 + 编号对照（旧数据即时替换） |
| v32-06-solution-reader-1440.png | 方案阅读器（短编号） |
| v32-07-tender-drawer-1440.png | 投标抽屉（短编号 + 对照） |
| v32-08-tasks-1440.png | 任务中心：实时 + 历史运行 |
| v32-09 / v32-10-*-1024.png | 1024px 首页 / 项目页 |
| v32-11-alternatives-1024.png | 1024px 路线页（static 决策条） |
| v32-12 ~ v32-15-*-dark.png | 深色主题（概览 / 阅读器 / 路线 / 任务） |

对照 V3.1 基线：`docs/gui-acceptance/v3.1/ux5/`（成果三栏→单栏、任务中心无历史→28 条历史、
1024 导航折行→单行）。

## 与 V3.1 的前后对比要点

1. **成果阅读**：V3.1 `ux5-03-artifacts.png` 正文挤在 224px 首列 → 现在 `v32-05` 单栏 880px 居中、表格横滚。
2. **任务中心**：V3.1 只显示当前会话执行，重启即清空 → 现在 `v32-08` 显示全部 8 个项目的持久化历史
   （含等待审核置顶、展开步骤、回项目入口）。
3. **UUID 可读性**：V3.1 正文/卡片满屏 36 位 UUID → 现在全部 REQ/EVD/DOC 短编号 + 折叠对照面板。
4. **1024px**：V3.1 顶部导航折行、阶段列表竖排占半屏 → 现在单行导航 + 横向滚动阶段条。

## 需要重启 DSH Desktop 才能生效的服务端行为（客户端已兼容）

当前运行的宿主进程仍加载旧服务端代码，以下在重启后生效（客户端 bundle 已按请求读取，本次截图即新行为）：

- `GET /marketpilot/api/runs` 跨项目历史路由（当前由客户端按项目降级合并，显示无差异）；
- 需求投影 `shortId`（REQ-xx；当前显示 id 前 8 位 hex）；
- 生成模板直接产出短编号 + 附录（当前由客户端显示层替换，阅读无差异）；
- 新运行的阶段状态前移（存量项目状态下一次运行自动前移）。

重启后可复跑 `node .marketpilot/gui-acceptance/tools/cdp-v32.mjs` 复核（脚本幂等、只读导航）。
是否重启由你决定：重启会中断本会话，建议在本阶段验收后进行。
