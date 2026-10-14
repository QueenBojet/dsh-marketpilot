# V4→V3.4 回退兼容修复报告

日期：2026-10-13（Asia/Shanghai）。分支：`feat/v4-workbench-foundation`。
起始 HEAD：`ee96bea825e5da70fd8563b6e732f7453b76d50c`。
只读 V3.4 对照：`9aae1d851346d41d191f447e4f7282ddf285771d`。
提交身份以本报告所在 Git commit / [draft PR #1](https://github.com/QueenBojet/dsh-marketpilot/pull/1) 的 head 为准。

**结论：安全复制件回退可用；需执行数据回退转换，不能直接切换代码。**
原版 V3.4 可以通过官方 StorageDomain 读取转换副本，最新 V3 数据被完整保留，
V4 增量能单独保存并在回到 V4 时恢复。没有声称在线 sidecar 或原位无缝兼容。
没有修改真实 Desktop 项目数据、现有 CALM 项目或 `main`；无关未跟踪目录
`docs/competition-2026/` 保留且不纳入提交。未修改 DSH 上游源码。

## 初始故障与真实影响

复现命令：`npx vitest run tests/v4-downgrade.spec.ts`。
最初期待旧版重开成功的测试实际失败，连续两次复现。日志见
[01-before-fix.log](evidence/downgrade/01-before-fix.log)。

在系统临时目录中，用独立、固定 UUID 的 V3.4 合成 fixture 创建两个项目，
原版 V3.4 读取成功，V4 读取成功，再通过真实 `HarnessProjectRepository.update`
写入真实 V4 对象。重新用未修改的 V3.4 schema 打开官方 JSON StorageDomain：

```text
DomainError: domain 'marketpilot': stored record '00000000-0000-4000-8000-000000000001'
in table 'projects' does not match its schema
code: invalid-record
cause: ZodError, code: unrecognized_keys, keys: ["v4"], path: []
message: Unrecognized key: "v4"
```

实际字段位于 `ProjectState.v4`；此前文档的 `project.v4` 是项目记录的简称，
不是内层 `ProjectState.project`。域打开时逐记录校验，一条不兼容记录会阻断整个域，
包括另一个未写 V4 字段的空项目。它没有静默加载/跳过，也没有损坏源文件；
故障前后源 SHA 一致。不是 JSON 语法问题，也不是 unit version 不匹配。

## 决策与取舍（ADR）

原则：源文件永不改写；V3 内容和引用保持；全部 V4 信息可恢复；失败明确阻断。
驱动因素：官方存储生命周期、跨版本严格校验、V3 期间新增写入的保留、异常中断安全。

| 方案 | 收益 | 代价与取舍 |
| --- | --- | --- |
| 在线独立 V4 域/sidecar | 新写入不污染旧 strict schema | `storage-domain` 官方文档明确没有跨表事务；V4 intake/Decision 等同时更新 V3 引用与 V4 对象。需设计事务日志/恢复协议及已内嵌数据迁移，不能仅拆分两次 put |
| 离线导出/恢复工具（采用） | 保留当前原子项目写入，备份完整原件；在新位置完成转换与校验；故障不改源数据 | 需要显式转换、停止 writer、保存不可变 bundle；仅支持 single-file JSON |
| 直接删除 v4/用 M0 覆盖 live 数据 | 不可采用 | 会丢失 V4 增量或备份之后的 V3 内容，且不保留恢复路径 |

架构挑战：在线 sidecar 是长期可取方向，但没有跨域事务时，先后写入任意顺序都可能
留下悬空引用或不一致 revision。离线方案避免扩大在线写入协议变更；运行时仍保存完整项目。
质量挑战：导出 V3 本身不足以证明恢复，必须保全原件/sidecar、实际 V3 写入后重回 V4、
覆盖校验失败和中断。两轮往返、完整对象哈希和 DOCX 字节对比关闭此证据缺口。
后续如实现在线 sidecar，必须单独设计事务/恢复协议并复用这里的旧版反向验证。

预先检查的失败场景：

1. sidecar 丢失/损坏：manifest 校验所有文件，完整原件仍在 backup；拒绝恢复。
2. 转换中断或源 writer 继续写入：staging 完成前不发布；源 SHA 再检查，变化即失败。
3. V3 删除原项目或 V4 引用目标：恢复合成完整状态并严格校验，明确阻断，不静默丢弃。

## 实现与数据迁移

- `src/storage/downgrade.ts`：离线转换、路径/junction 解析、严格 envelope 校验、
  checksum、逐项目内容/数量摘要、独占 staging、原件备份、完整恢复与幂等复用。
- `src/storage/v34-schema/`：十个 V3.4 原始 TS 文件逐字节冻结，
  `provenance.json` 记录来源与 SHA；测试验证每个文件，`.gitattributes` 固定 LF。
- `scripts/v4-storage.ps1` / `.mjs`：正式 PowerShell 入口，支持 downgrade、restore、validate、dry-run；退出码 0/1/2。
- `tests/v4-downgrade.spec.ts` / `downgrade-fixture.ts`：原版故障、两轮完整往返、
  V3 新写入/新增项目、checksum、不可变基线、引用冲突、拒绝未知数据/目录覆盖、故障注入和并发输出。
- `scripts/verify-v4-storage.mjs`：构建后的正式 CLI 和进程强制中断实测。
- `scripts/prepare-v4-isolated.mjs`：已构建插件复制件、净化 Profile 和旧备份数据复制件的 GUI 前置准备。
- 修订 `ROLLBACK.md`、`TEST_REPORT.md`、`RISKS_AND_LIMITS.md`、`BUILD_AND_RUN.md`，撤回旧版自然忽略字段的错误说法。

转换生成完整原件 backup、V3 projection、全部 V4 sidecar 和 manifest。
恢复以最新 V3 工作复制件为主体，重新附加 sidecar；没有覆盖最新 V3 内容。
新 V3 项目完整保留；原项目删除、ID 冲突、坏引用、未知格式/字段/表均失败。
解析若会 trim/default 改写原件则拒绝，避免校验器的转换悄悄改变数据。

## 实际测试结果

命令均在仓库根执行。旧数据检查显式设置：

```powershell
$env:MARKETPILOT_LEGACY_STORE = 'E:/PythonProjects/Work_Platform/marketpilot-backups/20261012-225649-v4-m0'
```

| 命令 | 实际结果 | 原始证据 |
| --- | --- | --- |
| 初次 `npx vitest run tests/v4-downgrade.spec.ts` | 1 失败：捕获 V3.4 的 unknown v4 | `01-before-fix.log` |
| 修复后同命令（开启旧备份） | 23/23，4.44 秒 | `02-after-fix.log` |
| `npx tsc --noEmit -p .` | 退出码 0 | `03-typecheck.log` |
| `npx vitest run`（开启旧备份） | 43 文件：42 通过、1 跳过；357 通过、1 跳过（358）；8.17 秒 | `04-regression.log` |
| `npm run build` | 退出码 0；workbench 288.7 KiB；client 462.19 kB | `05-build.log` |
| `node scripts/verify-v4-storage.mjs` | 11 次 PowerShell 调用，强制终止实际子进程 SIGTERM 后无正式输出、源 SHA 不变；重试成功 | `06-cli.log` |
| `node scripts/prepare-v4-isolated.mjs --profile <本机 web> --backup <M0 JSON>` | 净化克隆准备通过，未启动 GUI | `07-desktop-preflight.log` |
| 安装版 Desktop 内置 Node 24.17.0 执行转换 dry-run | 10 项目校验通过，仅操作隔离复制件 | `08-installed-runtime.log` |

唯一跳过项是截图生成 opt-in；本次没有改 UI。新增回退测试在每轮比较所有 V3 记录、ID、
codeBook、revision 和 V4 完整对象，V3 在回退期间的真实 durable write 也被恢复。
DOCX 使用实际模板上传和实际 export，比对恢复前后文件全部字节，非仅检查 PK 头。

开发中的一项负路径测试准备未写回恢复的空项目，曾返回 MISSING_PROJECT 而非预期的
坏引用错误；修正测试准备后通过，没有放宽实现。CLI 崩溃测试让 worker 保持活跃后再
实际强制终止；普通异常和强制终止都完成验证。

## SHA 与记录数量摘要

以下来自最后一次针对性测试 `02-after-fix.log`，包括 V3 durable write，因此不同阶段文件 SHA 不同；
“不变”指每次转换前后同一源文件，所有断言均通过。

| 摘要 | 实际 SHA-256 |
| --- | --- |
| 第一轮 V4 输入 | `b828ba113a30cd8772ebc0e678829dc9f80b901693e336ceaff6d07fc36f0dbe` |
| 第一轮 V3 写入后输入 | `e008b0c36ddc1e9fdf7a3271fd0ac2caf68d66cd11079cea5b8cff6fe59a5b80` |
| 第二轮 V4 输入 | `71a845b36cd0237e73ec31a6f7d70e22026dab5cacd50056fd1f024728be6ede` |
| 第二轮 V3 写入后输入 | `0a6fdf88b4c91045301ebd0bd488cb6ec9df18bb36392ed48f6568b987ea6e74` |
| 两轮 V1/V2 基线整体哈希 | `1e6c220f62d2ada5bc9d003aea1084bc5d6eb33b9eb2b6237a0d1327a5c19f61` |
| 恢复前后 DOCX 全字节 SHA | `4f9abd68ab149d222b47424b47362e8de5a56be23be6e4b7ffb2487feaa4bcb3` |
| 原 M0 备份（703936 bytes） | `669636b62c40dd2c87b78d05e578c2529bb85f064cc76d780f4eeee48fec6f20` |

合成用例：2 项目，其中 1 空项目；完整项目十个 V3 集合
documents/requirements/evidence/competitors/policies/alternatives/decisions/tenderItems/artifacts/workflowRuns
各 1 条。V4 intakeBatches/changes/findings/configItems/costLines/templates/docs 各 1，baselines 2；
其他 V4 集合为空，配置与成本设置完整。全部 ID 和关系均通过原 schema/恢复 schema 校验。
CLI 用例源 SHA 为 `e8c7c63ac1e747f656119b2acbaf0b9f0f1b19daa5136b38a216baf08481507c`，
它没有上传 DOCX 模板，不能与完整往返用例的输入 SHA 混为一谈。

旧 M0 备份：仅复制到新系统临时目录后打开。原版 V3.4 读 10 项目，V4 只在该副本
新增 2 个独立合成项目并写 V4，然后转换到 V3.4 并恢复到 V4（试验共 12 项目）。
十个旧项目逐项目完整对象哈希不变，原备份文件 SHA 不变；不输出其正文或凭据。

## 安全启动、回退、恢复

完整 PowerShell 命令、检查和退出码见 [ROLLBACK.md](ROLLBACK.md)。
路径关系必须是：停 writer → 完整快照 → dry-run → 新 downgrade bundle → validate →
复制 V3 projection 到另一个工作存储 → 原版 V3.4 在隔离 Profile 加载 →
停 writer → 最新 V3 工作复制件 + 原不可变 bundle → 新 restore bundle → validate →
复制 V4 projection 到新的工作存储 → V4 加载并核对。
两个 bundle 均不能作为可写的工作存储。生产覆盖未获授权，不执行。

异常时继续使用原路径和原构建，源数据未被工具改写。强制终止留下的 staging 不能作为正式
输出使用，重新执行生成新的 staging。同一有效输入和已完成 bundle 重复执行返回 reused，
不会追加记录；源输入变化或归档被写过，需另选新目录/原始完整归档。

## Desktop 前置准备与未验证项

只读核对：实际 Desktop DSH_HOME 为 `%APPDATA%\dsh-desktop\harness`，
安装版 dsh-base 存储配置是 `storage-json.root = dshHomePath('storages')` 和
`storage-domain.backend = json`；插件 junction 指向本仓库。
用户 Profile 当前配置模型为 `zai / glm-5.3-flash / max`，未读取凭据文件，未复制或输出凭据。
按具体安装路径统计 Desktop 进程为 0。真实原始 marketpilot.json 只检查是否存在，未加载/写入。

已经准备了系统临时目录中的隔离 Profile、插件构建复制件和 M0 数据副本；具体本机位置在
`07-desktop-preflight.log`。未复制用户 Provider patch、凭据、UI 状态或会话。
依赖通过现有目录链接复用，**链接没有系统写保护，禁止在克隆中安装/更新依赖**。
后续将 DSH_HOME 指向该克隆，使用独立回环端口启动安装版宿主；必须先验证完整宿主解析。

仍未验证：原生 Desktop 窗口入口、克隆 Profile 完整 GUI 启动、真实模型与联网研究、
SQLite/per-record 的回退转换、外部附件/历史导出搬迁，以及断电/文件系统故障下的持久性。
此任务已验证正常异常及实际进程强制终止；SHA 校验不是来源真实性签名。
在线跨域 sidecar 迁移和生产数据覆盖不在本次实施范围。
