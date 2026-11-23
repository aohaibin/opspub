# 第 09 步 · 独立验收报告

**结论：建议否决本批交付，暂不通过。** 确认两项本步新增问题：历史栏没有进入原型的二级工作区，形成不可随二级栏折叠的第三栏；1100×700 最小窗口出现审批列表时，底部输入区和发送按钮被裁切。另复现数项改前已存在的流式状态问题，单独列出，不归因于本步新增的 41 行。原生 Tauri/WebView2 和真实审批执行、审计落库均未验证。

验收时间：2026-11-22，Asia/Shanghai。分支 `opspub`；验收前后 HEAD 均为 `6f886c0da467d9372c046626a29a79c0cd53d9f2`。仅验收第 09 步，未修改业务代码，未暂存、提交或推送。

## 范围、基线与隔离

先读 `.agent-pipeline/review-checklist.md`、`step-09-implementation.md`、`step-09-copilot-before.tsx` 及 `docs/ops-prototype-direction2-workspace.html`，再按实际处理函数和新增范围审查。实现回执中的类型检查、构建和七项源码契约断言不等于运行时交互测试；本轮重点验证它们没有覆盖的反例。另参考第 08 步既有离线验证方式，复用其浏览器驱动骨架，重新编写 Copilot 用例。

- 改前快照 SHA-256 为 `eae38c67adca7490ee43b823f5db13e612c7f2b6da635f8426ae7682f4c8a78f`，与实现回执一致。快照到当前 Copilot 文件为 **41 行新增、0 行删除**。本步新增服务器摘要计算、页面内历史侧栏及两层包裹结构。
- HEAD 到改前快照为 **89 行新增、89 行删除**；这是本步开始前已有的主题变量等调整。HEAD 到当前文件合计 130 行新增、89 行删除，不能把它们全部算作本步。`global.css` 的 Copilot 字号覆盖、`variables.css`、`antdTheme.ts` 等原有未提交主题改动不属于本轮实现；本轮也没有修改它们。
- 启动前检索了当前工具目录，没有项目任务系统的查询、登记、扫描或启动接口，仓库也没有 `.vscode/tasks.json`。未启动 Vite、Tauri 或桌面应用；使用用户允许的离线夹具回退。Codex 会话管理工具不作为项目运行任务系统使用。
- 夹具使用真实 `App`、路由、工作区导航、Copilot 页面、Zustand store、`copilotApi` 和 Tauri 官方 `mockIPC` / 模拟事件桥；在 IPC 边界返回合成数据。每轮新建隔离 Edge profile，清空该 profile 的存储，使用 101/102 两台 `synthetic-*.invalid` 合成主机和合成会话、审批。没有读取应用真实数据库、用户浏览器资料、凭据或连接真实主机，没有调用 Reeve 远程工具。
- 只打开离线 HTML。夹具 CSP 默认禁止网络，Edge 额外禁用后台联网并阻断外部域名解析；本机 CDP 仅用于控制离线浏览器。原型使用已有缓存中的 Tailwind 3.4.17 / Lucide 0.577.0，未联网下载；其主机示例做了合成替换。原型源文件 SHA-256 为 `c79edf954881e8cbfcb0c4429aae0ee7154aa8ca38f9e80f0a2b9d1daa52a86d`。

**证据根目录**：`C:/Users/ao/AppData/Local/Temp/opspub-step09-review-20261122/`。下文日志、夹具和截图文件名均相对该目录。业务文件使用实际当前源码；改前组通过 esbuild 插件只替换 Copilot 模块为快照，其他导航、主题及生产 CSS 完全相同。驱动对改前包断言不存在“当前服务器上下文”，防止基线替换失败。

## 阻断项

### B1 · 新增历史栏位于第三栏，偏离原型且不随二级栏折叠

**归属：本步新增。** `src/pages/copilot/index.tsx:1093-1136` 在 `.workspace-content` 内再建 256px `aside`，已有 `.workspace-subnav-slot` 仍为空。原型 `domain-panel-ai`（原型源约 2920 行）把新会话、模块入口、历史任务和知识空间放在同一个二级工作区，未另加聊天区侧栏。

复现：进入 `#/copilot`，观察一级轨、二级模块栏和历史栏；点击“收起二级栏”。实际只收起模块栏，历史栏仍留在聊天区。默认窗口及最小窗口的亮暗四组均复现；不是主题颜色问题。1100px 宽时，聊天区从改前 784px 降为 528px；1440px 宽时从 1124px 降为 868px。

证据：`current-stable.log` 中 `prototype history lives within collapsible secondary sidebar` 和 `collapse hides prototype conversation sidebar too` 各四次失败；`step-09-current-initial-dark-1100x700.png`、`step-09-current-collapsed-light-1440x900.png`，对照 `step-09-prototype-ai-page-light-1100x700.png` / `step-09-prototype-ai-page-dark-1440x900.png`。

建议恢复原型规定的二级栏结构，使用现有侧栏槽位，维持会话选择与折叠联动。本报告仅建议，未修改实现。

### B2 · 最小窗口有审批列表时输入区被裁切，属于新增布局回归

**归属：本步新增包裹结构与侧栏挤占后的回归。** `src/pages/copilot/index.tsx:1093` 的内层 flex 行及其右侧 section 包住聊天、提示和 footer，页面仍为 `overflow-hidden`。在本轮合法合成审批数据下，内层内容向页面下方溢出。

复现：1100×700、二级栏展开，保留默认安全提示，已有会话中加入四条合成审批（两个长期待审、一个短时到期、一个已过期，审批列表自身可滚动）。亮暗均出现。无需打开审批详情弹窗即可看到输入框底部消失；外层页面不能滚动找回发送按钮。1440×900 同场景没有裁切。

| 同一最小窗口、同一主题与审批夹具 | 改前快照 | 本步当前版 |
| --- | ---: | ---: |
| 页面可见底边 | 680px | 680px |
| footer 底边 | 680px | 723.66px |
| 发送按钮范围 | 633–657px | 676.66–700.66px |
| 聊天宽度 | 784px | 528px |

当前发送按钮大部分位于页面裁切区域之外。**改前聊天剩余高度约 52px 也偏小，但其 footer 与发送按钮完整可见**；不能把原有拥挤和本步新出现的裁切混为一谈。夹具的“聊天高度 >70px”只是观察阈值，不作为本项阻断依据；裁切及操作控件不可见才是依据。

证据：`current-stable.log` 与 `before-stable.log` 中 `approval-panel-before-modal` 的 `METRICS`；`step-09-current-approval-panel-light-1100x700.png` / `step-09-current-approval-panel-dark-1100x700.png`，对照 `step-09-before-approval-panel-light-1100x700.png`。审批详情中的“批准并执行”按钮自身在四组窗口都可见，问题在其背后的聊天输入区。

## 非阻断项与既有问题

以下“非阻断”仅指**不作为第 09 步新增回归处理**，不代表整体验收可以忽略其中的核心流程缺陷。

### N1 · 离页返回后丢失原请求最终答复，改前已存在

挂起合成 `copilot_chat`，收到 `NAV_PARTIAL` 后导航到技能页，再后退返回。新页面能接收同 requestId 的后续 delta，显示 `NAV_PARTIAL_AFTER_BACK`，但输入框已不再禁用；释放原请求并返回 `NAV_FINAL_RESULT` 后，当前页面仍停在部分答复和“正在生成”。再前进、后退也不能恢复最终文本。

当前版和正确替换的改前快照在四组环境全部复现。事件订阅随组件重挂载，但原 Promise 的结束回调仍使用旧组件局部 state；`loading` 也为页面局部状态。相关位置：Copilot `useState` 的 loading/progress、`:337-383` 事件订阅与清理、`:771-778` 最终回复回写、`:800-804` finally。此项应单独安排修复，整体验收前不能以“本步未改”视为通过。

证据：两份 stable 日志中 `remounted in-flight session preserves busy state` 和 `remounted page receives original promise final result` 各四次失败；`step-09-current-navigation-stream-dark-1440x900.png` 及对应 `before` 截图。

### N2 · 正文隔离成立，但进度和忙碌状态跨会话共享，改前已存在

在 A 的流式请求挂起时切到 B，给 A 发送 `LEAK_PROGRESS_FROM_A`。B 的消息正文仍属于 B，A 的 delta 没有进入 B 正文，但 B 底部显示 A 的进度和服务器别名，输入框也被 A 的全局 `loading` 禁用。切回 A 后，累积正文与最终回复正确归属 A。

根因位置：`:352` 对消息按 requestId 匹配，但 `:376` 无条件写页面级 `progress`，`:1304` 无活动会话过滤。当前和改前四组均复现。不能将实现回执的“按 requestId 更新”扩展成整个流式 UI 已隔离。

证据：`stream text isolated after history switch` 通过，`stream status isolated after history switch` / `other history session can accept input while A streams` 失败；`step-09-current-stream-other-session-dark-1440x900.png`、对应 `before` 截图。

### N3 · 已结束请求仍接收迟到 delta，改前已存在

等待请求成功返回并解除忙碌，再向旧 requestId 注入 `_LATE_CORRUPTION`。文本被追加，且 `streaming` 再次变为 true。当前和改前四组均复现。`:352-373` 没有检查请求是否结束。该测试证明前端对异常或迟到事件的防御不足，**没有证明原生事件通道一定会这样乱序**；后者未验证。

### N4 · 原有窗口拥挤、全局目标语义与构建提示

- 1100×700 时，顶部服务器选择与外部工具/技能控件存在局部重叠；审批区展开时聊天可用高度很小。改前截图也存在，不归入新增侧栏的修改范围。主页面横向滚动宽度检查通过并不能排除局部控件相互覆盖。
- 实测先在 101 对话，再选 102 发送，实际 IPC 的 `serverId` 为 102，历史上下文仍包含之前的对话。这符合当前“全局目标、历史不绑定服务器”的实现说明。没有复现请求发往旧 ID，但用户可能把历史误解为绑定目标的会话；是否增加提示由总控决策，不能悄悄改变语义。
- 构建 JS 约 3.10MB，继续出现 >500kB chunk 提示，构建退出码为 0；非本步新增阻断。

## 实测覆盖与结果

当前版与快照均执行亮色/暗色 × 1440×900/1100×700。窗口值来自 `src-tauri/tauri.conf.json`，这里为等尺寸浏览器 viewport，**不等价于原生 Windows 窗口验收**。

| 场景 | 运行时结果与边界 |
| --- | --- |
| 服务器切换目标 | 通过页面选择器切 101→102→自动；实际 `copilot_chat` 捕获 101、102、null。当前侧栏别名、地址端口、策略、连接状态随选择同步。只使用合成主机资料。 |
| 历史搜索 | 大小写无关地检索历史消息正文 `needleunique`，只匹配 B；无结果显示正确；清空搜索恢复列表。 |
| 历史切换、删除 | 切换显示相应旧消息；取消删除不改变持久化；确认删除非活动会话保留当前内容；当前新增侧栏删除活动会话后选中剩余会话，持久化中原条目消失。快照通过原有历史弹窗验证共享操作。 |
| 流式事件 | Promise 未返回时 delta 可见；未知 ID 不改正文；切换历史后的正文及最终结果按请求归属，切回能看到累计 delta。进度共享、迟到事件和离页最终回写的反例见 N1–N3。 |
| 锁定 | 锁定发送先展示确认，未发送 chat / unlock IPC；getLock 抛合成错误时停止并显示错误。只读继续不解除后端锁；重挂载后明确点击“开启30分钟”才发送 `set_ai_lock(30m)` 并继续 chat。 |
| 审批通过 | 首次“批准”仅打开计划预览，不发执行 IPC；预览显示目标、步骤、风险与验证；再次确认仅发选定 701 的一次 approve IPC，模拟完成结果可见。 |
| 审批拒绝 | 702 只发送 reject IPC，不增加 approve 次数，模拟状态变 rejected。 |
| 审批超时 | 覆盖已经过期与显示期间到期；倒计时结束后无执行按钮，详情提示命令与后续步骤暂停，没有对应 approve IPC。模拟时钟等待不验证真实后端超时调度。 |
| 导航 | `#/copilot` 直达的一级域、二级高亮正确；技能页前进后退可恢复导航选择；“接入与策略”实际打开设置页，标题对应，返回保留已完成消息。流式离页恢复另见 N1。未把本步走查声称为17模块全量功能验收。 |
| 亮暗、默认/最小 | 四组均有页面、锁定、审批预览/超时、流式切换、折叠截图。默认尺寸的输入区可见；最小尺寸的审批列表场景触发 B2。 |

最终当前组 **172 PASS / 36 FAIL / 0 HARNESS_ERROR / 4 SUMMARY**；快照组 **168 PASS / 24 FAIL / 0 HARNESS_ERROR / 4 SUMMARY**。这些是重复窗口下的断言次数，不是36个独立缺陷；同一裁切在弹窗打开前后各测一次，“聊天高度 >70px”也计入失败统计，结论按上述 B/N 分组判断。

## 分批命令、退出码与证据

在仓库根目录执行，`$v = Join-Path $env:TEMP 'opspub-step09-review-20261122'`。所有日志最终保存为 UTF-8；本轮创建的源码/报告均为 UTF-8 无 BOM。运行用例返回 1 是因为保留了失败断言，不是启动失败。

| 批次 | 实际命令或调用 | 退出码 | 证据 |
| --- | --- | ---: | --- |
| 启动与范围 | `git status -s`、`git branch --show-current`、`git rev-parse HEAD` | 0 | 启动控制台、`status-before.log`、`head.log`；记录原有未提交区，不对其写入。 |
| 本步差异 | `git diff --no-index --unified=5 .agent-pipeline/step-09-copilot-before.tsx src/pages/copilot/index.tsx` | 1 | `step-diff.log`；有差异时1为正常返回，41增0删。 |
| 主题基线 | `git show HEAD:src/pages/copilot/index.tsx` 导入临时快照，再 `git diff --no-index --numstat <临时HEAD快照> .agent-pipeline/step-09-copilot-before.tsx` | 0、1 | `copilot-head.tsx`、`theme-baseline-diff.log`；89增89删。 |
| 类型 | `node node_modules/typescript/bin/tsc --noEmit`（由 `prepare.cjs` 捕获） | 0 | `tsc.log`。最初另执行 `pnpm exec tsc --noEmit` 无错误输出；该次 PowerShell 包装未写回退出码，因此以独立 Node 捕获为准。 |
| 构建 | `pnpm build`（经 `cmd.exe /d /s /c`，由 Node 捕获） | 0 | `build.log`，5234模块，Vite构建59.95秒，保留chunk提示。使用的CSS为 `index-DAiyEQyE.css`，重建后同名同内容。 |
| 夹具首轮 | `node (Join-Path $v 'run-isolated.cjs') current` | 1 | `current-attempt01.log`；Ant Design弹窗选择器不适配造成16个夹具错误，后续相关场景无效，不作为业务结论。只修正临时夹具选择器。 |
| 当前版补覆盖 | 同上，依次补解锁/导航检查与截图等待 | 1、1 | `current-attempt02.log`、`current-final.log`；均0夹具错误。 |
| 快照首轮 | `node (Join-Path $v 'run-isolated.cjs') before` | 1 | `before-attempt01.log`；Windows路径匹配导致未替换成功，截图有256px侧栏，**该组不作基线证据**。改用模块解析替换并加入包内断言。 |
| 快照校正 | 同上 | 1 | `before-final.log`；侧栏宽0，158 PASS / 22 FAIL / 0夹具错误。 |
| 最终当前组 | `node (Join-Path $v 'run-isolated.cjs') current` | 1 | `current-stable.log`；新增无弹窗的审批区截图和发送坐标，172/36/0，四组完整。 |
| 最终快照组 | `node (Join-Path $v 'run-isolated.cjs') before` | 1 | `before-stable.log`；168/24/0，四组完整。与最终当前组使用相同夹具。 |
| 原型 | `node (Join-Path $v 'capture-prototype.cjs')` | 0 | `prototype.log`、`run-prototype.cjs`、四组 `step-09-prototype-ai-page-<theme>-<width>x<height>.png`。依赖哈希也在日志内。 |
| 结束核对 | `git diff --check -- src/pages/copilot/index.tsx`、`git diff --cached --name-only` | 0、0 | `diff-check.log`、`staged.log`；仅换行提示，暂存区为空。593个受检已跟踪文件的前后SHA-256全部一致，见 `source-before.json`、`verification.json`。 |

主要运行夹具为 `copilot-fixture.tsx`，浏览器驱动为 `run-isolated.cjs`；`copilot-fixture-current.html` / `copilot-fixture-before.html` 为自包含的最终离线页面。截图文件名规则为 `step-09-<current|before>-<场景>-<light|dark>-<1440x900|1100x700>.png`。日志中的 `IPC_CALLS` 留有实际捕获的合成请求、目标ID和审批命令；仅省略内置技能长正文以控制体积。

## 未验证

- 原生 Windows Tauri/WebView2、真实窗口缩放/DPI、原生IPC序列化和事件顺序。无项目任务系统工具，本轮没有绕开任务系统手工启动应用。
- 真实模型流式通道、真实服务器策略执行、SSH、凭据脱敏、审批后台超时、批准后的命令执行/验证、真实拒绝调度及审计落库。模拟审批状态由夹具返回，不能作为这些后端安全性质的证明。
- 真实已有用户数据的原位迁移、损坏数据恢复、异常存储配额及重启恢复；本轮只操作隔离profile中的合成历史。也没有做17模块整体验收或本步未修改的Rust全量测试。

## 需总控决策

1. **建议退回B1、B2。** 按既定原型把历史与上下文接入现有二级栏，并修正最小窗口的底部可达性；返工后沿用本轮离线反例复验。若产品刻意选择第三栏，应先明确变更原型及折叠规则，不能直接将现状记为原型对齐通过。
2. **N1–N3须另立修复归属。** 本轮已证实它们在改前快照存在；不得算作41行新增的回归，也不应在整体验收中视为已经通过。特别是N1涉及运行中对话的最终答复丢失，应在完整交付前解决。
3. **原生验证保持未完成。** 即使离线返工复验通过，也只能记为该层通过；后续通过项目任务系统补齐Windows原生与真实审批/审计验收，再决定完整第09步是否关闭。验收人未代替总控作放行或提交决定。

本轮在仓库只新增本报告；临时夹具、构建日志和截图保留于上述证据目录。构建仅更新忽略的 `dist` 产物。没有改业务、提交或推送，完成本步检查后停止。

已参考技能：`check`、`test-development`、`bug-detective`。
