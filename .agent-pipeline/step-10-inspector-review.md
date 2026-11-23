# 第 10 步 · 巡检子批次独立验收

**结论：返工。** 固定 Linux 探针正常执行后，实际输出中的内存和根分区字段会连在一行。页面将这类成功响应归为主机巡检失败，健康分和风险结果均无法生成。此问题在四组亮暗主题与窗口尺寸中均复现。

验收基线为 `opspub` 的 `f1c416f` 加巡检页面与 CSS 的工作区差异。已阅读 [通用验收清单](review-checklist.md)、[巡检实施回执](step-10-inspector-implementation.md)、[功能基线](baseline.md)、[工作区原型](../docs/ops-prototype-direction2-workspace.html#tab-inspector)，并对照实际差异、路由和巡检 IPC。业务文件与 `state.json` 的前后指纹一致，验收仅新增本报告，暂存区为空。

## 阻断项

**B1 · 成功的 Linux 探针被归为采集失败。** [固定探针](../src-tauri/src/services/inspection.rs#L11) 的内存格式化写出 `25%` 后未换行，接下来的 `DISK` 直接拼接。页面要求 `DISK` 和 `MEM` 各自占完整一行，先返回根分区采集失败。该脚本及校验在改造前已经存在，仍阻断本步的核心成功路径。原实施夹具自行在两个字段间插入换行，因此四组通过也无法覆盖这条路径。[页面校验](../src/pages/inspector/index.tsx#L118)

1. 从 Rust 源文件提取巡检探针原字符串，在本地 Bash 中用固定数据替换系统查询命令。采集过程返回 `exitCode: 0`、空 stderr，stdout 包含 `MEM\t25%DISK\t64%\n`。另有 `PORTS` 和 `SSHROOT` 连在一行，同属探针输出边界问题。
2. 原样把该响应交给隔离 Edge 的 `mockIPC`。通过页面选择 Fixture Beta，单次点击「启动巡检」。实际调用序列为 `[32]`，报告为 `serverIds: [32]`、`hosts[0].serverId: 32`、`score: null`，主机行和报告均记录「未采集到有效的根分区使用率」。四组均复现。
3. 按 fixture 中保存的磁盘阈值 60%，这份成功数据应为 Beta 生成 92 分及一条磁盘告警。返工验收应将固定探针在合成输入下产生的 stdout 直接送入前端，校验健康分、风险及主机 ID。输出格式需要覆盖有值和无值时的字段边界，并保留对非零退出或缺失必需指标的逐机失败处理。

## 非阻断项

- **Diff 风险列表缺少主机。** 集群报告正文及 Markdown 将「根分区空间严重不足」归到 Fixture Beta，Diff 只显示等级与标题。多台主机出现同一风险时，Diff 无法区分归属。四组均观察到。主机行和报告仍保留归属，且同范围筛选正常。[Diff 风险渲染](../src/pages/inspector/index.tsx#L591)

## 已复跑的检查

| 检查 | 实测 |
| --- | --- |
| 实施方隔离 IPC 夹具 | 4 组共 176 项通过。只调整副本所读的构建产物路径。覆盖旧规则、旧报告、二级栏收展、单机和全部 Linux、全部与部分失败、重跑、保存失败后恢复、同范围报告及刷新。 |
| 独立 IPC 反例 | 4 组共 148 个断言通过，包含对 B1 和 Diff 的复现记录。Windows ID `33` 的深链禁用启动并发送零次 IPC。单机 Beta 只发 `32`。批量发送 `31,32`，Alpha 退出码 7 且其错误只出现在 Alpha，Beta 为 82 分且唯一风险 ID 为 `32-disk-critical`，集群均分为 82。前一轮的 Beta 分数在排队阶段隐藏，启动按钮锁定到报告写入完成。刷新恢复 Beta、历史视图和归档，不触发新一轮。 |
| 双轨入口、返回与滚动 | 4 组共 36 项通过。从服务器页实际点「AI 智维中枢 → 深度巡检诊断」，浏览器后退、前进后模块高亮与目标/视图一致。20 条风险的长报告中，报告正文与探针输出均可独立滚动，滚到底后「导出文件」仍可点击并发出完整内容。四组验证了计划保存、规则抽屉保存校验与取消、报告复制和导出回调、Diff 底栏关闭。 |
| 原型对照 | 取得四组诊断和报告截图。原型与实现具有相同的 AI 一级域、巡检入口和四个业务视图。实现收敛为真实 Linux 目标、检查项、逐机状态和报告。原型展示的额外演示探针、外部通知与 PDF 控件未列入本子批次。 |
| 静态及构建 | `pnpm exec tsc --noEmit`、隔离目录 `pnpm build --outDir <临时目录>/dist`、`cargo check --manifest-path src-tauri/Cargo.toml --locked --offline`、`cargo test --manifest-path src-tauri/Cargo.toml --locked --offline --lib services::inspection::tests`（2 项）和巡检文件 `git diff --check` 通过。构建保留 Vite 大包、Rust 既有未使用项与 Git 行尾提示。 |

四组为亮色、暗色各 1100×700 和 1440×900。测试使用临时 Edge 配置、回环 HTTP 和 Tauri IPC 替身。测试账号、目标、报告及导出路径均为合成数据。原型渲染所需的公共 Tailwind/Lucide 脚本已缓存到临时目录，由回环服务投递。

## 复跑和证据

在仓库根目录运行。夹具及日志位于 `$env:TEMP/opspub-inspector-review-f6c7adb6`，该目录包含本次隔离构建的 `dist`。

~~~powershell
$reviewDir = Join-Path $env:TEMP 'opspub-inspector-review-f6c7adb6'
$env:INSPECTOR_GIT_BASH = Join-Path (Split-Path (Split-Path (Get-Command git).Source)) 'bin/bash.exe'
node (Join-Path $reviewDir 'probe-payload.cjs')
node (Join-Path $reviewDir 'independent-fixture.cjs')
node (Join-Path $reviewDir 'implementation-fixture.cjs')
node (Join-Path $reviewDir 'navigation-and-scroll.cjs')
~~~

- 精确输出与逐机报告记录见 `probe-payload.json`、`independent-fixture.log`。反例截图在 `$env:TEMP/opspub-inspector-offline-axTTAy`，文件名包含 `false-failure`、`mixed-results`、`mixed-report`、`schedule` 或 `rule-drawer`。
- 长报告滚动量在 `navigation-and-scroll.log`，滚到底后截图在 `$env:TEMP/opspub-inspector-offline-oMxI3r`。原型诊断与报告截图在 `$env:TEMP/opspub-inspector-offline-MjOARY`。实施夹具复跑截图在 `$env:TEMP/opspub-inspector-offline-H5gc7u`。

## 未测

- **真实 SSH。** 未连接实际 Linux 主机，未确认发行版工具差异、真实凭据、授权或审计落库。B1 的 stdout 来自固定探针本身与隔离的系统查询替身。
- **原生对话框和剪贴板。** 已验证浏览器按钮、模拟文件对话框、写文件 IPC 的参数及复制回调内容。未打开真实保存对话框、写真实报告文件或访问系统剪贴板。
- **定时触发。** 已检查计划入口、保存 IPC、旧配置恢复。未验证计时触发、页面切出后的调度行为或外部通知。
- **原生 Windows WebView2。** 当前工具未提供项目任务系统的查询和启动接口。未启动原生窗口，也未验证系统 DPI 或探针运行期间重启 WebView 后的恢复。

已参考技能 `check`、`ui-frontend`、`test-development`。

