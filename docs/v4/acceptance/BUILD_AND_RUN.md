# 构建、启动与使用

## 构建与测试（PowerShell，在仓库根目录）

```powershell
cd E:\PythonProjects\Work_Platform\marketpilot
npm install
npm run build              # tsdown + workbench bundle (src/harness/v4-page.generated.ts)
npx tsc --noEmit -p .
npx vitest run
```

只改了 `src/workbench-ui/` 时，可以单独运行 `node scripts/build-workbench.mjs` 重新生成内联页面。`tests/v4-foundation.spec.ts` 会检查生成文件是否过期。

## 启动

按 V3 README 的 DSH 流程启动（已有 profile 时跳过第一条命令）：

```powershell
pnpm dsh marketpilot --from-default-profile web --dump-config
pnpm dsh plugin --profile marketpilot add ../marketpilot
pnpm dsh marketpilot --no-open
```

打开工作台有两种方式：

- 浏览器访问 `http://127.0.0.1:3080/marketpilot/workbench`。3080 是 DSH 的默认端口，以 Harness 启动时打印的地址为准。
- 在 DSH Desktop 中打开 MarketPilot 面板，点击顶部的“打开 V4 独立工作台 ↗”。

服务只监听回环地址，没有用户认证，不要对外暴露。

## 演示流程

1. 工作台 → 新建项目。
2. 资料与变更 → 上传第一批资料 → 查看规则轻提示 → 人工点击“深度分析” → 采纳需求并确认。
3. 智能研究 → 发起研究。需要模型；联网研究还需要 Web Provider。证据抽屉里能看到来源和引用。之后摘录结论。
4. 方案与决策 → 比较候选路线 → 人工确认路线（Human Gate）→ 填写配置。
5. 成本与报价 → 根据配置生成 BOM → 录入价格 → 完成三项独立审核。
6. 文档与交付 → 生成技术文档和成本 DOCX → 在 A4 预览中审核 → 导出 → 人工发布 V1。
7. 上传第二批资料 → 采纳差异 → 修改价格。此时相关审核会自动失效，需要重新审核并刷新文档 → 发布 V2。
8. 文档与交付 → 版本对比，查看 V1 和 V2 的业务级差异。

模型在 设置 中配置，也可以按项目或按单次运行覆盖。

## 截图与旧数据检查

```bash
MARKETPILOT_PREVIEW=1 node_modules/.bin/vitest run tests/v4-preview.spec.ts
MARKETPILOT_LEGACY_STORE='E:/PythonProjects/Work_Platform/marketpilot-backups/20261012-225649-v4-m0' node_modules/.bin/vitest run tests/v4-legacy-readonly.spec.ts
```

截图测试需要本机安装 Chrome。旧数据检查只读取备份的副本，不修改备份本身。
