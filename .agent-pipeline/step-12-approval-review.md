# 第 12 步 · 审批子批次独立验收

**结论：通过。未发现本子批次的阻断项；有 2 项非阻断改进。**

本结论覆盖当前审批前端的静态审查、既有日志核验和隔离 Edge 合成 IPC 验收，不代表真实 Tauri、远程执行或审计持久化已经通过。第 12 步的审计、告警子批次及最终整体验收仍需分别完成。

验收日期：2026-11-22（Asia/Shanghai）。基准 HEAD：`be55cc06afac3c170c62f553a6148e26acedae08`，分支 `opspub`。已读取 `review-checklist.md`、`baseline.md`、`step-12-approval-implementation.md`，核对原型、当前 diff 及两个新增文件的完整内容。代码检查范围为：

- `src/pages/security/index.tsx`
- `src/pages/security/security.css`
- `src/pages/security/approval.ts`
- `src/pages/security/ApprovalDetails.tsx`

同时沿调用链只读核对现有导航、AI 锁、前端 API，以及 Rust Command / Service / Database。保留其他会话已有修改。未修改业务代码、未暂存、未提交、未推送、未改写 `state.json`。仓库内仅新增本报告；隔离夹具、日志摘录和截图均在系统临时目录。

## 阻断项

无。

## 非阻断项

### N1 · 统计和历史缺少“最近 100 条”范围提示

`src-tauri/src/database/copilot_policy.rs:155` 的现有查询为 `ORDER BY id DESC LIMIT 100`。`src/pages/security/index.tsx:127–156,294–298` 使用这些记录计算待决数量、今日执行完成、人工拒绝和平均裁决耗时，历史也取自同一集合。页面未明确标注此范围。

因此记录超过 100 条时，数字不能理解成全库汇总，旧记录也不能据此认定不存在。这是既有接口边界，本轮没有扩大或隐藏后端权限，不阻断审批前端迁移。建议给统计与历史补充范围说明；完整历史查询交由后续接口或审计子批次处理。

证据：上述查询和前端计算源码、实施回执“统计基于最近 100 条”说明；本轮未写入 101 条真实记录。

### N2 · 服务器策略读取失败时只显示“未知”，恢复指引不够明确

`src/pages/security/index.tsx:73–78,141–142` 在服务器读取失败时不再把旧策略作为当前值，`src/pages/security/ApprovalDetails.tsx:34–36` 显示“未知”；但没有单独解释这是读取失败，也没有就地重试提示。

独立夹具已在四组主题/尺寸中复现：先读到策略，再令 `list_servers` 失败并刷新，两个目标均显示“未知”；恢复接口后，刷新可分别恢复“禁用”和“只读”，目标没有串用。建议增加简短的读取失败提示及刷新指引。

不判阻断：界面没有伪造当前策略，确认弹窗明确提示后端复核；实际权限仍由既有 Rust 的 `take_ai_approval` 重新校验。前端批准按钮没有替代后端授权。本轮合成 IPC 不证明真实服务器策略已被执行验证。

证据：`extra.cjs` 的 `server read failure never shows cached policy as current`、`disabled policy recovered`、`second target gets its own readonly policy` 断言，以及对应源码。

## 验收结果与反例

| 检查重点 | 核对结果与有区分度的证据 |
| --- | --- |
| 新版双轨入口、二级高亮 | 已核对导航映射和实施方矩阵；增量直接打开 `#/security?view=history&approvalId=102`，首次读取失败后恢复，一级仍为安全与治理、二级仍为审批，详情仍对应 MCP 工单 102。详情跳转审计后前进、后退，目标和高亮正确。 |
| 待审批、历史、详情读取失败恢复 | 增量覆盖首次详情读取失败、已有详情刷新失败、待审批列表刷新失败。首次失败无裁决入口；已有记录保持可读但两个裁决按钮禁用；显式重试后恢复正确工单。历史读取失败保留数据及刷新恢复已核对实施方日志；增量又核对了错误后恢复的历史详情。 |
| AI 锁和服务器策略 | 已核对实施方锁定时禁止批准、允许驳回以及顶栏解锁联动。源码还在提交瞬间从 Zustand 重新检查锁与放行期限。增量用不同服务器 ID / 别名、禁用 / 只读策略核对卡片、详情及确认目标；读取失败不沿用旧策略，恢复后不串机。 |
| 裁决接口与原子门禁 | 前端裁决仍仅调用封装中的 `approve_ai_approval`、`reject_ai_approval`；没有新增直接执行命令或自行授权路径。Rust 批准经 `take_ai_approval` 事务抢占，拒绝经 `pending` 与有效期条件更新；后续动作、计划、目标、锁和策略校验继续留在原后端。 |
| 快速双击 | 已审阅原 228 项中的批准双击单 IPC 断言。增量在同一 JavaScript 任务中连续触发两次拒绝确认，四组均只增加一次 `reject_ai_approval` 调用。`submittingRef` 在第一个 await 前同步占用。 |
| 确认期间到期 | 原日志覆盖单工单。增量改为两张工单分别在约 3 秒和 6 秒到期，并让第一次到期后的列表刷新失败；第二张已打开的批准确认仍显示“审批已超时”，确认及详情裁决按钮禁用。未发出到期裁决 IPC。 |
| 错误不误报成功 | 增量让批准 IPC 拒绝，确认保留并显示错误，待审批记录未伪造成完成；另让批准 IPC 正常返回 `failed`，历史显示“执行失败”，未出现完成状态或成功通知。驳回失败保留原因、再次确认后成功的路径已审阅实施方日志。 |
| 乱序返回、其他客户端裁决 | 增量挂住旧列表快照，先返回新的拒绝记录，再释放旧快照，旧响应不能恢复待审批。另在审阅 Beta 工单期间通过事件送入其他客户端已拒绝状态，确认及时禁用并显示当前状态；没有自动发出批准或拒绝 IPC。 |
| 审计跳转目标 | 页头与详情均链接现有 `/audit`。实施方已验页头；增量点击详情入口，实际触发 `get_audit_logs_page`，前进/后退恢复原工单，导航不重发裁决。当前入口是审计列表，不是按审批 ID 精确定位的审计记录；前后端没有公共关联字段，本轮未宣称具备该能力。 |
| 亮暗、1100×700 / 1440×900 | 核对实施方四组截图，并查看增量错误、超时、历史及长内容截图。小窗口第二张工单经页面滚动可达；详情页脚和确认按钮保持可见。再用 128 个连续字符组成的长别名、80 行命令和长摘要测试，四组确认弹窗宽度均为 520 px、scrollWidth 均为 520 px，目标文本区域 472 / 472 px，底部按钮均在视口内。 |

关键实现依据：`approval.ts:50–65` 的请求序号隔离、`68–99` 的订阅清理及到期时钟；`index.tsx:159–198` 的确认、同步防重与错误处理；`index.tsx:367–416` 的详情与动态确认禁用。后端依据：`commands/copilot.rs:79–108`、`services/copilot.rs:817–889`、`database/copilot_policy.rs:162–182,185–257`。

“原子”在这里指审批状态的条件裁决/抢占，并不表示计划更新、事件和审计日志全部处于同一数据库事务。真实落库和异常中断后的完整一致性未在本轮验证。

## 原始日志审阅

读取了实施线程 `01a203a3-ffc7-7f13-ab4e-7d83769f4807` 对应的本地 JSONL 中有关测试的工具输出，而不只依据回执的成功描述。

- Rust：`cargo test --offline --locked --manifest-path src-tauri/Cargo.toml --lib -- copilot_policy services::copilot::tests`，原始结果 `31 passed; 0 failed; 157 filtered out`，退出码 0。覆盖数据库锁、一次性抢占、到期、目标策略复核及 Copilot 策略等；其中一次性测试是顺序调用，不把它表述成真实并发或真实执行证明。保留既有 `AlertRule` dead-code 警告。
- Edge：四组各 `57 PASS, 0 FAIL`，最终 `228 PASS, 0 scenario failures`，退出码 0。最终这次运行的工具输出时间为 2026-11-22 14:43:40 UTC，即本地 22:43:40。早期输出存在 `detail closes` / `history detail closes` 超时；实施回执说明修正了动画等待，后续完整矩阵成功。本轮未把早期失败隐去，也未原样重跑这 228 项。
- 构建：日志中最终 Vite 构建退出码 0，产物为 `index-Bw0R_bwd.js` / `index-CazN6UNH.css`，存在超过 500 kB 的分块提示。本轮浏览器使用该次产物；四个审批源码的修改时间均早于该构建，验收前后源码哈希一致。

原始日志文件：`C:/Users/ao/.codex/sessions/2026/11/22/rollout-2026-11-22T22-23-29-01a203a3-ffc7-7f13-ab4e-7d83769f4807.jsonl`。仅提取了本次测试相关输出，摘录见下列临时证据目录。

## 本轮实际运行与证据

临时证据根目录：`C:/Users/ao/AppData/Local/Temp/opspub-step12-independent-vEVL4a/`。

| 本轮命令 | 最终结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0。 |
| `git diff --check -- src/pages/security` | 退出码 0；只有 Git 换行符提示。 |
| `node "$env:TEMP/opspub-step12-independent-vEVL4a/directed.cjs"` | 四组各 39 项，合计 **156 项增量断言通过**，0 个场景失败，退出码 0。 |
| `node "$env:TEMP/opspub-step12-independent-vEVL4a/extra.cjs"` | 四组各 18 项，合计 **72 项增量断言通过**，0 个场景失败，退出码 0。 |

合计为本轮另加 228 项断言，与实施方原有的 228 项分别计数；这是断言数，不等同于 228 个独立业务用例。没有原样复跑已有 Rust 31 项或原 Edge 矩阵，也没有重复构建产物。

增量夹具复用了 Edge/CDP 和 Tauri mockIPC 基础设施，重新编写反例步骤。夹具编写期间修正了 PowerShell 管道编码、点击前滚动、以及他端裁决后返回待审批页的前置步骤；这些失败属于夹具问题，最终完整运行上述两个矩阵后才作出通过结论。

证据文件：

- `implementation-log-excerpts.json`：实施方 Rust、Edge 和构建相关原始输出摘录。
- `independent-log-excerpts.json`：本轮运行输出摘录，保留早期夹具失败与最终结果。
- `directed.cjs`、`extra.cjs`：可重跑的隔离夹具；仅在回环静态服务上使用合成记录，Edge 使用独立 profile 并阻断外部网络。
- `{light,dark}-{1100,1440}-directed-evidence.json`：主矩阵最终路由、页面、调用记录与合成数据。
- `{light,dark}-{1100,1440}-extra-evidence.json`：长内容几何测量和调用记录。
- `{light,dark}-{1100,1440}-approve-error.png`、`-two-expiries-failed-refresh.png`、`-history-after-errors.png`、`-other-client-decision.png`、`-long-content.png`：相应状态截图。

实施方截图目录：`%TEMP%/opspub-step12-approval-gPigQx/`；原型截图目录：`%TEMP%/opspub-step12-approval-prototype/`。已对照原型的双轨、安全审批标题、统计区、视图切换及工单操作层级；没有把原型虚构统计或合规百分比当作实际能力。

## 未验证项与后续门槛

- **真实 Windows Tauri / WebView2 未验证**：当前可用工具没有项目任务系统，未启动原生窗口；真实窗口 chrome、DPI、原生事件时序和 IPC 传输不能由 Edge mock 代替。
- **真实远程执行未验证**：没有调用 Reeve、SSH、服务变更或真实目标上的批准/拒绝；合成 IPC 成功不代表命令已经在服务器执行。
- **真实审计落库未验证**：`get_audit_logs_page` 使用合成响应；没有验证实际审计写入、数据库异常、崩溃重启及事件/计划/审计之间的一致性。
- **完整后端与全项目验收未执行**：本轮审阅既有定向 Rust 日志，没有重跑全量 `cargo check` / `cargo test`、生产打包或 17 模块整体验收。
- **精确审计关联仍是接口边界**：只确认进入正确审计列表，没有验证不存在的按审批 ID 精确定位能力。审计/告警子批次另行验收。

本次通过可作为审批前端子批次的独立审查结果；上述真实环境缺口必须保留给最终验收，不能随本报告改写为“已验证”。无须本轮新增授权或修改代码。

## 审阅快照

| 文件 | SHA-256 |
| --- | --- |
| `src/pages/security/index.tsx` | `49B068263E2C7518857A86972E0D808E791556B019C649FFDBE9792A341D9313` |
| `src/pages/security/approval.ts` | `B5D60BBAD7D4C990D802CB7DA033FA9C5F454A30A2E31D2762900EA874E675C1` |
| `src/pages/security/ApprovalDetails.tsx` | `B20946069232D59157C1CFAB6BFCA3648BDDE90AF6CFE0FFD3982DFB7B9E5267` |
| `src/pages/security/security.css` | `D05DD65779DDD3B92905EC62559E2FE4B0A27E1DE971AEEB0F1F2623EBAB66EA` |

已参考技能：`check`、`bug-detective`、`test-development`。
