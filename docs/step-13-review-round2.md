# OpsPub 第 13 步独立复核 · 第二轮

**结论：继续阻断，建议否决本轮通过。** 首轮 B1 的初始化覆盖路径已修复；自启保存跨页面重挂载仍能造成相同的状态失真和首次点击方向错误。错误补偿和两次均成功的交错保存都已实测复现，不能据初始化矩阵通过关闭整个 B1。

日期：2026-11-23。范围仅 Step 13 及 B1 返工，不重做先前迁移，不更新编排、不提交、不推送。

## 依据与环境

先阅读[实现回执及 B1 返工日志](../.agent-pipeline/step-13-implementation.md)、[验收清单](../.agent-pipeline/review-checklist.md)、[首轮评审](step-13-review.md)，再读取源码并编写反例。补充对照[设置基线](../.agent-pipeline/baseline.md)、[原型公共设置栏](ops-prototype-direction2-workspace.html#L3097)及原型设置中心的语言、启动与托盘语义。查看了返工证据目录中的 `light-1100-startup-plugin-first.png`、`dark-1440-startup-config-first.png`，以及本轮失真截图。原型 SHA-256 仍为 `c79edf954881e8cbfcb0c4429aae0ee7154aa8ca38f9e80f0a2b9d1daa52a86d`。

检视对象为 `opspub` 分支、HEAD `34bddf3284f46d0931f29243f1c7a163b1ed0236` 的现有工作树。独立构建产生 `index-Bmkrdkdr.js`、`index-DTFN5QOQ.css`，与返工回执的产物名一致。

本会话已检查全部注册工具：有 Codex 会话、worktree 与本地执行工具，但没有应用项目任务的扫描、登记、查询、启动、停止接口，也没有原生窗口控制工具。Codex 线程工具不是项目运行任务工具，因此未冒充项目任务启动真实应用。记录见证据目录 `tools-gap.json`。

测试使用独立临时构建、回环静态服务、新建 Edge 配置目录和安装包自带的 Tauri IPC mock。仅复用旧夹具的 Edge/CDP 与静态服务驱动，另写初始化、IPC、延迟释放与评审用例；未直接把实现方的 352 项结果当作独立结论。所有配置、系统自启状态及保存失败均为合成数据；没有接触真实配置库、系统启动项、凭据或远程服务器。

证据根目录：`C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/`。其中 `review.cjs` 是夹具入口，各批 `*-expanded.cjs` 是实际执行脚本，`summary.json` 汇总检查与缺陷观察，各子目录含截图、逐次 IPC 与状态快照。可在仓库根目录用 `node <证据根目录>/review.cjs <批次名>` 复跑下表批次。

## 阻断 B1-R2：自启保存跨挂载失去协调

### A. 配置拒绝后，旧页面补偿成功，新页面仍显示相反状态

在亮色、暗色 × 1100×700、1440×900 中，以下两个方向各执行一次，共 **8/8 复现**。

1. 合成系统自启为 `true`，持久化 `ui.auto_start=true`，进入设置并等初始化完成。
2. 点击关闭自启。让 `plugin:autostart|disable` 成功，暂扣随后 `set_config(ui.auto_start, false)`，并令该配置写入在释放时失败。此时原页面开关禁用，显示旧值，系统已为 `false`。
3. 通过 `#/servers` 离开再返回 `#/settings`，真实卸载并重挂设置组件，不重载整个应用。新页面读取到系统 `false`，显示关闭并解锁；旧保存仍未结束。
4. 释放旧配置写入的错误响应。旧页面发出 `enable`，系统成功恢复为 `true`；配置仍为 `true`。但新页面继续显示关闭且可点击。
5. 再次实点开关，捕获到 `enable`，没有按实际系统已开启的状态发出 `disable`。

| 初始系统 / 配置 | 旧请求失败并补偿后的系统 | 新页面显示 / 禁用 | 实测首次点击 | 应有方向 |
| --- | --- | --- | --- | --- |
| `true / true` | `true` | `false / false` | `enable` | `disable` |
| `false / false` | `false` | `true / false` | `disable` | `enable` |

反向场景仅交换启停方向，结果对称。合成错误提示可见，但无法弥补开关状态和操作方向失真。

证据：[亮色最小窗口 IPC 与状态](C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/remount/light-1100-observations.json)，查找 `sys-true-remount-rollback-result`、`sys-true-first-click-after-rollback`；[亮色关闭误显示截图](C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/remount/light-1100-sys-true-remount-rollback.png)；[暗色默认窗口反向截图](C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/remount/dark-1440-sys-false-remount-rollback.png)。其余三组 IPC 文件使用相同记录名。

### B. 两次保存全部成功，迟到的旧保存仍覆盖新状态

此变体不注入任何保存错误，同样两个方向、四组窗口，共 **8/8 复现**。

1. 初始系统和配置均为 `true`。点击关闭，系统变为 `false`，暂扣旧配置写入 `false`。
2. 离开设置并返回。新页面显示系统 `false`，且已解锁。
3. 新页面点击开启，使第二次系统操作及配置写入 `true` 全部成功。此时系统、配置、界面均为 `true`。
4. 最后释放第一次配置写入。旧保存成功回调将 store 改为 `false`。最终系统仍为 `true`，界面与配置却为 `false`，开关可点击。

反向初始值为 `false` 时，最终系统 `false`、界面及配置 `true`。这证明仅在补偿后补写一次旧值不能解决跨挂载的事务交错。

证据：[两次成功的 IPC 顺序与状态](C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/concurrent/light-1100-observations.json)，对照 `sys-true-second-save-complete` 与 `sys-true-old-success-overwrites-new`；[系统已开启但显示关闭](C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/concurrent/light-1100-sys-true-old-success-overwrites-new.png)。四组均记录 `staleEnabledSwitch: true`。

### 源码对应与建议

[设置页第 147–148 行](../src/pages/settings/index.tsx#L147)的 `autoStartStatus` 与 `autoStartWrite` 都属于当前组件实例。新挂载不会继承旧保存的 pending；[初始化第 175–179 行](../src/pages/settings/index.tsx#L175)完成后即可重新操作。旧 [changeAutoStart 第 269–277 行](../src/pages/settings/index.tsx#L269)仍继续运行：成功时无请求版本检查地写共享 store；配置失败、系统补偿成功时又没有同步已经被新页面重读的 store。[alive 清理](../src/pages/settings/index.tsx#L185)只约束初始化回调，未协调保存事务。以上解释与合成 IPC 实测一致。

建议把自启事务的 pending、顺序和最终系统状态放到跨挂载的统一协调范围；重挂载不得绕过在途写入，迟到回调不得覆盖更新的用户意图，补偿结束应重新收敛到系统实际状态。返工验收必须同时包含上述失败补偿和双成功交错，不能只增加一个局部 `setAutoStart(previous)`。

## 非阻断与保留问题

### N1. 语言在保存挂起期间重挂载，成功后仍回到旧语言

四组均复现：中文页面选择 English，暂扣 `set_config(ui.language, en-US)`；界面先变英文、按钮禁用。离开再返回时，新读取拿到仍是 `zh-CN` 的持久值并 hydrate，界面变回中文。释放旧写入后，配置成功变成 `en-US`，并出现 `Language switched to English` 提示，但 `html.lang` 和主轨仍为 `zh-CN`。

[通用偏好保存第 308–325 行](../src/pages/settings/index.tsx#L308)在开始时乐观写 store，成功后不再应用值；[loadSettings 第 108–116 行](../src/store/settings.ts#L108)仅合并读取，不协调尚未完成的写入，重挂载可以读取旧持久值。HEAD 的旧语言处理也采用乐观赋值、成功不再赋值，故本轮按既有语言一致性问题的跨挂载变体记录为非阻断，不称其为新引入回归。此处既有归因来自源码对照，未在 HEAD 基线实跑该跨挂载用例；当前工作树的复现已实测。

证据：[语言 IPC 与状态](C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/language-final/light-1100-observations.json)，查找 `pending-language-remounted` 与 `pending-language-save-success-after-remount`；[英文成功提示与中文界面并存](C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/language-final/light-1100-language-after-remount-success.png)。四组均为 `staleLanguage: true`。建议偏好写入与 hydration 使用同一跨挂载顺序规则。

首轮主题双写失败和模型弹窗英文混用仍保留在[原报告](step-13-review.md)；返工回执未宣称修复，本轮未重新触发，不声称它们已通过。构建的仓库外输出目录提示及大于 500 kB 分块提示仍存在，为非阻断。

## 分批实测结果

每批均执行亮、暗两种主题及 1100×700、1440×900 两种视口。下列断言数包含挂载、等待、错误提示、IPC 和缺陷复现检查；**脚本正常结束不等于产品通过**，也不能把缺陷观察计为功能通过。

| 批次及实际调用 | 断言 / 四组 | 结论及证据 |
| --- | --- | --- |
| `node <E>/review.cjs matrix` | 46 × 4 = 184 | 系统 `true / false` 分别配相反配置，再分别 plugin-first / config-first，共 16 组初始化交错。两次响应前后禁用及零启停调用、晚到托盘值、最终系统优先与首次点击方向均符合预期。`matrix-final.log`、`matrix/*-observations.json`。 |
| `node <E>/review.cjs errors-final` | 61 × 4 = 244 | 两个方向的插件写失败、插件 pending、配置 pending、防重复点击、配置拒绝后的补偿及重试通过。系统读取失败时保留已读配置且禁用，重挂载可重试；配置读取失败后系统成功值仍优先，重挂载可重试配置。补偿失败后重读系统并重试、补偿及重读均失败后禁用通过。`errors-final.log`、`errors-final/*-observations.json`。 |
| `node <E>/review.cjs remount` | 29 × 4 = 116 | 旧初始化尚未结束时离开再返回，未挂载页面的旧系统读结果不会提前解锁新页，新的有效系统结果生效；但保存失败跨挂载的 B1-R2 A 两个方向均复现。`remount.log`。 |
| `node <E>/review.cjs concurrent` | 24 × 4 = 96 | 两次保存均成功、旧配置写入最后返回，B1-R2 B 两个方向均复现。`concurrent.log`。 |
| `node <E>/review.cjs language-final` | 26 × 4 = 104 | 首轮“旧应用启动配置覆盖新语言”原路径未再出现：旧共享快照未返回时按钮禁用且早点击零写入；配置先完成、系统读仍 pending 时可保存英文，迟到系统结果不会回退；保存完成后重挂载及合成刷新保留英文。但保存挂起时重挂载复现 N1。`language-final.log`。 |

`<E>` 为上述证据根目录。五批共 744 个夹具断言完成，20 份 diagnostics 的 `errors`、`external` 均为空；共保留 44 张本轮截图及 20 份 IPC/状态观察文件。`summary.json` 可逐项核对。

夹具修正记录：首版 matrix 在跨文档导航时读到了旧 DOM，随后增加每次导航唯一 `run` 标识并完整重跑，采用 `matrix-final.log`。首版 config-error 在页面挂载前由根读取直接拒绝，页面随后自行成功重读，未进入预期错误提示分支；改为待页面挂载后释放受控拒绝，再完整运行 `errors-final`。语言最终批次额外以新文档标识等待刷新完成。早期日志保留，不将这些夹具问题计作产品缺陷。

其他实际检查：

- `pnpm build --outDir 'C:/Users/ao/AppData/Local/Temp/opspub-step13-round2-pRVAFX/build'` 退出 0。该脚本依次执行 `tsc`、`vite build`；未另报一个没有单独执行过的类型检查命令。
- `git diff --check -- src/App.tsx src/store/settings.ts src/pages/settings/index.tsx` 退出 0，仅有 LF/CRLF 提示。
- 本轮只核对 Step 13 相关原型和截图，不重复全模块迁移验收，不重跑无关 Rust 迁移或远程操作。

## 未验证与边界

未提供项目任务工具，未启动或走查 Windows 原生 Tauri/WebView2 应用；真实应用退出重启、系统登录启动、启动后进入托盘、原生插件权限和故障、真实 SSH、真实设备配对、通道及备份读写均未验证。这里的刷新保留指合成 IPC 与隔离浏览器存储，不能替代原生重启。挂起测试使用可控延迟和响应顺序，未测永久 IPC 卡死、超时策略或多窗口间并发。

源文件保护以会话开始的 665 个 Git 已跟踪及未忽略未跟踪文件的 SHA-256 清单为基准。报告创建前复核，全部源码与既有报告、原型、锁文件均未变化；HEAD 与 Git index 也相同。另观察到 `.agent-pipeline/state.json` 在会话期间改变，来源未验证，本验收未写入、未恢复该文件。记录见 `before.json`、`preservation-before-report.json`。本轮唯一仓库写入为本报告；夹具、构建和证据均在临时目录。

## 裁决建议

关闭 B1 的原始初始化响应顺序子项；以 B1-R2 继续阻断 Step 13，不建议本轮通过或推进提交。N1 和首轮既知非阻断项继续登记，原生验收缺口保留。实现方应补齐跨挂载事务协调后，再复核四组窗口中的双方向失败补偿、双成功交错及首次点击，同时确认语言在途保存与重新 hydrate 不冲突。本验收只记录决策建议，不修改编排状态。

已参考技能：`check`、`test-development`、`bug-detective`。
