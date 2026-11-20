# 第 03 步首批 · 终端独立验收

## 第四轮返工独验（最新，2026-11-20）

**结论：本轮指定的 B1/B2 验收通过，阻断项 0，两项均可关闭。** 两种跨快照乱序、同 seq 去重、不同 seq 相同文本、700,018 字符边界以及结束状态与单次目标重连均在亮暗离线夹具中通过。此结论限于本轮终端首批阻断复核；真实 Windows/SSH/IPC 仍待验证。各轮历史记录保留，下文旧阻断结论不代表当前状态。

已先读通用清单、基线、最新实现报告“第四轮返工”和前轮验收结论，再检查实现方日志、夹具断言及当前源码。分支 `opspub`，HEAD `4c3f89c`，终端源码 Git 对象哈希 `d3282efa701700698e1d2792606aa8f4e0a10af0`。

### 阻断项

**无剩余阻断。B1 已解决，B2 保持通过。**

- **B1 · A 顺序**：`seq3 → snapshot seq1 → seq2`。高序号块等待缺口补齐，之后按 seq2、seq3 显示；两种主题均为 `sameTextCount=3 sourceOrder=true opens=[]`。
- **B1 · B 顺序**：`snapshot seq1 → seq3 → seq2`。恢复完成后使用同一缓冲，seq3 未越过缺口提前显示；seq2 到达后两块完整按序显示；两组读数同上。
- **B1 · 正向对照和幂等**：`seq2 → snapshot seq1 → seq3` 结果一致。三个缺口用例均发送已被快照覆盖的 seq1、到达前后重复的 seq2/seq3，并校验总数与源顺序，未多显示或丢失不同序号的相同文本。
- **B1 · 窗口边界**：`snapshotLength=700018 actualOutputLength=700018 historyKept=true event0000Count=1`。读实际 TerminalPane 输出 prop，逐字等于快照；已覆盖的相同 seq 不再追加。跨快照的 seq+2 等待 seq+1 后，最终 prop 逐字等于“快照 + seq+1 + seq+2”，首标记保留，没有额外截断。
- **B2 · closed 与迟到 connected**：两组均在恢复前后注入旧 connected 和旧输出；旧 ID 未回到侧栏或横向标签。重连挂起时 `opens=[202]`，没有额外目标或关闭调用，最终只有一条新会话。
- **B2 · 凭据流程**：error 场景仅对目标 202 打开一次，模拟缺少凭据后进入 `SSH 验证 · Synthetic Beta` 原有验证窗；其他服务器 303 的断开标签和输出保持可查看。

### 实际证据和执行记录

先审阅实现方目录 `%TEMP%/opspub-step03-round4-lH6exa/` 中 `restore-gap-late.log`、`restore-gap-live.log`、`restore-gap-forward.log`、`restore-overlap-cap.log`、`restore-late-connected.log`、`restore-extended.log`、`restore-race.log`；结果与第四轮实现报告相符。检查夹具确认断言同时覆盖内容、次数、顺序、目标和旧会话清理，而非仅检查脚本是否结束。

独验将既有 `adversarial.tsx`、`run-adversarial.cjs`、`check-output-window.cjs` 原样复制到 **`%TEMP%/opspub-step03-round4-review-cdce56b7/`** 执行，未修改测试逻辑或业务代码。每个浏览器用例均从当前真实 TSX 打包，各跑亮色 1440×900、暗色 1100×700：

| 实际命令（前缀为 `node <独验目录>/`） | 退出码 | 独立实测结果 |
| --- | --- | --- |
| `run-adversarial.cjs restore-gap-late` | 0 | A 顺序两组均三条相同文本、源顺序正确、无新建连接。 |
| `run-adversarial.cjs restore-gap-live` | 0 | B 顺序两组均三条相同文本、源顺序正确、无新建连接。 |
| `run-adversarial.cjs restore-gap-forward` | 0 | 正向对照两组均相同结果，重复 seq 未多呈现。 |
| `run-adversarial.cjs restore-overlap-cap` | 0 | 两组 700,018 字符逐字一致；首标记和单次事件保留；跨快照缺口补齐后的完整 prop 也逐字一致。 |
| `run-adversarial.cjs restore-late-connected` | 0 | 两组旧会话不复活，只有目标 202 一次打开，最终新会话输出正确。 |
| `run-adversarial.cjs restore-extended` | 0 | 两组不同 seq 相同文本均保留，恢复前到齐的乱序正确，目标 202 进入原有凭据窗。 |
| `run-adversarial.cjs restore-race` | 0 | 两组先到输出与新连接快照正确合并；快照内的块不重复，后续块保留。 |
| `check-output-window.cjs` | 0 | 直接执行源码缓冲函数，缺失 seq2 后积累 760,000 字符，按既有窗口策略保留最近 600,000 字符并继续推进。 |

独验汇总 `results.log` 保存七个浏览器用例名、输出及各自 `EXIT=0`；窗口测试输出在 `check-output-window.log`。对应十四张截图为 `adversarial-<case>-<theme>-<width>x<height>.png`。旧报告备份 `previous-review.md`。700,018 字符的完整性以真实组件 prop 的逐字断言为准，截图不替代缓冲断言。

### 静态检查和非阻断项

- `src/pages/terminal/index.tsx:123–150` 将连续消费与窗口限制拆为 `drainTerminalOutput`、`flushTerminalOutput`，只在下一个连续 seq 可用时推进。恢复（232–244）先移除快照已覆盖的块，再进入同一消费逻辑；实时监听（258–271）按 seq 和 Map 判重并复用该逻辑。上轮“已见最大序号代替连续覆盖边界”的根因已消除。
- B2 仍使用终态单向判定、观察到的状态协调及丢弃旧 ID 集合。当前回归未观察到输出缓冲改动影响目标重连和凭据窗。
- **非阻断限制**：若缺口对应事件始终不再到达、且等待块尚未超过历史上限，后续输出会继续等待。实现报告已披露该行为，本轮也确认等待期间不提前显示高 seq。这是当前保序策略的可用性边界；真实 IPC 丢包下的重同步和提示机制未验证，不将其混同为本轮“seq2 最终到达”反例仍失败。
- 超过历史窗口后按策略丢弃旧内容属既有上限行为；本轮将其与“700,018 字符不应额外截断”分别验证，两者均符合当前实现约定。未发现需要另列的非阻断代码缺陷。

### 未验证范围

真实 Windows Tauri/WebView2 及默认/最小原生窗口、实际 IPC 调度/顺序/丢包/长延迟、真实 SSH/PTY、系统凭据、指纹确认和审批均未验证。离线 Edge 视口不是原生窗口验收；模拟错误进入凭据窗不等于真实认证成功。同版本前后端之外的混用兼容性未验证。

本轮沿用现有构建 CSS、当前 TSX 和 Tauri mock，合成资产使用 `.invalid` 域名。未启动项目服务、桌面应用或真实远程连接。没有重跑生产构建、类型检查、Rust 测试或其他模块全流程；实现报告内这些命令的结果不计作本轮独立运行证据。

### 变更边界与停止

独验前后六个文件哈希逐项一致：终端页、`src/types/terminal.ts`、Rust terminal service/models、`Router.tsx`、`AppLayout.tsx`。HEAD 保持 `4c3f89c`，暂存区为空。仓库只更新本报告；临时夹具和日志均在上述独验目录；未修改业务代码、暂存、提交、推送或派发后续任务。参考技能 `check`、`test-development`。**建议关闭 B1/B2，交总控裁决；本轮验收到此停止。**

## 第三轮返工独验（历史，2026-11-20）

**结论：仍有 1 项阻断。B2 本轮通过，可关闭；B1 的上轮覆盖/截断反例已修复，但跨快照恢复边界的乱序事件仍会丢失，暂不关闭 B1。** 本轮仅复核 B1/B2，未重跑生产构建、其他模块或正常菜单全流程。以下各轮记录保留为历史，以本节为当前结论。

已先读通用清单、基线、实现报告的“第三轮返工”、此前独验结论，再审阅实现方五份夹具日志及源码。独验工作目录和分支仍为 `D:/itemWork/bushu/yunwei/template-tauri`、`opspub`，HEAD `4c3f89c`。当前终端源码 Git 对象哈希为 `dd06b1bd44c1a635c7600ba0abb56f95c5c430b2`。

### 阻断项：B1 · 恢复后丢弃缺口中的不同序号输出

- **位置**：`src/pages/terminal/index.tsx:189–201,237–238`。
- **已通过的部分**：快照覆盖相同 sequence 的事件不再重放；不同 sequence 的相同文本在恢复缓存完整到达时均保留；700,018 字符快照逐字一致，无额外截断；延迟到达的已覆盖事件、重复实时事件不会增加输出。原先两个 B1 反例已修复。
- **本轮定向反例**：同一 `term-101`，让恢复快照保持待返回；先收到 `sequence=3`、内容 `same-line\r\n` 的事件；随后返回 `outputSequence=1`、内容 `snapshot-base\r\nsame-line\r\n` 的快照；待恢复完成并选中 Alpha，再送达此前迟到的 `sequence=2`、内容同样为 `same-line\r\n` 的独立事件。三个序号对应三条真实合成输出，重复投递并未参与此场景。
- **预期**：保留 seq=1、2、3 对应的三条 `same-line`，按序合并；不能因为 seq=3 已先到就把尚未覆盖的 seq=2 当作重复。
- **实测**：亮色 1440×900、暗色 1100×700 均为 `B1_GAP snapshotSeq=1 queuedSeq=3 lateSeq=2 sameTextCount=2 expected=3 opens=[]`。夹具断言退出 1，seq=2 输出丢失。没有发起任何新连接。
- **原因**：`restoreOutput` 仅排序当时已经到达的缓存，追加 seq=3 后将高水位推进到 3，没有记录 seq=2 缺口；实时监听随后以 `sequence <= lastSequence` 丢弃 seq=2。“已见最大序号”被当成了“已连续覆盖序号”。这仍违反本轮“不同 seq 即使文本相同需保留”的输出恢复目标，故继续作为 B1 阻断，而非新增无关验收范围。
- **建议**：跨恢复/实时阶段统一维护快照覆盖边界、已接收事件及未补齐缺口；不能单凭最大已见序号判断重复。若要依赖实际 IPC 对同一会话严格有序，则需给出适用的保证和证据，并明确调整当前乱序容忍约定。
- **证据边界**：这是合成事件乱序跨越快照响应边界的确定性反例；真实 Tauri 事件能否出现相同顺序仍未验证。没有把合成失败声称为已发生的真实 SSH 故障。

### 已解决：B2 · 结束状态、迟到事件与目标重连

- `restore-late-connected` 两组均通过：恢复期间依次发送 closed、旧 connected、过期 connected 快照，旧会话从侧栏和横向标签消失；重连挂起期间只有 `opens=[202]`，没有误触其他服务器或额外 close；再发旧 ID 状态和输出也未恢复旧标签。
- `restore-race` 两组均通过：仅对 202 重连一次，最终一条新会话；新会话响应之前的事件能按其快照序号合并，快照已含的块只显示一次，新块继续保留。
- `restore-extended` 两组均通过：error 后仅对目标 202 发起一次打开，并进入 `SSH 验证 · Synthetic Beta` 原有验证窗；303 的断开标签和输出仍可查看。
- 静态核对 `canApplySessionStatus`（102–110）及状态监听（246–249）确认 closed/error 不被 connected 回退；首次恢复及 open 返回均调用状态协调，直达还按 `observedStatuses` 再判断目标并清理旧 ID（442–467）。本轮未发现 B2 剩余阻断。

### 实际运行与证据

实现方证据先行审阅：`%TEMP%/opspub-step03-round3-SaSTHG/{restore-overlap-cap,restore-late-connected,restore-race,restore-extended,flow}.log`，与其报告的读数一致。独验将 `adversarial.tsx`、`run-adversarial.cjs` 复制到 **`%TEMP%/opspub-step03-round3-review-e7f122f4/`**，从当前真实 TSX 打包，仅在临时副本加入上述一个反例。

下列命令均为 `node <独验证据目录>/run-adversarial.cjs <case>`，每个用例各运行亮色 1440×900、暗色 1100×700：

| 用例 | 退出码 | 独验实际结果 |
| --- | --- | --- |
| `restore-overlap-cap` | 0 | 两组均为 `snapshotLength=700018 actualOutputLength=700018 historyKept=true event0000Count=1`；快照内事件和重复实时事件各最多一次。 |
| `restore-late-connected` | 0 | 两组均旧标签消失、挂起时 `opens=[202]`；晚到旧事件被忽略；最终只显示新会话。 |
| `restore-race` | 0 | 两组均先到输出保留，新连接响应前的输出与快照正确合并，目标打开一次。 |
| `restore-extended` | 0 | 两组均不同 seq 的相同文本保留，恢复前已到齐的乱序缓存按 seq 重放；进入目标原验证窗。 |
| `restore-gap-late` | 1 | 两组均 `sameTextCount=2 expected=3`，复现 B1 缺口输出丢失。 |

汇总日志为独验目录 `results.log`，包含每个用例名和实际退出码；对应十张截图为 `adversarial-<case>-<theme>-<width>x<height>.png`。源夹具及 runner 可复跑，报告旧版副本为 `previous-review.md`。没有复跑无关的 `flow`，其结果仅作为实现方证据阅读。

### 非阻断项与未验证项

- Rust `publish_output`（`src-tauri/src/services/terminal.rs:450–467`）在同一条会话记录写锁内更新文本与 `output_sequence` 后再发事件；`list`（182–187）克隆同一条记录。`TerminalSessionInfo.outputSequence`、`TerminalOutputEvent.sequence` 的 TS 字段与 Rust `camelCase` 序列化一致。该改动已解决快照与序号不一致及单纯按文本判断重复的问题。
- 本轮只确认同版本前后端序号契约的静态接线及合成事件行为。实现报告中 Rust 五项测试、类型检查和生产构建的成功是实现方回报，本验收未重复执行，不算作本轮独立运行结果。
- 真实 Windows Tauri/WebView2、实际 IPC 调度与交付顺序、真实 SSH/PTY、系统凭据验证、指纹审批及原生窗口均未验证。出现凭据窗是模拟缺失凭据错误的前端流程验证，不等于真实认证成功。
- 本轮沿用已有构建 CSS，所有资产为 `.invalid` 合成值，IPC/事件为 Tauri mock，Edge 页面有离线 CSP。没有启动项目服务、连接服务器或访问凭据。

### 变更边界与停止

独验前后 `src/pages/terminal/index.tsx`、`src/types/terminal.ts`、Rust terminal service/models、`Router.tsx`、`AppLayout.tsx` 六个文件的哈希逐项相同，暂存区为空，HEAD 未变。仓库仅更新本报告，临时夹具和证据写入上述临时目录；未修改业务代码、暂存、提交、推送或派发任务。参考 `check`、`test-development`。**本轮到此结束；B2 可关闭，B1 建议继续返工或由总控明确有序交付保证后裁决。**

## 上轮返工复验结论（历史，2026-11-20）

**结论：仍阻断。B1、B2 的原始反例已修复，但各有一个同范围边界反例，两项暂不关闭。** 本轮仅检查快照/事件合并、断开状态、迟到事件及目标重连，没有重复侧栏、折叠、菜单、SFTP 或构建验证。下方“首轮记录”为历史，本节是当前裁决依据。

先读取通用清单、基线、首轮报告及最新实现报告，尤其区分“中间复验”和“首批最终返工”的不同输出合并策略。最终代码为直接追加待恢复输出，不再去重。复验时分支仍为 `opspub`，HEAD `4c3f89c`，终端源码 Git 对象哈希 `73fcc02c5ce82efc0e54c0a514928632a2f5fa84`。

### 当前阻断项

#### B1 · 快照包含待合并输出时，重复追加触发不必要的历史截断

- **位置**：`src/pages/terminal/index.tsx:93–96,237`。
- **已修复部分**：原来的“较早快照覆盖先到事件”不再丢失该事件；独立复跑 `restore-race` 两组均为 `alpha event kept=true`。
- **本轮反例**：复用现有离线夹具，监听就绪、首次快照待返回时，向 `term-101` 发送共 100,000 个 ASCII 字符的合成输出，每块最多 4,096 字符；随后返回**已包含这些输出**的 700,018 字符快照，开头包含唯一标记 `B1_HISTORY_START`。选择 Alpha，读取实际传给 `TerminalPane` 的 `output` prop（通过 React fiber 只读检查，不替换合并函数），检查唯一历史标记和 `B1_EVENT_0000_` 出现次数。
- **两组实测**：`B1_OVERLAP snapshotLength=700018 actualOutputLength=600000 historyKept=false event0000Count=2`，断言退出 1。快照本身未超过 750,000 的上限；重复追加把它推至 800,018，触发截取最后 600,000，额外删去前 200,018 字符历史。重复事件仍出现两次。这已超过偶发重复一行的显示瑕疵，造成原本无需截断的历史丢失，**B1 继续阻断**。
- **静态佐证**：后端 `src-tauri/src/services/terminal.rs:351–352,365–366` 先写 `output_history` 再发事件，`:188` 的列表又读取该历史；“先订阅后取快照”确实可能让同一输出同时进入事件和快照。当前合并无重叠范围识别。
- **返工建议**：明确快照与事件的覆盖边界，例如会话输出偏移/序号或等价的可证明协调机制。不能仅凭文本相同删除输出，因为相同文本也可能是两次真实输出；也不能把无条件追加视为无损恢复。

#### B2 · 恢复期间 closed 后到达的旧 connected 仍可复活结束会话

- **位置**：`src/pages/terminal/index.tsx:196–199,233–235,391–411`。
- **已修复部分**：只发送 `closed/error` 后再返回旧 `connected` 快照时，旧目标标签被移除，目标 202 仅打开一次，分别能得到新会话或进入原 SSH 验证窗；在标签清理之后注入旧 ID 的迟到事件，也没有复活旧标签。这些在 `restore-race`、`restore-extended` 两组均通过。
- **本轮反例**：相同首次直达 Beta（202）场景，仍在恢复期间依次发送 `term-202` 的 `closed` 事件和迟到的旧 `connected` 事件，然后返回含 `term-202: connected` 的较早快照。
- **两组实测**：`B2_LATE_CONNECTED status=connected opens=[] tab=Synthetic Beta`，断言退出 1。旧标签显示为可用连接，目标 202 没有收到重连请求，也没有进入凭据流程。**B2 继续阻断**。
- **原因**：`pendingStatuses.set` 仅保留最后收到的状态，丢掉该 ID 曾经结束的事实；恢复合并看到 `connected` 快照与最后的 `connected` 事件便判为可复用。`discardedSessionIds` 要到直达识别已结束会话时才写入，因此挡不住恢复完成前到达的旧事件。源码已有“同一个会话 ID 结束后不会再次连接”的约束，可据此保留结束状态的单向性。
- **边界说明**：这是按本轮“迟到事件应被忽略”要求在合成事件调度中复现的结果；真实 Tauri/SSH 通道是否以及多久会出现这种迟到顺序未测，未声称已有真实远程事故。

### 本轮运行与证据

证据目录：`%TEMP%/opspub-step03-rereview-cb835065/`。先复制实现方最终夹具 `%TEMP%/opspub-step03-final-1K8Ie3/`，仅在本次临时副本增加上面两个定向反例；夹具仍从当前真实 TSX 源码打包，沿用已有构建 CSS，Tauri IPC/事件均为 mock，资产均为合成 `.invalid` 域名。

| 命令（均为 `node <本轮目录>/run-adversarial.cjs <case>`） | 亮色 1440×900 / 暗色 1100×700 | 证据 |
| --- | --- | --- |
| `restore-race` | 均通过，退出 0；先到输出保留；closed 目标移除，迟到事件不重现旧标签，仅对 202 建立新模拟会话。 | `results.log` |
| `restore-extended` | 均通过，退出 0；相同真实新文本保留，事件顺序正确；error 目标只请求 202 并进入对应 SSH 验证窗；其他服务器的断开标签保留。 | `results.log` |
| `restore-overlap-cap` | 均失败，退出 1；快照内已含的输出重复，触发历史截断，B1 读数如上。 | `results.log` |
| `restore-late-connected` | 均失败，退出 1；结束状态在恢复前被旧 connected 覆盖，B2 读数如上。 | `late-connected.log`；`results.log` 保留首次超时断言，补充明确状态读数后重跑得到本列结果。 |

可复跑源文件为本轮目录中的 `adversarial.tsx`、`run-adversarial.cjs`。每个场景各有两张 `adversarial-<case>-<theme>-<width>x<height>.png`，共八张。B1 缓冲完整性以真实组件 prop 的只读检查及日志为证据，截图不替代长缓冲断言。首轮报告副本保存在本轮目录 `previous-review.md`。

### 非阻断项与未验证范围

- 实现报告对 IPC 无序号、快照覆盖事件可能重复的限制已如实披露；本次没有把两次独立而相同的真实输出当成应删除的重复。B1 反例明确把**同一段已发生输出**放入随后取得的快照，验证的是重复回放及其截断后果。
- 真正远程 SSH/PTY、系统凭据、指纹确认、审批、Windows Tauri/WebView2 原生窗口仍未验证；生产构建本轮未重跑。本轮通过项只说明离线合成场景结果。
- 其余首批验收结果及既有接线交付依赖沿用首轮记录，不重新授予全量通过结论。修复后的中间版本行为不作为最终版本证据。

### 操作边界及交付

本轮开始/结束的终端源码、`Router.tsx`、`AppLayout.tsx`、`TerminalSidebar.tsx`、`terminal-workspace.css` 五个哈希一致；暂存区为空，HEAD 未变。只修改本报告，夹具、日志及截图均放临时目录，未改业务代码、暂存、提交、推送或派发任务。报告为 UTF-8 无 BOM。参考技能仍为 `check`、`test-development`。**复验结束，建议继续针对 B1/B2 返工，本会话停止。**

## 首轮记录（历史）

**结论：阻断，建议本轮不通过，等待返工。** 共两项阻断，均在合成资产、离线 Edge 夹具中稳定复现；它们共用“首次恢复快照覆盖先到事件”的根因，分别影响输出完整性和直达目标的连接状态。本次没有修改业务代码、暂存、提交、推送或派发后续任务。

检查日期：2026-11-20。工作目录 `D:/itemWork/bushu/yunwei/template-tauri`，分支 `opspub`，HEAD `4c3f89c`。先读取 `review-checklist.md`、`baseline.md`、`state.json`、`step-03-implementation.md` 及实现方夹具，再复跑正常路径、构造反例。原型 `docs/ops-prototype-direction2-workspace.html` 的 SHA-256 仍为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D`。

## 阻断项

### B1 · 恢复期间已收到的终端输出被快照覆盖

- **位置**：`src/pages/terminal/index.tsx:163–167,193–201`。
- **复现**：首次从合成资产 Beta（202）直达终端，延迟 `list_terminal_sessions` 的返回；确认两个终端事件监听器已经登记；向 Alpha（`term-101`）发送 `alpha-after-snapshot` 输出事件；随后让列表返回较早快照，其中 Alpha 的输出只有 `alpha-snapshot`；切到 Alpha 查看实际 xterm 文本。
- **预期**：快照之后已接收的输出仍然可见。
- **实测**：亮色 1440×900、暗色 1100×700 均得到 `RESTORE alpha event kept=false xterm="alpha-snapshot"`，新增输出消失。`setTerminalOutputs(Object.fromEntries(...))` 整体替换了事件处理器此前写入的缓冲。
- **影响与建议**：终端恢复会静默丢失已收到的输出，破坏本批会话恢复与输出保留目标。建议在恢复期间缓存事件，并明确快照与增量的顺序及去重边界；返工需覆盖“输出先到、快照后到”。单纯交换监听与列表调用顺序可能引入另一侧的丢失窗口。
- **归属说明**：HEAD 中旧终端也存在无条件覆盖输出的模式，因此不宣称是本批新引入；本批重做了恢复及保活流程，现有交付仍可复现此缺陷，应在本轮恢复验收闭环。

### B2 · 恢复期间的断开状态丢失，直达复用已结束会话

- **位置**：`src/pages/terminal/index.tsx:165,203–214,347–355`。
- **复现**：同一独立场景，首次直达 Beta（202），保持恢复列表待返回；监听就绪后发送 `term-202` 的 `closed` 状态事件，模拟后端已结束该会话；再返回较早的列表快照，其中 Beta 为 `connected`。
- **预期**：保留新状态；直达不能把已结束的会话认作可用，应进入针对 202 的连接流程。
- **实测**：两种主题及尺寸均为 `RESTORE beta status=connected opens=[] active=Synthetic Beta`：界面仍认作已连接，`open_terminal_session` 对 202 的调用次数为 0。状态回调仅映射当时的空会话数组，随后 `setSessions(restored)` 接受过期状态；直达判断据此走可复用分支。
- **影响与建议**：本批明确要求的“断开会话不得复用”在首次恢复竞态下失效，用户会进入已经结束的终端。建议恢复过程中按会话 ID 保留最新状态，完成协调后再作直达复用判断；返工需覆盖“closed/error 先到、connected 快照后到”。
- **归属说明**：旧实现也存在列表覆盖/空数组状态丢失的条件；本批增加的等待恢复及直达复用分支仍受其影响。真实 SSH 下的发生概率与实际 PTY 生命周期未验证。

**两项共同证据**：`%TEMP%/opspub-step03-review-cba0c8ad/restore-race.log`；脚本 `run-adversarial.cjs`、`adversarial.tsx`，复跑命令 `node <该目录>/run-adversarial.cjs restore-race`。整体断言退出码 1。截图 `adversarial-restore-race-light-1440x900.png`、`adversarial-restore-race-dark-1100x700.png`。同一个竞态场景同时观察并输出两项读数，未把它们伪装成两个独立根因。

## 已通过的实际检查

证据目录统一为 `%TEMP%/opspub-step03-review-cba0c8ad/`。

| 检查 | 实测结果与证据 |
| --- | --- |
| 实现方离线夹具独立复跑 | 将原脚本和夹具复制到本次临时目录，运行 `node <目录>/run-isolated.cjs`，退出 0。亮色 1440×900、暗色 1100×700 各完整通过，日志 `baseline.log`，截图 `fixture-light-1440x900.png`、`fixture-dark-1100x700.png`。 |
| 直达与正常恢复 | 列表先于恢复到达时不开 SSH；202 复用现有会话；303 的断开旧会话不被复用，只请求 303；505 缺少凭据时进入既有验证窗。以上均为模拟 IPC。 |
| 侧栏、标签、折叠 | 101/202 切换时，侧栏、横向标签、窗格和全局 serverId 一致；折叠为 inert、宽度 0，展开保留选择；工具栏选择器仍可用；RDP 被排除。 |
| 多会话关闭目标 | 增补夹具关闭未选中的 `term-101`，只发送该 ID，Beta 保持选中；再关闭已断开的 `term-202`，只追加该 ID，回落到 606。两种主题/尺寸均通过，`flow.log`。 |
| 断开会话 | 正常恢复结束后发送 Beta 的 closed 事件，侧栏显示已断开；仍可选择并看到断开遮罩和对应消息；关闭后移除正确标签。 |
| 重复打开 | 已有 Beta 再从选择器打开，前端发送一次 open，模拟后端按现有管理器语义复用同一 ID，界面仅一个标签；606 的 open 尚未返回时连续选择两次，只有一次 IPC、一个最终标签。**未以此证明真实 SSH 无重复握手**。 |
| 菜单切换与订阅 | 增补三轮资产页/终端切换；后台各发送一条输出，回来后各仅出现一次；两类终端事件的监听登记数始终为 2、恢复列表次数为 1，无额外 open。后台终端不覆盖其他页设置的全局服务器 ID。 |
| 既有 SFTP 浮窗隔离 | 只向传输 Store 注入合成上传任务，不触发上传；三轮菜单切换中，同一个 SFTP 浮窗 DOM 保持挂载，模拟进度从 10% 更新至 20%/21%/22%。真实 SFTP 连接和传输未验证。 |
| TypeScript | 独立执行 `pnpm.cmd exec tsc --noEmit`，退出 0。 |
| 前端构建 | 执行 `pnpm.cmd build --outDir <证据目录>/dist-review --emptyOutDir`，退出 0；5,228 个模块，43.09 秒，保留既有大分块告警。日志 `build.log`；CSS/JS 文件名与实现报告一致。输出写临时目录。 |

增补正常流程命令 `node <证据目录>/run-adversarial.cjs flow`，退出 0，两种主题/尺寸均完成；证据 `flow.log`、`adversarial-flow-light-1440x900.png`、`adversarial-flow-dark-1100x700.png`。全部资产为 `.invalid` 域名及合成 ID，IPC/事件由 Tauri mock 接管，HTML 设置离线 CSP，未访问真实服务器、凭据或数据库。

## 非阻断项与验收边界

1. **保活接线交付依赖**：`Router.tsx:71` 将终端路由交给外壳，`AppLayout.tsx:112–116,188–191` 保持 TerminalPage，`AppLayout.tsx:199` 仍挂载 SFTP 浮窗。实现报告已说明这两处为开工前工作区改动。若只提交三个终端文件，会缺少保活接线，建议总控按终端相关补丁一起裁决，同时保留 SFTP 既有改动；本验收没有暂存任何文件。
2. **原型符合度边界**：已静态对照原型 2646–2676 的侧栏会话/SSH 标识及 21506–21572 的标签切换、关闭与打开语义，当前会话计数和选择器使用实际状态。快捷命令、分屏、输入和 Ctrl+K 按 state.json 的首批/第二批划分留待后续。没有采集原型渲染截图，也未证明像素一致。
3. **关闭失败提示后的状态恢复**：`closeSession` 先移除本地状态、后报告接口错误的模式为既有行为。本轮只验证成功及已断开会话的关闭目标，失败后的重试和后端仍存活情形未实测，不列新增阻断。
4. **未验证**：真实 SSH/PTY、凭据验证与系统凭据管理器、指纹确认、审批、真实 SSH 并发去重、SFTP 上传下载、Windows Tauri/WebView2 默认/最小窗口及原生窗口按钮、滚动/选区/光标/全屏程序恢复。没有将浏览器视口尺寸替代真实 Windows 窗口验收。当前可用工具目录无项目任务登记/扫描/启动接口，未启动项目服务或桌面应用；只启动和退出本次专用离线 Edge 子进程。

夹具准备中曾出现默认返回值误触发更新弹窗、连续下拉动画导致命中断言超时；修正 mock 更新返回值及通过既有工具栏执行重复打开后，正常流程两组完整通过。它们属于夹具准备问题，不作为产品缺陷。恢复竞态在最终夹具中两组仍失败。

## 变更隔离与最终状态

验收前后逐项核对 14 个关键文件的 `git hash-object`，均未改变：`src/Router.tsx`、`src/components/layout/AppLayout.tsx`、`src/store/index.ts`、三个终端文件、`src/pages/sftp/index.tsx`、`src/lib/api/sftp.ts`、`src/components/layout/SftpTransferWidget.tsx`、`src/store/sftp-transfers.ts`、Rust SFTP command/service、`src-tauri/src/lib.rs`、`src-tauri/src/models/mod.rs`。暂存区始终为空，HEAD 保持 `4c3f89c`，工作区原有改动保留。构建和夹具保存在临时目录；仓库仅新增本报告。

**需总控裁决**：本轮建议按 B1/B2 返工；接线补丁边界在后续提交前一并确认。本验收到此停止，等待返工结果，不派后续任务。

已参考技能：`check`、`test-development`。技能中的默认报告目录及自动修复建议服从本次明确指定的报告路径与只审查约束。
