# 第 11 步 · 敏感库实施回执

## 实现

- 沿用「安全与治理 → 敏感库」和 `#/sensitive`。列表提供待处理计数、服务器／类型／状态筛选、关键词搜索和 25 条分页。详情展示脱敏预览、来源、状态、检测时间、命中次数和匹配指纹。
- 单条处理在详情内完成。全选覆盖当前筛选结果，丢弃需要确认并通过原有状态更新 IPC 标记。批量操作按后端逐条结果计数，识别返回 `false` 和抛错的记录，刷新后保留仍匹配的失败项供重试。
- 测试扫描调用原有 Rust 服务并展示其脱敏结果。输入只保存在对话框内，扫描成功后清空。扫描完成或失败后重新读取列表，收录后端已保存的记录。零命中时显示计数。
- CSV 导出使用与列表一致的服务器、状态、类型和关键词条件。用户选择保存位置后，前端把现有导出 IPC 返回的 CSV 交给原有写入接口。读取、搜索、扫描、状态更新和导出失败均有明确提示。
- 实现范围为 `src/pages/sensitive/`，沿用现有路由、IPC、Rust 脱敏和权限配置。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm run build` | 通过，Vite 提示存在超过 500 kB 的分块 |
| 目标文件 `git diff --check` | 通过，Git 提示 LF 后续会转换为 CRLF |
| 隔离 Edge 与 mock IPC | 亮色、暗色各测 1100×700 和 1440×900，四组各 48 项，合计 192 项通过 |

浏览器用例覆盖双轨入口、列表和详情、组合筛选、分页和跨页全选、关联服务器扫描、扫描失败后重试及零命中、丢弃确认和取消、批量部分失败后重试、脱敏 CSV 的过滤条件和传给写入接口的内容、取消导出、导出和写入失败、页面重载以及读取失败后的恢复。夹具稳定后完整重跑通过。

测试使用合成文本和记录。CSV 写入由 mock 捕获，未生成真实导出文件。未连接真实 Tauri 数据库或访问用户敏感资料，Rust 脱敏规则、原生保存对话框和真实文件写入未做运行时验证。

本批未暂存、提交或推送。`.agent-pipeline/state.json` 的 SHA-256 与开工前一致。

已参考 `security-permissions`、`database-ops`、`ui-frontend`、`test-development`。

## 独立验收返工第 1 轮

- **B1 来源脱敏。** Rust 在扫描及出口记录入库前检查来源，整项遮蔽命中现有规则或含非标签字符的值。手动扫描还会遮蔽复用了正文中已被替换的值的来源。列表和 CSV 复用同一读取边界，先遮蔽旧来源，再返回结果或执行搜索。成功扫描后，表单清空正文并将来源恢复为默认标签。历史库没有执行磁盘回填。
- **B2 字面搜索。** SQLite 继续按服务器、状态和类型筛选，Rust 在可见的服务器别名、标签和来源中做字面子串匹配，保留 ASCII 大小写不敏感。列表、跨页全选和 CSV 使用同一匹配范围。`_` 和 `%` 按普通字符处理。

| 实际命令或操作 | 结果 |
| --- | --- |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::sensitive::tests` | 6 项通过。使用内存 SQLite 检查新写入与旧来源投影、隐藏值搜索、字面搜索、批量范围和 CSV。 |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::audit::tests` | 6 项通过。Cargo 报告已有的 `AlertRule` 未构造警告。 |
| `pnpm exec tsc --noEmit` | 通过。 |
| `pnpm run build` | 通过。Vite 仍提示存在超过 500 kB 的分块。 |
| `git diff --check -- src-tauri/src/database/mod.rs src-tauri/src/services/sensitive.rs src/pages/sensitive/index.tsx`，以及新文件逐一跑 `git diff --no-index --check -- /dev/null <file>` | 通过。Git 提示 LF 后续会转换为 CRLF。 |
| `node` 运行合成夹具，使用 Edge CDP 与 Tauri `mockIPC` | 亮色、暗色各测 1100×700 和 1440×900，四组各 63 项，合计 252 项通过。首轮小窗点击分页超时，夹具补上滚动到分页按钮后完整重跑通过。 |

浏览器夹具在来源和正文使用同一合成标记，并另种一条含合成标记的旧来源。两者都未出现在列表、详情和捕获的 CSV 中。52 条搜索样例里有 26 条 `note_foo`，在两页间全选后只更新这 26 条，`noteXfoo` 和 `note%foo` 均未被误选或混入该次导出。单独搜索 `%` 只命中并导出 `note%foo`。

Rust 测试使用真实服务和内存 SQLite。浏览器与 Rust 之间的原生 Tauri IPC、Windows WebView2、系统保存对话框和磁盘写入未做端到端验证。全程未读取、改写或导出真实敏感数据。本轮未暂存、提交或推送，也未写入 `state.json`。首次写回后复核发现台账哈希与本轮开工时不同，导致校验命令退出。回执单独读回确认已写入。

本轮已参考 `security-permissions`、`database-ops`、`bug-detective`、`test-development`。

## 返工第 1 轮 · 敏感来源脱敏

- 新写入来源改为复用现有 Rust 脱敏规则对整段内容处理。来源是正文中的裸 secret 时使用通用占位符，来源带上下文时保留安全上下文并替换命中的 secret。
- 列表出口先对历史来源做同一套整段脱敏，再执行关键词匹配。详情复用列表返回值，CSV 复用列表结果，因此旧记录的列表、搜索、详情和导出均不会返回来源原文。
- 脱敏占位符保持幂等，重复经过列表或 CSV 出口不会被误判为未识别来源。未命中规则且包含赋值、引号等非来源标签字符的旧来源仍整体替换为 `[REDACTED]`。

| 检查 | 结果 |
| --- | --- |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib services::sensitive::tests -- --nocapture` | 7 项通过。覆盖新来源完整赋值、裸值、混合标签、历史来源、隐藏值搜索、字面搜索、批量范围和 CSV。 |
| `pnpm exec tsc --noEmit` | 通过。 |
| `pnpm run build` | 通过。Vite 保留既有单块超过 500 kB 的提示。 |
| `git diff --check -- src-tauri/src/services/sensitive.rs` | 通过。Git 仅提示工作区 LF 后续可能转换为 CRLF。 |

本轮仍未验证真实用户数据库或备份中的磁盘回填，未执行历史敏感来源的全盘迁移。未实测原生 Tauri IPC、Windows WebView2、系统保存对话框、原生 CSV 磁盘写入及真实用户敏感数据。B2 既有 Rust 字面搜索测试保持通过。本轮未暂存、提交或推送。
