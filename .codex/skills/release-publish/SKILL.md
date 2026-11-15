---
name: release-publish
description: |
  发布版本/发布更新/release/推送Gitee/签名构建/update.json/版本发布/R2 CDN/rclone

  触发场景：
  - 需要发布新版本
  - 需要执行发布流程
  - 需要更新版本号并推送

  触发词：发布、release、版本发布、推送、打Tag、update.json、签名构建
---

# 发布更新

## 概述

Tauri 桌面应用采用 **CI 构建 + 本地推送** 模式（可选 R2 CDN 加速）：

```
本地：更新版本号 → 提交 → 打 Tag → 推送（触发 CI）
  ↓ CI 构建中（不推送任何内容到 release 仓库）
CI：构建安装包（按配置的平台） → 上传到 GitHub Release（草稿）
  ↓ CI 完成后，用户下载产物
本地：[可选] 上传产物到 R2 CDN + 更新 README + 复制产物 + 生成 update.json → 推送到 Gitee/GitHub release 仓库
```

> **关键原则**：CI 构建完成、用户提供下载文件之前，**不要推送任何内容到 release 仓库**。
> README 更新、产物复制、update.json 生成在获得产物后一次性完成并推送。

> **本地不需要执行 `pnpm tauri build`**。CI 负责构建和签名。
> 构建完成后，用户手动从 GitHub Release 下载产物，Claude 负责本地处理和推送。

### 平台配置

发布流程支持按需选择构建平台，通过 `.claude/release-config.json` 的 `platforms` 字段配置：

| platforms 值 | CI 构建矩阵 | 产物数量 |
|-------------|------------|---------|
| `["windows", "macos"]` | Windows + macOS ARM + macOS Intel | 8 个 |
| `["windows", "macos", "linux"]` | 全平台 | 11 个 |
| `["windows"]` | 仅 Windows | 2 个 |
| `["macos"]` | 仅 macOS ARM + Intel | 6 个 |

> **首次发布时通过 `/release` 命令询问用户选择平台，记录后不再重复询问。**
> 去掉 Linux 可节省 CI 时间、减少产物体积（Linux AppImage 约 80MB）。

### 三级分发策略

支持可选的 R2 CDN 作为主下载源，通过 `.claude/release-config.json` 的 `r2.enabled` 字段控制：

**R2 CDN 启用时（r2.enabled = true）：**

| 用途 | 平台 | 角色 | 原因 |
|------|------|------|------|
| **源码托管** | GitHub（私有） | — | 代码管理 + CI 构建 |
| **CI 构建** | GitHub Actions | — | 跨平台构建 + 签名 |
| **安装包下载 + 自动更新** | Cloudflare R2 CDN | **主源** | 全球 CDN，零流量费，上传秒级 |
| **自动更新兜底** | Gitee（公开） | **备源** | R2 不通时兜底，中国大陆可访问 |
| **备份存档** | GitHub（公开） | **存档** | 海外用户 + 历史备份 |

> **R2 CDN 优势**：上传 24MB 产物仅需 ~8 秒，零流量费，全球 CDN 加速。
> 自定义域名（如 `dl.example.com`）为可选配置，需将域名 DNS 迁移到 Cloudflare。
> 当前使用 R2.dev 公开 URL，功能完全等价。

**R2 CDN 未启用时（默认模式）：**

| 用途 | 平台 | 原因 |
|------|------|------|
| **源码托管** | GitHub（私有） | 代码管理 + CI 构建 |
| **CI 构建** | GitHub Actions | 跨平台构建 + 签名 |
| **自动更新端点** | Gitee（公开） | 中国大陆可访问 |
| **安装包下载** | Gitee（公开） | 中国大陆可下载 |
| **备份存档** | GitHub（公开） | 海外用户 + 备份 |

### 为什么不让 CI 推送到 release 仓库？

GitHub Actions 在美国服务器运行，推送二进制产物到 Gitee（中国）经常超时（50 分钟+）。
因此改为用户本地下载产物后，由 Claude 在本地完成推送，速度更快且更可控。

---

## 🔴 发布架构选型（首发必读）

> 上面的"三级分发策略"是**老路线**（公开 release 仓 + Gitee raw 端点 + rclone）。
> 实战（cup_watch 首发）证明：当本机装了 **Sigil 凭据保险库**时，有一条**更省事、更安全、零公开仓**的路线，应作为**默认首选**。
> 两条路线都要支持——**没装 Sigil 时用 B 路线的等价命令**，流程与产物完全一致。

### 路线 A（推荐）：R2-only 分发 + 全私有仓 + Sigil 注入

```
CI(私有源码仓) 构建 .exe + .sig → GitHub draft release(私有，仅 token 可读)
        ↓  Sigil github_download_release_asset（带 token 下私有 draft，AI 不碰 token 明文）
本地拿到 .exe + .sig
        ↓  Sigil r2_object_upload(bucket=downloads, key=<prefix>/releases/vX/...)
R2 downloads/<prefix>/... + update.json   ← 公开 r2.dev，用户下载 + 自动更新都走这
```

- **下载源 + 自动更新端点 = R2 唯一**（`pub-….r2.dev`，公开、零流量费、无 CORS 问题）。
- **GitHub / Gitee 仓全部保持私有** —— 只做源码 + CI + 可选存档，**不对外服务**。
- **不需要"把 release 仓改公开"**（Sigil 的 `repo_update` 也明确禁止设公开，别再往那撞）。
- tauri.conf 的 `endpoints` 只留 R2 一个（删掉需要公开仓的 Gitee raw 端点）。

### 路线 B：不装 / 不用 Sigil 时的等价做法

Sigil 只是"凭据注入器"。没有它时，每一步都有等价的本地命令（`gh` CLI + 系统 git credential + rclone）：

| 步骤 | 路线 A（Sigil） | 路线 B（无 Sigil 等价） |
|------|----------------|----------------------|
| 建源码 / release 仓 | `mcp__sigil__github_repo_create(private:true)` | `gh repo create <owner>/<repo> --private` |
| 推源码 / tag | `mcp__sigil__git_push` | `git push <remote> <branch>` / `git push <remote> vX.Y.Z`（系统 credential helper 注入） |
| 启用 Actions | `mcp__sigil__github_actions_enable` | `gh api -X PUT repos/<owner>/<repo>/actions/permissions -F enabled=true` |
| 配签名 Secret | **`github_repo_secret_set(secret_name=TAURI_SIGNING_PRIVATE_KEY, value_from_file=src-tauri/keys/tauri-updater.key)`** ← Sigil 自己读 .key 注入、私钥不进对话也免导金库，**用此参数会弹一次桌面端确认**（旧的 value_credential_name 路径仍可用，但需先把私钥导入金库，已不推荐） | **`gh secret set TAURI_SIGNING_PRIVATE_KEY --repo <owner>/<repo> < src-tauri/keys/tauri-updater.key`** ← 无 Sigil 时用它（见第 3 节） |
| 下私有 draft 产物 | `mcp__sigil__github_download_release_asset` | `gh release download vX.Y.Z --repo <owner>/<repo> --dir <dir>`（draft 也能下，gh 自带 token） |
| 上传 R2 | `mcp__sigil__r2_object_upload(bucket=downloads,key=…)` | `rclone copyto <file> r2:downloads/<prefix>/…`（rclone remote 须能写 `downloads` 桶） |
| 监听 CI | `mcp__sigil__github_run_get` | `gh run list --repo <owner>/<repo>` / `gh run watch` |

> **检测**：本会话能 `ToolSearch` 到 `mcp__sigil__*` → 走 A；查不到 → 自动走 B，不报错不卡流程。
> 两条路线产出完全一致（同样的 R2 对象 + update.json），只是"谁来注入凭据"不同。

### 🔴 R2 桶真相（写死，别再每次重新摸索）

cup_watch 首发在这上面烧了约 10 轮反复误判。**事实固定如下，直接照用**：

- 真实**桶名 = `downloads`**（一个桶，全项目共用）；`opspub` / `cupwatch` / `sigil` 等是**桶内前缀**，不是独立桶。
- 公开域名（形如 `https://pub-xxxxx.r2.dev`）是 **`downloads` 桶**的共享域名，**所有项目共用、不用改**；对象 URL = `<publicUrl>/<prefix>/...`。
- 这把 R2 access key 是 **scoped key**：**不能 ListBuckets、不能建桶**（`rclone lsd r2:` 报 403 / `mkdir` 静默失败）。所以**别用 rclone 去"自省桶结构"或"建桶"**——会把你带进沟里。
- **首选**：用 Sigil `r2_object_upload(bucket=downloads, key=<prefix>/...)` 一传即通（它知道 default_bucket）。
- 无 Sigil 时 rclone 正确写法是 `r2:downloads/<prefix>/...`（**第一段必须是桶名 `downloads`**；写成 `r2:<prefix>/...` 会报 `NoSuchBucket`）。
- 新项目只需选一个**前缀**（如 `myapp`），**无需在 Cloudflare 控制台建任何东西**。

### 🔴 首发踩坑速查（血泪，cup_watch v0.1.0 实录）

| 坑（现象） | 真因 | 正解 |
|-----------|------|------|
| R2 反复 `NoSuchBucket` / `403` / 误判"opspub 是桶" | scoped key 不能列/建桶；桶名其实是 `downloads`、项目是前缀 | 见上「R2 桶真相」：用 Sigil 传，或 rclone 写 `r2:downloads/<prefix>/` |
| 卡在"要把 release 仓改公开"，Sigil 拒绝 | 老架构靠公开仓 raw；撞"仓库必须私有"红线 | 走路线 A：**R2-only + 全私有**，根本不需要改公开 |
| 签名 Secret 配置 | 私钥不能进对话（红线），又不想手动导金库 | **首选** `github_repo_secret_set(value_from_file=src-tauri/keys/tauri-updater.key)`：Sigil 自读私钥注入、免导金库、弹一次确认；无 Sigil 时用 `gh secret set < keyfile` |
| tag 推了但 **0 个 workflow run** | 新建私有仓 **Actions 默认禁用** | 推 tag **前**先 `github_actions_enable`（或 `gh api … permissions -F enabled=true`） |
| 启用 Actions 后**老 tag 不触发**，又不能手动 dispatch | 启用不回溯已推 tag；workflow 没声明 `workflow_dispatch` | 删远端 tag 重推；workflow 模板**加 `workflow_dispatch`**（见 CI 章节）以后可手动重触发 |
| CI 秒级 failure：**所有 job 都 failure 但无任何失败 step**（job 没分到 runner，实测非「无 job」而是有 job 空跑） | 私有仓 Actions **免费分钟耗尽** | 切备用账号（见「多 CI 仓库 fallback」），整套：建仓+remote+**独立 secret**+启用 Actions+推。Sigil 的 `github_run_jobs` 会自动标 `quota_exhausted_suspect=true` 并就地提示换号（`github_billing_actions` 判不出：免费号耗尽不计费、净费用停在 | CI **3-5 秒 failure、无 step、日志 0.00 MB** | 私有仓 Actions **免费分钟耗尽** | 切备用账号（见「多 CI 仓库 fallback」），整套：建仓+remote+**独立 secret**+启用 Actions+推 |） |

---

## 首次发布前的准备工作

> **首次使用发布功能时，必须先完成以下配置。后续发布跳过此节。**

### 1. 创建 Release 仓库

需要创建两个 **公开** 仓库用于存放安装包和 update.json：

```bash
# Gitee（主更新端点，中国大陆可访问）
https://gitee.com/<用户名>/<项目名>-release

# GitHub（备份）
https://github.com/<用户名>/<项目名>-release
```

每个仓库需要一个 `README.md` 和 `update.json`（本地推送时自动生成 update.json）。

### 2. 生成签名密钥

```bash
# 在项目根目录生成更新签名密钥对
pnpm tauri signer generate -w src-tauri/keys/tauri-updater.key
# 密码提示时直接按两次回车（空密码）
```

生成后：
- 将 `.key.pub` 文件内容复制到 `tauri.conf.json` → `plugins.updater.pubkey`
- 将 `.key` 文件内容添加到 GitHub Secrets → `TAURI_SIGNING_PRIVATE_KEY`
- 确保 `src-tauri/keys/` 已加入 `.gitignore`

### 3. 配置 GitHub Secrets

在 **源码仓库**（私有）的 Settings → Secrets and variables → Actions 中添加：

| Secret 名称 | 值 | 说明 |
|-------------|-----|------|
| `TAURI_SIGNING_PRIVATE_KEY` | `src-tauri/keys/tauri-updater.key` 文件的完整内容 | 更新签名私钥 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 空字符串（留空即可） | 私钥密码（无密码） |

**🔴 推荐设法（零明文进对话，AI 不碰私钥）—— 用 `gh` 从文件管道灌**：

```bash
# 私钥走 文件 → gh libsodium 加密 → GitHub，全程不打印、不进对话记录
gh secret set TAURI_SIGNING_PRIVATE_KEY --repo <owner>/<repo> < src-tauri/keys/tauri-updater.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --repo <owner>/<repo> --body ""   # 空密码（也可省略，workflow 引用缺失 secret 自动为空）
```

> - 这是**首选**，无需把私钥导入任何金库；**装不装 Sigil 都用它**。
> - Sigil 的 `github_repo_secret_set` 用 `value_from_file=src-tauri/keys/tauri-updater.key` 直接设最省事（Sigil 自读私钥、免导金库、弹一次确认）；旧的 `value_credential_name` 需先把私钥导入金库，已不推荐；
>   用 `value`（明文）则会让私钥进对话记录 → 🔴 禁止。
> - 多 CI 仓库 fallback 时，**每个仓都要单独 `gh secret set`**（secret 不跨仓共享，漏配则备仓退回无签名/debug 签名）。

> **注意**：不再需要 `RELEASE_REPO_TOKEN`、`GITEE_USERNAME`、`GITEE_TOKEN`，
> 因为 CI 不再推送到 release 仓库，推送由本地完成。

### 4. 配置 tauri.conf.json

**如果 R2 CDN 启用（r2.enabled = true）：**

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "<r2.publicUrl>/<r2.pathPrefix>/update.json",
        "https://gitee.com/<用户名>/<项目名>-release/raw/master/update.json"
      ],
      "pubkey": "<公钥内容>"
    }
  },
  "bundle": {
    "targets": ["nsis"],
    "createUpdaterArtifacts": "v1Compatible"
  }
}
```

> R2 作为第一端点（主源），Gitee 作为第二端点（备源）。Tauri updater 按顺序尝试，第一个失败自动 fallback。

**如果 R2 未启用（默认）：**

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://gitee.com/<用户名>/<项目名>-release/raw/master/update.json"],
      "pubkey": "<公钥内容>"
    }
  },
  "bundle": {
    "targets": ["nsis"],
    "createUpdaterArtifacts": "v1Compatible"
  }
}
```

### 5. 添加 GitHub remote（如仅有 Gitee remote）

```bash
git remote add github https://github.com/<用户名>/<项目名>.git
```

#### 5.1 多 CI 仓库 fallback（应对私有仓 Actions 配额耗尽）

> GitHub Actions 对私有仓有每月免费分钟数（macOS×10 倍消耗最快）。月底容易耗尽，CI 直接 3-5 秒失败。
> **建议**：源码同时配置主/备两个 GitHub remote（不同账号），主仓配额用尽时切到备仓继续发版。

```bash
# 主仓（默认）
git remote add github   https://github.com/<account-a>/<repo>.git
# 备仓（额度耗尽时切换，可用 SSH 避开 HTTPS credential helper 多账号冲突）
git remote add github2  git@github.com:<account-b>/<repo>.git
```

**关键约束**：

- 两个仓库需各自配置完整的 GitHub Secrets（签名私钥、可选 Android keystore 等），secret **不能跨仓共享**
- 发版时 `git push <remote> <tag>`，**Tag 只推到选定的 remote**，避免两边同时触发 CI 浪费额度
- 不同账号的 PAT 分别保存为 `~/.gh_token_<account>`，发版前根据 remote 选择对应 token
- workflow 文件需同步到两个 remote（任何一边修改后用 `git push <other>` 同步代码）
- 步骤 3 推 tag 前必须**询问用户**用哪个 CI remote，并把选择记录下来供步骤 4 的 `CI_OWNER_REPO` 变量使用

### 6. 克隆 Release 仓库到本地

```bash
# 建议放在源码仓库的同级目录
git clone https://gitee.com/<用户名>/<项目名>-release.git   # Gitee
git clone https://github.com/<用户名>/<项目名>-release.git  # GitHub（另一个目录名）
```

### 7. 根据平台配置修改 CI workflow

根据 `.claude/release-config.json` 中的 `platforms` 配置，修改 `.github/workflows/release.yml` 的构建矩阵：

**Windows + macOS（推荐，不含 Linux）：**
```yaml
matrix:
  include:
    - platform: windows-latest
      args: '--bundles nsis'
    - platform: macos-latest
      args: '--bundles app,dmg'
      target: aarch64-apple-darwin
    - platform: macos-latest
      args: '--bundles app,dmg'
      target: x86_64-apple-darwin
```

**全平台（含 Linux）：**
```yaml
matrix:
  include:
    - platform: windows-latest
      args: '--bundles nsis'
    - platform: macos-latest
      args: '--bundles app,dmg'
      target: aarch64-apple-darwin
    - platform: macos-latest
      args: '--bundles app,dmg'
      target: x86_64-apple-darwin
    - platform: ubuntu-22.04
      args: '--bundles deb,appimage'
```

---

## 关键配置（用户须在首次发布时提供）

> **以下信息在首次发布时通过 `/release` 命令询问用户获取，后续自动记忆。**

| 配置项 | 说明 | 示例 |
|--------|------|------|
| **应用名称** | CI 产物前缀（productName） | `MyApp` |
| **支持平台** | 构建哪些平台 | `["windows", "macos"]` |
| **源码仓库 GitHub remote 名** | 推送源码用 | `github` 或 `origin` |
| **源码仓库 GitHub URL** | CI 所在仓库 | `https://github.com/user/my-app` |
| **Release 仓库（Gitee）URL** | 更新端点（主/备取决于 R2） | `https://gitee.com/user/my-app-release` |
| **Release 仓库（GitHub）URL** | 备份存档 | `https://github.com/user/my-app-release` |
| **本地 Release 仓库（Gitee）路径** | 本地 clone 目录 | `../my-app-release-gitee` |
| **本地 Release 仓库（GitHub）路径** | 本地 clone 目录 | `../my-app-release` |
| **主分支名** | master 或 main | `master` |
| **R2 CDN 启用**（可选） | 是否使用 R2 作为主源 | `true` / `false` |
| **R2 公开地址**（可选） | R2.dev 或自定义域名 | `https://pub-xxx.r2.dev` |
| **R2 rclone remote**（可选） | rclone 配置名 | `r2` |
| **R2 bucket**（可选） | R2 存储桶名 | `downloads` |
| **R2 路径前缀**（可选） | 多项目隔离路径 | `myapp` |

---

## 版本号位置（三处必须同步）

| 文件 | 字段 |
|------|------|
| `src-tauri/tauri.conf.json` | `"version": "x.y.z"` |
| `src-tauri/Cargo.toml` | `version = "x.y.z"` |
| `package.json` | `"version": "x.y.z"` |

---

## 🔴 Windows 代码签名档位（发版起手判定，可选）

> 发版**第一件事**先定档位。Windows 产物**可签可不签**：没配 evsign 照常发未签名版（现状），配了就让 Win11
> 智能应用控制(SAC)不再拦"可能不安全"。**只影响 Windows**（mac=Apple 公证、linux 不需要 → 永远走 CI，不变）。
> 签名机制细节见 `tauri-packaging`「可选：Windows 代码签名」。**工具箱 `~/.evsign` 名下所有软件共用一份。**

### 档位来源 `.claude/signing.local.json`（每机状态，已 gitignore）
```json
{ "windows": "evsign", "mode": "local", "toolbox": "C:\\Users\\<你>\\.evsign" }   // Windows 机（本地签）
{ "windows": "evsign", "mode": "ci" }                                            // Mac/无 Win 机（不需本地工具箱）
```
- `none` → 常规档（现状，CI 出未签 Windows）
- `evsign`+`local` → 本地签名档（Windows 机本地签名构建）
- `evsign`+`ci` → CI 签名档（CI windows runner 上签，见「CI 签名变体」）
- 文件不存在 → **首次问一次**；mode 默认按本机 OS（Windows→local，非 Windows→ci）

### 起手状态机（问一次/记住/坏了再问）
```
读 .claude/signing.local.json
├─ 不存在 ─► 问「Windows 用 evsign 签名吗?」→ 没配写{none}常规档; 配了按OS定mode写{evsign,mode}
├─ none          ─► 静默常规档（删文件可重启用）
├─ evsign+local  ─► 校验 ~/.evsign(CLI+license+pwd+wrapper)+冒烟签 → 通过静默本地签名档; 失败报错/修/回退
└─ evsign+ci     ─► 确认 CI 仓已配 evsign secrets+workflow → 走 CI 签名档; 没配好提示按「CI 签名变体」开通
```

### 本地签名档（mode:local，Windows 机）—— 只改 Windows 产物来源
主流程步骤基本不变，两处差别：① **推 tag 前设 CI 仓变量让 CI 跳过 Windows 构建省额度**；② **Windows 产物改本地签名构建产出**，mac/linux 仍从 CI 下。
- 🔴 推 tag 前：设 CI 仓变量 `RELEASE_WINDOWS=skip`（Sigil `github_repo_variable_set(credential_name=<CI仓凭据>, repo=<owner/repo>, name=RELEASE_WINDOWS, value=skip)` 或 `gh variable set RELEASE_WINDOWS --repo <owner/repo> -b skip`）→ workflow 的 `prepare` job 不把 Windows 放进矩阵，**CI 不起 windows runner，省 ~12min 额度**。常规档设 `build`（或不设=含 Windows）、CI 签名档设 `sign`；幂等设置防上次残留。
- 下载产物那步：mac/linux 从 CI 下（skip 模式 CI 只有 mac/linux）；Windows 改本地跑
  `TAURI_SIGNING_PRIVATE_KEY="$(cat src-tauri/keys/tauri-updater.key)" pnpm tauri build --config src-tauri/tauri.conf.sign.json`
  → 得 `src-tauri/target/release/bundle/nsis/<AppName>_<ver>_x64-setup.exe`（已内外层签名）+ 配套 `.sig`
  → 用它替换 CI 的 Windows 产物（文件名一致）
- 组 update.json 那步：Windows 用本地 `.sig`，mac/linux 用 CI 的 `.sig`，其余不变
> 本地构建同产 updater `.sig`（overlay 不关 `createUpdaterArtifacts` 且设了 key），下载+自动更新都指向已签
> 版本、updater 校验通过，**无需事后补 `.sig`**。

### CI 签名变体（mode:ci，Mac/无 Win 机）
> 内层 sidecar 只能打包时签，只有构建 Windows 的机器能签到；Mac 别 cross-compile。让 **CI 的 windows runner
> 边构建边签**，全平台仍从 CI 下 → **发版主流程 = 常规档**，只是 CI 出的 Windows 已内外层全签。

一次性三步：
1. **CI 仓加 2 Secret**（每个用作 CI 的仓都配）：`EVSIGN_LICENSE` + `EVSIGN_PASSWORD`。🔴 **一键（Sigil codesign 凭据，首选）**：`codesign_push_windows_secrets(credential_name=codesign_keroro, github_credential_name=<当次 CI 账号>, repo=<owner/repo>)` —— 从金库凭据 `codesign_keroro` 的 Win 段灌，sealed box 加密、明文不进对话；无 Sigil 时 `github_repo_secret_set` / `gh secret set` 逐个配
2. 仓库已带 `scripts/evsign-sign-ci.ps1`（从 env 读凭据、无秘密可入库）
3. `release.yml` 的 windows leg（`if: matrix.platform=='windows-latest'`）加一步：下 evsign CLI（写 `$GITHUB_ENV` 的 `EVSIGN_CLI`）+ 生成 signCommand overlay（绝对路径指向 `scripts/evsign-sign-ci.ps1`）→ tauri-action 的 windows leg 加 `args: --config src-tauri/tauri.conf.sign.ci.json` + 注入 `EVSIGN_LICENSE/PASSWORD` env
> 完整示例 yaml 见 tauri-cc 的 release-publish「CI 签名变体」。

### 失败回退
CLI 丢→重下；`签名失败：签名密码为空`→更新 `~/.evsign/pwd.txt`/`license.txt`；`文件被占用`→wrapper 的 copy-sign-swap+重试已兜底；反复失败→问「这次先不签、正常发版」一键回退常规档，**不阻塞发布**。

### 🍎 macOS 签名 secrets（6 个 APPLE_*，配一次即自动签+公证）

底层需就位：`release.yml` 的 macos-latest leg 引用 6 个 `APPLE_*`、`tauri.conf.json` 的 `macOS.hardenedRuntime+entitlements`、`src-tauri/Entitlements.plist`。
🔴 **缺这 6 个 secret → tauri-action 静默跳过 mac 签名、出未签 mac（不报错）**；配齐则自动签名+公证。首次给某 CI 账号发签名 mac **必做这一步**。

🔴 **一键配（Sigil codesign 凭据，首选）**：整套签名资产已存进金库凭据 `codesign_keroro`（Win+Mac 聚合），一条命令灌满 6 个：
```
mcp__sigil__codesign_push_apple_secrets(
  credential_name=codesign_keroro,
  github_credential_name=<当次 CI 账号>,
  repo=<owner/repo>)
```
sealed box 加密注入，AI 不碰证书/密码明文。配完 `github_repo_secret_list(repo=<owner/repo>)` 核对 6 个都在。无 Sigil 时逐个 `gh secret set APPLE_* --repo <owner/repo>`（`.p12` 先 `base64 -w0`）。

> 🔴 **job success ≠ 公证过**：签了没公证也 success。run 整体 completed 后 `github_download_run_logs` 下日志 grep「Notarizing Finished ... Accepted」——**aarch64 + x86_64 各一条**才算真公证（详见 tauri-cc 的 release-publish 及记忆 `macos-signing-notarization-ci`）。

---

## 完整发布流程

> **起手先定签名档位**（见上「Windows 代码签名档位」）：常规档 = 下面一字不改；本地签名档 = Windows 产物改本地
> 签名构建、组 update.json 时 Windows 用本地 `.sig`；CI 签名档 = 下面一字不改（CI 已把 Windows 签好）。

### 步骤 1：询问版本号和更新说明

```
使用 AskUserQuestion 询问：
1. 新版本号？（当前版本读取自 tauri.conf.json）
2. 更新说明？（将写入 release 仓库 README.md 版本历史）
```

### 步骤 2：更新三处版本号

```bash
Edit src-tauri/tauri.conf.json   # "version": "新版本号"
Edit src-tauri/Cargo.toml        # version = "新版本号"
Edit package.json                # "version": "新版本号"
```

### 步骤 3：提交源码仓库并打 Tag 触发 CI

> **注意**：此阶段只操作源码仓库，**不推送任何内容到 release 仓库**。
> release 仓库的 README、产物、update.json 全部在步骤 5（CI 完成后）一次性处理。

```bash
cd "<源码仓库路径>"

# 提交版本号更新 + 其他变更
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml package.json
git commit -m "release: v$VERSION

<更新说明摘要>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

# 推送到 GitHub（remote 名根据用户配置）
git push <github_remote> <主分支名>

# 打 Tag 并推送（触发 GitHub Actions CI）
git tag "v$VERSION"
git push <github_remote> "v$VERSION"
```

### 步骤 4：自动监听 CI + 自动下载产物（Claude 全自动，无需用户介入）

> **演化背景**：早期流程让用户在浏览器手动下载所有 CI 产物，再 `AskUserQuestion` 询问目录。
> 实操中用户经常下漏文件、下到默认目录被多项目混在一起、下到一半浏览器中断。
> 现升级为 **Claude 自己拿到 GitHub 访问能力 → 轮询 CI → 用 asset id 下载到独立子目录**
> （路线 A 走 Sigil 能力，路线 B 走 `gh` CLI，见本技能「发布架构选型」一节）。
> 用户全程不操作浏览器；仅在自动流程崩掉时（步骤 4.5）才回退到手动下载。

**各平台对应的 CI 产物**：

| 平台 | 产物数量 | 文件列表 |
|------|---------|---------|
| Windows | 2 个 | `.exe` + `.exe.sig` |
| macOS ARM | 3 个 | `_aarch64.dmg` + `_aarch64.app.tar.gz` + `_aarch64.app.tar.gz.sig` |
| macOS Intel | 3 个 | `_x64.dmg` + `_x64.app.tar.gz` + `_x64.app.tar.gz.sig` |
| Linux | 3 个 | `.AppImage` + `.AppImage.sig` + `.deb` |

#### 4.1 取得 GitHub 访问能力（🔴 严禁 `git credential fill`）

按开头「路线 A / B」的检测结果分流，**两条路都不会弹任何登录框**：

**路线 A（本会话能 `ToolSearch` 到 `mcp__sigil__*`）—— 根本不需要 TOKEN 变量**

后面 4.2–4.4 直接调 Sigil 能力（`github_runs_list` / `github_run_jobs` /
`github_release_get` / `github_download_release_asset`），凭据由 Sigil 内部注入，
明文不出 Rust。**整节跳过，不要取 token。**

**路线 B（查不到 `mcp__sigil__*`）—— 用 `gh` 自带的 token**

```bash
TOKEN="${GH_TOKEN:-$GITHUB_TOKEN}"                      # ① 环境变量 / CI 优先
[ -z "$TOKEN" ] && TOKEN=$(gh auth token 2>/dev/null)   # ② gh 已登录则直接给，不碰系统凭据管理器
if [ -z "$TOKEN" ] || [ ${#TOKEN} -lt 20 ]; then
  echo "❌ 拿不到 token。二选一（都不会弹窗）："
  echo "   · gh auth login          （推荐，一次登录长期有效）"
  echo "   · export GH_TOKEN=<PAT>  （临时会话）"
  exit 1
fi
echo "✅ token 已就绪，长度 ${#TOKEN}（内容不回显）"
```

> **🔴 绝对不要用 `git credential fill` 拿 token。**
> 它会调用系统 credential helper（Windows 上是 Git Credential Manager）。本机没给
> github.com 存过凭据时——**用 Sigil 或 gh 的人正好都没存**——GCM 会弹出
> `Connect to GitHub` 登录框并阻塞等待。若再被写进 4.2 的轮询循环，就是每 30 秒弹一次、
> 弹到 timeout 为止（zhongyu 发版实录：30 分钟连弹约 60 次，任务最后以 exit 255 被杀）。
> 同理不要用 `git ls-remote` / `git fetch` 探远程状态——一样会触发 GCM。
>
> **fine-grained PAT 必须有 `Contents: Read and write` + `Actions: Read`**（CI 创建的是 draft release，仅 `Contents: Read` 看不到也下载不了）。

#### 4.2 监听 CI 进度（每 30s 轮询）

> **🔴 铁律：取凭据的动作只能在循环外做一次，绝不能写进 `while` 的循环体或循环条件里。**
> 4.1 已经把访问能力准备好了，循环里只管发请求。违反这条 = 弹窗风暴（见 4.1 红字）。

**路线 A（Sigil）** —— 推荐，零弹窗，且不受本机 http_proxy 影响（curl 直连 GitHub API 常被代理拦）：

反复调用下面这条直到 `status=completed`，每次间隔 30s：

```
mcp__sigil__github_runs_list(credential_name=<CI 账号凭据>, repo=<owner/repo>, branch=v$VERSION, per_page=1)
```

`completed` 但 `conclusion != success` 时，用
`mcp__sigil__github_run_jobs(credential_name=…, repo=…, run_id=<上面拿到的 id>)`
定位是哪个 job / step 挂了（该能力还会提示 Actions 配额是否耗尽）。

**路线 B（gh CLI）**：

```bash
TAG="v$VERSION"
CI_OWNER_REPO="<owner>/<repo>"   # 按用户选择的 CI remote 替换
RUN_ID=$(gh run list --repo "$CI_OWNER_REPO" --branch "$TAG" --limit 1 --json databaseId -q '.[0].databaseId')
gh run watch "$RUN_ID" --repo "$CI_OWNER_REPO" --exit-status \
  && echo "✅ CI 成功" || { echo "❌ CI 失败"; gh run view "$RUN_ID" --repo "$CI_OWNER_REPO" --log-failed | tail -50; exit 1; }
```

**路线 B 兜底**（没装 `gh`，只能用 curl + 4.1 拿到的 `$TOKEN`）：

```bash
TAG="v$VERSION"
CI_OWNER_REPO="<owner>/<repo>"   # 按用户选择的 CI remote 替换

while true; do
  STATUS_LINE=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$CI_OWNER_REPO/actions/runs?per_page=10" \
    | node -e "
      const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
      const r=(d.workflow_runs||[]).find(x=>x.head_branch==='$TAG');
      if(!r){console.log('not_found null'); process.exit(0);}
      console.log(r.status, r.conclusion);
    ")
  STATUS="${STATUS_LINE%% *}"
  CONCLUSION="${STATUS_LINE##* }"
  echo "[$(date +%H:%M:%S)] status=$STATUS conclusion=$CONCLUSION"
  if [ "$STATUS" = "completed" ]; then
    [ "$CONCLUSION" = "success" ] && { echo "✅ CI 成功"; break; }
    echo "❌ CI 失败 conclusion=$CONCLUSION"; exit 1
  fi
  sleep 30
done
```

#### 4.3 列出 release 的所有 asset

**路线 A（Sigil）**：`mcp__sigil__github_release_get(credential_name=…, repo=<owner/repo>, tag=v$VERSION)`
直接返回 release id / draft 标志 / assets 列表（含 asset id + 大小 + 文件名），下面的 curl 不用跑。

**路线 B（gh / curl）**：

```bash
ASSETS_JSON=$(curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$CI_OWNER_REPO/releases?per_page=10")

echo "$ASSETS_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const r = d.find(x => x.tag_name === 'v$VERSION');
if (!r) { console.error('没找到 v$VERSION release'); process.exit(1); }
console.log('id:', r.id, 'draft:', r.draft, 'name:', r.name);
r.assets.forEach(a => console.log(a.id, a.size.toString().padStart(10), a.name));
"
```

> CI 创建的是 **draft release**（`draft: true`），普通浏览器 URL 看不到，必须用 asset id + token + `Accept: application/octet-stream` 调 API 下载。

#### 4.4 自动下载到独立子目录（避免与其他项目混）

**路线 A（Sigil）**：对 4.3 拿到的每个 asset 调
`mcp__sigil__github_download_release_asset(credential_name=…, repo=…, asset_id=…, dest_path=<DOWNLOAD_DIR>/<name>)`
（draft release 也能下）。目录规划与前缀过滤规则同下。

**路线 B（gh）**：`gh release download v$VERSION --repo <owner/repo> --dir "$DOWNLOAD_DIR" --pattern '<AppName>_*'`

**路线 B 兜底（curl + `$TOKEN`）**：

```bash
# 一个版本一个目录，旧版本残留 .sig 不会污染本次（v3.0.7 踩过坑：下载目录混入其他项目 .sig，cat 通配符拼接出非法 base64）
DOWNLOAD_DIR="D:/download/<app-slug>-v$VERSION"
mkdir -p "$DOWNLOAD_DIR" && cd "$DOWNLOAD_DIR"

echo "$ASSETS_JSON" | node -e "
const d = JSON.parse(require('fs').readFileSync(0, 'utf8'));
const r = d.find(x => x.tag_name === 'v$VERSION');
r.assets
  .filter(a => a.name.startsWith('<AppName>_'))   // 用产物前缀过滤，避免误下其他 release
  .forEach(a => console.log(a.id + '|' + a.name));
" | while IFS='|' read -r ID NAME; do
  echo "→ $NAME"
  curl -sL -H "Authorization: Bearer $TOKEN" -H "Accept: application/octet-stream" \
    "https://api.github.com/repos/$CI_OWNER_REPO/releases/assets/$ID" \
    -o "$NAME"
done

ls -lh "$DOWNLOAD_DIR/"
```

> **产物前缀过滤**（`<AppName>_`）是防御性的：万一同 tag 误推了其他文件（如桌面 + 移动同 tag），这里也只下载本流程需要的产物。

#### 4.5 备用：自动下载失败时回退手动

如果 token 过期 / API 限流 / 网络问题导致自动下载失败，**才**询问用户：

> 「自动下载失败，你能手动从浏览器下载到哪个目录？」

用户提供目录后跳到步骤 4.6 复用同一套预检逻辑。

#### 4.6 强制预检（自动 / 手动下载都跑）

> 自动下载用独立子目录已经隔离，理论上不会污染。但仍要跑预检——以防 GitHub API 偶发返回不全 / curl 中途网断只下了一半。

```bash
VERSION="x.y.z"
EXPECTED_COUNT=12   # 按 platforms 配置调整：Windows+macOS+Linux = 12; 仅 Windows+macOS = 8；移动 APK+AAB = 2

COUNT=$(ls "$DOWNLOAD_DIR"/<AppName>_* 2>/dev/null | wc -l)
if [ "$COUNT" -ne "$EXPECTED_COUNT" ]; then
  echo "❌ 产物数量异常: 实际 $COUNT 预期 $EXPECTED_COUNT"
  echo "   缺失 = CI 还没构建完 / 部分文件下载失败"
  echo "   过多 = 上一版本 .sig 没清掉(签名读取会被污染)"
  exit 1
fi

# 进一步：每种 .sig 必须正好 1 份（防止跨版本污染导致 cat 拼接非法 base64）
for pattern in "<AppName>_*x64-setup.exe.sig" "<AppName>_*aarch64.app.tar.gz.sig" \
               "<AppName>_*x64.app.tar.gz.sig" "<AppName>_*amd64.AppImage.sig"; do
  c=$(ls "$DOWNLOAD_DIR"/$pattern 2>/dev/null | wc -l)
  if [ "$c" -ne 1 ]; then
    echo "❌ 模式 $pattern 匹配到 $c 个文件(应正好 1 个)"
    ls "$DOWNLOAD_DIR"/$pattern 2>/dev/null
    exit 1
  fi
done
echo "✅ 预检通过"
```

**预检失败处置**：缺失 → 等 CI 完成后重新下载缺的；过多 → 删上一版本残留 / 删其他项目文件；强烈建议**用独立子目录**（如 `D:/download/<app-slug>-v$VERSION/`）天然隔离。

### 步骤 5：处理下载的产物 + 更新 README（Claude 自动执行）

用户提供下载目录后，Claude 自动执行以下操作：

```bash
VERSION="x.y.z"
DOWNLOAD_DIR="<用户提供的下载目录>"
GITEE_DIR="<本地 Gitee Release 仓库路径>"
GITHUB_DIR="<本地 GitHub Release 仓库路径>"

# === R2 配置（从 release-config.json 读取，r2.enabled 时才有值） ===
R2_ENABLED=<true/false>
R2_PUBLIC_URL="<r2.publicUrl>"          # 如 https://pub-xxx.r2.dev
RCLONE_REMOTE="<r2.rcloneRemote>"      # 如 r2
R2_BUCKET="<r2.bucket>"                # 如 downloads
R2_PREFIX="<r2.pathPrefix>"            # 如 myapp
RCLONE="$HOME/bin/rclone.exe"          # rclone 程序路径

# ========== 1. [可选] 上传产物到 R2 CDN（如果 r2.enabled） ==========
if [ "$R2_ENABLED" = "true" ]; then
  $RCLONE copy "$DOWNLOAD_DIR"/ ${RCLONE_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/releases/v${VERSION}/ --progress \
    --include "*.exe" --include "*.exe.sig" --include "*.dmg" \
    --include "*.app.tar.gz" --include "*.app.tar.gz.sig" \
    --include "*.AppImage" --include "*.AppImage.sig" --include "*.deb"
fi

# ========== 2. 复制所有产物到两个 release 仓库 ==========
for DIR in "$GITEE_DIR" "$GITHUB_DIR"; do
  mkdir -p "$DIR/releases/v$VERSION"
  # 按 platforms 配置复制对应文件
  cp "$DOWNLOAD_DIR"/*.exe "$DIR/releases/v$VERSION/" 2>/dev/null         # windows
  cp "$DOWNLOAD_DIR"/*.exe.sig "$DIR/releases/v$VERSION/" 2>/dev/null     # windows
  cp "$DOWNLOAD_DIR"/*.dmg "$DIR/releases/v$VERSION/" 2>/dev/null         # macos
  cp "$DOWNLOAD_DIR"/*.app.tar.gz "$DIR/releases/v$VERSION/" 2>/dev/null  # macos
  cp "$DOWNLOAD_DIR"/*.app.tar.gz.sig "$DIR/releases/v$VERSION/" 2>/dev/null # macos
  cp "$DOWNLOAD_DIR"/*.AppImage "$DIR/releases/v$VERSION/" 2>/dev/null    # linux
  cp "$DOWNLOAD_DIR"/*.AppImage.sig "$DIR/releases/v$VERSION/" 2>/dev/null # linux
  cp "$DOWNLOAD_DIR"/*.deb "$DIR/releases/v$VERSION/" 2>/dev/null         # linux
done

# ========== 3. 读取签名文件，生成 update.json（仅包含已配置平台） ==========
#
# 🔴🔴🔴 这是整个发布最易出错、出错后果最严重的一步 🔴🔴🔴
# 签名（.sig 内容）错一个字符 → 所有用户自动更新报 "signature verification failed"。
# 必须严格遵守下面的 4 条注入规则，禁止任何形式的手动粘贴 base64 签名。
#
# 签名注入规则（违反会导致自动更新签名验证失败）：
#   1. 必须先用 shell 变量读取 .sig 文件内容（tr -d '\r\n' 去掉 Windows 换行）
#   2. 所有版本（R2/Gitee/GitHub）的 update.json 都必须用**双引号 heredoc**（<< JSONEOF，不带单引号），
#      通过 $VAR 注入签名 —— 这样 shell 自动替换变量，无需人工接触签名内容
#   3. 🚫 绝对禁止：单引号 heredoc（<< 'JSONEOF'）后手动粘贴签名（400+ 字符，一个字符差异即失败）
#   4. 生成后必须验证：对比 update.json 内签名与原始 .sig 文件完全一致

# --- 3a. 读取各平台签名（仅读 platforms 配置含有的平台）---
# 🔴 必须用 <AppName>_ 前缀过滤,不能用 *x64-setup.exe.sig 这种纯后缀通配符!
# 踩坑实录: cat *x64-setup.exe.sig 会把同目录下其他项目的 .sig 一起 cat 出来,
# 拼接成 800+ 字符的非法 base64,Tauri updater 报 "Invalid symbol 61, offset 426"。
# 强烈建议下载用独立子目录(步骤 4.4 的 D:/download/<app-slug>-v$VERSION/)天然隔离。
WIN_SIG=$(cat "$DOWNLOAD_DIR"/<AppName>_*x64-setup.exe.sig 2>/dev/null | tr -d '\r\n')      # windows
MAC_ARM_SIG=$(cat "$DOWNLOAD_DIR"/<AppName>_*aarch64.app.tar.gz.sig 2>/dev/null | tr -d '\r\n') # macos arm
MAC_X64_SIG=$(cat "$DOWNLOAD_DIR"/<AppName>_*x64.app.tar.gz.sig 2>/dev/null | tr -d '\r\n')  # macos intel
LINUX_SIG=$(cat "$DOWNLOAD_DIR"/<AppName>_*amd64.AppImage.sig 2>/dev/null | tr -d '\r\n')    # linux

# --- 3b. 防御性校验①: 每个签名 = 字符数 ≤ 2（只有末尾的 base64 padding）---
# 超过 2 个 = 说明 cat 拼接了多个文件或签名格式异常,立即中止。
# 只校验 platforms 配置含有的平台(未配置平台的变量为空,跳过)。
for var_name in WIN_SIG MAC_ARM_SIG MAC_X64_SIG LINUX_SIG; do
  sig_value=$(eval echo "\${$var_name}")
  [ -z "$sig_value" ] && continue
  eq_count=$(echo -n "$sig_value" | tr -cd '=' | wc -c)
  if [ "$eq_count" -gt 2 ]; then
    echo "❌ $var_name 含 $eq_count 个 = 字符(应 ≤ 2),可能 cat 了多个 sig 文件"
    echo "   下载目录是否混入其他项目的 .sig? 自查: ls $DOWNLOAD_DIR/*.sig"
    exit 1
  fi
done

# --- 3c. 防御性校验②: node 真实 base64 解码（终极兜底，唯一可靠验证）---
# 即使 = 字符通过,也可能含其他非法字符(空格/中文/控制字符)。base64 真解码 + 重编码比对才可靠。
for var_name in WIN_SIG MAC_ARM_SIG MAC_X64_SIG LINUX_SIG; do
  sig_value=$(eval echo "\${$var_name}")
  [ -z "$sig_value" ] && continue
  SIG="$sig_value" node -e "
    try {
      const buf = Buffer.from(process.env.SIG, 'base64');
      if (buf.toString('base64') !== process.env.SIG.trim()) {
        console.error('❌ 签名含非 base64 字符或格式异常 (re-encode mismatch)'); process.exit(1);
      }
      // Tauri ed25519 签名 + metadata,总长一般 200-800 字节
      if (buf.length < 200 || buf.length > 800) {
        console.error('❌ 签名解码后字节数异常:', buf.length, '(预期 200-800)'); process.exit(1);
      }
    } catch (e) { console.error('❌ base64 解码失败:', e.message); process.exit(1); }
  " || { echo "签名变量 $var_name 验证失败"; exit 1; }
done
echo "✅ 所有签名 base64 解码验证通过"

# --- 3d. 用 node 安全转义"更新说明"作为 notes（多行用 \n,禁止直接字符串拼接）---
RELEASE_NOTES="<本次发布说明，与步骤 1 询问用户时一致，可多行用 \n 分隔>"
NOTES_JSON=$(NOTES="$RELEASE_NOTES" node -e "process.stdout.write(JSON.stringify(process.env.NOTES))")

# --- 3e. 统一生成函数：3 个版本只传不同 BASE_URL，确保签名/结构完全一致 ---
# 🔴 platforms 配置不含某平台时,删除函数内对应的 "<target>": {...} 块。
generate_update_json() {
  local BASE_URL="$1"
  local OUTPUT="$2"
  cat > "$OUTPUT" << JSONEOF
{
  "version": "$VERSION",
  "notes": $NOTES_JSON,
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "windows-x86_64": {
      "url": "$BASE_URL/<AppName>_${VERSION}_x64-setup.exe",
      "signature": "$WIN_SIG"
    },
    "darwin-aarch64": {
      "url": "$BASE_URL/<AppName>_aarch64.app.tar.gz",
      "signature": "$MAC_ARM_SIG"
    },
    "darwin-x86_64": {
      "url": "$BASE_URL/<AppName>_x64.app.tar.gz",
      "signature": "$MAC_X64_SIG"
    },
    "linux-x86_64": {
      "url": "$BASE_URL/<AppName>_${VERSION}_amd64.AppImage",
      "signature": "$LINUX_SIG"
    }
  }
}
JSONEOF
}

# URL 基准（仅生成 platforms 含有的；R2 仅 r2.enabled 时）
GITEE_BASE="https://gitee.com/<用户名>/<项目名>-release/raw/master/releases/v${VERSION}"
GITHUB_BASE="https://github.com/<用户名>/<项目名>-release/raw/master/releases/v${VERSION}"
generate_update_json "$GITEE_BASE"  "$GITEE_DIR/update.json"
generate_update_json "$GITHUB_BASE" "$GITHUB_DIR/update.json"
if [ "$R2_ENABLED" = "true" ]; then
  R2_UPDATE_BASE="${R2_PUBLIC_URL}/${R2_PREFIX}/releases/v${VERSION}"
  generate_update_json "$R2_UPDATE_BASE" "/tmp/update-r2.json"
fi

# --- 3f. 🔴 生成后强制验证签名一致性（防止写入错误，必须执行）---
TARGETS="$GITEE_DIR/update.json $GITHUB_DIR/update.json"
[ "$R2_ENABLED" = "true" ] && TARGETS="$TARGETS /tmp/update-r2.json"
for f in $TARGETS; do
  SIG_IN_JSON=$(node -e "const d=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log(d.platforms['windows-x86_64'].signature)" | tr -d '\r\n')
  if [ "$SIG_IN_JSON" != "$WIN_SIG" ]; then
    echo "❌ 签名不匹配: $f"; exit 1
  fi
done
echo "✅ 所有 update.json 签名一致性验证通过"

# ========== 4. [可选] 上传 R2 版 update.json + versions.json（如果 r2.enabled） ==========
if [ "$R2_ENABLED" = "true" ]; then
  $RCLONE copyto /tmp/update-r2.json ${RCLONE_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/update.json --progress

  # ========== 4b. [可选] 更新 R2 版本列表（文档站下载页依赖此文件） ==========
  # versions.json 格式: {"versions": ["v2.8.2", "v2.8.1", ...]}（新版本插数组头部）
  curl -s "${R2_PUBLIC_URL}/${R2_PREFIX}/versions.json" -o /tmp/versions.json 2>/dev/null || echo '{"versions":[]}' > /tmp/versions.json
  node -e "
    const fs=require('fs'); const p='/tmp/versions.json';
    let d; try{ d=JSON.parse(fs.readFileSync(p,'utf8')); }catch(e){ d={versions:[]}; }
    d.versions = d.versions || [];
    if(!d.versions.includes('v$VERSION')) d.versions.unshift('v$VERSION');
    fs.writeFileSync(p, JSON.stringify(d,null,2));
  "
  $RCLONE copyto /tmp/versions.json ${RCLONE_REMOTE}:${R2_BUCKET}/${R2_PREFIX}/versions.json --progress
fi

# ========== 5. 更新两个 release 仓库的 README.md（三处更新） ==========
#    - 最新版本下载表格（版本号 + 多平台链接）
#    - 版本历史（添加新版本条目）
#    - 项目结构树（添加新版本目录）
#    两个仓库的 README.md 内容一致，同步更新
Edit "$GITEE_DIR/README.md"
Edit "$GITHUB_DIR/README.md"
```

**下载表格模板**（根据 platforms 配置选择包含哪些平台）：

```markdown
### 最新版本: vx.y.z

| 平台 | 下载链接 |
|------|---------|
| Windows x64 | [AppName_x.y.z_x64-setup.exe](releases/vx.y.z/AppName_x.y.z_x64-setup.exe) |
| macOS Apple Silicon | [AppName_x.y.z_aarch64.dmg](releases/vx.y.z/AppName_x.y.z_aarch64.dmg) |
| macOS Intel | [AppName_x.y.z_x64.dmg](releases/vx.y.z/AppName_x.y.z_x64.dmg) |
| Linux | [AppName_x.y.z_amd64.AppImage](releases/vx.y.z/AppName_x.y.z_amd64.AppImage) |
```

**项目结构树模板**（根据 platforms 配置选择包含哪些文件）：

```
    └── vx.y.z/         # vx.y.z 版本
        ├── AppName_x.y.z_x64-setup.exe           # Windows 安装包
        ├── AppName_x.y.z_x64-setup.exe.sig       # Windows updater 签名
        ├── AppName_x.y.z_aarch64.dmg             # macOS Apple Silicon
        ├── AppName_aarch64.app.tar.gz            # macOS ARM updater 产物
        ├── AppName_aarch64.app.tar.gz.sig        # macOS ARM updater 签名
        ├── AppName_x.y.z_x64.dmg                 # macOS Intel
        ├── AppName_x64.app.tar.gz               # macOS Intel updater 产物
        └── AppName_x64.app.tar.gz.sig           # macOS Intel updater 签名
```

**update.json 模板**（根据 platforms 配置选择包含哪些平台）：

```json
{
  "version": "x.y.z",
  "notes": "Release vx.y.z",
  "pub_date": "2026-03-10T12:00:00Z",
  "platforms": {
    "windows-x86_64": { ... },      // ← platforms 含 windows
    "darwin-aarch64": { ... },       // ← platforms 含 macos
    "darwin-x86_64": { ... },        // ← platforms 含 macos
    "linux-x86_64": { ... }          // ← platforms 含 linux
  }
}
```

> **注意**：各版本 update.json 只有 URL 中的 `<BASE>` 不同。
> - R2（如果启用）: `<r2.publicUrl>/<r2.pathPrefix>/releases/vx.y.z`
> - Gitee: `https://gitee.com/<用户名>/<项目名>-release/raw/master/releases/vx.y.z`
> - GitHub: `https://github.com/<用户名>/<项目名>-release/raw/master/releases/vx.y.z`
>
> R2 版 update.json 上传到 R2 CDN 作为主更新端点，Gitee 版写入 Gitee release 仓库作为备用。

### 步骤 6：推送 release 仓库（README + 产物 + update.json）

> **推送前必须先拉取**：上一版本可能已推送产物到远程，本地可能落后。
> **推送超时处理**：release 仓库包含大量二进制文件，`git push` 可能超时。如果推送失败（SSL_ERROR_SYSCALL / RPC failed / hung up），**不要重试**，直接提示用户手动执行推送命令，然后继续后续步骤。

```bash
# === Gitee release 仓库 ===
cd "$GITEE_DIR"
git add -A
git commit -m "release: v$VERSION

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git pull --rebase origin master
git push origin master

# === GitHub release 仓库 ===
cd "$GITHUB_DIR"
git add -A
git commit -m "release: v$VERSION

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git pull --rebase origin master
git push origin master
```

### 步骤 6.5：触发文档站重建（可选，仅文档站消费 R2 versions.json 时）

> **何时需要**：项目有 VitePress 文档站，且下载页（`DownloadSection.vue` 之类）在**构建时**
> 从 R2 拉 `versions.json` 嵌入静态快照。此时仅更新 R2 的 versions.json 还不够——
> 文档站是上次构建的旧快照，必须重新构建才能拿到新版本列表。
> **纯桌面 + 无文档站 / 文档站运行时直接 fetch R2 的项目可跳过本步。**

```bash
# 写一个版本标记文件制造真实 diff（比空 commit 更稳，能确实触发 Pages 重建）
# 文件放文档站源码仓库的 docs/public/ 下，构建时一并发布但不影响页面
cat > docs/public/.last-release.json << JSONEOF
{
  "version": "v$VERSION",
  "released_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
JSONEOF

git add docs/public/.last-release.json
git commit -m "chore: 同步 v$VERSION 发布（触发下载页快照重建）

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
git push origin master   # 推到文档站托管分支（Gitee Pages / GitHub Pages / Cloudflare Pages）
```

> 推送后托管平台自动重新构建文档站，下载页在构建期重新拉取 R2 `versions.json`，
> 新版本作为快照嵌入。**移动端**对应 `docs/public/.last-release-mobile.json`（与桌面平级，
> 写移动端版本号，消费 `mobile-versions.json`），见下方"双线发布"章节。

### 步骤 7：完成报告

```markdown
## 发布完成

| 项目 | 值 |
|------|-----|
| 版本 | vx.y.z |
| 支持平台 | <从 platforms 配置读取> |
| 源码仓库 | 已推送到 <GitHub URL> |
| CI 构建 | 已完成，产物已上传到 GitHub Release |
| R2 CDN | 产物 + update.json 已上传（如果 r2.enabled，否则显示"未启用"） |
| Release 仓库（Gitee） | 产物 + update.json 已推送 |
| Release 仓库（GitHub） | 产物 + update.json 已推送 |
| 文档站下载页 | 已推送 .last-release.json 触发重建（如有文档站，否则显示"无"） |
| 应用内自动更新 | R2 主 + Gitee 备，双端点已生效（如果 r2.enabled）/ Gitee 端点已生效（如果 r2 未启用） |
```

---

## CI 构建流程

### 概述

通过 GitHub Actions 在云端自动构建安装包并签名，无需本地构建。
CI **只负责构建和上传到 GitHub Release**，不负责推送到 release 仓库。
构建矩阵由 `platforms` 配置决定。

### 工作流文件

`.github/workflows/release.yml`

### 触发方式

推送 `v*.*.*` 格式的 Git Tag 时自动触发：

```bash
git tag v0.2.0
git push <github_remote> v0.2.0
```

> **🔴 新建私有仓首次发版**：GitHub 默认**禁用**新私有仓的 Actions，tag 推上去也**不触发**（0 个 run，workflow 不被注册）。
> 推 tag **前**必须先启用：`mcp__sigil__github_actions_enable`，或无 Sigil 时 `gh api -X PUT repos/<owner>/<repo>/actions/permissions -F enabled=true`。
> 启用 Actions **不会回溯**已推的 tag —— 若启用前已推过 tag，需**删远端 tag 重推**才会触发（`git push <remote> :refs/tags/vX.Y.Z` 删 → 重打 → 重推）。
>
> **建议 workflow 同时声明 `workflow_dispatch`**，便于手动重触发，免去每次"删 tag 重推"：
> ```yaml
> on:
>   push:
>     tags: ['v*.*.*']
>   workflow_dispatch: {}   # 允许在 Actions 页 / gh CLI 手动触发
> ```
> 手动触发：`gh workflow run release.yml --repo <owner>/<repo> --ref <tag 或分支>`。

### 构建矩阵（按 platforms 配置）

| 平台 | Runner | Bundle 参数 | Updater 产物 | 安装包产物 | platforms 值 |
|------|--------|-------------|-------------|-----------|-------------|
| Windows | `windows-latest` | `--bundles nsis` | `.exe` + `.exe.sig` | `.exe` (NSIS) | `windows` |
| macOS (ARM) | `macos-latest` | `--bundles app,dmg` | `.app.tar.gz` + `.sig` | `.dmg` (aarch64) | `macos` |
| macOS (Intel) | `macos-latest` | `--bundles app,dmg` | `.app.tar.gz` + `.sig` | `.dmg` (x86_64) | `macos` |
| Linux | `ubuntu-22.04` | `--bundles deb,appimage` | `.AppImage` + `.sig` | `.deb` + `.AppImage` | `linux` |

> **macOS 必须包含 `app` bundle**
> - `dmg` 只生成安装用的 DMG 镜像，**不生成 updater 产物**
> - `app` 生成 `.app` 应用包，Tauri 会自动打包为 `.app.tar.gz` 并签名
> - 正确写法：`--bundles app,dmg`（先 app 再 dmg）

### 签名说明

- CI 构建时自动使用 `TAURI_SIGNING_PRIVATE_KEY` 进行签名
- **签名文件（`.sig`）已包含在 CI 产物中**，用户只需下载即可
- 用户不需要在本地做任何签名操作
- Claude 读取 `.sig` 文件内容来生成 `update.json`

---

## 密钥管理

### 重新生成密钥（需手动执行）

```bash
pnpm tauri signer generate -w src-tauri/keys/tauri-updater.key
# 密码提示时直接按两次回车（空密码）
```

**重新生成后必须：**
1. 更新 `tauri.conf.json` 中的 `pubkey`（读取 `.key.pub` 文件内容）
2. 更新 GitHub Secrets 中的 `TAURI_SIGNING_PRIVATE_KEY`：**`gh secret set TAURI_SIGNING_PRIVATE_KEY --repo <owner>/<repo> < src-tauri/keys/tauri-updater.key`**（从文件管道灌，私钥不进对话）；多 CI 仓库每个都要重设
3. 重新构建并发布（旧版本的签名将不可用，但不影响已安装用户）

### 安全提醒

- **私钥 (`tauri-updater.key`) 绝不能提交到公开仓库**
- `src-tauri/keys/` 应加入主项目的 `.gitignore`

---

## Cloudflare R2 CDN 配置（可选）

> 以下内容仅在 `release-config.json` 中 `r2.enabled = true` 时适用。

### R2 目录规划（支持多项目）

```
<bucket>/                              ← Bucket 根目录（如 downloads）
├── <pathPrefix>/                      ← 项目隔离目录（如 myapp）
│   ├── releases/vX.Y.Z/              ← 版本产物
│   └── update.json                   ← Tauri 自动更新端点
├── other-project/                     ← 其他项目
│   └── releases/
└── shared/                            ← 共享资源
```

### 自定义域名（可选）

> 当前使用 R2.dev 公开 URL（如 `https://pub-xxx.r2.dev`），功能完全等价。
> 如需绑定自定义域名（如 `dl.example.com`），需要：
> 1. 将域名 DNS 迁移到 Cloudflare（NS 变更）
> 2. R2 Settings → Custom Domains → 添加子域名
> 3. 更新 `tauri.conf.json` 和 release-config.json 中的 URL
>
> **注意**：DNS 迁移会影响现有域名解析，需提前导入所有 DNS 记录。

### R2 成本（永久免费额度内）

| 项目 | 免费额度 | 实际用量（估） |
|------|---------|--------------|
| 存储 | 10 GB/月 | ~500MB（20 版本） |
| 上传操作 | 100万次/月 | ~50次/月 |
| 下载操作 | 1000万次/月 | ~2000次/月 |
| 出站流量 | **无限免费** | ~50GB/月 |

### rclone 配置方法

```bash
# 1. 安装 rclone（下载到 ~/bin/rclone.exe 或其他位置）
# 2. 配置 R2 remote
rclone config
# 选 "New remote" → 名称填 r2 → 类型选 "Cloudflare R2" → 填入 Access Key ID + Secret
# 配置完成后验证：
rclone ls r2:<bucket>/

# 3. 测试上传
rclone copy ./test.txt r2:<bucket>/<pathPrefix>/test/ --progress
```

> rclone 配置文件位于 `~/.config/rclone/rclone.conf`。

> **⚠️ scoped key 限制**：本套环境这把 R2 key 只能读写 `downloads` 桶、**不能 ListBuckets / 建桶**（`rclone lsd r2:` 报 403、`mkdir` 静默失败）。
> 别用它自省桶结构或建桶；上传路径**固定**为 `r2:downloads/<pathPrefix>/...`（第一段必须是桶名 `downloads`）。详见上方「发布架构选型 → R2 桶真相」。装了 Sigil 则直接用 `r2_object_upload(bucket=downloads, key=<pathPrefix>/...)` 更省心。

### Tauri updater 端点配置（R2 启用时）

```json
{
  "plugins": {
    "updater": {
      "endpoints": [
        "<r2.publicUrl>/<r2.pathPrefix>/update.json",
        "https://gitee.com/<用户名>/<项目名>-release/raw/master/update.json"
      ]
    }
  }
}
```

> R2 作为第一端点（主源），Gitee 作为第二端点（备源）。Tauri updater 会按顺序尝试，第一个失败自动 fallback。

---

## 移动端 Android 发布要点

> 以下针对 `mobile-tauri` 子项目（Tauri 2.x Android target）。Android 与桌面端发布完全解耦，但有几个 Android 特有的坑必须提前防住。

### 1. Release keystore 必须在首次发版前生成并配置

**症状**：用户每次升级 APK 都被系统拦截「与已安装应用签名不同」，必须先卸载旧版才能装新版。

**根因**：CI workflow 没配 `ANDROID_KEYSTORE_BASE64` secret 时，gradle 会用 GitHub runner 临时生成的 `debug.keystore` 签名 → **每次构建签名都不同** → 每个版本对系统而言都是「另一个 app」。

**正确做法**（首次发版前一次性配置）：

```bash
# 1. 本地生成稳定 release keystore（验证期 100 年，密码随机生成 22 字符）
KEYSTORE_PWD=$(openssl rand -base64 24 | tr -d '+/=' | head -c 22)
keytool -genkeypair -v \
  -keystore <app>-release.keystore \
  -alias <app> -keyalg RSA -keysize 4096 -validity 36500 \
  -storepass "$KEYSTORE_PWD" -keypass "$KEYSTORE_PWD" \
  -dname "CN=<App Name>, O=<Org>, C=CN"

# 2. 转 base64（注入 GitHub Secret）
base64 -w0 <app>-release.keystore > keystore.b64

# 3. 在每个 CI 仓库 Settings → Secrets 配置 4 个 secret：
#    ANDROID_KEYSTORE_BASE64    = <keystore.b64 内容>
#    ANDROID_KEYSTORE_PASSWORD  = $KEYSTORE_PWD
#    ANDROID_KEY_ALIAS          = <app>
#    ANDROID_KEY_PASSWORD       = $KEYSTORE_PWD
```

**workflow 配置**（在 release-android job 里）：

```yaml
- name: Setup release keystore
  if: env.HAS_KEYSTORE == 'true'
  env:
    HAS_KEYSTORE: ${{ secrets.ANDROID_KEYSTORE_BASE64 != '' }}
  run: |
    echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 -d > release.keystore
    # 把密钥注入 gradle.properties 或 signing config
```

> **多 CI 仓库 fallback 注意**：每个 CI 仓库都要独立配置 4 个 secret。secret 不跨仓共享，否则备仓 build 时 `if: env.HAS_KEYSTORE == 'true'` 判断为 false，step 被 skip，又退回 debug 签名（CI 显示绿色但产物用错签名，最容易被忽略的失败模式）。

> **keystore 备份**：keystore 文件 + 密码必须异地备份（云盘 + 离线 U 盘）。**丢了无法找回**，会迫使所有用户卸载重装。

### 2. 发布前用 apksigner 验证签名（防止 build skipped 静默退化）

**症状**：CI 显示绿色但产物用的是临时 debug 签名（step 13 被 skip 了不抛错）。

**做法**：发布前对每个 APK 做一次签名指纹比对（与 keystore 期望指纹一致才推 R2）：

```bash
# 期望指纹（一次性记录到 keystore 配置文件）
EXPECTED=$(keytool -list -v -keystore release.keystore -storepass "$PWD" \
  -alias "$ALIAS" | grep "SHA256:" | awk -F'SHA256:' '{print $2}' | tr -d ' ')

# 验证下载的 APK
ACTUAL=$("$ANDROID_SDK/build-tools/<ver>/apksigner" verify --print-certs <apk> \
  | grep "Signer #1 certificate SHA-256 digest:" | awk '{print $NF}')

[ "$ACTUAL" = "$EXPECTED" ] || { echo "❌ 签名不匹配，禁止发布"; exit 1; }
```

### 3. mobile- 前缀拼接陷阱（双重 mobile 404）

Android 发版常用 tag 格式 `mobile-vX.Y.Z`（与桌面 `vX.Y.Z` 区分）。模板/脚本里如果直接把整个 tag 拼到文件名后面，会得到 `<App>-mobile-mobile-v0.3.4.apk` 这种双 mobile 路径 → R2/Gitee 404。

**正确做法**：先剥前缀再拼：

```bash
# bash
VER="mobile-v0.3.4"
FILE_VER="${VER#mobile-}"   # → v0.3.4
APK="<App>-mobile-${FILE_VER}.apk"
```

```typescript
// TS / JS
const fileVer = ver.replace(/^mobile-/, "");
const apk = `<App>-mobile-${fileVer}.apk`;
```

**同源陷阱**：移动端 `parseSemver` 也常忘记剥 `mobile-` 前缀，导致 `mobile-v0.3.2` 经过 `replace(/^v/, "")` 不变 → 正则不匹配 → `compareSemver` 视为同版本 → 检查更新永远报「已是最新」。

```typescript
// ❌ 错的
function parseSemver(s: string) {
  const m = s.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  // mobile-v0.3.2 不会被匹配
}

// ✅ 对的：先剥 mobile- 再剥 v
function parseSemver(s: string) {
  const cleaned = s.replace(/^mobile-/, "").replace(/^v/, "");
  return cleaned.match(/^(\d+)\.(\d+)\.(\d+)/);
}
```

### 4. Android versionCode 必须严格递增

`versionName` 是字符串可重复，但 `versionCode` 是整数，**比已安装版本大才允许覆盖安装**。常用约定：

```kotlin
// gen/android/app/build.gradle.kts
versionCode = X * 10000 + Y * 100 + Z   // v0.3.6 → 306
versionName = "0.3.6"
```

回退版本号（如 0.3.6 → 0.3.5）时 versionCode 必须仍递增（如 305 → 307），否则用户装不上。

---

## 常见问题排查

### 应用内更新问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| 应用检查不到更新 | 用 Gitee/GitHub raw 端点但 release 仓是私有的 | **首选改用 R2-only 端点**（公开 r2.dev，无需任何仓库公开，见「发布架构选型 路线 A」）；若坚持用 raw 端点则该 release 仓须公开 |
| 应用检查不到更新 | update.json 中版本号 <= 当前版本 | 确保 update.json 的 version 大于已安装版本 |
| 签名验证失败 | 公钥不匹配 | 确保 `tauri.conf.json` 中的 pubkey 与签名使用的私钥配对 |
| 签名验证失败 | update.json 中签名内容与 `.sig` 文件不一致 | **禁止手动粘贴签名**，必须用 shell 变量注入（步骤 5「3a~3f」的 `generate_update_json()`），生成后比对一致性 |
| 签名报 "Invalid symbol 61, offset 4xx" | `cat *.sig` 通配符把多个项目的 .sig 拼成非法 base64 | 用 `<AppName>_` 前缀过滤 .sig；下载用独立子目录隔离（步骤 4.4） |

### R2 CDN 问题（r2.enabled 时）

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| R2 下载失败 | R2.dev 域名偶尔被墙 | Tauri updater 自动 fallback 到 Gitee 备源端点 |
| rclone 上传失败 | Access Key 过期或 bucket 名错误 | 检查 `~/.config/rclone/rclone.conf` 中的 R2 配置 |
| R2 update.json 未更新 | rclone copyto 命令未执行 | 检查 `release-config.json` 中 `r2.enabled` 是否为 `true` |
| R2 产物 URL 404 | pathPrefix 或 bucket 名不匹配 | 确认 `r2.publicUrl` + `r2.pathPrefix` 与 rclone 上传路径一致 |
| 自定义域名不生效 | DNS 未迁移到 Cloudflare | 使用 R2.dev 公开 URL 作为替代 |

### Git 推送问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| Release 仓库 push rejected | 上一版本已推送产物到远程，本地落后 | **先 `git pull --rebase origin master` 再 push** |

### CI 构建问题（踩坑总结）

| 问题 | 根因 | 解决方案 |
|------|------|---------|
| macOS updater 产物缺失 | `--bundles dmg` 不生成 updater 产物 | **必须用 `--bundles app,dmg`** |
| Linux 编译 unused import 警告 | `#[cfg(target_os = "windows")]` 下的 import 在 Linux 不使用 | 将 import 也放在 `#[cfg()]` 块内 |
| CI 推送 Gitee 超时 | GitHub Actions（美国）推送到 Gitee（中国）太慢 | **已改为本地推送**，不再由 CI 推送 |
| GitHub API 用 PAT 拿 release 返回 404 / 看不到刚 build 的 release | CI 创建的是 `draft: true` release，fine-grained PAT 仅有 `Contents: Read` 看不到 draft | PAT 权限升级为 `Contents: Read and write` + `Actions: Read`；下载 asset 时也必须用 `Authorization: Bearer <token>` + `Accept: application/octet-stream` 调 API（普通浏览器 URL 无法下载 draft asset） |
| 私有仓 CI 推 tag 后 3-5 秒就失败，无任何 step 输出（日志 0.00MB） | GitHub Actions 私有仓每月免费分钟数耗尽（macOS 10 倍倍率最容易超） | 切到备用 CI 仓库（见步骤 5.1 多 CI 仓库 fallback）；切账号整套 = 建仓+加 remote+**独立配 secret**+启用 Actions+推 master 与 tag；下月 1 号自动重置 |
| 推 tag 后 **0 个 workflow run**（CI 根本没触发，与上面"3-5 秒失败"不同） | 新建私有仓 Actions **默认禁用**，workflow 未注册 | 先 `github_actions_enable` / `gh api … permissions -F enabled=true` 启用；启用**不回溯**已推 tag → 删远端 tag 重推；workflow 加 `workflow_dispatch` 备用 |

---

## 附录：本地构建（仅在 CI 不可用时使用）

> 正常发布流程使用 CI，以下仅作为 CI 不可用时的备用方案。

### Windows 本地签名构建

> **Windows 环境变量设置注意事项**
>
> Claude Code 的 Bash 工具运行在 Git Bash (MSYS2) 环境中。
> - **正确**：`export VAR=value && command`（bash export 语法）
> - **失败**：`set VAR=value && command`（CMD 语法在 bash 中无效）
> - **失败**：`$env:VAR='value'; command`（PowerShell 语法）

```bash
# 读取私钥并构建（单条 Bash 调用）
export TAURI_SIGNING_PRIVATE_KEY="<src-tauri/keys/tauri-updater.key 文件完整内容>" && \
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" && \
pnpm tauri build 2>&1

# 构建超时设置：600000ms（10分钟）
# 建议后台运行：run_in_background: true
# 构建成功标志：输出末尾出现 `Finished 1 updater signature at:`
```

---

## 双线发布（桌面 + 移动）

> 适用项目：基于本框架开发了移动端伴侣（见 `mobile-app-architecture` skill）。
> 桌面单端项目可忽略本章。

### 总览：CI 分流（方案 B）

```
桌面端（v*.*.*）             移动端（mobile-v*.*.*）
   ↓ 推 v3.x.x tag                ↓ 推 mobile-v0.x.x tag
release.yml: release job       release.yml: release-android job
   ↓                                   ↓
仓库 releases/vX.Y.Z/            仓库 releases-mobile/mobile-vX.Y.Z/
+ 同步 versions.json            + 同步 mobile-versions.json
```

> **桌面 / 移动版本号独立**，可以分别迭代。桌面端不需要 APK 包就能发版；移动端不需要等桌面端构建完成。
> 文档站下载页同时展示两条版本线，分别是"桌面应用"和"移动伴侣"两个区块。

### 版本号同步清单

桌面端（保持原有 N 处）+ 移动端 4 处：

| 文件 | 字段 |
|------|------|
| `mobile-tauri/src-tauri/tauri.conf.json` | `"version": "x.y.z"` |
| `mobile-tauri/src-tauri/Cargo.toml` | `version = "x.y.z"` |
| `mobile-tauri/package.json` | `"version": "x.y.z"` |
| `mobile-tauri/src-tauri/gen/android/app/build.gradle.kts` | `versionName = "x.y.z"`、**`versionCode` 必须严格递增** |

> **🔴 关键**：移动端版本号与桌面端**独立**。桌面 v3.5.0 时移动端可能还在 v0.2.1，互不影响。
> versionCode 推荐公式：`major*10000 + minor*100 + patch`（0.3.6 → 306）。

### CI 分流写法

```yaml
on:
  push:
    tags:
      - 'v*.*.*'
      - 'mobile-v*.*.*'

jobs:
  release:
    if: ${{ !startsWith(github.ref_name, 'mobile-') }}   # ← 桌面 job 跳过 mobile-* tag
    # 桌面构建 (windows-latest + macos-latest)...

  release-android:
    if: ${{ startsWith(github.ref_name, 'mobile-') }}    # ← 移动 job 只在 mobile-* tag 上跑
    # Android 构建...
```

桌面端推 `v3.x.x` tag 只触发 `release` job，移动端推 `mobile-v0.x.x` tag 只触发 `release-android` job，互不干扰。

### 移动端发布特殊点

| 项 | 桌面 | 移动 |
|----|------|------|
| update.json | 生成 | **不生成**（Android 侧载分发不支持 Tauri updater 静默更新） |
| 产物 | NSIS / MSI / DMG / AppImage | APK / AAB |
| 用户安装 | 自动更新 | 手动下载侧载 |
| versionCode | — | **必须严格递增**（同号或更小 Android 拒绝覆盖安装） |

### 完整流程（移动端 mobile-v*.*.*）

```
本地：bump 4 处版本号 → commit → 打 mobile-v$VER tag → push tag
   ↓
CI 自动：tauri android build → 上传 APK / AAB 产物
   ↓
本地：下载产物 → 上传到对应 CDN/存储桶（与桌面端隔离的子目录）
       + 复制到 release 仓库 releases-mobile/
       + 更新 mobile-versions.json
       + 更新 .last-release-mobile.json（触发文档站重建）
```

### `<APP_NAME>_` 前缀过滤

发布产物文件名加项目自定义前缀（如 `<APP_NAME>_`），CI 复制脚本按前缀过滤，
避免桌面 release 不小心混入移动产物（同 tag 下载错文件）。

### 桌面发版前必须看 mobile-tauri/ 状态

mobile-tauri/ 有独立 `.gitignore` 但与主仓共用 `src/mobile/` 和 `src-tauri/`。桌面发版前
必须 `cd mobile-tauri && git status -s` 检查，避免遗漏未提交改动。

### 相关 skill

- `mobile-app-architecture` — 移动端架构选型与目录骨架
- `tauri-mobile-android` — Android 打包专项（NDK / versionCode / 签名）
