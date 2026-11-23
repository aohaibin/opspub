# 第 11 步 · 敏感库最终独立复验

**结论：阻断，暂不建议提交。** 本轮指定的带 `password=` 样例已通过，上一轮 B1 的两个反例仍可复现。B2 维持通过，未发现回归。

## 阻断项

### B1 · 嵌入备注的已知裸值和无上下文的历史来源仍可泄露

使用仓库当前 Rust 服务与 DAO、独立内存 SQLite 和合成数据复现：

| 输入 | 实测结果 |
| --- | --- |
| 正文 `password=review-marker-synthetic`，来源 `Review ticket review-marker-synthetic` | 正文匹配并脱敏；扫描返回、DAO 原始行、列表和 CSV 的来源仍带裸值。按 `review-marker-synthetic` 搜索命中该行。 |
| 同一正文，来源 `Review password=review-marker-synthetic confirm review-marker-synthetic` | `password=` 一处变为占位符，`confirm` 后的同一裸值仍进入扫描返回、DAO、列表、搜索和 CSV。 |
| 历史来源仅为 `legacy-marker-synthetic`，匹配指纹按相应赋值计算 | 普通标签规则接受该串，列表、搜索和 CSV 仍返回它。与已修好的 `password=legacy-marker-synthetic` 是两种不同历史输入。 |

[扫描写入](../src-tauri/src/services/sensitive.rs#L96) 仍用整个来源判断是否复用了正文中的秘密，因此检测不到附在普通标签里的裸值。[整段脱敏](../src-tauri/src/services/sensitive.rs#L228) 对规则命中做替换，但不会处理同一个值在其他位置的裸文本；历史裸值也无法仅凭字符白名单识别。[列表及搜索](../src-tauri/src/services/sensitive.rs#L40) 使用该投影，[详情](../src/pages/sensitive/SensitiveDetail.tsx#L76) 直接显示列表返回的来源，[CSV](../src-tauri/src/services/sensitive.rs#L195) 复用同一列表。此轮详情通过源码确认，未重跑浏览器。

另测 `Review password=review-marker-synthetic note=second-synthetic`：首次命中后直接返回部分替换结果，因此扫描返回和 DAO 仍含未识别的赋值；第二次读取因没有规则命中，才走标签白名单并整项遮蔽。标准占位符在普通标签上下文中稳定，但当前处理对所有可持久化输出并不幂等。根因同在 [sanitize_source 的提前返回](../src-tauri/src/services/sensitive.rs#L234)。

**复验要求：** 新写入不得保存或返回已识别秘密在来源中的其他裸文本位置；处理后剩余内容也须符合安全来源规则。对无法区分裸值与标签的历史自由文本，应采用保守的出口策略，例如仅保留可确认的固定来源。浏览器截图与真实数据库回填不是复现上述服务层缺陷的前提。

## 非阻断项

本轮无新增独立非阻断项。普通来源的可辨识度、脱敏预览和类型名搜索覆盖、筛选切换时旧页码保留是前两轮记录的非阻断观察，本轮未重新验收。

## 通过的用例与验证边界

- **指定来源样例通过。** 当前 Rust 的扫描返回、DAO 新行和列表均将 `运维备注 password=review-marker-synthetic 由手工检查` 转为 `运维备注 [REDACTED: credential] 由手工检查`；已脱敏的同一来源重新读取和导出时保持原样。旧来源 `password=legacy-marker-synthetic` 的列表和 CSV 显示占位符，底层旧行仍原样保留。现有测试还验证带赋值的历史来源不能用秘密值搜索，以及新旧混合标签不从列表和 CSV 泄露。
- **B2 无回归。** DAO 未重新引入 `LIKE`；服务仍先投影再用字面 `contains`，CSV 调用同一列表方法，前端全选继续取当前可见匹配集合。沿用既有用例，未重新跑 B2 的浏览器矩阵。
- **测试。** 已读最新回执、前两轮报告及当前差异。直接运行已有 Rust 测试二进制的 `services::sensitive::tests`，7 项通过；另临时编译只引用当前服务和 DAO 的独立合成夹具，验证上述正反例。目标文件 `git diff --check` 无空白错误。未使用真实数据。

**历史磁盘回填未执行，也未验证。** 已能在出口遮蔽的旧行仍可能以原值存在于本地数据库及旧备份中。未实测原生 Tauri IPC、Windows WebView2、系统保存对话框及原生 CSV 磁盘写入。仅新增本报告，未改业务代码、未暂存、未提交。
