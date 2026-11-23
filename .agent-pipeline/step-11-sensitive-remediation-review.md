# 第 11 步 · 敏感库安全修复独立验收

**结论：本次来源安全修复通过定向复验，未发现阻断项。** 上轮 B1 的嵌入裸值、重复裸值及历史裸来源已由当前实现和对应运行证据覆盖；B2 字面搜索未发现回归。本结论限于源码审查、实现方已有 Rust／前端日志及本轮独立内存 SQLite 检查，不代表真实桌面端整体验收通过。

## 检查范围与方式

已先读 `review-checklist.md`、`step-11-sensitive-remediation.md`、`step-11-sensitive-review-round3.md`，并核对当前 diff、敏感库全部前端组件、API、Command、Service、DAO、迁移和备份恢复路径。仅新增本报告；未修改业务代码、未暂存、未提交，未接触真实用户数据库或敏感资料。未重复运行已有 Rust 19 项、tsc 或 build 命令。

审查基线为 HEAD `82c2c147d895c7c503c34ccb8634c2ff5ace89fb` 加当前未提交改动。关键源码 SHA-256：

- `src-tauri/src/services/sensitive.rs`：`70F79B795331F6DE5528415D990310A5E177D068DF6D4122806104045CA97325`
- `src-tauri/src/database/mod.rs`：`6C582E8741204A2A866D68D6A0B9EBC68E6D9545E949D1025DFA4E6FE96C8765`
- `src-tauri/src/database/schema.rs`：`C0A9306AF6A10928EE4F269017440F359908D94489DA4EC7CA37BF09ECD413F7`

## 阻断项

无。当前证据未显示旧来源原文能绕过投影进入敏感库列表、搜索结果、详情或 CSV。此处是指定安全修复的验收结论；真实 Tauri／WebView2／磁盘导出仍未验证。

## 反例与出口核对

下表的服务运行结果来自实现方最终通过的已有测试，本轮逐项审查了输入、断言和当前代码，没有将源码推断记作本轮 Rust 实测。

| 反例／边界 | 当前结果与依据 |
| --- | --- |
| 正文 `password=review-marker-synthetic`，来源 `Review ticket review-marker-synthetic`，以及来源将该裸值改成 ASCII 大写 | 整项来源为 `[REDACTED]`。`project_source` 对处理后的完整展示文本检查正文及来源中已识别的秘密值，使用相同的 ASCII 大小写归一化；不再比较整个来源是否出现在正文。对应 `scan_projects_sources_before_persistence_and_reading`。 |
| 来源 `Review password=review-marker-synthetic confirm review-marker-synthetic` | 赋值先替换，剩余裸值触发整项遮蔽；扫描返回、DAO 新行、列表及解析后 CSV 均断言为安全结果，按裸值搜索无记录。来源独自包含另一秘密并重复裸值的样例也有覆盖。 |
| 来源 `运维备注 password=review-marker-synthetic 由手工检查` | 保留为 `运维备注 [REDACTED: credential] 由手工检查`，不泄露裸值；该已处理文本再次作为来源扫描，结果保持原样。 |
| 来源 `Review password=review-marker-synthetic note=second-synthetic` | 替换后仍有未识别赋值，字符校验拒绝，首次扫描返回及持久化即为 `[REDACTED]`；消除了先保存、读取时才遮蔽的不一致。 |
| 已识别值本身带占位符：`password=tag[REDACTED]`，来源 `Note tag[REDACTED]` | `recognized_value_can_include_placeholder_text` 覆盖整项遮蔽。秘密残留检查使用完整展示文本，不会因移除占位符的字符校验步骤而漏检。 |
| 历史裸来源、完整赋值、带占位符的旧自由文本、`audit-command` 后附裸值、旧 `Unverified note_foo` | v23→v24 后标记为 0；除了完整固定标签／完整标准占位符，其余统一 `[REDACTED]`。测试同时检查列表、秘密值搜索为空及解析后的 CSV；DAO 旧行原文仍存在，证明验证的是读取投影而非测试数据已被洗掉。 |
| 普通安全来源 `ssh_exec · .env 检查`；新来源 `note_foo`、`note%foo` | 新写入标记为 1，安全文字继续可读。历史来源只有完整固定标签如 `手动测试`、`audit-command` 和完整标准占位符保留；没有把任意旧安全备注视为可信。 |
| `_`、`%` 字面搜索与批量、CSV 范围 | 测试中 52 行的 `Note_Foo` 搜索仅匹配 26 行 `note_foo`，批量状态和 CSV 仅涉及这 26 行；搜索 `%` 仅匹配并导出一行 `note%foo`。DAO 没有重新引入 `LIKE`。 |

源码调用链：

- 手动扫描 `services/sensitive.rs:108`、AI 出口扫描 `:153` 均在调用 DAO 前执行 `project_source`；DAO `database/mod.rs:940` 显式写入 `source_projected=1`，扫描返回复用该安全新行。
- 列表 `services/sensitive.rs:45` 取得来源及标记，在 `:54` 处理历史来源，之后 `:60` 才对可见的服务器别名、标签、来源做字面 `contains` 搜索。`is_known_legacy_source` 只接受完整固定值，旧备注中的占位符不能让整段内容获准展示。
- CSV `services/sensitive.rs:205` 直接调用同一 `list`；详情 `src/pages/sensitive/index.tsx:45` 从列表／搜索返回的记录取值，`SensitiveDetail.tsx:76` 展示该来源，未另取 DAO 原始来源。表格与跨页全选也复用当前筛选的列表集合。
- 搜索代码及 CSV 均没有独立的原始来源匹配路径。全仓搜索未找到其他直接读取敏感条目 DAO 的业务调用；DAO 本身仍含原文，只供 crate 内部使用，不能将它误称为已清洗存储。
- 五种标准占位符作为来源不会被规则重新识别；新记录列表与 CSV 不再二次改写来源。当前测试直接覆盖凭据占位符及混合上下文的稳定性；其余标准占位符的普遍稳定性是源码核对，完整动态矩阵本轮未验证。

## SQLite v24 与迁移边界

`database/schema.rs:245` 在事务中增加 `source_projected INTEGER NOT NULL DEFAULT 0 CHECK (source_projected IN (0, 1))` 并提升到 v24。旧行不被标为可信，也不改写原文。只有已在写入前处理的来源由 DAO 显式置 1；冲突更新使用同一已处理来源和新标记，读取新行时还要求标记为 1。

本轮使用 Python 标准库 SQLite、合成数据及 `:memory:`，直接提取当前 v11 建表 SQL 和 v23→v24 SQL，独立检查通过：旧行原文保留且标记为 0、版本为 24、NULL／2／-1 标记被约束拒绝、1 可接受、按当前版本门判断的 v24 重入不再执行 ALTER。该检查没有打开磁盘数据库，也没有替代 Rust 全链迁移实测。新库完整迁移及较早版本升级由已有 Rust 迁移测试提供证据。

较早版本的四个测试原先只造各自目标表，缺少真实旧库在 v11 已有的 `sensitive_entries`，所以第一次跑到 v24 失败。当前 diff 通过复用原 v11 建表迁移补齐夹具，随后仍调用完整迁移并保留既有业务断言，没有跳过 v24 或删除失败断言。`migrate` 对高于 v24 的库直接拒绝，v24 库直接结束。真实旧用户库、异常中断恢复和旧备份恢复的端到端行为未验证；源码显示 `restore_snapshot` 在复制旧备份表前先执行迁移，来源标记随表保留。

## 原始日志复核

原始证据为实现会话 `01a2038f-bc24-7200-b38a-b1ea41d5a128` 的本地日志：

`C:/Users/ao/.codex/sessions/2026/11/22/rollout-2026-11-22T22-01-21-01a2038f-bc24-7200-b38a-b1ea41d5a128.jsonl`

| 日志位置 | 复核结果 |
| --- | --- |
| 第 240、264 行，UTC 2026-11-22 14:10:03／14:10:54 | 最终命令 `cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib -- services::sensitive::tests services::audit::tests database::schema::tests`；实际列出敏感库 8、审计 6、迁移 5 项，`19 passed; 0 failed; 169 filtered out`，退出码 0。当前 Rust 文件修改时间均早于该轮编译。 |
| 第 119、157 行 | `pnpm exec tsc --noEmit`，会话 99107 最终退出码 0、无错误输出。 |
| 第 119、181 行 | `pnpm run build` 实际执行 `tsc && vite build`，会话 73336 退出码 0；5241 模块，`built in 44.05s`。相关敏感库前端文件修改时间早于构建。 |
| 第 216、228、238 行 | 中途迁移夹具曾有 4 项失败，之后补齐旧表；一次多过滤参数遗漏 `--` 被 Cargo 拒绝。最终第 264 行已重新编译并运行全部 19 项成功，不能拿中途失败或仅 7／8 项的日志代替最终结果。 |

已有 `AlertRule` 未构造警告和 Vite 大于 500 kB 分块提示未导致失败。根目录 `.tsc.log` 是过期空文件，本轮未用它作为类型检查证据。

## 非阻断项与验证缺口

1. **历史磁盘原文未清除。** v24 是读取安全边界，不是擦除迁移。数据库、WAL／空闲页、旧备份和既有 CSV 中仍可能保留原文；本轮没有做磁盘回填或清理。按本次验收口径，因未发现其经敏感库列表／搜索／详情／CSV 明文读取出口返回，列为非阻断。整库备份仍复制原始旧行，现有 `BackupService::export` 在落盘前加密快照；不能据此宣称备份内容已脱敏。未来若发现任一上述明文出口返回旧原文，应立即恢复为阻断。
2. **历史安全备注可辨识度降低。** 非固定旧自由文本即使看起来安全也被遮蔽，这是缺乏秘密明文时采取的保守策略；新安全标签仍保留。旧备注的可读性不作为本次泄露修复的阻断项。
3. **真实运行未验证。** 原生 Tauri IPC、Windows WebView2、系统保存对话框、CSV 磁盘写入及真实旧数据库／备份恢复均未实测。详情仅完成源码调用链核对；未重跑浏览器矩阵或新增截图。需要在整体验收中补齐，不能将服务层及构建成功写成这些项目已经通过。

已参考技能：`check`、`bug-detective`、`database-ops`、`test-development`。
