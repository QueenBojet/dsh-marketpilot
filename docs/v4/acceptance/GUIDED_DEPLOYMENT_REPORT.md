# V4 需求澄清版正式部署记录

日期：2026-10-14。用户授权按本轮版本构建部署并提交、推送 GitHub。正式 Desktop 已完成更新和重启，功能分支为 `feat/v4-guided-discovery`；本次不合并 `main`。

## 部署与恢复点

- 正式 Profile 的 `node_modules/dsh-marketpilot` junction 指向 `E:/PythonProjects/Work_Platform/marketpilot`，已核对真实加载路径。
- 更新前备份旧 `lib/`、`client/`、正式 `marketpilot.json` 和 Profile 配置至 `.marketpilot/deploy-guided-20261014-142223/`。备份位于 Git 忽略目录，不推送正式数据及配置。
- 通过 Desktop“应用 → 退出”正常退出；确认原主进程 17668 和 Harness 2600 均退出，仅保留隔离服务。
- 在正式插件目录运行 `npm run build` 成功，再启动安装版 DSH Desktop。新主进程为 30576，Harness 为 49560，正式服务仍使用 `127.0.0.1:43129`。
- 正式 HTTP 工作台页面与本次构建逐字相等，SHA-256 为 `1e0f2796555cfe53f8b720aad4ef04330203a5a0814aea88310eb0b8ad6c628d`。见 [核对记录](guided-deployment/verification.json)。

需要回退时，先正常退出 Desktop，再用上述备份恢复根目录构建文件并重启。本次没有转换或迁移项目数据，不应为代码回退而覆盖后续业务数据。

## 正式部署后的实际页面核对

1. 实际点击 Desktop 侧栏“MarketPilot 智策”，插件首页和“打开 V4 独立工作台”入口可用。
2. 在正式服务打开 V4 页面，项目列表显示 11 个项目；打开新建项目弹窗后取消，没有创建正式测试数据。
3. 打开模型弹窗，从原 `okai-glm` 切换到 `okai-qwen`，模型列表显示 `qwen3.8-flash` 与 `qwen3.8-max`，并可选中前者。取消后保持原模型设置。见 [截图](guided-deployment/01-provider-selection.jpg) 和 [页面状态](guided-deployment/01-provider-selection.txt)。
4. 只读进入已有的 `V3.3 M1 GUI 空项目 · synthetic QA`，点击“需求访谈”，看到新页面及“开启需求访谈”按钮；未点击开启，项目仍为修订 0。见 [截图](guided-deployment/02-legacy-discovery.jpg) 和 [页面状态](guided-deployment/02-legacy-discovery.txt)。

正式环境仅进行上述部署后页面核对；访谈、研究、模板上传和写入流程的完整功能验收仍使用隔离合成项目，记录在 [功能验收报告](GUIDED_DISCOVERY_REPORT.md)。没有在正式 CALM 项目运行 AI、确认需求或修改资料。

正式项目存储部署前后 SHA-256 均为 `10feff86648afe51429214887165d3d89e9283fbc9b4d1d3f53b3ae54da327bd`，文件未变。

## 发布前检查与 Git 范围

- 当前最终源码全量回归：49 文件通过、2 跳过；383 测试通过、3 跳过。见 [日志](guided-deployment/tests.log)。
- `npm run typecheck`、正式目录完整构建通过，见 [构建日志](guided-deployment/build.log)。
- 提交包含本轮源码、测试、README 与合成验收证据。四个先前已删除的 Word 锁文件和未跟踪的 `docs/competition-2026/` 留在工作区，不纳入本次提交。
- 新版使用方式：Desktop → MarketPilot 智策 → 打开 V4 独立工作台。原生旧面板作为兼容入口继续保留；完整的新需求流程在 V4 工作台中使用。既有项目须在“需求访谈”页显式开启新流程。

联网证据充分性及复杂 Word 模板兼容性边界继续以功能验收报告为准。
