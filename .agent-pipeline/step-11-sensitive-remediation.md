# 第 11 步 · 敏感库安全修复回执

手动扫描和 AI 出口扫描在保存前执行同一套来源处理。规则命中的字段替换为类型占位符，合规的备注文字和普通标签可以保留。处理后若仍含正文或来源中已识别的秘密值（包括仅 ASCII 大小写不同的值），或含未识别的赋值等非标签内容，则整项显示为 `[REDACTED]`。扫描返回与数据库保存使用同一结果。

SQLite v24 为新写入记录来源已通过检查的标记。历史记录仅在来源完整等于已知固定标签或标准占位符时保留该值，其余显示为 `[REDACTED]`，包括可独立阅读但无法判定安全性的旧备注。列表先应用该策略再搜索，详情直接读取列表记录，CSV 复用列表过滤。B2 继续按可见字段做字面子串搜索，`_` 和 `%` 均为普通字符。

| 验证 | 结果 |
| --- | --- |
| `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib -- services::sensitive::tests services::audit::tests database::schema::tests` | 19 项通过，其中敏感库 8 项、审计 6 项、数据库迁移 5 项。保留既有的 `AlertRule` 未构造警告。 |
| `pnpm exec tsc --noEmit` | 通过。 |
| `pnpm run build` | 通过。Vite 保留既有的分块超过 500 kB 提示。 |
| `git diff --check -- src-tauri/src/database/mod.rs src-tauri/src/database/schema.rs src-tauri/src/services/sensitive.rs` | 通过。Git 提示后续可能转换工作区换行符。 |

内存 SQLite 使用合成数据验证了新记录的混合备注、嵌入裸值、重复裸值、未识别赋值、占位符幂等、普通标签和 AI 出口来源。历史测试覆盖 v23→v24、裸值、完整赋值、带占位符的旧自由文本及固定标签，并核对搜索结果和解析后的 CSV。B2 验证了批量状态操作和 CSV 的字面匹配范围。旧版迁移测试夹具复用 v11 原有的敏感库建表步骤，补足实际旧库已有的表。

详情通过源码核对了数据来源。本轮验证限于服务、内存 SQLite 和前端编译，原生 Tauri IPC、WebView2、保存对话框与 CSV 磁盘写入未实测。迁移仅增加来源标记，历史数据库、备份和既有导出中仍可能有原文。本轮没有接触真实用户数据库。

未暂存、提交或推送，`.agent-pipeline/state.json` 的 SHA-256 与开工前一致。

已参考 `bug-detective`、`database-ops` 和 `test-development`。
