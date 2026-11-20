# 第 04 步 SFTP 首批 · 独立验收

## B1 定向修复复验（最新，2026-11-20）

**结论：本次定向复验通过，剩余阻断 0；B1 可关闭。非阻断遗留 N1 保留。** 单栏和双栏返回均恢复最后选择的 B，再次从资产页新直达 A 仍正常定位 A；双主机目录和上传队列回归通过。以下首轮阻断结论保留为历史，以本节为当前裁决依据。

已先读取最新实施报告“B1 定向返工”和本报告首轮记录，再检查修复源码、实现方最终日志与夹具。工作目录 `D:/itemWork/bushu/yunwei/template-tauri`，分支 `opspub`，HEAD `56fc3fb`，当前 SFTP 页面 Git 对象哈希 `4e993d556b152f819635f3fe2bb4269c1a51569d`。

### 阻断项

**无。B1 已解决，本轮没有找到新的阻断反例。**

1. **原反例**：实际点击资产页 A 的“在 SFTP 中打开”，进入该历史条目；在 SFTP 侧栏切到 B，进入 `/var/log/nginx`；切服务器菜单后后退，单栏两组均为 `ROUTE_BACK left=202:/var/log/nginx`。侧栏高亮、Store 会话 ID、路径和实际表格文件均为 B。
2. **双栏和活动窗格**：左 B `/var/log/nginx`、右 A `/opt/ops-stacks` 返回后保持；随后把 B 选到活动右栏，再切菜单后退，仍为左 A、右 B，`activePane=right`，侧栏选中 B，左右会话 ID、路径和可见文件一一对应。两种主题均通过 `RIGHT_ACTIVE Back restored B in the active right pane and A in the left pane`。
3. **新直达的对照**：再次从服务器资产行点击 A，Router 创建新历史 key，正常定位 A、保留其原目录并复用已有会话，没有额外 `open_sftp_session`。双栏时另一栏正确保留 B。
4. **重复历史反例**：新直达后再切回 B，反复在两条已消费的 SFTP 历史记录间前进、后退，包括不卸载页面的历史切换，仍保持用户最后选择的 B 和各栏文件；没有重复建连。

静态核对：`src/pages/sftp/index.tsx:96–97` 的模块级 `handledSftpEntries` 在页面卸载后仍保存已处理 key；`:403–410` 的直达 effect 在载入条件满足后只消费新 key。已处理条目不会覆盖进程内工作区，新资产跳转仍有不同 key，修复与实测一致。没有改变现有 workspace-state、上传 Store/API 或 Rust 行为。

### 本轮回归结果

- **双服务器不串台**：101 的上传目标固定为 `/opt/ops-stacks`，202 固定为 `/var/log/nginx`；两次并发 upload IPC 的主机和目录正确。101 完成只增加其路径版本并重读对应目录，202 的目录读取和版本不受该完成事件影响。
- **队列和后台任务**：第三个上传任务排队，取消后没有启动 upload IPC；隐藏浮窗、切菜单、注入后台进度、普通菜单返回后仍是原任务和两栏目录，没有重复上传或额外取消。
- **失败、重试、关闭**：错误文本保持可见；重试使用新 taskId 且仍指向 202 原目录。关闭 101 后旧目录响应不再恢复该标签或混入 202；全部关闭取消活动上传，迟到进度不复活任务。
- **既有入口回归**：下载及临时归档的模拟 IPC 仍指向正确主机/路径；新服务器失败后重试、连续点击防重复、RDP 排除和模拟路径拒绝显示均保持通过。

### 独立执行与证据

先审阅实现方 `%TEMP%/opspub-step04-b1-b5fd4974/` 下 `route-back-final.log`、`route-back-dual-final.log`、`normal-after.log`、`selection-path-after.log`，最终读数与实施报告一致。目录中的 baseline/before/部分 after 调试失败日志未当作最终通过证据；实现方另记录的 Edge 端口文件 EBUSY 是 runner 准备问题。

独验将该目录的 `run-review.cjs`、`sftp-fixture.tsx` 原样复制到 **`%TEMP%/opspub-step04-rereview-47eb1deb/`**，明确清除 `SFTP_FIXTURE_BASELINE` 环境变量，以当前真实源码打包。没有使用旧页面替换插件，没有修改测试断言。各浏览器命令均跑亮色 1440×900、暗色 1100×700：

| 实际命令（均为 `node <独验目录>/run-review.cjs <case>`） | 退出码 | 结果 |
| --- | --- | --- |
| `route-back` | 0 | 两组后退恢复 B；新资产直达 A 正常；多次前进后退仍保留最后选择与文件。 |
| `route-back-dual` | 0 | 两组左/右 B 的返回均同步活动窗格、会话 ID、书签路径和实际文件；新直达正确交换两栏，无额外建连。 |
| `normal` | 0 | 两组目录隔离、侧栏折叠、普通菜单恢复、双任务及排队、后台进度、定向刷新、下载、错误重试和关闭时序均通过。 |
| `selection-path` | 0 | 两组失败连接不产生假标签；重试/连续点击只新增一个有效会话；模拟路径拒绝及恢复仍可见。 |

汇总 `results.log` 包含四个用例名、实际读数和每次 `EXIT=0`。对应八张截图为 `adversarial-<case>-<theme>-<width>x<height>.png`。旧报告副本 `previous-review.md`。本轮只运行这些离线夹具，沿用现有构建 CSS，从当前 TSX 打包；未重复生产构建、类型检查或 Rust 检查。

### 非阻断项与未验证项

- **N1 仍保留**：查看本轮 `adversarial-route-back-dual-light-1440x900.png`，亮色下部分标题、路径和文件名仍偏浅，属于首轮已确认的样式遗留；不在本次导航修复内，未发现新的非阻断功能缺陷。
- 真实 Windows Tauri/WebView2、原生窗口/文件对话框/外部拖放、实际 IPC 调度和导航宿主差异未验证。浏览器 HashRouter 前进后退通过不等于原生 Windows 验收完成。
- 真实 SSH/SFTP、系统凭据、主机指纹、实际上传下载字节、文件落盘/校验和、网络断开与远端取消、临时归档真实清理仍未验证。mock 的成功、失败和进度只证明当前前端处理逻辑。
- 所有资产为合成 `.invalid` 域名，上传使用虚构路径；没有访问真实主机、文件或凭据，没有启动项目服务或 Tauri 应用。

### 变更隔离及停止

复验前后十个关键文件的哈希一致：SFTP 页面、workspace-state、侧栏、浮窗、上传 Store/API、AppLayout、Rust SFTP command/service/transfer。HEAD 保持 `56fc3fb`，暂存区为空。仓库仅更新本报告，未修改业务代码、state.json、暂存、提交、推送或派发任务。已参考 `check`、`test-development`。**建议关闭 B1，交总控裁决；本轮到此停止。**

## 首轮记录（历史）

**结论：阻断，建议本轮暂不通过。阻断 1 项，非阻断遗留 1 项。** 双主机目录、上传队列和普通菜单返回的离线检查通过；浏览器后退返回时会重新执行旧直达目标，未恢复用户最后选择的当前会话。真实 Windows/SFTP/字节传输仍未验证。

日期：2026-11-20。工作目录 `D:/itemWork/bushu/yunwei/template-tauri`，分支 `opspub`，HEAD `56fc3fb`。已先读 `review-checklist.md`、基线 SFTP 行及工作区重叠说明、最新 `step-04-implementation.md` 和 `state.json` 第 04 项，再检查源码并用合成数据找反例。实现报告的前端构建和静态隔离检查记录已阅读；其中临时 stdin 断言未提供可复跑文件或日志路径，本验收没有把它计为独立实测证据。

## 阻断项

### B1 · 浏览器后退返回 SFTP 时重放旧 serverId，覆盖当前会话选择

- **位置**：`src/pages/sftp/index.tsx:140–142,403–411`；进程内选择及路径保存在 `workspace-state.ts`。
- **复现**：用与资产直达相同的路由状态进入 SFTP，`location.state.serverId=101`；接回 Alpha（101）、Beta（202）两个合成会话。用户在侧栏切到 Beta，进入 `/var/log/nginx`；点击普通菜单进入服务器页，再使用浏览器后退返回刚才的 SFTP 路由。
- **预期**：恢复用户最后选择的 Beta 和 `/var/log/nginx`，不把已经消费过的直达动作再次执行。
- **亮暗两组实测**：`ROUTE_BACK server=101 path=/root expected=202:/var/log/nginx`，夹具断言退出 1。Beta 的路径仍存于 Store，但当前窗格被切回 Alpha；因此不是路径数据全部丢失，而是恢复后的当前目标错误。
- **原因**：页面切菜单会卸载；`handledRoute` 是组件内 `useRef`，重新挂载后回到 null。浏览器后退保留原路由的 `serverId=101` 及 location key，effect 又调用 `handleConnectServer(101)`，覆盖进程内已经保存的活动选择。
- **影响与建议**：本批“跨菜单返回恢复当前会话和左右目录”的当前目标恢复不完整，故列阻断。建议将直达消费标识与进程内工作区状态协调，区分一次新的资产直达和返回既有历史路由；修复后同时保留“新的直达能切到指定主机”和“返回不重放旧动作”。本轮未观察到真实跨主机写入，不将该导航反例描述为已经发生的远程误写。
- **证据**：`%TEMP%/opspub-step04-review-6fc943a4/route-back.log`，截图 `adversarial-route-back-light-1440x900.png`、`adversarial-route-back-dark-1100x700.png`。复跑 `node <证据目录>/run-review.cjs route-back`。

## 已通过的独立检查

本轮新建了离线浏览器夹具；实现方未留下可直接运行的浏览器夹具，因此没有伪称复跑其 stdin 脚本。夹具挂载真实 `App`、HashRouter、SFTP 页面、侧栏、Store 和全局浮窗，用 Tauri 官方 mock 接管 IPC/事件；资产为 101/202/303 及 `.invalid` 域名，上传只使用虚构本地路径。两种组合为亮色 1440×900、暗色 1100×700，均在独立 headless Edge 配置目录运行。没有打开真实服务器。

| 检查 | 实际结果 |
| --- | --- |
| 会话接回与新服务器选择 | 接回 101/202，仅显示已连接 SSH 会话；选机入口排除 RDP。303 首次模拟连接失败时错误可见、没有假成功标签；重试加连续两次点击只产生一次成功 open 和一个有效标签。 |
| 双栏与书签 | 左栏 101 到 `/opt/ops-stacks`，右栏 202 到 `/var/log/nginx`，两栏分别显示对应服务器的合成文件。焦点切右栏后书签作用于右栏。收起侧栏宽度到 0、再展开，两个路径和选择保持。 |
| 上传目标与重复上传 | 从两个窗格分别点击上传，IPC 捕获的目标分别为 `101:/opt/ops-stacks`、`202:/var/log/nginx`，未串台。两任务同时运行；第三个文件排队，取消并移除后从未启动对应 upload IPC。 |
| 后台任务及浮窗 | 隐藏浮窗、切到服务器菜单后向两个任务注入进度，Store 分别继续到 60/70。普通菜单返回保留双栏、当前会话和左右路径；重新打开队列浮窗后仍是原任务，没有额外上传或取消调用。 |
| 完成后的定向刷新 | 101 上传成功仅增加 `101:/opt/ops-stacks` 的目录版本和一次目录读取；202 的版本/目录读取次数未被此完成事件改变。刷新键生产和消费均含 serverId 与路径。 |
| 失败、重试和错误提示 | 202 上传失败文本出现在浮窗；重试采用新 taskId，仍是 202 原目录。目录读取拒绝只显示在对应窗格，重新刷新成功后错误清除。 |
| 关闭与迟到响应 | 挂起 101 的目录响应，关闭其标签后再返回旧结果，旧标签未复活、202 未显示旧文件。全部关闭会取消活动上传并清空会话；取消后迟到的进度未把任务恢复成进行中。 |
| 下载入口 | 点击 202 文件下载按钮只调用 202 和对应远程路径，并触发合成 Blob 下载入口。目录下载采用独立 `.opspub-download-<uuid>.tar.gz`，模拟 archive/download/delete 的服务器和临时路径一致。没有验证真实文件落盘或远端清理。 |
| 路径越界边界 | 静态核对 Rust `normalize_path`（`services/sftp.rs:572–587`）拒绝 `..` 路径段，`validate_name` 拒绝空名、`.`、`..` 及路径分隔符。夹具通过 Store 注入 `303:/root/../etc`，模拟同一校验规则的拒绝，错误显示在 303 窗格，回 `/root` 后恢复。该项不代表实际 Rust/远端越界测试。 |

## 非阻断项

### N1 · 亮色文件名、目录名及标题对比度偏低（既有样式遗留）

亮色 1440×900 的实际截图中，浅底上的文件名、目录名和部分标题接近白色，明显弱于表头和侧栏；暗色下可读。例见 `adversarial-route-back-light-1440x900.png`。相关 `src/pages/sftp/index.tsx:1623–1624` 仍使用 `text-slate-100`、`text-slate-200`，标题使用 `text-white`；已用 `git show HEAD:src/pages/sftp/index.tsx` 确认文件名的两组类名在本步前已存在。

建议在主题修整中使用已有正文设计令牌并补看真实窗口。该项为已观察到的视觉遗留，本轮不作为新增功能阻断，也不改变 B1 的裁决。

## 原型对照与证据

原型 `docs/ops-prototype-direction2-workspace.html` SHA-256 为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D`。已静态对照 2746 起 SFTP 二级栏：四个路径 `/opt/ops-stacks`、`/var/log/nginx`、`/etc/nginx/conf.d`、`/root` 及传输状态均已接入真实状态；下载/双栏操作位于实际文件管理器，浮窗失败与取消不会一律显示成功。没有采集原型渲染截图，不作逐像素一致结论。双栏和折叠行为的浏览器验证结果如上。

所有独验证据在 **`%TEMP%/opspub-step04-review-6fc943a4/`**：

| 最终命令 | 退出码 | 证据 |
| --- | --- | --- |
| `node <目录>/run-review.cjs normal` | 0 | `normal.log`；两组完整通过双栏、队列、普通菜单恢复、后台上传、定向刷新、下载、失败重试和关闭时序。 |
| `node <目录>/run-review.cjs selection-path` | 0 | `selection-path.log`；两组通过新服务器选择、失败重试、防并发重复及模拟路径拒绝的显示。 |
| `node <目录>/run-review.cjs route-back` | 1 | `route-back.log`；两组均复现 B1。 |

可复跑文件为 `sftp-fixture.tsx`、`run-review.cjs`，截图各场景亮暗各一张，共六张，命名 `adversarial-<case>-<theme>-<width>x<height>.png`。本轮沿用已有构建 CSS、从当前源码打包夹具，未重跑生产构建、TypeScript 或 Rust 检查。实现报告中的构建结果属于实现方回报。

夹具准备阶段曾因下载锚点拦截范围过宽而阻止菜单导航、消息定位误命中内联脚本文本，以及受控输入模拟未触发路径更新而超时；修正前两项后，正常/返回场景完成复跑；路径边界最终明确采用 Store 注入和模拟校验。上述准备问题不作为产品缺陷。

## 未验证与交付边界

- 真实 Windows Tauri/WebView2、默认/最小原生窗口、原生文件对话框、外部拖放、窗口拖动、实际前进后退的原生宿主差异未验证。浏览器折叠和 HashRouter 后退已有本轮证据。
- 真实 SSH/SFTP、主机指纹、系统凭据、字节上传下载、远端覆盖/取消/断网时序、文件落盘、校验和及临时归档清理未验证。模拟 IPC 的成功和进度不代表真实传输通过。
- 当前工具没有项目任务系统登记/扫描/启动接口；未启动项目服务或 Tauri 应用。只使用本次离线 Edge 子进程，runner 完成时退出其自行创建的进程；未终止其他会话进程。
- 本步依赖既有 AppLayout 浮窗、上传 Store/API 和 Rust 补丁。只检查当前组合行为，未暂存任何依赖补丁，也未裁决它们的提交拆分。

独验前后十个关键文件哈希逐项一致：SFTP 页面、workspace-state、侧栏、浮窗、上传 Store/API、AppLayout、Rust SFTP command/service/transfer。当前页面 Git 对象哈希 `607e85d00431f16a61ba90f0d6fbe30a664d2665`；暂存区为空，HEAD 保持 `56fc3fb`。仓库仅新增本报告；没有修改业务代码、state.json、暂存、提交、推送或派发后续任务。

已参考 `check`、`test-development`。**建议对 B1 定向返工，本轮验收到此停止。**
