# 第 09 步 Copilot 流式回执

2026-11-22，`opspub`，基线 `f04d6d9`。

## 实现

- N1：Copilot 聊天状态与监听器随请求存活。离开页面后仍接收事件并保存最终回复，返回时恢复该会话的正文、进度和忙碌状态。
- N2：每个会话独立记录在途请求。进度、服务器别名和回复按会话及 `requestId` 写入。A 流式时 B 可以输入和发起自己的请求，A 完成也不会解除 B 的忙碌状态。
- N3：收到 `done` 或 `error` 后停止更新流式正文。原 Promise 仍可提交最终结果或错误。Promise 结束后，旧请求的迟到增量和重复结算均被忽略。

改动集中在 `src/pages/copilot/index.tsx`、`src/pages/copilot/chat-state.ts` 和 `scripts/test-copilot-stream.mjs`。保留现有 IPC、权限、审批和布局。仅完成第 09 步 N1–N3，未进入第 10 步，未修改 `state.json`，未暂存、提交或推送。

## 实测

当前环境没有项目任务系统接口。复用 `%TEMP%/opspub-step09-review-20261122` 的既有离线夹具，以隔离 Edge profile 和 Tauri `mockIPC` 驱动真实前端与合成事件。覆盖亮暗主题和 1440×900、1100×700 两种视口。未启动 Vite 开发服务器或原生 Tauri，也未连接真实主机或验证原生事件时序。

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `node (Join-Path $env:TEMP 'opspub-step09-review-20261122/run-isolated.cjs') stream-baseline` | 1 | 修复前四组均复现同 5 项流式断言失败，共 20 项失败。 |
| `node (Join-Path $env:TEMP 'opspub-step09-review-20261122/run-isolated.cjs') stream-fixed` | 0 | 228 项通过，0 项失败，0 项夹具错误。日志为夹具目录下的 `stream-fixed.log`。 |
| `node --test scripts/test-copilot-stream.mjs` | 0 | 新增 5 项测试全部通过，覆盖重新订阅、并发会话、成功和失败终止、迟到增量及旧请求重复结算。 |
| `pnpm exec tsc --noEmit` | 0 | 通过。 |
| `pnpm build` | 0 | 通过，Vite 转换 5235 个模块。保留既有超过 500 kB 的 chunk 提示。 |
| `git diff --check` | 1 | 既有未提交文件 `docs/remote-ops-ai-prototype.html` 第 37226、38720、38746、38769 行有行尾空白。 |
| `git diff --check -- src/pages/copilot/index.tsx` | 0 | 通过。新增源码与测试另行检查，无行尾空白。 |
| `node --test scripts/test-copilot-stream.mjs scripts/test-copilot-skills.mjs` | 1 | 本次 5 项测试通过。已有技能脚本直接在 Node 中运行时，Vite 的 `import.meta.glob` 不可用。 |

已参考技能 `bug-detective`、`ui-frontend`、`store-management`、`test-development`。

## R1 审批预览并发返工

复跑独立验收夹具，确认 B 先打开 802 后，A 的 801 回包会替换弹窗，随后确认会提交 801。返工后，请求打开的预览记录所属会话与 `requestId`。后台回包继续刷新全局待审列表。自动打开预览要求该请求仍属于当前会话，且当前没有正在审阅的预览。

弹窗确认及拒绝使用当前预览绑定的审批 ID。隐藏、已关闭或已替换预览的回调无法提交。列表仍可手动打开全局审批，消息入口则绑定所属请求。修改限于 Copilot 预览状态、入口和回归测试，保留 N1–N3、布局、IPC 参数和审批流程。

| 实跑命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `node (Join-Path $env:TEMP 'opspub-step09-stream-independent-b4e893bf/run-extra.cjs') r1-baseline` | 1 | 11 通过、1 失败，复现 802 被 801 替换且确认提交 801。 |
| `node (Join-Path $env:TEMP 'opspub-step09-stream-independent-b4e893bf/run-extra.cjs') r1-fixed` | 0 | 12 通过，后台 A 完成后弹窗仍显示 BETA / 802。 |
| `node (Join-Path $env:TEMP 'opspub-step09-r1-confirm-0542c56c/run-extra.cjs') r1-confirm` | 0 | 14 通过、0 失败。补测确认前无批准调用，点击后只捕获一次 `approve_ai_approval({ id: 802 })`，日志为同目录 `r1-confirm.log`。 |
| `node (Join-Path $env:TEMP 'opspub-step09-stream-independent-b4e893bf/run-isolated.cjs') r1-full` | 0 | 亮暗 × 两种视口共 228 通过、0 失败、0 夹具错误，日志为同目录 `r1-full.log`。 |
| `node --test scripts/test-copilot-stream.mjs` | 0 | 7 通过，含新增 2 项 R1 测试和已有 5 项 N1–N3 测试。 |
| `pnpm exec tsc --noEmit` | 0 | 通过。 |
| `pnpm build` | 0 | 5236 个模块构建完成，仍有既有 chunk 体积提示。 |
| `git diff --check` | 1 | 仍仅报告上表所列原型文件的 4 处行尾空白。 |
| `git diff --check -- src/pages/copilot/index.tsx` | 0 | 通过。预览模块与测试另行检查为 UTF-8 无 BOM，未发现行尾空白。 |

运行环境仍为隔离 Edge 与 Tauri `mockIPC`，未执行真实审批。完成 R1 后停止。未修改 `state.json`，未进入第 10 步，未暂存、提交或推送。
