# 第 09 步 N1–N3 独立验收

**结论为返工。** N1–N3 的流式正文、进度、服务器别名和忙碌状态通过离线验收。A、B 并发时，后台 A 的结果会更换 B 正在审阅的审批目标。这会使用户在同一个确认弹窗中提交另一台服务器的审批，故阻断本轮交付。

验收于 2026-11-22 在 `opspub` 分支进行，HEAD 为 `f04d6d989020efe81f02d29f862985a31552f839`。核对了通用验收清单、原第 09 步报告、流式实现回执和改动。本次仓库产物仅为本报告。

## 阻断项

### R1　后台请求替换另一会话正在审阅的审批

1. 在 A 向合成服务器 ALPHA（101）发起请求并挂起，切到 B 后向 BETA（102）发起第二个请求。夹具记录两个独立的 `copilot_chat` 调用，目标分别为 101 和 102。
2. 先返回 B 的待审计划 802，页面仍在 B，弹窗显示 BETA 和计划 802。
3. 保持弹窗打开，返回后台 A 的待审计划 801。未进行页面操作，原弹窗就变成 ALPHA 和计划 801，活动会话仍为 B。此时尚未发出批准 IPC。
4. 在该弹窗中点击同一个“批准并执行”按钮，模拟 IPC 收到 `approve_ai_approval({ id: 801 })`。所有数据和执行回执均为合成。

`send` 将对话结果交给按会话隔离的 store，随后获取审批详情并直接设置页面共用的 `approvalPreview`，没有核对请求归属或是否已有计划在审阅。确认按钮使用当下弹窗中的 ID。HEAD 已有自动打开审批预览的逻辑，但当时 A 的全局忙碌状态会禁止 B 同时发送。这次开放并发后，两条新请求反序完成即可复现目标替换。全局待审列表仍可刷新，当前弹窗中的计划与确认动作应保持绑定。验收应覆盖 B 先进入审阅、A 后返回的顺序，并断言确认提交 802。代码位置见 [自动打开预览](../src/pages/copilot/index.tsx#L714)、[提交审批](../src/pages/copilot/index.tsx#L544)。

证据见 [补充夹具日志](C:/Users/ao/AppData/Local/Temp/opspub-step09-stream-independent-b4e893bf/extra-verified.log:12)、[A 完成前的 B 审批](C:/Users/ao/AppData/Local/Temp/opspub-step09-stream-independent-b4e893bf/step-09-extra-verified-B-before-A-finishes-dark-1440x900.png)、[A 完成后替换的审批](C:/Users/ao/AppData/Local/Temp/opspub-step09-stream-independent-b4e893bf/step-09-extra-verified-B-after-A-finishes-dark-1440x900.png)。

## N1–N3 独立复核

| 项目 | 实测结果 |
| --- | --- |
| N1 离页恢复 | 离开 Copilot 后注入原请求增量，合成历史立即保存该增量。重返时无需再发事件，即可看到部分正文、原进度、服务器别名和禁用的输入框。分别验证原请求在返回后结算，以及原请求在离页时已结算后再返回，两种情况均显示最终结果并解除忙碌。 |
| N2 会话隔离 | A 在途时切 B，再注入 A 进度，B 看不到 A 的正文、进度和服务器别名，输入可用。B 实际提交到独立的服务器 102。随后 A 结算，B 仍显示自己的正文与进度并保持忙碌。审批预览的例外见 R1。 |
| N3 结束后乱序 | `done` 先于成功回包、`error` 先于拒绝回包时，随后注入的 delta 均不改文或恢复生成态。成功回包仍提交最终正文，拒绝保留部分正文和错误信息并解除忙碌。结算后重放旧 delta 仍被忽略。定向测试另覆盖旧请求事件和重复结算落入同一会话的新请求。 |

## 非阻断项

- **原生 Tauri 未验证。** 运行时覆盖为隔离 Edge 与 Tauri `mockIPC`，包括单会话锁定、明确解锁、审批通过、拒绝和超时。未验证 WebView2 的实际事件投递时序、Rust 审批执行及审计落库。夹具只使用合成主机和审批数据，模拟确认只记录 IPC。
- **全仓空白检查。** 本轮 `git diff --check` 返回 2，只定位到既有原型 `docs/remote-ops-ai-prototype.html` 的 37226、38720、38746、38769 行尾空白。本次修改的 `index.tsx` 定向检查退出 0，新增状态模块及测试无行尾空白。
- **技能脚本 Node 运行方式。** 合并运行流式与技能脚本退出 1，流式仍通过 5 项。既有技能脚本用 TypeScript 转译后直接动态导入，`copilot-skills.ts:15` 的 `import.meta.glob` 未经 Vite 转换，Node 加载模块便报错。两个相关文件均与 HEAD 一致，生产 Vite 构建通过。
- **构建体积提示。** Vite 继续提示 chunk 超过 500 kB，构建退出 0。

## 验证记录

| 批次 | 退出码 | 结果 |
| --- | ---: | --- |
| `node <证据目录>/run-isolated.cjs stream-fixed` | 0 | 从当前源码重新打包，亮暗 × 1440×900 / 1100×700，228 通过、0 失败、0 夹具错误。夹具样式与本轮独立构建输出哈希一致。见 [复跑日志](C:/Users/ao/AppData/Local/Temp/opspub-step09-stream-independent-b4e893bf/fixture.log)。 |
| `node <证据目录>/run-extra.cjs extra-verified` | 1 | 暗色 1440×900，11 通过、1 失败、0 夹具错误。唯一失败为 R1。补测首轮误将聊天状态条定位在 footer，修正后以此轮日志为准。 |
| `node --test scripts/test-copilot-stream.mjs` | 0 | 5 项通过。 |
| `pnpm exec tsc --noEmit` | 0 | 类型检查通过。 |
| `pnpm build --outDir <证据目录>/build-dist` | 0 | 输出到临时目录，见 [构建日志](C:/Users/ao/AppData/Local/Temp/opspub-step09-stream-independent-b4e893bf/build.log)。 |
| `git diff --check -- src/pages/copilot/index.tsx` | 0 | 已跟踪目标文件通过。 |

使用技能 `check`、`bug-detective`、`test-development`。

