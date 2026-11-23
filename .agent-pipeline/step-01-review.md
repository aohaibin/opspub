# 第 01 步公共工作区独立验收

日期：2026-11-20。范围仅第 01 步，第 00 步不重做。分支 `opspub`。本次只写此文件，没有改业务代码、暂存、提交、推送或启动项目。

## 结论

**静态审查及隔离处理器检查通过，未发现足以否决本步的已证实新增功能缺陷。建议有条件通过静态交付；Windows 动态验收仍为未验证，不能将本结论表述为本步全部验收通过。**

六域、17 模块入口、路由派生高亮、已有跨页参数、外壳折叠与全局 SFTP 挂载点在源码层面保持一致。AppLayout 候选补丁可以排除既有 SFTP 两行，且与当前最终源码对应。动态缺口应明确留账，由总控决定本步是否保留验收门；这不是已证实的运行失败。

已参考技能：`check`、`ui-frontend`、`theme-system`、`architecture-design`。本次按明确限定的工作区外壳范围检查，未将技能中的全量扫描建议扩展到所有模块。

## 实现方证据先行核对

先读 `.agent-pipeline/state.json`、`review-checklist.md`、`baseline.md` 和 `step-01-implementation.md`，再查实现差异与原型。

实现回报记录了：tsc 退出码 0、前端构建退出码 0、6 域/17 模块映射检查、34 组服务端渲染状态、差异检查和 SFTP 候选隔离。本次没有重复整个构建。仓库的 `.agent-pipeline/` 中只有上述四份文件，没有找到对应命令的原始 stdout/stderr 或截图；因此这些构建结果按“实现方已报告”处理，而不是声称由本次独验重新执行。

实际存在并复核了回报指定的候选文件：

`C:/Users/ao/AppData/Local/Temp/opspub-workspace-stage-0U8iz4/only-step01-AppLayout.patch`

以及该目录中的 `a/src/components/layout/AppLayout.tsx`、`b/src/components/layout/AppLayout.tsx`。

## 本次独立检查与反例

### 导航、返回前进与深链

- `src/navigation/workspace.ts:5-30` 与原型 `docs/ops-prototype-direction2-workspace.html:39159-39177` 的域映射一致，17 个模块键各出现一次。实际加载 TypeScript 模块得到唯一键数量 17；未发现漏掉告警、审批、设置或错误复用凭据页面的情况。路由仍由 `src/Router.tsx:51-101` 的现有页面映射生成，本步未改该文件。
- `src/components/layout/AppLayout.tsx:66-68,111-112` 每次从 `useLocation().pathname` 派生域、模块和面包屑，没有单独维护一个会在浏览器返回后滞留的 active tab。`src/navigation/workspace.ts:55-61` 只对匹配输入做大小写/尾斜线规范化，不重写浏览器地址。未知路径没有伪装成服务器模块高亮。**真实 HashRouter 前进/后退后的画面与滚动：未验证。**
- 有区分度的深链反例：进入 `/copilot?approvalId=42` 或带 `state.serverId` 的 `/terminal`、`/sftp`，以及带 `state.serverIds` 的 `/batch` 后，再点当前二级入口。独立加载真实 `WorkspaceNavigation`，调用四个当前 Link 的 onClick，四者均 `preventDefault` 且每组仅一个 `aria-current=page`；源码 `WorkspaceNavigation.tsx:112-121` 因而不会在这条点击路径中以纯 pathname 冲掉 query/state。`AppLayout.tsx:77-81` 同域一级入口也提前返回，不导航。这是处理函数检查，不是持有真实 SSH 会话的界面实测。
- 现有参数消费仍在：终端 `src/pages/terminal/index.tsx:92-94`、SFTP `src/pages/sftp/index.tsx:122-124`、批量 `src/pages/batch/index.tsx:30-33`；审批 query 解析在 `src/pages/copilot/index.tsx:426-440`。本步没有截取后重新构造这些 state。跨模块正常入口本来没有隐式继承所有上一页 state 的契约。

### 折叠、槽位与窄布局

- `AppLayout.tsx:72-74,168-190` 保留一个 Outlet，没有随展开/业务域增加重挂载 key。SFTP 浮窗仍在外壳尾部。`WorkspaceNavigation.tsx:80-84,129` 仅切换 `inert`/CSS 宽度，槽位 target 没有因收起而删除。`WorkspaceSidebarSlot` 在 `WorkspaceNavigation.tsx:11-17` 通过 portal 提供后续接入位。当前没有业务模块使用此槽位，符合第 00 步已确认的本步边界；不能据此宣称服务器分组、终端会话或数据库树迁移已经完成。
- `workspace.css:117-121,209-229,247-251,278-297` 给主体、侧栏和内容设置了 flex 收缩及 overflow；一级轨 56px、二级栏 220px。`workspace.css:2-3` 将头部 52px 同步给 `--app-chrome-height`，与现有终端 `src/styles/variables.css:530-536` 的高度公式相容。未发现本步静态高度公式遗漏头部的问题。
- 最小宽度反例应为 1100×700、英文、二级栏打开、版本处于下载/就绪的较长文案，同时检查窗口按钮、AI 锁和搜索仍可操作；再测关闭侧栏和终端分屏。`workspace.css:351-360` 只对窄窗收紧头部和面包屑，不能用这几条规则推断真实文字及弹层一定不溢出。**上述布局、亮暗主题、portal 实际挂载及终端 ResizeObserver 重测：未验证。**

### 快捷键、焦点与 xterm

- 本次通过 TypeScript 转译加载实际 `AppLayout.tsx`，捕获其注册的 keydown，使用隔离 React hooks、Element.closest 和 document 焦点替身检查八组分支，没有复制实现条件另写一个同构函数。结果：编辑区 Ctrl+B、xterm 数字、弹窗数字均不导航、不折叠、不 preventDefault；普通区域 Ctrl+B 切换一次并在焦点位于侧栏时归还开关；普通数字 2 导航 `/batch`；Alt+2、输入法组合、重复按键均忽略。对应 `AppLayout.tsx:83-109`。
- 限制：替身只证明分支行为；真实 DOM 的 closest 命中、WebView2 inert 焦点约束及 xterm 输入字节没有实测。源代码选择器包含 input、textarea、select、contenteditable、textbox、xterm 和 dialog，不包含所有可能的未来自绘编辑器；后续接入特殊编辑器应重测。
- 既有 Ctrl+K 另有未豁免处理器，见下方非阻断项，不能将本次结果扩大为“所有全局快捷键均避开 xterm”。

### 告警、审批入口及原型示例边界

- `src/components/layout/header/AlertBell.tsx:30-55` 延续真实告警/审批接口、pending 过滤、15 秒刷新和事件监听清理；没有新增硬编码的“2 条告警”假数据。`AlertBell.tsx:105-112` 分别保留 `/copilot?approvalId=...` 和 `/alerts`。`WorkspaceNavigation.tsx:74-76` 把通知入口放在底部主轨，`AppLayout.tsx:159-164` 保留原版本、AI 锁、主题及窗控组件。
- 反例为同时存在活跃告警和待审批：现在可以从同一浮层分别进入审批与告警，而不是强制只能跳第一条审批。但它仍只提供第一条待审批的汇总入口；未发现本步引入新的审批目标选择能力，也不能据计数认为所有审批分支已验收。
- 真实接口失败、到期/拒绝后的刷新、指定审批滚动、点击外部/Escape 关闭、桌面窗口的导航回退：未验证。没有触发真实审批或远程操作。
- 原型的空间切换、知识库和演示任务没有被本步包装成可用能力；顶部搜索文案为“搜索模块”，与现有模块搜索能力匹配。原型通知事件列表与全部已读暂未迁移，实现回报已明确说明；按既定拆分由后续告警步骤验收。

### 既有 SFTP 改动与提交分离

独立读取上述临时 a/b 文件，统一 CRLF/LF 后比较，得到：

| 检查 | 本次结果 |
|---|---|
| a 文件与 `git show HEAD:src/components/layout/AppLayout.tsx` | 完全一致 |
| b 文件与当前 AppLayout 去掉 SFTP import、挂载两行 | 完全一致 |
| b 文件包含 `SftpTransferWidget` | 否 |
| `git apply --cached --check <only-step01-AppLayout.patch>` | 退出码 0，仅检查，没有 apply |
| `git diff --cached --name-only` | 空 |

`AppLayout.tsx:26,190` 仍保留既有浮窗两行，原来未跟踪的 widget/store 仍在工作树。候选补丁本身没有把两行卷入。本次没有对原有 SFTP 页面、API、store、Rust 上传实现做再验收，也没有据静态挂载宣称上传持续性已通过。

建议裁决后提交只包含实现回报列明的六个路径；AppLayout 用此候选逻辑拆分，其余已有脏文件及 SFTP 依赖排除。提交前重新核对候选与最终源码，再做逐路径暂存及 staged 清单检查。此报告证明当前候选可分离，不是对未来实际提交内容的保证。

## 阻断项

**已证实的新增代码阻断：无。**

**验收门缺口：Windows 动态验收未完成。** 本次从可用工具目录查找 `list_project_tasks`、`scan_project_tasks`、`resolve_and_start_task` 及停止接口，均不存在；没有改用本地 shell 自起服务，没有启动或停止临时任务。默认/最小窗口亮暗主题、真实返回前进、终端尺寸与输入、通知审批深链还缺运行证据。如果本步裁决要求这些动态项全部完成，则应保留本步待验，不能以静态检查替代。环境不足没有被归因为运行 Bug。

## 非阻断项与推荐

1. **既有 Ctrl+K 会抢终端按键，运行影响未验证。** `src/components/layout/CommandPalette.tsx:26-36` 对所有冒泡到 window 的 Ctrl/Cmd+K 都 preventDefault，没有检查 xterm、输入框或 defaultPrevented；该文件本步未改，HEAD 中已有同样逻辑。反例：xterm 正在输入 shell 命令时按 Ctrl+K 清除行尾，若事件正常冒泡会打开模块面板。推荐在第 03 步明确终端快捷键契约并做真实字节检查；不作为本步新增回归否决理由。
2. **当前模块 Link 同样阻止修饰键点击。** `WorkspaceNavigation.tsx:118-121` 对 active 无条件 preventDefault，所以 Ctrl/Cmd+单击当前模块也不会按 Link 默认行为打开另一页。隔离检查可直接复现该分支；Tauri 是否需要此浏览器习惯尚未验证。推荐若支持浏览器使用，仅对无修饰的主键点击保留深链，不扩成本步阻断。
3. **证据可复核性仍可提高。** 实现回报的构建和 SSR 有结论但缺原始日志路径；候选补丁放在系统 Temp，未来可能清理。推荐总控在已有记录流程中保留执行日志和动态截图，提交时重新生成/核对候选。勿因此阶段性暂存，也勿提交其他模块 WIP。

## 交付状态

只写入本报告后停止。没有推进下一步；本步是否记录为静态有条件通过、或等待动态验收，由总控裁决。
