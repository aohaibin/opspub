# OpsPub Step 13 提交候选独立复核 · 主题依赖

**裁决：当前提交候选仍阻断，建议暂不提交。** 指定的六个 CSS 明暗族选择器约束，以及 Ant Design 的 `SKINS` 导入与 family guard，已经独立验证能消除交接记录中的持续跨族背景覆盖；但「六路径候选 + 这两处依赖」仍有一处经干净 HEAD 对照确认的亮色文字回归。启动项的可操作标签只剩 **1.49:1** 对比度，不能把主题矩阵通过等同于候选整体通过。

日期：2026-11-23。分支 `opspub`，基准 HEAD `34bddf3284f46d0931f29243f1c7a163b1ed0236`。本轮只做提交候选检查和报告，未修改原工作树源码、编排 state 或真实 Git index，未提交或推送。

## 复核对象与证据定位

证据根目录 `<E>`：`D:/itemWork/opspub-step13-theme-dependency-20261123/`。

先读通用清单 `.agent-pipeline/review-checklist.md`、`.agent-pipeline/step-13-implementation.md` 的实现、返工及「本地提交交接 · 依赖阻断」尾段，并阅读前三轮独立报告。另读取交接目录 `theme-candidate` 和 `theme-approved` 下全部 16 份颜色、失败及诊断 JSON，保存于 `<E>/prior-evidence-read.json`。旧记录中的裸候选跨族标题对比度为 1.00:1、1.10:1；旧通过产物的结果只作为对照材料，不计入本轮通过数。

从当前 HEAD 重新 `git archive`，在仓库外构造快照，只应用 `D:/itemWork/opspub-step13-handoff-3Cxdrt/candidate.patch`，再加本轮指定的主题依赖。候选原补丁保持逐字节复制，没有从脏工作树覆盖整份源码。两处依赖只取：

- `variables.css`：六个皮肤选择器分别增加所属 `data-theme`，以及对应的两行说明注释。
- `antdTheme.ts`：`SKINS` 运行时导入、明暗族不符时返回基础主题的判断，以及说明注释。

没有纳入 `variables.css` 顶部额外 surface 令牌，或 `antdTheme.ts` 中 success、皮肤品牌色及布局底色等其他改动；也没有带入全局样式、设备设置、版本等其他工作树变更。

精确补丁均在仓库外：

| 文件 | SHA-256 |
| --- | --- |
| `<E>/candidate-original.patch` | `bba795067f70737b3e467ddba8e731e4ca87f1fed15e3e4e3c21d8ebfa5e04e6` |
| `<E>/theme-dependencies.patch` | `3c00e3b69a7ac5f3d33e6e77421332cc23f6dd25682525fbd472ed59e9f72806` |
| **实际审查的合并候选 `<E>/reviewed.patch`** | **`c2764ff3bc2d04fa8574b9d4d95eeee9b8a38c96237a21707da202e04b8e4c0c`** |

依赖补丁增加 12 行、删除 9 行；没有颜色值修改。把合并补丁在第二份 HEAD 快照重放，`git apply --check`、`--whitespace=error` 及反向检查均成功。616 个路径逐字节比较与被构建快照一致，差异仅为原六路径加两个依赖路径，见 `<E>/static-check.json`、`manifest.json`。首次拼接注释产生的混合换行已在最终构建前对齐 Git 重放字节，记录于 `snapshot-line-ending-alignment.json`。

## 阻断 B-THEME-02：亮色卡片迁移遗漏启动标签的文字配色依赖

**两个亮色视口均复现，并已在独立构建的干净 HEAD 上做正向对照。** 不是禁用态，也不是颜色过渡期间的采样。

复现步骤：

1. 加载精确候选构建，视口分别为 1100×700、1440×900，选择亮色 `sky`；合成自启系统及配置均为 `true`，等待初始化完成。
2. 滚到「启动行为」，测量第一个可操作开关旁的「开机自启」标签。该开关 `disabled=false`，标签仍为 `text-slate-300`，实际 sRGB 为 `202,213,226`；新卡片背景为白色。
3. 用同一 IPC、同一浏览器驱动及视口测试干净 HEAD 构建。标签颜色相同，但原卡片背景为 `rgb(15,20,28)`，文字可辨认。暗色对照也执行，候选暗色未出现该低对比度问题。

| 场景 | 干净 HEAD 标签 / 背景对比度 | 精确候选标签 / 背景对比度 |
| --- | --- | --- |
| light · 1100×700 | 12.42:1 | **1.49:1** |
| light · 1440×900 | 12.42:1 | **1.49:1** |
| dark · 1100×700 | 12.42:1 | 12.01:1 |
| dark · 1440×900 | 12.42:1 | 12.01:1 |

本轮对小号可操作标签采用 4.5:1 的检查阈值；亮色候选明显低于该阈值。已实际查看 `<E>/label-comparison-sheet.png` 及主题联系表：亮色启动标签接近白色背景，影响用户辨认开关含义。

源码与现象对应：候选 `snapshot/src/pages/settings/index.tsx:576–584` 把原深色 `SettingCard` 改为 `ops-settings-card`，而 `snapshot/src/pages/settings/settings.css:78–86` 使用 `--surface-900` 作为背景，亮色下成为白色；候选 `snapshot/src/pages/settings/index.tsx:901–904` 的 `ToggleRow` 标签仍保留固定的 `text-slate-300`。干净 HEAD 的同一标签也使用浅色字，但卡片固定为 `bg-[#0f141c]`。实际运行对照说明，本次背景迁移与被排除的文字配色之间仍有依赖，不能按「标签类名原已存在」将其归为无关旧问题。

直接证据：`<E>/contrast-summary.json`、`labels-reviewed/light-{1100,1440}-label.json`、`labels-head/light-{1100,1440}-label.json`，以及两个目录中的 `*-startup-label.png`。`contrast-review.cjs` 是独立的定向测量入口，`compare-labels.cjs` 对照断言了 HEAD 达标、候选亮色不达标及暗色控制组。两边各 28 项夹具观察断言完成，**这些数字不代表产品通过**。

本轮按请求没有补入其他脏 hunk，也没有改写这个标签。建议实现方另行提取最小必要的文字配色依赖，经复核后重建候选，避免为了修此项整体纳入未审查的配色或全局样式改动。

## 指定明暗族约束的验证结果

以下三批均针对上述同一精确候选，在亮、暗两种初始主题 × 1100×700、1440×900 中运行。每个明暗族都遍历其三款皮肤，因此覆盖 `obsidian`、`graphite`、`amber`、`sky`、`warm`、`aurora` 全部六款。

| 最终批次 | 断言数 | 实测内容 |
| --- | --- | --- |
| `cross` | 175 × 4 = **700** | 保留原皮肤，显式切换到相反明暗族；检查 CSS 表面、卡片、标题、实际 Ant Design 输入框、模式按钮、存储和无横向溢出；刷新后仍正确，再切回原族恢复原皮肤表面。 |
| `system` | 217 × 4 = **868** | 选择跟随系统，模拟 OS 偏好跨族及返回；相反族回退基础主题，返回后恢复皮肤。刷新保持 `system`，系统事件不产生额外偏好写入。 |
| `same` | 127 × 4 = **508** | 六款同族皮肤分别保持其既有背景；显式模式不受相反 OS 偏好覆盖，刷新保留选择，皮肤选中态和 Ant Design 控件均正确。 |

共 **2,076 项断言、36 个皮肤用例组合、144 份状态观察**。12 份最终 diagnostics 的页面异常和外部页面请求均为空；无远程操作或系统自启变更 IPC。最终三批均退出 0，证据在 `<E>/{cross,system,same}/`、各批日志及 `summary.json`。断言包含等待及诊断检查，不等同于不同业务功能数量，也不覆盖上面的标签反例。

跨族后，标题稳定对比度分别为暗色 **16.30:1**、亮色 **17.85:1**，原交接中的持续同色问题未再出现。CSS 表面按所属族生效，实际输入框也到达对应的基础或皮肤颜色。静态模块检查另执行 **16 种参数组合、34 项断言**：两种 resolved 主题 × 未指定、无效、六种皮肤；不匹配时返回同一基础主题对象，同族时保留原品牌色、容器及布局 token 与 algorithm。该检查没有引入其他配色值。

保存 72 张最终主题截图，另保存 8 张 HEAD / 候选标签对照图。已查看 `cross-sheet.png`、`system-sheet.png`、`same-dark-sheet.png`、`same-light-sheet.png` 和 `label-comparison-sheet.png`。在所查状态中未见页面或设置滚动区横向溢出；这不替代所有设置文案的可读性验证。

## 非阻断与保留项

- **切换期间 Ant Design 输入框会短暂经过低对比度颜色。** 首次系统批次在 dark · 1100×700 的 `graphite` 返回时捕获 3.19:1。随后定向采样记录到 `transition: all 0.2s` 和正在运行的 CSS 动画；六次切换的采样中，多次出现低对比度中间色，最低样本约 1.48:1，动画完成后均恢复预期颜色。本轮按短暂过渡体验问题保留，不等同于原来的持续跨族覆盖。见 `system-initial/`、`system-trace/` 和 `transition-analysis.json`。未在 HEAD 复测该过渡，所以不声称它一定为新引入或已经修复。
- 正式矩阵新增了等待实际输入框到达精确预期前景 / 背景颜色的有界检查；持续错误会超时失败。之后完整重跑三批，采用最终日志，未把首轮失败计入通过数。定向 trace 的 202 项也没有叠加到正式矩阵数字中。
- 保留既有语言 N1、主题双写拒绝后的持久化失配和模型弹窗中英文混用。这些来自前三轮报告，本轮未重测，不关闭或重复计为新发现。
- 构建仍提示输出目录在项目外及部分分块超过 500 kB，均为非阻断提示。

## 环境、实际执行与未验证

本会话没有应用项目任务的扫描、登记、查询、启动、停止工具，也没有原生窗口控制工具；Codex 线程 / worktree 工具不作为应用运行工具使用。工具清单与缺口在 `<E>/tools-gap.json`。本轮没有启动 `tauri dev` 或原生应用。

测试使用 Node 24.12.0、Edge 151.0.4129.59、独立浏览器配置和回环静态服务。IPC 使用项目已安装的 Tauri mock；配置、自启状态、存储和刷新恢复全部为合成数据。复用旧夹具的 CDP、鼠标、截图、静态服务驱动，主题矩阵和标签对照由本轮编写。未安装依赖；仅通过 junction 使用现有 `node_modules`。构建、TEMP、TMP、配置目录和证据均在 D:，没有访问真实服务器、凭据、系统启动项、配对或备份。

主要实际命令与结果：

| 执行位置与命令 | 结果 |
| --- | --- |
| `<E>/snapshot`：`pnpm build --outDir '<E>/build'` | 最终退出 0，包含 `tsc` 和 Vite；产物 `index-D35DTo_w.js`、`index-B2b-TR5J.css`。没有将其另算一次独立类型检查。 |
| `<E>/archive-head`：`pnpm build --outDir '<E>/head-build'` | 退出 0，仅用于标签回归对照；见 `head-build.log`。 |
| `node '<E>/static-check.cjs'` | 最终退出 0：精确补丁重放、616 路径比较、八路径边界及模块断言。 |
| 在 `<E>/snapshot` 运行 `node '<E>/review.cjs' cross`、`system`、`same` | 最终各批退出 0，三批合计 2,076 项。 |
| 在对应快照运行 `node '<E>/contrast-review.cjs' reviewed` / `head` | 两边均完成四组测量；`compare-labels.cjs` 确认两组亮色回归。观察脚本退出 0 不表示低对比度被接受。 |

早期夹具记录均保留：候选准备时的注释换行匹配、静态字节比较对换行的处理、中文按钮自动空格以及 IPC 正则转义。旧 `pilot*`、`cross-initial*`、`static-check-initial.log`、`static-check-second.log` 未计入最终通过结果。`cross-before-settle` 是 652 项早期完成矩阵，也未与最终 700 项相加。测试没有通过修改产品源码来迎合断言。

未验证 Windows 原生 Tauri / WebView2、真实应用退出重启、系统登录自启与托盘、原生插件故障和权限、永久 IPC 挂起、多窗口并发，以及真实终端、设备或备份。未重复执行 B1-R2 全量事务反例、全模块迁移验收或无关 Rust 全量检查；第三轮 B1-R2 专项裁决沿用原报告，不在本轮重新关闭。浏览器刷新不等同于原生进程重启。尚未对设置页全部文本、表格、弹窗及所有颜色组合做完整可读性审计。

## 建议与文件保护

**可以接受指定两处明暗族约束的独立验证结果；不能据此批准当前完整候选提交。** B-THEME-02 说明提交边界仍遗漏最小文字配色依赖。建议保持现有编排和提交状态，待实现方补齐并单独复核该依赖后，再验证重新生成的精确补丁。不要用第三轮整个脏工作树产物的通过结果替代提交候选验证。

报告写入前，按本轮开始时的文件 SHA-256 清单核对原有仓库文件、HEAD 和真实 index，全部未变化，包括 `.agent-pipeline/state.json`；见 `before.json`、`preservation-before-report.json`。本轮仓库内唯一新增文件为本报告。最终保护记录在 `<E>/preservation.json`。浏览器和回环服务已随各批结束关闭；未操作其他会话进程或文件。

已参考技能：`check`、`theme-system`、`test-development`、`bug-detective`。
