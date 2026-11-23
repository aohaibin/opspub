# 第 12 步 · 审批子批次实施回执

审批子批次已实现。最终前端构建、四组 Edge 合成 IPC 用例和相关 Rust 测试均通过。

## 实施范围

- 沿用「安全与治理 → 安全闸门与审批」双轨入口。工单和历史详情使用 `#/security?approvalId=<id>`，视图、选中的工单及其最新状态可在重载后恢复。审批页和详情分别提供通往现有审计页的入口。
- 待审批卡片和详情显示目标、来源、服务器 AI 策略和真实有效期。详情补充已保存的计划步骤、风险和验证信息。AI 操作锁跟随顶栏状态，锁定时禁用批准，待审批工单仍可驳回。
- 复用 `list_ai_approval_details`、`approve_ai_approval`、`reject_ai_approval` 及 `copilot-approval-changed`。在到期时禁用卡片、详情和已打开的确认弹窗中的裁决入口，刷新会读取后端结果。提交时同步拦截重复点击，Rust 继续执行原有的有效期、目标与策略校验。
- 审批列表可独立于规则与策略配置加载。读取失败时保留最近一次可读结果并暂停裁决。驳回失败后保留原因，后续裁决由用户再次确认。命令、计划、结果和驳回载荷遮蔽可识别的凭据参数。
- 本机策略偏好沿用现有配置键。统计基于现有审批接口返回的最近 100 条记录。关联审计入口打开现有审计列表，审批和审计接口当前没有可用于按审批 ID 跳转的公共字段。

代码变更限于 `src/pages/security/index.tsx`、`security.css`、`ApprovalDetails.tsx` 与 `approval.ts`。

## 验证

| 实际命令 | 最终结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0 |
| `pnpm run build` | 退出码 0。Vite 提示部分分块超过 500 kB |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib -- copilot_policy services::copilot::tests` | 31 项通过，0 项失败。保留既有 `AlertRule` 未构造警告 |
| `node (Join-Path $env:TEMP 'opspub-step12-approval.cjs')` | 退出码 0。亮色和暗色各跑 1100×700、1440×900，每组 57 项，合计 228 项断言通过 |
| `node (Join-Path $env:TEMP 'opspub-step12-approval-prototype/capture-prototype.cjs')` | 退出码 0。四组原型截图，原型 SHA-256 为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D` |
| `git diff --check -- src/pages/security` | 退出码 0。Git 提示工作副本换行符可能转换 |

合成用例覆盖双轨高亮、折叠后队列保留、锁定及顶栏解锁联动、规则库失败隔离、策略偏好保存、详情预览及重载、批准前二次确认、快速双击只发一次批准 IPC、执行中到完成、驳回失败后保留并重试原因、打开确认后超时、超时后按钮禁用且零裁决 IPC、列表读取错误和刷新恢复、脱敏显示、重载后历史结果、前往审计及返回。通过几何断言检查页面宽度及详情与弹窗的底部操作。早期夹具在抽屉入场动画中测量或点击，等待动画稳定后复跑完整通过。

最终实现截图在 `%TEMP%/opspub-step12-approval-gPigQx/`，包含队列、详情、批准确认、超时确认和历史。原型截图在 `%TEMP%/opspub-step12-approval-prototype/`。

## 未验证项与工作树

浏览器使用隔离 Edge、回环静态服务和 Tauri `mockIPC`。当前工具中没有项目任务系统。原生 Windows Tauri/WebView2 窗口、原生事件时序、真实远程执行及真实审计落库未验证。本轮仅使用合成记录。

本次没有暂存、提交、推送或写入 `state.json`。期间观测到 `state.json` 的 SHA-256 从 `5C159976A634B56CBC15279C7D11DA81CEDAEEF359486A55FC080B2B25F2CEFD` 变为 `DAA0FBFE126279975B4AE09A811BF6E321A106FB7965C6BEF799AC7D4862A4A0`。

已参考 `project-navigator`、`ui-frontend`、`theme-system` 与 `test-development`。
