# UX 优化本机接入与回归验证

日期：2026-10-14（Asia/Shanghai）。基线：`c7ee440d06fb5a3d88f3a6ef51367b94f3512022`，分支：`feat/v4-ux-workbench-optimization`。

本分支导入 Gemini 的前端 UX 补丁，并修复本机审查发现的缺陷。保留七阶段流程导航、上游失效提醒、综合候选置顶、路线对比矩阵、BOM 配置联动、结构化 Markdown 和文档建议审阅等优化。后端领域模型、成本算法与存储结构没有变更。

## 接入修正

- `pages/cost.tsx`：恢复备注字段的表单更新器；BOM 同步返回 Promise，并用同步提交锁和忙碌状态防止请求期间重复点击。部分成功后发生错误时展示已创建数量，刷新后只重试剩余配置。
- `research-progress.ts`、`shell.tsx`、`pages/research.tsx`、`pages/exploration.tsx`：统一按当前有效初筛路线过滤报告，并按不同研究方向计数；同方向重复报告、历史路线、缺正文、待复核报告不再产生已完成提示。
- `tests/v4-foundation.spec.ts`：改正需求确认和模板撰写的实际工具名称。
- `src/harness/v4-page.generated.ts`：由仓库的 `scripts/build-workbench.mjs` 重新生成，保持可复现。
- 新增 `tests/v4-cost-ui.spec.tsx` 与 `tests/v4-research-progress.spec.ts`，共六项回归；文档和截图规范为普通非可执行文件。

## 验证证据

修复前，成本页三项回归均失败：备注输入产生 `setNote` 的 ReferenceError、重复点击期间按钮过早恢复、部分成功后的错误消息未说明已创建数量。修复后成本页三项回归以及研究进度三项回归全部通过。

| 命令 | 结果 |
| --- | --- |
| `npm test -- --reporter=dot tests/v4-cost-ui.spec.tsx tests/v4-research-progress.spec.ts` | 6 通过 |
| `npm run typecheck` | 通过，包含前端源码与新增测试 |
| `npm run build` | 通过，生成独立工作台及插件构建产物 |
| `npm test -- --reporter=json` | 389 通过、3 跳过、0 失败，共 392 项 |

全新 Windows 检出目录会因 Git 自动 CRLF 转换，使既有离线模型中只匹配 LF 的提示词正则失配。全量回归时仅在隔离 worktree 临时将未修改的提示词恢复为 Git 中的 LF 字节；验证后还原检出换行，此环境处理没有提交到分支。缺少客户端产物的问题由完整构建补齐。

## 验证边界

本轮使用本机依赖、React/jsdom、真实 V4 路由及隔离存储验证新增操作，不调用真实模型，也不写入正式项目数据。Gemini 提供的六张截图继续作为其虚拟机合成示范材料；本轮没有重做多视口浏览器验收或实际 Word 打开验证，没有安装或重启正式 Desktop。

原交付报告的虚拟机测试自述不能替代本记录。功能分支验证通过不表示正式环境已部署，也不表示工程研究内容已核实。
