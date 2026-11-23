# 第 12 步 · 告警子批次实施回执

已在 `opspub` 分支的 `fd08765` 工作树完成告警子批次及独立验收提出的两项阻断返工。返工验证见末节，原实施记录保留。以 `state.json`、通用验收清单、告警基线、新版原型的告警与通知段，以及审批 `d2bb26d`、审计 `fd08765` 的实施和验收报告为依据。现有告警页主题改动纳入实现基线。

## 实现范围

- `src/pages/alerts/index.tsx` 和 `alerts.css` 接入六列表格、状态与级别标签、服务器及文本搜索、阅读状态筛选和详情抽屉。列表默认显示触发中和已静音，切换全部状态可查已恢复事件。历史服务器仍可以从事件中筛选。抽屉显示触发指标、阈值、时间、处置建议和旧终端入口。
- `#/alerts` 和告警规则、通知渠道、立即检查、页面监控入口继续可用。视图、事件 ID 与筛选取自 URL。刷新失败保留最近成功读取的事件，暂停静音及恢复操作并提供重试。写入成功后更新生命周期状态，写入失败时保留原状态并显示错误。
- `src/store/alerts.ts` 让告警页和通知入口共享事件快照。读取经既有 `get_config` 读取 `alerts.events`，写入经现有 `alertsApi.saveEvents`。已读状态用本机 WebView 的 `localStorage` 按事件 ID 保存，旧历史首次默认为未读。阅读状态与触发状态独立，静音到期再次触发可重新进入未读。
- `src/components/layout/header/AlertBell.tsx` 和 `workspace.css` 接入最近 5 条未读事件、事件详情直达、全部已读和旧告警中心入口。通知角标为未读事件与待审批数之和，告警页仍按未恢复事件显示活跃计数。点击通知事件时标记该条已读，全部已读只作用于告警。待审批链接继续指向 `#/copilot?approvalId=<id>`。
- 五种现有渠道继续显示实际配置状态，沿用原配置、开关与测试入口。原型里的 AI 自动根因、自动修复与模拟健康状态没有接入，详情使用现有规则产生的处置建议。既有探针、渠道、配置 IPC 及后端策略继续由原实现提供。

## 验证结果

| 实际命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0。 |
| `pnpm build --outDir (Join-Path $env:TEMP 'opspub-step12-alerts-build')` | 退出码 0。产物为 `index-B1PnngDx.js` 和 `index-vv5HxvYU.css`。Vite 提示工作区外输出目录与大于 500 kB 的分块。 |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::alerts::tests` | 退出码 0。3 项通过、0 项失败、186 项过滤。覆盖渠道标识、URL 协议和 SMTP 配置验证，有既有 `AlertRule` 未构造提示。 |
| `node (Join-Path $env:TEMP 'opspub-step12-alerts.cjs')` | 退出码 0。亮暗主题 × 1100×700、1440×900 四组，每组 50 项，共 200 项通过，0 组失败。 |
| `git diff --check -- src/pages/alerts src/components/layout/header/AlertBell.tsx src/components/layout/workspace.css src/store/alerts.ts` | 退出码 0。Git 提示工作副本换行可能转换。 |

Edge 夹具在回环地址载入生产前端构建，通过 Tauri `mockIPC` 提供合成数据。实际断言包括：

- 旧入口和双轨高亮、六列顺序、生命周期与阅读状态并列、已删除服务器筛选、级别与关键词组合、无匹配和真实空历史。
- 历史事件详情与长文本、窗口宽度和抽屉底部按钮可达、筛选及详情在刷新后恢复、失效详情链接可关闭。
- 读取错误保留列表、同一详情重试、保存失败保留状态、保存期间禁用并发操作、静音截止及恢复时间通过原配置键持久化。
- 标记已读、未读和全部已读的即时联动、通知直达正确事件、待审批保留、点击旧链接落到合成工单 #701、后退恢复告警页、合成探针新增事件并更新计数。
- 空态打开通知渠道、五类入口存在、测试使用既有 `send_alert_channel` 且目标为配置过的飞书、旧规则列表可达、零 SSH IPC、无浏览器运行异常或外部页面请求。

最终截图和 IPC 证据位于 `%TEMP%/opspub-step12-alerts-evidence-6VhI3d/`。早期运行先修正了抽屉根节点定位与动画等待，补验审批链接时再补齐了 Copilot 读取的 `list_ai_approval_details` 合成响应。最终四组均完整复跑。

## 未验证项

当前会话无项目任务系统，使用隔离 Edge 与临时回环服务。原生 Windows Tauri/WebView2、真实历史库及本机 WebView 持久化、实时采样定时、SSH 终端实际连接、系统凭据管理器和真实渠道投递均未实测。规则及渠道配置保存、删除沿用旧流程，本轮浏览器验证覆盖入口和模拟渠道发送。按 URL 恢复视图、筛选和详情，表格页码由当前会话管理。

本次未修改 `state.json`，未暂存、提交或推送。审批与审计子批次沿用已验收提交。

已参考技能 `ui-frontend`、`theme-system`、`notification-system`、`store-management` 和 `test-development`。

## 独立验收阻断返工

- **迟到采样。** `src/pages/alerts/index.tsx` 在页面实例卸载时使该实例采样失效。探针或共享刷新返回后检查页面实例，再进行规则评估和保存。离开后再次进入可立即发起新采样。已经发出的探针 IPC 由后端完成，失效结果退出前端流程。
- **损坏历史。** `src/store/alerts.ts` 在发布共享快照前过滤空值、非法字段和重复 ID。全部非法时显示空表，部分非法时仍显示有效记录。发现非法行时提示重试，并阻止整表覆盖写入。后续读取到有效历史或缺失配置键时恢复正常。共享通知继续展示待审批入口。
- 独立验收报告的非阻断项维持原记录。原型是卡片配行内建议，现有实现采用表格和详情抽屉。表格页码仍由当前会话管理。原生端和真实数据的未验证项同上。

| 返工实际命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0。 |
| `pnpm build --outDir (Join-Path $env:TEMP 'opspub-step12-alerts-rework-build')` | 退出码 0。产物 `index-GuB6lWeN.js`、`index-vv5HxvYU.css`。保留工作区外输出目录及 Vite 大分块提示。 |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::alerts::tests` | 退出码 0，3 项通过、186 项过滤。保留既有 `AlertRule` 未构造提示。 |
| `node (Join-Path $env:TEMP 'opspub-step12-alerts-store-rework.cjs')` | 退出码 0，15 项断言通过。覆盖全空非法行、混合行过滤、重复 ID、拒绝覆盖写入、修复后重试及配置缺失。 |
| `node (Join-Path $env:TEMP 'opspub-step12-alerts-rework.cjs')` | 退出码 0。亮暗主题 × 1100×700、1440×900，四组各通过 64 项，共 256 项，0 组失败。 |

四组先暂扣 40% 旧探针，离开并重进告警页，先返回 97% 新探针。释放旧探针后，合成 IPC 记录表明没有新增事件写入，原事件 ID 继续为 `active / 97%` 且保持可见。再从 Copilot 重载 `[null]`，核对审批卡和通知入口可用。混合损坏历史保留唯一有效行，静音、标记恢复和采样写入暂停。重试读到有效数据后动作恢复。浏览器截图及每组 IPC 断言证据位于 `%TEMP%/opspub-step12-alerts-rework-evidence-YHBXuV/`。

返工参考 `bug-detective` 与 `test-development`。本轮未暂存、提交、推送或写入 `state.json`。
