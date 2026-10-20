# 发布流程（Release）

本仓库通过 GitHub Actions 自动构建并发布预构建插件包，**本地无需安装 Harness、无需本地编译**。

## 日常发布（三步）

1. 修改代码后，提升 `package.json` 的 `version`（如 `0.1.1` → `0.1.2`）。
2. 提交并推送到 `main`。
3. 等待 Actions 的 **Release prebuilt plugin** 工作流跑完，Release（`v<版本号>`）自动出现在
   [Releases 页面](https://github.com/QueenBojet/dsh-marketpilot/releases)，内含 `dsh-marketpilot-<版本>.tgz`。

也可在 Actions 页面手动 **Run workflow**（对当前 main 重新发布；同版本同提交会直接跳过）。

## 规则：一个版本号只对应一个提交

已发布的 tarball 资产 URL 会被消费方的 lockfile 以 sha512 锁定，**资产永不覆盖**。
工作流发现 `v<版本>` 已存在但指向不同提交时会直接报错，此时请提升版本号再推。

## 在 DSH 中更新到新版本

任选其一：

- **Profile 依赖（当前机器的使用方式）**：把
  `C:\Users\znb\AppData\Roaming\dsh-desktop\harness\profiles\web\package.json` 中
  `dsh-marketpilot` 的依赖 URL 改为新版本（`.../releases/download/v<新版本>/dsh-marketpilot-<新版本>.tgz`），
  在该目录运行 `pnpm install`，重启 DSH Desktop。
- **DSH 插件市场**：市场对 `github:QueenBojet/dsh-marketpilot` 源优先使用仓库的预构建 Release，
  更新时不会在本地执行构建。

## CI 构建环境说明

工作流在 ubuntu 上按仓库既定开发基线构建：

- 检出插件仓库，Node 24 + pnpm 10；
- 以固定提交 `5badb15009ae1756c3afe0ae0cef1faafc290ccc` 浅克隆相邻的 `deepseek-harness`（`link:` 开发依赖的指向）；
- 依次执行 `pnpm install`、`prepare:harness-types`、`prepare:harness-runtime`、`pnpm build`、`npm pack`。

如需更换 Harness 基线，修改 `.github/workflows/release.yml` 中固定的提交 SHA，
并确认 `package.json` 的 peerDependencies 与该基线的包版本一致。
