# MarketPilot V4.0 本机 GUI 验收报告

日期：2026-10-13（Asia/Shanghai）。结果：**BLOCKED，Desktop 与工作台 GUI 未完成验收**。

本轮确实连接了用户 Windows 本机，通过 `@oai/sky` 枚举到真实应用和窗口，并启动了安装版 DSH 内置的真实 Harness。随后 Computer Use 自动安全检查因无法可靠确定浏览器当前 URL 而终止本轮操作。工作台页面尚未打开；没有执行上传、模型调用、Human Gate、报价、DOCX 或版本发布。没有使用云端 localhost、mock 服务、离线 HTML、模拟响应或旧截图代替本轮证据。

## 指令、分支与环境

- 已读取的验收指令实际位于父工作区：`E:\PythonProjects\Work_Platform\docs\v4\prompts\02_本机ComputerUse_完整自动验收.md`。项目内同名路径不存在。
- 项目：`E:\PythonProjects\Work_Platform\marketpilot`。
- 分支：`feat/v4-workbench-foundation`；HEAD：`5c50e122e8e26bfe18aece7e386ddb282e85e19b`。没有切换分支、合并 main 或提交文件。
- 已有未跟踪目录 `docs/competition-2026/` 保留。
- 本机：Windows；安装版 DSH Desktop：0.11.0；内置 Electron Node：24.17.0。
- 原生 Desktop 最初没有运行；本轮没有启动原生 Desktop 窗口。
- 原生应用、浏览器及 Word 的本机枚举成功；Word 被发现为已安装、未运行，未实际打开文件。
- Browser Use 的 Edge/Chrome 扩展发现接口另报 `nodeRepl.fetch request failed`；没有因此改用云端浏览器。

## 原生 Desktop 隔离阻断

安装版 `resources/app.asar/out/main/index.js` 的 `configureAppIdentity()` 固定执行：

```js
app.setPath("userData", join(app.getPath("appData"), "dsh-desktop"));
```

其 `launchHarness()` 随后执行：

```js
const dshHome = join(app.getPath("userData"), "harness");
```

安装版未提供已确认可用的 `DSH_DESKTOP_USER_DATA_DIR` 隔离入口。仅设置 `DSH_HOME` 不能保证原生 Desktop 使用测试存储。为避免正式 Profile 被启动维护、插件迁移或数据写入影响，本轮没有启动该原生入口，也没有更改其安装文件或正式 Profile。

替代准备仅是**真实安装版 Harness 的隔离启动**，不是 Desktop 原生窗口实测，且尚未完成其 GUI 验收。

## 隔离宿主与数据

| 项目 | 实际值 |
| --- | --- |
| 隔离根目录 | `C:\Users\zjdzc\AppData\Local\Temp\marketpilot-v4-gui-isolated-C0MRRc` |
| Profile | `<隔离根>/harness/profiles/web` |
| DSH_HOME | `<隔离根>/harness` |
| 可写存储 | `<隔离根>/harness/storages` |
| 插件 | `<隔离根>/plugin`，本轮构建后的独立复制件 |
| 依赖 | 复用现有目录链接；未安装或更新共享依赖 |
| 监听地址 | `127.0.0.1:3180`，由本机 TCP 监听记录确认 |
| 待访问工作台 | `http://127.0.0.1:3180/marketpilot/workbench`，**未导航、未验证响应** |
| Harness PID | `49472`，已核对路径和启动参数后关闭 |
| 停止后端口 | 3180 已无监听 |

使用 `scripts/prepare-v4-isolated.mjs` 准备复制件；其最初复制旧 M0 备份。**在启动宿主前已将隔离 JSON 的 `projects` 表清空**，未在 GUI 显示旧项目。最终隔离项目数仍为 0。

第一批与第二批合成 CALM 文本已分别保存到隔离根目录的 `uploads/batch1.txt` 和 `uploads/batch2.txt`；没有上传。预定测试项目为 `V4 GUI 验收 - CALM 合成案例 - 2026-10-13`，尚未创建。

原 Profile 的 Provider 与默认模型配置曾仅复制到本地隔离 Profile，以便后续真实调用；没有在日志、报告或仓库证据中输出密钥。默认路由为 `zai / glm-5.3-flash / max`，**配置存在不等于调用成功**。结束时已从隔离 patch 移除 Provider 和默认模型配置，保留无凭据的测试环境。

宿主通过安装版 `harness-node-entry.mjs` 和安装包内 `@deepseek-ai/dsh/lib/bin.js` 启动 `web --no-open`，不是仓库 demo/mock。启动输出确认运行时、入口、工作目录和隔离 DSH_HOME；TCP 记录确认 PID 与回环端口。未取得 Web Server 打印的完整地址日志，因此不把推导工作台 URL 当作成功打开证据。

## 实际交互与终止原因

| 步骤 | 预期 | 实际观察 | 状态 |
| --- | --- | --- | --- |
| 初始化 `@oai/sky`，枚举应用 | 连接本机 | 返回 Windows 本机应用、浏览器、文件资源管理器和 Word | PASS（本机能力发现，非产品 GUI 验收） |
| 构建插件 `npm run build` | 生成真实插件 | 退出码 0；workbench 288.7 KiB；client 462.19 kB | PASS（本机命令实测） |
| 准备独立 Profile 与空存储 | 不写正式项目 | 实际隔离路径已生成，启动前清空复制件项目表 | PASS（本机文件检查） |
| 启动安装版真实 Harness | 独立回环监听 | PID 49472 在 127.0.0.1:3180 监听 | PASS（本机进程/TCP 检查） |
| 在真实 Edge 发送 Ctrl+N | 新建验收窗口 | 返回“新建标签页 - 个人 - Microsoft Edge”，窗口 ID 7013886 | PASS（本机 GUI 实机操作，仅浏览器准备） |
| 在该窗口请求 Ctrl+L 并读取地址栏 | 定位地址栏后输入工作台 URL | 工具返回安全终止信息，无法确认该动作及后续状态 | BLOCKED |

自动安全检查的原文：

```text
Computer Use has been stopped for this turn because it could not determine the current browser URL on Windows with enough confidence to enforce policy. Stop your work and send a final message noting why Computer Use ended.
```

收到该结果后未继续发出任何 GUI 输入，未尝试绕过安全检查或借其他 GUI 接口继续操作。

## 必须场景的验收状态

`NOT_TESTED` 表示尚未执行；下表所列场景均受上述环境阻断影响。没有观测到产品行为时不记为产品 `FAIL`，也不推断产品功能可用。

| 场景 | 状态 | 本轮证据或缺口 |
| --- | --- | --- |
| A：原生 Desktop 插件入口、独立工作台打开 | BLOCKED | 原生 Desktop 隔离入口未确认可用；浏览器输入随后被安全检查终止 |
| A：全部全局工作区与项目分区导航 | NOT_TESTED | 工作台未加载；无页面截图 |
| A：1440 / 1024 / 390、滚动、抽屉、弹窗 | NOT_TESTED | 未调整显示尺寸或验证布局 |
| B：第一批上传、轻提示、深度分析、来源与人工需求确认 | NOT_TESTED | 合成文件已准备；未上传、未调用模型 |
| C：研究、AI 对话、模型选择、真实响应 | BLOCKED | 默认模型已识别；未发起调用，无执行 ID、响应或成功路由证据 |
| C：Web Provider 搜索、真实来源 URL、抓取网页正文 | BLOCKED | 未检查运行时 Provider 可用性；不得推断为“未配置”或“真实联网通过” |
| D：两条路线、选择草稿、Human Gate、配置 | NOT_TESTED | 未创建测试项目或路线，未点击确认 |
| E：BOM、数量联动、人工数量、CNY、税费与审核 | NOT_TESTED | 没有成本行或金额操作 |
| E：1000→1200 审核失效、缺汇率分币种小计 | NOT_TESTED | 没有测试价格或币种写入 |
| F：中性技术/成本 DOCX、A4 预览、下载 | NOT_TESTED | 没有生成、预览或下载文件 |
| F：本机 Microsoft Word 打开、中文字体、表格、分页 | NOT_TESTED | Word 已安装，但没有可验收的本轮导出文件，未启动 Word |
| F：V1、第二批增量资料、过期阻断、V2、版本差异与不可变基线 | NOT_TESTED | 没有发布任何版本 |
| G：重启后的项目、研究、成本与版本持久化 | NOT_TESTED | 隔离宿主只启动后停止一次，项目数 0；不构成持久化验收 |
| G：本轮安全 V3.4 回退与 V4 恢复 | NOT_TESTED | 已阅读历史回退报告；准备脚本的 dry-run 与历史测试不能替代本轮 GUI/宿主往返 |
| H：模型/联网错误态、PDF、失败上传、无效输入、审核与发布阻断 | NOT_TESTED | 未在工作台触发异常场景 |
| H：监听范围 | PASS（本机 TCP 实测） | 仅观测到本轮宿主在 127.0.0.1:3180 监听；未配置公网/局域网入口 |
| H：浏览器 Console/Network、关键按钮真实行为 | NOT_TESTED | 页面未打开，未取得 Console/Network 证据 |

本轮**没有任何 MarketPilot 业务 GUI 功能被标为 PASS**。产品 FAIL 数为 0 仅表示未观测，不能据此判断没有缺陷。

## 截图、日志与安全校验

证据目录：`desktop-gui/`。

- `preflight.json`：最初净化隔离环境准备结果；后续清空项目与临时 Provider 配置变化见本报告及最终记录。
- `interactions.json`：实际工具动作、自动终止信息与未完成边界。
- `build.log`：本轮构建输出。
- `final-safety-check.json`：原件/备份 SHA、最终空存储、分支和端口关闭状态。

**实际截图数量：0。** 本轮在取得产品截图前被终止，没有复制旧截图或合成截图。未取得页面 Console、Network、后端运行 ID、真实模型响应、网页正文或 Word 截图。

正式存储：`%APPDATA%\dsh-desktop\harness\storages\marketpilot.json`。
M0 备份：`E:\PythonProjects\Work_Platform\marketpilot-backups\20261012-225649-v4-m0\marketpilot.json`。

两者开始和结束的 SHA-256 均为：

```text
669636b62c40dd2c87b78d05e578c2529bb85f064cc76d780f4eeee48fec6f20
```

最终复核 `productionUnchanged=true`、`backupUnchanged=true`、`isolatedProjectCount=0`、`listenerStopped=true`。没有修改正式 CALM 项目、正式 Profile、安装版 Desktop 文件；没有对外发送文件、创建公网隧道或合并 main。只关闭了本轮创建且核对准确身份的隔离 Harness。

## 完成边界

本轮完成了真实本机能力发现、构建、数据隔离准备、真实安装版 Harness 回环启动以及正式数据 SHA 复核。完整 Desktop GUI 验收仍被环境安全检查阻断。需要可可靠识别浏览器 URL 的本机 Computer Use 通道，并确认原生 Desktop 可安全隔离后，才能继续未测试场景；本报告不声明“Desktop 已验收”或“本机 Harness GUI 已测”。
