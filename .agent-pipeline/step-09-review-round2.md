# 第 09 步 · B1/B2 第二轮独立复验

**结论：B1 通过；B2 的原新增裁切已消除，但仍有可复现的最小窗口边界，建议暂不关闭 B2，不认可“B1/B2 全状态通过”。** 锁定、30 分钟放行状态下，本轮亮暗 × 两尺寸的两区滚动、完整发送命中及模拟发送均通过；永久放行、1100×700、二级栏展开时仍裁切发送按钮。后者在改前快照中同样复现，**不是本次返工新增回归**，需总控决定是否纳入本批修复或明确转为另批缺口。

本轮仅验第 09 步 B1/B2。N1–N3 流式生命周期问题按要求另批，本轮未运行其测试、未修改其代码，也未将其记为通过。原生 Tauri/WebView2 未验证。

日期：2026-11-22，Asia/Shanghai。分支 `opspub`，前后 HEAD 为 `6f886c0da467d9372c046626a29a79c0cd53d9f2`。仓库内仅新增本报告，无业务修改、暂存、提交、推送。

## 范围、隔离与证据入口

先读 `.agent-pipeline/review-checklist.md`、`step-09-review.md`、`step-09-implementation.md`，再对照 `step-09-copilot-before.tsx`、当前 Copilot、现有 `WorkspaceNavigation` / `workspace.css` 和原型 `domain-panel-ai`。未直接采信实现方“四组通过”的断言。

独立证据目录：

`C:/Users/ao/AppData/Local/Temp/opspub-step09-round2-independent-20261122-Qf1ytD/`

下列日志、脚本、JSON 和截图均相对此目录。首验目录未被覆盖；从中复制 `run-isolated.cjs`、`copilot-fixture.tsx`、原型驱动及离线缓存依赖，另存原始副本为 `run-isolated-original.cjs`、`copilot-fixture-original.tsx`。原始夹具 SHA-256 为 `d259a2ab32e99beee9295667a3f8cdd269de2cb40ee9e179b9d4eccd870caf43`。

- 当前工具目录只有本地命令、文件操作、时钟与 Codex 会话/worktree 等工具，没有项目运行任务系统的查询、扫描、登记、启动、停止接口；`.vscode/tasks.json` 也不存在。未把会话管理接口当运行任务系统，未启动 Vite 服务、Tauri 或桌面应用。按授权使用离线回退，见 `tool-discovery.log`。
- 使用真实当前 `App`、路由、工作区导航、Copilot、store、API 封装，IPC 边界使用 Tauri 官方 `mockIPC` / mock events。每组新建隔离 Edge profile，只打开自包含 `file:` HTML，清空该 profile 存储，CSP 禁止外部网络，Edge 禁止后台网络并阻断外部域名解析。本地 CDP 只控制本轮自建的离线浏览器。
- 仅使用 101/102、`synthetic-101.invalid` / `synthetic-102.invalid`、合成历史和 `synthetic-noop-*` 审批。未读取真实用户数据库、资料、凭据或浏览器 profile，未连接真实主机、模型或 Reeve，也未执行真实审批命令。
- 临时构建使用当前源码并将 `outDir` 指向上述证据目录的 `build/`。5234 模块构建通过，CSS 为 `index-CCg2m6_Z.css`，SHA-256 `3f1d5c79877269ce0a0c12515fff996fdb04f8aef740d44ae38e698bcffe6268`。实测其与现有 `dist` CSS 逐字节相同，排除误用旧 CSS 导致反例。
- 快照组通过 esbuild 只替换 Copilot 模块，导航、主题和 CSS 与当前组相同，并在包内断言不存在“当前服务器上下文”，防止替换失败。快照 SHA-256 仍为 `eae38c67adca7490ee43b823f5db13e612c7f2b6da635f8426ae7682f4c8a78f`。

## 阻断项 / B2 关闭条件未满足

### B2-R · 永久放行时最小窗口仍裁切发送按钮，改前同样存在

**归属：已有布局边界，本轮新补出的反例；不归因于返工。** 本项阻断的是“B2 已覆盖所有合法状态、可以关闭”的结论。原首验中第三栏包裹结构造成的新增裁切，在锁定与限时放行对照下已经消除。

复现步骤（全为合成数据）：

1. 亮色或暗色，viewport 为 1100×700，保持二级栏展开、默认安全提示可见。
2. 使用三条普通合成历史；当前会话有可滚动正文。注入四条审批，三条长期待审、一条已过期。审批容器高 208px。
3. 通过页面真实鼠标操作打开 AI 锁控件，先选 `30m`，再选“永久”。mock `set_ai_lock` 对永久返回 `locked=false, unlockUntil=null`，与页面既有状态语义一致。
4. 填入合成提问，测量发送按钮和页面裁切范围；收起二级栏后再展开。无需审批弹窗、流式事件或大量历史即可复现。

当前版和正确替换的改前快照，亮暗结果完全一致：

| 1100×700，二级栏展开 | 锁定 / 30 分钟放行 | 永久放行 |
|---|---:|---:|
| 页面可见底边 | 680px | 680px |
| 页面 header 高度 | 71.921875px | 115.921875px |
| footer 底边 | 680px | 719.90625px |
| 输入 textarea 纵向范围 | 621–657px | 660.90625–696.90625px |
| 发送按钮纵向范围 | 633–657px | 672.90625–696.90625px |
| 发送按钮九点命中 | 9/9 | 3/9，仅顶部一排 |
| 聊天区高度 | 52.09375px | 48px |
| 页面自身 scrollTop | 0 | 0 |

发送按钮中心为 **(1020, 684.90625)**，落在 Copilot 页可见底边之外。单独的最小反例批次不调用 `scrollIntoView`，真实 CDP 鼠标点击该中心后，命中的是 `.workspace-content`，合成 `copilot_chat` 次数仍为 0、输入原文保留。当前、快照的亮暗四次中心点击结果一致，见 `center-current.log` / `center-before.log` 的 `CENTER_PROBE`。

永久文案使 header 换到第二行，实测增加 44px；审批仍固定占用 208px，聊天带 `p-6` 时最小实测为 48px，footer 随之溢出约 39.91px。相关源码为 Copilot 的 `header`（约 1049 行，`flex-wrap shrink-0`）、审批区（约 1131 行）、`main`（约 1227 行）与 footer。此处是布局测量和源码对应，不声称原生 DPI 下必然得到相同像素值。

收起二级栏后宽度增加，永久状态下发送完整可见并能实际模拟发送；重新展开则再次裁切。1440×900 中三个锁状态均通过。即使顶部剩余一条窄边仍可能点击，亦不能算“发送按钮完整可见、中心命中正常”通过。

主要证据：

- `confirm-current.log` / `confirm-before.log`：每组均 186 PASS / 14 FAIL / 0 HARNESS_ERROR；14 次失败全部对应上述永久最小窗口及重新展开的重复检查，**没有 N1–N3 断言**。
- `comparison.json`：36 对状态样本中，当前/快照 header、页面、footer、textarea、发送按钮几何测量全部相同。
- 当前截图：`step-09-current-confirm-forever-expanded-light-1100x700.png`、同名 dark；当前中心点击前后为 `step-09-current-probe-forever-before-center-<theme>-1100x700.png` / `…after-center…`。
- 快照截图：`step-09-before-probe-forever-before-center-light-1100x700.png`、同名 dark。
- 通过对照：`step-09-current-confirm-30m-expanded-light-1100x700.png`、`step-09-current-confirm-forever-collapsed-dark-1100x700.png`。

## 通过项与非阻断项

### B1 · 历史已进入二级栏，折叠、展开与历史操作通过

原型中历史列表 `opspubAiTaskList` 位于 `subWorkspaceSidebar` 内。独立离线原型在亮暗 × 两尺寸均实测折叠宽度 0、opacity 0、展开宽度 220px，历史仍属于该二级栏，见 `prototype-round2.log`。原型 SHA-256 与首验一致，为 `c79edf954881e8cbfcb0c4429aae0ee7154aa8ca38f9e80f0a2b9d1daa52a86d`；使用缓存的 Tailwind 3.4.17 / Lucide 0.577.0，无网络下载。

当前实现通过现有 portal 槽位承载历史及服务器上下文，聊天页内没有额外 `aside`。本轮合成 35 条历史，含超长无空格标题，在四组中实测：

- 历史在 `.workspace-subnav-slot`；收起后二级栏宽 0、`inert=true`，历史搜索框不能取得焦点，无残留第三栏。展开恢复 220px。
- 分别在“正文搜索过滤中”“长历史滚动到上下文区”“四条审批已显示”三种状态折叠、展开，共 12 轮；搜索字串、活动会话、正文和未发送草稿均保留。
- 正文搜索不区分大小写，`needleunique` 只找到 BETA；空结果、清空搜索、切换消息正确。完整历史管理入口仍可打开，沿用筛选并显示对应会话。
- 取消删除保留持久化；确认删除非活动会话不改当前正文；删除活动会话切到剩余会话并移除对应持久化 ID。二级栏“新对话”切换内容，实际模拟发送后新会话持久化。
- 长历史可以滚动到底部服务器上下文；普通数据和超长历史标题未使二级栏、聊天页或根页面出现横向溢出。

证据：`current-b1b2-attempt01.log` 的历史、collapse、sidebar 断言；`step-09-current-history-filter-collapsed-dark-1100x700.png`、`step-09-current-history-filter-expanded-light-1100x700.png`、`step-09-current-long-history-context-dark-1100x700.png`、`step-09-current-full-history-light-1440x900.png`。原型对照为 `step-09-prototype-ai-page-<theme>-<size>.png` 及 `step-09-prototype-collapsed-<theme>-<size>.png`。

### B2 已通过的范围 · 独立滚动与标准锁状态发送

| 主题/尺寸 | 锁定，展开/收起 | 30 分钟，展开/收起 | 永久，展开/收起 |
|---|---|---|---|
| light 1440×900 | PASS / PASS | PASS / PASS | PASS / PASS |
| dark 1440×900 | PASS / PASS | PASS / PASS | PASS / PASS |
| light 1100×700 | PASS / PASS | PASS / PASS | **FAIL / PASS** |
| dark 1100×700 | PASS / PASS | PASS / PASS | **FAIL / PASS** |

表中 PASS 包括完整可见、九点命中和真实鼠标触发模拟发送。锁定时先出现锁定提示，明确点“仅只读模式”后继续，不进行真实解锁或执行审批。当前组共捕获 22 次符合预期 `message` / `serverId=101` 的合成 chat IPC，且最终回复在页面可见；两组永久最小窗口中心不可命中，未计为发送成功。快照组同样 22 次。通过状态的发送纵坐标为 1440×900 的 833–857px、1100×700 的 633–657px。

四条和十二条审批压力场景中，审批区均保持约 208px、`overflowY=auto`，正文也有独立滚动。CDP `mouseWheel` 实际使目标 `scrollTop` 变化 300/450px，同时另一区保持原位；不是只检查 CSS 类名。十二条审批实测 `scrollHeight=3944px`。即使 B2-R 裁切发生，两区自身仍可滚动，不能据此推导 footer 必然可达。主日志含四组、四条/十二条的 `WHEEL`；确认日志另含三个锁状态的 `CONFIRM_WHEEL`。

首轮独立压力夹具的点击助手对普通控件调用 `scrollIntoView`，可能程序化滚动 `overflow:hidden` 祖先，使被裁切的发送区短暂显露。因此该批“发送成功”**不作为裁切状态的放行证据**。发现此证据局限后，确认批对 footer 禁用该调用，中心反例批在点击前后记录 `pageScrollTop=0`，以确认批和中心批为最终发送证据。未修改业务来迁就测试。

### 主题基线保留

快照至当前 Copilot 差异为 52 增、2 删；删除的两行分别是审批区原单行 JSX（改为等义分行及增加 overscroll）和 `main` 原 class 行（增加 overscroll）。其他原有主题行保留，见 `step-diff.log`、`theme-preservation.json`。

使用相同生产 CSS 比较当前/快照在四组、三个锁状态及展开/收起/重新展开的 **36 对真实组件样本**：页面、footer、textarea、发送按钮的背景、颜色、字号、边框及圆角全部相同。样本来自实际渲染元素，未创建裸 AntD 节点代替。该结论只证明本步相对主题基线保留，不声称全应用像素级还原原型。

### N4-R · 局部横向溢出的已有反例，不作为本步新增阻断

普通合成审批及超长历史标题场景，根页面和相关容器横向宽度检查通过。但将一条审批的 command 设为 `synthetic-` 加 220 个 `X` 后，审批区出现局部横向滚动：最小窗口 `clientWidth=774, scrollWidth=2001`，默认窗口 `1114/2001`，当前和快照亮暗均一致。外层 Copilot 仍分别为 `784/784`、`1124/1124`。

证据：两份确认日志的 `LONG_COMMAND`，以及 `step-09-current-confirm-long-command-light-1100x700.png` 和对应 before 截图。这补足“根页面无横溢出不等于所有内部内容都无横溢出”的边界；不把它误归为 B1 新历史槽位造成。已有最小窗口顶部控件局部重叠也仍可在截图看到，未在本批扩改业务。

构建保留既有 >500kB chunk 提示，退出码为 0。N1–N3 保持首验结论并另批；本报告没有重新裁决其修复状态。

## 分批命令、退出码和证据

工作目录为仓库根目录。`$r` 为上述独立证据目录；`run-batch.cjs` 以 Node 捕获 stdout/stderr、真实退出码、耗时并用 UTF-8 无 BOM 保存日志。退出码 1 的验收批均保留失败断言，不是启动失败。

| 批次 | 实际命令/操作 | 退出码 | 证据与结果 |
|---|---|---:|---|
| 初始只读 | `git status -s`、`git branch --show-current`、`git rev-parse HEAD`；工具目录筛选、检查 `.vscode/tasks.json` | 0 | 原有未提交区留存 `status-before.log` / `source-before.json`，无项目启动工具，未启动应用。 |
| 独立副本 | Node 复制首验夹具、缓存依赖并计算源码哈希；`node "$r/prepare-round2.cjs"` | 0 | 原始副本、隔离目录及夹具 SHA；全部临时产物在 `$r`。 |
| 当前构建 | `node node_modules/vite/bin/vite.js build --outDir "$r/build" --emptyOutDir` | 0 | `build.log`，40.94 秒，5234 模块；未运行服务，未改业务或仓库 `dist`。此命令不是 `pnpm build`，不将其声称为本轮独立类型检查。 |
| 差异/格式 | `git diff --no-index --unified=3 .agent-pipeline/step-09-copilot-before.tsx src/pages/copilot/index.tsx`；对应 `--numstat`；`git diff --check -- src/pages/copilot/index.tsx` | 1 / 1 / 0 | `step-diff.log`、`theme-line-check.log`、`diff-check.log`；前两项因有差异正常返回 1。 |
| 独立压力首批 | `node "$r/run-isolated.cjs" current`，由 PowerShell捕获；之后将日志无损转为 UTF-8 | 1 | `current-b1b2-attempt01.log` / `…-exit.txt`：406 PASS / 26 FAIL / 0 HARNESS_ERROR，4 组；B1、4/12审批、长历史、折叠、草稿。发送助手局限已在上文说明。 |
| 原型与主题准备 | `node "$r/prepare-secondary.cjs"`；`node "$r/run-batch.cjs" capture-prototype.cjs prototype-round2` | 0 / 0 | `theme-preservation.json`；`prototype-round2.log` 与 4 组展开/折叠截图，依赖哈希在日志内。 |
| 确认夹具准备 | `node "$r/prepare-confirm.cjs"` | 0 | `confirm-fixture.tsx` / `confirm-cases.tsx` / `run-confirm.cjs`；三条历史、四审批、真实 UI 切锁状态、footer 不自动滚动。 |
| 当前确认 | `node "$r/run-batch.cjs" run-confirm.cjs confirm-current current` | 1 | `confirm-current.log`：186 PASS / 14 FAIL / 0 HARNESS_ERROR，4 SUMMARY，22 次模拟发送。失败全部为 B2-R。 |
| 快照确认 | `node "$r/run-batch.cjs" run-confirm.cjs confirm-before before` | 1 | `confirm-before.log`：186 / 14 / 0，4 SUMMARY，22 次模拟发送；相同 B2-R，非新增归属成立。 |
| 中心反例准备 | `node "$r/prepare-probe.cjs"` | 0 | `probe-fixture.tsx` / `run-probe.cjs`；只跑最小窗口亮暗，初始由 mock 返回合法永久放行状态。 |
| 当前中心实点 | `node "$r/run-batch.cjs" run-probe.cjs center-current current` | 1 | `center-current.log`：4 PASS / 6 FAIL / 0 HARNESS_ERROR，2 SUMMARY；实际中心点击未产生 chat IPC。 |
| 快照中心实点 | `node "$r/run-batch.cjs" run-probe.cjs center-before before` | 1 | `center-before.log`：4 / 6 / 0，2 SUMMARY；同样未发送，几何一致。 |
| 样本比较 | Node 逐行解析两份确认日志的 `CONFIRM_METRICS`、`LONG_COMMAND`、中心日志的 `CENTER_PROBE` | 0 | `comparison.json`：36 对主题/几何样本零差异，4 组局部横溢出一致，4 次中心实点均无发送。 |
| 最终核对 | `node "$r/verify-final.cjs"`；核对 HEAD、暂存区、源码哈希与本报告编码/证据路径 | 0 | `verification-final.json`，613 个既有文件 SHA-256 不变，新增路径只有本报告，暂存区为空；报告 UTF-8 无 BOM，引用截图存在。 |

统计是重复环境与状态的断言次数，不是独立缺陷数量；本轮所有运行时 FAIL 的核心归因均为 B2-R。探索读取中一次 `rg` 直接传 PowerShell 通配路径产生路径格式错误，随后改为目录加 `-g '*.css'` 成功；该次读取未作为任何验收证据。

## 未验证

- **原生未验证**：无项目运行任务系统可用，未绕过其启动约束。浏览器等尺寸 viewport 不等同于 Windows Tauri/WebView2 的真实窗口、缩放、DPI、最小尺寸或焦点行为。
- 真实模型、流式通道、原生 IPC 时序、真实锁/策略执行、审批后台超时、批准/拒绝后的远程执行与验证、审计落库均未验证。本轮未批准任何审批；模拟 chat 只证明前端事件到合成 IPC 及可见回复。
- 真实旧数据迁移、重启恢复、损坏数据或存储配额、17 模块整体验收未覆盖。未把其他批次日志代算为本轮的 `tsc`、Rust `cargo check/test` 或原生验收。

## 需总控决策

1. **B1 可接受本层复验通过。** 原新增第三栏及折叠不联动已修复，历史行为与主题基线保留。
2. **B2 建议暂不关闭。** 原首验新增包裹回归已消除，但永久放行边界仍不满足“发送完整可见、可正常命中”。该边界在改前即存在，不能处罚为本次新增，也不能据四组标准状态通过就抹去。请总控在“本批补齐永久状态后复验”与“明确转入已有布局缺口、只接受本次新增回归修复”间做决定；验收方不替代此范围裁决。
3. **整步原生验收和流式另批保持开放。** 即使总控接受本次修复，也不能据此关闭原生缺口或 N1–N3。

本轮完成后停止，不推进其他步骤。已参考技能：`check`、`bug-detective`、`test-development`、`ui-frontend`、`theme-system`。
