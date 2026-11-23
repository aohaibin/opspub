# 第 12 步审计子批次独立验收

**首轮结论为阻断，返工后复验结论见文末更新（当前通过）。** 首轮问题为当前页导出和审计详情泄漏旧日志中的合成凭据。审查基于 `opspub` 分支 `d2bb26d` 上的审计工作树，覆盖入口文件及四个新增审计文件。原型 SHA-256 与基线一致，为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D`。

## 阻断项

### B1 · 常见凭据格式绕过旧日志脱敏，进入详情、搜索、复制、经验和导出

用 Tauri `mockIPC` 让 `get_audit_logs_page` 返回合成旧记录 #58。命令包含带引号的 `MYSQL_ROOT_PASSWORD='…'` 和 MySQL 连写参数 `-p…`，结果包含 JSON 字段 `"access_token":"…"`。三处值使用彼此不同的合成标记。打开 `#/audit`，搜索其中的环境变量值，随后用普通关键词将结果收窄至这一条。打开详情，点击复制和转经验，再关闭详情并接受保存对话框的模拟返回。

| 观察点 | 亮色、暗色各在 1100×700、1440×900 的实测结果 |
| --- | --- |
| 搜索 | 输入环境变量的合成明文值，命中一条记录。 |
| 详情 | 命令中的环境变量值、连写参数值，以及结果中的 JSON 字段值均可见。 |
| 复制 | 剪贴板 mock 收到完整的两个命令凭据值。 |
| 转为经验 | `ops_copilot_experiences` 新条目含三个值，原有经验条目也仍存在。 |
| 导出 | 捕获的 `write_text_file` JSON 请求体仅含记录 #58，`count=1`，三个值均原样存在。直接读取 IPC 请求体确认泄漏。 |

`CREDENTIAL_ARGUMENT` 用单词边界匹配固定字段，跳过下划线前缀的 `MYSQL_ROOT_PASSWORD`、`access_token`，且短参数 `-p` 后要求空白或等号。`prepareAuditRow` 将这份投影交给搜索和所有下游操作。现有 Rust 分页链路读取已存字段，脱敏发生在写入路径，现有 Rust 测试通过无法覆盖这些旧记录输入。复验时应确认上述三个合成标记在详情、搜索、剪贴板、经验及 `write_text_file` 载荷均不可见，同时保留非敏感内容和当前页记录范围。[前端脱敏](../src/pages/audit/audit.ts#L61) · [复制、经验、导出](../src/pages/audit/index.tsx#L93) · [Rust 审计服务](../src-tauri/src/services/audit.rs#L32)

证据在 `%TEMP%/opspub-step12-audit-review-evidence-l6NgF0/`。四份 `*-independent.json` 记录泄漏面和导出 ID，四张 `*-credential-counterexample.png` 显示详情。复跑时在仓库根目录先执行 `pnpm build --outDir (Join-Path $env:TEMP 'opspub-step12-audit-review-build')`，再执行 `node (Join-Path $env:TEMP 'opspub-step12-audit-review-independent.cjs')`。脚本报告的断言通过数包含对正常流程的检查，反例以 `observations` 中的实际标记单独记录。

## 非阻断项

- **分页链接依赖页内位置。** 四组附加场景把 #21 放在第 2 页末尾，插入一条更新的记录后刷新详情。原链接显示「当前页找不到此记录」，关闭详情后可在第 3 页找回 #21。稳定数据上的页码、每页条数、详情 ID 均通过重新加载恢复。这是已披露的偏移分页限制。现场证据为 `%TEMP%/opspub-step12-audit-review-compat-Tq1HyL/*-shifted-detail.png`。
- **原型差异和接口范围。** 实现采用右侧抽屉，原型以行首箭头提示展开。筛选、搜索、导出及五张有页内标记的指标按当前页计算，精确审批关联最多查询最近 100 条，缺少唯一关联时可进入历史。原型展示的完整导出、回放、链式验真未纳入本批交付。亮暗原型截图与实现四组对照见 `%TEMP%/opspub-step12-audit-review-evidence-l6NgF0/visual-comparison.png`。

## 其他实际验证

| 范围 | 实际结果 |
| --- | --- |
| 类型和生产构建 | `pnpm exec tsc --noEmit`、`pnpm build --outDir <临时目录>` 均退出 0。独立构建生成 `index-DsduR_KX.js`、`index-mZvbDIHf.css`，与实现回执一致。保留 Vite 大分块提示。 |
| Rust 定向测试 | `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::audit::tests` 通过 6 项，过滤 182 项，使用内存数据库。保留既有 `AlertRule` 未构造警告。 |
| 复跑实施方夹具 | 复跑 33 项模型断言和四组共 304 项浏览器断言，均通过。浏览器复跑仅将静态构建路径指向临时目录。截图和证据在 `%TEMP%/opspub-step12-audit-42vAYO/`。 |
| 独立浏览器夹具 | 使用独立 Edge 配置、回环服务及新合成输入，复用实施方的 CDP 驱动及 IPC mock 接线。四组各执行 46 项断言并记录 B1，附加兼容用例四组各 9 项通过。检查了实际挂载的列表、抽屉和审批入口。 |
| 界面和入口 | 两种尺寸和主题均可从安全与治理进入 `#/audit`，导航高亮正确。审批页页头、工单详情中既有审计链接可点击，浏览器后退恢复原审批工单。分页区底部测量为 679 px 和 879 px，均在视口内。长内容用例的抽屉操作按钮可达。 |
| 空态、读取失败和乱序 | 空库与筛选无匹配时禁用导出。首次读取失败显示可重试提示。刷新失败保留之前读取的同页及详情并暂停导出。故意延迟的第 3 页响应未覆盖随后加载的第 1 页。保留期模拟收缩后重新请求最后有效页。 |
| 审批关联 | 使用唯一绑定加同任务 ID 的错误目标干扰项，校验跳转到工单 #803 和合成回执。关联读取失败可重试。无键记录只链接审批历史，多匹配由复跑夹具验证回退。未观察到审批、执行或新增审计的模拟写入调用。 |
| 导出边界 | 取消保存未触发文件写入 IPC，写入模拟失败有提示。延迟模拟对话框期间切换筛选，写入仍使用点击时的当前页结果。内容脱敏因 B1 未通过。 |

`git diff --check -- src/pages/audit` 通过，Git 给出既有换行转换提示。附加浏览器夹具初次点击审批抽屉时遇到入场动画时序问题，等待抽屉稳定后四组复跑通过。

## 未验证

本轮使用生产前端构建和合成 IPC。真实 Windows Tauri/WebView2、原生保存对话框、文件落盘、真实审计数据库、审批实际裁决及远程执行均未验证。项目任务系统在本会话中不可用，浏览器场景由隔离的回环服务运行。仅写入本验收报告，未修改业务代码或提交。

参考技能为 `check`、`test-development`、`ui-frontend` 和 `theme-system`。

---

# 第 12 步审计子批次返工复验

**复验结论为通过，首轮 B1 阻断已解除。** 当前分支 `opspub`，HEAD `d2bb26d`。本轮只更新此审查报告，未改业务文件、未暂存、未提交。复验以合成旧日志为输入，检查 Rust 两个读取入口和生产构建的前端所有展示及导出路径。

## 阻断项

无。首轮记录的 `MYSQL_ROOT_PASSWORD`、MySQL 连写 `-p` 和 JSON `access_token` 三个值，在四组 Edge 浏览器 mock 中均未出现在搜索匹配、列表 DOM、详情 DOM、剪贴板文本、本机经验新条目或导出 `write_text_file` 请求体。夹具还把相同值复制到结果、操作主体和服务器别名，验证同条日志跨字段重复值也被遮蔽。非敏感命令、回执、别名上下文及原有经验条目保留。导出载荷仅含点击时筛选出的记录 #58，`count=1`。

## 非阻断项

- **偏移分页的详情稳定性有限。** 页码和每页条数由哈希路由恢复，数据新增后旧详情 ID 可能落到相邻页；关闭抽屉后仍可分页查找。四组兼容 mock 各 9 项通过，证据在 `%TEMP%/opspub-step12-audit-review-compat-Yspcg2/`。
- **筛选和导出范围沿用接口能力。** 搜索、筛选及 JSON 导出仅针对当前读取页。旧非分页 API `get_audit_logs` 仍保留，Rust 服务同样投影记录后返回；分页 API 继续返回原 `limit`、`offset`、`total` 和 `has_more` 元数据。
- **真实运行环境仍待验。** 本轮未验证原生 Windows Tauri/WebView2、原生保存对话框、实际文件落盘、真实审计库和真实历史日志。浏览器与导出验证均使用隔离 Edge、合成 IPC 及回环静态服务，不能替代实际桌面落盘验收。

## 实测与证据

| 范围 | 实际结果 |
| --- | --- |
| Rust 读取安全 | `get_logs` 与 `get_logs_page` 均调用 `project_logs`，投影 `server_alias`、`command`、`user`、`result`。定向内存数据库用例确认旧行读取脱敏、原始存证字段未改写、敏感库无新增条目，并核对分页元数据。 |
| 前端流向 | `getLogsPage` 返回值在写入页面快照前经 `prepareAuditRow` 投影。筛选/搜索、列表、详情、复制、经验、JSON 导出均从投影后的行生成。审批执行回执单独投影后才显示。 |
| 构建与 Rust 测试 | `pnpm exec tsc --noEmit` 退出码 0。`pnpm build` 退出码 0，产物为 `index-DIZZgySc.js` 与 `index-mZvbDIHf.css`，有 Vite 大分块警告。定向 `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib -- services::audit::tests services::sensitive::tests` 15 项通过，174 项过滤，保留既有 `AlertRule` 未构造警告。 |
| 敏感模型 | `node (Join-Path $env:TEMP 'opspub-step12-audit-security-model.cjs')` 54 项断言通过。 |
| 安全浏览器 | `node (Join-Path $env:TEMP 'opspub-step12-audit-security-browser.cjs')` 亮暗主题 × 1100×700、1440×900 四组各 58 项，共 232 项通过。证据与截图在 `%TEMP%/opspub-step12-audit-security-evidence-MguMlJ/`。 |
| 原功能回归 | `node (Join-Path $env:TEMP 'opspub-step12-audit.cjs')` 亮暗主题 × 两种尺寸四组各 76 项，共 304 项通过，覆盖刷新、列表、详情、复制、经验、JSON 导出、审批关联、路由恢复、空态及分页。证据在 `%TEMP%/opspub-step12-audit-U0Qkcb/`。 |
| 旧入口与差异检查 | 代码搜索确认路由仍注册 `#/audit`，审批页面两处“查看审计日志”仍指向 `/audit`，`get_audit_logs` Command 及 API 封装仍在。`git diff --check` 对审计实现文件退出码 0，仅有 Git 换行转换提示。 |

已参考技能：`check`、`bug-detective`。
