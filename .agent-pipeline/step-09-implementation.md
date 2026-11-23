# 第 09 步返工回执：B1、B2

## 返工结论

B1、B2 已按 `.agent-pipeline/step-09-review.md` 返工完成。历史会话现在复用现有二级栏槽位，随二级栏折叠和恢复，聊天区不再有第三栏。最小窗口存在多审批时，审批区和聊天区各自滚动，输入区和发送按钮保持在视口内并可点击。

第二轮独立复验发现永久放行状态会使 Copilot header 换行增高。本次补充将该 header 固定为单行，允许标题说明文本收缩并截断；锁控件及策略入口保持完整显示。补测覆盖四组主题/尺寸、三种锁状态及二级栏展开、收起和重新展开，200 项通过，0 项失败。

N1-N3 是复核报告中确认的既有流式生命周期问题，本次没有处理，也没有改变 IPC、权限、审批后端或 MCP 行为。

## 代码变更

仅修改 `src/pages/copilot/index.tsx`，并保留本步开始前的 Copilot 未提交主题差异。

- 使用现有 `WorkspaceSidebarSlot` 承载历史会话和服务器上下文。保留新建、搜索、切换、删除及完整历史管理入口。
- 移除聊天区内的历史第三栏。槽位通过现有 `WorkspaceNavigation` portal 到 `.workspace-subnav-slot`，二级栏收起时历史栏同步收起，展开时恢复。
- Copilot 顶部 header 保持单行，标题说明在窄布局中收缩截断，避免永久放行状态的长标签导致 header 增高并挤出 footer。
- 审批列表改为根布局中的 `max-h-52 shrink-0 overflow-y-auto` 独立滚动区。
- 聊天正文改为 `min-h-0 flex-1 overflow-y-auto` 独立滚动区，footer 使用 `shrink-0` 保持输入框和发送按钮可达。
- 未修改 `src/lib/api/copilot.ts`、Rust IPC、Capabilities、权限、MCP 页面或审批命令。

已有未提交主题差异快照仍为 `.agent-pipeline/step-09-copilot-before.tsx`，SHA-256 为 `EAE38C67ADCA7490EE43B823F5DB13E612C7F2B6DA635F8426AE7682F4C8A78F`。快照中的原有主题行未被本步修改或删除。

## 分批实测

离线夹具根目录为 `C:\Users\ao\AppData\Local\Temp\opspub-step09-review-20261122\`，使用隔离 Edge profile、Tauri `mockIPC`、合成服务器 101/102、合成历史和合成审批数据。未读取真实资料、凭据或主机。

执行命令：

```powershell
node "C:\Users\ao\AppData\Local\Temp\opspub-step09-review-20261122\run-isolated.cjs" current
```

返工夹具退出码为 `1`。退出码来自夹具保留的 N1-N3 流式断言失败，不是启动或 B1/B2 布局错误。四组 B1/B2 结果如下。

| 主题 | 视口 | B1 二级栏/历史 | 审批滚动 | 聊天滚动 | 输入/发送可见与命中 | 折叠联动 |
|---|---:|---|---|---|---|---|
| light | 1440x900 | PASS | PASS | PASS | PASS，发送按钮 `1327..1393 x 833..857` | PASS |
| light | 1100x700 | PASS | PASS | PASS | PASS，发送按钮 `987..1053 x 633..657` | PASS |
| dark | 1440x900 | PASS | PASS | PASS | PASS，发送按钮 `1327..1393 x 833..857` | PASS |
| dark | 1100x700 | PASS | PASS | PASS | PASS，发送按钮 `987..1053 x 633..657` | PASS |

关键合成证据：

- 四组均通过 `prototype history lives within collapsible secondary sidebar`、历史搜索、历史切换、活动会话删除持久化检查。
- 四组均通过 `collapse hides prototype conversation sidebar too`。收起后二级栏 `data-open=false` 且宽度为 `0`，历史槽位随栏隐藏。
- 四组审批区 `overflowY=auto`、`maxHeight=208px`，审批内容在独立滚动区内，示例 `clientHeight=207`、`scrollHeight=1364`。
- 四组聊天区 `overflowY=auto`。1100x700 多审批时 footer 仍为 `top=576.5`、`bottom=680`，发送按钮完整落在视口 `633..657`，并通过发送按钮 hit target、enabled 和合成发送检查。
- 1100x700 多审批下聊天可用高度为 `52.09375px`，这是审批列表独立滚动后剩余的聊天区域，输入区仍完整可见可点击。1440x900 多审批下聊天高度为 `299.921875px`。

保留的非本次范围失败项为流式状态隔离、其他历史会话输入锁定、迟到 delta、离页重挂载 busy 状态及原 Promise 最终结果，共五类 N1-N3 断言。它们在当前版复现，属于复核报告标注的既有问题，本次不修复。

## 构建与静态检查

| 检查 | 退出码 | 结果 |
|---|---:|---|
| `pnpm exec tsc --noEmit` | 0 | 通过 |
| `pnpm build` | 0 | 通过，Vite 转换 5234 个模块并完成构建 |
| `git diff --check -- src/pages/copilot/index.tsx` | 0 | 通过 |

构建仍有既有的 JS chunk 大于 500 kB 提示，本次未处理。

## 二轮 B2 补充复验

第二轮复验报告为 `.agent-pipeline/step-09-review-round2.md`。独立离线夹具在 `C:\Users\ao\AppData\Local\Temp\opspub-step09-round2-independent-20261122-Qf1ytD\`，其 `confirm-fixture.tsx` 通过 Tauri `mockIPC` 和隔离 Edge profile 使用合成会话、服务器及审批数据。确认场景不调用 `scrollIntoView`，发送按钮用 3x3 九点覆盖检查，并以 CDP 鼠标在按钮中心坐标发送。

执行命令：

```powershell
node "C:\Users\ao\AppData\Local\Temp\opspub-step09-round2-independent-20261122-Qf1ytD\run-batch.cjs" run-confirm.cjs confirm-current-rework current
```

夹具退出码为 `0`，统计 `200 PASS / 0 FAIL / 0 HARNESS_ERROR`，四个主题/尺寸场景各汇总 `findings=[]`。每场景分别覆盖锁定、30 分钟放行、永久放行，并在二级栏展开、收起和重新展开时检查几何。所有状态下 textarea、发送按钮和 footer 均完整处于 Copilot 页可见范围，发送按钮九点均命中。展开时审批区 `overflowY=auto`、高度 208px；聊天区 `overflowY=auto`。真实鼠标滚轮分别滚动审批区或聊天区时，另一滚动区位置保持不变。

几何记录如下。坐标为该组 viewport 内 CSS 像素，`footer`、`textarea` 和 `send` 取展开状态，三种锁状态和两种主题数值相同。

| 视口 | header 高度 | footer 顶/底 | textarea 顶/底 | send 顶/底 | send 中心 | 中心实点/合成发送 |
|---|---:|---:|---:|---:|---:|---|
| 1440x900 | 71.92px | 776.5 / 880px | 821 / 857px | 833 / 857px | (1360, 845) | PASS |
| 1100x700 | 71.92px | 576.5 / 680px | 621 / 657px | 633 / 657px | (1020, 645) | PASS |

展开、收起、重新展开三阶段的按钮九点命中均为 `9/9`。夹具合成 IPC 共记录每个主题/尺寸场景 6 次 `copilot_chat`，即三个状态下的展开与收起各发送一次；锁定态按照现有前端流程选择“仅只读模式”，未调用解锁命令。30 分钟和永久放行仅通过模拟 UI 状态，不执行审批命令。二级栏收起时可用宽度扩大，重新展开后永久态的按钮仍完整可见，未依赖页面滚动或隐藏审批。

本轮新代码验证：`pnpm exec tsc --noEmit` 退出码 `0`；`pnpm build` 退出码 `0`，转换 5234 个模块并完成构建，仍显示既有 >500 kB chunk 提示；`git diff --check -- src/pages/copilot/index.tsx` 退出码 `0`。之前首轮回执中的 `current-rework` 退出码 `1` 是旧夹具运行 N1-N3 断言的记录，不代表本次二轮确认夹具结果。本补测没有运行或修改 N1-N3。

## B2-R3 锁定菜单补修与复验

第三轮复验报告为 `.agent-pipeline/step-09-review-round3.md`。阻断原因是上轮为保持单行 header 增加的 `overflow-hidden` 裁切了 header 内 `absolute top-full` 锁定浮层。本次仅修改 `src/pages/copilot/index.tsx`，移除该 header 的 `overflow-hidden`，保留单行 header、文本收缩、发送区和锁状态语义。未修改 IPC、审批逻辑、N1-N3 或其他模块。

验证命令：

```powershell
node "C:\Users\ao\AppData\Local\Temp\opspub-step09-round3-independent-20261122-Fj8So1\run-batch.cjs" run-menu-final.cjs menu-current-r3 current locked
```

命令退出码为 `0`，亮暗 × 1440x900/1100x700 共 `32 PASS / 0 FAIL / 0 HARNESS_ERROR`。临时夹具逐一打开并以真实 CDP 中心鼠标点击 `30m`、`2h`、`1d`、`永久`，未调用 `scrollIntoView`。每个按钮九点均命中，中心点击后 `set_ai_lock` 调用数按 0→1→2→3→4 增加，header 和页面 `scrollTop` 始终为 0。

1100x700 展开状态的锁菜单按钮纵向范围均为 `223.78125..252.4375px`，中心纵坐标为 `238.109375px`，横向中心分别为 `683.25px`、`751.75px`、`820.25px`、`888.75px`。菜单没有依赖页面滚动或隐藏审批内容。

本轮实际验证命令的退出码：`pnpm exec tsc --noEmit` 为 `0`，`pnpm build` 为 `0`，`git diff --check -- src/pages/copilot/index.tsx` 为 `0`。构建仍有既有的大 chunk 提示。

## 未验证

- 项目任务系统工具不可用，因此没有登记或启动任务，也没有启动 Vite/Tauri 应用。项目任务系统和原生 Windows WebView2 窗口交互均未验证。
- 未使用真实凭据、真实主机或真实资料，没有执行远程操作。所有浏览器验证使用临时隔离 profile 和合成数据。
- 未验证真实 WebView2 缩放/DPI、真实 IPC 事件顺序、真实审批执行和审计落库。

## 需决策 / 建议否决

- 需决策：无。
- 建议否决：无。B1、B2 离线夹具复验通过。N1-N3 保留另批，不作为本次返工的放行范围。

本次返工不提交、不推送。

已参考技能：`ui-frontend`、`test-development`、`task-tracker`。
