# 第 09 步 · B1/B2 第三轮独立复验

**结论：建议暂不放行本次返工。B1 通过；B2 的发送区裁切，包括二轮的“永久放行＋1100×700＋展开/重展”反例，已修复。但本次 header 修复引入了页内 AI 锁菜单裁切，时段按钮看不见、鼠标中心点击无法改变状态，作为本轮新增阻断项退回。** 不能将发送区通过扩大为“完整状态均可用”。

日期：2026-11-22，Asia/Shanghai。仅复验第 09 步 B1/B2 的布局与相关历史操作，不处理 N1–N3，不推进其他步骤。分支 `opspub`；HEAD 为 `6f886c0da467d9372c046626a29a79c0cd53d9f2`。本会话未修改业务代码，未暂存、提交或推送，仓库内只新增本报告。

## 验收依据、环境与证据

先读 `.agent-pipeline/review-checklist.md`、`step-09-review.md`、`step-09-review-round2.md`、`step-09-implementation.md`，再检查旧日志、夹具和当前实现。特别核对旧 `center-current.log`：永久放行最小窗口的旧按钮中心为 `(1020, 684.90625)`，点击命中 `.workspace-content`，`chatsBefore=0, chatsAfter=0`。本轮没有照抄实现方“200 项通过”的结论。

独立证据根目录：

`C:/Users/ao/AppData/Local/Temp/opspub-step09-round3-independent-20261122-Fj8So1/`

下文脚本、日志、JSON 和截图文件名均相对此目录。夹具从二轮目录复制，未覆盖旧目录或旧日志。复制时记录 SHA-256，见 `copied-fixture-hashes.json`；旧反例摘要见 `old-center-current.log`、`old-confirm-current.log`。

- 使用实际当前 App、路由、工作区导航、Copilot、store 与 API 封装，仅在 Tauri 官方 `mockIPC` / 模拟事件桥边界提供合成数据。主机仅为 101/102、`synthetic-101.invalid` / `synthetic-102.invalid`；审批均为 `synthetic-noop-*`。
- 每组新建本轮临时 Edge profile，自包含 `file:` HTML 配合禁止外网的 CSP、关闭后台联网与阻断外部域名解析；本地 CDP 用于鼠标、滚轮和截图。未读取真实应用数据库、用户 profile、主机凭据，未连接主机、模型或 Reeve。独立矩阵未调用审批批准或拒绝 IPC。
- 工具目录没有项目运行任务系统的查询、扫描、登记、启动或停止接口，仓库也没有 `.vscode/tasks.json`。未启动 Vite 服务或 Tauri；使用已有离线回退方式。Codex 会话管理接口未当作项目任务系统。
- 当前源码重新构建到证据目录的 `build/`，未覆盖仓库 `dist`。CSS 为 `index-CCg2m6_Z.css`，SHA-256 `3f1d5c79877269ce0a0c12515fff996fdb04f8aef740d44ae38e698bcffe6268`，与二轮生产 CSS 一致；不是用旧 CSS 验新 JSX。
- 当前 Copilot SHA-256 为 `e7ceb2c041bc252755c3d44f544f1ac5edf649e34fdd591898abac86f6034682`。改前快照仍为 `eae38c67adca7490ee43b823f5db13e612c7f2b6da635f8426ae7682f4c8a78f`。快照对照仅替换 Copilot 模块，且保留包内替换成功断言。

## 阻断项

### B2-R3 · 新增 header 裁切页内锁菜单，切换时段不可用

**归属：本次 header 返工新增的布局回归。** 当前 `src/pages/copilot/index.tsx:1044` 在固定单行的 header 上加了 `overflow-hidden`；`:1053` 的锁菜单仍是 header 内的 `absolute ... top-full ... z-50` 元素。浮层被祖先裁切，增加 z-index 不能越过该裁切边界。

最小复现，无需审批或流式事件：

1. 用合成 IPC 返回锁定状态，进入 Copilot。亮暗、1440×900/1100×700 均可。
2. 鼠标点击页面内的“AI 操作已锁定”，不是应用最上方全局栏的按钮。
3. 页面内按钮变为 `aria-expanded=true`，但锁菜单只露出顶端边缘；“30m / 2h / 1d / 永久”等菜单内容被截掉。
4. 不调用 `scrollIntoView`，实际点击“永久”的布局中心。命中的是后方工具区，`set_ai_lock` 次数仍为 0，菜单因外部点击而收起。

同一合成初始状态、相同 CSS、相同实际鼠标操作，最小窗口亮色对照：

| 测量 | 当前返工 | 改前快照 |
|---|---:|---:|
| header 纵向范围 | 72–143.921875px | 72–143.921875px |
| “永久”按钮纵向范围 | 223.78125–252.4375px | 223.78125–252.4375px |
| 目标中心 | (888.75, 238.109375) | 相同 |
| 菜单按钮九点命中 | **0/9** | **9/9** |
| 原生鼠标中心点击后的 mock `set_ai_lock` | **0→0** | **0→1** |
| header / 页面 scrollTop | 0 / 0 | 0 / 0 |

`menu-current-final.log` 的无审批最小反例在四组均失败；`menu-before-final.log` 四组均通过。独立完整矩阵另在锁定、30m、永久各自的末次重展状态打开菜单，共 12 组，均为菜单九点 `0/9`，实际中心点击未产生 `set_ai_lock`。因此这不是永久态文案过长的单点，也不是审批数据造成的遮挡。

证据：

- `menu-current-final.log`：`0 PASS / 8 FAIL / 0 HARNESS_ERROR`；`menu-before-final.log`：`8 PASS / 0 FAIL / 0 HARNESS_ERROR`。这里两次断言分别检查可见性和实际点击，不能算作两个独立缺陷。
- 无审批截图：`step-09-current-menu-final-locked-lock-menu-locked-light-1100x700.png`、同名 dark；对照 `step-09-before-menu-final-locked-lock-menu-locked-light-1100x700.png`。
- 全状态截图：`step-09-current-independent-final-locked-lock-menu-locked-light-1440x900.png`、`step-09-current-independent-final-forever-lock-menu-forever-dark-1100x700.png`。
- `independent-summary.json` 汇总全部菜单命中与点击前后次数；`final-locked.log`、`final-30m.log`、`final-forever.log` 保留原始记录。

修复关闭条件：保持输入区完整可达，同时让页内锁浮层完整展示、时段按钮可以直接用鼠标命中；复验不得靠程序化滚动隐藏祖先补救。本轮未修改实现。

### 原夹具通过为何不能排除此回归

按实现方命令重跑复制的 `run-confirm.cjs current`，本轮确实得到 `200 PASS / 0 FAIL / 0 HARNESS_ERROR`，不是否认其运行记录。

但该夹具的 `click` 助手只对 footer 禁用了 `scrollIntoView`，菜单按钮仍会调用它。仅给临时副本增加滚动日志后，1100×700 亮色实测：

```text
AUTO_SCROLL {"target":"30m","headerScrollTop":110,"pageScrollTop":0}
AUTO_SCROLL {"target":"永久","headerScrollTop":110,"pageScrollTop":0}
```

浏览器把 `overflow:hidden` 的 header 程序化滚动了 110px，才让隐藏菜单目标参与点击；随后其他点击又将其滚回 0。原夹具在“状态已切换、发送区可见”上的断言不能证明真实用户看得见菜单。证据为 `instrumented-supplied.log`，该批仍然 `50 PASS / 0 FAIL`，但明确留下隐藏祖先被自动滚动的记录。

本轮最终独立夹具的点击助手完全移除了 `scrollIntoView`；以真实 CDP 鼠标中心实点、命中元素和 IPC 次数裁决，不通过直接调用按钮处理函数切状态。

## 通过项

### B1 · 历史进入二级栏、折叠恢复与历史操作通过

`history-final.log` 四组共 `64 PASS / 0 FAIL / 0 HARNESS_ERROR`。运行真实 App 中的历史处理函数，初始 35 条合成历史，其中 32 条具有超长无空格标题；删除后为 33 条，再创建并发送新会话。

- 历史搜索位于 `.workspace-subnav-slot`，聊天页没有第三个 `aside`。二级栏收起为宽度 0 且 `inert=true`；隐藏搜索框不能取得焦点。
- 正文搜索 `needleunique` 忽略大小写，仅找到 BETA；空结果、清空过滤、切换正文正常。过滤状态下收起再展开，搜索字串、当前会话、正文和未发送草稿保留。
- “查看全部历史与管理”可打开，沿用搜索；取消删除保留持久化，确认删除非活动会话不改变当前正文，删除活动会话切到剩余会话且移除对应持久化 ID。
- 真实鼠标滚轮将长历史滚到底部，整个服务器上下文及 `synthetic-101.invalid:22` 完整可见；收起再展开保留当前正文和侧栏滚动位置。没有用 `scrollIntoView` 拉出目标。
- “新对话”切换内容，按钮中心实点 mock 发送后，新会话写入隔离 profile 的历史存储。

截图：`step-09-current-history-final-locked-history-filter-collapsed-dark-1100x700.png`、`step-09-current-history-final-locked-full-history-light-1440x900.png`、`step-09-current-history-final-locked-long-history-context-dark-1100x700.png`。

本轮重新运行离线原型：四组中历史属于原型二级栏，折叠宽 0、opacity 0、展开宽 220px。见 `prototype-round3.log` 和 `step-09-prototype-ai-page-<theme>-<size>.png` / `step-09-prototype-collapsed-<theme>-<size>.png`。原型及缓存依赖哈希与二轮一致。此处只裁决 B1 的结构与折叠，不声称整个页面已像素级还原原型。

### B2 · 发送区全矩阵通过，二轮永久态旧反例已消除

独立矩阵：**亮/暗 × 1440×900/1100×700 × 锁定/30m/永久 × 展开/收起/重展 × 4/12 条审批，共 72 个样本。** 默认安全提示始终保留，审批没有被隐藏。

| 主题/尺寸 | 锁定：展开/收起/重展 | 30m：展开/收起/重展 | 永久：展开/收起/重展 |
|---|---|---|---|
| light 1440×900 | PASS / PASS / PASS | PASS / PASS / PASS | PASS / PASS / PASS |
| dark 1440×900 | PASS / PASS / PASS | PASS / PASS / PASS | PASS / PASS / PASS |
| light 1100×700 | PASS / PASS / PASS | PASS / PASS / PASS | PASS / PASS / PASS |
| dark 1100×700 | PASS / PASS / PASS | PASS / PASS / PASS | PASS / PASS / PASS |

表中 PASS 仅指该状态下的**发送区、收展与独立滚动**，每格都分别检查 4/12 审批；不包含上述锁菜单通过。

72 个样本中 footer、textarea、发送按钮均完整位于页面裁切边界内，发送按钮九点均命中。每个样本实际在按钮中心点击一次，共 72 次正确 `message / serverId=101` 的 mock chat IPC，且最终回复可见；锁定态按现有提示明确选择“仅只读模式”。144 次真实滚轮操作均只改变目标审批区或正文的 scrollTop，另一区保持原位；页面和 header 的 scrollTop 始终为 0。

由于页内切锁菜单存在上述阻断，为排除其对发送区验证的干扰，独立矩阵的三个初始锁状态分别由 **mock `get_ai_lock` 的合法返回值**设置，并核对 store 中的秒/毫秒转换。不能把这项状态注入描述成真实用户已成功完成三个状态之间的切换。

| 本轮实测几何，三个锁状态、亮暗、收展均一致 | 1100×700 | 1440×900 |
|---|---:|---:|
| header 高度 | 71.921875px | 71.921875px |
| 页面/footer 底边 | 680 / 680px | 880 / 880px |
| 发送按钮纵向范围 | 633–657px | 833–857px |
| 发送中心 | (1020, 645) | (1360, 845) |

特别是原失败组合“永久＋1100×700＋展开/重展”，4/12 审批下都完整可见并实际发送成功。独立脚本补齐了原夹具仅测重展几何、未重展发送的缺口。

三份最终矩阵日志分别为 `252 PASS / 8 FAIL / 0 HARNESS_ERROR`，合计 **756 PASS / 24 FAIL / 0 HARNESS_ERROR**。24 次 FAIL 全部为 12 个环境中重复的锁菜单可见性/点击失败，发送、滚动、收展、提示保留和正常数据横向宽度断言没有失败；不能把这些重复断言算作 24 个缺陷。

证据：`independent-summary.json`、`final-locked.log`、`final-30m.log`、`final-forever.log`。截图规则为 `step-09-current-independent-final-<lock>-<lock>-<4|12>-<expanded|collapsed|reexpanded>-<theme>-<size>.png`。已实际检查关键截图，包括永久最小窗口重展、暗色收起、当前锁菜单、快照菜单、历史管理/长历史及原型。

## 非阻断项与既有边界

1. 最小窗口审批展开时正文最低可用高度仍仅 `52.09375px`，实际能独立滚动；默认窗口为 `299.921875px`。这是可用性余量问题，不再误报为输入区裁切。
2. 最小窗口顶部目标服务器与外部工具/技能控件仍有局部重叠，关键截图可见；前两轮已列为原有布局问题，相关工具区不在本次 header 修改范围。本轮不把它重新归为 B1 新增问题，也不据根页面无横向溢出宣称该工具区完全正常。
3. 原夹具重跑时仍测出超长无空格 command 的审批区局部横向滚动：最小窗口 `client=774, scroll=2001`，默认窗口 `1114/2001`，见 `supplied-confirm.log` 的 `LONG_COMMAND`。二轮已通过快照证明是已有边界，本轮未重新裁决归属。
4. Vite 构建仍提示 JS chunk 超过 500kB，退出码为 0。未为了本轮布局复验处理构建体积。

## 命令、退出码与夹具校正

工作目录为仓库根目录。下表 `$r` 指上述独立证据根目录；`run-batch.cjs` 和 `run-command.cjs` 使用 Node 捕获真实进程退出码，日志以 UTF-8 无 BOM 保存。运行时批次的 1 表示保留失败断言，不是启动失败。

| 检查/批次 | 实际命令或调用 | 退出码 | 结果/证据 |
|---|---|---:|---|
| 启动/基线 | `git status -s`、`git branch --show-current`、`git rev-parse HEAD`；读取指定报告、技能和旧日志 | 0 | 分支与原有工作区记录在 `status-before.log`、`head-before.log`、`branch-before.log`；源码哈希在 `source-before.json`。 |
| 隔离准备 | Node 复制二轮夹具、计算 SHA-256、记录旧失败摘要 | 0 | `copied-fixture-hashes.json`、`old-*.log`，未写旧证据目录。 |
| 本轮构建 | `node "$r/run-command.cjs" build node node_modules/vite/bin/vite.js build --outDir "$r/build" --emptyOutDir` | 0 | `build.log` / `build-exit.json`，5234 模块，40.66 秒。仅 Vite 构建，不冒充本轮 `pnpm build` 或独立类型检查。 |
| 实现方原夹具复跑 | `node "$r/run-batch.cjs" run-confirm.cjs supplied-confirm current` | 0 | `supplied-confirm.log`：200/0/0；局限见上文。 |
| 独立探索矩阵 | `node "$r/run-batch.cjs" run-independent.cjs independent-locked current locked`；同样运行 `independent-30m current 30m`、`independent-forever current forever` | 1 / 1 / 1 | `independent-*.log`。探索中发现夹具自身的圆角命中采样、30m 单位断言、长历史 seed 注入问题；不将这些假失败记为业务缺陷。 |
| 首次历史专项 | `node "$r/run-batch.cjs" run-history.cjs history-current current locked` | 0 | `history-current.log`：60/0/0；已正确注入 35 条历史。 |
| 初次菜单快照对照 | `node "$r/run-batch.cjs" run-menu.cjs menu-before before locked` | 1 | `menu-before.log`：4/4/0；四个失败均为圆角空白角点采样，实际中心点击均有 IPC。校正后以最终批为准。 |
| 最终锁定矩阵 | `node "$r/run-batch.cjs" run-independent-final.cjs final-locked current locked` | 1 | `final-locked.log`：252/8/0，24 个发送样本；失败仅为锁菜单。 |
| 最终 30m 矩阵 | `node "$r/run-batch.cjs" run-independent-final.cjs final-30m current 30m` | 1 | `final-30m.log`：252/8/0，24 个发送样本；失败仅为锁菜单。 |
| 最终永久矩阵 | `node "$r/run-batch.cjs" run-independent-final.cjs final-forever current forever` | 1 | `final-forever.log`：252/8/0，24 个发送样本；失败仅为锁菜单。 |
| 当前无审批菜单反例 | `node "$r/run-batch.cjs" run-menu-final.cjs menu-current-final current locked` | 1 | `menu-current-final.log`：0/8/0，四组均 0/9 命中、0 次 set IPC。 |
| 快照无审批菜单对照 | `node "$r/run-batch.cjs" run-menu-final.cjs menu-before-final before locked` | 0 | `menu-before-final.log`：8/0/0，四组均 9/9 命中、1 次 set IPC。 |
| 原夹具滚动观测 | `node "$r/run-batch.cjs" run-instrumented.cjs instrumented-supplied current` | 0 | `instrumented-supplied.log`：50/0/0；仅最小亮色，菜单点击前 header 被自动滚动 110px。 |
| 最终历史专项 | `node "$r/run-batch.cjs" run-history-final.cjs history-final current locked` | 0 | `history-final.log`：64/0/0，补齐完整上下文可见及长侧栏滚动位置恢复。 |
| 原型复跑 | `node "$r/run-batch.cjs" capture-prototype.cjs prototype-round3` | 0 | `prototype-round3.log`；四组展开、收起、再展开截图；仅使用已有缓存依赖。 |
| 本步差异 | `node "$r/run-command.cjs" step-diff git diff --no-index --unified=3 .agent-pipeline/step-09-copilot-before.tsx src/pages/copilot/index.tsx` | 1 | `step-diff.log`；存在差异正常返回 1。 |
| 格式/暂存 | `node "$r/run-command.cjs" diff-check git diff --check -- src/pages/copilot/index.tsx`；`node "$r/run-command.cjs" staged git diff --cached --name-only` | 0 / 0 | `diff-check.log`、`staged.log`，暂存区为空。 |
| 最终内容与范围核对 | Node 解析日志、汇总 72 样本、144 次滚轮、菜单对照；比对所有既有源码哈希，回读报告并验证编码、截图路径和 HEAD | 0 | `independent-summary.json`、`verification-before-report.json`、`verification-final.json`。614 个既有文件哈希均不变，仅新增本报告。 |

探索校正只修改临时夹具，未修改业务：胶囊/圆角按钮的几何外接框角点可能在绘制区域外，最终菜单及 header 控件采用向内 8px 的九点采样；发送按钮保留原 2px 九点和完整矩形边界检查。30m 的 mock 返回秒、store 使用毫秒，最终断言按实际转换核对。探索矩阵的长历史追加字符串未生效，已由独立历史专项的“初始恰为 35 条”断言及实际滚轮检查补足。原探索日志留存，不能用其假失败处罚实现，也不能用其不完整样本宣称通过。

## 未验证

- 原生 Windows Tauri/WebView2、真实窗口/DPI/缩放与原生焦点。这里是浏览器等尺寸 viewport，不等于桌面打包应用验收。无项目任务系统工具，未绕过启动约束。
- 真实模型、锁策略执行、真实权限、审批后台超时、批准/拒绝后的远程执行和审计落库。mock chat 只证明前端事件到合成 IPC 以及回复可见；没有触碰真主机或凭据。
- N1–N3 流式生命周期按要求另批，本轮未运行其用例，未修复，也未标记通过。真实旧数据迁移、重启恢复及 17 模块整体验收亦不在本轮。
- 本轮未独立执行 `tsc`、Rust `cargo check/test`，没有将实现方或前两轮的记录代算为本轮结果。页内菜单失败也不代表全局栏的独立锁入口已验证或失效。

## 裁决建议

接受 **B1** 及 **B2 发送区旧反例修复**的离线复验结果；因新增 **B2-R3 锁菜单裁切**，暂不接受本次返工整体放行。返工应同时保住单行 header/发送区几何与锁浮层可见性，再运行无程序化滚动的菜单点击及现有完整矩阵。原生与 N1–N3 缺口继续保持开放。

本轮到此停止。已参考技能：`check`、`test-development`、`ui-frontend`。
