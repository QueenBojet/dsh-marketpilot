# 事实与原始来源登记表

盘点日期：2026-10-12（Asia/Shanghai）。代码基线：`main @ bd98c7b2b15bcbbce8fa1a50297c28272af2d54a`，初始工作区干净。

## 证据等级与公开口径

- `VERIFIED`：限于明确记录的实现、历史验收或本批文件核查，不能扩大到未经测量的业务效果。
- `USER_CONFIRMATION_NEEDED`：业务原件真实性、语义质量、人工时间、公开授权等仍须人确认。
- `FUTURE_PLAN`：未实现或未验收的能力，仅能列为后续计划。

“可引用”指可从来源抽取相应事实写入待审说明书，不代表批准将来源全文、JSON 或截图公开。所有对外材料仍待用户确认；既有事实文件可能含本机路径、内部 UUID 或审计串，仅保留相对来源链接，不在新文档中批量复制这些字段。

时间按 Asia/Shanghai。JSON 的 UTC 时间以原值为准，引用时换算为北京时间。完整 Run / call / 项目身份可通过下表的 JSON 字段定位，不应从不同项目的短编号推断同一业务对象。

## 来源索引

| 编号 | 原始来源 | 日期 / 版本 | 类型及使用限制 |
|---|---|---|---|
| S01 | [材料补充清单](../../../docs/01_参赛材料补充清单与验证方案.md) | 2026-10-12 | 用户任务背景；位于仓库外层，不能作为本仓库自含附件 |
| S02 | [采证任务提示词](../../../docs/02_Codex_参赛材料采证与初稿任务提示词.md) | 本批完整阅读 | 用户任务范围、批次停点；比赛要求仍需通知原件核对 |
| S03 | [README](../../README.md)、[package.json](../../package.json) | 当前 HEAD | 实现总览 / 仓库身份；README 部分 Web 安装表述为历史环境，不替代最新 Desktop 验收 |
| S04 | [M5 终验](../V3_3_FINAL_ACCEPTANCE.md) | 2026-10-11，含显示 / 导出补修 | 历史工程验收；不能统称所有业务门槛均通过 |
| S05 | [上线与回退指引](../V3_3_RELEASE_GUIDE.md) | 2026-10-11 | 发布边界；明确补修后未重跑全量测试 |
| S06 | [M1](../V3_3_M1_ACCEPTANCE.md)、[M2](../V3_3_M2_ACCEPTANCE.md)、[M3](../V3_3_M3_ACCEPTANCE.md)、[M4](../V3_3_M4_ACCEPTANCE.md) | 2026-10-11，各阶段 | 实现 / 隔离回归 / 真实页面验收混合；阶段停点以最新 M5 状态更新 |
| S07 | [m5-live-facts.json](../gui-acceptance/v3.3-m5/m5-live-facts.json) | 2026-10-11 | 真实模型方案；身份定位 `projectId`、`runId`、`callId`、`artifactId`、`activeDecisionId`；原 JSON 不直接公开 |
| S08 | [m5-gui-facts.json](../gui-acceptance/v3.3-m5/m5-gui-facts.json) | 2026-10-11 | 真实安装版 Desktop 托管 React 页面，31 个截图条目；GUI 脚本无新模型 / 人工应答 |
| S09 | [m5-export-facts.json](../gui-acceptance/v3.3-m5/m5-export-facts.json)、[原生批准事实](../gui-acceptance/v3.3-m5/m5-export-native-facts.json) | 2026-10-11 | 人工审核与正式写入；定位 `review`、`attempts`、`operation`、`bytes`、`fileSha256`；有内部路径，不公开原 JSON |
| S10 | [m5-storage-facts.json](../gui-acceptance/v3.3-m5/m5-storage-facts.json) | 2026-10-11 | 官方 JSON 存储含新 Run / Artifact 的历史核验；本批未读取运行中存储 |
| S11 | [显示补修事实](../gui-acceptance/v3.3-m5/m5-display-fixed-facts.json)、[原生补修事实](../gui-acceptance/v3.3-m5/m5-display-fixed-native-facts.json) | 2026-10-11 | 9 张托管补修截图另计；准备门状态是批准前快照，不覆盖后续成功导出 |
| S12 | [CALM fixture 说明](../../fixtures/calm/README.md)、[输入目录](../../fixtures/calm/input) | 当前 HEAD | 业务原件的最小脱敏摘录与明确合成输入；原件与转写对应关系待用户核定 |
| S13 | [ART-06 正式导出归档](../gui-acceptance/v3.3-m5/exports/CALM-M5-ART-06.md)、[审阅副本](../gui-acceptance/v3.3-m5/m5-CALM-solution-review.md) | 2026-10-11；2026-10-12 重新核对字节 / SHA256 | 真实模型成果；两文件现有字节一致，来源身份仍不同；正文公开前需脱敏 / 技术复核 |
| S14 | [既有演示脚本](../DEMO_SCRIPT.md) | 2026-10-11 | 8分30秒预算 / 10分钟硬截止；预算不是口述实测 |
| S15 | [离线场景代码](../../fixtures/calm/scenario.ts)、[离线模型](../../fixtures/calm/offline-model.ts)、[预期验收](../../fixtures/calm/expected/acceptance.json) | 当前 HEAD | 离线 fixture / 显式模拟人工规则；本批只读，未运行 |
| S16 | [V3.2.1 收口记录](../UI_V3_2_1_CLOSEOUT.md)、[历史模型事实](../gui-acceptance/v3.2.1/v321-glm-facts.json) | 2026-10-10 | 历史非 Flash / 不同项目记录；不混入 M5 统计 |
| S17 | [素材索引](09_existing_assets_index.md) | 2026-10-12 新检查 | 50 张图片文件存在 / 尺寸 / 哈希；8 张目视复核；并非全部图片已脱敏通过 |

## 当前真实实现的功能

下列状态结合当前源码与上述验收记录，不表示本批重新执行了功能。

| 事实编号 | 已实现行为及可用表述 | 实际路径 / 验收来源 | 类型、充分度与公开边界 |
|---|---|---|---|
| F01 | 在 DSH 原生主面板运行，按项目呈现需求、证据、研究、路线、方案、可选投标和成果；引导 / 专业模式共用真实状态 | [主面板](../../src/client/MarketPilotPanel.tsx)、[项目状态投影](../../src/domain/project-workflow.ts)，S04 / S06 / S08 | `VERIFIED`，实现＋真实 GUI；可称本地工作台 / 可运行原型，不称远程多租户产品 |
| F02 | 当前支持完整有效 UTF-8 `.md/.txt`，默认上传上限 2MiB | [解析器](../../src/adapters/document-parser.ts)、[配置](../../src/harness/service.ts)、[上传路由](../../src/harness/routes.ts) | `VERIFIED`，代码＋验收；不包含直接 PDF / DOCX 解析 |
| F03 | 需求提取后按批次审阅并由人确认；显示来源、未确认项与补证入口 | [需求工作流](../../src/workflows/requirement-analysis.ts)、[需求页](../../src/client/pages/RequirementsPage.tsx)、[审阅投影](../../src/domain/project-review.ts)，S06-M2 | `VERIFIED`，回归＋存量 GUI；抽取正确性及人工修改量另待测 |
| F04 | 本地竞品 / 政策资料分析可带研究目的，追溯原文；同口径参数对照保留缺失单位 / 条件 UNKNOWN | [研究工作流](../../src/workflows/research.ts)、[研究页](../../src/client/pages/ResearchPage.tsx)、[研究投影](../../src/domain/research-review.ts)，S06-M3 | `VERIFIED`，实现 / 隔离测试 / 存量 GUI；M3 新增字段真实模型语义质量未验收，CALM 政策页验收主要为空态 |
| F05 | Evidence Ledger 区分来源、事实、未知与人工决策，分类转换经核验并保留记录；未知项不会自动视为事实 | [证据服务](../../src/services/evidence.ts)、[证据页](../../src/client/pages/EvidencePage.tsx)，S04 / S06 | `VERIFIED`，服务 / 回归 / GUI；SOURCE 核验不等于设备性能试验 |
| F06 | 候选路线摘要 / 矩阵、需求响应与风险可比较；最后选择由真实 Human Gate 产生 Decision，并检查输入变化 | [决策服务](../../src/services/decision.ts)、[路线页](../../src/client/pages/AlternativesPage.tsx)、[人审适配器](../../src/adapters/human-gate.ts)，S06-M4 | `VERIFIED`，实现＋回归＋既有 Decision；不把 AI 建议称为人已审批 |
| F07 | confirmed 需求及人工 Decision 满足后生成多章方案，保留引用、UNKNOWN 与历史版本；新成果带输入指纹 | [生成工作流](../../src/workflows/generation.ts)、[依赖指纹](../../src/services/artifact-context.ts)、[模型适配器](../../src/adapters/harness-model.ts)，S07 | `VERIFIED`，有一次当前 Flash 路由真实生成；current 仅表示输入一致 |
| F08 | 招标为可选分支，支持条款提取、响应审查与符合性成果；没有已核验 FACT / SOURCE 支持的 compliant 会降级 | [条款约束](../../src/domain/tender.ts)、[投标服务](../../src/services/tender.ts)、[投标工作流](../../src/workflows/tender.ts)，S04 / S15 | `VERIFIED`，实现＋离线负例＋存量 GUI；不称完成真实客户投标或认证 |
| F09 | 导出分为待审、已批与实际文件写入；官方文件系统按会话权限创建新文件，不覆盖已有内容 | [成果服务](../../src/services/artifact.ts)、[导出工具](../../src/tools/artifact.ts)，S09 | `VERIFIED`，真实批准 / 写入 / 文件核验；原有失败重试保留，不等于一步无故障 |
| F10 | WorkflowRun 保存实际步骤、时长与调用统计；领域 Run / 成果持久化，重启后读取历史 | [Run 服务](../../src/services/workflow.ts)、[任务页](../../src/client/pages/TasksPage.tsx)，S04 / S10 | `VERIFIED`，历史存储核验；在途 execution / Human Gate 不能声称重启自动恢复 |

## 可用于说明书的验收事实与统计

| 事实编号 | 建议使用的准确事实 | 原始定位 / 日期 | 类型与证据充分度 | 可引用范围 / 不能证明 |
|---|---|---|---|---|
| F11 | M5 初轮工程回归为 33 文件 / 258 测试全部通过，typecheck / build 通过 | S04“最终验证记录”，2026-10-11 | `VERIFIED`：验收报告记录；本批未重跑测试 | 可引用并写明阶段；不能说当前 HEAD 259 全量实测通过或业务准确率达标 |
| F12 | 显示补修 5 文件 / 39 项、导出补修 5 文件 / 33 项针对性通过；最终构建客户端382.95kB / gzip78.84kB | S04 两个补修节、S05，2026-10-11 | `VERIFIED`：后续局部验证记录 | 不把局部数加到258算总测试数；文件体积不代表业务性能 / 用户效率 |
| F13 | 最终真实宿主 GUI 矩阵31张，三尺寸1440×900、1366×768、1024×768、浅 / 深色；脚本记录0页面异常 | S08 `screenshots / pageErrors`，2026-10-11 | `VERIFIED`：历史真实 GUI；本批31条均找到原文件 | 不称并发压测、大项目性能或50张全部同一矩阵验收 |
| F14 | CALM 单次技术方案真实运行采用 `zai / glm-5.3-flash / max`，7次模型调用、1次关联工作流工具调用、0重试 | S07 `model / run / retries`，2026-10-11 | `VERIFIED`：官方模型路径历史事实 | 保留 flash 后缀；modelCalls 是该层请求计数，不能当 Provider HTTP 数或成本 |
| F15 | 该方案 Run 开始15:08:29.513，完成15:20:12.036，durationMs=702523，即11分42.523秒（约11分43秒） | S07 `run.startedAt / completedAt / durationMs`，2026-10-11北京时间 | `VERIFIED`：原始时间差与记录一致，单次 n=1 | 是方案阶段墙钟时长；不是纯模型等待、全流程用时或人工提效 |
| F16 | 当次生成复用既有 DEC-01，Run humanWaitMs=0，生成阶段无新人工应答 | S07 `activeDecisionId / run.humanWaitMs / humanAnswers` | `VERIFIED`：仅本次生成阶段 | 不意味着路线审核 / 成果审核没有人工投入；后续人审另计 |
| F17 | CALM 存量快照有4份资料、19条需求，其中14条confirmed、5条待澄清；38条证据中28条活跃UNKNOWN | S07 `preserved.documents / requirements / evidence / confirmed / unknowns`，S08 与概览 / 台账图 | `VERIFIED`：2026-10-11存量范围；本批读取事实记录 | 14/19 是状态分布；28是证据记录数，非28个独立问题、错误数或遗漏率 |
| F18 | ART-06 摘要与台账14项confirmed需求对账，保留28项活跃UNKNOWN；57个不同业务引用在当次检查可解析 | S07 `checks / citations`、S13“方案摘要 / 需求响应与证据索引” | `VERIFIED`：结构 / 引用 / 版本核查 | 不得写“需求语义准确率100%”“技术结论全部正确”或“所有需求已满足” |
| F19 | ART-06 于16:25:41.645经人批准；随后官方工具正式写入成功，operation=create；批准与文件写入分别留证 | S09 `review / attempts / operation`、S04“正式导出补修与人工收口”，2026-10-11北京时间 | `VERIFIED`：人工授权历史＋官方写入＋归档核验 | 可称已批准并正式导出；用户批准不等于逐条技术质量复核或客户验收 |
| F20 | 正式导出归档与审阅副本均56486字节，原始文件SHA256一致且与正式导出事实匹配 | S13、S09 `bytes / fileSha256`；2026-10-12本批重新计算 | `VERIFIED`：文件新检查；完整哈希见素材索引 | 同字节不混淆来源身份；JSON.stringify(content)哈希是另一个口径，不与原始文件哈希混用 |
| F21 | 历史离线CALM smoke为4资料、10需求、18证据、10 UNKNOWN、5成果、12次adapter调用 | S04、S15、README的Golden Case节，2026-10-11记录 | `VERIFIED`：离线模型＋显式模拟人工 | 仅证明管线、规则和持久化；不混入存量CALM的19/14/38/28及真实模型质量 |
| F22 | Desktop 历史核验用官方JSON后端，离线smoke独立SQLite；重启后新Run / Artifact仍可读取 | S04、S10 `backend / containsM5Artifact / containsM5Run` | `VERIFIED`：历史存储记录 | 不把两个后端说成同一业务库，也不声称审批进程恢复 |
| F23 | 当前验收记录的联网研究状态是available=false、mode=unverified；可用证据主要来自本地资料 | S07 `research`、[能力实现](../../src/harness/capabilities.ts)、S06-M3 | `VERIFIED`：阻断边界 | 不称实时互联网竞品 / 政策研究已落地；本批未探测当前Provider |
| F24 | 已有演示脚本预算8分30秒、硬截止10分钟；真实长方案应预生成 | S14，2026-10-11 | `VERIFIED`：脚本存在；口述完成度为`USER_CONFIRMATION_NEEDED` | 不称已完成10分钟真人彩排或现场整链路在10分钟内完成 |

## 尚不能使用的业务主张

| 主张 | 当前等级 | 缺少的决定性证据 |
|---|---|---|
| CALM 是授权可公开的真实客户业务，输入与原件完整一致 | `USER_CONFIRMATION_NEEDED` | 脱敏原件 / 转写对照、业务人员说明与授权；目前仅fixture来源声明 |
| 明确的人工作业痛点、传统流程与业务人员角色 | `USER_CONFIRMATION_NEEDED` | 用户核定的真实任务链、交付要求及角色；不能从软件导航反推现行业务流程 |
| 节省时间X%、降低成本X%、准确率X%、客户满意度 / 中标率提升 | `USER_CONFIRMATION_NEEDED` | 同范围、同质量门槛的原始人工 / AI观测值、审阅结果与统计样本；目前无可计算对照数据 |
| 指定非Flash模型与全新在线需求→路线→方案→投标链路已完成当前复验 | `FUTURE_PLAN` | 独立真实运行和人审；历史不同项目 / 型号记录不能替代 |
| 搜索 / 抓取已验收、直接PDF / DOCX解析、多租户部署、提纲人审或单章重生成已实现 | `FUTURE_PLAN` | 尚未实现或未验收，不能列作既有成果；不是本批开发任务 |
| 设备性能、海工认证、真实采购参数或客户现场运行效果已达标 | `USER_CONFIRMATION_NEEDED` | 真实型号与原始实验 / 认证 / 客户验收材料；合成Datasheet与候选技术摘录不能支撑 |
| 比赛截止 / 评分 / 赛道等要求已由通知原件核实 | `USER_CONFIRMATION_NEEDED` | 当前相关目录未找到比赛通知原件；现有2026-10-15、30/50/20等仅为任务文档转述 |

详细补证责任、交付形式及后续执行条件见 [缺项清单](08_risks_and_pending_user_inputs.md)。
