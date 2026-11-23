# 第 11 步 · 敏感库独立验收

**结论：阻断，暂不建议提交。** 2 项阻断，2 项非阻断。来源字段可以把敏感原文带入脱敏库和 CSV；新版搜索对 `_`、`%` 的解释会扩大跨页全选、批量操作和导出的范围。

## 阻断项

### B1 · 「来源」可把原文持久化，并通过详情和 CSV 回显

**复现（隔离 Edge + 合成 IPC）：** 打开「测试脱敏规则」，在「待扫描文本」和「来源」均输入 `password=review-marker-synthetic`，开始扫描。预览显示 `[REDACTED: credential]`，正文输入框清空。新记录的「来源」仍完整显示 `password=review-marker-synthetic`。打开详情可见同一原文；导出后捕获的 `write_text_file.content` 同时包含掩码和来源原文，目标为模拟保存对话框选定的 `C:\Synthetic\picked audit.csv`。浏览器的 localStorage、sessionStorage 未发现该标记。

**文件与契约：** [ScanDialog.tsx:30](../src/pages/sensitive/ScanDialog.tsx#L30) 把正文和去除首尾空白的来源分别传入。已有 [Rust 扫描服务:50](../src-tauri/src/services/sensitive.rs#L50) 仅校验来源长度，[脱敏调用:67](../src-tauri/src/services/sensitive.rs#L67) 只处理正文，[入库调用:72](../src-tauri/src/services/sensitive.rs#L72) 与 [DAO:945](../src-tauri/src/database/mod.rs#L945) 原样保存来源。[列表:74](../src/pages/sensitive/SensitiveTable.tsx#L74)、[详情:76](../src/pages/sensitive/SensitiveDetail.tsx#L76) 和 [CSV:170](../src-tauri/src/services/sensitive.rs#L170) 都直接读取该字段。浏览器 mock 按这条契约返回；Rust 持久化路径是静态核对，未在真实数据库执行。该契约在改造前已存在，仍违反本次验收的脱敏边界。证据：`light-1100-raw-source-detail.png`。

**复验标准：** 在持久化前由后端限制自由文本来源，或对其执行脱敏并拦截无法安全保存的值；同一合成标记不得出现于列表、详情和 CSV。总控需决定现有本地来源字段是否要补做脱敏，避免修复新写入后仍可导出旧值。

### B2 · 字面搜索被解释为通配符，扩大批量和导出范围

**复现（真实 SQL + 隔离 Edge）：** 给两条记录分别设置来源 `note_foo` 和 `noteXfoo`，搜索 `note_foo`。提取当前 DAO 的 `SELECT` 在内存 SQLite 执行，实际返回两条；搜索 `%` 也返回全部两条。按相同查询契约的 Edge 夹具复现两行，并点击「全选当前筛选结果」，界面显示「已选 2 条」。旧页面在 `HEAD` 做字面 `includes`，同样的 `note_foo` 只会匹配第一条。证据：`light-1100-wildcard-scope.png`。

**文件与影响：** [搜索入口:82](../src/pages/sensitive/index.tsx#L82) 改为后端查询，[SQL:909](../src-tauri/src/database/mod.rs#L909) 将输入拼进 `LIKE` 模式，未转义 `%`、`_`；参数绑定与通配符语义是两回事。[表头全选:45](../src/pages/sensitive/SensitiveTable.tsx#L45) 选中所有匹配 ID，[批量丢弃:186](../src/pages/sensitive/index.tsx#L186) 捕获这些 ID，导出也复用该查询。来源和标签常含下划线，用户按普通关键词查找后可能批量处理或导出额外记录，只有总数提示，跨页记录不一定可见。本用例止于选中两条，没有对通配符样本执行丢弃。

**复验标准：** 列表、跨页全选和 CSV 使用同一套明确的字面搜索语义；`note_foo` 只匹配含下划线的记录，`%` 只匹配含百分号的记录。

## 非阻断项

1. **搜索覆盖缩小。** 旧版还可搜脱敏预览和界面类型名。内存 SQLite 对只存在于预览的 `PREVIEW_ONLY` 和显示类型名 `私钥` 均返回 0 条；浏览器复现预览查询空结果。目前搜索框说明只列标签、服务器、来源，类型也有独立筛选。建议总控裁决是否保留旧行为；若恢复，列表和 CSV 应采用相同字段。
2. **切换筛选时延用旧页码。** 在第 3 页输入条件缩小到 26 条，实际落在第 2 页并只显示末尾 1 条；清空条件跳回第 3 页。原因是 [SensitiveTable.tsx:31](../src/pages/sensitive/SensitiveTable.tsx#L31) 只限制显示页码，保留了旧页码。匹配总数正确，全选仍覆盖 26 条，改变关键词也会清空旧选择。建议搜索或筛选改变时回到第 1 页。

## 独立检查与验证边界

先读通用清单和实现回执（实现方记录 `tsc`、构建、`git diff --check`，以及四组 Edge 共 192 项通过），再核对四个敏感库文件、改造前搜索逻辑、TS/Rust IPC、权限、DAO 和原型片段。本轮复用已有构建产物，未重复实现方的构建和全量断言；新增隔离 Edge 反例及内存 SQLite SQL 实验。

| 检查 | 独立结果 |
| --- | --- |
| 分页、跨页选择和部分失败 | 52 条起始于第 3 页；搜索收窄为 26 条，全选后恰好对 ID 1～26 各发一次状态 IPC，范围外无修改。ID 1 返回 `false`、ID 26 抛错，UI 显示成功 24、失败 2，刷新后仅保留这 2 项。换条件清除选择；较慢的旧查询返回后未冲掉最新结果。 |
| 扫描失败与刷新恢复 | 让 mock 先写入一条记录再报扫描错误，同时让后续列表读取失败。页面保留旧表，但禁用导出，且未在错误提示中回显 IPC 错误原文。恢复列表 IPC 并手动刷新后，搜索可找到部分写入的记录。 |
| CSV 与保存路径 | 确认模拟对话框返回的带空格路径原样交给写入 IPC，模拟 CSV 含掩码、不含匹配指纹；来源原文仍能进入导出，见 B1。核对列表和导出使用同一个 DAO，导出还携带当前服务器、状态、类型条件。 |
| 最小窗口与亮暗主题 | 1100×700 下两种主题均显示列表与分页，页面宽度 1100，无整页横向溢出。详情操作区纵坐标 475～507，扫描操作区 495～527，扫描关闭按钮未被遮挡；亮暗弹窗背景分别为白色和深色。对照原型检查了筛选、表格列和导出／扫描入口；原型中的常驻来源说明横幅在新版省略，未另存原型截图。 |

独立截图目录：`%TEMP%\opspub-sensitive-review-independent-5mrSgB`，含两种主题各自的 `*-1100-list.png`、`*-1100-detail.png`、`*-1100-scan.png` 和两张阻断项截图。宽窗证据引用实现回执，本轮未独立重跑 1440×900。

**未验证：真实 Rust 脱敏规则、真实敏感库持久化与迁移、原生 Windows WebView2、系统保存对话框和原生磁盘写入。** SQLite 实验只跑当前查询文本和内存合成表；扫描、读写和保存对话框均通过 mock。未读取真实用户敏感数据，未修改业务代码、台账或 Git 暂存区，未提交。

已参考技能：`check`、`bug-detective`、`ui-frontend`、`theme-system`。
