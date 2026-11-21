# 第 05 步 · 主机工作台实现回执

**状态**：本批实现完成，类型检查、生产构建和离线浏览器场景通过。工作台入口会调用既有 SSH 执行与验证接口，本步交由总控另开会话独立验收。

已核对 `state.json` 第 05 项、`baseline.md` 工作台条目、`review-checklist.md`，及原型 `docs/ops-prototype-direction2-workspace.html` 第 2704、3579、5160、32186 行附近。当前分支为 `opspub`，HEAD 为 `a2149d0`，上一个提交为 `56fc3fb`。实际工作树差异见下表，原有其他模块改动仍在。

## 实际修改文件

| 路径 | 内容 |
|---|---|
| `src/components/layout/AppLayout.tsx` | 将工作台接入公共全宽内容布局。 |
| `src/pages/workbench/index.tsx` | 沿用服务器列表传入的 `location.state.serverId`，同步顶部选择、监控目标卡片和工具请求；记录每条浏览器历史项的主机，并在普通菜单返回时恢复工作台最近选机。按主机与工具重建视图，清理离开视图时的待验证任务和过期结果。 |
| `src/pages/workbench/components/WorkbenchHeader.tsx` | 可搜索的别名与地址选择、工作台工具历史、SSH 验证、概览自动刷新及告警中心入口。 |
| `src/pages/workbench/components/WorkbenchSidebar.tsx` | 将主机摘要和系统快捷入口接入公共二级栏，保留可折叠机器面板和原业务工具。SSH 状态基于资产记录，耗时来自本页验证响应。 |
| `src/pages/workbench/views/OverviewView.tsx` | 保留现有采样和趋势，对齐原型的概览、仪表盘和监控布局；错误和未采样值可见，支持关闭轮询后手动刷新。 |
| `src/pages/workbench/views/SystemView.tsx` | 共用系统服务、进程、监听端口和防火墙工具视图；监听端口沿用仓库已有的只读 `ss -tulpn` 命令，通过现有工作台 IPC 读取。 |
| `src/pages/workbench/views/DatabaseView.tsx` | 从工作台打开时默认筛选所选主机，独立数据库页仍默认显示全部连接。 |
| `src/pages/workbench/types.ts` | 增补进程、监听端口、防火墙视图标识。 |
| `.agent-pipeline/step-05-implementation.md` | 本次回执。 |

## 验证命令与结果

| 命令 | 退出码 | 证据 |
|---|---:|---|
| `git status -s`、`git branch --show-current`、`git log -1 --format="%ar\|%s" -- <文件>` | 0 | 修改前确认拟改源码没有未提交差异，公共布局最近变更来自第 04 步。 |
| `pnpm exec tsc --noEmit` | 0 | TypeScript 类型检查成功。 |
| `pnpm build` | 0 | Vite 7.3.1 转换 5230 个模块。产物 `dist/assets/index-DPIScRU5.css`、`dist/assets/index-CB-PVDO-.js`。构建提示压缩后的单个 JS chunk 超过 500 kB。 |
| `node "$env:TEMP/opspub-step05-22330a20/run-isolated.cjs" workbench` | 0 | 最终版 Edge 无头运行四组，每组完成 9 项场景。脚本挂载实际 React 应用、HashRouter 和页面，输入与 IPC 响应使用合成资产。 |
| `git diff --check -- src/components/layout/AppLayout.tsx src/pages/workbench` | 0 | 有 Git 的 LF/CRLF 转换提示，未报补丁空白错误。 |
| `git diff --cached --name-only` | 0 | 输出为空。 |

离线记录位于 `C:/Users/ao/AppData/Local/Temp/opspub-step05-22330a20`。可复跑文件为 `run-isolated.cjs`、`workbench-fixture.tsx`，执行日志为 `results.log`。截图为 `step-05-workbench-{light,dark}-{1440x900,1100x700}.png`，均使用生产 CSS。夹具调试中修正了 Ant Design 选机组件所需的鼠标事件、导航完成时机、SSH 记录更新顺序和按钮文本选择，表中退出码为最终执行。

四组均验证服务器资产别名直达 Beta，浏览器前进与后退恢复对应历史目标，跨菜单时共享选机变化后仍回到 Alpha。日志、目录、进程、端口、服务和容器通过模拟 IPC 核对了主机 ID。Alpha 的延迟目录响应和 SSH 错误在切到 Beta 后未进入新视图。还核对了两处侧栏折叠、工作台工具前进后退、概览暂停与手动刷新、模拟 SSH 验证耗时、列表失败重试、RDP 和失效目标空态、数据库入口默认筛选及概览滚动。

## 实现选择与待验

- `state.json` 的第 05 项只有 `scope`，没有独立 `assignment` 字段，本批按派发消息和该范围执行。
- 工作台最近选机和自动刷新开关保存在当前应用会话。开关控制概览打开时的采样，跨菜单离开概览即停止轮询。告警入口进入现有告警中心，规则需在该页选择。主机失效时先显示空态，等待用户重新选择。
- 监听端口使用现有 Linux 命令的文本输出。Windows 工作台概览和系统工具给出平台提示。
- 未验证原生 Windows Tauri/WebView2、真实 SSH、系统凭据管理器、主机指纹确认、真实 Linux 命令输出、服务操作、数据库查询及已有资料兼容性。当前工具目录无项目任务登记、扫描或启动接口，本次使用本地离线网页和模拟 IPC 验证。未启动实际桌面应用或连接真实服务器。
- 参考技能 `project-navigator`、`ui-frontend`、`theme-system`、`store-management`、`test-development`、`check`。本批未暂存、提交或推送。
