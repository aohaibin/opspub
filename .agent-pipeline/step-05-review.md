# 第 05 步独立验收 · 主机工作台

## 结论

**通过（无已证实阻断项），建议进入总控裁决。**

在合成资产和隔离浏览器夹具中，工作台的资产直达、A→B→普通菜单返回、浏览器前进/后退、工具与 SSH 请求目标绑定、A 的迟到结果隔离、工作台数据库主机筛选隔离均通过。没有发现数据串主机、错误结果覆盖新目标或工作台筛选污染独立数据库菜单的反例。

该结论不等同于真实桌面环境通过：原生 Windows/Tauri/WebView2、真实 SSH/凭据/主机指纹、真实 Linux 命令和数据库查询仍未验证，列为非阻断缺口，不建议据此否决本步离线实现。

## 实测与证据

### 1. 离线夹具

- 命令：`node "$env:TEMP/opspub-step05-22330a20/run-isolated.cjs" workbench-review`
- 结果：退出码 0。
- 运行组合：亮色/暗色 × `1440x900`/`1100x700`，共四组；每组 9 项场景通过，最终日志见 `C:/Users/ao/AppData/Local/Temp/opspub-step05-22330a20/results.log`。
- 夹具使用实际 React 应用、HashRouter、生产构建 CSS 和模拟 IPC；服务器、数据库、命令回传均为合成数据。
- 截图：
  - `step-05-workbench-light-1440x900.png`
  - `step-05-workbench-light-1100x700.png`
  - `step-05-workbench-dark-1440x900.png`
  - `step-05-workbench-dark-1100x700.png`
  位于同一临时目录。截图显示新版双栏工作区、主机目标卡片、概览指标和亮暗主题布局；最小尺寸下夹具断言无横向溢出且内容区可独立纵向滚动。

### 2. 指定反例

| 检查项 | 实测结果 |
|---|---|
| 资产直达 | 从服务器列表直达 `Synthetic Beta`，顶部选择、监控目标、概览采样均为 Beta；失效目标保持空态，不自动切到其他主机；RDP 目标不发工作台命令。 |
| A→B→菜单返回 | 先在 Alpha 触发挂起刷新，再从服务器菜单切 Beta；返回工作台恢复 Alpha 的会话选择和暂停状态，旧请求拒绝不会弹出 Beta 的 SSH 对话框。告警中心往返也保持 Alpha。 |
| 前进/后退 | 浏览器历史前进和后退分别恢复对应历史项的服务器目标；工作台内部工具历史也恢复日志/文件视图及目标。 |
| 工具目标一致 | 日志、文件、实时进程、监听端口、Systemd 服务、Docker 容器的模拟 IPC 请求均携带当前 Alpha/Beta ID；SSH 验证只向 Alpha 发起，回传 `37 ms` 展示在当前目标状态中。 |
| A 迟到数据不得泄露到 B | 挂起 Alpha 文件请求后切 Beta；Beta 文件结果显示后，迟到的 Alpha 结果 `late-alpha.txt` 未出现在 Beta 视图。旧 Alpha 指标、日志和错误同样未覆盖新视图。 |
| 工作台筛选不污染数据库菜单 | 工作台数据库视图只显示当前目标 `Database-101`，不显示 `Database-202`；切到独立 `#/database` 后恢复全量连接树，证明 `hostScoped` 筛选是工作台实例局部状态。 |
| 列表错误恢复 | 合成服务器列表失败显示错误和“重试”，重试后恢复 Beta；没有向失效目标发出命令。 |
| 折叠与滚动 | 机器面板、公共二级栏分别折叠/展开后保留目标和当前工具；概览内容区无横向溢出并可纵向滚动。 |

### 3. 构建与 Rust 检查

- `pnpm exec tsc --noEmit`：退出码 0。
- `pnpm build`：实现回执记录退出码 0，Vite 转换 5230 个模块；仅提示单个 JS chunk 超过 500 kB。
- `cargo check --manifest-path src-tauri/Cargo.toml`：退出码 0；有既存 `dead_code` warning。
- `cargo test --manifest-path src-tauri/Cargo.toml -- --test-threads=1`：退出码 0；180 passed、0 failed、3 ignored。
- `git diff --check -- src/components/layout/AppLayout.tsx src/pages/workbench`：退出码 0。
- 验收过程中未暂存、未提交、未推送业务代码。

## 阻断项

无。离线反例未发现主机隔离、历史恢复或数据库筛选污染问题。

## 非阻断项与未验证

- 未启动原生 Windows Tauri 窗口，未验证 WebView2 在默认 `1440x900` 与最小 `1100x700` 窗口中的真实拖拽、窗口按钮、字体渲染和滚动差异。
- 未连接真实 SSH；凭据管理器、主机指纹确认、超时/网络失败、真实延迟和 SSH 错误弹窗未验证。
- 未验证真实 Linux `ss -tulpn`、Systemd、Docker、进程和防火墙输出，也未执行服务操作。
- 未验证真实数据库连接、查询、导出、已有连接和旧资料兼容性；本次数据库项只验证了工作台筛选状态边界。
- 项目任务系统的 `list/scan/start/stop` 接口在当前工具目录不可用，无法按清单启动或停止临时项目任务；已改用本地隔离 Edge 夹具并记录该缺口。
- 未执行完整 Windows 打包应用走查；应留给最终整体验收步骤。
- Rust 检查的 `AlertRule`、`is_restart_nginx` dead-code warning 与本步无关，不构成阻断。

## 需决策事项

建议总控将本步标记为“独立验收通过”，保留上述真实环境条目到第 14 步整体验收，不因当前工具缺少项目任务系统接口而否决本步。实现方可在总控裁决后再按既定流程提交；本验收会话不提交。

已参考技能：`test-development`、`bug-detective`。
