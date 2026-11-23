# 第 10 步 MCP 子批次独立验收

## 结论：PASS（带非阻断验证缺口）

静态审查、实现方隔离 mock IPC 回执和 Rust 回归测试均未发现令牌越权或绕过 AI 锁、审批及服务器策略的证据。本批功能验收通过；真实端点、系统凭据库、外部客户端和本轮独立 Edge/CDP 视口复跑仍是非阻断未验证项。

## 阻断项

- 无。

## 非阻断项

- **N1：全服务器范围文案与后端冻结快照语义不一致。** [TokenCreateModal.tsx](/D:/itemWork/bushu/yunwei/template-tauri/src/pages/mcp/TokenCreateModal.tsx:182) 提示“此令牌也会覆盖后续新增的 SSH 服务器”，但 [mcp.rs](/D:/itemWork/bushu/yunwei/template-tauri/src-tauri/src/services/mcp.rs:618) 在创建时把 `*` 展开为当前 SSH 服务器别名快照；现有测试也断言快照不保留 `*`（`scopes_validate_aliases_and_actual_tools`）。实际权限不会扩大，范围反而更窄，因此**不影响本批 PASS**；建议将文案改为“当前全部 SSH 服务器（创建时冻结）”，或另行确认是否需要动态授权。
- **N2：本轮独立 Edge/CDP 复跑未完成，但不构成阻断。** 实现方第 10 步回执记录隔离 Edge + mock IPC **10 项通过、0 项失败**，覆盖初始接入状态、连接成功 / 失败提示、全服务器 / 只读作用域创建与显示、配置导出、导出文件不含模拟密钥、IPC 记录不含密钥和撤销结果。本轮检查已复核该回执，但本机 headless 调试端口未成功启动，未再次取得四组视口 / 主题截图；待后续 UI 专项验收补证。
- **N3：真实环境未验证。** 未连接真实 MCP 端点、未访问系统凭据库、未向 Claude / Codex / Cursor / OpenCode 写入或导入配置；客户端 JSON/TOML 外部兼容性和真实凭据删除行为仍待环境验收。

## 检查与证据

- 实际未提交 diff：仅 `src/pages/mcp/ClientConfigModal.tsx` 增加导出按钮 / 下载调用，`src/pages/mcp/shared.ts` 增加一次性 Blob URL 下载；没有 MCP Rust、入口布局、Token 作用域或策略实现 diff。
- 原型：对照 `docs/ops-prototype-direction2-workspace.html` 的 MCP 区域（约 40170–40220 行），包含端点、客户端、Scoped Token、只显示一次的完整令牌和客户端配置预览 / 导出入口。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm build`：通过，Vite 报告一个超过 500 kB 的 chunk 警告。
- `cargo test --manifest-path src-tauri/Cargo.toml mcp -- --nocapture`：通过，57 passed / 0 failed。
- `git diff --check -- src/pages/mcp/ClientConfigModal.tsx src/pages/mcp/shared.ts`：通过；Git 提示工作树 LF 将转换为 CRLF。
- 隔离 mock IPC：复核实现方第 10 步回执，10 项通过 / 0 项失败；覆盖初始接入状态、连接测试成功、连接测试失败提示、创建并显示全服务器 / 只读令牌作用域、JSON/TOML 配置导出、导出文件不含模拟密钥、IPC 调用记录不含密钥和撤销结果。夹具位于会话临时环境而非仓库，本轮未独立重跑。

## 代码审查观察

- 完整令牌由创建命令返回给创建成功弹窗；普通 Token 列表只加入 `value.token` 元数据，表格显示 `tokenHint`。关闭成功弹窗会清空 `created` 状态。配置生成只使用 `--token-id` 和端口，配置内容不嵌入 secret；导出直接下载 `config.content`，当前 diff 未添加日志写入。
- Token 创建在系统凭据写入或回读失败时删除对应 DB 记录；撤销先在 DB 标记撤销，再删除系统凭据。数据库撤销成功但凭据删除失败时命令返回错误，前端 `finally` 重新加载列表，因此 UI 显示已撤销；HTTP 鉴权只接受 `active` 状态，失败时保持拒绝访问。
- 后端 `normalize_scopes` 校验服务器别名、拒绝 RDP、校验工具名并把通配符规范化；鉴权侧拒绝 DB 中残留的动态通配范围。工具调用继续执行既有策略授权；相关锁、审批快照、服务器范围过滤及配置/令牌回归均包含在本次 57 个测试中。
- 客户端配置写入先解析并合并，再备份和原子替换；既有 JSON/TOML 无法解析时返回错误且不覆盖原文件。导出路径不调用注入命令，不会清空现有客户端配置。

已参考技能：`check`、`bug-detective`。
