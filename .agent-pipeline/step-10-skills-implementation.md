# 第 10 步 · 技能库子批次

分支 `opspub`。类型检查、生产构建和四组离线浏览器场景均已通过。首轮停点和后续复验分别记录如下。

## 变更

- `src/pages/skills/index.tsx`：在「AI 智维 → 专家技能库」现有路由中使用技能、经验库、Runbook 视图。技能列表加入分页，保留来源筛选、内置开关及名称、描述和触发词搜索。关键词匹配支持自定义输入、示例和经验条目，显示命中数量并突出命中词。
- `src/pages/skills/SkillDrawer.tsx`：新增内置及用户技能详情、用户技能新建与编辑、元数据及正文预览。输入保留尚未完成的逗号分隔项，保存时归一化并写入危险命令元数据。详情切编辑时取消当前点击的默认提交动作，并用独立的按钮键区分编辑和保存。
- `src/lib/api/skills.ts`：通过已有 Tauri 接口封装删除，保存和缓存沿用现有路径。
- `.agent-pipeline/step-10-skills-implementation.md`：本批回执。

原型中的 AI 生成及生成历史没有对应的既有技能库流程，本批实现了本地关键词匹配。技能管理沿用现有 `opspub_user_skills` 缓存及技能文件 IPC。

## 实际验证

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm exec tsc --noEmit` | 0 | 最后一次抽屉修正后通过 |
| `pnpm build` | 0 | 最后一次抽屉修正后通过，转换 5237 个模块，仍有 Vite 大 chunk 提示 |
| `git diff --check -- src/pages/skills src/lib/api/skills.ts` | 0 | 已跟踪文件通过，Git 提示 LF/CRLF。未跟踪的抽屉和本回执未被此命令纳入 |
| `node --test scripts/test-copilot-skills.mjs` | 1 | 既有脚本直接由 Node 执行，Vite 的 `import.meta.glob` 未转换，断言未开始 |
| `node (Join-Path $env:TEMP 'opspub-step10-skills-offline.cjs')` | 1 | 最后一次运行使用抽屉修正前的生产构建，停在亮色 1100×700 的详情转编辑 |

离线夹具使用生产资产、隔离 Edge profile 和模拟 Tauri IPC。亮色 1100×700 用例在失败前通过了 41 项内置技能及两条隔离记录加载、分页、筛选、内置只读详情、关键词匹配、二级栏收展后筛选保留、经验匹配、Runbook 空态、新建校验、保存失败保留草稿及新建保存检查。点击用户技能的详情编辑按钮后，抽屉意外关闭，未进入编辑输入。已补上针对默认提交动作的修正，应用户要求未再次运行夹具。改名、删除、重新加载持久化及完整四组主题与尺寸组合尚未完成。夹具和截图留在系统临时目录，未调用真实 IPC 或写入真实技能目录。

## 首轮交接

建议暂缓技能库验收，待确认详情转编辑不会触发保存，并补齐未完成的离线场景。未改动 MCP、巡检或 `state.json`，未暂存、提交或推送。

已参考 `task-tracker`、`ui-frontend` 和 `test-development`。

## 详情转编辑复验

首轮阻断发生在用户技能详情。详情切换到编辑时，同一点击可能对切换后的保存按钮执行默认提交动作。此前已通过独立按钮键和取消默认动作修正。本轮用同一份应用代码重新构建，补充临时夹具断言。

离线 Edge 使用生产资产、独立浏览器配置和模拟 Tauri IPC。亮色及暗色各运行 1100×700、1440×900 两种视口，每组 51 项通过，共 204 项通过、0 个场景失败。

- 用户技能详情转编辑后保持原抽屉打开，名称、描述、触发词、危险命令和正文正确回填。切换前后保存和删除 IPC 次数一致。
- 内置技能详情显示随包正文，保留只读语义。新建、编辑改名、旧文件清理失败后重试、删除取消与确认、重新加载后的列表恢复均通过。
- 复跑中修正两处夹具问题。浏览器协议不能按值序列化抽屉 DOM 节点，改为在页面内比较引用。Ant Design 为两字中文按钮插入空格，夹具匹配时忽略该空格。两处均只改系统临时目录中的夹具。

| 命令 | 退出码 | 结果 |
| --- | ---: | --- |
| `pnpm exec tsc --noEmit` | 0 | 通过 |
| `pnpm build` | 0 | 通过，转换 5237 个模块，有既有大 chunk 提示 |
| `git diff --check -- src/pages/skills src/lib/api/skills.ts` | 0 | 通过，有 LF/CRLF 提示 |
| `git diff --no-index --check -- /dev/null src/pages/skills/SkillDrawer.tsx` | 1 | 新文件与空文件有差异，无空白错误诊断，有 LF/CRLF 提示 |
| `node (Join-Path $env:TEMP 'opspub-step10-skills-offline.cjs')` | 0 | 四组完成，204 项通过 |

回归截图在 `$env:TEMP/opspub-skills-offline-WoPJN1/`。本轮复验使用模拟 IPC，原生 WebView2 与真实技能文件读写尚未验证。未暂存、提交或推送。
