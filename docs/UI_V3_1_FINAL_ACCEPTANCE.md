# MarketPilot UI / UX V3.1 — 最终验收报告（FINAL ACCEPTANCE）

> 日期：2026-10-10
> 执行：DSH 编程 Agent（GLM-5.3 Max）+ 用户分阶段验收（UX-1/2/3/4 均经问答确认通过；UX-5 经用户授权“直接完成全部”）
> 基线：Git tree `70631a8bcb191b94865a087d7e661696ec21c4fb`（V3.0 完成态）
> 验收环境：正在运行的 DSH Desktop Web GUI（127.0.0.1，真实项目数据，8 个项目），Chrome headless + CDP 驱动，glm-5.3-flash 读图核验
> 依据：`docs/MarketPilot_UI_V3.1_审查与交互优化设计.md`；过程记录见 `docs/UI_V3_1_AUDIT.md`

---

## 一、总结论

V3.1 六个阶段（UX-0 审查、UI-R1 信任修复、UX-1…UX-5）全部完成。**未修改 DSH Core、未改 Agent Loop、未动 Human Gate 审批链路、未删除任何数据库/项目/记录**；后端仅按用户明示批准扩展了 `marketpilot_evidence_verify` 的两个人工动作。验证矩阵全绿：typecheck ✅ / build ✅（238.07 kB）/ **test 134/134**（基线 120 + 新增 14）/ demo:smoke ✅（离线 fixture：12 model calls / 8 tool calls / 197 ms）/ 全部 live GUI 会话页面错误 0。

## 二、与基线相比的改变（按设计文档验收清单对照）

| 验收清单项（设计文档 §10） | 结果 | 证据 |
|---|---|---|
| DSH 左栏可访问聊天；点击 MarketPilot 进入完整主面板 | ✅ 未动宿主壳 | 全部 live 会话 |
| 主面板清楚识别当前项目/阶段/下一步 | ✅ | ProjectHeader 统计 chips + ProjectStageNav 状态点 + NextActionCard（ux1-02） |
| 浅色/深色/宽屏/1366/1024 无重叠截断 | ✅ | ux1 三宽度 overflow=false + 深色套图；1024 导航折叠 row/wrap 实测 |
| 首页不再永久 `—` 占位 | ✅ | 实测 `8项目 / 4待审核事项 / 0进行中任务` + 待办列表（ux1-01；失败显“暂无数据”，有单测） |
| 需求提取 settle 只刷新一次；跨会话 runId 恢复 | ✅ | `settles one completed confirm exactly once` 单测；runId 服务器真相机制未动 |
| 上传逐文件成功/失败反馈 | ✅ | 实测 `✗ 不支持的格式.docx — …`，未发请求、无服务端写入（ux2-02） |
| UNKNOWN 核验不默认 FACT，有理由与来源 | ✅ | 表单默认空占位（单测+实测）；七选项含人工“保持未知/驳回”（后端已扩展，禁止自动路径） |
| 研究界面标注本地模式；参数/来源可点开 | ✅ | 本地模式常显工具条；参数徽章 UNKNOWN 可点开抽屉（ux3-01） |
| A/B/C 并排比选 + 覆盖矩阵关联 confirmed MUST | ✅ | `cardTops [283,283,283]` 三卡同视口；MUST 行优先（ux3-03） |
| 方案最新版本 + 目录点击定位 + 长文完整阅读 | ✅ | updatedAt 降序选版 + 版本条；1202px 三栏阅读器（目录/正文/UNKNOWN 栏，ux4-01） |
| 投标“审查所选”只传所选；“审查全部”分离 | ✅ | 按钮计数动态、零选择禁用；单测断言两次提交的 tenderItemIds |
| 取消/错误提示/当前阶段统一 | ✅ | WorkflowSurface 运行中真实取消（单测断言 cancel 路由）；阶段导航 run-真相失效刷新 |
| 所有审批走真实 Human Gate | ✅ | 决策/核验/导出全部经 gate 停靠对话框（各有单测）；代理从未代答 |
| 既有测试/构建/CALM 演示路径可用 | ✅ | 134/134；CALM live 全分区点击通过（ux5-facts 7/7 present） |

## 三、截图清单（39 张截图 + 7 份 DOM facts，`docs/gui-acceptance/v3.1/`，随仓库提交；CDP 工具脚本在 gitignored `.marketpilot/gui-acceptance/tools/` 本地保留）

| 目录 | 内容 |
|---|---|
| `ux0/`（16） | 改版前基线：首页/项目/需求/研究/证据/路线/方案阅读器/投标/任务 + 深色 ×4 + 1024 窄视口 |
| `ux0-r1/`（4） | UI-R1 后：投标所选、宽阅读器（浅/深）、证据核验表单 |
| `ux1/`（6） | 新首页/新项目壳（1440/1366/1024/深色×2） |
| `ux2/`（3） | 需求排序、上传逐文件结果、核验七选项表单 |
| `ux3/`（4） | 参数徽章、政策抽屉、三卡并排 + 决策条（浅/深） |
| `ux4/`（3） | 三栏阅读器、导出审批条、证据跳转 |
| `ux5/`（4） | 终验：首页、概览、成果、任务中心 + CALM 全分区点击事实 |

读图核验：glm-5.3-flash 子代理（workflow model 覆盖），关键帧全部经“期望内容→是否匹配→可见问题”三问核验；个别读图代理超时的帧以 DOM 断言为最终证据（已在过程记录中标注）。

## 四、运行数据

- live 每轮会话 `Runtime.exceptionThrown` + console error = 0（ux0/ux0-r1/ux1/ux2/ux3/ux4/ux5 全部）。
- 深色主题经真实设置 UI 切换、拍摄后浅色已恢复（每轮断言 `light restored: true`）。
- 离线 CALM Golden Case（`marketpilot:demo:smoke`，新进程，走扩展后服务端代码）：12 model calls / 8 tool calls / 197 ms / humanWaitMs 19——**离线 fixture 数据，非真实联网推理**。
- 真实 GLM-5.3 链路本轮未重跑（V3.0 已验收；V3.1 未改模型路由/Workflow），与设计文档“不必每改一个按钮就耗费数分钟”一致。

## 五、修改文件清单（未提交，工作区待审）

- 新增组件：`ProjectHeader / ProjectStageNav / NextActionCard / ProjectActivity`（UX-1）、`useDrawerKeys`（UX-5）。
- 客户端修改：`pages/{HomePage, ProjectOverviewPage, RequirementsPage, ResearchPage, EvidencePage, AlternativesPage, SolutionPage, TenderPage, ArtifactsPage}.tsx`、`components/{AppHeader 未动, DocumentUploader, HumanReviewDialog, RequirementTable, SourceDrawer, TaskCard, TaskProgress, WorkflowSurface}.tsx`、`hooks/useExecution.ts`、`format.ts`、`styles.ts`、`locales.ts`。
- 后端（用户批准的扩展）：`services/evidence.ts`、`tools/evidence.ts`（targetKind + UNKNOWN/REJECT，人工专用）。
- 测试：`client-panel / phase2 / phase3 / phase4 / services` 五个 spec 更新与新增。
- 文档：`docs/UI_V3_1_AUDIT.md`（过程）、本文件（终验）。

## 六、未完成项 / 已知边界

1. **宿主重启前，live 工作台无法提交“保持未知/驳回”**：Desktop 进程内存中仍是旧服务端代码；客户端表单已就绪，服务端行为由单测 + 新进程 smoke 证明。下次 Desktop 重启后即完全生效（不代用户重启，会中断会话）。
2. 首页“待审核事项”来自 run 记录的 waiting_human：宿主重启遗留的僵尸 waiting 记录也会计入——真实数据、诚实显示；可在后续把“中断”标识延伸到首页统计（UX-5 任务中心已按 lost 记录报告中断）。
3. 焦点陷阱为轻量 Tab 循环（useDrawerKeys）；HumanReviewDialog 未换成 ui-primitives `Modal`（gate 语义要求 Escape 不得默认作答）——后续可评估以 `headless` 模式包一层获得官方焦点管理。
4. 竞品参数徽章取前三个参数；完整参数在抽屉。横向 2-4 产品对比矩阵仍为 P1（设计文档原文）。
5. 需求逐字段编辑（P1）、单章方案重生成（P2）、DOCX/PDF 解析（P2）保持设计文档原优先级未动。

## 七、安全与红线复核

- 冻结模块表测试持续通过（client-bundle.spec 与上游 `PLATFORM_MODULES` 一致，无新增 npm 依赖）。
- 桌面令牌仅运行时内存读取，未落入任何文件/文件名/日志。
- 人工门全部真实：需求确认、路线 Decision、证据核验、成果导出均停靠真实审核对话框；代理全程未代答。
- 导出仅填表演示，未提交过任何真实文件写入；上传仅走“被拒格式”路径，未写入用户数据。
- 深色切换经真实设置 UI，拍后恢复浅色。

> 本文档由 DSH 编程 Agent 生成；UX-1…UX-4 由用户逐阶段确认，UX-5 按用户 2026-10-10 指示“不需要审批，直接完成全部 UX”执行。
