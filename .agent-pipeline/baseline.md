# 第 00 步 · OpsPub 新版双轨工作区迁移基线

结论：静态基线核对通过，建议进入第 01 步。现有路由表覆盖 17 个模块，新版原型的业务域映射覆盖同一组键。以下运行步骤均**未实测**，表中“源码”表示已观察到入口、处理函数或接口，不代表功能已经通过验收。

工作树为 `opspub`，HEAD `0c1f72f`，包含当前未提交功能。新版参照文件为 `docs/ops-prototype-direction2-workspace.html`，读取时 SHA-256 为 `C79EDF954881E8CBFCB0C4429AAE0EE7154AA8CA38F9E80F0A2B9D1DAA52A86D`。旧入口来自 `src/Router.tsx:51–101`、`src/navigation/modules.ts` 和 `src/components/layout/NavRail.tsx`。保留当前 HashRouter 路径及已有路由参数，主轨和二级入口用当前路径派生高亮。原型参考行号取自上述文件快照。

## 入口与验证清单

| 模块 / 当前入口 | 新入口及原型 | 源码依据 | 运行验收步骤及前置条件（未验证） |
|---|---|---|---|
| 服务器 · `#/servers`（默认） | 主机运维 → 服务器资产；添加入口、收藏/最近/分组/标签子导航；2568、3212 | `src/pages/servers/index.tsx:193,276,301,311,830,945` | 准备两台隔离资产及脱敏导入样例。新增、编辑、导入后刷新检查实际记录。点分组、标签、收藏并对比列表；收起恢复选择。对同一行直达终端、SFTP、工作台和预选批量，核对服务器 ID。 |
| 终端 · `#/terminal` | 主机运维 → 远程终端；活跃会话子导航；2647、7822 | `src/pages/terminal/index.tsx:149,236,282,337,439,611` | 两个测试会话。直达目标，检查会话切换、普通终端输入输出、分屏和回到页面后的连接；明确关闭后应移出会话列表。避免把导航快捷键送入终端输入。 |
| 工作台 · `#/workbench` | 主机运维 → 主机工作台；受控主机及模块子导航；2704、3579 | `src/pages/workbench/index.tsx:79,131,149,209,245`，`src/pages/workbench/components/WorkbenchSidebar.tsx` | 准备不同别名的测试主机，从服务器直达并核对概览、日志、文件等所选主机。切换工作台内模块及返回，观察右侧更新和状态。 |
| SFTP · `#/sftp` | 主机运维 → SFTP 文件传输；文件路径与传输进度；2746、5700、38612 | `src/pages/sftp/index.tsx:351,468,564,904`，`src/store/sftp-transfers.ts`，`src/components/layout/SftpTransferWidget.tsx` | 在隔离目录上传小文件、传输中切页、回到 SFTP 后确认任务走完且目录刷新正确。下载后在本地核对字节；验证双栏及原会话保留、取消与失败提示。 |
| 数据库 · `#/database` | 主机运维 → 数据库工作台；连接树、数据源分类；2794、6259 | `src/pages/database/index.tsx:18,71`，`src/pages/workbench/views/DatabaseView.tsx:311,404,428,711,733,885` | 临时 SQLite 库和已有连接副本。点连接、库、表，检查右侧结果及分组，运行只读查询、选择导出路径，检查文件内容；无效连接应给出错误。外部库需测试实例。 |
| 批量 · `#/batch` | 自动化 → 批量；2858、7343 | `src/pages/batch/index.tsx:59,83,145,153`，服务器页 945 | 用隔离目标验证从服务器批量入口预选、逐机结果和超时错误。执行用已授权的只读操作，核对目标与结果关联。 |
| 部署 · `#/deploy` | 自动化 → 部署；2858、7621 | `src/pages/deployment/index.tsx:95,123,130,159,209,215` | 用隔离目标和样例制品；检查创建/编辑后记录及历史、日志反馈、健康检查状态和失败提示。若测试环境没有部署授权或实例，将执行与回滚标未验证。 |
| AI 助手 · `#/copilot` | AI 智维 → 助手；任务/历史区；2920、8439、39395 | `src/pages/copilot/index.tsx:199,206,337,408,582,606,636,774` | 准备隔离对话记录、确定性模型端点或授权测试。验证选机后请求 ID 与正确目标一致、流式过程和历史切换。从通知携带 `approvalId` 打开对应审批。 |
| MCP · `#/mcp` | AI 智维 → MCP；2920、9202 | `src/pages/mcp/index.tsx:55,103,116,153,200` | 用隔离进程及配置副本，验证接入状态、连接测试、令牌作用域、撤销反馈和注入配置目标。使用测试令牌，截图及报告脱敏。 |
| 技能 · `#/skills` | AI 智维 → 技能库；2920、9259 | `src/pages/skills/index.tsx:34,83,110,156,166,189` | 验证内置来源、关键词筛选及匹配测试。用户技能的新建、编辑、删除使用隔离配置和专用条目，核对重开后结果。 |
| 巡检 · `#/inspector` | AI 智维 → 巡检；2920、9512 | `src/pages/inspector/index.tsx:140,154,171,228` | 用受控测试资产，验证选机、运行结果与目标关联、报告/计划入口、失败提示和现有配置读取。 |
| 服务凭据 · `#/credentials` | 安全治理 → 服务凭据；列表与详情；3043、7228、27811 | `src/Router.tsx:58` 实际路由 `src/pages/credentials/ServerCredentialsPage.tsx:46,63,73,82,209` | 用专用测试凭据，验证列表状态、添加/验证后的托管状态以及忘记后的失效，确认 UI、日志、截图无明文。不要把凭据忘记操作用于已有用户记录。 |
| 敏感库 · `#/sensitive` | 安全治理 → 敏感库；3043、10843 | `src/pages/sensitive/index.tsx:70,117,145,181,198` | 用合成内容，验证扫描、处理状态、批量操作和脱敏导出；核对刷新恢复。 |
| 告警 · `#/alerts` | 主轨通知 → 告警中心；2441、11078 | `src/pages/alerts/index.tsx:105,129,231,266,324`，`src/components/layout/header/AlertBell.tsx:53–62` | 放入隔离告警与测试通道，检查通知计数、读状态、跳转、规则保存。通道测试仅用隔离接收端。保证待审批通知可落到指定审批。 |
| 审批 · `#/security` | 安全治理 → 安全闸门；3043、11346 | `src/pages/security/index.tsx:67,96,144,158,172`，`src/pages/copilot/index.tsx:582,606` | 用独立测试审批记录，逐条验证锁定、通过、拒绝、超时，核对目标与审计回执。策略与执行保持已有授权约束。 |
| 审计 · `#/audit` | 安全治理 → 审计；3043、11912 | `src/pages/audit/index.tsx:117,216` | 用隔离审批/操作记录验证筛选、分页、详情和导出。确认审批跳转及裁决审计关联，导出文件无明文。 |
| 设置 · `#/settings` | 主轨设置 → 四组二级设置项；3097、12122 | `src/pages/settings/index.tsx:132,152,184,214,224,394,490`，`src/App.tsx:62` | 点各设置项检查右侧定位，滚动更新左侧活动项。从 AI 模型入口直达并返回。改测试主题和语言后重启应用，核对已保存配置和主题切换。 |

## 静态发现与边界

- 原型 `TAB_TO_DOMAIN_MAP`（39159）是一级入口基准。一级轨宽 56px（2407），二级栏宽 220px（2506、39257）。告警在通知入口下直达，设置有独立二级组。二级栏各模块子项见 2568–2794、19143。
- 顶部真实版本、AI 锁、皮肤、窗口拖拽和窗口按钮应继续接现有实现。全局搜索复用 `CommandPalette`，其现有范围为 17 个模块。原型搜索文案还提到主机和命令，本步应按实际能力呈现。原型数字 1–4 和 Ctrl+B 快捷键需要检查输入框、编辑器及终端交互冲突。
- 原型运维空间切换（39430）只关闭弹窗和提示；AI 历史任务、环境知识库（39395、39413）使用预设输入和主机。现有 AI 对话历史可迁移，真实空间隔离及独立知识库按已确认方案留在本次范围外。
- 技能页既有团队知识库同步提示和 Runbook 空态（193、195）。SFTP 服务器列表失败时现有页面走静态示例降级（236），不能将示例数据显示用于上传功能通过判定。凭据页应以实际路由组件为准，不能凭原型的凭据详情示例推定已有服务级凭据能力。
- 当前连接存活与 UI 状态分开。终端和 SFTP 调用后端恢复会话，活动标签、分屏和路径存在页面本地状态（终端 99–107，SFTP 162–179）；切路由后的具体还原程度要实测。后台传输全局组件当前挂在 `AppLayout`，跨页进度与会话实测建议在第 03、04 步完成。
- Windows 默认/最小窗口静态配置为 1440×900 / 1100×700（`src-tauri/tauri.conf.json:16–19`），四组主题与尺寸组合都需在窗口真实打开后核对。数据库的 `DatabaseView` 同时被工作台复用，外层挂载调整须回归工作台实例。
- 当前环境缺少编排所列项目任务系统接口。第 00 步没有运行依赖，后续首次 UI 启动验收前复查工具，实测条件不齐时列出能验证的证据与缺口。第 00 步没有项目构建、界面或远程实测，也没有提交。

## 工作区重叠与第 01 步文件边界

- 公共工作区最直接重叠是 `src/components/layout/AppLayout.tsx`，当前已有 SFTP 全局传输组件导入与挂载（24、165）；依赖的 `SftpTransferWidget.tsx`、`src/store/sftp-transfers.ts` 在本快照未跟踪。保留该功能，提交第 01 步前用工作树前后差确认其原有补丁未被卷入。两者若无法独立提交，提请总控裁决。
- 第 02 步已有服务器策略显示改动（`src/pages/servers/components/AiPolicyBadge.tsx`、`lib/serverMeta.ts`）。第 04 步已有 SFTP 上传页面、前端 API/Store 及多个 Rust 文件改动（`src/pages/sftp/index.tsx`、`src/lib/api/sftp.ts`、`src/store/index.ts`、`src-tauri/src/{commands/sftp.rs,services/sftp.rs,services/sftp/,models/mod.rs,lib.rs}`）。第 09 步与 AI 页重叠。第 12 步与审计页、告警页和样式重叠。第 13 步与设置页、`DeviceSettings.tsx`、`src/styles/{global,variables}.css`、`src/theme/antdTheme.ts` 重叠。已有版本更新和发布改动另见 `VersionBadge.tsx`、`UpdateModal.tsx`、发布 workflow、scripts 与 release-notes 文件。新版原型、旧原型 diff、备份和编排目录都已存在或属于基线资料。
- 第 01 步推荐只改：`src/components/layout/AppLayout.tsx`（外壳接入）、`src/components/layout/NavRail.tsx` 或新增工作区导航组件、`src/navigation/workspace.ts`（业务域与默认模块映射）、必要时 `src/navigation/translations.ts`（复用中英双语机制）、公共工作区私有样式文件。二级栏先给当前模块预留接入位，具体页面过滤、终端会话、文件路径、数据库树和设置锚点分别由对应后续步骤提供。若现有路由能满足同一路径进入，`src/Router.tsx` 可不改。避免把本步外壳样式与已改动的全局主题文件混在一起。
- 导航状态从 `useLocation().pathname` 派生，保留 `location.state.serverId/serverIds/from` 与 `approvalId` 查询参数。二级栏收起状态停在外壳。右侧保留同一个 `Outlet` 和现有全局浮层，尤其不要随折叠或切域给外壳及页面添加会强制重挂载的 key。
- 建议第 01 步独验覆盖所有 17 个模块的静态映射、告警和审批深链、前进/后退、顶部原有功能、终端可获得高度，以及最小窗口下壳层的溢出。涉及真实连接的模块联动由各模块测试负责。

状态：第 00 步交付。其余步骤仍待总控安排。已参考 `project-navigator`、`task-tracker`。
