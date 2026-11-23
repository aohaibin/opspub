# OpsPub 第 12 步告警阻断返工复验

**结论为通过。** 在 `opspub` 分支 `fd08765` 的当前工作树上，两项原阻断均已关闭。复验前核对了上轮报告、返工实施回执、通用验收清单及告警页、共享 store、通知入口和样式的当前差异。 [实施回执](step-12-alerts-implementation.md) · [通用验收清单](review-checklist.md)

## 阻断项

1. **离页后迟到采样写回，已关闭。** 暂扣首次 40% 探针，离开告警页再进入。先返回第二次 97% 探针并等待活跃事件落入 mock 持久层，再释放旧探针。四组均无新增 `set_config("alerts.events")` 调用，同一事件保持 `active / 97%`，在活跃列表中可见。追加用例让旧 40% 探针先返回、暂扣它发起的告警历史读取，此时离页并重进。放行读取后旧实例写入 0 次，新实例采样 98% 后仅写入 1 次，沿用同一事件 ID。双主机定时监控用例手动触发已注册的定时回调，首台探针等待时离页。清理后剩余定时器 0 个，放行探针后第二台探针、历史写入和渠道发送均为 0 次。 [页面实例清理](../src/pages/alerts/index.tsx#L150) · [探针与历史读取后的失效检查](../src/pages/alerts/index.tsx#L179) · [定时器清理](../src/pages/alerts/index.tsx#L270)
2. **异常历史导致审批和通知工作区失效，已关闭。** 在审批路由分别以 `[null]` 和混合数组重新加载。审批卡 #918、通知浮层与待审批入口均可用，四组浏览器未捕获运行异常。`[null]` 显示空历史并提供重试。混合数组中的空值、缺字段、对象类型时间戳和重复 ID 共四条被排除，唯一有效事件仍出现在通知和列表中，角标为一条未读告警加一条待审批。坏数据仍在时，采样、静音和恢复入口禁用，历史写入为 0。将 mock 历史换成两条完整事件后在抽屉内重试，依次点击「静音 1 小时」和「标记已恢复」，两次写入分别为 `silenced + active`、`resolved + active`。两条事件 ID 均保留，另一条保持活跃，详情显示静音截止及恢复时间，角标保持 3。追加夹具最初漏算了本轮新增规则产生的第二条合法事件。根据实际 IPC 载荷修正预期后四组完整复跑。 [历史校验与写入门禁](../src/store/alerts.ts#L23) · [审批及通知渲染](../src/components/layout/header/AlertBell.tsx#L121) · [详情生命周期按钮](../src/pages/alerts/index.tsx#L520)

## 非阻断项

- 延续上轮记录。原型使用卡片和行内处置建议，当前实现使用六列表格和详情抽屉。筛选与详情可从 URL 恢复，页码由当前表格会话管理。四组的通知面板和详情操作按钮均在视口内。 [上轮验收记录](#上轮验收记录) · [事件表格](../src/pages/alerts/index.tsx#L482)
- 前端构建保留工作区外输出目录及大于 500 kB 的分块提示，Rust 定向测试保留既有 `AlertRule` 未构造提示。 [实施回执](step-12-alerts-implementation.md)

## 实际验证与证据

| 验证 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit`、`pnpm build --outDir <临时目录>` | 均退出 0。新构建生成 `index-GuB6lWeN.js` 和 `index-vv5HxvYU.css`，JS 的 SHA-256 与实施方产物一致。 |
| Rust 与 store | `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::alerts::tests` 通过 3 项，过滤 186 项。实施方 store 夹具复跑通过 15 项。 |
| Edge 与 Tauri `mockIPC` | 亮色、暗色各测 1100×700 和 1440×900。用本轮重新构建的产物复跑实施方夹具共 256 项，每组 64 项。追加夹具含原断言共 360 项，每组 90 项，覆盖历史读取期间卸载、定时回调清理、双主机剩余探针、混合数据冷启动及数据修复后实际写入。两次复跑均 0 组失败。 |
| 筛选、角标及旧入口 | 组合状态、已移除的历史服务器、级别、未读和关键词。通知预览最近五条，查看全部可到第六条。单条已读同步筛选和角标，全部已读保留待审批，乱序审批响应保留较新结果。四组另通过 24 项关闭并重开浏览器的断言，保留七条本地已读标记及 mock 生命周期状态。旧 `#/alerts`、规则、五类渠道、审批直达和终端入口可达，规则保存、飞书测试及终端目标 ID 经 mock 验证。 |
| 差异检查 | 告警相关跟踪文件 `git diff --check` 退出 0。新增 store 已直接读取并纳入构建和测试。 |

- 原夹具复跑的截图和 IPC 记录位于 `%TEMP%/opspub-step12-alerts-recheck-replay-y8u2HV/`。追加复验的亮色与暗色证据分别位于 `%TEMP%/opspub-step12-alerts-recheck-final-1ZFOM2/` 和 `%TEMP%/opspub-step12-alerts-recheck-final-YpJTOD/`。各组 `*-independent.json` 记录迟到采样、历史读取竞态、定时器清理及修复后的两份写入载荷，`*-mixed-history-notifications.png` 和 `*-restored-history-resolved.png` 记录对应界面。
- 在仓库根目录运行 `node (Join-Path $env:TEMP 'opspub-step12-alerts-recheck-final-137853de.cjs') light` 或将 `light` 换成 `dark`。末尾加 `persistence` 可复测关闭并重开。生产构建在 `%TEMP%/opspub-step12-alerts-recheck-build-137853de/`。

## 未验证

当前会话未接入项目任务系统，浏览器复验使用隔离 Edge、回环服务、合成数据及手动触发的监控回调。真实 Windows Tauri/WebView2、历史 SQLite 库、WebView 持久化、实际时钟触发、SSH、系统凭据管理器、真实审批裁决和渠道投递未验证。

本轮仓库内只更新本报告。已参考 `check`、`bug-detective`、`test-development`。

## 上轮验收记录

<details>
<summary>返工前的原始报告</summary>

# OpsPub 第 12 步告警子批次独立验收

**结论为阻断。** 两项问题均在亮色和暗色、1100×700 和 1440×900 四种组合中复现。较早启动的采样可以错误恢复较新采样触发的告警，格式异常的告警历史可以使审批等工作区页面无法使用。这两项需要返工。

验收基于 `opspub` 的 `fd08765` 工作树。在审阅告警子批次差异前，已核对通用验收清单、基线告警行、实施回执及原型的主轨通知、告警、规则和渠道。原型 SHA-256 为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D`。

## 阻断项

### 1. 离开告警页后，较早启动的采样可以错误恢复新告警

1. 使用空告警历史，给同一台合成 Linux 主机启用磁盘 ≥90% 规则。在 `#/alerts` 点「立即检查」，暂扣第一次探针的 40% 结果。
2. 切到 `#/copilot` 后返回 `#/alerts`，再次点击「立即检查」。先返回第二次探针的 97% 结果。告警出现，首次 IPC 写入的目标记录是 `active / 97%`。
3. 释放第一次探针的 40% 结果。第二次 IPC 写入将同一事件 ID 更新为 `resolved / 40%`。该事件从默认活跃列表消失，在历史中保留了恢复时间。

检查锁绑定到告警页实例。离开再进入会新建实例，第二次采样可在第一次完成前启动。较早启动的任务返回后会重新读取共享事件历史，并把其结果应用到新事件上。现有保存锁只能串行化写入。复验应确认上述顺序下，第一次采样的结果无法覆盖较新采样创建的告警。 [页面检查锁与采样](../src/pages/alerts/index.tsx#L154) · [采样后读取共享历史](../src/pages/alerts/index.tsx#L178) · [自动恢复和写入](../src/pages/alerts/index.tsx#L217)

### 2. 告警历史含空记录时，共享通知渲染使整个工作区失效

在隔离夹具中打开 `#/copilot`，让重载后的 `get_config("alerts.events")` 返回合法 JSON 数组 `[null]`，再刷新。路由显示 `Unexpected Application Error!` 与 `Cannot read properties of null (reading 'id')`，工作区内容和通知入口同时消失。该反例使用合成损坏数据，实际历史库出现此形态的频率未知。

加载只检查外层是不是数组，随即把全部元素放入共享状态。主轨通知在渲染中访问每项的 `id`，因此异常会扩散到所有使用该工作区布局的页面。复验应确认异常历史能保留可用的工作区和审批入口，告警错误可见且可重试，损坏数据未经处理时不会被生命周期写入覆盖。 [告警历史解析](../src/store/alerts.ts#L18) · [共享快照更新](../src/store/alerts.ts#L56) · [通知读取事件 ID](../src/components/layout/header/AlertBell.tsx#L82)

## 非阻断项

- 实现沿用原型的三类入口和六列顺序，使用表格及右侧详情呈现事件，原型使用含行内处置建议的卡片。实现加入筛选和摘要卡，详情使用现有规则建议。原型中的模拟健康态、AI 根因和自动修复在实施回执中已列明范围差异。四种组合中，静音和恢复按钮可在抽屉内操作，通知浮层在视口内，工作区无横向溢出。 [告警原型](../docs/ops-prototype-direction2-workspace.html#L11076) · [实施回执](step-12-alerts-implementation.md)
- 告警 URL 可恢复标签页、事件 ID 和筛选。页码仍由表格会话管理，已在实施回执注明。 [事件表格](../src/pages/alerts/index.tsx#L464)

## 实际验证

| 范围 | 观察结果 |
| --- | --- |
| 构建和定向测试 | `pnpm exec tsc --noEmit`、`pnpm build --outDir <临时目录>` 退出 0，生成 `index-B1PnngDx.js` 和 `index-vv5HxvYU.css`。Rust 命令 `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::alerts::tests` 通过 3 项，过滤 186 项。保留原有 Vite 大分块及 Rust `AlertRule` 未构造提示。 |
| 实施方夹具 | 将实施方的 CDP 夹具指向独立生产构建，四组各通过 50 项，共 200 项。包括已失效详情可关闭、写入错误、按钮互斥、静音、恢复、旧入口和合成探针。 |
| 独立浏览器反例 | 使用新的合成事件、审批和探针输入，复用 CDP 驱动与 Tauri `mockIPC` 接线。四组均检查了两个阻断反例。等待目标状态后读取页面及 IPC 请求体，断言中的反例以实际观察值记录。 |
| 筛选、排序与详情 | 七条乱序事件按最近发生时间排列。历史服务器、级别、生命周期、未读和关键词可组合。验证无匹配、详情刷新、读状态变化即刻移出未读筛选及抽屉关闭。通知仅预览最新五条，查看全部可以访问第六条。 |
| 空、读错与写错 | 首次数据库错误有重试，`NOT_FOUND` 显示空历史。恢复成功后再次读取失败，保留已加载列表。模拟写入失败保留静音态。延迟保存时禁用第二次生命周期操作，释放后静音和恢复写入原有配置键。 |
| 已读和角标 | 单条标记和通知直达同步到告警列表与角标。全部已读只清除告警的未读数，保留待审批。四组均通过真实关闭 Edge 进程并以同一独立用户目录重开，保留七条本地已读标记和刷新所需的 URL 状态。事件生命周期由夹具模拟持久层。 |
| 审批、告警与旧入口 | 从通知直达合成审批 #918，后退回告警，前进回审批。连续发两次审批变化事件，较新响应先到后，较旧响应未覆盖角标或审批链接。旧 `#/alerts`、规则、渠道、终端入口可达。规则新增通过原配置键保存并在重载后可见。五类渠道可见，模拟飞书发送使用原 IPC。终端链接携带正确的合成服务器 ID。 |

## 证据

- 实施方夹具复跑的 IPC 记录与截图位于 `%TEMP%/opspub-step12-alerts-evidence-uSu4Fn/`。
- 独立复测的亮色证据位于 `%TEMP%/opspub-step12-alerts-review-evidence-SnWwB9/`，暗色证据位于 `%TEMP%/opspub-step12-alerts-review-evidence-zWLivJ/`。其中 `*-independent.json` 记录同一事件 ID 的两次持久化载荷及路由错误，`*-older-probe-false-recovery.png` 和 `*-malformed-history-global-error.png` 记录界面结果。
- 四组原型截图与亮暗对照图位于 `%TEMP%/opspub-step12-alerts-review-prototype-q66A50/`。原型以本地静态依赖运行，截图中的示例主机使用替代值。
- 在仓库根目录运行 `node (Join-Path $env:TEMP 'opspub-step12-alerts-review-independent.cjs') light` 或传入 `dark`。末尾加上 `persistence` 可复测关闭和重开。复测使用临时构建目录 `%TEMP%/opspub-step12-alerts-review-build-6b3a8172/`。

## 未验证

当前会话没有项目任务系统，使用隔离 Edge、回环服务和合成 IPC。真实 Windows Tauri/WebView2、旧告警数据库、实际 WebView 持久化、实时定时采样、SSH 连接、系统凭据管理器、审批真实裁决和渠道投递均未验证。规则删除及渠道配置的真实保存、删除也未验证。

本轮只写入本报告，业务代码、暂存区和提交均无本轮变更。已参考 `check`、`test-development`、`ui-frontend`、`theme-system`。

</details>
