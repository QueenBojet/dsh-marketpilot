# MarketPilot V4 本机 GUI 验收报告

## 搜索插件安装后复验（最新结论）

- 已在隔离 Profile 安装 npm `dsh-web-search-pro@0.2.1`，启用 ctx.web Provider，并将 DSH searchProvider/fetchProvider 均设为 web-search-pro。正式 Desktop Profile 未改。配置及兼容范围见 `DSH_AI_RUNTIME.md`。当前隔离宿主 PID 16152，回环端口 3180。
- 真实浏览器发起“仅联网”研究完成：2 个网页正文成功、1 个失败；DSH okai2/qwen3.8-flash/low 生成报告并记录 Skill 指纹。已解除默认 DeepSeek 搜索密钥阻断。结果存在同名站点噪声，不认定 MARPOL 研究充分。证据 `fixes/05-search-pro-real-research.*`。
- 技术文档修订3完成样本人工审核/Human Gate，并从 GUI 下载 `fixes/technical-revision3.docx`；当前4条需求，未对外发送。此前“修订3待重新审核”已过时。
- Word 已真实打开 cost-v2.docx，成本表显示 CNY7910，页数3；技术 revision3 也成功打开，页数4。技术文档分页定位存在自动化焦点异常，误输入未保存；完整逐页排版仍未通过。成本截图 `fixes/06-word-cost.png`。此前“无法打开 DOCX”阻断已解除。
- 原生 Desktop 隔离入口、完整逐页排版及下方 NOT_TESTED 场景仍有验证缺口，不宣称全项验收通过。此次没有额外改动产品代码；沿用已通过的50项针对性测试、类型检查与构建结果，新增真实集成和文档复验证据。

以下为较早验收记录；与本节冲突时以本节为准。

## 2026-10-13 后续修复复验（优先于下方历史记录）

- **旧需求替代：已修复并实机通过。** `RequirementService.update` 允许当前决策已不引用的需求仅改变为 superseded；正文、历史确认和决策保留，当前决策仍引用时继续阻断。界面确认旧5分钟要求已替代，当前4条需求；技术文档同步为修订3且不再列旧要求，审核正确失效。历史V1/V2未修改。证据 `desktop-gui/fixes/01-requirement-superseded.*`、`04-updated-requirements-doc.*`。
- **DSH AI 路径已确认；研究 Skill 已实现。** 所有实时模型经过 DSH subagents；网络经过 DSH Web。`skills/marketpilot-deep-research/SKILL.md` 适配指定上游，附MIT许可证，注册到可用DSH Skills服务，并显式注入研究计划、报告、对话。实机模型运行 completed，指纹 `5960e4d525ed`，生成8条候选发现，未人工采纳。证据 `fixes/03-dsh-skill-real-research.*`；详细工作模式见 `DSH_AI_RUNTIME.md`。
- **联网失败诊断与模式语义已修复。** 保留DSH搜索原始失败原因，未验证不再显示为已知不可用；仅联网不回退本地资料，也不冒用历史网页为本次抓取。实机明确返回 DeepSeek search 缺少 `DEEPSEEK_API_KEY`。这仍是凭据阻断，不是联网成功；已请求用户选择并配置DSH搜索Provider。证据 `fixes/02-web-provider-failure.*`。
- **验证：** 6个相关测试文件、50用例通过；类型检查和构建通过，工作台292.2 KiB。新增测试先复现了需求状态缺陷、Skill未注入和联网错误丢失，再验证修复；端到端用例验证替代后新基线不含旧需求且V1完整对象不变。
- **剩余环境限制：** Word本机文件对话框再次返回 `element ... is not available in cached app state for WINWORD.EXE`，没有成功打开DOCX，不宣称排版通过。安装版Desktop仍强制使用固定userData，开发源码是另一版运行时；不以修改正式Profile或升级宿主来绕过隔离。原生Desktop入口仍待验证。
- 当前技术文档修订3为待重新审核草稿；此前已发布V1/V2仍保持不可变。没有通过重新审核或发布掩盖环境失败。

---

日期：2026-10-13（Asia/Shanghai）。结论：**本机隔离 Harness GUI 主流程已实测；存在产品缺陷与环境阻断，不能宣布完整 Desktop 验收通过。**

本报告承接原对话「执行 MarketPilot 本机 GUI 验收」（01a132d4-b800-7841-862a-a1dfa432dff3），并记录新对话的续测。原首轮阻断报告保留于 `desktop-gui/resumed/INITIAL_BLOCKED_REPORT.md`。此前报告“产品截图 0、工作台未打开”仅适用于最初一轮，不再代表当前进度。

## 环境与边界

- 仓库 `E:/PythonProjects/Work_Platform/marketpilot`，分支 `feat/v4-workbench-foundation`；未合并 main、未提交，保留原对话未提交修改与无关目录。
- 宿主为本机安装版 DSH Desktop 0.11.0 所带真实 Harness CLI（Electron Node 24.17.0），非 mock。使用 `harness-node-entry.mjs` 加载安装包内 DSH CLI，`web --no-open`。
- 独立 DSH_HOME：`C:/Users/zjdzc/AppData/Local/Temp/marketpilot-v4-gui-isolated-C0MRRc/harness`。独立插件位于同根 `plugin`。未在正式 CALM 项目写入。
- 实际工作台：`http://127.0.0.1:3180/marketpilot/workbench`。日志打印同一回环端口；报告不记录日志中的访问令牌。
- 本轮恢复 PID 25324，核对身份后停止并重启为 PID 31764；最终仅回环监听。为用户继续查看保留隔离宿主和浏览器。
- 测试项目：`V4 GUI 验收 - CALM 合成案例 - 2026-10-13`，ID `9145a82a-3c13-470c-99f2-b7de73993fe2`。隔离存储另有既存 `test` 项目，本轮未改动。
- 采用本机 Codex 内置浏览器，经真实页面点击、输入、Human Gate、下载、刷新和导航操作。文件检查只辅助验证快照与持久化，未用 API 替代本轮 GUI 操作。
- 原生 Desktop 的隔离 userData 入口尚未确认，未启动其正式 Profile。因此不能称“Desktop 已验收”。

## 场景结果及证据

`round2` 为原对话保存的真实截图、DOM 和事件记录；`resumed` 为本轮新取得证据。历史证据与本轮复验分开标明。

| 场景 | 结果 | 证据和范围 |
| --- | --- | --- |
| 全局工作区、项目导航、来源抽屉 | PASS（原对话本机实测） | `round2/01`–`15`；本轮再次打开工作台、文档交付 |
| 1024、390 布局 | 已有截图，完整响应式验收未完成 | `round2/13-change-1024.jpg`、`14-change-390.jpg`；未据此推断所有页面均无溢出 |
| 第一批上传、真实分析、采纳及需求确认 | PASS（原对话本机实测） | `round2/03`、`16`–`18`；取消采纳未写入，采纳后仍待确认，确认需求单独过 Gate |
| 模型失败状态 | PASS（原对话实测失败处理） | zai/glm-5.3-flash 429 额度耗尽；不记作模型调用成功 |
| 真实模型分析、研究、AI 对话 | PASS（原对话实测） | okai2/qwen3.8-flash；`round2/20`–`22`、`34`、`41`；结论未独立技术核实。本轮未重复付费调用 |
| DSH 供应商与右上角模型/强度选择 | PASS（原对话实测，本轮确认保留） | `round2/38`–`41`；重启后仍为 qwen3.8-flash / low；设置页取消全局/项目默认分层 |
| 联网搜索、真实网页正文抓取 | BLOCKED | 宿主能力不能确认 Web Provider；存储无网页 sources，不能把模型响应当联网成功 |
| 两条路线、人工确认、重新确认 | PASS（原对话本机实测） | `round2/23`–`25`、`42`；重新确认缺陷已有修复，保留两条历史决策 |
| 人民币、数量联动、税费、缺汇率 | PASS（原对话实测，本轮文档及差异复验） | `round2/26`–`28`、`36`、`44`；5×1200+2×500=7000，13% 税后 CNY7910。缺汇率不输出总价；测试价格不等于真实供应商报价 |
| 第二批增量资料 | 部分 PASS，存在 FAIL | `round2/33`–`35`；新增2分钟和备注要求成功，旧5分钟要求不能标记已替代，见下文 |
| 两类 DOCX 预览、审核、下载 | PASS（本轮实测） | `resumed/01-cost-doc-synced`；两份修订2 DOCX已下载，技术与成本文档均走真实 Human Gate；未对外发送 |
| V1 / V2 发布与差异 | PASS（本轮完成 V2） | `resumed/02-v2-human-gate`、`03-v1-v2-comparison`；完整方案包 V2 已发布，数量4→5、单价1000→1200、合计5650→7910、两份文档修订1→2 |
| 重启持久化及 V1 不变 | PASS（本轮实测） | `resumed/04-restart-persistence`、`05-restart-comparison-visible`、`persistence-check.json`；V1完整对象与续测前深比较相同，2个版本、2个文档、7条研究发现、2条成本行保留 |
| 安全转换回退与恢复 | PASS（本轮文件/CLI验证） | `resumed/downgrade-manifest.json`、`restore-manifest.json`；最新V2副本按冻结V3.4 schema转换并恢复，恢复SHA与源相同。没有实际启动V3.4 GUI，不宣称宿主往返通过 |
| 原生 DSH Desktop 插件入口 | BLOCKED | 隔离原生 userData 入口未确认；仅测本机真实 Harness |
| Word 打开和分页 | BLOCKED | Word已安装并实际启动，Ctrl+F12打开文件对话框；元素索引失效，重新获取窗口后点击/Alt+N仍返回搜索框焦点。未盲输路径，未成功打开DOCX，未验证Word字体/分页 |
| 本轮浏览器错误日志 | PASS（有限范围） | 页面 `dev.logs` error/warn 返回空数组；未取得完整网络HAR，不宣称网络全部通过 |
| PDF解析、损坏文件上传、所有异常组合 | NOT_TESTED | 没有本轮完整GUI证据；现有单测不代替GUI实测 |

## 已知产品缺陷

**FAIL：被历史决策引用的旧需求无法标记为“已替代”。** 原对话证据 `round2/43-historical-requirement-edit-blocked.*`，本轮技术文档仍同时列出5分钟与2分钟要求。`RequirementService.update` 调用 `assertEditable`，历史引用保护阻断更新。不能直接解除保护或改写历史快照；需要单独设计需求修订/替代语义。V2仅用于隔离软件流程验收，审核及发布说明明确记录此缺陷，不能作为真实技术交付。

文档同步前旧内容仍显示“审核有效”，同时明确提示与当前项目不一致并禁用重新审核；同步后审核正确失效。本轮没有把旧内容审核当成当前项目审核。

## 承接的改动与本轮验证

原对话已修改：DSH模型目录及选择持久化、顶部选择器、设置页、冗余说明文案、资料采纳Human Gate与全选、文档同步优先操作、路线重新确认。主要文件包括 `src/harness/model-catalog.ts`、`v4-routes.ts`、`src/workbench-ui/model-picker.tsx`、`model-selection.ts`、`shell.tsx`、`store.tsx`、`pages/*`、`src/services/decision.ts`、`src/services/v4/solution.ts`。本轮保留这些修改，未扩大产品代码修改；重新构建生成页面，并更新报告和证据。

本轮实际执行：

- `npx vitest run tests/v4-intake-client.spec.tsx tests/v4-model-catalog.spec.ts tests/v4-model-selection.spec.tsx tests/v4-acceptance.spec.ts`：4文件、7用例通过。
- `npm run typecheck`：退出码0。
- `npm run build`：退出码0；工作台292.1 KiB。
- 最新测试快照的 downgrade / validate / restore：退出码0。第一次把输出置于源所在目录下被 `UNSAFE_OUTPUT` 正确拒绝，之后使用独立临时目录成功。
- 恢复前后SHA：`1407270a1f255640428846fdebe3389a26f0c8d29b134a00fc7ccff96bcbad6b`。

## 安全及交付文件

正式存储SHA（开始和结束相同）：`669636b62c40dd2c87b78d05e578c2529bb85f064cc76d780f4eeee48fec6f20`。最终状态见 `resumed/final-safety-check.json`。

- `resumed/technical-v2.docx`：真实下载的技术文档，含已明确记录的旧需求替代缺陷。
- `resumed/cost-v2.docx`：真实下载的成本文件，CNY7910，全部test_data。
- `resumed/events.json`：本轮截图动作、URL与ISO时间（UTC）。本报告日期按Asia/Shanghai。
- 隔离环境包含继续真实模型测试所需的既有配置，仅本地保存；不把Profile或原始启动日志加入仓库。
- 不修改正式CALM、不发送文件、不暴露公网、不合并main。当前结果不是“全项验收通过”。
