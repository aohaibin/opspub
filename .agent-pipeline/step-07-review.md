# 第 07 步 · 批量模块独立验收

结论：**通过，未发现阻断项。** 本次只验收批量范围；未修改业务代码、未暂存、未提交。验收依据为 `.agent-pipeline/review-checklist.md`、`baseline.md`、`step-07-implementation.md`、新版原型 `docs/ops-prototype-direction2-workspace.html` 的自动化导航（2879–2886）及批量页面（7343–7612）。

## 阻断项

无。

## 检查结果

| 项目 | 结果与证据 |
| --- | --- |
| 新版一级/二级导航与旧入口 | 通过。批量归属「自动化中心」，二级入口为「批量执行与下发」；离线夹具加载实际路由并验证 `#/batch` 深链、域/二级高亮、面包屑和前进/后退。映射见 `src/navigation/workspace.ts:11-13,41`，旧路由仍由 `src/Router.tsx:57` 注册。 |
| 服务器页预选与目标隔离 | 通过。服务器页批量入口传入 `location.state.serverIds`（`src/pages/servers/index.tsx:1011`）；页面对 ID 去重并在服务器加载后过滤不支持项（`src/pages/batch/index.tsx:38-45,83-90`）。夹具覆盖预选目标、Windows/RDP 过滤、跨搜索/分组多选、取消勾选、切页及历史恢复，确认新入口不会带入旧目标。 |
| 确认目标与命令 | 通过。执行前确认框展示目标别名、主机、端口和命令（`src/pages/batch/index.tsx:263-280`）。夹具确认取消和无效命令均未产生执行 IPC，并核对确认及发送的精确目标 ID、命令和超时参数。 |
| 逐台结果、失败与重试 | 通过。结果行区分待执行、执行中、成功、失败、跳过，并显示主机、输出、错误、退出码及耗时（`src/pages/batch/components/BatchResults.tsx:32-63`、`src/pages/batch/types.ts:5-11`）。合成 IPC 验证成功、超时错误、非零退出码/标准错误、失败即停后的跳过，以及汇总计数。单机重试确认只对失败目标再次发送；整批重跑确认使用原批目标和参数快照，不读取当前筛选选择（`src/pages/batch/index.tsx:147-170,258-259`）。 |
| 亮暗主题与窗口尺寸 | 通过离线 Edge 夹具检查亮/暗主题 × 1440×900/1100×700，共 24 个交互场景。四张截图像素尺寸核对正确：`step-07-batch-{light,dark}-{1440x900,1100x700}.png`，位于 `%TEMP%/opspub-step07-batch/`。截图可见目标列表与结果面板各自滚动，最小窗口下主操作仍在视口内。 |

## 命令与退出码

| 实际命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm exec tsc --noEmit` | 0 | 通过，无输出。 |
| `pnpm build` | 0 | 通过；Vite 7.3.1 转换 5230 个模块。存在 JS chunk 超过 500 kB 的构建告警。 |
| `node "$env:TEMP/opspub-step07-batch/run-isolated.cjs" batch \| Tee-Object -FilePath "$env:TEMP/opspub-step07-batch/recheck-results.log"; exit $LASTEXITCODE`（PowerShell） | 0 | 4 个主题/尺寸组合各 6 组场景全部通过；日志：`%TEMP%/opspub-step07-batch/recheck-results.log`。IPC 由合成夹具模拟。 |
| `git diff --check -- src/pages/batch` | 0 | 通过；Git 提示这些文件下次触碰可能转换 LF/CRLF。 |
| `git diff --cached --name-only` | 0 | 暂存区为空。 |

## 非阻断项与未验证范围

- 未连接真实 SSH 资产，未验证真实主机指纹、凭据、远端超时和审计落库；当前证明来自离线合成 IPC 夹具，不代表真实服务器执行通过。
- 未启动 Windows 原生 Tauri/WebView2 窗口；尺寸与视觉核对来自 Edge 离线夹具截图。系统剪贴板在夹具中模拟。
- AI 草稿模型请求及 Reeve MCP 的审批通过/拒绝/超时不在离线夹具覆盖范围内。
- 构建存在既有的大型 JS chunk 告警，不影响本步验收通过。

## 验收边界

工作区原有其他未提交改动保持原样。本次只新增本验收回执；没有修改批量业务文件，没有暂存或提交。
