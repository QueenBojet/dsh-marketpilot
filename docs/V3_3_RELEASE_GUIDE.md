# MarketPilot V3.3 上线与回退指引

日期：2026-10-11（Asia/Shanghai）。适用于本机开发插件与单用户DSH Desktop，不是远程 / 多租户生产部署指南。

## 已验证环境与交付入口

本机安装DSH Desktop `0.2.0-rc.2`；官方源码基线 `5badb15009ae1756c3afe0ae0cef1faafc290ccc`。MarketPilot M5从M4提交 `8b9bf5a4b2df7718bf85382bbe46910775808699`继续。最新代码验证见 `V3_3_FINAL_ACCEPTANCE.md`，演示见 `DEMO_SCRIPT.md`。

实际插件路径为 `E:\PythonProjects\Work_Platform\marketpilot`，Desktop web profile的 `node_modules\dsh-marketpilot` junction指向该目录；构建产物是 `lib/` 和 `client/client.js`，均须更新。官方Provider、Agent Loop、Cordis与主面板不用修改。

M5技术验证通过，正式成果人审、真实导出和人类10分钟口述计时未关闭；严格非Flash模型 / 全新在线全链路要求也未补测。对外演示不能说这些已全部通过。本轮没有执行对外发布或Git推送。

## 发布前备份与任务处理

1. 在任务中心检查真实运行 / live Human Gate。等待任务完成，或由用户明确取消；不要重启中断仍需批准的门。
2. 从托盘真正退出DSH Desktop。关闭窗口 / Alt+F4可能仅隐藏；确认没有该安装路径的exe进程。不要用模糊名称结束其它程序。
3. 将下列文件复制到新建、受控的本地备份目录，包含未提交代码和被Git忽略的构建产物。不要把Profile凭据或原始业务数据加入Git。

| 内容 | 本机准确位置 / 说明 |
|---|---|
| 领域数据 | `%APPDATA%\dsh-desktop\harness\storages\marketpilot.json`；最终重启后确认含M5 Run / Artifact，官方JSON后端 |
| Profile与配置 | `%APPDATA%\dsh-desktop\harness\profiles\web`、宿主patch；包含私密配置，仅本地保管 |
| 当前插件代码 / 构建 | `E:\PythonProjects\Work_Platform\marketpilot`，包含 `lib/`、`client/`、`cordis.patch.yml`、未提交文件 |
| 正式导出与历史成果 | 用户实际导出路径、项目附件所在目录；Git不包含全部业务资料 |
| 离线smoke资料 | `.marketpilot/demo/`，独立SQLite，不是Desktop主数据；需要保留时单独备份 |

`C:\Users\zjdzc\.dsh\storages\marketpilot.json`是另一个存量文件，不包含本轮M5成果，不能用它替代当前Desktop数据备份。换机器 / Profile前先重新核对实际StorageDomain后端与路径。

示例：Desktop完全退出后，将**实际业务JSON**复制到唯一的新目录，并验证副本SHA256；以下只复制，不替换线上数据：

```powershell
$mpDataSource = Join-Path $env:APPDATA 'dsh-desktop\harness\storages\marketpilot.json'
$mpBackupDirectory = Join-Path 'E:\PythonProjects\Work_Platform\marketpilot-backups' (Get-Date -Format 'yyyyMMdd-HHmmss')
if (Test-Path -LiteralPath $mpBackupDirectory) { throw '备份目录已存在，请选择新目录。' }
New-Item -ItemType Directory -Path $mpBackupDirectory | Out-Null
$mpDataCopy = Join-Path $mpBackupDirectory 'marketpilot.json'
Copy-Item -LiteralPath $mpDataSource -Destination $mpDataCopy
if ((Get-FileHash -LiteralPath $mpDataSource).Hash -ne (Get-FileHash -LiteralPath $mpDataCopy).Hash) { throw '备份哈希不一致。' }
```

## 加载最终构建

在当前插件目录执行：

```powershell
Set-Location 'E:\PythonProjects\Work_Platform\marketpilot'
pnpm --config.verify-deps-before-run=false typecheck
pnpm --config.verify-deps-before-run=false test
pnpm --config.verify-deps-before-run=false build
pnpm --config.verify-deps-before-run=false exec vitest run tests/client-bundle.spec.ts
pnpm --config.verify-deps-before-run=false marketpilot:demo:smoke
```

预期33文件 / 258测试，bundle5/5。smoke在隔离SQLite中创建数据、使用离线模型与明确模拟人工，不应指向或覆盖Desktop业务存储。验证通过后真正退出托盘并重新打开安装版exe：

```powershell
Start-Process -FilePath 'C:\Users\zjdzc\AppData\Local\Programs\DSH Desktop\DSH Desktop.exe' -WindowStyle Hidden
```

等待宿主完成启动再运行GUI脚本。不要输出Harness日志中的完整认证URL / token。没有MarketPilot图标时检查实际加载路径、两个构建产物与日志错误，而不是另建网站。

## 发布后核对

- 打开空QA、仅需求案例与CALM，确认当前阶段来自真实数据；旧项目能打开，编号保持。
- CALM最新ART-06显示current，旧方案untracked，未批准时draft；补证不会无声改写历史正文。
- 没confirmed需求时路线禁用；没人工Decision时方案禁用；未核验事实不能形成compliant；招标无资料时可选跳过。
- 小屏横向阶段导航、浅 / 深主题、目录 / 风险区 / 关闭按钮可操作。可运行 `node scripts/acceptance-v33-m5.mjs` 复查已准备的真实案例；脚本只读，不调用模型或回答门。
- 在任务中心区分领域Run历史与当前进程execution，重启后不把旧waiting或superseded当可回答门。
- 联网继续unverified；当前可用路径是本地研究。后续官方search/fetch配置必须独立验收URL、日期和原文。

`node scripts/acceptance-v33-m5-live.mjs --start` 会花费模型额度并新建版本，**不要当健康检查重复运行**。本轮既有事实可直接审阅；必要时先明确新验收范围。

正式导出使用一个尚不存在的新绝对路径。M5工具 `--prepare` 仅准备真实审批门；人类阅读并批准后运行 `--verify`。不要将审阅副本、预览或开启门称为正式导出成功。批准前保持Desktop进程，不要重启。

## 保留数据回退

M5没有新增领域schema；可回退到已验证的M4 `8b9bf5a4b2df7718bf85382bbe46910775808699`，但会重新引入M5修复的启动幽灵任务、快速双击导出、阅读器遮挡导出审批和旧审核人标签问题。

1. 先处理当前live任务并完全退出Desktop，完成上述数据 / Profile / 代码备份。
2. 在新的独立checkout / worktree构建M4，保留当前checkout和未提交成果；不使用 `reset --hard`、`clean` 或删除业务数据。
3. 使用既有官方插件管理方式切换加载目录，保留当前Provider、StorageDomain、数据路径与审批契约。复核依赖和构建，再重启。
4. 只读检查所有项目、ART-06、dependencies、旧成果和永久编号；未approved仍draft，历史审批不变。异常时回到M5构建，保留数据快照和错误原因。

可用的独立构建示例（目标目录必须不存在）：

```powershell
git worktree add --detach 'E:\PythonProjects\Work_Platform\marketpilot-m4-rollback' 8b9bf5a4b2df7718bf85382bbe46910775808699
```

**不要直接回退到M3或更旧strict schema并继续读取当前数据。** M4起新Artifact.dependencies字段会被旧严格解析器拒绝。若必须回退UI，需要保留新字段读取兼容契约并先在备份副本验证；不能删dependencies、改UUID、回填未知快照、撤销Decision或用旧数据覆盖新成果。

恢复业务数据快照是另一项会覆盖现有事实的操作，必须明确恢复哪个备份与损失哪些后续写入，并先备份当前数据；本指南不授权自动覆盖恢复。正式回退演练尚未在当前Desktop上执行，本轮只完成契约测试和指引。
