# MarketPilot UI V3.2 — 第二阶段定向优化修复说明

日期：2026-10-10 · 基线：第一阶段（`49bd3f0`，宿主已重启、服务端行为已生效） · 状态：随本提交交付
截图：`docs/gui-acceptance/v3.2/phase2/`（真实 DSH Desktop，headless Chrome + CDP）

## 逐项修复

### 1. 详情面板短编号 + 跨模块跳转

- 证据抽屉：标题旁显示 `EVD-xx` 短编号；「关联需求」由裸 id 片段改为 **REQ-xx 可点击短编号**，
  点击跳转到「01 资料与需求」并直接打开该需求的来源抽屉；「支撑证据」同样可点击互跳；
  抽屉底部附「编号对照」折叠面板（含 id 前 8 位，追溯不丢）。
- 投标抽屉：EVD/REQ 引用全部改为可点击短编号，点击落到「03 证据审查」/「01 资料与需求」并直开对应记录。
- 需求表：编号列由服务端投影直接输出 REQ-xx（宿主重启后已生效，实测 19 行全部为 REQ 编码）。
- 实现：导航 store 新增 `focusRecord(section, kind, id)`——切区并携带记录焦点；普通 `setSection` 清除焦点。
  `RequirementsPage`/`EvidencePage` 消费 `focus` 直开对应抽屉。
- 实证：`v32b-04-tender-jump-landing-1440.png`——从投标抽屉点击 EVD-16，界面落到「03 证据审查」
  且自动打开「候选技术摘录：水面路线 EVD-16」抽屉（含来源定位与编号对照）。事实检查
  `evidenceCodes = { codeChip: 'EVD-13', jumpLinks: ['REQ-03','REQ-06','REQ-04','REQ-09'], rawUuid: false }`。
- 回归：`phase4-client`（证据抽屉短编号+跳转断言、focus 直开抽屉、投标抽屉跳转）、
  `phase3-client`（store focusRecord/setSection 清除）、`phase2-client`（需求页 focus 直开源抽屉）。

### 2. 首页聚焦：继续项目 / 待办 / 运行任务

- 新增「继续项目」特性卡：最近更新的项目 + 状态 + 更新时间，一键 `openProject` 继续。
- 「需要处理」待办列表保留并直达项目；新增「运行任务」区：实时执行（运行中/等待审核）
  显示工作流类型 + 所属项目 + 状态，点击进入任务中心；空态明确显示「暂无运行任务」。
- `useExecutions()` 修复：无 projectId 时也拉取全局执行索引并采纳（此前注释宣称跨页面采纳但实现缺失）
  ——首页与任务中心的运行真相一致，刷新/重开面板不丢任务。
- 实证：`v32b-01-home-1440.png`（继续项目卡 + 4 条待办 + 运行任务区）、`v32b-06-home-1024.png`、
  `v32b-07-home-dark.png`。事实检查 `home.runningRows` 列出 4 条待审核任务及所属项目。
- 回归：`phase2-client` HomePage 两用例（继续卡/待办/运行任务渲染与点击、空态）。

### 3. 正式方案可读性

- 模板（`render/generation.ts`）重构开头：标题含项目名 + 引用块免责声明 + **「方案摘要」块**
  （人工 Decision、选定路线、覆盖率 N/M、未决 UNKNOWN 计数），读者 10 秒内掌握方案全貌；
  「技术路线」章节去除与摘要重复的元信息，聚焦路线描述与决策理由。
- 离线冒烟验证：`Solution.md` 开头即为「# 项目名：技术方案（草稿）→ 摘要块 → 客户需求」，
  全文 REQ/DEC/ALT 短编号 + 文末编号对照。
- 阅读器排版沿用第一阶段的真单栏 + DSH 设计系统 Markdown 渲染（`v32b-05`）。
- 说明：模板改进对新方案生成生效；存量方案由显示层替换短编号，可读性已达标。

### 4. docs/DEMO_SCRIPT.md 更新至 V3.2

- 新增「V3.2 演示亮点」章节与各步骤短编号/跳转/展开/任务历史的演示话术；
  第六步改为「投标合规与跨模块跳转」（点击 EVD-xx → 落到证据审查并直开记录）；
  备用方案补充旧数据由显示层替换短编号的说明。

## 测试与构建

- `pnpm typecheck` ✅ · `pnpm test` ✅ **159 / 159**（第一阶段 152 + 新增 7）· `pnpm build` ✅（264.9 kB，无新依赖）
- `pnpm run marketpilot:demo:smoke` ✅（12 模型调用、5 成果，离线验证新模板）
- 真实 GUI 截图 8 张 + 事实检查 `v32b-facts.json`：0 页面错误，浅色已恢复。

## 截图清单（docs/gui-acceptance/v3.2/phase2/）

| 文件 | 内容 |
| --- | --- |
| v32b-01-home-1440.png | 首页聚焦：继续项目 / 需要处理 / 运行任务 |
| v32b-02-requirements-codes-1440.png | 需求表服务端 REQ 编码（19 行） |
| v32b-03-evidence-drawer-1440.png | 证据抽屉：EVD-13 + REQ 跳转链接 + 编号对照 |
| v32b-04-tender-jump-landing-1440.png | 投标抽屉点 EVD-16 → 证据审查直开记录（跨模块跳转全链路） |
| v32b-05-solution-reader-1440.png | 方案阅读器（旧数据即时替换，无裸 UUID） |
| v32b-06-home-1024.png | 1024px 首页 |
| v32b-07-home-dark.png / v32b-08-evidence-drawer-dark.png | 深色主题 |

## 红线自查

未改 DSH 核心 Agent Loop；未绕过 Human Gate / 证据闸门（跳转只读、审核仍走真实工作流）；
UUID 主键未动（短编号为显示/渲染层映射）；未删数据；跳转与首页区块全部基于真实持久化数据。
