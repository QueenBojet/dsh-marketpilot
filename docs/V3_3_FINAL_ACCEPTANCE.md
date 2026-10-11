# MarketPilot V3.3 M5 终验报告

日期：2026-10-11（Asia/Shanghai）。接续已提交的 M4，执行总提示词 M5。

## 结论与尚未关闭的门槛

**M5 的代码回归、最终构建、离线全链路和真实桌面 GUI 技术验证通过。M5 整体验收仍有明确缺口，不能标成无条件全部通过。**

| 验收项 | 本轮结果 | 证据 / 限制 |
|---|---|---|
| 基线回归与新增能力 | 通过 | 33文件 / 258测试；M4 249项保留，新增9项，强化立即双击导出用例 |
| typecheck / build / bundle | 通过 | 最终构建及冻结宿主模块表5/5；没有新增依赖或改锁文件 |
| CALM需求→方案→可选投标全链路 | 离线通过 | 官方Cordis、SQLite、guarded工具；模型替身和显式模拟人工。没有在存量项目重跑全新在线全链路 |
| 本轮真实模型关键流程 | 通过当前路由 | 官方 zai / **glm-5.3-flash / max**，方案7次调用、702523 ms；不能替代指定非Flash `glm-5.3` 的新复验 |
| 三尺寸 / 两主题真实GUI | 通过 | 31张最终宿主截图，原生窗口另留证；无mock / jsdom冒充Desktop |
| 正式导出 / 样例人审 | 已获人工批准并正式导出 | ART-06 approved；官方工具 create，56486字节与存档逐字一致；不等于逐条技术质量已充分核验 |
| 10分钟演示 | 脚本完成，实测待补 | 预算8分30秒 / 硬截止10分钟；没有把自动导航时长当人类完整口述彩排 |
| 联网研究 | 未验收 | `available=false, mode=unverified`，没有公开URL / 抓取原文证明 |

发布指引已交付；用户明确授权本次正式导出、Git提交与推送至 GitHub main。正式导出和人工批准已完成，未更改模型 / Provider凭据；对外演示前仍须完成人类口述计时。严格非Flash模型及全新在线全链路仍须另行验证。

## 基线与环境

- MarketPilot：`main @ 8b9bf5a4b2df7718bf85382bbe46910775808699`，开始时工作区干净。
- 上游：`5badb15009ae1756c3afe0ae0cef1faafc290ccc`，只读且工作区保持无改动。
- 安装版DSH Desktop：设置页记录 `0.2.0-rc.2`；原生主面板、官方Cordis生命周期与 `main` keyed slot保留。
- shell Node `v24.14.0`、pnpm `11.19.0`；Desktop日志中的内置运行时Node `v24.17.0`。
- 当前Desktop插件junction指向 `E:\PythonProjects\Work_Platform\marketpilot`。实际业务存储为官方JSON后端：`%APPDATA%\dsh-desktop\harness\storages\marketpilot.json`；最终重启后核对包含M5 Run / Artifact。隔离smoke另用SQLite，二者不混称。

V3.2.1 的178项是历史基线，M5起点实测为249项。历史真实GLM全链路记录不计入本轮新调用。

## 修改与行为保持

| 已复现问题 | 修复 | 范围 |
|---|---|---|
| 缺默认模型 / Agent创建抛错后留下幽灵running执行 | 启动失败删除尚未返回callId的记录并传播原错误；准备期间继续可被插件卸载中止 | `src/harness/workbench.ts` |
| 同一事件批次立即双击导出创建两次审批 | 同步ref挡住第二次调用，busy状态保留视觉反馈 | `src/client/pages/ArtifactsPage.tsx` |
| 导出审批弹窗被仍打开的成果阅读器遮住 | guarded任务成功启动后关闭阅读器，人工门可见；启动失败仍保留阅读器与错误提示 | `src/client/pages/ArtifactsPage.tsx` |
| 旧Harness call/item审核人标签在新方案中冗长显示 | 识别明确的 `Harness human (call_…\|item_…)`，显示8位追溯片段；UUID格式兼容 | `src/domain/shortcodes.ts` |

四项先添加 / 加强回归并观察失败，再修实现。审核人处理用于新渲染及客户端阅读；**没有重写已经保存的ART-06或历史正文**，正式导出仍忠实输出存档。无关call字符串和未知记录ID保持原样，UUID主键、永久编号和审批身份存储保持不变。

测试变更：`tests/workbench-routes.spec.ts`、`tests/model-failures-m5.spec.ts`、`tests/phase3-client.spec.tsx`、`tests/shortcodes.spec.ts`。新增启动失败 / 重试 / 卸载、官方结构化适配器缺服务 / Provider失败 / 无效输出 / 超时 / 取消后迟到结果与子Agent释放覆盖；已有人工中断、STALE_CONTEXT、跨项目、superseded等待、null-codeBook等回归保留。

验收工具：`scripts/desktop-session.mjs`、`acceptance-v33-m5.mjs`、`acceptance-v33-m5-live.mjs`、`acceptance-v33-m5-export.mjs`。只有live的 `--start` 发起模型任务；export脚本可准备 / 核验门、重试已批准快照和归档正式文件，不能回答门。Session token仅在内存，未保存到facts或报告。

## 最终验证记录

命令在仓库根运行。pnpm11的link依赖预检可能尝试重装，使用命令参数 `--config.verify-deps-before-run=false`，没有更改全局配置。

| 命令 | 最终结果 |
|---|---|
| `pnpm --config.verify-deps-before-run=false typecheck` | 通过 |
| `pnpm --config.verify-deps-before-run=false test` | **33文件 / 258测试全部通过**，7.64s；无删除旧用例 |
| `pnpm --config.verify-deps-before-run=false build` | 通过；客户端382.68kB / gzip78.76kB |
| `pnpm --config.verify-deps-before-run=false exec vitest run tests/client-bundle.spec.ts` | 最终构建5/5通过 |
| `pnpm --config.verify-deps-before-run=false marketpilot:demo:smoke` | 离线通过；4资料 / 10需求 / 18证据 / 5成果、12次adapter调用；显式模拟人工 |
| `node scripts/acceptance-v33.mjs --check-idle` | 最终重启前0活动执行 / live gate |
| `node scripts/acceptance-v33-m5.mjs` | 最终31张截图，0页面异常 / 新execution；全9项目完整detail哈希不变 |
| 原生computer-use复核 | 最终构建的原生导航 / 新方案阅读与截图；未回答门 |
| `git diff --check` | 交付前通过 |

覆盖方式有区别：Provider失败、超时、取消和卸载用可控隔离测试证明，不对实际外部Provider注入故障；跨项目 / Gate绑定用真实服务端受控调用回归证明。GUI读取真实存量批次，不自动确认。CALM隔离HTTP点击测试和smoke中模拟人的应答只验证契约。

## 本轮真实GLM与持久化

项目：**CALM 漏油监测桌面版演示**，`83fd7e7e-d068-49e0-bf60-ffbd0496ce47`。案例保留原有资料，合成Datasheet / 招标内容仍标注synthetic，不能作为真实性能承诺。

从真实React「生成技术方案」按钮开始，即时双击仅产生一个execution。切至任务中心并页面重载后仍关联同一callId；工作流经官方模型 / Agent / Tools路径执行，没有客户端直连模型。

| 项目 | 实测 |
|---|---|
| 模型 | zai / glm-5.3-flash / max，未更改路由 |
| WorkflowRun | `ad8dfeac-3d24-48d8-ac66-d067646b542c` |
| execution callId | `b39259a7-d80a-4e60-a28a-55fa0f74c645` |
| 开始 / 完成 | 2026-10-11 15:08:29.513 → 15:20:12.036（北京时间） |
| 耗时 / 调用 / 重试 | 702523 ms，约11分43秒；7模型调用 / 1工作流工具调用；0重试 |
| 人工等待 | 本次方案生成0 ms / 0应答，复用已有人工Decision；正式成果人审另计 |
| 新成果 | **ART-06**，`83afd799-90ac-4f33-ae0d-e2fca06e991a`；56486 UTF-8 bytes |
| 审核 / 依赖 | 生成时 draft / current；本次已明确批准并正式导出，关联既有DEC-01；批准不替代工程技术核验 |
| 审阅副本 | `gui-acceptance/v3.3-m5/m5-CALM-solution-review.md`，不是受控正式导出 |

审阅副本与存档正文的哈希、56486字节已对齐；`.gitattributes`为审阅副本和正式导出归档固定LF，避免Windows的autocrlf在后续checkout时改动原文字节。

真实Run步骤为 START → VALIDATE_PREREQUISITES → BUILD_PROJECT_CONTEXT → GENERATE_OUTLINE → GENERATE_SECTIONS → TRACE_REQUIREMENTS → TRACE_EVIDENCE → REVIEW → SAVE_ARTIFACT → COMPLETED。只展示实际记录，不构造百分比。

核验新方案确认需求摘要14/14、未决UNKNOWN 28项与台账一致；正文57个不同业务引用均可解析，无canonical裸UUID，dependencies的decisionId等于原activeDecisionId。自动核验引用存在、数字对账和版本一致，**不等于已逐条通过技术质量人审**。

新版本生成前已记录各旧文档、需求、证据、竞品、政策、路线、Decision、条款、成果和Run的逐条SHA256；生成后全部保持不变。原项目codeBook缺失，首次受控写入冻结编号；最终GUI以旧记录集合重建原派生编号，与新冻结映射逐条相等，没有把空oldCodes检查冒充已有永久映射核验。后续9项目GUI完整detail前后哈希也不变。

完全退出托盘 / 重启后新Run和Artifact仍可读取，`m5-storage-facts.json`核对实际JSON文件中有对应ID；在途execution / live Human Gate仍是进程资源，重启不能声称恢复真实审批。

## 真实GUI矩阵与截图

最终脚本控制安装版Desktop托管的真实React / 后端页面，Chrome CDP仅用于确定视口与读取UI；原生窗口用computer-use另复核。没有临时mock server、注入fixture响应或用jsdom代替真实Desktop。

| 项目 / 场景 | 尺寸 / 主题 | 文件 |
|---|---|---|
| 空项目「V3.3 M1 GUI 空项目 · synthetic QA」 | 1440×900、1366×768、1024×768；浅 / 深 | `m5-empty-{light,dark}-{1440,1366,1024}.png`，6张 |
| 仅需求「CALM 现场演示（10 分钟版）」 | 同上 | `m5-requirements-{light,dark}-{1440,1366,1024}.png`，6张 |
| 完整CALM | 同上 | `m5-calm-{light,dark}-{1440,1366,1024}.png`，6张 |
| 空项目生成前置阻断 | 1440×900 / 浅 | `m5-empty-routes-blocked-1440.png`、`m5-empty-solution-blocked-1440.png` |
| 真实待审需求批次 | 1440×900 / 浅 | `m5-requirements-waiting-batch-1440.png` |
| 本地研究 / 联网未验证 | 1440×900 / 浅 | `m5-calm-research-1440.png` |
| 证据台账 | 1366×768 / 浅 | `m5-calm-evidence-1366.png` |
| 技术路线矩阵 | 1024×768 / 浅 | `m5-calm-route-matrix-1024.png` |
| 新版current / 历史untracked | 1440×900 / 浅 | `m5-calm-new-version-1440.png`、`m5-calm-historical-version-1440.png` |
| 新真实模型方案阅读 | 1440×900 / 浅、1024×768 / 深 | `m5-calm-live-solution-reader-1440.png`、`m5-calm-solution-reader-dark-1024.png` |
| 投标 / 符合性成果导出入口 | 1440×900 / 浅 | `m5-calm-tender-1440.png`、`m5-compliance-export-entry-1440.png` |
| 持久化任务历史 | 1440×900 / 浅 | `m5-persisted-task-history-1440.png` |
| 原生最终窗口 | 2560×1392 / 浅 | `m5-native-overview-2560.png`、`m5-native-solution-2560.png` |
| 最终真实导出门（准备时未应答） | 1440×900 / 浅 | `m5-real-export-awaiting-human-1440.png` |
| 原生真实导出门（准备时未应答） | 2560×1392 / 浅 | `m5-native-export-awaiting-human-2560.png` |

31张矩阵文件与精确尺寸见 `gui-acceptance/v3.3-m5/m5-gui-facts.json`，原生留证见 `m5-native-facts.json`；另有真实运行中截图 `m5-live-running-light-1440.png` 和正式导出待审批截图。每张托管截图断言页面无横向溢出，1024阶段导航保持紧凑横向，真实DOM当前阶段 / 八步状态与API逐项一致。长路线矩阵使用表格内滚动；小屏阅读器改为目录顶部 / 风险下方，正文内部滚动。

验收脚本曾在Desktop启动就绪前读到旧端口而超时；最终重启的一次独立HTTP就绪探针也未在45秒内确认。真实GUI脚本随后完整通过，以上探针结果不记为应用成功运行或页面异常。视觉复核另发现深色截图仍选择历史版，改为明确选择ART-06并断言current后重跑。

## 性能、演示与发布边界

- 最终客户端382.68kB / gzip78.76kB，较M4 382.19kB / gzip78.61kB增加约0.49kB / 0.15kB；没有新增依赖。构建耗时 / 测试时长是此机一次记录，不作为硬件通用指标。
- 真实多章方案耗时11分43秒，必须预生成；网络 / 模型时延不能保证现场10分钟以内。`DEMO_SCRIPT.md`预算8分30秒，预留1分30秒，现场只运行一个真实人工节点或明确取消。
- 只读projection每3秒轮询，防重叠 / 卸载后写入；本轮9项目规模验证，无并发压测、长期内存或大资料性能结论。
- search/fetch能力未证明，保持联网不可用 / unverified并提供本地路径；未引入第三方SDK、代理或绕行。
- 支持有效UTF-8 `.md/.txt`，上传上限2MiB；PDF / DOCX、提纲人工确认、单章重生成不在本轮实现。
- M3新增提取字段的真实模型质量、全新在线全链路、非Flash指定路由新复验、人类完整口述彩排仍未完成。
- 历史成果untracked；新指纹current只表示输入未变，不能证明事实已核验、标准有效、设备认证或性能合规。
- 导出历史仍无专用持久化路径账本；实际文件与批准快照需独立核对。重启保留领域Run / 成果，不能继续回答遗留superseded或已中断门。
- 活动导出任务的标签与首页侧栏挤压问题已补修；复现、改动和针对性复验见下节。
- 回退M3旧strict schema不能读取M4新增dependencies，禁止删字段或覆盖新数据回退；详见 `V3_3_RELEASE_GUIDE.md`。

## M5 显示缺陷补修

基线 `574eadc`，工作区干净。针对用户“先修复漏洞”的指令，修复终验已定位的两类显示问题：

| 真实复现 | 修复 / 文件 |
|---|---|
| 首页显示 `runType.marketpilot_artifact_export`，任务中心显示原工具名 | `TaskCard.tsx` 统一执行工具标签，导出复用中英文 `exportArtifact`；`HomePage.tsx` 共用该标签。未知工具保留原名，不将导出伪造为 WorkflowRun |
| 280px 首页侧栏将项目名挤成竖排 | `styles.ts` 将任务标签与项目 / 状态分行，全宽换行，按钮左对齐 |

`node scripts/acceptance-v33-m5-fixes.mjs --before` 在真实安装版 Desktop 托管页面失败，实际标签为原始翻译 key；截图记录修复前挤压。修复后同一脚本通过：首页三尺寸 / 两主题6张、任务中心2张、原审批门1张，共9张。1024截图定位侧栏留证；每次断言标签、状态、完整文本宽度、上下行位置及页面无横向溢出。任务中心展开导出步骤仍明确显示“暂无对应运行记录”。脚本与事实为 `scripts/acceptance-v33-m5-fixes.mjs`、`gui-acceptance/v3.3-m5/m5-display-{before,fixed}-facts.json`。

针对性验证：`phase3-client` / `harness` / `workbench-routes` / `project-review` / `client-bundle` 共5文件39测试通过，包含人工审批、精确 Run 绑定、启动失败 / 卸载和禁止覆盖已有文件；typecheck / build通过。客户端382.95kB / gzip78.84kB，比初版M5增加0.27kB / 0.08kB，没有新增依赖。原33文件258测试记录保留，本次未重复全套测试。

显示补修阶段9项目完整detail前后哈希一致，0新execution / 模型调用 / 人工应答 / 页面异常。当时原导出callId、完整审批projection与ART-06正文哈希不变，成果仍draft，正式文件不存在。computer-use仅刷新原生客户端，未重启宿主；首页修复及原门可见另有2张2560×1392截图，见 `m5-display-fixed-native-facts.json`。正式批准与导出结果见下节。

## 正式导出补修与人工收口

用户明确授权正式导出后，原门 `c422dd64-a2f5-491d-979a-bd96b548813f` 在真实原生审批窗确认，ART-06 于北京时间 **2026-10-11 16:25:41.645** 成为 approved。批准记录仍是该门的 Harness human，正文与依赖未改。审批成功与文件写入成功分别记录，不能把后续拒写误记成尚未批准。

原门准备于北京时间 **15:48:37.988**，当时 waiting_human / draft，仓库目标不存在，立即双击仅开一门。更早的准备门 `45e2eef1-66ce-4dd3-b0ee-044338520204` 因阅读器遮挡而明确取消，证据保存在 `m5-export-prepatch-facts.json`；准备过程没有自动应答。本次人工确认依据用户明确授权。

原批准后的写入被官方 `workspace-write` 拒绝。新增 `tests/harness.spec.ts` 回归通过真实 Tools、人工审核、官方 SandboxedFileSystem 与原子写入复现：调用会话允许的目标仍被部署 fallback 根拒绝；连续两次运行红灯。`src/tools/artifact.ts` 从宿主可选 sandboxPolicy 服务解析当前 exec.agent.session，将策略传给官方 fs.writeText 第五参数。保持 session mode、workspace root、取消与 createIfAbsent；无新增依赖，不改变安全配置。

修复后第一次真实重试 `3a9066ca-da5e-43b6-8fbe-2cef3ae4d955` 仍拒绝仓库路径。读取实际工作台会话头确认 cwd 为 `C:\Users\zjdzc\AppData\Roaming\dsh-desktop\launch-root`；仓库路径在范围外，不能扩大权限或从目标反推授权根。改用该会话允许的目录后，真实 GUI 发起的重试 `63bbe9c3-1796-4bf5-8b44-827c9ab9613d` 在北京时间 **16:39:41.641** 完成，官方返回 **operation=create**：

- 正式写入：`C:\Users\zjdzc\AppData\Roaming\dsh-desktop\launch-root\marketpilot-exports\CALM-M5-ART-06.md`。
- 仓库归档：[`gui-acceptance/v3.3-m5/exports/CALM-M5-ART-06.md`](gui-acceptance/v3.3-m5/exports/CALM-M5-ART-06.md)，从已成功正式导出的文件复制，禁止覆盖不同内容；不是从审阅副本生成。
- 三方逐字校验：成果存档正文 / 官方写入文件 / 仓库归档均为 **56486 UTF-8字节**，原始文件 SHA256 `fbc55a94bf7bf2f9a36e7613299bd555ce12f1b14246cbaf2c98797824ed17ed`；JSON.stringify(content) SHA256 仍为 `208cd7fa067ae6d5146ea64ce5b216a9d928ad9fd64dc346a4b839df314d1014`。
- 原真实批准记录完全复用，无重复审批 / 模型调用；dependencies current，9项目完整 detail 哈希前后相同，历史记录和永久编号不变。

`scripts/acceptance-v33-m5-export.mjs` 现在在失败时也读取真实 review，分别记录批准与导出状态；保留三次调用的路径、错误和批准记录。`--retry` 仅复用已批准且正文哈希未变的成果，`--archive` 仅归档已验证的正式文件。事实见 `m5-export-facts.json`，真实托管页面任务完成截图为 `m5-real-export-completed-1440.png`，原生 `m5-native-export-approved-2560.jpg` 显示 ART-06 已审核 / 输入版本未变化，事实见 `m5-export-native-facts.json`；原生截图仅证明批准与版本状态，实际写入由工具返回、文件字节及托管任务截图共同证明。首轮重启后的 CDP 脚本因旧端点而超时，没有创建导出调用；宿主就绪后才重试，不能将该探针超时记成成功导出。

针对性验证 **5文件 / 33测试通过**：harness 9、workbench-routes 10、design-v33 / project-review 9、client-bundle 5。新增真实沙箱回归覆盖会话写入、只读与越界拒绝、不覆盖、agentless fallback和失败后批准保留；typecheck、build通过，客户端仍382.95kB / gzip78.84kB。没有新增依赖或修改上游。重启前确认无活动任务，实际业务 JSON 在本地忽略目录备份并核对哈希。

正式导出与人工批准现已完成；用户批准不替代逐条技术质量审核。人类10分钟口述、非Flash指定模型复验、联网研究和全新在线链路仍未完成，整体验收继续保留这些缺口。
