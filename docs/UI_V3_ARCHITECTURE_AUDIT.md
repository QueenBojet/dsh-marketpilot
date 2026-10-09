# MarketPilot UI V3.0 架构核查报告（Phase 0）

> 核查日期：2026-10-09（Phase 0，只审查与设计，未改任何业务代码与上游源码）
> 核查人：DSH 编程 Agent（GLM-5.3 Max）
> 官方 checkout：`deepseek-harness @ 5badb15009ae1756c3afe0ae0cef1faafc290ccc`（0.2.1-alpha.1，与设计文档基线一致，`git status` 树干净）
> 本地插件：`marketpilot @ 94d4192`（v0.2.0，工作台 React 受控 API + 短句柄 + GLM-5.3 验收）
> 运行实例：安装版 DSH Desktop，profile `%APPDATA%\dsh-desktop\harness\profiles\web`

## 0. 结论摘要

**方案 B（DSH 原生主面板 + MarketPilot 插件业务后端）在当前 checkout 上完全可行，所有必需接口均在官方源码中逐行核实，无需修改任何 Harness 核心代码。** 与设计文档（V3.0 §0、§7.1）的伪代码相比，真实接口有两处需要修正：

1. `sidebar.panellist` 注册元数据字段是 `id`（不是设计文档伪代码里的 `name`+`id` 混写）；`id` 必须与 `main` 注册的 `key` 完全一致，由 `MainPanelId` 品牌类型约束。
2. 主面板组件不接收 owner props（`renderSlot('main', {}, { entryKey })` 传空 owner 数据）；当前 projectId/section 等状态必须放在注册时声明的 store 中才能跨面板切换存活——`ui-plugin-manager` 的 `createNavigationStore` 是官方先例。

另有一个设计文档未覆盖的硬约束：**冻结模块表只共享 9 个 specifier**（`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、`dsh-client-store`、`dsh-client-ui-slots`、`dsh-client-ui-primitives`、`dsh-client-ui-dockkit`）。`ui-layout`、`ui-sidebar`、`ui-theme`、`ui-locale` 均**不在表内**，MarketPilot 对它们只能 `import type`（编译期擦除）；运行时值导入仅限表内 9 项。现有 `tsdown.config.ts` 的 `neverBundle` 已把全部 `@deepseek-ai/*` 外置，因此越界导入会在**运行时 require 抛错**而非构建期失败——需新增 bundle 纯度测试兜底（见 §6 风险 R8）。

## 1. 十项核查问题与源码证据

### Q1：`main` keyed slot 的确切注册语法、依赖与生命周期

**声明**（`packages/client/ui-layout/src/client/index.ts`）：

- L53-73：`SlotMap` 中 `'main': { kind: 'keyed'; scope: 'root' }`，JSDoc 明确“保留 `conversation` key 承载 Conversation；其他 key 不绑定 Session”。
- L178-190：ui-layout 向 `root` 注册 AppFrame 时以 `children` 声明 `main`（声明即独占渲染权）。

**注册**（参考实现 `packages/client/ui-plugin-manager/src/client/index.ts` L110-140）：

```ts
ctx.slots.inject('main', function* () {
  const handle = createNavigationStore(), instance = handle.create()
  const store: typeof handle = { ...handle, create: () => instance }
  yield ctx.slots.register({
    name: 'main', key: PANEL_ID, locale: NS,
    store,                        // 可选：跨切换存活的面板状态
    inject: () => face,           // 可选：apply 闭包 → 组件的数据/回调
    children: { ... },            // 可选：页面自己声明的子槽
  }, PluginManagerPage)
  yield /* 其它随装随卸的贡献或清理 */
})
```

- `slots.inject(key, callback)` 语义（`docs/subsystems/slots.md` L21）：回调在宿主每次声明存活期内运行；宿主声明坍塌时贡献随之移除，宿主重挂后重跑；贡献随调用方插件 fiber 退出。生成器逐项 yield 实现原子安装/回滚（`packages/client/AGENTS.md` 新包清单第 4 条）。
- 激活顺序无需关心：`slots.inject` 等待真实声明，不依赖插件加载顺序；Cordis 服务等待由 fiber `inject` 完成。
- 生命周期：ui-layout 的 `retainMainPanels`（`src/client/stores.ts` L97-101）在面板注销时清除指向它的选择，防止悬空。

**选择与查询**（`packages/client/ui-layout/src/client/service.ts`）：

- L16：`MainPanelId = Branded<'MainPanelId'>`（品牌化字符串）。
- L28-36：`ctx.layout.selectPanel(panelId | null)` 选择全局面板，null 回 Conversation；**未注册 key 会 throw**（L73-75）。
- L19-22：`ctx.layout.panelInfo` 是 `HostObservable<{ activePanelId }>`，可 `subscribe`/`getSnapshot`。

### Q2：`sidebar.panellist` 与 `main` key 的绑定、locale、卸载与主题

**槽契约**（`packages/client/ui-sidebar/src/client/contract/slots.ts`）：

- L35：`'sidebar.panellist': { kind: 'list'; scope: 'root'; owner: SidebarPanelIconOwnerProps }`。
- L70-75：图标组件只收 `{ size: number; active: boolean }`——按钮、Tooltip、aria-label、active 高亮全部由侧栏自带。

**元数据构建**（`packages/client/ui-sidebar/src/client/index.ts` L49-63）：

- `syncPanels` 读取每个注册条目的 `options.id`（断言为 `MainPanelId`）、`options.order ?? 0`、`options.label`（`resolveSlotLabel` 解析），按 `order` 升序排序后写入快照 store；locale 变化会重算 label（L63 `ctx.locale.subscribe(syncPanels)`）。

**注册参考**（ui-plugin-manager L141-147）：

```ts
ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
  name: 'sidebar.panellist', id: PANEL_ID, order: 0,
  label: () => t('panel'), locale: NS,
}, PluginsPanelIcon))
```

**图标组件参考**（`PluginsPanelIcon.tsx`，15 行）：仅按 `size` 渲染一个 ui-primitives 图标。MarketPilot 同型实现即可。

**卸载**：`slots.inject` 贡献随插件 fiber 拆除；侧栏 `syncPanels` 订阅槽变化自动移除行；`main` 注销触发 `retainMainPanels` 清选择。主题：侧栏按钮样式全部来自宿主 `--dsw-*` token，MarketPilot 无需处理。

### Q3：官方 `ui-plugin-manager` 同类页面实现位置

- 主面板注册：`packages/client/ui-plugin-manager/src/client/index.ts` **L110-140**（生成器 + store + inject face + children）。
- 侧栏入口注册：同文件 **L141-147**。
- 页面组件：`PluginManagerPage.tsx`（TSX，props 全部来自五类 share：runtime/store/inject/locale/renderSlots）。
- 图标：`PluginsPanelIcon.tsx`。
- 附加模式（可借鉴）：L130-132 订阅 `ctx.layout.panelInfo`，离开面板时把导航 store 复位——MarketPilot **反其道**：不复位，保留用户当前 projectId/section。
- 桌面版还有第二个主面板先例 `schedules`（`ui-sidebar/src/client/index.ts` L71 提及），进一步证明第三方 keyed 主面板是支持面。

### Q4：`main` 为 root scope、不绑定 Session；面板内如何存当前 projectId/section

- `AppFrame.tsx` L40-43：`MainPanel` 组件仅 `renderSlot('main', {}, { entryKey: panelId ?? 'conversation' })`——非 conversation key **没有任何 owner props、没有 Session 绑定**；切换 Session 不影响面板，切换面板不影响 Conversation（选择状态存于 root 布局 store，`stores.ts` L16-22）。
- 组件可用框架标准 props：`t`（注册的 locale 命名空间）、`useStore`（声明的 store）、注册 `inject` 工厂返回的 face、`usePanelInfo` 等全局 hooks（`docs/subsystems/slots.md` L81-97 表）。
- **跨面板切换/跨 Session 存活的状态必须放注册声明的 store**（keyed 槽仅渲染活动 entry，切走即卸载组件）。MarketPilot 采用 `createMarketPilotNavigationStore`（当前 view、活跃 projectId、section、执行轮询句柄索引），仿 `createNavigationStore` 的 `{ ...handle, create: () => instance }` 单例共享写法。

### Q5：`ui-primitives` 实际可用 export（已核对 README 组件目录）

控件：`Button`（variant primary/ghost/outline/toolbar；H36/R12 md、H28/R8 sm）、`Switch`、`SegmentedControl`、`Checkbox`、`Input`、`InlineEditor`、`Menu`/`MenuItemButton`、`MenuGroup`、`Pill`、`SegmentedTabs`、`Tag`（8 色 tone）、`PathLabel`、`StateDot`（done/warning/error/idle/ongoing；`appearance="step"`）、`ConnectionIndicator`、`DisclosureRow`、`TextShimmer`、`Modal`、`RiskConfirmation`、`Tooltip`、`HoverCard`、`ImageLightbox`、`Toast`、`SettingsForm*`、`JsonTree`/`JsonBlock`。
渲染器：`MarkdownText`（**不可信 GFM 安全渲染**，Phase 3 成果预览用）、`MarkdownDelegateProvider`、`CodeBlock`、`TerminalBlock`、`ReadBlock`、`DiffBlock`、`SearchBlock`、`WebBlock`。
图标：`icons/*` 系列、`PluginArtworkDefault` 等。
约束：所有面向用户的文案是**必填 label props**（零 Cordis、无回退文案）——与 MarketPilot 词典模式天然契合。MarketPilot 的 `DataTable`、`StatusTag`（业务状态徽标）、`EmptyState` 等业务组件自建（官方目录没有表格类控件，属于合理的包内自研）。

### Q6：`tsdown.config.ts` 的 CJS factory 与 peer 约束如何处理 TSX、CSS、官方组件

- 现有配置（`marketpilot/tsdown.config.ts`）：`window.__ModuleLoader__.load({ id, factory })` banner/footer + `neverBundle(react | @deepseek-ai/*)`。**TSX**：tsdown（rolldown/oxc）默认 automatic JSX runtime，产物 `require('react/jsx-runtime')`——已被 neverBundle 外置且在冻结模块表内（官方 clientBundle 同样无自定义 jsx 配置即编译 `PluginManagerPage.tsx`，先例成立）。
- **官方组件**：`@deepseek-ai/dsh-client-ui-primitives` 与 `dsh-client-ui-slots` 在冻结模块表内（`packages/client/web/src/platform.ts` L8-14），基线外置对所有动态 bundle 隐式生效，**无需** `dsh.client.external`；`ui-layout`/`ui-sidebar`/`ui-theme`/`ui-locale` 只允许 `import type`。
- **CSS**：官方通道是 factory 物化期注入 `<style data-plugin-css=...>`（`packages/client/tsdown.client.ts` `styleInjectionModule`；`packages/client/modules/src/client/manifest.ts` L9-14 明示“包括 CSS 注入在内的模块体副作用都在 factory 闭包内”）。MarketPilot 自有 config 没有 lightningcss 管线，Phase 1 采用等效简化：`styles/*.css.ts` 导出 CSS 字符串 + 一次性注入器（幂等 tag `data-plugin-css="dsh-marketpilot"`，`ctx.effect` 卸载时移除节点），类名统一 `mp-` 前缀，全部颜色/圆角/字号引用 `var(--dsw-*)`。CSS Modules 若后续需要，再评估引入与官方相同的 lightningcss 插件，不作为 Phase 1 阻塞项。
- **dsh.client manifest**：`inject` 字段仅信息性（预检显示/HMR diff），不决定激活顺序；按实际依赖更新为 locale + ui 依赖的包名列表即可。

### Q7：桌面版 profile 对 `dsh-marketpilot/client.js` 的加载复核

实测（只读检查 profile 目录）：

- `%APPDATA%\dsh-desktop\harness\profiles\web/package.json`：`"dsh-marketpilot": "link:E:/PythonProjects/Work_Platform/marketpilot"`，且列入 `dsh.profile.bundles`。
- `cordis.patch.yml` 末尾：`- id: marketpilot` → `modelTimeoutMs: 600000`、`maxDocumentBytes: 2097152`（GLM-5.3 Max 600s 超时已生效）；GLM-5.3（reasoningEfforts 含 max）由 okai provider 配置提供。
- 服务链（`packages/client/modules/src/index.ts`）：Loader 条目扫描 `dsh.client` 声明 → `clientPath` 指向包内 `client/client.js` → `/plugins/dsh-marketpilot/client.js` 路由（L647-656）→ 响应体**首次 GET 后缓存**（LazyResponse，L680）→ `rev` 仅经 HMR watch 的 `rebuilt()` 更新（L713-719）。
- **结论（三态区分）**：源码 → `pnpm build` 产出 `lib/` + `client/client.js`（link: 直连源码树，产物即运行文件）→ **安装版 Desktop 无 dev watcher，必须完全退出并重启 DSH Desktop** 才会加载新 bundle（重启后 profile 重新组合 boot graph）。仅刷新页面不够（宿主响应缓存）。

### Q8：保留右侧旧入口作跳转、避免双工作台

- 现状：`src/client/index.ts` 注册 `sidebarRightTabs` 类型 + `sidebar.right.pane.tab` 槽（ui-sidebar-right，`session` 作用域，需选中会话才可见——上游设计）。
- Phase 1 方案：旧 Tab 保留但只渲染「打开 MarketPilot 主工作区」按钮，点击调用 `ctx.layout.selectPanel('marketpilot')`（需在 client `inject` 数组加 `'layout'`）。`selectPanel` 未注册时 throw 的行为天然防错序。不再渲染业务表单，消除双工作台。
- 卸载完整性：两处注册均已在 `ctx.effect` 内（现状即如此），Phase 1 延续。

### Q9：`api.ts` 数据字段与后端一致性

逐字段核对（`src/client/api.ts` vs `src/harness/routes.ts`/domain）：

| 项 | 结论 |
|---|---|
| `ArtifactRow.status` | **不一致**。后端实体是 `reviewStatus: 'draft' \| 'approved'`（`src/domain/artifact.ts` L10；services 均写 `reviewStatus`）。现 Workbench 的 `a.status === 'approved'` 永假，徽标恒显示 draft。V3 DTO 必须映射为 `reviewStatus` |
| `ProjectDetail` 全量载荷 | routes `projectDetail()` 一次性返回 12 个集合（含 `context`、`competitors`、`policies`——api.ts 类型里根本没有这三个字段，实际数据被丢弃）。V3 需拆分投影 API |
| `ExecutionView` | 与 `WorkbenchExecutionView` 一致（除 `startedAt` 前端类型未声明，实际已返回） |
| 需求确认绑定 | Workbench L108-109 用第一条 `waiting_human` run 当确认目标（设计文档缺口 #4 属实）；V3 必须用执行返回的 `runId` 精确绑定 |
| 轮询 | 1.5s `setInterval`、单执行句柄（`pollRef`），新建项目用独立未清理 interval——V3 抽 `useExecution` 统一 |

### Q10：React UI 测试依赖（不引入第二份 React）

- 现状：`react ~18.3.1` + `@types/react` 已是 devDependencies（bundle 外置、运行时由宿主表提供同一份）；vitest `environment: 'node'`、include 仅 `tests/**/*.spec.ts`；已有 `client-bundle.spec.ts` 用假 `__ModuleLoader__` 做结构冒烟。
- 需新增：`react-dom@~18.3.1`（dev，渲染测试）、`jsdom`（dev，vitest per-file `// @vitest-environment jsdom` pragma，与官方 GUI 测试同法）、vitest include 增加 `**/*.spec.tsx`。**不引入** `@testing-library/*`（可用 `react-dom/client` + `act` 保持零新增传递依赖；如后续需要再评估）。
- 单一 React 保证：测试 import 的 `react`/`react-dom` 与 bundle 外置的 specifier 同源（node_modules 同一安装），无第二份拷贝。

## 2. 最小可行 PoC 设计（Phase 1 落地形态）

```tsx
// src/client/index.ts（改造后核心，示意）
const PANEL_ID = 'marketpilot' as MainPanelId
export const inject = ['slots', 'locale', 'layout', 'sidebarRightTabs']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'marketpilot: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('main', function* () {
    const handle = createMarketPilotStore(), instance = handle.create()
    const store: typeof handle = { ...handle, create: () => instance }
    yield ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS, store, inject: () => face }, MarketPilotPanel)
  })
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: PANEL_ID, order: 10,
    label: () => t('panelTitle'), locale: NS,
  }, MarketPilotPanelIcon))
  // 旧右侧 Tab 降级为跳转按钮（见 Q8），ctx.effect 包裹
}
```

要点：`key` 与 `id` 同为 `'marketpilot'`；不动 `conversation`；store 保活导航状态；`order: 10` 排在官方 plugins(0)/schedules 之后；禁用插件时 fiber 拆除 → 槽贡献、面板、样式注入一并回收。

## 3. 对 Conversation/Session 的影响评估

- 主面板选择是 root 布局 store 状态（`activePanelId`），与 Session 选择正交（ui-layout 模块注释、`stores.ts` L17-19）。切到 MarketPilot 不卸载/不改 Conversation 数据；切回时 Conversation 原样恢复（keyed entry 重新渲染，其状态由自身机制管理）。
- `DocumentTitle`（AppFrame L275-279）依据 `activePanelId` 决定标题来源——MarketPilot 激活时文档标题不再显示会话名，属预期宿主行为。
- 右侧栏（rightbar）与主面板互不抢占：rightbar 由其 occupant 通过 `ctx.layout.openRightbar` 报告，MarketPilot 不调用即无影响。
- 已确认无风险：`main` 注册不与 ui-conversation 冲突（其 `conversation` key 注册于 `ui-conversation/src/client/apply.ts` L532-537，我们使用不同 key）。

## 4. 代码改造清单（Phase 1 范围，按提示词边界）

| # | 文件 | 动作 | 说明 |
|---|---|---|---|
| 1 | `src/client/index.ts` | 重写 | main + sidebar.panellist 注册（§2 PoC）；旧 Tab 降级跳转；词典扩容 |
| 2 | `src/client/MarketPilotPanel.tsx` | 新增 | 主面板入口：读 store，分发 home/projects/project 三层视图 |
| 3 | `src/client/stores.ts` | 新增 | `createMarketPilotStore`（view/activeProjectId/section 单例句柄） |
| 4 | `src/client/pages/HomePage.tsx` | 新增 | 首页：真实 `/projects` 数据、空态、新建入口 |
| 5 | `src/client/pages/ProjectsPage.tsx` | 新增 | 项目列表/搜索/打开 |
| 6 | `src/client/pages/ProjectOverviewPage.tsx` | 新增 | 六阶段导航 + 摘要 + 占位 section |
| 7 | `src/client/components/*.tsx` | 新增 | AppHeader/PageHeader/StatusTag/EmptyState/LoadingState/ErrorState/DataTable（ui-primitives 组合，`--dsw-*` token） |
| 8 | `src/client/styles/*.css.ts` + 注入器 | 新增 | `mp-` 前缀局部样式，factory 物化期注入（§Q6） |
| 9 | `src/client/locales/{zh,en}.ts` | 新增 | 词典从 index.ts 拆出并扩充（中文优先） |
| 10 | `tsdown.config.ts` | 微调 | 保持现有 banner/外置；确认 TSX/jsx-runtime 产物（预期零改动，构建验证为准） |
| 11 | `package.json` | 微调 | devDeps + react-dom/jsdom；`dsh.client.inject` 信息列表更新 |
| 12 | `tsconfig.json` | 微调 | `"jsx": "react-jsx"`；client 包类型 paths |
| 13 | `scripts/build-harness-types.mjs` | 扩展 | 增加 client 面（ui-slots/ui-primitives/ui-layout/ui-sidebar）声明产出 |
| 14 | `vitest.config.ts` | 微调 | include `*.spec.tsx` |
| 15 | `tests/client-bundle.spec.ts` | 扩展 | 断言 main/panellist 注册形状；**bundle require 集 ⊆ 冻结模块表** |
| 16 | `tests/*.spec.tsx` | 新增 | jsdom 渲染测试（首页/列表/空态/错误态/store 保活） |
| 17 | `src/client/Workbench.ts`、`src/client/api.ts` | 本期不动 | Phase 2 起逐步替换（api.ts 的 reviewStatus 修正随 Phase 2 DTO 一并做，避免本期双份类型） |
| 18 | `docs/UI_V3_IMPLEMENTATION_LOG.md`、`README.md` | 更新 | 每阶段提交规则要求 |

不触碰：`src/domain/`、`src/services/`、`src/storage/`、`src/workflows/`、`src/tools/`、`src/adapters/`、`src/harness/`（宿主半边）、`deepseek-harness/**`。

## 5. 兼容性 / 安全 / 运行风险

| # | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 运行实例加载旧 bundle（本会话 GUI 即旧版） | 高频 | 每轮改动后 `pnpm build` + **完全重启 DSH Desktop**；验收前按 GUI_ACCEPTANCE 前置执行 |
| R2 | 越界值导入（模块表外包）运行时才炸 | 高 | 新增 bundle 纯度测试：解析产物 require 集 ⊆ 9 项冻结表；typecheck 阶段 paths 指向声明 |
| R3 | `selectPanel` 在 main 未注册时 throw | 中 | 旧 Tab 跳转按钮仅在插件自身激活时存在，注册同源；异常兜底 try/catch 提示 |
| R4 | 与 `conversation` key 冲突或抢占 root/sidebar single slot | 低 | 使用独立 key `marketpilot`；清单内无 single 槽注册；CI 冒烟断言 |
| R5 | 双工作台并存（旧 Tab 未降级） | 中 | Phase 1 同时降级旧 Tab 为跳转按钮（同一 PR 内完成） |
| R6 | 样式污染宿主 | 中 | 仅 `mp-` 前缀类 + `var(--dsw-*)`；style tag 带专属 data 属性且随 effect 卸载；无全局选择器 |
| R7 | `/marketpilot/api` 仅 same-origin 校验 | 中（既有） | Phase 1 不新增攻击面（沿用既有只读+工具路由）；Phase 5 按提示词补身份边界与上传加固 |
| R8 | 内存执行态重启丢失（waiting_human 不可恢复） | 中（既有） | UI 文案明示“任务中断需重试”；不宣称可恢复（Phase 2 细化） |
| R9 | `reviewStatus`/`status` 字段错位（现存 bug） | 低（展示层） | Phase 2 DTO 统一为 `reviewStatus`，随需求页一并修 |
| R10 | 安装版 Desktop 与 checkout 版本漂移 | 低 | profile 已按 0.2.1-alpha.1 基线配置；GUI 验收时以 `window.__DSH_BOOT__` 实际行为复核，发现差异立即停并报告 |
| R11 | pnpm link 的 node_modules 符号环（ELOOP） | 工具链 | 已实测复现：避免 shell 递归枚举，一律用 glob/grep 工具 |
| R12 | 测试基线漂移 | 低 | Phase 0 已实测当前基线（见 §6），每阶段跑全量 `pnpm test` 对比 |

## 6. 测试与命令基线（Phase 0 实测，2026-10-09）

- `pnpm test`：**13 个文件 / 86 项全部通过**（3.84s）——与冻结基线 86 一致。
- `pnpm typecheck`：通过（exit 0）。`pnpm build` 本期未改代码未重跑；Phase 1 首轮提交前执行并记录。
- 既有 86 项测试为冻结底线：不删除、不 skip、不降标准。
- Phase 1 验收 = 自动化全绿 **且** Desktop GUI 实测截图（1440×900 浅色首页/列表、1280×720、深色、切换往返、禁用/启用插件），两者缺一不可。

## 7. Phase 1 实施顺序（待用户确认后执行）

1. 工具链：tsconfig jsx + 类型脚本扩展 + devDeps + vitest include（一次到位）。
2. 注册层：`index.ts` 重写（main/panellist/旧 Tab 降级）+ `stores.ts` + bundle 纯度测试。
3. 展示层：styles 注入器 → 基础组件 → 三个页面（真实 API 数据）。
4. 渲染测试 + 全量回归（test/typecheck/build）。
5. 输出 GUI 验收步骤清单，**停止等待用户在 Desktop 实测确认**。
