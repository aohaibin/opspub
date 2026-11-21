# 第 06 步 · 数据库迁移实现回执

本批按 `state.json` 第 06 步、`baseline.md` 数据库条目、`review-checklist.md` 和原型第 2793、6259、7138 行附近实现。起点为 `opspub` 分支的 `a590883`，第 03、04 步提交 `56fc3fb`、`a2149d0` 已在历史中。

## 实际修改文件

| 路径 | 变更 |
|---|---|
| `src/pages/workbench/views/DatabaseView.tsx` | 独立数据库页接入公共二级栏的引擎分类，工作台实例仍按当前主机初始化筛选。连接树按引擎、连接、库、对象分组，搜索已加载的库表。库表及字段错误常驻并可重试。执行、解释和 SQL 文件复用现有查询 IPC。结果按列位置保留重名列，并区分零行、失败与等待。顶部菜单提供查询结果 CSV 和库结构 SQL。 |
| `.agent-pipeline/step-06-implementation.md` | 本次回执。 |

沿用现有连接配置、数据库 IPC、保存对话框及文件写入接口。SQLite 树节点保留文件名提示，IPC 使用原始库名 `main`。切换连接、库或查询标签清除前一结果并丢弃迟到响应。查询 CSV 支持只导出表头，结构导出在任一表 DDL 读取失败时显示错误并可重试。树搜索限于已加载的连接、库名、对象名与类型，现有库表接口没有对象注释字段。

## 验证命令与结果

| 命令 | 退出码 | 证据 |
|---|---:|---|
| `git status -s`、`git branch --show-current`、`git log -10 --oneline`、`git log -1 --format="%ar\|%s" -- src/pages/workbench/views/DatabaseView.tsx` | 0 | 定位基线与其他模块原有工作区差异。修改前数据库视图没有未提交差异。 |
| `pnpm exec tsc --noEmit` | 0 | 类型检查已通过。 |
| `pnpm build` | 0 | 收束复跑转换 5230 个模块，产物 `dist/assets/index-Df1Z8f3e.css`、`dist/assets/index-C6WC8bQM.js`。已有单个压缩后 JS 分块超过 500 kB 的构建提示。 |
| `git diff --check -- src/pages/workbench/views/DatabaseView.tsx` | 0 | 无补丁空白问题，Git 输出 LF/CRLF 转换提示。 |
| `node "$env:TEMP/opspub-step06-db/run-isolated.cjs" database` | 1 | 早期夹具分别因 Ant Design 按钮字符内部有空格、表项按钮文本含对象类型，以及点击工作台按钮时主机尚在加载而超时。修正选择器和等待条件后复跑通过。 |
| `node "$env:TEMP/opspub-step06-db/run-isolated.cjs" database \| Tee-Object -FilePath "$env:TEMP/opspub-step06-db/results.log"; exit $LASTEXITCODE` | 0 | Edge 无头在亮暗主题 × 1440×900 / 1100×700 四组中各通过 6 组场景。覆盖已保存连接、加载失败与重试、库表树查找、CSV 字节与保存取消、结构 SQL 导出、旧响应隔离、Redis / MongoDB 及工作台主机筛选。 |
| `git diff --binary -- . ':(exclude)src/pages/workbench/views/DatabaseView.tsx' ':(exclude)src/pages/database/index.tsx' \| git hash-object --stdin` | 0 | 其余已跟踪差异前后哈希相同，均为 `3a4b3be0374b8635feeab5e1434a7ec54581cc8a`。 |
| `git diff --cached --name-only` | 0 | 暂存区为空。 |

离线夹具、`results.log` 和 `step-06-database-{light,dark}-{1440x900,1100x700}.png` 位于 `C:/Users/ao/AppData/Local/Temp/opspub-step06-db`。夹具加载实际 React 路由和生产 CSS，所有资产、查询返回、保存路径和写入均由模拟 IPC 提供。

## 未验证

- 原生 Windows Tauri / WebView2、系统保存对话框与磁盘写入。当前工具目录未提供项目任务登记、扫描或启动接口。
- 真实 SQLite 文件、已有真实连接与系统凭据、远程 SQL / Redis / MongoDB、现有数据库审批与审计留痕。
- 本批保留原型之外的既有功能入口，没有逐一运行保存连接表单、SQL 文件执行、写查询或字段编辑。独立验收待总控派发。

参考技能 `ui-frontend`、`theme-system`、`test-development`。本批未暂存、提交或推送。

## 独立验收阻断返工

依据 `docs/step-06-review.md` 的 B1、B2，修改 `src/pages/workbench/views/DatabaseView.tsx` 和本回执。

- **B1 查询结果与表 CSV**。导出记录连接、库、表及查询代际。表数据返回后、打开保存框前校验一次，保存路径返回后、调用 `write_text_file` 前再次校验。切换连接、库或表，以及同一目标重新执行查询时，挂起的 CSV 导出失效。切走后重新选回同一目标仍会使旧操作失效。
- **B2 库与表结构 SQL**。每类导出有独立操作标识，记录发起时的连接、库及表选择。库表列表、DDL 与保存路径返回后检查标识和选择，过期响应会在发起下一步前退出。离开数据库视图也会使挂起操作失效。若同一入口发起新导出，采用最后一次操作。返工约束适用于尚未发起的文件写入。

| 命令 | 退出码 | 证据 |
|---|---:|---|
| `pnpm exec tsc --noEmit` | 0 | TypeScript 检查通过。 |
| `pnpm build` | 0 | 转换 5230 个模块，生成 `dist/assets/index-BojwECqg.js` 和 `dist/assets/index-Df1Z8f3e.css`。仍提示单个 JS 分块压缩后超过 500 kB。 |
| `node "$env:TEMP/opspub-step06-export-rework/setup-review.cjs"` | 0 | 用独立验收夹具副本生成新增反例。 |
| `node "$env:TEMP/opspub-step06-export-rework/run-isolated.cjs" database-rework` | 1 | 首次复跑两组亮色通过。两组暗色在上一次 CSV 写入 IPC 已记录、React 按钮仍在加载时点击了下一次导出，夹具等待预置保存框错误超时。增加等待按钮退出加载态后复跑。见 `attempt-01-results.log`。 |
| 同一夹具命令复跑 | 0 | 亮暗主题与 1440×900、1100×700 四组各通过 6 组基础场景和 37 项独立断言，失败数为 0。见 `results.log` 中的 `DETAIL_JSON` 和各组「独立反例最终汇总」。 |
| `git diff --check -- src/pages/workbench/views/DatabaseView.tsx` | 0 | 无补丁空白问题，Git 输出 LF/CRLF 转换提示。 |
| `git diff --cached --name-only` | 0 | 暂存区为空。数据库视图之外的已跟踪差异哈希仍为 `3a4b3be0374b8635feeab5e1434a7ec54581cc8a`。 |

复跑覆盖 B1 在保存框挂起时切连接、切库、切表、切表再选回、在同一目标重新查询，以及表 CSV 在查询或保存框挂起时切换目标。B2 覆盖库 DDL 挂起时切连接或离开页面、库结构保存框挂起时切库，以及表 DDL 和表结构保存框挂起时切表。所有过期操作的写入调用增量均为 0，迟到的数据或 DDL 响应也未发起保存框。同一目标下正常的四类导出均通过。

证据与可复跑夹具位于 `C:/Users/ao/AppData/Local/Temp/opspub-step06-export-rework/`，原独立验收证据保留在其原目录。验证使用无头 Edge 和模拟 IPC，原生 Windows 对话框与真实数据库、文件写入仍未验证。

本次返工参考 `bug-detective`、`test-development`，未暂存、提交或推送。
