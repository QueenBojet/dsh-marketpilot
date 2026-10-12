# MarketPilot V3.4 业务流程与页面精简

2026-10-12；基于 main `bd98c7b`。首页视觉方向获用户确认后，依次完成需求、研究、路线、方案页面优化。改动沿用现有架构和业务规则，未增加后端功能。

默认主线为「上传资料 → AI分析需求 → 技术研究 → 方案路线比选 → 生成技术方案」。统一蓝色主操作、轻灰画布、圆角卡片、标题层级与留白；当前任务、主要结果和下一步清晰分层。证据、成果版本和可选投标仍可随时进入，专业模式保留完整工作流。

需求页：已有结果时先呈现基线与下一步，表格精简为四列，完整类型、来源和风险仍在详情；上传与新分析入口保留。研究页：先呈现真实产品/政策卡片，完整参数、原文依据与比较矩阵可查看，联网不可用状态保持真实。路线页：CALM默认展示三张真实候选卡，核心组成、优势、限制与风险可比较，大矩阵和已记录决策理由折叠，选择仍经真实人工Decision Gate。

方案页：优先呈现保存版本的摘要、主要路线、目录、版本选择与审阅/导出入口；审核元数据、输入指纹和大量UNKNOWN折叠，完整正文保持原样。切换版本读取该版本正文；无已保存摘要/路线时明确提示，不套用当前路线。增加详情ID校验，避免错版本内容显示。新的方案生成仍需主动展开并经原工具执行。

主要文件：`src/client/pages/{Requirements,Research,Alternatives,Solution}Page.tsx`、`components/ResearchCards.tsx`、`RequirementTable.tsx`、`WorkflowSurface.tsx`、`ProjectWorkflowOverview.tsx`、`solutionPresentation.ts`、`hooks/useExecution.ts`、`styles.ts`及`locales.ts`。保留首阶段首页和五步导航改动；截图脚本只读，未触发模型或审批。

验证：35文件/275测试通过，typecheck、build通过，最终bundle契约5/5通过。新回归涵盖精确批次、过滤空结果、旧版本摘要、错误详情ID、人工预览及精确成果导出跳转。真实DSH宿主验证四个页面、矩阵展开、完整UNKNOWN、浅深主题和1024小屏阅读器，无页面溢出或运行异常。全部项目/execution记录及实际业务JSON的SHA256保持不变。DeepSeek Harness、GLM调用配置、Evidence Ledger、Human Gate、WorkflowRun与全部后端规则未改动；未重跑在线生成链路。

| 页面 | 改造前 | 改造后 |
|---|---|---|
| 需求 | [截图](gui-acceptance/v3.4-pages/before-requirements.png) | [截图](gui-acceptance/v3.4-pages/after-requirements.png) |
| 研究 | [截图](gui-acceptance/v3.4-pages/before-research.png) | [截图](gui-acceptance/v3.4-pages/after-research.png) |
| 路线 | [截图](gui-acceptance/v3.4-pages/before-routes.png) | [截图](gui-acceptance/v3.4-pages/after-routes.png) |
| 方案 | [截图](gui-acceptance/v3.4-pages/before-solution.png) | [截图](gui-acceptance/v3.4-pages/after-solution.png) |

构建已在现有宿主加载。可执行`pnpm --config.verify-deps-before-run=false build`后重新加载MarketPilot。源码、前后对比截图与2页总结随本次提交一并交付；原有`docs/competition-2026/`文件未改动。首阶段截图仍在`gui-acceptance/v3.4-home/`。

## CALM操作路径：8分钟

使用现有「CALM 漏油监测桌面版演示」及真实已有成果进行演示：

1. 0:00–1:00：进入项目首页，说明五步主线与ART-06成果入口。
2. 1:00–2:00：点「上传资料」，查看现有4份资料；点「AI分析需求」，查看14条已确认需求及来源，不重新抽取。
3. 2:00–3:00：点「技术研究」，查看已有2项研究成果，说明当前使用本地资料研究。
4. 3:00–4:30：点「方案路线比选」，比较已有3条候选，查看真实已记录的人工选择及理由。
5. 4:30–6:30：点「生成技术方案」进入成果页，查看ART-06摘要、主要路线与目录；切换历史版本，打开完整正文，再进入审阅/导出入口。正式导出仍需人处理原审批门。
6. 6:30–8:00：回首页展开质量提醒、查看依据；切换专业模式展示完整工作流；指出投标检查为可选入口。

这是对真实已有项目的操作与成果演示。上轮在线方案生成耗时11分43秒，因此不承诺从空项目在线生成全链路能在10分钟内结束。CALM含既有合成竞品资料，页面明确保留演示标记，不作为真实市场性能承诺。
