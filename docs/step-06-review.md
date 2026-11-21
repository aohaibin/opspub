# 第 06 步独立验收：数据库迁移

复验日期：**2026-11-22（Asia/Shanghai）**。范围仅为数据库迁移及 B1、B2 返工；00–05 不重新验收。

## 结论

**本次数据库前端返工复验通过，B1、B2 关闭；本次实测未发现新增阻断项。**

亮暗主题 × 1440×900 / 1100×700 四组均完成：每组既有 6 组基础场景通过、72 项独立断言通过，合计 288 项断言零失败。查询 CSV 保存挂起后切连接、库、表，旧操作均未请求 `write_text_file`；库级、表级 DDL 挂起后切目标，迟到响应均未打开保存框或请求写入。相同导出入口的倒序完成与查询 CSV 防重入也已动态验证。

此次结论限于实际 React 页面、生产 CSS 和模拟 IPC 的数据库前端验收。真实数据库、原生 Tauri/WebView2 和实际文件写入仍未验证，不能将本次通过扩展为这些项目已完成验收。亮色表单主题和原型层级差异保留为非阻断项。

2026-11-21 首轮验收曾动态复现 B1、B2；本次按返工后的源码独立重跑并关闭。首轮日志及截图仍保留在 `C:/Users/ao/AppData/Local/Temp/opspub-step06-independent-review/`，首轮报告原文另存于本次证据目录的 `previous-review.txt`。原问题没有被认定为第 06 步新引入的回归。

## 范围、依据与环境

先读 `.agent-pipeline/review-checklist.md`、`.agent-pipeline/step-06-implementation.md` 和本报告首轮版本，再复核：

- `.agent-pipeline/baseline.md` 数据库、窗口边界、工作台复用条目。
- `DatabaseView.tsx` 中目标记录、查询代际、`beginExport()`、四种导出成功路径及卸载清理。
- 原型 `docs/ops-prototype-direction2-workspace.html:2793–2851` 的引擎导航和 SQL 片段。
- 返工夹具的模拟接口、保存路径、场景与异步控制方式。

源码基点 `a5908833e49aae4220f3303a3c617019c7f17e49`，分支 `opspub`，验收包含工作区中的数据库返工。实际打包的 `src/pages/workbench/views/DatabaseView.tsx` SHA-256：

```text
7648534d007aa13965b9ff329f31cc28ec90718111aed3cec4099d8741c8b479
```

在新的独立临时目录复制既有夹具，保留原有 6 组场景和 37 项断言，另增加 35 项断言。新增夹具只在 IPC 边界挂起、放行 Promise，页面、路由和业务处理函数均来自当前源码。采用无头 Edge；导出路径与文件写入均被 `mockIPC` 接收，Synthetic 数据、`.invalid` 主机和 CSP 隔离保持不变。未连接远程服务，未读取真实凭据或数据库文件。

当前工具目录没有项目任务系统的登记、扫描、启动或停止接口；本次没有启动开发服务器或原生应用，只运行独立夹具，且只结束夹具自行创建的 Edge 进程。构建后另核对夹具内嵌 CSS 与本次 `dist/assets/index-Df1Z8f3e.css` 完整一致。

## 实际命令、退出码与证据

以下命令均在项目根目录通过 PowerShell 执行。`$evidence` 对应 `Join-Path $env:TEMP 'opspub-step06-independent-recheck-20261122'`；为便于复跑，下表用此变量缩短路径。

| 实际命令 | 退出码 | 结果与证据 |
|---|---:|---|
| `git status -s`、`git branch --show-current` | 0 | 启动时记录原工作区差异与分支，见 `before.json`。 |
| `pnpm exec tsc --noEmit` | 0 | 本次重新运行，未复用实现回执。输出保存为 `tsc.log`，成功时为空。 |
| `pnpm build` | 0 | 本次重新运行；5230 个模块，Vite 构建 39.50 秒。生成 `index-BojwECqg.js`、`index-Df1Z8f3e.css`，见 `build.log`。 |
| `node "$evidence/augment-fixture.cjs"` | 0 | 内部调用已复制的 `setup-review.cjs`，生成新增目标切换矩阵及同入口倒序完成场景。 |
| `node "$evidence/run-isolated.cjs" database-recheck` | 0 | 本次主验收首次运行即完整完成四组；每组 6 组基础场景和 72 项断言通过。见 `results.log`。 |
| `node "$evidence/collect-evidence.cjs"` | 0 | 提取四组断言、校验 56 张截图及生产 CSS，写出 `evidence-summary.json`。 |
| `git diff --check -- src/pages/workbench/views/DatabaseView.tsx` | 0 | 无补丁空白问题；仅有既有 LF/CRLF 提示。 |
| `git log -1 --format="%ar\|%s" -- docs/step-06-review.md` | 0 | 写报告前执行；报告原为未跟踪文件，无提交记录。另按初始哈希确认没有被其他会话改写。 |
| `git diff --cached --name-only` | 0 | 暂存区为空；未暂存、提交或推送。 |

原始执行包含 `*> "$env:TEMP/opspub-step06-independent-recheck-20261122/{tsc,build,results}.log"` 输出重定向，并分别读取 `$LASTEXITCODE`，得到 `TSC_EXIT=0`、`BUILD_EXIT=0`、`REVIEW_EXIT=0`。收集脚本将 PowerShell 日志统一转存为 UTF-8 无 BOM，未改变日志内容。

准备摘要时曾有一条 PowerShell 管道内的 Node 中文正则因编码转换而报 `SyntaxError`（退出码 1）；这不是产品用例失败，也没有改动业务文件。已改用磁盘上的 UTF-8 收集脚本，主验收未因此重跑或跳过。

| 视口 | 基础场景 | 独立断言（不含汇总标记） | 结果 |
|---|---:|---:|---|
| 亮色 1440×900 | 6/6 | 72/72 | 通过 |
| 亮色 1100×700 | 6/6 | 72/72 | 通过 |
| 暗色 1440×900 | 6/6 | 72/72 | 通过 |
| 暗色 1100×700 | 6/6 | 72/72 | 通过 |

## 阻断项

**本次复验无未关闭阻断项。** 以下保留原问题编号和本次关闭依据，避免将首轮缺陷记录误读为当前仍存在。

### B1 / P1：旧查询 CSV 或表 CSV 在目标变化后请求写入——已关闭

当前相关位置：`DatabaseView.tsx:428–494、832–855、1502–1526`。

复现方式保持首轮反例：执行 Alpha 查询，挂起 `plugin:dialog|save`，依次切连接、库、表，再放行旧路径。三种情况下页面都清除旧结果，随后 `write_text_file` 调用增量均为 **0**。

本次还验证了：

- 同一连接、库、表重新查询后，旧结果 CSV 不写入。
- 切表后再选回原表，旧导出仍失效。
- 表 CSV 查询 Promise 挂起时，分别切连接、库、表；旧查询返回后保存框增量 **0**、写入增量 **0**。
- 表 CSV 保存 Promise 挂起时，分别切连接、库、表；放行路径后写入增量 **0**。
- 同一目标的正常查询 CSV、表 CSV 均可保存；取消、文件选择失败及写入失败的既有路径继续通过。

可核对日志标签：`保存框返回后禁止导出旧 connection/database/table 查询`、`独立矩阵 tableCsv`、`B1 同一连接库表重新查询后`。相关截图：`02-stale-csv-{connection,database,table}-{主题}-{尺寸}.png`。

### B2 / P1：迟到的库级或表级 DDL 继续保存旧 SQL——已关闭

当前相关位置：`DatabaseView.tsx:278–281、483–494、621–657、857–877`。

分别在库结构 SQL、表结构 SQL 的 `get_table_ddl` 挂起期间切连接、库、表，再返回含 `independent_stale` 的旧 DDL。六种组合中，保存框增量均为 **0**，写入增量均为 **0**。挂起库 DDL 后离开数据库页面的反例也通过。

另分别在库结构 SQL、表结构 SQL 的保存框挂起期间切连接、库、表，再放行旧路径；六种组合均没有请求写入。正常目标下库级、表级 SQL 保存仍通过。

可核对日志标签：`独立矩阵 databaseSql/tableSql`、`B2 离开数据库页面后迟到的库 DDL`、`B2 切连接后迟到的库 DDL 不打开保存框`。相关截图：`03-stale-schema-{主题}-{尺寸}.png`。

### 同一导出入口重复发起：已通过

| 入口与完成顺序 | 实测保存框 / 写入增量 |
|---|---|
| 表 CSV、表 SQL、库 SQL：先后发起两次，第二次取数或 DDL 先返回并写入，随后放行第一次 | 各 **1 / 1**；只有第二次操作打开保存流程，写入内容含 `independent_latest`，不含 `independent_stale`。 |
| 表 CSV、表 SQL、库 SQL：两次操作均已打开模拟保存框，第二个路径先返回，随后放行第一个 | 各 **2 / 1**；只采用第二个路径，没有旧路径写入。 |
| 查询 CSV：首次保存挂起时，重复点击实际结果区导出按钮两次 | 忙碌态抑制重入，放行前 **1 / 0**；放行有效请求后 **1 / 1**。该入口采用防重复触发行为。 |
| 查询 CSV：旧保存挂起后执行新查询，再从同一入口导出；新路径先返回，旧路径随后返回 | **2 / 1**；只写新查询的中文表头内容及新路径。 |

以上均在四组主题与尺寸下动态执行；没有调用页面内部函数来强行绕过按钮状态。证据为 `results.log`、`evidence-summary.json` 的 `同入口` / `查询 CSV` 标签，以及 `08-overlap-{tableCsv,tableSql,databaseSql}`、`09-overlap-queryCsv` 各四张截图。

## 其他回归结果

| 项目 | 本次实际结果 |
|---|---|
| 连接树与公共二级栏 | 保存连接加载失败可重试；默认库保持；库表、字段失败可重试；引擎切换及二级栏收展正常。 |
| 目标与迟到查询 | 切连接、库、表清除旧结果；迟到查询不会重新显示；筛选隐藏目标后不可继续操作旧目标。 |
| 查询与内容 | 错误和零行成功可区分；重复列按列位置保留；CSV 中文、逗号、双引号、字段 CRLF、空字符串及零行表头通过。验证对象是传入模拟写入 IPC 的字符串。 |
| 文件与错误 | 取消不写入；选择文件失败、写入失败可重试；DDL 失败不输出部分结构文件。 |
| SQL / NoSQL | SQLite 展示文件名但 IPC 使用 `main`；Redis、MongoDB 走各自接口；模拟连接探测失败可见。 |
| 工作台复用 | 工作台只显示当前主机的数据库；独立数据库页恢复全量连接，筛选未相互污染。 |
| 大结果与按钮 | 60 行、16 列内部横向滚动，页面不水平溢出；滚动后执行和结果导出按钮可见，中心点命中实际按钮。 |
| SQL / Redis 弹窗 | 四组中内部滚动及取消、测试连接、保存按钮可达性均通过；未提交真实表单。 |

最小视口中结果容器 `scrollWidth=2538`、`clientWidth=520`、`scrollLeft=2018`，SQL 表单 `scrollTop=422`。默认视口对应为 2538、787、1751、258。断言包含实际边界矩形和 `elementFromPoint` 命中结果；截图也已人工复核。

## 非阻断项

### N1 / P2：亮色连接弹窗文字偏淡，Redis 底栏固定深色——仍存在

本次重新查看亮色默认和最小视口截图，SQL / Redis 标题和字段标签辨识度仍偏低，Redis 底部为固定深色条。当前源码标题在 `DatabaseView.tsx:2599、2892` 使用 `text-white`，标签如 2616 行使用 `text-slate-300`，Redis 底栏在 3081 行使用 `bg-[#141c2d]`。

按钮可达性与滚动均通过，因此继续列为主题一致性问题，不升级为核心功能阻断。建议后续采用语义文本和背景令牌。证据：`06-sql-modal-light-{尺寸}.png`、`07-redis-modal-light-{尺寸}.png`。未判断其是否由本轮新增。

### N2：原型导航层级仍有差异——待总控确认取舍

原型 2793–2851 行二级栏分列 MySQL、PostgreSQL、Redis、MongoDB，并展示 SQL 常用片段；当前页面二级栏为 SQL / Redis / MongoDB，SQL 引擎细分位于内部连接树，片段通过顶部入口打开。源码、实际页面截图与原型文本对照确认该差异仍存在。

功能入口仍在。此项继续交由总控确认层级取舍，不扩充原型中 toast 演示为新增功能要求。本次没有生成同环境原型截图，也不宣称像素级视觉对齐通过。

### N3：生产 JS 大分块提示——既有构建提示

`pnpm build` 退出码 0，但仍提示压缩后单个 JS 分块超过 500 kB；本次主分块约 3,136.03 kB，gzip 997.00 kB。与返工实现回执一致，不作为此次异步导出修复的新增阻断。

## 明确未验证与整体验收保留项

- 原生 Windows Tauri/WebView2、系统保存对话框、DPI 与真实默认/最小桌面窗口行为。这里的 1440×900 / 1100×700 均为浏览器视口。模拟保存框挂起时允许切目标，不能据此声称原生对话框允许同样交互；DDL 挂起反例发生在打开保存框之前。
- 真实 SQLite 文件、SQL / Redis / MongoDB 连接、驱动方言、旧配置迁移、系统凭据、数据库权限、审批和审计。
- 真正 CSV / SQL 文件写入、重新读取、权限与字节比对；所有 `write_text_file` 均由模拟 IPC 接收。生成日志、截图和报告不等于数据库导出已做真实磁盘验收。
- 真实连接增删改、SQL 文件执行、写 SQL、建表及字段编辑。未触碰真实资料或执行破坏性操作。
- 已经发起的文件写入无法由本轮前端检查撤销；本次验证边界为过期操作不再发起后续保存或写入。
- 本次未运行 Rust `cargo check` / `cargo test`；未修改 Rust，整体验收仍需按通用清单完成这些检查。

以上是整体验收所需证据缺口，不作为本次 B1/B2 前端返工仍未修好的证据。

## 证据与工作区边界

完整目录：`C:/Users/ao/AppData/Local/Temp/opspub-step06-independent-recheck-20261122/`。

- `results.log`：四组完整日志，含每组 `DETAIL_JSON` 和零失败汇总。
- `evidence-summary.json`：四组共 288 项断言的详细调用增量、内容与路径，56 张截图清单、源码哈希及生产 CSS 一致性结果。
- `tsc.log`、`build.log`：本次实际类型检查和生产构建输出。
- `baseline-fixture.tsx`、`review-extra.tsx`、`overlap-extra.tsx`、`setup-review.cjs`、`augment-fixture.cjs`、`database-fixture.tsx`、`run-isolated.cjs`、`collect-evidence.cjs`：可复跑夹具和收集工具。只存在于临时目录，未加入业务代码或依赖。
- 每组 14 张截图：首轮相同的 9 个过程状态、3 个同入口重叠状态、1 个查询 CSV 重叠状态及最终页面，共 56 张。
- `before.json`、`workspace-integrity.json`：开始时和报告写入后的工作区边界校验。写报告前，初始存在的文件哈希无一变化；最终仅本报告内容变化，数据库视图哈希保持上述值。
- `previous-review.txt`：2026-11-21 首轮报告原文；首轮失败证据仍在原独立验收目录。

本轮仓库内只修改 `docs/step-06-review.md`；未改业务代码、实现回执、编排状态或依赖，未暂存、提交、推送。文档以 UTF-8 无 BOM 保存。

已参考技能：`check`、`bug-detective`、`test-development`、`ui-frontend`、`theme-system`。
