# MarketPilot Web UI V3.0 GUI 验收文档

> 版本：V3.0 Phase 5 最终验收
> 日期：2026-10-09
> 验收方式：代理自验收（CDP 无头浏览器 + glm-5.3-flash 图像核验）+ 用户人工终审
> 证据目录：`.marketpilot/gui-acceptance/`（browser / browser-phase2 / browser-phase3 / browser-phase4，共 39 张关键截图）

## 测试矩阵（2026-10-09 19:26 实测）

| 命令 | 结果 |
|---|---|
| `pnpm typecheck` | ✅ 通过（exit 0） |
| `pnpm build` | ✅ 通过（client.js 187.86 kB / gzip 37.65 kB） |
| `pnpm test` | ✅ 21 文件 / **120 测试全部通过** |
| `pnpm marketpilot:demo:smoke` | ✅ 通过（离线全链路：4 文档 → 10 需求 → 18 证据 → 5 成果，274 ms） |

## 真实 GLM-5.3 运行记录

| 工作流 | 实测耗时 | 数据量 | 日期 |
|---|---|---|---|
| 需求提取（V3P2） | **100 秒** | 14 需求（8 proposed + 6 unknown） | 2026-10-09 12:46 |
| 需求提取（V3P3） | **94 秒** | 14 需求 | 2026-10-09 14:18 |
| 候选路线生成（V3P2） | **26 秒** | 3 条候选方案 | 2026-10-09 19:04 |
| 方案生成（V3P2） | **93 秒** | 15 章节 + UNKNOWN 保留 | 2026-10-09 19:11 |
| 招标条款抽取（V3P2） | **8 秒** | 3 条条款 | 2026-10-09 19:13 |
| **全链路合计** | **~5.5 分钟**（含人工确认） | 需求→路线→方案→投标 | 2026-10-09 |

## 九项 GUI 验收图

### 1. 左侧导航按钮及全宽主面板
- **文件**：`browser/01-home.png`
- **核验**：flash 确认品牌顶栏"MarketPilot 智策"、三统计卡、最近项目表全宽渲染；连续 60 帧稳定（`frames/`）。

### 2. 新建项目 + 项目概览
- **文件**：`browser/02-projects.png` + `browser/03-overview.png`
- **核验**：创建栏/搜索/项目表；概览页六阶段条 + 八个子导航 + 统计卡。

### 3. 文件上传（.md/.txt）
- **文件**：`browser-phase2/11-uploaded.png`
- **核验**：brief.md 473 B 通过浏览器 file input 入库，"已导入"提示；五类拒绝测试通过（UNSUPPORTED_FORMAT / INVALID_DOCUMENT / UPLOAD_TOO_LARGE 413 / UNSUPPORTED_KIND / 404）。

### 4. 需求表格 + 原文抽屉
- **文件**：`browser-phase2/16b-table-scrolled.png` + `browser-phase2/14-drawer.png`
- **核验**：14 行需求（短号/正文/类型/优先级/状态徽标/来源）；抽屉含原始表述、来源定位、澄清问题、风险。

### 5. 真人审批弹窗 + 已确认需求
- **文件**：`browser-phase2/15-confirm-ready.png`（审核前）→ `browser-phase2/21-requirements-confirmed.png`（已确认后）
- **核验**：用户在真实 Desktop 中通过对话框完成确认；8 条"已确认"绿色徽标 + "需求基线已生成"提示。人工审批对话框遵循 Human Gate 机制（root waterfall 停靠修复后）。

### 6. 真实 GLM-5.3 Max 运行时间线
- **文件**：`browser-phase3/33-task-steps.png`（任务中心展开视图）
- **核验**：7 步中文名 + 真实时间戳（读取资料→模型提取→需求规范化→未知项检测→保存与待审→等待审核）；耗时 1:39。

### 7. 浅色 / 深色两套截图
- **文件**：`browser/01-home.png`（浅色）+ `browser/06-dark.png`（深色）
- **核验**：flash 确认深色下文字/边框/按钮/选中态清晰可辨；导航状态保留。

### 8. CALM 方案预览（含 UNKNOWN）
- **文件**：`browser-phase4/52-solution-preview.png` + `browser-phase3/36-reader-unknown.png`
- **核验**：15 章节富文本渲染（MarkdownText 安全管道）；"设计边界与待确认条件"章节完整保留 6 条未冻结参数（"最小可检出泄漏率指标未冻结，须通过现场试验和验收协议确认后方可纳入验收基线"等）。

### 9. Tender 无证据条款仍为 unknown
- **文件**：`browser-phase4/55-tender-reviewed.png`
- **核验**：3 条条款中——1 条"部分满足"（关联已确认需求）、**2 条"待确认"**（无已核验 FACT/SOURCE 证据，不判合规）。flash 跨截图追踪确认证据闸门规则生效。

## 安全边界（2026-10-09 审计）

| 检查项 | 结果 |
|---|---|
| 跨域请求拦截 | ✅ 403（Origin: evil.example.com 被拒） |
| 监听范围 | ✅ 仅 127.0.0.1:43129（loopback） |
| DSH Web GUI 鉴权 | ✅ 进程令牌 → HMAC Cookie（`browser-auth.ts`）；匿名 HTTP 首页 401 |
| same-origin 策略 | ✅ 无 Origin（同源/curl/loopback 工具）通过；异源拒绝 |
| 项目 ID 绑定 | ✅ 所有工具调用带 projectId；确认/导出校验 runId 归属 |
| 单用户本地边界 | **明示**：本插件当前仅支持单用户本地桌面使用，不支持对外网监听或多租户 |
| 重启中断 | ✅ 前端显示"任务中断需重试"提示（不虚称可恢复） |

## 人工门记录

| 门 | 触发方式 | 审批人 | 结果 |
|---|---|---|---|
| 需求确认（V3P2） | 桌面对话框 | 用户本人 | 8 confirmed，Baseline 生成 |
| 路线决策（V3P2） | 桌面对话框 | 用户本人 | decision_confirmed |
| 人工核验（证据） | 抽屉按钮 | 可选，未执行 | 不阻塞验收 |

**模型未代替任何人工审批。所有审批均来自真实用户点击。**

## 遗留

- V3P3 项目有 14 条 waiting 需求（可用作演示素材或由用户处理）
- 联网搜索（research_search）需配置 provider，当前为本地资料模式
- 阶段条反映项目业务阶段而非 UI 导航位置（设计决定）
- Artifact 正式导出审批流（`marketpilot_artifact_export` 的 reviewStatus 审批）已有后端，UI 侧留作后续打磨
