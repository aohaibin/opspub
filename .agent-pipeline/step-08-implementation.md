# 第 08 步 · 部署模块迁移实现回执

实现已交付，待独立验收。基于 `opspub` 的 `10c72db`，对照 `state.json` 第 08 步、部署基线和通用验收清单，以及 `docs/ops-prototype-direction2-workspace.html` 的自动化导航、部署页和配置弹窗（第 2855、7621、13848 行起）。

## 实施范围

| 批次 | 文件 | 行为 |
| --- | --- | --- |
| 导航与清单 | `src/pages/deployment/index.tsx`、`deployment.css`、`recipes.ts` | 使用公共工作区的「自动化中心 → CI/CD 部署发布」以及 `#/deploy`。二级栏提供部署向导，主区展示部署目标、部署组和七个配方，保留制品授权与登记。列表支持刷新和加载失败重试。 |
| 配置 | `src/pages/deployment/DeploymentEditors.tsx`、`index.tsx` | 保留目标 ID、服务器、配方、路径、制品及健康检查字段。向导预填配置，保存由目标表单提交。部署组回显已有顺序，并支持勾选和上下调整。提交失败在原弹窗显示并保留输入。 |
| 日志与结果 | `src/pages/deployment/deploymentRun.ts`、`DeploymentResults.tsx`、`index.tsx` | 保留目标部署、回滚及历史入口，并提供全量发布历史。部署组确认分别提供取消、全量和灰度首项。当前任务切页后仍可恢复，等待期间阻止重复下发。按目标显示阶段、输出、错误、退出码、耗时、健康检查和回滚结果。灰度中断显示未执行目标，IPC 拒绝时提示查看历史确认已执行的部分。 |

人工部署调用原有 `deploy_target`、`rollback_deploy_target`、`deploy_group` 及 `deployment-progress`。版本、发布记录和审计由现有 Rust 服务处理，AI/MCP 入口继续使用原有策略。页面采用服务已支持的配置字段，原型里的本地构建、项目自动发现、配置试跑和失败自动回滚没有对应的现有人工部署接口。制品登记及引用维持原语义，静态核对中本地制品上传属于现有 MCP 路径，人工部署读取远端制品路径。

## 验证记录

| 实际命令 | 退出码 | 证据 |
| --- | ---: | --- |
| `git status -s`、`git branch --show-current`、`git log -1 '--format=%h %ar\|%s'`、对部署页及回执分别执行 `git log -1 '--format=%ar\|%s' -- <file>` | 0 | 修改前部署页和样式工作树干净，最近提交分别在 19 天和两周前。回执及四个新增部署文件此前不存在。 |
| `pnpm exec tsc --noEmit` | 0 | 阶段检查和最终 TypeScript 检查通过。 |
| `pnpm build` | 0 | Vite 7.3.1 转换 5234 个模块。最终产物为 `dist/assets/index-BeyIg7p3.css` 和 `dist/assets/index-Cq9DWd9T.js`。Vite 仍提示部分 JS 分块最小化后超过 500 kB。 |
| `node "$env:TEMP/opspub-step08-deploy/run-isolated.cjs" deploy \| Tee-Object -FilePath "$env:TEMP/opspub-step08-deploy/attempt-01.log"` 后执行 `exit $LASTEXITCODE` | 1 | 首轮夹具用 Ant Design 旧版 Select 样式类定位，向导选机时中断。改用实际输入与键盘事件后通过。 |
| 同一离线命令，日志文件改为 `attempt-02.log` | 0 | 四种主题和窗口组合各通过 6 组场景。 |
| `node "$env:TEMP/opspub-step08-deploy/run-isolated.cjs" deploy \| Tee-Object -FilePath "$env:TEMP/opspub-step08-deploy/results.log"` 后执行 `exit $LASTEXITCODE` | 0 | 用最终生产 CSS 和实际 React 路由、组件，在本机 Edge 无头用合成资产和模拟 IPC 验证。亮暗主题各跑 1440×900、1100×700，共 24 组场景。 |
| `git diff --check -- src/pages/deployment`、`git diff --cached --name-only` | 0 | 补丁空白检查通过，Git 给出 LF/CRLF 提示，暂存区为空。 |
| `git diff --binary -- . ':(exclude)src/pages/deployment' \| git hash-object --stdin` | 0 | 部署目录外原有跟踪差异的前后哈希均为 `3a4b3be0374b8635feeab5e1434a7ec54581cc8a`。 |

离线夹具、日志和截图位于 `C:/Users/ao/AppData/Local/Temp/opspub-step08-deploy/`。从仓库根目录运行表中的 Node 命令即可复测。离线 HTML 通过 CSP 禁止网络请求。

- `deploy-fixture.tsx` 和 `run-isolated.cjs` 是可复跑夹具，`results.log` 逐组记录导航和旧数据、历史过滤及重试、配置保存及重试、部署组顺序及灰度、日志和回滚、制品和删除。
- 夹具核对了取消确认时零部署请求，灰度与全量的真实参数，切页后执行实例恢复，无关目标事件过滤，以及健康检查失败时服务输出、退出码和错误共存。
- `step-08-deploy-{light,dark}-{1440x900,1100x700}.png` 是页面截图，同目录还有对应四组 `target-editor` 和 `failed-health` 截图。

## 未验证

- Windows 原生 Tauri / WebView2、真实文件选择和数据库存量数据。本次离线用例使用按旧字段构造的保存记录。
- 真实 SSH、制品传输、部署及回滚、健康检查、审计落库和 MCP 审批。
- 原型截图未单独生成。版式核对使用原型 HTML 和四组离线窗口截图。

参考技能 `ui-frontend`、`theme-system`、`api-development`、`test-development`。本步无暂存、提交或推送。

## B1 返工与复验

根据 `step-08-review.md` 的同目标并发和迟到事件反例，人工部署、回滚和每次部署组执行均使用独立 UUID v4。组成员共享组运行的 `runId`，各自携带 `targetId`。前端同时校验这两个字段才接收进度日志与 IPC 结果。切页恢复当前实例，超时后显式重试和整组重跑均生成新 ID，取消确认保留面板中的原实例并产生零执行请求。旧 IPC 请求省略 ID 时由服务生成，已有历史缺少 ID 仍可读取。

新增历史携带 `runId`，并发执行的历史读改写串行化。MCP 部署调用把同一运行 ID 传给已有的部署执行和健康回写，按 `runId` 与 `targetId` 更新历史。该接入涉及 `src-tauri/src/services/copilot.rs` 中两处部署调用，沿用原审批、状态流转和审计策略。

本轮证据位于 `C:/Users/ao/AppData/Local/Temp/opspub-step08-b1/`。下列命令从仓库根目录运行，`$verifyDir = Join-Path $env:TEMP 'opspub-step08-b1'`。

| 命令 | 退出码 | 证据 |
| --- | ---: | --- |
| `pnpm exec tsc --noEmit` | 0 | `tsc.log` |
| `pnpm build` | 0 | `build.log`，Vite 转换 5234 个模块，产物 `index-BeyIg7p3.css` 和 `index-Ce-9hjta.js`。仍有大分块提示。 |
| `cargo check --manifest-path src-tauri/Cargo.toml` | 0 | `cargo-check.log`，仅报告既有未使用项告警。 |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib services::deployment::tests` | 0 | `cargo-tests.log`，7 通过。覆盖旧历史兼容，以及同一目标同一版本存在两个待验证记录时按运行 ID 更新正确记录。 |
| `node (Join-Path $verifyDir 'run-isolated.cjs') baseline` | 1 → 0 | `baseline-attempt-01-focus.log` 中两种组合的焦点断言受夹具检查时序影响。夹具等待路由和弹窗卸载并同步验证点击后的焦点，串行重跑通过。最终 `baseline.log` 中原 24 组场景全部通过。 |
| `node (Join-Path $verifyDir 'run-isolated.cjs') counterexample` | 0 | `counterexample.log`，四种主题和尺寸共 128 项断言通过，零失败。 |
| `git diff --check -- src/pages/deployment src/lib/api/deployment.ts src/types/deployment.ts src-tauri/src/models/mod.rs src-tauri/src/services/deployment.rs src-tauri/src/services/copilot.rs`、`git diff --cached --name-only` | 0 | 补丁空白检查通过，暂存区为空。排除上述部署变更范围后，既有跟踪差异哈希仍为 `3a4b3be0374b8635feeab5e1434a7ec54581cc8a`。 |

两套夹具沿用原场景和独立复验场景，将模拟事件和结果更新为真实协议的双键。扩展反例覆盖同目标并发调用、旧超时事件、缺失 ID、同 ID 的不同目标、切页后到达的迟到事件、错配的单目标或部署组结果及整组重跑。完整夹具、日志与四组截图均在证据目录。

取消验证覆盖既有的部署组确认框，部署模块当前只有确认前取消入口。真实远程并发和超时、原生窗口、MCP 审批与审计落库仍待实测。本轮参考 `bug-detective`、`tauri-events`、`api-development`、`json-serialization`、`test-development`，未暂存、提交或推送。
