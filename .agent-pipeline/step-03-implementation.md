# 第 03 步首批 · 终端二级栏

**结论：首批已实现，前端构建和合成数据隔离检查通过，建议进入独立验收。** Windows Tauri 窗口及真实 SSH、凭据和审批流程待验。

实际工作目录为 `D:/itemWork/bushu/yunwei/template-tauri`，分支 `opspub`，HEAD `4c3f89c`。第 01、02 步提交及现有工作区补丁保留。开始与结束时核对 `Router.tsx`、`AppLayout.tsx`、`src/store/index.ts` 的文件哈希，均与开始时相同。暂存区为空，未创建提交或推送。

## 实现

- `src/pages/terminal/TerminalSidebar.tsx` 和 `src/pages/terminal/terminal-workspace.css` 通过公共插槽接入终端二级栏。会话按 ID 切换，高亮与横向标签同步。活跃计数取实际已连接会话。离线会话显示状态并仍可查看。服务器选择采用可搜索的 Ant Design 下拉，使用纳管 SSH 资产，排除仅 RDP 的条目。
- `src/pages/terminal/index.tsx` 沿用工作区已有终端保活接线。首次挂载恢复 Rust 会话，资产列表传入的 `location.state.serverId` 等待资产和会话恢复，再复用可用会话或走现有连接和凭据验证流程。等待直达时显示加载提示。公共侧栏折叠后可从原工具栏选择服务器。
- 切离终端时卸载视图和浮层，保留会话列表、当前标签、输出缓冲及事件订阅。返回终端刷新资产列表并恢复所选标签。现有 SSH、凭据和审批接口未改动。分屏、输入和 Ctrl+K 留在第二批。

## 实际验证

| 命令或检查 | 退出码 | 证据 |
| --- | --- | --- |
| `git status -s`、`git branch --show-current`、`git log -1 --format='%ar\|%s' -- src/pages/terminal/index.tsx` | 0 | 终端页改动前无未提交差异，最近提交距检查约 12 天。基线已有公共外壳终端保活补丁，本步沿用该接线。 |
| `pnpm.cmd exec tsc --noEmit` | 0 | 最终改动后无类型错误。 |
| `pnpm.cmd build` | 0 | Vite 7.3.1 转换 5,228 个模块，用时 47.85 秒。生成 `dist/assets/index-CfRgY5lp.css`、`dist/assets/index-bg19w4uQ.js`。保留既有大分块告警。 |
| `node "$env:TEMP/opspub-step03-Lq4pQw/run-isolated.cjs"` | 0 | 离线 Edge HTML 夹具，以真实 React 页面、路由、二级栏、xterm 及最终构建的 CSS 运行。通过 Tauri 官方 mock 替换 IPC 和事件，所有资产和会话为合成值。亮色 1440×900、暗色 1100×700 各跑一遍。 |
| `git diff --check -- src/pages/terminal/index.tsx` | 0 | Git 仅提示其 Windows LF/CRLF 转换设置。 |
| `git hash-object src/Router.tsx src/components/layout/AppLayout.tsx src/store/index.ts`、`git diff --cached --name-only`、`git rev-parse --short HEAD` | 0 | 三个文件与开工哈希一致，暂存区为空，HEAD 为 `4c3f89c`。 |
| 可用工具目录检查 | 不适用 | 未提供 `list_project_tasks`、`scan_project_tasks` 或 `resolve_and_start_task`。没有启动项目服务或桌面应用。离线夹具的两个 Edge 进程已退出。 |

隔离检查两组均观察到以下结果。

1. 点击资产行 202 后，模拟服务器列表先返回，SSH 打开请求仍为 0。会话恢复后选中 202 的现有会话，侧栏显示 2 个活跃与 1 个断开状态。
2. 侧栏切到 101、横向标签切回 202，侧栏高亮、横向标签、终端窗格和全局服务器 ID 一致。折叠后二级栏为 `inert`、实际宽度收为 0，焦点回到顶栏开关，工具栏仍可打开选择器。展开后保留选中项。
3. 选中 101 后切到服务器资产页，终端内容和侧栏退出。此时注入 101 的输出及其他会话的异常状态。浏览器后退和普通菜单返回均保留 101，显示后台输出和异常状态，未重复恢复列表或建立连接。
4. 从资产行直达 303 时，已断开的旧会话未被当作可复用会话。模拟打开接口只收到 303。侧栏选择 606 时收到 606，选项排除 RDP，关闭 606 只发送该会话 ID 并移除相应侧栏项。
5. 模拟 505 缺少凭据时打开对应服务器的现有 SSH 验证窗。检查到实际下拉选项的视觉位置可命中，二级栏无横向溢出。

证据在 `%TEMP%/opspub-step03-Lq4pQw/`。可复跑脚本为 `run-isolated.cjs`、`fixture.tsx`，最终截图为 `fixture-light-1440x900.png`、`fixture-dark-1100x700.png`。夹具调试期间，三类准备或断言问题已修正，包括 esbuild 对 Vite 专用导入的处理、把下拉隐藏 DOM 误计为会话，以及验证窗关闭后按可见性检查。另一次暗色检查在首个终端视图尚未稳定时切换超时。最终版增加直达等待显示并等待视图解除隐藏，两组完整复跑均退出 0。

## 待验与裁决

- Windows Tauri/WebView2 默认和最小窗口、真实 PTY、登录凭据、指纹及审批未验证。建议总控在具备项目任务工具的独验会话内使用隔离资产补测。
- 本批跨菜单保留会话和缓冲，返回时重建 xterm 视图。原滚动位置、选区、光标和全屏交互程序的恢复未验证，建议纳入第二批终端交互验收。
- 依赖开工前已存在于工作区的 `Router.tsx` 与 `AppLayout.tsx` 终端保活接线。若后续裁决按补丁单独交付，建议纳入两处接线中的终端相关变更，并在 `AppLayout.tsx` 保留现有 SFTP 浮窗补丁。这里没有修改这两个文件。

参考技能为 `ui-frontend`、`store-management`、`theme-system` 和 `test-development`。

## 首批返工中间复验

**结论：独立验收的 B1、B2 已在合成数据中复验通过。** 工作目录仍为 `D:/itemWork/bushu/yunwei/template-tauri`。本轮代码改动限于 `src/pages/terminal/index.tsx`。先订阅两类终端事件，再请求首次会话快照。按会话 ID 暂存等待期间的输出与最后状态，合并输出、状态和消息后才允许直达挑选会话。快照末尾若已包含事件块，仅按完整事件边界去重。结束状态保留在旧标签，直达走原连接流程，缺凭据时打开原 SSH 验证窗。

| 实际命令 | 退出码 | 结果 |
| --- | --- | --- |
| `node "$env:TEMP/opspub-step03-review-cba0c8ad/run-adversarial.cjs" restore-race` | 修复前 1，修复后 0 | 确认监听后先发 Alpha 输出和 Beta `closed`，再返回较早快照。修复前两组均为 `event kept=false`、`status=connected`、`opens=[]`。修复后两组均为 `event kept=true`、`status=closed`、`opens=[202]`。 |
| `node "$env:TEMP/opspub-step03-fix-EjDeZx/run-adversarial.cjs" restore-race` | 0 | 最终代码两组均保留快照和先到输出。旧 Beta 显示 `closed` 与断开事件消息，模拟重连仅请求 202，一条新会话显示为已连接。 |
| `node "$env:TEMP/opspub-step03-fix-EjDeZx/run-adversarial.cjs" restore-extended` | 0 | 两组均验证快照已有的输出块只显示一次，后续两块按到达顺序显示，仅部分前缀相同的块完整保留。Beta 最后的 `error` 和消息保留，目标 202 仅请求一次并进入原 SSH 验证窗。较早的 `connected` 事件未恢复快照中已关闭的 303。 |
| `node "$env:TEMP/opspub-step03-Lq4pQw/run-isolated.cjs"` | 0 | 最终代码复跑首批正常流程。亮色 1440×900、暗色 1100×700 均通过，包括正常复用、折叠、跨页恢复、选机和凭据窗。 |
| `pnpm.cmd exec tsc --noEmit` | 0 | 最终代码无类型错误。 |
| `git diff --check -- src/pages/terminal/index.tsx` | 0 | Git 仅提示 Windows LF/CRLF 转换设置。 |
| `git diff --cached --name-only`、`git rev-parse --short HEAD` | 0 | 暂存区为空，HEAD 为 `4c3f89c`。 |

返工夹具与四张复验截图在 `%TEMP%/opspub-step03-fix-EjDeZx/`。Edge 仅打开离线合成夹具，未启动项目服务或 Tauri 窗口。真实 SSH、凭据与审批继续待验。本轮验证使用现有构建的 CSS，并从最终 TypeScript 源码打包夹具。现有 IPC 输出没有序号或偏移，合并以完整块的文本重叠判断。若独立的新输出块与快照末尾完全相同，仅凭现有字段无法确认它是否是新的重复输出。

本轮参考 `bug-detective`、`test-development`，未改分屏和快捷键。未暂存、提交或推送。

## 首批最终返工

**B1、B2 的合成数据复验通过，建议独立复核。** 实际工作目录为 `D:/itemWork/bushu/yunwei/template-tauri`，HEAD 为 `4c3f89c`。代码改动仅在 `src/pages/terminal/index.tsx`。以下为最终行为。

- **B1**。先订阅，再取首次快照。等待期间按会话 ID 缓存输出，并在恢复时按接收顺序追加到对应快照。沿用现有缓冲上限。当前 IPC 没有序号或偏移，相同文本也可能是独立的新输出，因此保留它。若快照实际已包含同一事件，文本可能重复显示。
- **B2**。恢复时先应用已收到的断开或错误状态，再处理直达。直达时清理目标服务器的已结束标签和本地缓冲，忽略旧会话 ID 的迟到事件。后端已结束的会话无需再次发送关闭请求。目标无可用会话时，仅对该服务器发起连接，缺凭据则进入原 SSH 验证窗。其他服务器的会话仍可查看。

| 实际命令 | 退出码 | 最终结果 |
| --- | --- | --- |
| `node "$env:TEMP/opspub-step03-final-1K8Ie3/run-adversarial.cjs" restore-race` | 0 | 亮色 1440×900、暗色 1100×700 均保留 Alpha 快照与先到的事件输出。旧 Beta 的 `closed` 先于过期快照到达，重连悬挂期间旧标签已从两处消失。注入迟到事件后也未出现，完成时只有一条新会话，唯一打开请求为 202。 |
| `node "$env:TEMP/opspub-step03-final-1K8Ie3/run-adversarial.cjs" restore-extended` | 0 | 两组均保留快照和新增事件中恰好相同的两条输出，后续事件顺序正确。Beta `error` 后两处移除旧标签，唯一目标 202 进入 SSH 验证窗。303 的断开会话和输出保留，可继续查看。 |
| `node "$env:TEMP/opspub-step03-Lq4pQw/run-isolated.cjs"` | 0 | 两组均通过正常直达复用、侧栏与标签切换、折叠、跨菜单输出恢复、选机及验证窗。 |
| `pnpm.cmd exec tsc --noEmit` | 0 | 无类型错误。 |
| `git diff --check -- src/pages/terminal/index.tsx`、`git diff --cached --name-only`、`git rev-parse --short HEAD`、`(Get-Location).Path` | 0 | Git 仅提示原有 LF/CRLF 转换设置。暂存区为空，工作目录和 HEAD 已复核。 |

夹具及入口截图在 `%TEMP%/opspub-step03-final-1K8Ie3/`。离线夹具从最终源码打包，IPC 和事件均使用合成数据。本轮复用之前构建的 CSS。生产构建本轮未复跑，Windows Tauri/WebView2、真实 SSH、系统凭据、指纹与审批仍待实测。未修改分屏或快捷键，未暂存、提交、推送或派发后续批次。

## 第三轮返工

**最新独验的 B1、B2 均在双主题离线夹具中通过。** 实际工作目录为 `D:/itemWork/bushu/yunwei/template-tauri`，分支 `opspub`，HEAD `4c3f89c`。

- **B1**。延用现有终端命令和事件，增加会话内递增的 `sequence` 和快照的 `outputSequence`。Rust 在同一条会话记录的写锁内更新输出与序号。首次恢复及新建连接返回快照时，前端只重放快照序号以后的事件，并按序号处理缓存中的乱序与重复投递。相同文本如果属于不同序号会完整保留。现有历史上限继续生效。
- **B2**。同一会话 ID 收到 `closed` 或 `error` 后，后到的 `connected` 不能替换状态和提示。此约束覆盖恢复、实时监听及打开连接的返回值。资产直达根据最新已观察状态清理目标的已结束标签和缓冲，再按现有流程重连或验证凭据。

### 实际验证

从仓库根目录执行。下表中的 `$roundDir` 为 `Join-Path $env:TEMP 'opspub-step03-round3-SaSTHG'`。每个离线用例均跑亮色 1440×900、暗色 1100×700。夹具使用当前 TSX，IPC、事件和资产均为合成数据。

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `node "$env:TEMP/opspub-step03-rereview-cb835065/run-adversarial.cjs" restore-overlap-cap` | 1（修复前） | 两组均从 700,018 字符截到 600,000，历史首标记丢失，第一个事件标记出现两次。 |
| `node "$env:TEMP/opspub-step03-rereview-cb835065/run-adversarial.cjs" restore-late-connected` | 1（修复前） | 两组均显示旧会话 `connected`，没有发起重连。 |
| `node (Join-Path $roundDir 'run-adversarial.cjs') restore-overlap-cap` | 0 | 两组输出与 700,018 字符快照逐字一致，首标记在，第一个事件只出现一次。追加一条实时事件后，延迟到达的快照内事件和重复实时事件均未改变应有的缓冲。 |
| `node (Join-Path $roundDir 'run-adversarial.cjs') restore-late-connected` | 0 | 依次收到 `closed`、旧 `connected`、过期快照。旧会话从侧栏及横向标签消失，唯一打开请求为 202。等待期间迟到的旧事件被忽略，最终仅显示新会话。 |
| `node (Join-Path $roundDir 'run-adversarial.cjs') restore-race` | 0 | 先到而未被快照覆盖的输出保留。新连接响应之前的输出中，快照已含的块只显示一次，后续块继续显示。 |
| `node (Join-Path $roundDir 'run-adversarial.cjs') restore-extended` | 0 | 不同序号的相同文本均保留，等待快照时的乱序块按源端序号重放。错误目标清理后仅请求 202，并进入该服务器的原 SSH 验证窗。 |
| `node (Join-Path $roundDir 'run-adversarial.cjs') flow` | 0 | 正常复用、并发重复打开、关闭目标、多次菜单切换和后台输出均通过。恢复完成后的旧 `connected` 未回退 `closed` 或断开提示。 |
| `pnpm.cmd exec tsc --noEmit` | 0 | 最终类型检查通过。中间运行曾因侧栏状态文案映射缺少 `closing` 退出 1，补齐后复跑通过。 |
| `cargo test --offline --manifest-path src-tauri/Cargo.toml --lib services::terminal::tests` | 0 | 5 项通过。新增单测校验历史截断后序号仍递增，以及快照和事件的 JSON 序号字段。保留既有 `AlertRule` 未使用告警。 |
| `pnpm.cmd build --outDir "$env:TEMP/opspub-step03-round3-SaSTHG/dist-final" --emptyOutDir` | 0 | 5,228 个模块，42.49 秒。保留既有大分块告警。 |
| `git diff --check -- src/pages/terminal/index.tsx src/types/terminal.ts src-tauri/src/models/mod.rs src-tauri/src/services/terminal.rs`、`git diff --cached --name-only`、`git rev-parse --short HEAD` | 0 | Git 仅提示 Windows LF/CRLF 转换设置，暂存区为空。现有公共路由和外壳哈希一致，Rust 模型中的 SFTP 既有补丁保留。 |

复验夹具、每个用例的日志和两种视口截图位于 `%TEMP%/opspub-step03-round3-SaSTHG/`。夹具初次复跑 B2 曾因模拟重连未保持等待而把已完成的新会话判成旧会话，改为显式挂起响应后，最终两组均退出 0。

**未验证**。真实 Windows Tauri/WebView2 与实际 IPC 调度、SSH/PTY 连接、系统凭据、指纹和审批继续待验。验证未启动桌面应用或连接服务器。IPC 的序号字段由同一版本的前后端共同提供，混用旧后端未验证。本轮未修改分屏或快捷键，未暂存、提交、推送或派发后续验收。参考 `bug-detective`、`test-development`、`rust-fundamentals`、`json-serialization`。

## 第四轮返工

**B1 的跨快照乱序反例在亮暗两组通过。** 实际工作目录为 `D:/itemWork/bushu/yunwei/template-tauri`，分支 `opspub`，HEAD `4c3f89c`。本轮代码只改 `src/pages/terminal/index.tsx` 的输出合并，Rust、IPC 和 B2 的状态判定沿用第三轮。

每个会话使用同一个输出缓冲处理恢复和实时事件。快照先确定已覆盖序号，之后只在下一个连续序号可用时推进。缺口后的事件留在队列，待缺口补齐后依序显示。相同序号至多合并一次，不同序号的相同文本保留。先去除快照已覆盖的事件，再执行原有 750,000 字符触发、约 600,000 字符保留的窗口限制。

### 实际验证

从仓库根目录执行。下表的 `$out` 为 `Join-Path $env:TEMP 'opspub-step03-round4-lH6exa'`。离线夹具从当前 TSX 打包，资产和 IPC 均为合成值。每个浏览器用例各运行亮色 1440×900、暗色 1100×700。

| 命令 | 退出码 | 实际结果 |
| --- | --- | --- |
| `node "$env:TEMP/opspub-step03-round3-review-e7f122f4/run-adversarial.cjs" restore-gap-late` | 1（修复前） | 两组均为 `sameTextCount=2 expected=3`，复现独验反例。 |
| `node (Join-Path $out 'run-adversarial.cjs') restore-gap-late` | 0 | `seq 3 → 快照 seq 1 → seq 2`，两组均为 `sameTextCount=3 sourceOrder=true opens=[]`。 |
| `node (Join-Path $out 'run-adversarial.cjs') restore-gap-forward` | 0 | `seq 2 → 快照 seq 1 → seq 3`，两组输出与逆序用例一致。 |
| `node (Join-Path $out 'run-adversarial.cjs') restore-gap-live` | 0 | 快照之后先收 seq 3 再收 seq 2，三条均依序显示。三个缺口用例均注入了快照已覆盖的事件和重复序号。 |
| `node (Join-Path $out 'run-adversarial.cjs') restore-overlap-cap` | 0 | 700,018 字符快照逐字保留。跨快照的两个新块补齐后，实际窗格输出逐字等于快照加这两个块。历史首标记保留，已覆盖和重复事件均只出现一次。 |
| `node (Join-Path $out 'check-output-window.cjs')` | 0 | 直接运行源码的缓冲函数。seq 2 缺失后累计收到 760,000 字符时，按序保留最近 600,000 字符，缓冲继续推进。 |
| `node (Join-Path $out 'run-adversarial.cjs') restore-race`、`restore-extended`、`restore-late-connected`、`flow`（分别执行） | 均为 0 | 新连接快照前的输出、相同文本、关闭后迟到状态、目标重连和凭据窗、跨菜单后台输出均通过回归。 |
| `pnpm.cmd exec tsc --noEmit` | 0 | 无类型错误。 |
| `pnpm.cmd build --outDir "$env:TEMP/opspub-step03-round4-lH6exa/dist-final" --emptyOutDir` | 0 | 5,228 个模块，用时 1 分 5 秒。有既有大分块告警。 |
| `git diff --check -- src/pages/terminal/index.tsx`、`git diff --cached --name-only`、`git rev-parse --short HEAD` | 0 | Git 仅提示原有 LF/CRLF 转换设置。暂存区为空，HEAD 保持 `4c3f89c`，Rust 和 IPC 类型文件的哈希与本轮开始一致。 |

夹具、日志和截图位于 `%TEMP%/opspub-step03-round4-lH6exa/`。缺口持续未补齐且未达到历史窗口上限时，后续块继续等待，以保留终端控制序列的顺序。真实 Windows Tauri/WebView2、实际 IPC 丢包或延迟、真实 SSH、凭据和审批仍待实测。本轮没有启动桌面应用，未暂存、提交、推送或派发后续任务。参考 `bug-detective` 和 `test-development`。
