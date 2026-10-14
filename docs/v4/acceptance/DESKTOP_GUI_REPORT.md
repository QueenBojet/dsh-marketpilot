# MarketPilot V4 产品操作验收结论

2026-10-13，Asia/Shanghai。**本轮已知失败项已修复并通过实际操作复验；主线验收完成。** 判据是浏览器、原生 Desktop 入口和 Microsoft Word 的实际操作结果，自动化测试仅为补充。此结论限定于下列场景，不代表所有文件、模板、网络服务或工程结论均已验证。

## 实际操作结果

证据位于 `desktop-gui/`。`round2`、`resumed`、`fixes` 为连续验收历史；`final` 是最后一轮。旧报告保存在 `final/PREVIOUS_REPORT.md`，其中 BLOCKED/NOT_TESTED 不再作为当前结论。

| 场景 | 结果及实际证据 |
| --- | --- |
| 上传→分析→采纳→需求确认 | PASS；真实文件选择、模型分析、独立 Human Gate；`round2/03`、`16`–`18` |
| 增量资料与需求替代 | PASS；旧5分钟要求可标记已替代，当前4条需求；当前决策引用保护保留；`fixes/01`、`04`，`final/09-v3-published-diff.*` |
| 项目切换 | PASS；实测发现旧项目内容短暂进入新项目，已修复；切换时只显示加载状态；`final/06-project-switch-immediate.txt` |
| DSH 模型、研究、对话和选择持久化 | PASS；真实 okai2/qwen3.8-flash 调用；`round2/20`–`22`、`34`、`38`–`41`，`fixes/03-dsh-skill-real-research.*` |
| 联网搜索与 Skills | PASS（链路）；安装 web-search-pro 0.2.1，DSH ctx.web 搜索/抓取、Skill 注入、DSH subagent 生成完成；2个正文成功、1个失败；`fixes/05-search-pro-real-research.*`。存在同名站点噪声，不把链路通过当作 MARPOL 研究充分 |
| 技术路线确认与重新确认 | PASS；实际 Gate 与历史决策保留；`round2/23`–`25`、`42` |
| 成本联动、税费、缺汇率 | PASS；数量4→5、单价1000→1200，税后5650→7910；缺汇率不输出总价；`round2/26`–`28`、`36`、`44`及最终成本 Word |
| 损坏 DOCX 混合批次 | PASS（预期拒绝）；明确 INVALID_DOCUMENT，批次和资料未部分写入；`final/01-corrupt-batch.*` |
| 无文字 PDF | PASS（预期拒绝）；EXTRACTION_EMPTY 与可操作提示；`final/02-pdf-no-text.*` |
| 有文字 PDF、TXT、CSV | PASS；真实上传3资料、5候选，PDF来源抽屉定位正确；`final/03-pdf-text-csv.*`、`04-pdf-source.txt` |
| 重复上传 | PASS；0新增资料，重复批次深度分析禁用；`final/05-duplicate.txt` |
| 批量采纳后取消 Gate | PASS；5候选仍待处理、需求0；`final/11-batch-gate-cancelled.*` |
| 文档审核、下载和 Word 排版 | PASS；GUI重新下载，Word逐页检查技术4页、成本3页；空目录和孤立标题已修复；`final/technical-verified.docx`、`cost-verified.docx`、`word-tech-verified-1..4.png`、`word-cost-verified-1..3.png` |
| V1/V2/V3发布与业务差异 | PASS；V3实际通过发布弹窗与Human Gate；V2→V3移除旧要求、技术修订2→3；`final/09-v3-published-diff.*` |
| 重启和历史不可变 | PASS；重启后GUI三版本及差异保留，V1/V2完整对象深比较不变；`final/10-restart-v3-diff.*`、`invariants.json` |
| 响应式布局 | PASS；五个主要页面×1440/1024/390，共15组实际截图/宽度检查；长URL溢出和窄屏按钮已修复；`final/responsive.json`、`layout-*.png`；早期资料页移动截图见round2 |
| 原生 Desktop 插件入口 | PASS（安装版隔离复制件）；实际点击侧栏MarketPilot→打开V4→进入合成项目；`final/07-native-desktop-panel.*`、`08-native-v4-project.*` |
| 旧 CALM 只读兼容 | PASS；原始备份项目不经转换复制到私有Desktop存储，经GUI进入总览、方案/历史和交付页，修订176，19需求、4资料、已确认路线可读；前后完整记录一致；`final/legacy-readonly.json`。旧 artifacts 不自动转换成V4文档 |
| 转换回退与恢复 | PASS（文件/CLI范围）；`resumed/downgrade-manifest.json`、`restore-manifest.json`，恢复SHA一致；不宣称已运行V3.4 GUI |

## 修复内容

- `src/services/requirement.ts`：允许无当前决策引用的历史需求仅变更为superseded；保持历史内容与快照保护。
- `src/services/v4/research.ts`、`research-skill.ts`、`src/harness/service.ts`、`skills/marketpilot-deep-research/`：DSH研究Skill注入、真实联网结果与失败原因记录；仅联网不能静默退回本地。
- `src/workbench-ui/store.tsx`：项目ID隔离与请求代次校验，避免切换项目时渲染旧数据或旧请求覆盖新状态。
- `src/render/docx.ts`：默认模板生成可直接阅读的章节目录，不依赖Word更新字段；标题与后文保持同页。目录不编造页码。
- `src/workbench-ui/styles.css`：长网址可折行，页头与操作按钮适应窄屏。
- `src/harness/v4-page.generated.ts`：由构建同步；新增/扩充对应回归测试。保留此前模型选择、路线重新确认等修改，不覆盖无关用户工作。

## 环境与数据保护

Web验收使用Desktop 0.11.0内置DSH 0.2.0-rc.2，独立DSH_HOME与插件复制件，回环3180。原生验收使用安装版应用的私有复制件，私有userData、回环3181；仅测试复制件调整数据路径、端口和mobile bridge回环绑定，未修改正式安装/Profile。不是对原封不动正式Desktop环境的部署验收。原生启动曾出现Profile热重载警告，重启后入口可用，不宣称日志零警告。

正式存储SHA256保持 `669636b62c40dd2c87b78d05e578c2529bb85f064cc76d780f4eeee48fec6f20`。全部写入流程使用合成 test_data；旧项目仅在私有复制件读取，没有将旧业务正文/截图写入仓库。未提交、合并或对外发送。

## 补充工程验证

最终 `npm test`：48文件通过、1跳过；372测试通过、1跳过（见 `final/automated-validation.log`，启用备份上的旧数据只读测试）。`npm run typecheck`、最新 `npm run build`、`git diff --check`通过。存在SQLite实验性提示和Git换行提示；不影响退出状态。测试不替代上表GUI验收。

剩余适用边界见 [RISKS_AND_LIMITS.md](RISKS_AND_LIMITS.md)，DSH工作模式和Provider配置见 [DSH_AI_RUNTIME.md](DSH_AI_RUNTIME.md)。
