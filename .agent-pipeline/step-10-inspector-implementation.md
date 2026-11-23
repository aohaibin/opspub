# 第 10 步 · 巡检子批次实施回执

在 `opspub` 完成 AI 智维 → 深度巡检诊断的工作区迁移。依据 `docs/ops-prototype-direction2-workspace.html` 的巡检视图和双轨入口，以及 `.agent-pipeline/baseline.md` 的巡检验收项。

## 实现

- 沿用 `#/inspector` 及已有工作区外壳。巡检的二级栏与页内视图同步，折叠二级栏后仍可切换四个视图。当前服务器和视图随路由查询参数在刷新后恢复。
- 巡检目标来自现有服务器 API，支持全部可用 Linux 主机或指定一台。复用 `run_inspection_probe`，逐机显示等待、执行中、完成及失败，锁定并发启动直到本次报告写入结束。
- 复用 `inspection.rules`、`inspection.schedule`、`inspection.reports`。新报告同时保留已有聚合字段与按服务器 ID 记录的逐机状态，旧报告仍可读取。逐机结果显示该主机的最近记录，同范围报告与 Diff 比较按目标集合匹配。全部探针失败时不生成健康分，部分失败保留失败原因及成功主机的综合分。
- 从诊断页打开巡检计划或同范围报告。报告正文独立滚动，复制和导出按钮位于弹窗底部，规则编辑的保存和取消位于抽屉底部。

本批仅修改 `src/pages/inspector/index.tsx`、`src/pages/inspector/inspector.css` 和本回执。Rust 探针继续仅支持 Linux，定时执行沿用巡检页面挂载期间的计时器。原型里的额外探针和外部通知渠道未纳入本批。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm build` | 通过，转换 5237 个模块，有 Vite 大 chunk 提示 |
| `git diff --check -- src/pages/inspector/index.tsx src/pages/inspector/inspector.css` | 通过，有 LF/CRLF 提示 |
| 隔离 Edge + 模拟 Tauri IPC | 四组通过，亮色和暗色各测 1100×700、1440×900，每组 44 项，共 176 项 |

夹具使用生产构建资源、独立浏览器配置、回环 HTTP 服务和阻断外网访问的浏览器配置。验证了旧配置及旧报告读取、双轨高亮、二级栏折叠与视图联动、Linux 过滤与 IPC 目标 ID、重复启动锁定、成功、全部失败、部分失败、重跑状态重置、报告及计划打开、底部导出和关闭、结果归属、同范围 Diff、刷新恢复，以及报告写入失败后可重跑。真实 SSH、原生 WebView、真实文件对话框和定时触发未实测。

夹具位于 `$env:TEMP/opspub-step10-inspector-offline.cjs`，最终截图位于 `$env:TEMP/opspub-inspector-offline-eIcdbt/`。复跑命令为 `node (Join-Path $env:TEMP 'opspub-step10-inspector-offline.cjs')`。

`state.json` 前后 SHA-256 一致。停在第 10 步巡检子批次，未执行第 11 步，未暂存、提交或推送。

已参考 `ui-frontend`、`api-development`、`test-development`、`theme-system`。

## 独立验收 B1 修复

固定 Linux 探针会输出 `MEM\t25%DISK\t64%`，端口列表也可能与 `SSHROOT` 同行。前端现在按固定字段标记切分，再用同一解析结果校验必需指标并评分。报告保留 stdout 原文。退出码非零、内存或根分区指标缺失时，仍记录目标主机的失败原因。

- 从 Rust 源码提取固定探针，使用合成系统查询数据运行。隔离 IPC 原样返回 stdout，单选 Beta 只调用服务器 `32`，按已有 60% 磁盘阈值生成 92 分和一条 `32-disk-warning`。
- 混合批次按 `31,32` 调用。Alpha 的退出码 7 仅记在 Alpha，Beta 使用原样输出得到 92 分，告警仍归 Beta。混合报告的健康分为 92。空内存字段也通过 IPC 验证为 Beta 的采集失败。
- 回归单测覆盖原样 stdout、分行与 CRLF、空可选字段、缺失或无效必需指标及非零退出。运行 `node --test src/pages/inspector/probeOutput.test.mjs`，5 项通过。

`pnpm exec tsc --noEmit`、`pnpm build` 和巡检目标文件的 diff-check 均通过。构建转换 5238 个模块，保留 Vite 大 chunk 和 Git 行尾提示。亮色与暗色各复跑 1100×700、1440×900，原实施矩阵 176 项通过，原样输出及混合归属矩阵 168 项通过，均无场景失败。

新增矩阵夹具为 `$env:TEMP/opspub-inspector-review-f6c7adb6/parser-regression.cjs`，使用同目录 `probe-payload.cjs` 产生的 `probe-payload.json`。截图位于 `$env:TEMP/opspub-inspector-offline-Yun5Es/`，原实施矩阵复跑截图位于 `$env:TEMP/opspub-inspector-offline-WlGduY/`。本轮采用本地探针替身及模拟 IPC，真实 SSH 未实测。独立验收中的 Diff 风险列表主机标签属于单独的展示项。

本次修复范围为前端巡检解析、回归测试和实施回执。`state.json` 前后 SHA-256 一致，未暂存、提交或推送。

本次修复参考 `bug-detective`、`test-development`。
