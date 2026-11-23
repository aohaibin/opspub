# 第 10 步：巡检 B1 独立复验

**结论：PASS。** 首轮阻断 B1 已关闭。本轮范围内无阻断项；真实 SSH 未测。

复验基于 `opspub` 的 `f1c416f` 加当前工作区差异。已核对[验收清单](review-checklist.md)、[首轮报告](step-10-inspector-review.md)、[实施回执](step-10-inspector-implementation.md)、巡检差异以及新增的解析器和单测。浏览器夹具使用本轮重新构建的产物、独立 Edge 配置、回环 HTTP 和模拟 Tauri IPC。

## 阻断项

无。B1 的三个验收场景结果如下：

| 场景 | 实测结果 |
| --- | --- |
| 固定 Linux 探针原样回传 | 从 [Rust 源码](../src-tauri/src/services/inspection.rs#L11) 提取固定探针，由本地 Bash 使用合成系统查询数据运行，得到退出码 `0`、空 stderr，stdout 包含 `MEM\t25%DISK\t64%\nPORTS\t127.0.0.1:3306 SSHROOT\tno`。不改 stdout，单选 Beta 只调用 ID `32`；在磁盘阈值 60% 下，主机行与报告均为 92 分，唯一风险为 `32-disk-warning`（Fixture Beta，根分区已使用 64%）。报告保留原样输出。 |
| Alpha 非零退出与 Beta 成功同批 | 依次调用 `31,32`。Alpha 的 stdout 带有可评分指标，但退出码 `7` 优先，只有 Alpha 记录「探针退出码为 7：ALPHA_EXIT_ONLY」，且无得分、无风险。Beta 仍为 92 分，只归属一条 `32-disk-warning`；集群健康分为 92。 |
| 必需字段缺失 | IPC 回传空 `MEM` 值时，Beta 报告无健康分（`score: null`），ID `32` 记录「未采集到有效的内存使用率」。另用新生成的原样 stdout 分别删除整个 `MEM`、`DISK` 字段，直接调用解析器，分别得到该内存提示和「未采集到有效的根分区使用率」。 |

实际调用链使用[同一份解析结果评分](../src/pages/inspector/index.tsx#L225)，成功分数及风险按当前服务器 ID 记录，失败单独入列，集群分只统计成功主机。

## 非阻断项

- **Diff 风险行仍缺主机名。** 四组均复现：集群报告正文能看到风险归属 Fixture Beta，Diff 风险行只显示等级与标题。同范围筛选及主机行、报告中的归属通过。[Diff 渲染](../src/pages/inspector/index.tsx#L584)

## 原验收复跑

亮色、暗色各测 `1100×700`、`1440×900`，四组均通过。

| 检查 | 结果 |
| --- | --- |
| 原实施离线矩阵 | 每组 44 项，共 176 项通过。复核二级栏高亮、折叠和页内切换，单机及批量目标、逐机归属、同范围报告，以及刷新恢复所选主机、视图与已归档结果。 |
| B1 解析及归属矩阵 | 每组 42 项，共 168 项通过。复核原样输出、混合退出、内存缺值、Windows 深链不发送巡检请求，以及刷新后不额外发起巡检。 |
| 双轨导航与长报告 | 每组 9 项，共 36 项通过。从服务器页进入「AI 智维中枢 → 深度巡检诊断」；后退、前进复核模块高亮、目标与视图。长报告正文和探针输出均可滚动，滚到底后仍能发出模拟导出。 |
| 定向单测与构建 | `node --test src/pages/inspector/probeOutput.test.mjs` 5 项通过；`cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib services::inspection::tests` 2 项通过；TypeScript 检查、隔离生产构建、巡检文件 `git diff --check` 通过。保留 Vite 大包提示、Git 行尾提示和 Rust 未使用项警告。 |

本轮证据在 `$env:TEMP/opspub-inspector-review-round2-fa7ccd57`：`probe-payload.json` 为原样 IPC 载荷，三个夹具的日志为 `implementation-fixture.log`、`parser-regression.log`、`navigation-and-scroll.log`。截图路径见各日志的 `Artifacts` 行；原样成功和混合结果截图文件名分别含 `exact-probe-success`、`mixed-exact-probe`。夹具副本随本轮 `dist` 保存在同目录；`parser-regression.cjs` 副本仅调整产物路径。复跑从仓库根目录执行：

```powershell
$reviewDir = Join-Path $env:TEMP 'opspub-inspector-review-round2-fa7ccd57'
$env:INSPECTOR_GIT_BASH = Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'bin/bash.exe'
node (Join-Path $reviewDir 'probe-payload.cjs')
node (Join-Path $reviewDir 'parser-regression.cjs')
node (Join-Path $reviewDir 'implementation-fixture.cjs')
node (Join-Path $reviewDir 'navigation-and-scroll.cjs')
```

## 未测

- **真实 SSH：** 未连接实际主机；真实发行版工具差异、凭据、授权与远端审计未验证。
- **其他环境缺口：** 未启动原生 Windows WebView2，未触发原生保存对话框或系统剪贴板，未实测定时触发。主题矩阵结论限于隔离浏览器视口。

巡检源文件、原实施回执、首轮报告及 `state.json` 的 SHA-256 与复验前一致。仅新增本报告，未暂存、提交或推送。

已参考技能：`check`、`test-development`。
