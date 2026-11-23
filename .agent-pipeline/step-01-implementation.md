# 第 01 步 · 公共工作区实现回报

结论为实现已交付，待独立验收裁决。范围是应用外壳、路由高亮、公共二级栏入口和顶部/底部全局工具。第 00 步清单已沿用。

- `src/navigation/workspace.ts` 按新版原型登记 6 个业务域和 17 个模块。一级轨切到对应默认模块，同域点击保留当前模块。路径派生一级域、二级模块及面包屑。现有 HashRouter 路由表未改。
- `src/components/layout/AppLayout.tsx` 和 `WorkspaceNavigation.tsx` 接入 56px 一级轨、220px 二级栏、搜索胶囊、折叠和中英文工作区文案。主视图共用原 `<Outlet />`，SFTP 浮窗照旧挂在外壳。版本、AI 锁、换肤、窗控和命令面板继续调用其现有组件。`WorkspaceSidebarSlot` 允许后续模块把二级栏内容放入外壳，同时保留页面本地状态。移除被替换的 `NavRail.tsx`。
- `src/components/layout/header/AlertBell.tsx` 将现有告警通知组件移到底部主轨，继续通过原接口读取真实活跃告警和值守审批计数。浮层持续提供 `/alerts` 和已有的 `/copilot?approvalId=...` 跳转。告警展现为计数摘要，原型的事件列表和全部已读行为留给告警步骤判定。
- `src/components/layout/workspace.css` 限制在外壳和导航元素，沿用皮肤/主题变量。内容区允许收缩，终端保留无内边距视图。面包屑在窄窗口允许省略，键盘快捷键避开编辑区域及 xterm。

获得的实际证据如下。

| 验证 | 结果 |
|---|---|
| `pnpm.cmd exec tsc --noEmit` | 退出码 0 |
| `pnpm.cmd build` | 退出码 0。Vite 7.3.1 转换 5225 个模块，1 分 43 秒生成产物。提示有产物超过 500 kB |
| 导航映射运行检查 | 用 Node 和 TypeScript 加载实际模块，从原型提取 `TAB_TO_DOMAIN_MAP`。6 域 17 模块与现有注册表一致，34 个正常及大小写/尾斜线变体正确，2 个未知路径正确回落 |
| React 服务端渲染检查 | 17 个模块各校验展开中文与收起英文共 34 种状态。验证活动入口唯一、二级域链接数量及折叠 `inert`。告警组件使用替身。本检查未启动桌面应用 |
| 差异检查 | `git diff --check` 针对本步跟踪文件退出码 0，Windows Git 提示 LF 到 CRLF 转换。5 个本步现存源码文件均为 UTF-8 无 BOM，无码尾空白 |
| SFTP 既有改动隔离 | 原 AppLayout 工作树副本移除 SFTP 导入、挂载两行后与 HEAD 一致；将这两行从新稿的暂存候选去除后，`git apply --cached --check` 退出码 0。无实际暂存 |

动态验收未验证。当前工具清单缺少项目任务启动和状态接口，因此未启动项目、点 Windows 界面或产出截图，也未运行 Rust 构建。请在具备任务接口的验收环境重点看默认 1440×900 与最小 1100×700 的两套主题、前进/后退、折叠不重建终端和 SFTP、键盘输入与全局快捷键、通知与审批深链。第 01 步新增的侧栏槽位由后续模块接入真实分组和会话。

本步提交限 `src/components/layout/AppLayout.tsx` 的本步补丁、`src/components/layout/NavRail.tsx` 的删除、`src/components/layout/header/AlertBell.tsx`、`src/components/layout/WorkspaceNavigation.tsx`、`src/components/layout/workspace.css`、`src/navigation/workspace.ts`。AppLayout 的两行 SFTP 和依赖文件及其余已有工作区改动均排除。待总控裁决后另行提交，暂存区当前为空。AppLayout 的预检查补丁保存在 `C:/Users/ao/AppData/Local/Temp/opspub-workspace-stage-0U8iz4/only-step01-AppLayout.patch`，提交前需重新核对它与最终源码一致。

参考技能 `ui-frontend`、`theme-system`、`architecture-design`。
