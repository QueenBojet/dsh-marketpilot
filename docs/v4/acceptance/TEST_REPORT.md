# 测试报告

环境：Windows 11，Node 24.14，vitest 4.1.8，分支 `feat/v4-workbench-foundation`，日期 2026-10-13。

## 回退兼容修复后的最新复验（2026-10-13）

下面历史记录仅证明 V4 读取 V3，不证明反向兼容。新测试使用固定 V3.4 提交
`9aae1d851346d41d191f447e4f7282ddf285771d` 的原版 schema 和官方 StorageDomain，
实际复现 `unrecognized_keys: v4` / `invalid-record`，并完成两轮安全副本往返。

| 命令 | 新的实际结果 |
| --- | --- |
| `npx tsc --noEmit -p .` | 退出码 0 |
| `npx vitest run`（设置 `MARKETPILOT_LEGACY_STORE` 为 M0 备份目录） | 43 文件：42 通过、1 跳过；358 用例：357 通过、1 跳过（截图 opt-in）；8.17 秒 |
| `npx vitest run tests/v4-downgrade.spec.ts`（同一环境变量） | 23/23，4.44 秒；含 10 个旧项目的备份复制件往返 |
| `npm run build` | 退出码 0；workbench 288.7 KiB；client 462.19 kB |
| `node scripts/verify-v4-storage.mjs` | 11 次正式 PowerShell CLI 调用、真实转换进程强制终止与重试均通过 |
| `node scripts/prepare-v4-isolated.mjs --profile <本机 web profile> --backup <M0 marketpilot.json>` | 新临时 Profile、构建复制件和存储复制件已准备；未启动 GUI |

唯一跳过项为截图生成；此次没有改 UI。原版 V3.4 必须先经过数据转换才能回退，
不能自然忽略 V4 字段。失败日志、通过日志、逐轮 SHA 和记录数量在
`evidence/downgrade/`，设计与结论见 [DOWNGRADE_COMPAT_REPORT.md](DOWNGRADE_COMPAT_REPORT.md)。

## V4 原验收记录（保留历史证据）

| 命令 | 结果 |
| --- | --- |
| `tsc --noEmit -p .` | 通过 |
| `vitest run` | 42 个文件：40 通过、2 跳过（opt-in）；335 个用例：333 通过、2 跳过 |
| `npm run build` | 通过（workbench 页 288.7 KiB 内联单页；client 462 kB） |
| `MARKETPILOT_PREVIEW=1 vitest run tests/v4-preview.spec.ts` | 通过，生成 33 张截图 |
| `MARKETPILOT_LEGACY_STORE=<备份目录> vitest run tests/v4-legacy-readonly.spec.ts` | 通过 |

两个跳过项即截图与旧数据只读检查，需显式环境变量启用。

## §7.1 验收步骤对照（`tests/v4-acceptance.spec.ts`，隔离 SQLite 存储，经 HTTP API 驱动）

| 步骤 | 验证内容 | 结果 |
| --- | --- | --- |
| 1 | 创建项目；第一批上传后仅产生规则轻提示（`detectedBy=rule`）；人工采纳只生成 proposed，需再经人工确认 | 通过 |
| 2 | 无模型时研究运行如实失败（MODEL/模型 错误），`sources` 保持为空，不伪造来源；从项目资料人工摘录结论并带引用 | 通过（联网未验证，见限制） |
| 3 | 两条候选路线、草稿选择、Human Gate 确认路线、写入配置 | 通过 |
| 4 | 测试价格标记为 test_data，供应商核实检查明确提示“测试数据”；数量跟随配置 = 4 | 通过 |
| 5 | 技术与成本两份 DOCX（PK 头）、文档审核、`x-marketpilot-reviewed: true`、发布 V1 | 通过 |
| 6 | 第二批资料只提出差异，人工采纳并确认 | 通过 |
| 7 | 单价 1000 → 1200 后成本审核变为 stale、发布被阻断；重新审核与刷新文档后发布 V2 | 通过 |
| 8 | V1/V2 业务级差异包含“1000 → 1200”和“2 秒”；重启存储后 V1/V2 仍在 | 通过 |
| 9 | 旧 CALM 项目只读检查（见下） | 通过 |

另有既有用例覆盖：三项独立成本审核、数量非负整数、混合币种缺汇率时不出总价、已发布版本不可变、已审核/已导出/已对外发送三态独立、对话无法绕过 Human Gate、模型路由优先级与实际路由记录、重启后中断运行的回收。

## 旧 CALM 数据只读检查（步骤 9）

数据源：M0 备份 `marketpilot-backups/20261012-225649-v4-m0/marketpilot.json`（V3.4 JSON 存储）。测试先复制到临时目录再打开，结束后校验原文件 SHA-256 未变；只输出计数和项目名，不输出正文。

10 个旧项目全部可由 V4 读模型加载（均无 `v4` 字段，按空 V4 状态处理）：

| 项目 | 资料 | 需求 | 证据 | 候选路线 | 决策 | V4 路线 |
| --- | --- | --- | --- | --- | --- | --- |
| CALM 漏油监测桌面版演示 | 4 | 19 | 38 | 3 | 1 | 已确认（沿用 V3 Decision） |
| CALM 现场演示（10 分钟版） | 4 | 23 | 14 | 0 | 0 | 无 |
| CALM 正式演示（现场确认用） | 4 | 23 | 17 | 0 | 0 | 无 |
| GLM-5.3 结构化输出验证 | 1 | 14 | 12 | 0 | 0 | 无 |
| GUI 验收（真实 GLM-5.3） | 1 | 14 | 12 | 0 | 0 | 无 |
| V3P2 自验收 04:46 | 2 | 14 | 9 | 3 | 1 | 已确认 |
| V3P3 自验收 06:18 | 1 | 14 | 12 | 0 | 0 | 无 |
| 其余 3 个空项目（test / test1 / V3.3 M1 空项目） | 0 | 0 | 0 | 0 | 0 | 无 |

旧项目成本行、文档、正式版本均为 0，发布前检查给出 4–6 条阻断项（符合预期：尚未做 V4 成本与文档）。未对真实 Desktop 存储做任何写入。
