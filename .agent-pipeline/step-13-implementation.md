# 第 13 步 · 设置与主题迁移回执

`opspub` 分支，基于 `34bddf3`。依据 `.agent-pipeline/state.json`、通用验收清单、设置基线和 `docs/ops-prototype-direction2-workspace.html` 的设置分区、外观与终端主题。审批 `d2bb26d`、审计 `fd08765`、告警 `34bddf3` 沿用已完成批次。

## 实现范围

- 设置分区渲染在公共二级栏，按外观与交互、AI 与网络、安全与控制、数据与关于分为四组。右侧独立滚动，点击分区定位，用户滚动同步高亮，末尾短分区可单独对齐。公共侧栏支持折叠和展开。
- 使用现有 CSS 主题令牌调整标题、说明、间距、选择态、应用皮肤和终端色卡。支持明确选择亮色、暗色或跟随系统。应用主题沿用 Zustand、`ops_theme`、`ops_skin` 及原配置键写入。跟随系统会响应系统偏好变化。中英文覆盖设置导航、主题及终端渲染选项，并同步文档语言和现有 Ant Design locale。
- 复用原设置键和持久化 API，包括语言、开机自启、启动后收进托盘、关闭行为、终端主题、字号、行高、光标样式、代理地址和出站白名单。旧终端主题别名继续由原 Zustand hydration 处理。偏好写入失败会提示并恢复该字段的上一个值。开机自启以系统插件实际应用的状态为准。
- `#/settings`、二级栏旧设置链接、Copilot 的模型配置直达和返回入口继续可用。备份、配对、设备通道、模型服务等复用已有组件、数据和 IPC。安全区原先没有处理函数的保存和重设按钮显示为禁用。没有新增原型中的环境重置或其他业务功能。
- 起始工作区已有设置页、设备设置和全局主题相关改动，按基线叠加实现。此次编辑范围为 `src/pages/settings/{index.tsx,settings.css,translations.ts}`、`src/components/layout/AppLayout.tsx` 和 `src/App.tsx`。未修改编排状态，未暂存、提交或推送。

## 验证结果

| 实际命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0。 |
| `pnpm build --outDir (Join-Path $env:TEMP 'opspub-step13-settings-build')` | 退出码 0，最终产物为 `index-B0O4qv7V.js` 和 `index-DTFN5QOQ.css`。Vite 提示输出目录位于仓库外，且有分块超过 500 kB。 |
| `node .agent-pipeline/.step-13-browser-fixture.cjs` | 最终退出码 0。亮暗主题 × 1100×700、1440×900，每组 56 项，共 224 项通过。 |
| `git diff --check -- src/App.tsx src/components/layout/AppLayout.tsx src/pages/settings` | 退出码 0。Git 提示工作副本换行可能转换。 |

浏览器使用独立 Edge 配置、回环静态服务和合成 Tauri IPC。四组均验证了公共栏内的 18 个分区及点击对齐、手动滚动、折叠恢复、主题与系统联动、旧终端主题映射、英文界面、刷新后的配置恢复、保存失败提示与回滚、设备网卡读取失败及重试、已配对设备、备份存储端和 Copilot 往返。运行记录中没有页面异常或外部页面请求。测试脚本前两轮修正了 Ant Design 弹窗选择器及终端色卡的文字匹配，最终四组完整重跑。

截图在 `%TEMP%/opspub-step13-settings-evidence-K41EdN/`，每组包含设置首页、外观和终端样式。临时脚本已移出工作树，可在仓库根目录运行 `node (Join-Path $env:TEMP 'opspub-step13-settings.cjs')`。脚本复用同一临时目录中步骤 12 告警验收的 Edge 驱动部分。

## 未验证项

当前会话无项目任务系统，采用隔离浏览器测试。已从源码对照原型分区和色卡，未生成原型镜像截图。Windows 原生 Tauri/WebView2、真实应用重启、系统登录启动、实际 SSH 终端渲染、真实配对和备份读写未执行。设备和备份验证限于已有入口、合成数据及错误显示。

已参考 `ui-frontend`、`theme-system`、`store-management`、`i18n-development`、`test-development` 和 `task-tracker`。

## 独立验收 B1 返工

- `docs/step-13-review.md` 记录了系统自启已开启、`ui.auto_start=false`，且配置晚于系统插件返回时的方向错误。应用与设置页现在通过 `src/store/settings.ts` 的 `loadSettings` 共用在途配置读取。共享读取完成后才解锁依赖它的偏好控件，避免应用启动期间的旧快照撤销已保存的语言切换。
- 设置页在配置回填后才应用成功读取的系统自启状态。初始化、保存期间均禁用自启开关与托盘联动控件。系统状态读取失败时保留已读配置，提示错误并禁用自启操作。
- 自启保存等系统操作与 `ui.auto_start` 写入均成功才更新开关。配置拒绝时撤销已完成的系统操作，开关保持原值。撤销失败时重新读取系统状态，读取也失败则禁用开关并提示。此轮涉及 `src/App.tsx`、`src/store/settings.ts` 和 `src/pages/settings/index.tsx`。

| 实际命令 | 返工结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 退出码 0。 |
| `pnpm build --outDir (Join-Path $env:TEMP 'opspub-step13-settings-rework-build')` | 退出码 0。产物 `index-Bmkrdkdr.js`、`index-DTFN5QOQ.css`。仍有仓库外输出目录和分块体积提示。 |
| `node .agent-pipeline/.step-13-startup-rework.cjs` | 退出码 0。亮暗主题 × 1100×700、1440×900，每组 88 项，共 352 项通过。包含原 56 项和新增 32 项竞态及错误回归。 |
| `git diff --check -- src/App.tsx src/store/settings.ts src/pages/settings/index.tsx` | 退出码 0。Git 提示工作副本换行可能转换。 |

竞态测试分别暂扣配置和系统状态的 IPC 响应，交换释放顺序，并让配置值与系统状态相反。断言两种顺序下加载期零启停调用，晚到的持久化托盘值生效，加载后首次点击的启停方向正确。还覆盖语言保存、系统状态读取失败、插件写入失败、配置写入失败后的系统及 UI 回滚、保存期间防重入及失败后重试。四组最终截图位于 `%TEMP%/opspub-step13-settings-rework-evidence-FuSLRU/`。临时夹具已移出工作树，从仓库根目录运行 `node (Join-Path $env:TEMP 'opspub-step13-startup-rework.cjs')`，使用同一临时目录中的原设置和告警浏览器夹具。

原生 Windows 自启和托盘继续待实机验收。独立报告中的主题双写和模型弹窗英文文案仍为已知非阻断项。此次未编辑编排状态，未暂存、提交或推送。返工参考 `bug-detective`、`store-management` 和 `test-development`。

## 独立验收 B1-R2 第二轮返工

`docs/step-13-review-round2.md` 的两个反例均来自页面重挂载期间丢失保存状态。此次只修改 `src/store/settings.ts` 和 `src/pages/settings/index.tsx`。Zustand 共享一次自启保存从系统操作、配置写入到回滚或恢复读取的完整状态。保存期间重新进入设置页，仍显示最后一次确认值并禁用自启和托盘控件，跳过可能读到中间值的系统探测。保存或补偿结束后一次更新界面值和可用状态。补偿失败时重读系统状态，重读也失败则保持禁用。

配置中的 `ui.auto_start` 仅作为尚未获得系统状态时的显示值。迟到的配置回填不能覆盖共享的系统确认值。初始化期间重挂载会发起新的系统探测，旧探测结果不能解锁新页面。操作仍使用原 Tauri 插件和配置键。

| 批次或实际命令 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 最终退出码 0。初版使用 `AggregateError`，类型检查发现当前 ES2020 配置不支持，已改为返回错误列表。 |
| `pnpm build --outDir (Join-Path $env:TEMP 'opspub-step13-rework2-build')` | 最终退出码 0，产物 `index-CXivL2yE.js`、`index-DTFN5QOQ.css`。保留工作区外构建目录与分块体积提示。 |
| `remount` | 55 × 4 = 220。两个方向均覆盖在配置失败前及补偿期间重新挂载、锁定和零额外系统操作、补偿结束三方一致，以及下一次点击方向。另覆盖旧初始化结果晚到。 |
| `concurrent` | 46 × 4 = 184。两个方向均在成功保存中尝试第二次点击，确认拦截。首次提交后释放旧配置快照，界面值保持正确。随后接受反向保存，再次重挂载仍保持锁定，最终两次提交严格按顺序落地。 |
| `matrix` | 46 × 4 = 184。两个初始状态 × 两种返回顺序均验证初始禁用、系统优先、托盘设置恢复与首次点击方向。 |
| `errors-final` | 61 × 4 = 244。覆盖系统与配置读取失败、插件保存失败、配置失败补偿、补偿失败重读、双失败锁定及重试。 |
| `language-final` | 26 × 4 = 104 项观察断言。四组均再次复现 N1，不计入 B1-R2 功能通过。 |
| `git diff --check -- src/store/settings.ts src/pages/settings/index.tsx` | 退出码 0。仅有工作副本换行提示。 |

B1-R2 四个批次合计 832 项断言通过，覆盖亮暗 × 1100×700、1440×900。最终 20 份诊断均无页面异常或外部请求。首轮 C 盘空间耗尽，移至 D 盘后重跑，并对两组 Edge DevTools 启动超时的视口单独复跑。N1 夹具也补上了刷新过渡期间的空值防护，再完整运行。上述早期失败属于夹具运行或落盘，未计入通过数。

证据和可复跑脚本位于 `D:/itemWork/opspub-step13-rework2-evidence/`。在仓库根目录执行 `node 'D:/itemWork/opspub-step13-rework2-evidence/run.cjs' <批次>`，复用第二轮验收的隔离浏览器驱动。N1 最终证据位于 `D:/itemWork/opspub-step13-rework2-n1-evidence/language-final/`。各批次目录包含截图、IPC 状态和逐视口诊断。N1 应在收尾阶段单独处理。在途语言保存跨挂载后，持久化值是 `en-US`，而 `html.lang` 仍是 `zh-CN`。建议通用偏好写入与配置回填采用同一跨挂载顺序规则，统一解决这个非阻断问题。

建议将 B1-R2 标为实现验证通过，进入独立复核。当前会话无项目任务工具，原生 Tauri/WebView2、实际登录自启和托盘、永久 IPC 挂起以及跨窗口并发仍未验证。全部测试使用合成配置和隔离浏览器。未写入编排状态，未暂存、提交或推送。

## 本地提交交接 · 依赖阻断

第三轮裁决 `docs/step-13-review-round3.md` 通过 B1-R2 专项复核。交接时 `opspub` 仍指向 `34bddf3284f46d0931f29243f1c7a163b1ed0236`。按首轮实现前记录和各轮实际改动，从 `git archive HEAD` 构造隔离快照，使用独立索引核对候选缓存差异。候选仅包含 `src/App.tsx`、`src/components/layout/AppLayout.tsx` 的设置全宽行、`src/pages/settings/index.tsx` 的本步片段、`src/pages/settings/settings.css`、`src/pages/settings/translations.ts` 和 `src/store/settings.ts`。设置页的既有配色片段、设备组件、全局样式、主题、版本及其他工作区改动未进入候选。

| 实际验证 | 结果 |
| --- | --- |
| 独立索引 `git diff --cached --name-status` / `git diff --cached --check` | 缓存仅有上述六个路径，检查退出 0。 |
| 在隔离快照运行 `pnpm build --outDir 'D:/itemWork/opspub-step13-handoff-3Cxdrt/build'` | 退出 0，包含 `tsc` 和 Vite。产物为 `index-BLC9dXh5.js`、`index-C0sOyRjI.css`。 |
| 隔离快照与第三轮验收产物的合成 IPC 浏览器对照 | 两个视口 1100×700、1440×900，亮转暗和暗转亮共四组。隔离快照四组均因标题对比度不足失败，比例分别为 1.10:1 和 1.00:1。第三轮产物复跑四组 32 项断言通过，比例分别为 16.30:1 和 17.85:1。两边均无页面异常或外部请求。 |

已证实的依赖是 `src/styles/variables.css` 中六个皮肤选择器加上所属 `data-theme` 约束，以及 `src/theme/antdTheme.ts` 中 `getAntdTheme` 对不匹配皮肤返回基础主题的判断和对应 `SKINS` 导入。已提交的 `HEAD` 仅按 `data-skin` 覆盖 CSS 背景并无条件套用 Ant Design 皮肤覆盖。独立快照中，保留 `sky` 切暗会让白字留在白色卡片及控件上；保留 `obsidian` 切亮时深色标题、控件文字及其背景都为 `rgb(15, 23, 42)`。这两处运行时约束属于实施前已存在的工作区改动。本轮对照未单独验证仅加两处约束后的完整结果。

没有创建提交，故无新提交哈希或提交文件。真实索引为空，源码和编排状态未编辑。独立索引、`candidate.patch`、计算颜色记录和截图位于 `D:/itemWork/opspub-step13-handoff-3Cxdrt/`。建议先将两处明暗族约束单独审定并纳入提交基线，再用上述六路径候选重新验证后提交第 13 步。未推送。

## B-THEME-02 候选修复与复核交接

以 `docs/step-13-theme-dependency-review.md` 指定的 `reviewed.patch` 为唯一候选基线，核对 SHA-256 为 `c2764ff3bc2d04fa8574b9d4d95eeee9b8a38c96237a21707da202e04b8e4c0c`。在 D 盘从 `34bddf3284f46d0931f29243f1c7a163b1ed0236` 归档构建干净快照。相对已评审补丁，仅改动 `src/pages/settings/index.tsx` 的 `ToggleRow` 一行中两处文字类名。开机自启与自启后收进托盘共用该组件，行标签使用 `--text-primary`，说明使用 `--text-secondary`，原禁用逻辑及透明度保留。八个候选路径和此前审查的 CSS 与 Ant Design 明暗族约束保持一致。

精确补丁为 `D:/itemWork/opspub-step13-theme-fix-AyiWzF/candidate.patch`。SHA-256 为 `ef4d6ed337f80ff0eab881a74974d0a14ef230b5d03d6ecb117c2ee3c8b193d7`。同目录的 `startup-text-tokens.patch` 为相对 `reviewed.patch` 的单行增量。第二份干净 HEAD 快照执行 `git apply --check --whitespace=error`、正向重放及反向检查均成功，616 个路径与构建快照逐字节一致。真实 Git 索引为空。回执写入前复核 668 个工作树路径的指纹，包含源码、评审报告和 `state.json`，全部一致。

| 批次 | 实际结果 |
| --- | --- |
| 在证据目录的 `snapshot` 执行 `pnpm build --outDir 'D:/itemWork/opspub-step13-theme-fix-AyiWzF/build'` | 退出 0，包含 `tsc` 和 Vite。产物 `index-76zCQDe8.js`、`index-B2b-TR5J.css`。保留仓库外输出目录及分块大小提示。 |
| `labels` | 14 × 4 = 56 项通过。两行开关均已就绪、可操作且不透明。1100×700、1440×900 下，亮色行标签均为 17.85:1，说明均为 6.32:1；暗色行标签均为 16.30:1，说明均为 6.96:1。四组全部达到 4.5:1。 |
| `cross` | 175 × 4 = 700 项通过。六款皮肤显式跨明暗族、刷新和返回。 |
| `system` | 217 × 4 = 868 项通过。六款皮肤跟随合成系统偏好跨族、刷新和返回。 |
| `same` | 127 × 4 = 508 项通过。六款同族皮肤、显式模式及刷新保持。 |

四批均退出 0，16 份诊断无页面异常或外部请求。从仓库根目录可执行 `node 'D:/itemWork/opspub-step13-theme-fix-AyiWzF/<批次>/run.cjs'`，复跑脚本、截图和测量 JSON 位于同一证据目录。全部使用 D 盘临时目录、独立 Edge 配置、回环静态服务和合成 Tauri IPC。没有项目任务工具，未启动原生应用或接触真实系统自启配置。未验证原生 WebView2、实际登录自启、禁用态文字对比度或全设置页可读性。N1 与之前的非阻断问题继续保留。

建议独立复核此 SHA-256 对应的精确候选，再按批准范围暂存。此次仅生成仓库外候选及验证证据，并更新本回执。未暂存、提交、推送或编辑编排状态。已参考 `git-workflow`、`theme-system` 和 `test-development`。
