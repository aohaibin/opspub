# OpsPub Step 13 最终候选独立复核

**裁决：本轮精确候选专项复核通过，建议关闭 B-THEME-02。未发现新增阻断项。** 亮色可操作启动标签的 1.49:1 回归未再出现，两行标签及说明在亮、暗主题和默认、最小视口下均达到本轮沿用的 4.5:1 启用态检查阈值。禁用态仍有较淡的说明文字，单列为非阻断体验项。本结论限于候选边界及下述定向实测，不代表原生应用或全项目验收完成。

日期：2026-11-23。分支 `opspub`，基准 HEAD `34bddf3284f46d0931f29243f1c7a163b1ed0236`。本轮只做独立复核和本报告，未修改原工作树源码、编排 state 或真实 Git index，未提交或推送。

## 精确候选与最小增量

先读 `.agent-pipeline/review-checklist.md`、`.agent-pipeline/step-13-implementation.md` 尾段及 `docs/step-13-theme-dependency-review.md`，并对照前轮 B1-R2 裁决和保留项。

| 对象 | SHA-256 |
| --- | --- |
| 已评审基线 `D:/itemWork/opspub-step13-theme-dependency-20261123/reviewed.patch` | `c2764ff3bc2d04fa8574b9d4d95eeee9b8a38c96237a21707da202e04b8e4c0c` |
| 本轮精确候选 `D:/itemWork/opspub-step13-theme-fix-AyiWzF/candidate.patch` | **`ef4d6ed337f80ff0eab881a74974d0a14ef230b5d03d6ecb117c2ee3c8b193d7`** |

证据根目录 `<E>`：`D:/itemWork/opspub-step13-candidate-review-20261123/`。

从当前 HEAD 重新归档，在仓库外分别重放 `reviewed.patch` 和 `candidate.patch`。两者均通过 `git apply --check --whitespace=error`、正向应用和反向检查。逐字节比较 **616 个文件**，差异只有候选快照 `src/pages/settings/index.tsx:904` 的 `ToggleRow` 返回行：

- 标签：`text-slate-300` → `text-[var(--text-primary)]`。
- 说明：`text-slate-500` → `text-[var(--text-secondary)]`。

程序断言整份文件恰好等于上述两处替换，行数不变，且仅一行不同。Switch 属性、事件、禁用判断、`opacity-50` 和其他文字均未改变。其余 615 个文件与已评审基线相同；新快照的全部 616 个文件又与交接目录的 `snapshot` 逐字节相同。见 `<E>/static-verify.cjs`、`static-verification.json`。

完整候选仍仅包含原八个路径：`src/App.tsx`、`src/components/layout/AppLayout.tsx`、`src/pages/settings/index.tsx`、`src/pages/settings/settings.css`、`src/pages/settings/translations.ts`、`src/store/settings.ts`、`src/styles/variables.css`、`src/theme/antdTheme.ts`。没有新增其他脏 hunk；已评审的六个 CSS 明暗族选择器约束及 Ant Design family guard 没有变化。

## 既有 2,132 项证据核对

实际读取交接目录四批次顶层的 **35 份 JSON**，包括全部 16 份 diagnostics、12 份主题观察、4 份启动文字测量和 3 份批次汇总。逐份检查 diagnostics 的页面异常和外部请求均为空，并重新汇总断言数：

| 既有批次 | 已记录断言 |
| --- | ---: |
| `labels` | 56 |
| `cross` | 700 |
| `system` | 868 |
| `same` | 508 |
| 合计 | **2,132** |

原始 JSON、文件哈希及核对结果保存在 `<E>/prior-evidence-read.json`。这些属于已读取、核对的交接证据；本轮**没有重跑整套皮肤矩阵，也没有把上述数字计为新增独立实测**。

在本轮重放的候选快照独立执行 `pnpm build --outDir 'D:/itemWork/opspub-step13-candidate-review-20261123/build'`，退出 0，实际包含 `tsc` 和 Vite。生成的两个资产不仅名称一致，也与交接构建逐字节相同：

| 资产 | SHA-256 |
| --- | --- |
| `index-76zCQDe8.js` | `a459c229ce6292fc42c2e192f8e22ca5f7d14ec68b78d11a5bf3eec66f7d95cc` |
| `index-B2b-TR5J.css` | `c300cc902b88236e51ccc1b95bd88be64f84ca10092f7e0ce402f0a8287a42df` |

见 `<E>/build.log` 和 `measurements-summary.json`。没有将构建脚本内的类型检查另报成一次独立命令。

## B-THEME-02 独立定向实测

本轮另写 `spot-check.cjs`，在自己的独立构建上运行。使用真实渲染的两个 `button[role=switch]` 及其相邻标签、说明；合成配置、IPC 暂扣、错误注入、状态序列和断言由本轮编写。复用的是通用 Edge/CDP、鼠标和截图方式，没有直接复跑交接方的 `labels/run.cjs`。

视口取候选 Tauri 配置中的最小 **1100×700**、默认 **1440×900**；分别使用亮色 `sky` 和暗色 `obsidian`。每组检查下列八个状态，两行名称始终为「开机自启」「自启后收进托盘」，说明始终为「随系统登录启动 OpsPub」「仅在系统启动应用时隐藏主窗口」。

| 状态 | 实际观察 |
| --- | --- |
| `loading` | 暂扣配置与系统读取，两行禁用，均保留 50% 行透明度，初始化没有系统启停调用。 |
| `enabled` | 系统自启为 true、托盘为 false，两行均可操作且行透明度为 1。 |
| `tray-saving` | 暂扣托盘偏好保存，仅托盘行禁用；自启行继续可用。 |
| `both-on` | 托盘保存完成，两项勾选且均可操作。 |
| `autostart-saving` | 自启关闭操作的配置提交暂扣，两行禁用，界面保留上次确认值。 |
| `autostart-off` | 自启关闭提交完成，自启行可操作且为 false；托盘保留 true，但因依赖自启而禁用。 |
| `restored` | 再次开启合成自启，两行恢复可操作及完整透明度。 |
| `read-failed` | 离开再进入设置，合成系统读取拒绝；两行禁用，保留确认值并显示错误提示。 |

四组均完成，脚本退出 0，**181 × 4 = 724 项断言、32 次状态观察、32 张截图，0 个场景失败**。四份 diagnostics 的页面异常和外部页面请求均为空。断言数包含等待、状态和文本检查，不等于独立业务功能数。证据为 `<E>/spot/summary.json`、逐状态 JSON/PNG 和 `<E>/spot.log`。

启用行的实测结果在两种视口、两行标签及相应说明上均一致：

| 主题 | 标签对比度 | 说明对比度 |
| --- | ---: | ---: |
| 亮色 | **17.85:1** | **6.32:1** |
| 暗色 | **16.30:1** | **6.96:1** |

亮色标签实际为 `rgb(15, 23, 42)`，说明为 `rgb(82, 97, 116)`，背景为白色；不再是旧候选固定的浅色标签。启用行使用完整透明度，以上测量没有把禁用行或颜色过渡混入启用态通过数字。证据可直接查看 `spot/light-1100-enabled.json`、`spot/light-1440-both-on.json` 及暗色对应文件。

禁用行另外计算了祖先透明度与背景合成后的有效文字颜色，**没有仅用原始 computed color 虚报对比度**：

| 主题 | 禁用标签有效对比度 | 禁用说明有效对比度 |
| --- | ---: | ---: |
| 亮色 | 3.41:1 | 2.19:1 |
| 暗色 | 4.88:1 | 2.69:1 |

这些禁用行实际仍使用两个主题语义令牌，行透明度仍为 0.5；恢复可操作后均回到前述启用态结果。按本轮范围及原有禁用呈现，将禁用说明较淡列为非阻断体验项，不宣称全部状态达到 4.5:1。

实际查看了 `startup-light-sheet.png`、`startup-dark-sheet.png` 两张包含全部状态的联系表，以及 `spot/light-1100-enabled.png`、`spot/dark-1440-autostart-off.png` 原尺寸页面图。检查到的两行文字无几何裁切，页面及内容区没有横向溢出。错误态截图保留了实际 toast，部分文字在提示存在时会短暂被覆盖；几何可见检查不作为该时刻完全无遮挡的证明。

## 阻断项、非阻断项与未验证

**已验证阻断项：无新增。** B-THEME-02 的启用态亮色回归已在上述精确候选上消除，建议关闭该项。B1-R2 沿用第三轮专项通过裁决，本轮没有重跑或扩大其结论。

非阻断与保留项：

- 本轮实测到的禁用说明较淡，数据如上。建议作为后续禁用态可读性优化单独处理，保持当前事务禁用逻辑。
- 上轮记录的 Ant Design 主题切换中间色过渡、语言 N1、主题双写拒绝后的持久化失配、模型弹窗中英文混用继续保留，本轮未重测或关闭。
- 构建仍有仓库外输出目录及分块超过 500 kB 提示，退出码为 0。PowerShell 将 Vite 的 stderr 提示包装为 `NativeCommandError` 的日志外观，不是类型或构建失败。

未验证：Windows 原生 Tauri/WebView2、真实应用退出重启、系统登录自启和托盘、原生插件权限与故障、永久 IPC 挂起、多窗口并发、真实终端/设备/备份，以及全设置页、全部皮肤组合的可读性。本轮没有重跑全部主题矩阵、B1-R2 事务矩阵、Rust 全量检查或全模块迁移验收。现有数据和定向检查不替代这些验收。

## 隔离、文件保护与交付建议

运行环境为 Node 24.12.0、Edge 151.0.4129.59。新建的 HEAD 快照、构建、TEMP/TMP、四个独立浏览器配置和全部证据均位于 D:；只通过 junction 复用现有依赖，没有安装依赖。合成 Tauri mock 负责所有配置、自启状态及失败，静态服务仅监听回环地址并限制页面联网。没有读写真实系统启动项、配置库、服务器、凭据、配对或备份。

可用工具中没有应用项目任务的扫描、登记、查询、启动、停止或原生窗口控制能力，见 `<E>/tools-gap.json`。本轮没有启动 `vite dev`、`tauri dev`、原生应用或连接现用应用页面；只运行上述隔离静态构建的无头合成浏览器夹具。四组结束均关闭自建浏览器及回环服务，结束后的进程检查未发现本证据目录对应的 Node/Edge 进程。

报告写入前核对启动时记录的 **668 个原有工作树路径**，字节指纹均未变化；HEAD 与真实 index 的哈希、暂存状态也未改变。仓库内本轮唯一新增文件为本报告。报告写入后的复核结果见 `<E>/preservation.json`。候选补丁交付前再次计算 SHA-256，仍与本报告指定值一致。

**建议总控接受该精确候选的 B-THEME-02 修复，并按已核对的八路径边界交还实现方办理后续提交；保留上述非阻断和原生未验证项。** 本轮没有执行暂存、提交、推送或编排状态更新，交付后停止。

已参考技能：`check`、`theme-system`、`test-development`、`ui-frontend`。
