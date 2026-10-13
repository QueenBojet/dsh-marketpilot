# 安全回退与恢复

**需执行数据回退转换，不能直接切换代码。** 原版 V3.4 `stateSchema` 使用
`z.strictObject`，会拒绝项目状态记录的 `v4` 字段；官方 StorageDomain 因而
以 `invalid-record` 拒绝整个域。旧版不会自然忽略此字段。
两轮 V3→V4→V3→V4 安全副本路径已通过，不能称为无缝原位兼容。

工具支持官方 single-file JSON：`marketpilot`、version 1、null global、`projects` 表。
SQLite、per-record、未知表/字段/版本均明确阻断。保留当前 V4 checkout 和已构建工具；
V3.4 应在另外的独立 checkout 构建，不修改或合并 `main`。

## 准备一致的快照

1. 处理活动任务和 live Human Gate，先完成或由用户取消任务。
2. 真正退出 DSH Desktop，按具体安装路径确认全部 PID 退出；不要用名称通配符杀进程。
3. 将当前业务数据、Profile/配置、附件、历史导出和插件代码/构建备份到新受控目录。
   含凭据的配置仅在本地保管，不提交 Git。
4. 重新核对实际后端和路径，再复制 JSON 并比较源/副本 SHA-256。
   本机实际路径为 `%APPDATA%\dsh-desktop\harness\storages\marketpilot.json`。
   转换工具只接收已准备的复制件，不在真实 CALM 项目上演练。

本任务未打开或写入真实 Desktop 业务 JSON，未结束/启动 Desktop 进程。
生产配置切换和数据覆盖仅在用户明确批准、DSH 完全停止、完整备份与隔离验证均已完成后实施。
工具不修改配置、不结束进程、不覆盖生产文件。

## 生成 V3.4 副本（PowerShell）

`$mpSnapshot` 必须换成实际的最新 V4 快照复制件；`X:\...` 只是占位路径。
输出目录必须在源存储目录之外，且尚不存在。

```powershell
Set-Location 'E:\PythonProjects\Work_Platform\marketpilot'
npm run build
if ($LASTEXITCODE -ne 0) { throw '构建失败' }
$mpSnapshot = 'X:\approved-local-snapshot\marketpilot.json'
$mpTrialRoot = Join-Path $env:TEMP ('marketpilot-rollback-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $mpTrialRoot | Out-Null
$mpBundle = Join-Path $mpTrialRoot 'downgrade-bundle'
$mpSourceHash = (Get-FileHash -LiteralPath $mpSnapshot -Algorithm SHA256).Hash

pwsh -NoProfile -File .\scripts\v4-storage.ps1 -Mode downgrade -Source $mpSnapshot -Output $mpBundle -DryRun
if ($LASTEXITCODE -ne 0) { throw 'dry-run 失败：不要切换版本' }
pwsh -NoProfile -File .\scripts\v4-storage.ps1 -Mode downgrade -Source $mpSnapshot -Output $mpBundle
if ($LASTEXITCODE -ne 0) { throw '转换失败：原数据保持原位' }
pwsh -NoProfile -File .\scripts\v4-storage.ps1 -Mode validate -Bundle $mpBundle
if ($LASTEXITCODE -ne 0) { throw '归档校验失败' }
if ((Get-FileHash -LiteralPath $mpSnapshot -Algorithm SHA256).Hash -ne $mpSourceHash) { throw '源 SHA 变化' }
```

| 输出文件 | 含义 |
| --- | --- |
| `backup/marketpilot.json` | V4 原件逐字节备份，保留 unit/global/tables 元信息 |
| `v3/marketpilot.json` | 原版 V3.4 schema 验证通过，保留最新 V3 字段、ID、codeBook、revision 和所有记录 |
| `v4-sidecar.json` | 全部 V4 增量，包括需求差异、研究、配置、成本、DOCX 模板/草稿/导出记录、V1/V2 快照 |
| `manifest.json` | schema 基线、源 SHA/字节数/mtime、每个文件 SHA/字节数、各项目内容哈希和数量 |

**归档必须保持不变。不要让 DSH 写入 bundle 的 `v3/` 或 `v4/`。**
另建 V3 工作存储，复制并核对 SHA，再将隔离 Profile 的 `storage-json.root` 指向工作目录。
用原版 V3.4 构建加载，核对项目数、ID、记录数量、内容哈希和关联关系。

```powershell
$mpV3Working = Join-Path $mpTrialRoot 'v3-working'
New-Item -ItemType Directory -Path $mpV3Working | Out-Null
$mpV3Copy = Join-Path $mpV3Working 'marketpilot.json'
Copy-Item -LiteralPath (Join-Path $mpBundle 'v3\marketpilot.json') -Destination $mpV3Copy
if ((Get-FileHash -LiteralPath $mpV3Copy).Hash -ne (Get-FileHash -LiteralPath (Join-Path $mpBundle 'v3\marketpilot.json')).Hash) { throw 'V3 复制件不一致' }
```

V3 可继续保存 V3 内容；恢复会保留这些写入及新建项目。删除原项目、破坏 V4 引用或
发生 ID 冲突时恢复明确阻断。在工作复制件中解决冲突，或用更早完整复制件重试，
不要删除 sidecar 绕过阻断。源 V4 数据和原配置始终保留。

## 恢复到 V4

先停止隔离 V3 writer，备份其最新工作复制件。用原 downgrade bundle 和最新 V3 数据
生成新的恢复 bundle；恢复保留 V3 新写入并附加原 V4 数据。

```powershell
$mpRestored = Join-Path $mpTrialRoot 'restore-bundle'
$mpV3Hash = (Get-FileHash -LiteralPath $mpV3Copy -Algorithm SHA256).Hash
pwsh -NoProfile -File .\scripts\v4-storage.ps1 -Mode restore -Source $mpV3Copy -Bundle $mpBundle -Output $mpRestored -DryRun
if ($LASTEXITCODE -ne 0) { throw '恢复检查失败' }
pwsh -NoProfile -File .\scripts\v4-storage.ps1 -Mode restore -Source $mpV3Copy -Bundle $mpBundle -Output $mpRestored
if ($LASTEXITCODE -ne 0) { throw '恢复失败，保留两个原件' }
pwsh -NoProfile -File .\scripts\v4-storage.ps1 -Mode validate -Bundle $mpRestored
if ($LASTEXITCODE -ne 0) { throw '恢复归档校验失败' }
if ((Get-FileHash -LiteralPath $mpV3Copy -Algorithm SHA256).Hash -ne $mpV3Hash) { throw 'V3 源 SHA 变化' }
$mpV4Working = Join-Path $mpTrialRoot 'v4-working'
New-Item -ItemType Directory -Path $mpV4Working | Out-Null
Copy-Item -LiteralPath (Join-Path $mpRestored 'v4\marketpilot.json') -Destination (Join-Path $mpV4Working 'marketpilot.json')
if ((Get-FileHash -LiteralPath (Join-Path $mpV4Working 'marketpilot.json')).Hash -ne (Get-FileHash -LiteralPath (Join-Path $mpRestored 'v4\marketpilot.json')).Hash) { throw 'V4 复制件不一致' }
```

用隔离 V4 Profile 指向 `$mpV4Working`，核对 V3 新写入、V4 内容、配置、成本、
DOCX 模板/正文/导出 SHA 和 V1/V2 快照。审核是否过期仍由现有内容哈希规则判定；
转换工具不伪造审核、不重编号、不重写已发布快照。附件和历史导出文件须单独备份。

## 失败、中断与退出码

- `0`：转换/校验成功；同一输入重复执行会校验并复用既有结果。
- `1`：I/O、校验、checksum、源变化、引用冲突或路径失败。不能切换版本。
- `2`：缺参数或未构建。修正命令后重试。
- 已有无关目录不覆盖；恢复输出也必须在原 bundle 之外。
- 文件先独占写入新 `.pending-<UUID>` 并 fsync，全部校验和源 SHA 再检查后才 rename 发布。
  普通失败只清理本次 staging。强制终止可能留下 `.pending-*`，正式目录仍不存在；
  保留它们排查，重新执行使用新 staging。不能将 staging 配置为存储根。
- 失败回滚为继续使用原版本和原路径，工具没有修改源数据。V3 已有新写入时，
  不得用初始 M0 备份覆盖，须通过恢复工具保留最新 V3 内容。
- SHA 用于发现损坏，不是真实性签名；不接受来源不明的 bundle。

## 已执行的复验

`npx vitest run tests/v4-downgrade.spec.ts`（启用 M0 复制件）23/23；
`node scripts/verify-v4-storage.mjs` 11 次 PowerShell 调用、实际进程强制中断与重试通过。
详细证据见 [DOWNGRADE_COMPAT_REPORT.md](DOWNGRADE_COMPAT_REPORT.md) 与 `evidence/downgrade/`。
