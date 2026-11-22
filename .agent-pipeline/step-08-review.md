# 第 08 步 · 部署模块独立验收

结论：**阻断，建议退回修复 B1 后复验，本轮不通过。** 发现 1 个阻断问题：同一目标的进度事件未按执行实例隔离，并发任务或旧超时任务的迟到事件会进入当前日志。回执原有 24 组离线场景全部通过；独立补测 100 个断言中 92 个通过、8 个失败，失败均为 B1 的两种表现乘以四种主题/尺寸组合，并非 8 个独立缺陷。最终补测无夹具错误。

本次只验收部署范围，没有修改业务代码，没有暂存、提交或推送。验收时间为 2026-11-22（Asia/Shanghai）。基于当前 `opspub` 分支、HEAD `10c72db08b706c93e2066f273cbcce449f892f87` 及实现方尚未提交的部署改动。

## 依据与方法

先读取 `.agent-pipeline/review-checklist.md`、`.agent-pipeline/baseline.md`、`.agent-pipeline/step-08-implementation.md` 和 `docs/ops-prototype-direction2-workspace.html`。原型 SHA-256 为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D`；对照自动化导航（2855 行起）、部署页（7621 行起）、部署组及目标配置（13848 行起）。

先将实现方的 `run-isolated.cjs`、`deploy-fixture.tsx` 复制到独立临时目录，再用本轮 `pnpm build` 的生产 CSS 和当前实际 App、React 路由及部署组件复验。所有资产、配置、历史与 IPC 返回均为合成数据；应用夹具以 CSP 禁止网络。新增反例直接调用实际 `deploymentApi`，使用 Tauri 官方 mock IPC/event 桥接，不替换部署业务模块。浏览器为本机 Edge 无头实例，四组视口为亮/暗 × 1440×900/1100×700，与 `src-tauri/tauri.conf.json:16-19` 的默认/最小尺寸一致。

本轮证据目录统一为 `%TEMP%/opspub-step08-review-20261122/`，实际路径 `C:/Users/ao/AppData/Local/Temp/opspub-step08-review-20261122/`。原实现证据目录保持原样。

## 阻断项

### B1 · P1：同一目标的并发与迟到进度混入当前执行日志

**位置**：`src/pages/deployment/deploymentRun.ts:36-42`；相关协议 `src/types/deployment.ts:89-94`、后端广播 `src-tauri/src/services/deployment.rs:1176-1186`。

监听仅检查 `targetIds.has(payload.targetId)`，进度协议只有 `targetId/stage/message/completed`。`run.request === request` 只能保护本窗口的状态更新闭包，不能识别事件属于哪次调用。同一页面的按钮禁用也不能隔离另一调用入口；人工部署 Command 使用独立 `spawn_blocking`（`src-tauri/src/commands/deployment.rs:103-145`），进度则由应用全局广播。

**复现（均为离线合成执行，未下发真实部署）**：

1. 对目标 `legacy-a` 注入一次 IPC 超时拒绝，确认页面显示失败后，点击同一目标的“部署”显式重试，令当前任务 A 保持等待。
2. 发出目标同为 `legacy-a`、消息为 `LATE previous timeout attempt event` 的旧任务事件。预期 A 日志不出现该消息；实际出现并标为当前目标的“失败”阶段。
3. 保持 A 未完成，通过实际 `deploymentApi.deployTarget({ targetId: "legacy-a" })` 发起并完成第二个模拟调用 B，发出 `FOREIGN concurrent B done`。预期 A 日志不出现 B 的进度；实际 A 显示 B 的“预检”和“完成”。
4. 切到批量页并返回，混入的日志仍保留在 A 的“本次执行”中。不同目标的同类事件能被正确过滤，说明该反例针对执行实例隔离，而不是所有过滤均失效。

**影响边界**：实测中 A 的状态仍为“执行中”、按钮仍禁用；A 最终返回的结果仍是自己的 `live own-3`，未被替换为 B 的结果。因此本轮证实的是实时日志和阶段归属错误，不能据此声称最终结果或真实远端文件已被串改。该问题违反本步明确要求的同目标并发隔离，部署日志可能给出错误的失败/完成归因，列为阻断。

**证据**：`independent-results.log` 中每种组合均有两条 `FAIL | B1 ...`，共 8 条；四份 `SUMMARY` 均只列这两个失败断言。截图 `step-08-independent-review-concurrent-{light,dark}-{1440x900,1100x700}.png` 可见同一面板同时包含 A 的预检、旧任务失败及 B 的完成消息。`evidence-summary.json` 汇总最终计数。

**建议修复与复验门**：为每次执行生成唯一标识，并贯穿请求、服务进度广播和前端过滤；部署组也应关联所属运行与目标。覆盖并发同目标、旧任务超时后重试、切页后的迟到事件；保留不同目标过滤和最终结果关联。仅靠前端按钮禁用或过滤消息文本不能解决本问题。本验收会话不修改协议或业务代码。

## 已核对项目

| 项目 | 结果与证据 |
| --- | --- |
| 新版导航与旧 `#/deploy` | 通过。旧深链进入“自动化中心 → CI/CD 部署发布”；批量/部署互跳、浏览器前进后退后，业务域、二级高亮和顶部面包屑一致。收起再展开二级栏，部署内容仍在。源码 `src/navigation/workspace.ts:11-13,42`、`src/Router.tsx:38,58`；基线日志和独立断言均覆盖。 |
| 部署目标与配置弹窗 | 通过合成 IPC 检查。旧 ID、服务器、配方、路径、制品引用和健康命令回显；向导及配方卡预填；实际切换服务器和配方后，发送正确 ID。非法相对路径零保存请求；保存拒绝后原输入保留，重试成功；点击编辑遮罩不丢输入。源码 `DeploymentEditors.tsx`、`index.tsx:98-104`。 |
| 部署组选择与顺序 | 通过。旧顺序回显，上下调整、取消勾选、重新勾选追加到末尾，保存请求的 `targetIds` 与可见顺序一致；全量和灰度请求参数精确核对。两种主题和尺寸均覆盖。 |
| 取消确认不下发 | 通过。多目标组的“取消”和右上角 X 均使 `deploy_group` 调用数保持 0。全量发送 `canaryFirst:false`，灰度发送 `true`。单目标直接执行是现有路径，本轮没有把它记为“确认取消”通过项。 |
| 逐目标结果、历史与日志 | 除 B1 外通过。目标历史按目标过滤，全量历史显示全部记录；历史加载失败可独立重试。部署组失败与成功目标并列展示；灰度失败显示未执行目标；组 IPC 拒绝不显示上次结果，并提示查看历史核对已执行部分。标准输出、标准错误、退出码、耗时、健康检查和回滚结果均核对。 |
| 失败、超时、重试 | 通过注入返回检查。非零退出码、健康检查失败和组请求拒绝均显示失败；注入远端超时结果（退出码 124）显示错误与退出码并恢复显式重试入口；注入 IPC `TIMEOUT` 拒绝后不残留前次输出；重新执行成功。这里验证的是 UI 对合成超时的处理，未真实等待远端 600 秒。 |
| 切页恢复与重复执行 | 通过。未完成任务离开部署页再返回，执行状态和日志恢复；等待期间无法通过当前部署页再次下发。任务结束后监听移除，之后同目标事件不会修改已结束日志。旧任务事件落入新任务的例外见 B1。 |
| 制品及删除回归 | 回执夹具复跑通过：合成文件选择、目录授权、制品登记、目标删除确认及列表刷新。没有验证真实文件或远端上传字节。 |
| 亮暗主题与默认/最小视口 | 通过离线视觉和尺寸检查。查看页面、目标/组编辑器、健康失败和并发日志截图；主体宽度分别为 1154/814 px，`scrollWidth` 与 `clientWidth` 相等，body 无横向溢出。最小视口中目标编辑器底部为约 612.34 px、部署组编辑器底部约 611.78 px，均在 700 px 内。长页面通过工作区纵向滚动查看后续配方与制品。该结论不等于 Windows 原生窗口验收通过。 |

## 命令、退出码与证据

以下命令均从仓库根目录执行；长任务保留原始退出码，未把管道最后一步的成功当作测试成功。

| 实际命令 | 退出码 | 证据及说明 |
| --- | ---: | --- |
| `pnpm exec tsc --noEmit` | 0 | `tsc.log`，无类型错误。 |
| `pnpm build` | 0 | `build.log`，Vite 7.3.1、5234 个模块；产物 `index-BeyIg7p3.css`、`index-Cq9DWd9T.js`，有大分块告警。 |
| `node "$env:TEMP/opspub-step08-review-20261122/run-isolated.cjs" deploy` | 0 | `baseline-results.log`，四种组合各 6 组场景，共 24 组全部通过。 |
| `node "$env:TEMP/opspub-step08-review-20261122/prepare-review.cjs"` | 0 | 仅在临时目录组合独立夹具与运行器，不改仓库业务文件。 |
| `node "$env:TEMP/opspub-step08-review-20261122/run-review.cjs" independent`（最终轮） | 1 | `independent-results.log`：92 PASS、8 FAIL，四个 SUMMARY，无 `HARNESS_ERROR`；退出 1 是 B1 断言失败。 |
| 同一独立命令的中间轮 | 1 | `independent-attempt-01.log` 已复现 B1；后续加强动画/导航等待时，`independent-attempt-02-harness-race.log` 出现路由提交等待不足，`independent-attempt-03-selector.log` 使用错误批量根选择器。均属临时夹具问题，最终改用实际 `.ops-batch-page` 并等待路由挂载/卸载后消除，没有改业务实现，也未将这些夹具错误列为产品缺陷。 |
| `node "$env:TEMP/opspub-step08-review-20261122/capture-prototype.cjs"` | 0 | `prototype-results.log`，四组原型页面/目标/组弹窗截图。仅临时副本内联固定版 Tailwind 3.4.17 和 Lucide 0.577.0，移除远端字体后离线渲染；依赖哈希及原型哈希记录在日志。原型自带的模拟浮层仍可能出现在截图中，不视为应用缺陷。 |
| `node "$env:TEMP/opspub-step08-review-20261122/summarize-evidence.cjs"` | 0 | `evidence-summary.json`，核对 24 组基线、100 个补测断言、0 个最终夹具错误，以及全部 52 张 PNG 的尺寸和 SHA-256。 |
| `git diff --check -- src/pages/deployment` | 0 | 无补丁空白错误；只有既有 LF/CRLF 提示。 |
| `git diff --cached --name-only` | 0 | 暂存区为空。 |
| `git diff --binary -- . ':(exclude).agent-pipeline/step-08-review.md' \| git hash-object --stdin` | 0 | 验收前后均为 `bc61dd6d76319c345cf064782cd77a36efa5c4bc`。另以 `source-before.json`/`source-after.json` 核对部署目录全部 6 个文件（含未跟踪文件），SHA-256 均未变化。 |

复跑时可用 `*> "$env:TEMP/opspub-step08-review-20261122/<日志名>"` 保存日志，然后立即读取 `$LASTEXITCODE`；上述表格记录的是实际 Node/pnpm 进程的退出码。

截图索引（均在证据目录）：

- 应用基线：`step-08-deploy-{light,dark}-{1440x900,1100x700}.png`；另有 `target-editor`、`failed-health` 截图。
- 独立补测：`step-08-independent-review-{page,target-editor,group-editor,timeout,concurrent}-{light,dark}-{1440x900,1100x700}.png`，以及每组结束状态截图。
- 原型对照：`step-08-prototype-{page,target-editor,group-editor}-{light,dark}-{1440x900,1100x700}.png`，以及每组结束截图。

## 非阻断项

- **N1 · 构建告警**：主 JS 约 3096.17 kB、gzip 985.81 kB，Vite 提示超过 500 kB。构建成功，属于既有打包体积事项，本步不要求拆分其他模块。
- **N2 · 原型能力边界**：原型有本地构建命令、工作目录、保留版本份数、配置试跑、失败自动回滚等字段，当前人工部署 API 模型及本次表单没有对应完整能力。页面未继续宣称“失败自动回滚”，实施回执也已披露限制。本轮按“迁移并复用现有部署服务”范围列为非阻断差异，不能把原型所有能力认定为已实现。建议总控保留为产品范围记录，不在本验收会话扩展接口。

## 真实远程与 Windows 未验证项

- 未验证真实 SSH、主机指纹、凭据、制品传输和字节校验、真实部署/回滚、真实健康检查、600 秒超时、审计/历史落库、MCP/AI 审批及多入口真实并发。B1 的事件混入在真实前端代码和合成协议中已实测，真实远端并发执行的副作用仍未验证。
- 未启动 Windows 原生 Tauri/WebView2 或打包应用；未验证拖拽、系统缩放、真实窗口最小尺寸约束、原生文件选择和本地数据库存量迁移。宿主为 Windows、Edge 截图尺寸正确，均不能代替这些原生检查。合成 Windows 资产被部署选择器排除，不代表实现了 Windows 远端部署；RDP 协议排除条件仅做源码核对，未另设该协议的动态用例。
- 当前工具目录没有项目任务系统接口，亦没有可用 Reeve 远程工具。本轮没有启动项目 dev/Tauri 服务、没有占用或结束既有端口进程；离线运行器只关闭自己启动的无头 Edge。真实远程操作应另按 Reeve 规则探测、确认后执行。
- 未运行 `cargo check`/`cargo test`：本步交付未改 Rust，本次按要求复验 tsc/build/离线 IPC；后端整体验证仍需最终验收覆盖。

最终建议：**先修复 B1，再用同一反例及原 24 组场景复验；本轮不提交。** 已参考技能：`check`、`test-development`、`ui-frontend`、`theme-system`。
