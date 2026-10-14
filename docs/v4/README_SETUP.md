# MarketPilot V4.0 一次性交付实施资料｜安装与启动

本文件随参考包解压至现有仓库 `docs/v4/README_SETUP.md`。本包**仅包含开发提示词与视觉规格**，不是新代码，绝不能代替 GitHub `feat/v4-workbench-foundation` 分支。

## 1. 先进入安全的 V4 分支

在 Windows PowerShell 中：

```powershell
cd 'E:\PythonProjects\Work_Platform\marketpilot'
git status --short
git remote -v
git fetch origin
```

若 `git status --short` 显示未提交修改，请先自行保留/提交/备份，**不要继续切换分支，也不要使用 reset --hard 或 clean -fd**。检查 `origin` 确实指向 `QueenBojet/dsh-marketpilot`。

若尚未有本地 `feat/v4-workbench-foundation` 分支：

```powershell
git switch --track origin/feat/v4-workbench-foundation
```

若已经存在本地同名分支：

```powershell
git switch feat/v4-workbench-foundation
git pull --ff-only origin feat/v4-workbench-foundation
```

确认：

```powershell
git status -sb
git branch --show-current
git log -1 --oneline
```

## 2. 安装设计参考与新总控提示词

将 `MarketPilot_V4_一次性完整开发_资料包.zip` **解压到 `E:\PythonProjects\Work_Platform\marketpilot` 根目录**，选择保留内部目录。解压后应有：

- `docs/v4/prompts/MarketPilot_V4_一次性完整开发总控提示词.md`
- `docs/v4/reference/MarketPilot_V4_全流程页面交互设计规格_V2.0.md`
- `docs/v4/reference/MarketPilot_V4_全流程交互原型_V2.0.html`
- `docs/v4/reference/*.png`
- `docs/v4/acceptance/`：开发 Agent 后续保存测试与截图（ZIP 会放一个 README 以确保目录存在）

不要把参考资料解压到 `client/` 构建产物、`node_modules/`、DSH Desktop Profile、真实 `storages/` 目录，也不需要上传到任何公网上传站。

**替代方法（手动 PowerShell 解压）**：

```powershell
$zip = Join-Path $env:USERPROFILE 'Downloads\MarketPilot_V4_一次性完整开发_资料包.zip'
Expand-Archive -LiteralPath $zip -DestinationPath 'E:\PythonProjects\Work_Platform\marketpilot' -Force
```

如果浏览器下载的文件不在 `Downloads`，把 `$zip` 改成实际路径即可。

## 3. 在 Claude Code/Codex 中启动一次性开发

在仓库根目录启动编程 Agent：

```powershell
cd 'E:\PythonProjects\Work_Platform\marketpilot'
# 在已安装 Claude Code 时：
claude
# 或在已安装 Codex CLI 时：
# codex
```

在 Agent 对话中提交：

> 请读取 `docs/v4/prompts/MarketPilot_V4_一次性完整开发总控提示词.md` 并严格执行。`docs/v4/reference/` 是权威产品设计与视觉目标。本次要连续完成完整的 V4.0 实现与测试，不要每个阶段暂停向我征求许可；保护本机代码和 CALM 项目数据，不合并 main。先审查当前分支并开始真正编码。

**无需把几万字全文再粘贴到对话里**，因为 Agent 可以从仓库读取本地文件。Claude Code/Codex 如需命令权限，请依据实际变更范围审批；禁止自动允许破坏存储和凭据的危险命令。

## 4. 本机真实 DSH 数据安全

历史 Desktop 项目数据曾位于 `%APPDATA%\dsh-desktop\harness\storages\marketpilot.json`；实际位置视本机 Profile 配置而定，不能假定就是此文件。请编程 Agent 在修改 Schema、部署新插件或运行迁移前阅读 `docs/V3_3_RELEASE_GUIDE.md`，确认真实文件并复制备份、记录 SHA256；旧 CALM 数据只读验证，新功能测试用隔离项目/存储。

## 5. 交付要求

最终查看页面与完整工作故事，而不是开发阶段清单：真实联网只有在 Provider 可用且 Fetch 正文成功时才算验证；缺公司 Word 模板时先交付通用可运行 DOCX 模板功能；测试数量只引用本轮真实运行结果。PR 仍为草稿，未经用户同意不自动合并 main。
