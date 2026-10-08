# MarketPilot 工作台 GUI 验收清单

适用版本：2026-10-08 构建（85 项测试通过；含工作台 HTTP API、React 右侧边栏 Tab、生成层短句柄）。

## 0. 前置

1. 在 `E:\PythonProjects\Work_Platform\marketpilot` 已执行 `pnpm build`（产出 `lib/` 与 `client/client.js`）。
2. **完全退出并重启 DSH Desktop**（托盘右键退出，再启动）。重启会结束当前 AI 会话；重启后新开会话继续。
3. 确认会话模型为 zai / glm-5.3 / reasoning effort max（设置 → Models）。

## 1. 宿主 API 生效

- 重启后在任意终端执行：

```powershell
Invoke-WebRequest -Uri 'http://127.0.0.1:43129/marketpilot/api/tools' -UseBasicParsing
```

- 预期：200，返回 `marketpilot_*` 工具名数组。

## 2. 工作台 Tab 出现

- 打开/选中任意会话（右侧边栏依赖会话）。
- 展开右侧边栏 → 「+」/ 指南页应出现「MarketPilot 工作台」入口；点击打开 Tab。
- 预期：项目列表页（列出既有项目，含「GLM-5.3 结构化输出验证」）。
- 若 Tab 不出现：F12 控制台找 `client-modules` / `marketpilot` 报错，把报错发回。

## 3. 分步点击全流程（真实 GLM-5.3）

按顺序点击并观察（每步 1.5 s 轮询；模型步骤约 1—4 分钟）：

| 步骤 | 操作 | 预期 |
|---|---|---|
| 1 | 新建项目（名称如 `GUI 验收`） | 列表出现新项目 |
| 2 | 进入项目 → 输入路径 `E:\PythonProjects\Work_Platform\marketpilot\fixtures\calm\input\brief.md`，类型 customer_requirement → 导入 | 文档列表 +1 |
| 3 | 勾选文档 → 抽取需求 | 运行中… → 完成后需求列表出现 proposed/unknown 条目 |
| 4 | 勾选全部 proposed → 确认所选需求 | **出现人工问题卡片**（含 JSON 详情）→「确认」→ 状态 confirmed |
| 5 | （可选）重复 2—4 导入其余 fixture 并确认 | UNKNOWN 计数可见 |
| 6 | 生成候选路线 | 2 条候选，均无 selected |
| 7 | 选一条 + 填写理由 → 确认技术路线 | 人工问题卡片 → 确认 → decisions 出现 |
| 8 | 生成技术方案 | 若无决策应先停在 waiting（先点 6/7）；决策后生成完成 |
| 9 | 导入 tender.md（kind=tender）→ 勾选 → 抽取招标条款 → 符合性审查 | 无证据条款全部 unknown，不出现 compliant |
| 10 | 成果区点开 Solution.md | 含「UNKNOWN / 待确认条件」章节 |

## 4. 需要截图留证的画面

1. 工作台 Tab 打开的项目列表；
2. 人工问题卡片（含确认/退回按钮）；
3. 需求列表（confirmed/unknown 状态徽标）；
4. Solution.md 成果预览（UNKNOWN 章节）；
5. Compliance/招标条款全 unknown 列表。

## 5. 常见问题

- **404 on /marketpilot/api/tools**：未重启或插件未重载——确认重启完成。
- **Tab 无入口**：确认当前有会话被选中（hero 界面无右侧边栏，上游设计）。
- **抽取超时**：模型约需 1—4 分钟（max effort）；profile 已设 600 s 超时；若失败把执行错误文本发回。
- **方案失败 SOURCE_MISMATCH**：本轮已加短句柄层；若仍失败请把执行错误与时间发回。
- **跨域 403**：只允许同源访问（桌面内置 webview 即同源）；不要从别的端口页面调 API。
