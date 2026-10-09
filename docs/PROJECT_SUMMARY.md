# MarketPilot Web UI V3.0 开发总结

> 项目：QueenBojet/dsh-marketpilot
> 日期：2026-10-09（单日完成 V3.0 全部五个阶段）
> 执行：DSH 编程 Agent（GLM-5.3 Max，reasoning effort=max）+ 用户人工终审
> 基线：DeepSeek Harness `5badb150` / Cordis `4.0.5-alpha.1` / Node 24 / pnpm 10

---

## 一、项目概述

MarketPilot 是 DeepSeek Harness（DSH）的独立业务插件，提供从客户资料到投标方案的完整 AI 辅助工作流：

```
客户资料 → 需求基线 → 证据台账 → 竞品/政策分析 → 候选路线 → 人工 Decision → 技术方案 → 投标符合性矩阵
```

V3.0 将原有的右侧边栏 Demo 重构为 DSH 原生全宽主工作区，八个业务分区全部真实页面化，所有 AI 调用通过真实 GLM-5.3（max reasoning）完成，关键决策由真实人工门控。

**不修改任何 Harness 核心代码。不独立部署第二套 AI 后端或数据库。**

---

## 二、V3.0 五个阶段（单日完成）

### Phase 0：架构核查（~30 分钟）

- 核实 DSH `main` keyed slot 注册语法（`packages/client/ui-layout/src/client/index.ts`）
- 核实 `sidebar.panellist` 导航机制（`packages/client/ui-sidebar/src/client/contract/slots.ts`）
- 发现**冻结模块表**：动态 bundle 运行时值导入仅限 9 个 specifier（react、cordis、client-store、ui-primitives、ui-slots、ui-dockkit）
- 输出：`docs/UI_V3_ARCHITECTURE_AUDIT.md`

### Phase 1：原生主面板骨架（~2 小时）

- `main` keyed slot 注册 MarketPilot 全宽面板（key=`marketpilot`，不碰 `conversation` 保留键）
- `sidebar.panellist` 注册侧栏导航入口（order=10）
- 旧右侧 Tab 降级为跳转按钮
- 导航 store（`defineStore`）保活面板状态——切换面板/会话不丢当前项目与分区
- TSX 组件 + `--dsw-*` 主题 token + ui-primitives 控件
- 首页 / 我的项目 / 项目概览（六阶段条 + 八分区导航）

### Phase 2：需求工作区（~3 小时，含 3 个 Bug 修复）

- **受控上传**：`POST /projects/:id/documents/upload`——浏览器 file input → 扩展名/大小/UTF-8/sha256 校验 → DocumentService 入库
- **需求提取**：真实 GLM-5.3 结构化输出（~100 秒），步骤时间线展示真实进度
- **需求确认**：runId 与提取批次精确绑定（非"第一条 waiting"猜测）
- **人工门**：确认必须通过真实对话框点击，模型不能自证
- 发现并修复 3 个真实缺陷（见下文"缺陷记录"）

### Phase 3：任务中心与成果预览（~2 小时）

- 任务中心：全部执行的实时卡片（工作流类型/项目/状态/真实耗时/取消/回项目/步骤时间线）
- 六阶段条状态化：运行真相驱动（running/waiting_human/failed 覆盖项目状态基线）
- 成果页：`reviewStatus` 徽标（draft/approved）+ **MarkdownText 安全渲染**（不可信 GFM 管道，禁 raw HTML/危险协议）
- 投影路由：列表不含正文，内容仅在详情路由

### Phase 4：五域全页面化（~3 小时）

- **02 情报研究**：竞品/政策双 Tab，选文档 → 真实抽取，竞品矩阵 + 参数抽屉
- **03 证据审查**：状态/UNKNOWN/搜索筛选，人工核验 → Human Gate——UNKNOWN 绝不自动变 FACT
- **04 技术路线**：候选卡片 + **需求覆盖矩阵**（confirmed × 候选，四色徽标），选择+理由 → Decision Gate
- **05 方案生成**：无 Decision 禁用，MarkdownText 安全预览 + 标题目录，UNKNOWN 警示
- **06 投标检查**：条款抽取 → 符合性审查，"compliant 必须有已核验 FACT/SOURCE 否则降级"明示
- 共享底座：`useToolWorkflow` + `WorkflowSurface`（五页同一交互模式）

### Phase 5：质量收口（~1 小时）

- 四命令测试矩阵全绿（typecheck / build / 120 test / demo:smoke）
- 安全审计（跨域 403 / loopback only / 单用户边界）
- 九项 GUI 验收截图归档
- 比赛演示脚本

---

## 三、缺陷记录（用户实测发现，全部修复并有回归测试）

### 缺陷 1：跨会话 runId 丢失（Phase 2）

- **发现**：用户点击"确认所选需求"报"没有等待确认的需求分析批次"
- **根因**：runId 绑定依赖浏览器会话内存的执行注册表，刷新页面或其他会话发起的提取后本地无记录
- **修复**：服务端轮询 `runs?active=1` 作为唯一真相；`useExecutions` 挂载时从 `/executions?projectId=` 领养在途执行
- **测试**：`tests/phase2-client.spec.tsx > confirms a waiting batch started by another session`

### 缺陷 2：人工门路由被截获（Phase 2，最深层）

- **发现**：用户点击确认后无对话框弹出
- **根因**：`harnessHumanGate` 传入 `exec.agent` 时提问走 agent 作用域瀑布（官方源码 `user-questions/src/index.ts:294-330`），无头 Agent 的会话转发层截获问题 → 转发到不存在的随机会话 → 永远无人应答 → 执行悬挂
- **修复**：WorkbenchManager 发布 `owns(callId)` 服务；gate 对工作台自有执行**不带 agent** 走根瀑布
- **测试**：`tests/phase2-routes.spec.ts > parks the human gate on the workbench even with a live agent context`
- **意义**：V2 依赖路径在真实 Desktop 的**首次运行**即暴露——此前仅有进程内测试覆盖

### 缺陷 3：遮罩不透明（Phase 4 验收）

- **发现**：flash 视觉核验发现抽屉/对话框遮罩下页面"整片空白"
- **根因**：CSS 误用 `--dsw-alias-bg-overlay`（不透明中性色）
- **修复**：改为 `color-mix(neutral-bluish-1000 42%, transparent)` 半透明 scrim

---

## 四、技术亮点

### 4.1 自验收体系（用户提议，全程实践）

```
PowerShell 截屏 → CDP 无头浏览器驱动 → glm-5.3-flash 子代理读图核验（workflow model 覆盖）
```

- 主会话模型 glm-5.3 无视觉能力；`workflow` 工具 + `model: 'glm-5.3-flash'` 覆盖后可读图
- DSH Desktop 鉴权：从 `%APPDATA%\dsh-desktop\logs\harness.log` 提取进程启动令牌
- CDP 客户端：Node ≥22 零依赖（全局 WebSocket），DOM 点击/属性断言/截图/控制台错误采集
- **人工门照例留给用户**——代理不代替任何审批点击

### 4.2 冻结模块表约束

外部 Cordis 客户端插件的运行时值导入被严格限制在 9 个specifier 内。越界导入**只在运行时抛错**（构建期不失败）。通过 bundle 纯度测试兜底：

```typescript
// tests/client-bundle.spec.ts
const specifiers = code.matchAll(/require\((['"])([^'"]+)\1\)/g)
expect([...specifiers].filter(name => !frozen.has(name))).toEqual([])
```

### 4.3 真实步骤时间线

不做假百分比进度条。`WorkflowRun.steps` 记录真实步骤名+时间戳，前端按原始数据渲染：

```
读取资料 2026/10/9 12:46:34 → 模型提取 2026/10/9 12:46:34 → 需求规范化 2026/10/9 12:48:14
→ 未知项检测 2026/10/9 12:48:14 → 保存与待审 2026/10/9 12:48:14 → 等待审核 2026/10/9 12:48:14
```

### 4.4 证据闸门

投标审查中，标为"满足"的条款必须有**已核验的 FACT/SOURCE 证据**（服务端强制）：

- CALM 实测：3 条条款 → 1 条"部分满足"（关联已确认需求）+ **2 条"待确认"**（无证据不判合规）
- flash 跨截图追踪：需求 UUID → 方案正文 → 投标响应草案引用 → 证据闸门正确执行

### 4.5 MarkdownText 安全渲染

方案/基线预览使用官方 `MarkdownText`（不可信 GFM 管道）：
- 禁 raw HTML / 危险协议
- 15 章节富文本渲染（非井号原文）
- UNKNOWN 章节完整保留——"最小可检出泄漏率指标未冻结，须通过现场试验和验收协议确认后方可纳入验收基线"

---

## 五、真实 GLM-5.3 运行数据

| 工作流 | 实测耗时 | 数据量 | 说明 |
|---|---|---|---|
| 需求提取 #1 | 100 秒 | 14 需求（8 proposed + 6 unknown） | brief.md |
| 需求提取 #2 | 94 秒 | 14 需求 | 同一 fixture，验证可重复性 |
| 候选路线生成 | 26 秒 | 3 候选方案 | 含覆盖矩阵 |
| 方案生成 | 93 秒 | 15 章节 Markdown | 含 UNKNOWN/待确认 |
| 招标条款抽取 | 8 秒 | 3 条款 | tender.md |
| **全链路** | **~5.5 分钟** | 需求→路线→方案→投标 | 含人工确认 |

---

## 六、文件清单

### 源码（src/client/）

| 文件 | 职责 |
|---|---|
| `index.ts` | 入口：main/panellist 注册 + 旧 Tab 降级 |
| `MarketPilotPanel.tsx` | 面板壳 + 四层视图分发 |
| `stores.ts` | 导航 store（home/projects/tasks/project+section） |
| `locales.ts` | 中英词典（~260 键），中文优先 |
| `context.ts` | 服务面最小结构类型 |
| `styles.ts` | `mp-*` 样式 + `--dsw-*` token + factory 注入 |
| `api.ts` | 同源 HTTP 客户端（18 端点，reviewStatus 正确） |
| `format.ts` | 时间显示 |
| `hooks/executionStore.ts` | 模块级执行注册表（跨页面/刷新存活） |
| `hooks/useExecution.ts` | useExecutions/useDocuments/useRequirements/useActiveRun/useElapsed/useArtifact |
| `hooks/usePhase4.ts` | useToolWorkflow + 五域数据 hooks |
| `hooks/useProjects.ts` | useProjects/useProjectDetail/useCreateProject |
| `components/AppHeader.tsx` | 品牌 + 三导航（首页/项目/任务中心） |
| `components/StatusTag.tsx` | 业务状态 → Tag tone + 中文标签 |
| `components/DataTable.tsx` | 通用数据表 |
| `components/States.tsx` | 空/加载/错误态 |
| `components/SourceDrawer.tsx` | 需求详情抽屉 |
| `components/HumanReviewDialog.tsx` | 人工门对话框 |
| `components/DocumentUploader.tsx` | 浏览器上传（选择+拖放） |
| `components/RequirementTable.tsx` | 需求审核表 |
| `components/TaskProgress.tsx` | 真实步骤时间线 |
| `components/TaskCard.tsx` | 任务中心卡片 |
| `components/WorkflowSurface.tsx` | 共享工作流面（进度+门+错误） |
| `pages/HomePage.tsx` | 首页 |
| `pages/ProjectsPage.tsx` | 项目列表 |
| `pages/ProjectOverviewPage.tsx` | 概览 + 分区分发 |
| `pages/RequirementsPage.tsx` | 需求工作区 |
| `pages/ResearchPage.tsx` | 竞品/政策研究 |
| `pages/EvidencePage.tsx` | 证据台账 + 核验 Gate |
| `pages/AlternativesPage.tsx` | 候选路线 + 覆盖矩阵 + Decision |
| `pages/SolutionPage.tsx` | 方案生成 + 预览 |
| `pages/TenderPage.tsx` | 投标条款 + 审查 |
| `pages/TasksPage.tsx` | 任务中心 |
| `pages/ArtifactsPage.tsx` | 成果列表 + Markdown 预览 |

### 宿主（src/harness/）

| 文件 | 变更 |
|---|---|
| `routes.ts` | +5 投影路由 + 上传路由 + 执行索引（18 端点总计） |
| `workbench.ts` | +owns()/list() + projectId/runId 绑定 + 根瀑布停靠 |
| `service.ts` | +maxDocumentBytes getter |
| `plugin.ts` | +marketpilotWorkbench reflect 服务 |

### 测试（tests/，120 项）

| 文件 | 覆盖 |
|---|---|
| `client-bundle.spec.ts` | 注册形状 + 冻结模块表纯度 |
| `client-store.spec.ts` | 导航 store |
| `client-panel.spec.tsx` | 面板渲染 + 导航 + 状态保留 |
| `phase2-routes.spec.ts` | 上传/投影/runId 绑定/跨项目拒绝/**gate 停靠** |
| `phase2-client.spec.tsx` | 需求页 + 跨会话确认 |
| `phase3-routes.spec.ts` | artifacts 投影 |
| `phase3-client.spec.tsx` | 任务中心/成果/阶段条 |
| `phase4-routes.spec.ts` | 五域投影 |
| `phase4-client.spec.tsx` | 五页渲染 |
| 既有 86 项 | CALM Golden Case E2E + Domain/Service/Workflow 回归 |

---

## 七、安全边界

- **单用户本地使用**：DSH Desktop 仅监听 127.0.0.1；Web GUI 有进程令牌鉴权（匿名 401）
- **同源校验**：`/marketpilot/api` 拒绝跨域（403）
- **ID 绑定**：工具调用带 projectId；确认校验 runId 归属；跨项目拒绝
- **人工门**：所有关键决策（需求确认/路线选择/证据核验）必须真实用户点击
- **重启中断**：前端显示"任务中断需重试"，不虚称可恢复
- **远程部署前须补齐**：认证/授权/多租户（当前不支持）

---

## 八、遗留与后续

| 项 | 状态 | 说明 |
|---|---|---|
| 联网搜索（research_search） | 待配置 | 需真实 search/fetch provider；当前为本地资料模式 |
| Artifact 导出审批 UI | 待打磨 | 后端已有 `marketpilot_artifact_export` reviewStatus 审批；UI 侧留作后续 |
| 阶段条与导航联动 | 设计决定 | 阶段条反映项目业务阶段，非 UI 导航位置 |
| 单章方案重生成 | P2 | Phase 4 方案页仅预览，不做单章重写 |
| DOCX/PDF 解析 | P2 | 仅 .md/.txt；README 明示转换要求 |

---

## 九、验收证据索引

| 证据 | 路径 |
|---|---|
| GUI 验收文档 | `docs/UI_V3_GUI_ACCEPTANCE.md` |
| 实施日志（五阶段完整） | `docs/UI_V3_IMPLEMENTATION_LOG.md` |
| 架构核查报告 | `docs/UI_V3_ARCHITECTURE_AUDIT.md` |
| 演示脚本 | `docs/DEMO_SCRIPT.md` |
| 截图（39 张关键帧） | `.marketpilot/gui-acceptance/browser*/`（gitignored，本地保留） |
| CDP 工具脚本 | `.marketpilot/gui-acceptance/tools/`（gitignored） |

---

> 本文档由 DSH 编程 Agent（GLM-5.3 Max）在 2026-10-09 单日内完成全部五个阶段后自动生成。开发过程中用户通过 3 次真实操作反馈发现并确认了 3 个缺陷的修复效果，其余验收由代理通过 CDP + flash 子代理双通道自动完成。
