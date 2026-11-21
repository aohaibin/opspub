# 第 07 步 · 批量模块迁移实现回执

实现已交付，待独立验收。基于 `opspub` 的 `1b1910a`，对照 `.agent-pipeline/state.json` 第 07 步、`baseline.md` 批量条目、`review-checklist.md` 和新版原型第 2879、7343–7612 行。

## 实施范围

| 批次 | 文件 | 行为 |
| --- | --- | --- |
| 导航与选机 | `src/pages/batch/index.tsx`、`components/BatchHosts.tsx`、`batch.css` | 复用公共工作区的自动化中心、二级「批量执行与下发」和顶部路径。保留 `#/batch` 深链及服务器页的 `location.state.serverIds`。目标区置于命令表单下方，与结果区并列。预选按历史条目恢复，服务器加载后过滤重复、失效和不受支持的目标。Linux SSH 资产允许跨搜索、跨分组多选，加载失败可重试。 |
| 确认与结果 | `src/pages/batch/index.tsx`、`components/BatchResults.tsx`、`types.ts`、`batch.css` | 确认框显示实际目标及命令。复用并发 10、滚动批次 3、串行 1 与失败即停。区分等待、执行中、成功、失败和跳过，逐机显示标准输出、标准错误、退出码或 IPC 错误。保留单机重试、按上次目标和参数重跑、清空和复制。切页后已下发的请求由后端继续处理，页面停止下发后续批次。 |

执行沿用 `batchApi.executeTarget` → `execute_batch_target` → `BatchService`，后端负责命令校验、主机指纹、系统凭据和审计。人工执行沿用用户确认，AI 草稿沿用 `generate_batch_command`，生成后由用户检查及确认。现有人工执行链路与 Reeve MCP 的 AI 审批是两个入口。本次涉及的仓库写入为上述五个批量前端文件及本回执。

## 验证记录

| 实际命令 | 退出码 | 证据 |
| --- | ---: | --- |
| `git status -sb`、`git branch --show-current`、`git log -6 --oneline`；对拟改文件逐个执行 `git log -1 --format='%ar\|%s' -- <file>` | 0 | 修改前批量五文件在工作树中干净，最近均为三周前的「完善巡检批量与技能功能」。本步回执在创建前不存在。 |
| `pnpm exec tsc --noEmit` | 0 | TypeScript 检查通过。 |
| `pnpm build` | 0 | Vite 7.3.1 转换 5230 个模块。最终产物为 `dist/assets/index-F8HW5sm3.css`、`dist/assets/index-ClglY1h6.js`。仍有原有的 JS 分块压缩后超过 500 kB 提示。 |
| `node "$env:TEMP/opspub-step07-batch/run-isolated.cjs" batch \| Tee-Object -FilePath "$env:TEMP/opspub-step07-batch/attempt-01-results.log"; exit $LASTEXITCODE` | 1 | 初次夹具把 DOM 中已关闭的片段弹窗当作执行确认框。改用确认框内的目标列表定位后通过。 |
| `node "$env:TEMP/opspub-step07-batch/run-isolated.cjs" batch \| Tee-Object -FilePath "$env:TEMP/opspub-step07-batch/results.log"; exit $LASTEXITCODE` | 0 | Edge 无头在亮暗色 × 1440×900 / 1100×700 四种组合各通过 6 组场景，共 24 组。 |
| `git diff --check -- src/pages/batch`、`git diff --cached --name-only` | 0 | 补丁空白检查通过，Git 给出 LF/CRLF 提示。暂存区为空。 |
| `git diff --binary -- . ':(exclude)src/pages/batch' \| git hash-object --stdin` | 0 | 批量模块外已跟踪差异前后哈希一致，均为 `3a4b3be0374b8635feeab5e1434a7ec54581cc8a`。 |

从项目根目录运行上述 Node 命令可复测。夹具使用仓库已安装的 Vite/esbuild 和本机 Edge，加载实际 React 路由、组件和 `dist/assets` 中的生产 CSS。数据为合成资产，Tauri IPC 与剪贴板由夹具模拟。浏览器通过离线 HTML 加载，页面 CSP 禁止网络请求。夹具与证据位于 `C:/Users/ao/AppData/Local/Temp/opspub-step07-batch/`。

- `batch-fixture.tsx`、`run-isolated.cjs` 是可复跑源文件。
- `results.log` 记录每组验证。覆盖旧路由、自动化域与二级高亮、服务器入口预选、浏览历史、筛选叠加和取消勾选、无效目标过滤与加载重试、草稿及片段。
- 结果用例断言取消确认和超长命令不产生执行 IPC，核对实际目标 ID、命令与超时参数，覆盖超时、非零退出、失败即停的跳过数、复制内容、单机重试、重跑快照和切页隔离。
- `step-07-batch-{light,dark}-{1440x900,1100x700}.png` 是四组测试的最终画面。

## 未验证

- Windows 原生 Tauri / WebView2 窗口、系统剪贴板及真实窗口控制。本会话工具目录未提供项目任务的登记、扫描和启动接口。
- 真实 SSH、凭据和主机指纹校验、实际服务器端超时、模型请求、审计落库，以及 Reeve MCP 的真实审批通过、拒绝与超时。
- 服务器收藏写入沿用现有接口，本次离线用例覆盖选机与批量下发链路。

参考技能 `ui-frontend`、`architecture-design`、`api-development`、`theme-system`、`check`、`test-development`。未暂存、提交或推送。
