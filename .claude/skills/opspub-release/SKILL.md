---
name: opspub-release
description: |
  OpsPub 桌面应用的标准发版流程，负责版本校验、GitHub Actions 构建、签名产物归档、Gitee 备份和官网最新包同步。

  触发场景：
  - 需要发版或发布新的 OpsPub 桌面版本
  - 需要通过 GitHub Actions 构建 Windows、macOS 和 Linux 安装包
  - 需要把构建产物同步到 Gitee 备份仓和官网 download 目录
  - 需要生成或更新 Tauri updater 的 update.json

  触发词：发版、发布版本、OpsPub 发布、GitHub Actions 发版、打包并发布、同步安装包、release
---

# OpsPub 发版指南

## 适用范围

这是本项目的默认“发版”流程。源码仓库为 `aohaibin/opspub`，当前源码分支为 `opspub`；GitHub Actions 负责跨平台构建和签名，本机负责下载产物、同步 Gitee 和官网。

固定路径如下：

- 产物同步脚本：`scripts/publish-release.ps1`
- CI 工作流：`.github/workflows/release.yml`
- Gitee 备份仓：`D:\itemWork\bushu\yunwei\opspub`
- 官网本地目录：`D:\itemWork\bushu\doler\yuming\yuming\opspub`
- 官网下载目录：`D:\itemWork\bushu\doler\yuming\yuming\opspub\download`

## 安全约束

- 不读取、打印、提交或粘贴 `TAURI_SIGNING_PRIVATE_KEY` 及其密码。它只能作为 GitHub Secret 注入 Actions。
- 发版前保留其他会话的未提交改动；提交时只暂存本次发布明确涉及的文件。
- 不同步不完整产物。五个平台包和 Windows `.sig` 都通过检查后，才能执行 Gitee/官网同步。
- 官网父仓可能包含未跟踪内容，只更新 `opspub/download` 下的最新包，不要整体提交官网父仓。
- GitHub Release 构建完成后先保持草稿，核对 Gitee 和官网文件后再正式发布。

## 标准流程

### 1. 发布前检查

1. 检查分支和工作区：

   ```powershell
   git status -s
   git branch --show-current
   ```

   无关的工作区改动必须保留。确认版本号在 `package.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中一致。

2. 确认版本符合 `vX.Y.Z`，检查远端是否已经存在同名 Tag 或 Release。若版本未递增，先修正版本号并提交。

3. 确认 GitHub Secret `TAURI_SIGNING_PRIVATE_KEY` 已配置；如私钥有密码，同时配置 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。任何情况下都不要在日志中输出值。

### 2. 提交源码并触发 CI

仅暂存发布相关源码、版本和工作流变更，使用 Conventional Commit 提交，然后推送分支和 Tag：

```powershell
git add <发布相关文件>
git diff --cached --name-only
git commit -m "release: OpsPub vX.Y.Z"
git push origin opspub
git tag vX.Y.Z
git push origin vX.Y.Z
```

`.github/workflows/release.yml` 会构建：

- Windows NSIS 安装包
- macOS ARM（`aarch64`）DMG
- macOS Intel（`x64`）DMG
- Linux DEB
- Linux AppImage

macOS Intel 使用 `macos-15-intel` 并安装 `openssl@3`。macOS 构建不传空的 Apple 证书 Secret。不要在本机用未配置签名私钥的 `pnpm tauri build` 代替 CI。

### 3. 等待并核对 GitHub Actions

等待对应 Tag 的 Release workflow 全部成功，确认 GitHub Release 仍为草稿，并核对五类产物及 Windows updater `.sig` 均已上传。失败时先读 Actions 日志，修复后重新提交/重跑；不要拿缺失平台的产物继续发布。

### 4. 同步 Gitee 和官网

在项目根目录执行，脚本会下载 GitHub 草稿资产，校验资产数量和签名，把全部资产归档到 Gitee，并把稳定文件名的最新五个平台包复制到官网：

```powershell
& .\scripts\publish-release.ps1 -Tag vX.Y.Z
```

脚本行为：

- 从 `aohaibin/opspub` 下载 Tag 对应的 GitHub Release 资产；
- 校验 Windows 安装包和 `.sig`，并归档到 Gitee `releases/vX.Y.Z/`；
- 生成 UTF-8 无 BOM 的 Gitee `update.json`，只将 Windows 安装包用于 updater；
- 更新官网 `download/OpsPub-Setup.exe`、`OpsPub-aarch64.dmg`、`OpsPub-x64.dmg`、`OpsPub-amd64.deb`、`OpsPub-x86_64.AppImage` 和 `version.json`；
- 清理官网 download 中旧的 OpsPub 安装包，使官网只保留最新版本；
- 提交并推送 Gitee `master`，不会提交官网父仓。

如资产已手动下载到目录，可传入本地目录避免重复下载：

```powershell
& .\scripts\publish-release.ps1 -Tag vX.Y.Z -PackageDirectory <资产目录>
```

### 5. 发布 GitHub Release

确认 Gitee 推送成功、官网五个稳定文件和 `version.json` 已写入，且 Gitee 工作区干净后，再把 GitHub 草稿发布为最新版本：

```powershell
gh release edit vX.Y.Z --repo aohaibin/opspub --draft=false --latest
```

最后核对 GitHub Release、Gitee `releases/vX.Y.Z/`、Gitee `update.json` 和官网 `download/version.json` 的版本号一致。

## 失败处理

- **缺少签名私钥**：停止发版，提示配置 GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`，不要生成或索要私钥内容。
- **Actions 构建失败**：读取失败 job 日志，修复工作流或源码后递增版本/重新触发；不上传半成品。
- **资产数量不完整**：停止执行 `publish-release.ps1`，先补齐五个平台包及 Windows `.sig`。
- **Gitee 推送失败**：保留本地 Gitee 工作区和生成的文件，解决认证/网络问题后从脚本重新执行；不要强制覆盖其他提交。
- **官网同步失败**：只检查 `download` 目录目标文件，避免提交官网父仓中的其他文件。

## 发版完成回报

回复中应包含版本号、源码提交和 Tag、GitHub Actions/Release 状态、Gitee 归档状态、官网 `download` 状态，以及任何未完成项。不要包含签名私钥、密码或 Token。
