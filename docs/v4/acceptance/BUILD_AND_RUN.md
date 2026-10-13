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

**已有 V4 写入的数据不能直接交给 V3.4。** 版本切换前先阅读
[ROLLBACK.md](ROLLBACK.md)，在复制件上运行 `scripts/v4-storage.ps1`。
当前代码仍以完整项目记录保存 V4 数据；只有转换生成的 V3 副本可以被旧版本加载。
正式入口先构建，再用 PowerShell `-Mode downgrade|restore|validate`，`-DryRun` 只检查不写入。

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

## 回退回归与隔离 Desktop 前置准备

```powershell
$env:MARKETPILOT_LEGACY_STORE = 'E:/PythonProjects/Work_Platform/marketpilot-backups/20261012-225649-v4-m0'
npx vitest run tests/v4-downgrade.spec.ts
node scripts/verify-v4-storage.mjs
node scripts/prepare-v4-isolated.mjs --profile 'C:/Users/zjdzc/AppData/Roaming/dsh-desktop/harness/profiles/web' --backup 'E:/PythonProjects/Work_Platform/marketpilot-backups/20261012-225649-v4-m0/marketpilot.json'
```

前置脚本在系统临时目录复制已构建插件、准备隔离 JSON 存储和清理过的 Profile；
不复制用户 Provider patch、凭据、Desktop UI 状态或会话，不启动 Desktop。
依赖目录复用已有目录链接，链接并不提供系统层面的写保护；不能在该克隆中安装/更新依赖。
后续启动只对该克隆设置 `DSH_HOME=<脚本返回 root>/harness`，选择独立回环端口。
需继续验证安装版宿主解析和原生窗口入口，不把准备 Profile 当作实机通过。
