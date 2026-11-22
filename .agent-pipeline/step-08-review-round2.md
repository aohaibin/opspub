# OpsPub 第 08 步 B1 · 二轮独立复验

**结论：建议关闭 B1，本轮离线复验通过，无阻断项。** 首轮复现的同目标并发串日志和超时后迟到事件串日志均未复现。此结论仅覆盖第 08 步 B1 的现有调用路径，不代表 Windows 原生应用或真实远程部署已验收。

复验日期：2026-11-22（Asia/Shanghai）。分支 `opspub`，HEAD `10c72db08b706c93e2066f273cbcce449f892f87`，含工作树中的 B1 返工。先读通用验收清单、实现回执、首轮审查，再查看回执的 `tsc.log`、`build.log`、`cargo-check.log`、`cargo-tests.log`、`baseline.log`、`counterexample.log`，并对照首轮 `independent-results.log` 中的失败项。下文实测均为本轮重跑。

## 阻断项

无。按现有 UI、API 封装及 MCP 路径的一次执行一个 ID 约定，未发现 B1 仍可触发。

## 非阻断项与需决策事项

- **N1：直接调用 IPC 时可显式复用运行 ID。** 临时 Rust 夹具把同一合法 UUID 和同一目标同时传给部署、回滚，两个调用均成功，进度的 `runId + targetId` 无法区分；见 `rust-probe.log` 的 `OBSERVED` 行。Rust 接受调用方提供的 UUID，省略时才生成（`src-tauri/src/services/deployment.rs:625,687`）；页面和 MCP 正常路径逐次生成 UUID，浏览器复验也确认重试与组重跑换 ID。未发现当前界面操作会主动复用 ID。**建议总控按现有调用协议放行 B1；若直接 IPC 也须对调用方重放同一 ID 提供隔离，则应把重复 ID 拒绝或幂等语义设为放行条件。**

## 实测证据

| 场景 | 结果 |
| --- | --- |
| 同目标并发 | 挂起目标 A 的重试，通过真实 `deploymentApi` 并发发起同目标 B。模拟 IPC 捕获不同 UUID；B 的完成事件未进入 A，也未解除 A 的按钮禁用。释放 A 后只显示 A 的结果。正确 ID 搭配组外目标的事件也被丢弃。 |
| 超时、迟到与无 ID 事件 | 注入退出码 124 和 IPC `TIMEOUT` 拒绝，均可显式重试。三次调用的 ID 各异；重试等待时，旧 ID、没有有效 ID 的同目标事件都被丢弃。错 ID 的单目标返回也不能填入结果。 |
| 组内目标、取消与重跑 | 组内两目标共用本轮组 ID，目标 ID 各异；重跑换 ID，拒绝旧组和组外目标事件，并拒绝夹有错误目标的组返回。取消保持上次面板且不新增执行请求。基线另验证灰度首项失败和未执行目标。 |
| 切页恢复 | A 挂起时切去批量页再返回，原实例、日志和等待状态恢复；迟到事件仍被丢弃。任务结束后注入事件也不改变已结束日志。 |
| 旧历史 | 无 `runId` 的历史在模拟 IPC 中可展示，可按目标及全量查看。项目的真实 Rust 测试确认旧 JSON 仍可反序列化；独立 Rust 夹具在新增七条运行记录后仍能读取原记录，旧条目序列化时仍不写 `runId`，旧字段与默认验证状态保留。 |
| 请求贯穿 Rust | 将 `counterexample.log` 捕获的页面重试请求按 `{ request: ... }` 喂入原 Rust Serde 类型和 Command 函数体；回滚与组请求用同形状的合成值。并发执行后，四对 `runId + targetId` 各收到自己的预检、执行、验证、完成事件，结果和历史保留正确 ID。组内成员继承组 ID，省略 ID 的单目标和组调用分别生成 UUID v4，非法 UUID 解码被拒绝。代码位置：`src-tauri/src/models/mod.rs:577`、`src-tauri/src/commands/deployment.rs:103`、`src-tauri/src/services/deployment.rs:621`。 |
| MCP 历史归属 | 独立夹具对同目标、同版本生成两条待验证记录，先回写较早记录的失败，再回写较晚记录的成功；输出、错误和状态各归其主。错误 ID 或错误目标返回错误且历史 JSON 不变；完成后再次回写被拒。项目自带的内存 SQLite 测试也通过。源码核对确认 Copilot 在每次执行时生成一个 ID，并把它同时传入执行和健康回写（`src-tauri/src/services/copilot.rs:3733,3746,3907`）；未执行真实审批链。 |

两套浏览器夹具从实现方证据目录复制到本轮独立临时目录，使用当前源码、现有生产 CSS `index-BeyIg7p3.css` 和 Tauri 官方模拟 IPC/事件桥接。亮暗各验证 1440×900、1100×700；夹具 HTML 的 CSP 禁止网络请求。Rust 独立夹具复制实际 Command 函数体、Serde 类型及部署服务，移除副本上的 Tauri Command 属性，用合成 AppHandle、事件接收器、内存配置和固定远程返回驱动。它不会连接服务器、执行部署命令或传制品。

## 分批命令与实际退出码

从仓库根目录执行，`$v = Join-Path $env:TEMP 'opspub-step08-round2-20261122'`。证据路径为 `C:/Users/ao/AppData/Local/Temp/opspub-step08-round2-20261122/`。重定向日志后立即保存原命令的 `$LASTEXITCODE`。

| 批次 | 实际命令 | 退出码 | 证据 |
| --- | --- | ---: | --- |
| 前端基线 | `node (Join-Path $v 'run-isolated.cjs') baseline` | 0 | `baseline.log`，四组各 6 个场景，共 24 组通过。 |
| 前端类型 | `pnpm exec tsc --noEmit` | 0 | `tsc.log`，无类型错误。 |
| 前端反例 | `node (Join-Path $v 'run-isolated.cjs') counterexample` | 0 | `counterexample.log`，128 PASS、0 FAIL、4 SUMMARY、0 HARNESS_ERROR。 |
| Rust 项目测试 | `$env:CARGO_NET_OFFLINE='true'; cargo test --locked --manifest-path src-tauri/Cargo.toml --lib services::deployment::tests` | 0 | `cargo-tests.log`，7 通过，176 过滤。 |
| Rust 合成夹具准备 | `node (Join-Path $v 'prepare-rust.cjs')` | 0 | 原始 service 函数和必要模型定义复制到临时目录。 |
| Rust 合成夹具调试 | `cargo run --offline --manifest-path (Join-Path $v 'Cargo.toml')`，后两轮加 `-- (Join-Path $v 'counterexample.log')` | 101 × 3 | `rust-probe-attempt01.log` 至 `rust-probe-attempt03.log`；依次为夹具依赖与模型摘取错误、缺少 Serde 默认函数、PowerShell 日志编码不匹配。均仅修正临时夹具。 |
| Rust 合成夹具定稿 | `cargo run --offline --locked --manifest-path (Join-Path $v 'Cargo.toml') -- (Join-Path $v 'counterexample.log')` | 0 | `rust-probe.log`，请求链和 MCP 归属两组断言通过；同时复现 N1。 |
| 工作树核对 | `git diff --check -- src/pages/deployment src/lib/api/deployment.ts src/types/deployment.ts src-tauri/src/models/mod.rs src-tauri/src/services/deployment.rs src-tauri/src/services/copilot.rs`；`git diff --cached --name-only` | 0、0 | 无空白错误，仅换行提示；暂存区为空。12 个受检业务文件的前后 SHA-256 一致。 |

## 未验证

- 未运行原生 Tauri/WebView2 的 IPC 解码、事件投递和窗口切页。当前工具目录未发现项目任务系统接口，本轮没有启动项目服务或原生窗口；无头 Edge 仅打开离线 HTML。生产构建和独立 `cargo check` 阅读了回执日志，本轮未重跑。
- 未接触真实主机、凭据和项目存量数据。真实多入口部署、SSH 超时、回滚、健康检查、MCP 审批调度、审计落库及原位历史迁移仍未验证。合成测试确认的是执行归属，不验证远程操作的并发副作用。

仅新增本报告；夹具和日志位于临时目录。未修改业务代码、未暂存、提交或推送。已参考技能：`check`、`test-development`、`bug-detective`。
