# 第 11 步 · 敏感库返工第 1 轮独立复验

**结论：仍阻断，暂不建议提交。** B1 原始用例已通过，但新写入和旧记录读取各有一条反例，来源原文仍可流入详情和 CSV。B2 字面搜索通过。新增 1 项非阻断问题。

## 阻断项

### B1 · 正文已识别的秘密值加上来源标签仍会原样保存；旧来源裸值仍会返回

**新写入复现：** 在空的内存 SQLite 库上，用当前 Rust `SensitiveService::scan` 扫描合成正文 `password=rev2-synthetic-value-527`，来源传 `Review ticket rev2-synthetic-value-527`。扫描命中 1 条，正文预览是 `[REDACTED: credential]`；扫描返回、DAO 原始行、服务列表和 CSV 的来源均原样保留该合成值。对照组把来源设为完整赋值或单独的裸值，两者都正确存为 `[REDACTED]`。

**旧记录复现：** 用真实 DAO 在独立内存库插入旧形态记录，来源为 `rev2-synthetic-value-527`、预览为 `****`，指纹为相应赋值串的 SHA-256。服务列表及 CSV 都原样返回裸值，按该值搜索会命中这条旧记录和上面的新记录（ID 4、1）。对照组的旧来源为完整赋值时，列表投影遮蔽成功，同一 DAO 行仍保留原值。将 Rust 实际返回的两条记录直接接入浏览器 mock IPC，两条详情均显示原始来源。证据：`light-1100-source-detail-1.png`、`light-1100-source-detail-4.png`。

**原因与位置：** [写入前检查](../src-tauri/src/services/sensitive.rs#L98) 只在**整个**来源串出现在原正文且未出现在结果中时遮蔽，`Review ticket …` 不在正文中，落入 [safe_source](../src-tauri/src/services/sensitive.rs#L230)；字符和正则检查均允许该标签。[旧记录投影](../src-tauri/src/services/sensitive.rs#L40) 用同一规则，无法从无上下文的普通字母数字串判断它是标签还是秘密。[详情](../src/pages/sensitive/SensitiveDetail.tsx#L76) 直接显示服务返回值，[CSV](../src-tauri/src/services/sensitive.rs#L197) 复用列表结果，因此两条读取路径都保留泄露。

**复验标准：** 已命中的秘密值即使嵌在来源标签中，也不得进入新行、扫描返回、列表、详情、搜索或 CSV。对缺少可信来源标记且无法安全判定的历史自由文本，应采用保守的读取策略；对已知固定来源标签保留辨识度。须覆盖原始用例、标签加裸值和历史裸值三个用例。

## 非阻断项

- **普通来源也会被整项遮蔽。** 合成扫描实测保留 `ssh_exec · .env 检查`；`Review (scheduled)` 因括号被字符白名单排除，`Release 1.2.3.4` 因四段版本号匹配 IP 正则，两者均显示 `[REDACTED]`。这会降低来源的可辨识性。调整策略时建议用明确的受信标签及典型普通来源测试守住安全边界。首轮的预览及本地化类型名搜索、筛选切换不复位页码为既有非阻断项，返工未覆盖。

## B2 · 通过

- **真实 Rust 服务与 DAO。** 使用合成行把 `a%_b` 分别放在标签、来源和服务器别名，再加 `a%Xb`、`aX_b` 干扰项及一行不同类型。指定待处理、凭据类型时，` a%_b ` 的列表和解析后的 CSV 均为 ID `[6, 5, 1]`；单独搜 `_` 均为 `[6, 5, 3, 1]`，搜 `%` 均为 `[6, 5, 2, 1]`。[DAO](../src-tauri/src/database/mod.rs#L896) 只负责三个结构条件，服务在已投影的可见字段上作字面子串匹配。[CSV](../src-tauri/src/services/sensitive.rs#L197) 调用同一服务列表，因此同一数据快照和条件下范围一致。
- **前端跨页范围。** 用 52 条合成记录，搜索 `a%_b` 后第 1 页 25 条、第 2 页 1 条；在第 2 页点击表头全选，计数为 26。捕获的导出 IPC 关键词为 `a%_b`，传给写入 IPC 的模拟 CSV 恰好 26 条，未混入两个干扰标签。检查 [表头全选](../src/pages/sensitive/SensitiveTable.tsx#L45) 按当前匹配集合取 ID，[导出](../src/pages/sensitive/index.tsx#L129) 传同一关键词及结构筛选。证据：`light-1100-combined-literal-scope.png`。导出会重新查询，未断言并发新增时仍与之前全选的 ID 快照相同。

## 验证边界

先读更新回执、原验收报告和当前 diff。复跑现有 Rust 测试二进制中的 `services::sensitive::tests`：6 项通过；逐项核对了写入、历史投影、字面搜索、状态更新范围和 CSV 测试。现有 B1 用例覆盖完整赋值、独立裸值与带引号赋值的新来源，历史用例只覆盖带赋值的旧来源，均未覆盖本轮两个反例。独立反例直接编译仓库当前的 Rust 服务和 DAO，沿用已缓存依赖，只用 `:memory:` SQLite 和合成数据。浏览器使用已有构建产物与隔离 Edge mock IPC，9 项通过，其中两项确认详情泄露；截图在 `%TEMP%\opspub-sensitive-review-independent-vyLp4s`。目标文件 `git diff --check` 未见空白错误。

**历史敏感来源没有做磁盘回填。** 即使部分旧来源已在读时遮蔽，历史数据库和既有备份仍可能保留原值；本轮未接触真实数据库或备份。未实测原生 Tauri IPC、Windows WebView2、系统保存对话框或原生 CSV 磁盘写入。未改业务代码、未暂存、未提交。

已参考技能：`check`、`bug-detective`、`security-permissions`、`database-ops`、`test-development`。
