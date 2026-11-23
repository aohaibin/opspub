# 第 12 步 · 审计子批次实施回执

审计子批次已完成 B1 安全返工，等候独立复验。分支为 `opspub`，基准 HEAD 为已通过审批验收的 `d2bb26d`。下方首轮实施记录保留，返工后的实现与测试结果见末节。

## 实现与原型映射

依据 `state.json` 第 12 步、`review-checklist.md`、`baseline.md` 审计条目、`step-12-approval-implementation.md`、`step-12-approval-review.md` 和 `docs/ops-prototype-direction2-workspace.html` 的 `tab-audit`。原型 SHA-256 为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D`。

| 原型或基线 | 实现 |
| --- | --- |
| 双轨工作区、审计入口 | 沿用「安全与治理 → 审计存证日志」和 `#/audit`。已验收的审批页审计入口继续使用该路由。 |
| 顶栏、全部与批次、六项指标 | 保留视图切换、刷新和导出。总计取分页接口返回值，其余五项以当前读取页为统计范围。沿用主题变量及已有双主题裁决配色。 |
| 工具、裁决、来源、服务器、日期、搜索、折叠重复 | 在当前页组合筛选。工具解析支持现有 `tools/call` 审计格式。已删除服务器的别名仍取自历史记录，服务器列表读取失败时审计页可以独立使用。裁决区分已发起、已批准、已完成、失败和超时。 |
| 列表与展开详情 | 表格保持时间、来源、服务器、动作、结果、裁决、快捷操作的顺序。点击命令打开详情抽屉，查看操作主体、命令参数及执行回执。列表和抽屉均保留复制脱敏命令及转为经验。 |
| 刷新与恢复 | 复用 `get_audit_logs_page` 的 `limit` 与 `offset`。视图、页码、每页条数和详情 ID 可通过哈希路由恢复。手动刷新保留当前筛选和同页详情。刷新失败保留以前成功读取的同页并暂停导出，迟到响应被忽略。保留期清理导致页码越界时重新查询最后可用页。 |
| 审批与执行关联 | 对 `copilot.rs` 生成的 MCP 待审批日志，从结果提取 `task_id`，用 `list_ai_approval_details` 返回的任务绑定和目标别名找唯一匹配。显示工单状态、脱敏回执和 `#/security?approvalId=…` 入口。无唯一匹配或记录缺少关联键时提供审批历史入口。 |
| 导出与既有查看能力 | 使用现有保存对话框及 `write_text_file` 导出当前页命中记录的 JSON。展示、检索、复制、经验和导出使用同一份脱敏字段。经验继续写入既有本机经验库，超长内容按经验库已有 12,000 字符上限截断并提示。 |

## 交付文件

| 文件 | 职责 |
| --- | --- |
| `src/pages/audit/index.tsx` | 页面布局、路由状态、分页读取与反馈、详情联动、复制、经验、导出。 |
| `src/pages/audit/AuditList.tsx` | 审计筛选、表格及行操作。 |
| `src/pages/audit/AuditDetail.tsx` | 详情抽屉、裁决显示、已有审批及其执行结果关联。 |
| `src/pages/audit/audit.ts` | 日志字段归一、历史文本遮蔽、裁决分类、筛选和折叠重复。 |
| `src/pages/audit/audit.css` | 审计页及抽屉的双主题布局、滚动和长内容处理。 |

## 验证结果

| 实际命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0。 |
| `pnpm build` | 退出码 0。Vite 产物为 `index-DsduR_KX.js` 和 `index-mZvbDIHf.css`，保留超过 500 kB 的分块提示。 |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::audit::tests` | 6 项通过，182 项过滤，退出码 0。用内存数据库验证分页边界、保留期、字段截断和写入脱敏。保留既有 `AlertRule` 未构造警告。 |
| `node (Join-Path $env:TEMP 'opspub-step12-audit-model.cjs')` | 33 项断言通过，退出码 0。覆盖实际结果状态格式、历史文本遮蔽、工具与绑定解析、搜索及去重。 |
| `node (Join-Path $env:TEMP 'opspub-step12-audit.cjs')` | 亮色与暗色各跑 1100×700、1440×900，每组 76 项断言，合计 304 项通过，0 个场景失败，退出码 0。 |
| `node (Join-Path $env:TEMP 'opspub-step12-audit-capture-prototype.cjs')` | 亮暗两种主题下各采集两种尺寸的离线原型截图，退出码 0。 |
| `git diff --check -- src/pages/audit` | 退出码 0，Git 提示已有审计入口文件的换行符可能转换。 |

浏览器通过独立 Edge 配置、回环静态服务器和 Tauri `mockIPC` 加载生产构建。定向用例覆盖双轨高亮、服务器选项读取失败隔离、全套筛选、裁决与退出码、保存取消及写入失败、JSON 载荷、脱敏复制和经验、审批关联读取重试、错目标和多匹配反例、审批回执刷新、跨页跳转、浏览器后退及重载恢复、刷新失败后保留上下文、末页回退、乱序响应、失效详情和长内容视口。初期夹具修正了虚拟选项选择、抽屉动画中的点击和几何测量。页面调整了提示位置，避免提示覆盖窄窗口的抽屉关闭按钮。最终运行覆盖全部四组。

- 实现截图和各组 IPC 证据位于 `%TEMP%/opspub-step12-audit-esLOId/`，包含列表、详情、长内容、刷新失败和 `*-evidence.json`。
- 原型截图位于 `%TEMP%/opspub-step12-audit-prototype-32Fy5b/`。截图夹具将示例资产替换为合成资料，并使用缓存的样式和图标资源离线渲染。

## 能力边界与待验证项

- 分页接口只接受条数和偏移量，因此筛选、搜索及 JSON 导出限当前页。浏览器路由保存视图、分页和所选记录，筛选控件和搜索词保留在当前页面内存。新增日志可能使原记录移出旧分页链接所指页面，届时详情会提示关闭后通过分页查找。
- 精确关联限包含 MCP 任务 ID 且可在最近 100 条审批中找到唯一绑定的日志。现有人工裁决与执行摘要没有公共关联键，通过详情中的审批历史入口查阅。原型的回放、全库导出和链式验真没有对应的现有能力。
- 当前会话缺少项目任务系统。未验证原生 Windows Tauri/WebView2、原生保存对话框和实际文件落盘，也未使用真实资产、审批裁决、远程执行或审计库数据。历史文本遮蔽测试覆盖可识别的合成格式，真实历史资料留待隔离副本验收。

工作树交付，空暂存区，HEAD 为 `d2bb26d`。`state.json` 在本次会话开始及结束的 SHA-256 均为 `517172AD7F47DDB3A98B98E4A774E87265EDEACF07DFED051CAF2CAD49802990`。

已参考技能 `project-navigator`、`ui-frontend`、`theme-system` 和 `test-development`。

## B1 安全返工 · 2026-11-23

独立验收使用旧日志复现了 `MYSQL_ROOT_PASSWORD`、MySQL 连写 `-p` 和 JSON `access_token` 的值从审计读取泄漏到详情、搜索、剪贴板、经验和 `write_text_file`。修复后，Rust 审计服务在返回分页和非分页记录前，使用敏感库的只读投影同时处理命令、结果、操作主体和服务器别名。投影还替换同一记录其他字段中的已识别重复值，保留非敏感上下文与分页元数据。内存数据库用例确认原始存证保持原样，读取未向敏感库增加条目。

React 在缓存 IPC 结果前使用同一套规则处理记录。列表、详情、搜索、剪贴板、经验和导出共用投影后的行，审批关联中的回执也经过投影。Rust IPC 命令及数据结构、数据库结构和安全策略保持原有契约。

| 返工文件 | 变更 |
| --- | --- |
| `src-tauri/src/services/audit.rs` | 两个读取入口共用投影。增加含混合字段的直接入库旧记录用例，写入脱敏测试直接核对存储字段。 |
| `src-tauri/src/services/sensitive.rs`、`src-tauri/src/services/sensitive/projection.rs` | 敏感库提供只读投影。原扫描复用共享的 JWT、GitHub Token、AWS Access Key 和 IP 识别规则。 |
| `src/lib/sensitive-projection-rules.json`、`src/lib/sensitive-projection.ts` | JSON 规则供 Rust 与 React 共用。投影覆盖凭据字段、命令参数及同条记录中的重复值。 |
| `src/pages/audit/audit.ts`、`src/pages/audit/index.tsx`、`src/pages/audit/AuditDetail.tsx` | 使用共享投影生成和缓存审计行，展示脱敏后的审批回执。 |

| 返工验证 | 最终结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0。 |
| `pnpm build` | 退出码 0，产物 `index-DIZZgySc.js`、`index-mZvbDIHf.css`，有既有 Vite 大分块提示。 |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib -- services::audit::tests services::sensitive::tests` | 15 项通过，174 项过滤，退出码 0。有既有 `AlertRule` 未构造警告。 |
| `node (Join-Path $env:TEMP 'opspub-step12-audit-security-model.cjs')` | 54 项断言通过，退出码 0。包括跨字段重复、多个连写参数、带转义的 JSON、对已有遮蔽文本再次投影和保留非敏感上下文。 |
| `node (Join-Path $env:TEMP 'opspub-step12-audit-security-browser.cjs')` | 亮暗主题 × 1100×700、1440×900 共四组，每组 58 项，共 232 项通过，退出码 0。 |
| `node (Join-Path $env:TEMP 'opspub-step12-audit.cjs')` | 原四组合成流程复跑 304 项通过，退出码 0。 |

安全浏览器夹具复用独立验收的复现，并将凭据值重复放到结果正文、主体和服务器别名。四组均验证三种值的搜索结果为零，列表和详情无凭据值，模拟剪贴板、新经验标题与内容、`write_text_file` 请求体无凭据值。非敏感正文、旧经验条目及导出范围保留，导出的 `count=1` 且记录 ID 为 `58`。安全用例截图和 JSON 证据位于 `%TEMP%/opspub-step12-audit-security-evidence-81BZns/`，原功能复跑证据位于 `%TEMP%/opspub-step12-audit-0Pj6yR/`。

跨页详情链接仍依赖偏移分页，新增日志可能把记录移到相邻页。该项按验收报告记录为非阻断。验证仅使用合成数据、内存数据库和隔离 Edge。原生 Tauri、实际文件落盘及真实历史日志仍待验证。返工前后 `state.json` SHA-256 均为 `E1E27E061062207BF745F27815BD80AB30FDF987DD0186453C16BF61194F32B1`，暂存区为空，HEAD 为 `d2bb26d`。

返工参考技能 `bug-detective`、`security-permissions` 和 `test-development`。
