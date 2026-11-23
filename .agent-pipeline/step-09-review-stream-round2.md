# 第 09 步 R1 返工独立验收 Round 2

**结论：PASS。** R1 原阻断已在本次离线独立复验中关闭；N1、N2、N3 定向回归均通过。本轮没有发现阻断项。

验收日期：2026-11-22。先读通用清单 `.agent-pipeline/review-checklist.md`、前轮独立验收 `.agent-pipeline/step-09-review-stream.md` 和返工回执 `.agent-pipeline/step-09-stream-implementation.md`，再核对 Copilot 实现、定向测试及实现方验证记录。实现涉及 `src/pages/copilot/index.tsx`、`src/pages/copilot/approval-preview.ts`、`src/pages/copilot/chat-state.ts`、`scripts/test-copilot-stream.mjs`。本轮未改业务代码、未暂存、未提交。

## 阻断项

无。R1 反例结果符合预期：

1. 合成会话 A、B 同时发起请求，分别对应服务器 101/102；B 的待审计划 802 先返回并打开审阅。
2. A 的待审计划 801 后返回。当前页面仍为 B，预览仍显示合成服务器 BETA / 计划 802；后台结果没有覆盖正在审阅的计划。
3. 点击“批准并执行”之前没有批准 IPC；点击后仅记录一次 `approve_ai_approval({ id: 802 })`，没有调用 801。

实际运行：`node (Join-Path $env:TEMP 'opspub-step09-r1-confirm-0542c56c/run-extra.cjs') r1-confirm`，退出码 0。日志及截图证据：`C:\Users\ao\AppData\Local\Temp\opspub-step09-r1-confirm-0542c56c\r1-confirm.log`、`step-09-r1-confirm-B-before-A-finishes-dark-1440x900.png`、`step-09-r1-confirm-B-after-A-finishes-dark-1440x900.png`。日志确认预览上下文为 BETA / 802，确认前调用数为 0，确认后捕获的唯一调用是 `approve_ai_approval`，参数 `id: 802`。

## N1–N3 回归

独立离线夹具实跑：`node (Join-Path $env:TEMP 'opspub-step09-stream-independent-b4e893bf/run-isolated.cjs') r1-full`，退出码 0。四组主题/视口组合（light/dark × 1440×900/1100×700）全部结束，夹具报告均为 `findings: []`、`count: 0`。

- **N1 离页返回：通过。** 离页期间的增量仍保存；重返立即恢复正文、进度、服务器别名与忙碌状态；分别验证在途请求返回后结算，以及离页时已结算后返回，都显示最终答复并解除忙碌。
- **N2 会话隔离：通过。** A 的状态不会泄漏到 B；B 可独立提交到服务器 102；A 结算不解除 B 的忙碌状态、不覆盖 B 的正文或进度。
- **N3 结束后迟到 delta：通过。** `done`、`error` 和 Promise 结算后到达的增量均被忽略；错误结算不会恢复生成状态，旧请求迟到事件不会改写同会话的新请求。

独立定向测试：`node --test scripts/test-copilot-stream.mjs`，7/7 通过，包含 N1、N2、N3 与 R1 store 测试。实现方记录的全矩阵日志为 `C:\Users\ao\AppData\Local\Temp\opspub-step09-stream-independent-b4e893bf\r1-full.log`；本轮另以运行 stdout 复核四个组合。

## 非阻断项

- **原生 Tauri 未测。** 本轮夹具使用 Windows 隔离 Edge 与 Tauri `mockIPC`，合成会话、服务器、审批数据，不连接真实主机或后端。WebView2 原生事件时序、Rust 审批执行及审计落库仍未验证；这属于环境覆盖缺口，不影响本轮前端独立验收 PASS。
- 当前工作区存在多处其他会话/步骤改动。本轮只读取相关文件，报告为唯一新增文件。

## 使用技能

`bug-detective`、`check`、`test-development`。
