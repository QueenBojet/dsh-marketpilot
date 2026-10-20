# MarketPilot V4

MarketPilot（智策）是 DeepSeek Harness（DSH）的工程方案工作台插件，覆盖 **需求访谈 → 精选资料 → 多路线初筛 → 定向研究 → 综合决策 → 成本报价 → 模板文档与交付**。业务代码独立于 Harness 核心，所有在线 AI 能力通过 DSH 实现。

V4 已通过 [PR #1](https://github.com/QueenBojet/dsh-marketpilot/pull/1) 合并到 `main`（merge commit：`7605353`）。V4 是产品功能版本；当前 `package.json` 包版本仍为 `0.1.0`。

- [产品实际操作验收](docs/v4/acceptance/DESKTOP_GUI_REPORT.md)：浏览器、Desktop 隔离复制件、Word 的操作结果与证据。
- [DSH AI 与研究 Skill](docs/v4/acceptance/DSH_AI_RUNTIME.md)：模型、搜索 Provider、技能注入与适用版本。
- [需求澄清与路线探索验收](docs/v4/acceptance/GUIDED_DISCOVERY_REPORT.md)：本轮七项改进、隔离页面操作、Word 模板交付和验证边界。
- [限制与验证边界](docs/v4/acceptance/RISKS_AND_LIMITS.md) · [数据回退与恢复](docs/v4/acceptance/ROLLBACK.md)。

**功能分支状态（2026-10-14）**：下述需求访谈、精选支撑、多路线探索、分方向研究和模板撰写新增流程已在 `feat/v4-guided-discovery` 完成隔离验收，并按授权构建部署到本机正式 Desktop、重启及完成页面点击核对；代码在功能分支提交和推送，尚未合并 `main`。详见 [正式部署记录](docs/v4/acceptance/GUIDED_DEPLOYMENT_REPORT.md)。

## V4 能做什么

| 工作区 | 主要能力 |
| --- | --- |
| 项目总览 | 项目状态、需求确认进度、待办、发布前检查与文档状态 |
| 需求访谈 | DSH 多轮追问、辅助资料选择、可编辑需求简报、独立人工确认 |
| 资料与变更 | 原文上传、精选结构化支撑摘要、原文摘录定位与人工固化；保留历史变更审阅 |
| 智能研究 | 按候选路线与具体方向建立研究、人工确认计划、本地/联网/混合研究、来源与发现追溯 |
| 方案与决策 | 工业可行性多路线初筛、研究综合与二次重组、最终候选人工决策、结构化设备配置 |
| 成本与报价 | 配置关联 BOM、数量与价格联动、税费、币种与汇率、独立审核 |
| 文档与交付 | 上传 Word 模板、按标题章节撰写、逐节审阅建议、A4 预览、人工审核与 DOCX 导出 |
| 正式版本 | 发布不可修改的 V1/V2/V3…快照，比较需求、路线、配置、成本及文档差异 |

资料上传支持 `.md`、`.txt`、`.csv`、`.docx`、`.xlsx`、`.pdf`。PDF 为尽力提取文本，不提供扫描件 OCR；无可提取文本、损坏文件和重复文件有明确处理。旧 V3 面板的资料导入仍仅支持 md/txt。

右上角统一选择 DSH 模型供应商、模型与思考强度，选择在当前浏览器中持久化并供各项目使用。研究资料库与运行记录提供来源、结果、实际模型路由及失败原因的追溯。

## 在 DSH Desktop 打开

1. 在已加载本插件的 DSH Desktop 中，进入左侧 **MarketPilot 智策**。
2. 点击 **打开 V4 独立工作台 ↗**，进入完整 V4 页面。
3. 也可使用当前 DSH 服务地址加 `/marketpilot/workbench`。端口以实际启动地址为准，不能假定始终为 3080。

V4 独立页面由宿主提供，无需另起前端开发服务器。Desktop 内原有面板继续保留，并提供 V4 入口。

### 更新已配置的本地插件

先确认实际 Profile 的 `dsh-marketpilot` 依赖指向哪个目录，并备份配置与项目存储。在该源码目录构建：

```powershell
cd E:\PythonProjects\Work_Platform\marketpilot
npm run build
# 完全退出 DSH Desktop（包括托盘进程），再重新启动。
# 进入 MarketPilot，点击“打开 V4 独立工作台 ↗”。
```

构建生成 `lib/`、`client/client.js` 及内联工作台页面；`skills/` 也是运行必需资源。若 Profile 使用安装副本，需要更新该副本；仅推送 GitHub 或合并 main 不会自动部署到 Desktop。不要在共享依赖 junction 的隔离 Profile 中执行依赖安装。

**本机部署记录（2026-10-14）**：正式 Desktop 的插件链接指向本仓库，已构建上述合并版本、配置搜索 Provider 并重启。正式服务返回页面与构建内容逐字一致，原10个项目和7个模型供应商可读取，项目存储 SHA-256 未变。本次窗口/浏览器自动化连接不可用，尚未完成正式部署后的 GUI 点击复核；不能把接口检查视为界面验收。Desktop 对开发目录的依赖链接曾报 `ELOOP` 并延后插件代际迁移，随后成功启动。2026-10-13 的完整 GUI 验收来自隔离环境。

**后续部署（2026-10-14 14:26）**：已按用户授权更新为需求澄清功能分支构建，正常退出并重启正式 Desktop。实际点击插件入口、模型供应商切换、新建弹窗及旧合成项目的需求访谈页；正式项目列表为 11 项，存储哈希保持不变。正式服务为 `http://127.0.0.1:43129/marketpilot/workbench`，返回页面与新构建逐字一致。完整流程写入仍只在隔离环境验收，详见 [部署报告](docs/v4/acceptance/GUIDED_DEPLOYMENT_REPORT.md)。

## AI、搜索与研究 Skills

**全部在线模型调用依赖 DSH**：资料分析、研究计划/报告/对话、候选路线和文档建议经过 Harness 结构化模型适配器与 `subagents`，使用宿主模型路由、取消信号和会话记录。MarketPilot 不自建厂商 SDK 客户端，不保存模型密钥；离线 adapter 仅用于显式测试与演示。

在 DSH 的模型管理中配置供应商与凭据，再在 V4 右上角选择模型。不限于 DeepSeek，已实测其他供应商路由。模型调用可用性仍取决于对应服务的凭据、额度和运行状态。

**搜索 Provider 与模型供应商分开配置。** 联网通过 DSH `ctx.web.search` / `ctx.web.fetch`；选择一个聊天模型不等于同时获得网页搜索能力，也不要求所有搜索都使用 `DEEPSEEK_API_KEY`。

已验证的组合为 DSH Desktop `0.11.0` 内置 DSH `0.2.0-rc.2` 与 `dsh-web-search-pro@0.2.1`。该搜索插件声明兼容 `>=0.2.0-rc.2 <0.2.1-0`，不能把此结论套到开发仓库的 `0.2.1-alpha.1`。插件需作为 Profile 的直接依赖及 bundle 加载；以下是关键配置，合并时保留现有配置及各环境自己的数据库路径：

```yaml
- id: web-search-pro
  config:
    registerProvider: true
    providerId: web-search-pro
    engines: [ddg, bing]
    enableCliBackends: false
    opencliEnabled: false
    agentReachEnabled: false
    provider:
      evidence: off
    evidence:
      jevMode: off
- id: web
  config:
    searchProvider: web-search-pro
    fetchProvider: web-search-pro
```

插件独立 LLM/Jev 评分关闭，模型生成继续经过 DSH。2026-10-13 已在隔离 Profile 实际搜索并抓取正文；2026-10-14 已将同版本配置到本机正式 Profile。详细技术记录见 [DSH_AI_RUNTIME.md](docs/v4/acceptance/DSH_AI_RUNTIME.md)，其中安装路径与搜索结果描述的是隔离验收当日环境。

研究技能位于 [skills/marketpilot-deep-research/SKILL.md](skills/marketpilot-deep-research/SKILL.md)，参考 [Deep-Research-skills](https://github.com/Weizhena/Deep-Research-skills)，保留 MIT 许可证及来源说明。支持 Skills 服务的 DSH 会注册技能；研究计划、对话和报告在模型调用前还会显式注入技能，运行记录保留技能指纹。缺失或无效的技能文件会明确失败。

仅成功抓取的网页正文才计作网页来源。仅联网研究没有本次正文时停止生成，不静默改用本地资料或旧网页；混合研究保留真实联网状态。能搜索、能生成报告不代表来源充分或结论已核实，研究发现仍需人工审阅。

## 推荐使用流程

1. 新建项目后先进行需求访谈，按需选取辅助资料。审阅并保存 AI 建议的简报，解决待澄清问题后单独人工确认。
2. 上传原始资料，精选与决策有关的事实、约束、接口和验收信息，附原文摘录并人工固化。上传本身不逐行生成需求或自动采纳全文。
3. 完成多路线头脑风暴，比较工业支撑、可行性和证据缺口；选择不同具体方向，关联候选路线并确认研究计划，再开展深入研究。
4. 至少形成两个不同方向的有效报告后，进行综合判断与二次头脑风暴。比较保留、舍弃与重组理由，选择最终候选并人工确认，填写设备配置。
5. 生成成本行、补充价格和税费，完成审核。混合币种缺少汇率时只显示分币种小计。
6. 上传含 Word 标题 1–3 或章节插槽的 `.docx` 模板，按模板创建文档并撰写，逐节审阅接受建议，核对预览后审核和导出。模板正文作为写作指导，不能充当工程事实。
7. 人工发布正式版本 V1。上传后续资料、替代旧需求或调整配置/价格后，重新核查失效的审核并同步文档，发布 V2。
8. 比较版本业务差异。对外发送需要人工登记，系统本身不发送邮件。

已发布版本不可改写。历史决策引用的需求保留原正文与确认；只有当前决策不再引用时，才允许将其标记为已替代。

已有项目保留原工作模式，可在需求访谈页显式开启新流程。需求、固化摘要、候选正文或研究范围变化后，应重新核查初筛、综合决策和文档依据；过期文档不能登记发送或用于发布。不兼容的模板需要新建文档，保留原文。

## 开发与构建

本仓库通过 `link:../deepseek-harness/...` 引用开发依赖，需要相邻的 Harness 源码与已安装依赖。既有开发基线为 Harness `5badb15009ae1756c3afe0ae0cef1faafc290ccc`，Node 24；这与 Desktop 内置运行时版本分别管理。

```text
Work_Platform/
├─ deepseek-harness/
└─ marketpilot/
```

首次准备环境时，在 Harness 仓库按其官方说明安装和构建，再在 MarketPilot 运行：

```powershell
pnpm install --frozen-lockfile
pnpm prepare:harness-types
pnpm prepare:harness-runtime
pnpm test
pnpm typecheck
pnpm build
```

`prepare:harness-types` 和 `prepare:harness-runtime` 生成相邻 Harness 包所需声明与运行时入口，不修改其源码。在依赖已就绪的本机，也可使用 `npm test`、`npm run typecheck`、`npm run build`。只更新工作台 bundle 可用 `npm run build:workbench`；部署仍应使用完整 build。

使用源码版 Harness 创建独立 Profile 的方式如下（在 Harness 仓库运行，要求其 CLI 已构建可用；已有 Profile 跳过创建步骤）：

```powershell
pnpm dsh marketpilot --from-default-profile web --dump-config
pnpm dsh plugin --profile marketpilot add ../marketpilot
pnpm dsh marketpilot --no-open
```

该流程不是替换 Desktop 正式 Profile 的指令。数据后端继承 Profile 的 storageDomain 配置；不要直接改变已有数据的后端。

### 验证

产品通过与否以真实操作为准，自动化测试作为补充。2026-10-13 的 [最终 GUI 验收](docs/v4/acceptance/DESKTOP_GUI_REPORT.md) 覆盖上传与异常拒绝、人工门取消、需求替代、真实模型与搜索、成本联动、V1/V2/V3、重启持久化、15组响应式页面检查，以及 Word 技术4页/成本3页逐页检查。补充回归为 **48文件通过、1跳过；372测试通过、1跳过**，类型检查和构建通过。

2026-10-14 的 [功能分支验收](docs/v4/acceptance/GUIDED_DISCOVERY_REPORT.md) 另外完成真实多轮访谈、四路线初筛、两方向联网研究、二次综合、人工决策、模板文档六页 Word 检查，以及依据变化后的失效阻断。全量回归为 **382 测试通过、3 跳过**；最后 GUI 修正后相关回归 **83 通过、1 跳过**，类型检查和隔离构建通过。真实搜索的型号级证据仍不足，不能将报告生成成功视为工程结论已核实。

正式部署前对最终源码再次执行全量回归：**383 测试通过、3 跳过**（49 文件通过、2 跳过），类型检查与正式构建通过，见 [部署验证](docs/v4/acceptance/GUIDED_DEPLOYMENT_REPORT.md)。

```powershell
npm test
npm run typecheck
npm run build

# 可选：在旧存储备份的复制件上验证只读兼容；目录需包含 marketpilot.json。
$env:MARKETPILOT_LEGACY_STORE = 'E:/path/to/backup-copy'
npx vitest run tests/v4-legacy-readonly.spec.ts
```

原有 CALM CLI 演示继续保留：`pnpm marketpilot:demo` 使用离线模型替身及真人终端确认；`pnpm marketpilot:demo:smoke` 使用明确标注的模拟人工。两者不读取模型密钥、不联网，不能用于证明在线模型质量或 V4 GUI 可用性。

## 数据与适用边界

- 单进程、单用户、回环地址使用。MarketPilot API 的同源检查及修改请求头不构成多用户认证，不应直接暴露到局域网或公网。
- 人工门、证据核验和版本快照不能被模型自动批准。证据结构与引用校验不等于技术真实性核实；演示价格与配置均为 `test_data`。
- 旧项目可读取，首次 V4 写入才创建对应状态；旧 artifacts 不会自动转成 V4 文档。运行中重启会将未完成任务标记为中断，需要重新发起。
- **有 V4 写入的数据不能直接交给 V3.4。** 使用 [回退指引](docs/v4/acceptance/ROLLBACK.md) 在复制件上转换/恢复；该工具仅支持官方 single-file JSON，不适用于 SQLite/per-record。
- 默认 DOCX 为中性 A4 模板，导出后目录直接可读；不承诺所有自定义模板、Office 版本和复杂 PDF 均已验证。
- 不向仓库提交凭据、真实客户商业资料或正式存储备份。部署前备份实际加载的 Profile 与数据，而非猜测存储路径。

## 代码导航与历史资料

| 路径 | 内容 |
| --- | --- |
| `src/workbench-ui/` | V4 React 独立工作台 |
| `src/client/` | DSH 原生面板与 V4 入口 |
| `src/harness/`, `src/tools/` | 宿主集成、HTTP 路由、受控工具与模型目录 |
| `src/domain/`, `src/services/v4/` | 业务模型、资料、研究、配置、文档与正式版本 |
| `src/storage/` | 项目聚合存储、V3.4 转换与恢复 |
| `src/adapters/`, `src/workflows/` | DSH 适配、资料解析、工作流 |
| `src/render/`, `src/prompts/`, `skills/` | DOCX/Markdown 渲染、提示词、研究技能 |
| `tests/`, `fixtures/calm/` | 回归测试与脱敏离线样例 |
| `docs/v4/acceptance/` | V4 验收结论、证据与限制 |

历史设计包见 [V4 参考资料说明](docs/v4/README_SETUP.md)；其中的开发分支、禁止合并和初始交付要求是开发当时的记录，不代表当前发布状态。V3 历史见 [V3.3 终验](docs/V3_3_FINAL_ACCEPTANCE.md)、[V3.3 上线/回退](docs/V3_3_RELEASE_GUIDE.md)和 [项目续开发指南](docs/README.workspace.md)。最新功能与状态以本 README 和 V4 产品验收记录为准。
