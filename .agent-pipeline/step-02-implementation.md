# 第 02 步 · 服务器资产迁移

已交付，待独立验收。当前未发现已证实的代码阻断，也没有需要扩大权限或修改接口的事项。Windows 界面与真实接口流程待实测。

## 改动范围

| 文件 | 改动 |
| --- | --- |
| `src/pages/servers/index.tsx` | 将系统视图、业务分组和标签放入公共二级栏。内容区保留默认收起的分组面板，沿用用户之前设置的宽度。两处共用选中状态与排序。保留服务器新增、编辑、Windows 接入、三种导入入口、SSH 直达和原有行操作。 |
| `src/pages/servers/components/ServerGroupPanel.tsx` | 二级栏采用与原型对应的紧凑样式、系统视图与业务分组、标签快捷过滤。内容区可继续使用分组菜单与拖拽。重置会同步清空搜索、分组、标签、系统、状态和策略筛选。 |
| `src/pages/servers/components/ServerToolbar.tsx` | 接入分组面板、单行/换行和操作列显示方式切换。状态筛选依据已取得的探测结果，未探测主机只出现在全部状态中。 |
| `src/pages/servers/components/ServerRowActions.tsx` | 连接主按钮始终可见。平铺用图标与悬停提示，折叠用菜单，沿用原操作处理与 RDP 可用条件。默认根据表格实测可用宽度切换，用户可选择平铺或折叠。 |
| `src/pages/servers/servers-workspace.css` | 本步的侧栏、标题操作区、表格吸顶、长文本和窄宽度样式使用工程已有主题令牌。 |

参考原型的二级栏结构和资产页（2567、3210、3373、3476、3490）。新增、编辑表单及导入对话框复用现有实现。保留 Windows 接入向导及 RDP 支持。二级栏折叠由公共工作区控制，筛选状态仍在服务器页面。服务器保存、导入、连通性探测和会话路由沿用已有接口，Rust、IPC、数据结构和凭据存储没有本步改动。原有 `AiPolicyBadge.tsx` 和 `serverMeta.ts` 的工作区变更不在本步提交范围。

## 验证记录

| 命令或检查 | 实际结果 |
| --- | --- |
| `pnpm.cmd exec tsc --noEmit` | 退出码 0，无错误输出。 |
| `pnpm.cmd build` | 退出码 0，Vite 7.3.1 构建用时 45.05 秒。有既有大分块体积警告。原始日志位于本目录的 `step-02-build.log`。 |
| Node 与 TypeScript 隔离检查 | 使用真实页面模块和回调，替换 React hooks、UI 组件、路由和服务器 API。使用 3 台合成资产验证列表、分组、标签交集、两处面板同步及收起状态、重置、收藏、平台、换行、操作列模式保存。确认终端、SFTP、工作台三个跳转携带相同目标服务器 ID，编辑打开指定记录，三种导入项打开相应对话框。退出码 0。 |
| `git diff --check -- src/pages/servers/index.tsx src/pages/servers/components/ServerGroupPanel.tsx src/pages/servers/components/ServerToolbar.tsx src/pages/servers/components/ServerRowActions.tsx` | 退出码 0。Git 提示 LF 会按其 Windows 工作树设置转换为 CRLF。 |

隔离检查覆盖真实页面处理函数，Windows WebView2 尺寸、主题、滚动、焦点、拖拽、表头吸顶、真实新增/编辑保存、导入读写、错误反馈及 SSH 直连尚未验证。当前工具目录无项目任务系统启动接口，未启动桌面应用，也没有在真实服务器或用户资料上执行操作。可在 Windows 环境按通用验收清单用隔离资产验证。已参考技能 `ui-frontend` 和 `theme-system`。

## 首轮返工 · 跨分组保留批量勾选

表格仅接收当前可见资产，因此启用 Ant Design 的 `preserveSelectedRowKeys` 保留其他组的勾选。资产列表成功刷新后，仍按返回的全量资产清理已经失效的 ID。

- 通过 `node` 加载真实服务器页与 Ant Design 的 `useSelection`，在合成资产上调用复选框处理函数。关闭该配置时，依次在 A、B 组勾选 101 和 202 得到 `[202]`。启用后获得 `[101,202]`，批量条计数为 2，跳转 `/batch` 携带 `state.serverIds=[101,202]`。
- 隔离运行验证单项取消、当前组全选与取消、全局清空，均通过。通过导入后的刷新回调模拟全量资产删除 202 时，仅去掉失效的 202，并保留当前组不可见的 101，跳转预选为 `[101]`。
- `pnpm.cmd exec tsc --noEmit` 与 `git diff --check -- src/pages/servers/index.tsx` 均退出 0。Git 提示按工作树设置转换换行符。Windows 界面点击与真实 API 刷新待实测。本轮参考 `bug-detective`、`test-development`。
