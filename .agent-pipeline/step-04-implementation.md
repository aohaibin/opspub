# 第 04 步 SFTP 首批实施报告

实施结果为静态与隔离检查通过，待独立验收。实施基线为 `opspub` 的 `56fc3fb3a7a91fd83ccaa10cba6c4cf6a51df856`。已核对 `state.json` 第 04 项、`baseline.md` 的 SFTP 行、通用验收清单和原型的 SFTP 二级栏、文件管理器与传输浮窗。当前第 04 项只有 `scope`，首批范围采用本次派发说明。

## 变更文件

| 文件 | 变更 |
| --- | --- |
| `src/pages/sftp/index.tsx` | 接入二级栏插槽和服务器直达，按已有会话接口的建连结果创建标签。双栏缺少第二个会话时提供选机入口。上传按发起窗格捕获主机 ID 和远程目录，只刷新上传完成所对应的主机与目录，丢弃过期响应。文件下载沿用现有 IPC 和 WebView，目录下载使用独立临时归档并在结束时尝试清理。 |
| `src/pages/sftp/SftpSidebar.tsx` | 提供当前窗格的选机与会话切换、原型四个路径书签及上传队列入口。路径作用于当前窗格的有效会话，队列入口可重新打开已隐藏的浮窗。 |
| `src/pages/sftp/workspace-state.ts` | 在应用进程内保存标签、左右窗格、活动窗格、路径及历史。首次进入接回 Rust 已连接会话，切换菜单后恢复视图并重读目录。 |
| `src/components/layout/SftpTransferWidget.tsx` | 沿用外壳挂载和现有上传队列。区分完成、失败和取消，聚合当前任务进度，支持隐藏、收起、重新展开和移除已结束记录。 |
| `.agent-pipeline/step-04-implementation.md` | 记录实施边界、证据和未验证项。 |

显式关闭全部 SFTP 会话沿用后端同时取消传输的行为，并先标记前端排队任务为取消。左右双栏对应两个会话，选择另一窗格正在使用的会话时交换位置。目录书签采用原型给出的固定路径，目录是否存在由现有 SFTP 接口返回。

本轮基于工作区已存在的后台上传改动，依赖 `AppLayout.tsx` 的浮窗挂载、`src/store/sftp-transfers.ts`、`src/lib/api/sftp.ts` 及现有 Rust 上传补丁。SFTP 页面与浮窗包含本轮前已有内容。实施前页面 Git blob 为 `4b9a5d0fd888d6a5280e287d142b870686ef82a4`，浮窗 Git blob 为 `231fac8aa66c233dc0b5f7f46cf7c1ed72104a6b`。

## 实际验证

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `git status -s`、`git branch --show-current`、`git rev-parse HEAD`、`git log -1 --format='%h\|%ar\|%s' -- <拟改文件>` | 0 | 修改前核对分支、待处理文件和最近提交。SFTP 页面最近提交为 `e1b32ec`，浮窗当时为未跟踪文件。 |
| `pnpm exec tsc --noEmit` | 0 | 最终 TypeScript 检查通过。中间轮报告 `TS2783`，已修正下载请求里的重复 `serverId`。 |
| `pnpm build` | 0 | 最终 Vite 构建转换 5230 个模块并生成 `dist`。JS 分块触发 500 kB 体积提示。中间轮因同一 `TS2783` 未进入 Vite。 |
| PowerShell `@' … '@ \| node`，标准输入为临时隔离断言脚本 | 0 | 使用 TypeScript 转译实际 Zustand store 与组件，注入模拟 SFTP IPC，并用 React 静态渲染核对浮窗、侧栏。通过会话接回、双栏交换、路径历史、延迟建连、双任务并发、上传目标、隐藏后任务继续、定向目录版本、失败、重试和取消。 |
| `git diff --check -- src/pages/sftp/index.tsx` | 0 | 本步已跟踪页面通过。 |
| `git diff --check` | 2 | 全工作区命中已有 `docs/remote-ops-ai-prototype.html` 的 4 处行尾空白。 |
| PowerShell `Get-FileHash -Algorithm SHA256`、严格 UTF-8 解码、`git diff --cached --name-only` 和 `git rev-parse HEAD` | 0 | 其余 45 个既有工作区条目与实施前一致。4 个实施源码文件为 UTF-8 无 BOM 且无行尾空白。暂存区为空，HEAD 保持第 03 步提交。 |

## 未验证

- 当前工具目录缺少项目任务系统的 `list_project_tasks`、`scan_project_tasks` 和 `resolve_and_start_task`。Windows Tauri 窗口、默认及最小尺寸、亮暗色、侧栏折叠交互、路由前进后退、浮窗拖动及截图对照待独立实测。
- 真实 SSH 与 SFTP 会话、主机指纹确认、凭据读回、原生文件对话框和外部拖放、下载文件字节及临时归档清理、断网与远端取消时序待隔离主机实测。隔离断言中的 IPC 为模拟响应。

已参考 `ui-frontend`、`store-management` 和 `file-storage`。首批在此停下，未暂存、提交或推送。


## B1 定向返工

独立验收记录的会话回退已修复，待独立复验。直达定位在 SFTP 页面卸载后仍保留已处理的 React Router 历史条目 key。回到已处理的条目时继续使用进程内工作区的当前窗格和会话。资产页再次直达会创建新 key，仍会定位指定主机。功能改动仅在 `src/pages/sftp/index.tsx`。

扩展独验夹具的副本位于 `%TEMP%/opspub-step04-b1-b5fd4974/`，保留 `run-review.cjs`、`sftp-fixture.tsx`、日志和截图。从仓库根目录执行以下命令。PowerShell 中先设 `$runner = Join-Path $env:TEMP 'opspub-step04-b1-b5fd4974/run-review.cjs'`。修复后复跑前清除 `$env:SFTP_FIXTURE_BASELINE`。对照组使用仅在夹具打包时载入的 `sftp-page-before.tsx`，其 Git blob 与独验记录的 `607e85d00431f16a61ba90f0d6fbe30a664d2665` 一致。

| 实际命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `$env:SFTP_FIXTURE_BASELINE='1'` 后分别运行 `node $runner route-back` 和 `node $runner route-back-dual` | 1、1 | 亮色 1440×900 和暗色 1100×700 均复现后退选回 A。见 `route-back-baseline.log`、`route-back-dual-baseline.log`。 |
| `node $runner route-back` | 0 | 两组均通过资产页直达 A、切换 B 至 `/var/log/nginx`、切菜单、后退恢复 B。再次直达 A 正常。随后在两条已处理的历史记录间前进、后退，仍保持 B。见 `route-back-final.log`。 |
| `node $runner route-back-dual` | 0 | 两组均通过双栏会话 ID、路径和可见文件断言。B 位于左栏或活动右栏时均正确恢复，A 保留 `/opt/ops-stacks`。未增加建连调用。见 `route-back-dual-final.log`。一次夹具启动遇到 Edge 端口文件 `EBUSY`（退出 1），补充端口就绪重试后通过，详见 `route-back-dual-runner-ebusy.log`。 |
| `node $runner normal`、`node $runner selection-path` | 0、0 | 两组通过既有夹具的普通菜单返回、目录隔离、上传队列和选机检查。见 `normal-after.log`、`selection-path-after.log`。 |
| `pnpm exec tsc --noEmit` | 0 | 类型检查通过。 |
| `pnpm build` | 0 | 生产构建通过，有 JS 分块体积提示。 |
| `git diff --check -- src/pages/sftp/index.tsx` | 0 | SFTP 页面补丁通过空白检查。 |
| PowerShell `Get-FileHash -Algorithm SHA256`、`git status --porcelain=v1 -uall`、`git diff --cached --name-only`、`git rev-parse HEAD` | 0 | 其余 49 个既有条目与返工前一致，暂存区为空，HEAD 保持第 03 步提交。 |

本轮浏览器使用模拟 Tauri IPC。原生 Windows Tauri/WebView2 的导航、真实 SSH/SFTP 及本报告上一节列出的原生文件与传输检查仍未验证。参考了 `bug-detective`、`test-development` 和此前已加载的 `store-management`。未暂存、提交或推送。

