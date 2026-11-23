# 第 10 步 · MCP 子批次实现回执

## 实现范围

- `src/pages/mcp/index.tsx` 已由双轨工作区迁移接入 AI 智维 → MCP 入口，本批沿用 `#/mcp` 路由和当前导航，不另造入口。
- 沿用已有 MCP IPC 与 Rust 服务，实现端点/客户端接入状态、连接测试、Scoped Token 创建、作用域展示、撤销及失败提示。没有变更 Rust 端点、持久化结构或策略校验。
- `src/pages/mcp/ClientConfigModal.tsx` 增加配置文件导出，格式按客户端生成 JSON 或 TOML 文件。
- `src/pages/mcp/shared.ts` 增加一次性下载辅助函数。导出内容来自现有 Rust `get_mcp_client_config`，仅含启动器、凭据索引和端口，不含真实令牌。配置正文及令牌没有写入日志、回执或截图。

## 安全边界

MCP 调用继续经过现有后端 AI 锁、审批、服务器作用域、工具作用域和服务器策略验证。本批仅使用模拟 IPC 验证前端交互，没有绕过或更改这些校验。导出文件使用凭据索引，不包含凭据明文。

## 验证

| 检查 | 结果 |
| --- | --- |
| `pnpm exec tsc --noEmit` | 通过 |
| `pnpm build` | 通过，5237 个模块；存在 Vite 大 chunk 提示 |
| `git diff --check -- src/pages/mcp/shared.ts src/pages/mcp/ClientConfigModal.tsx` | 通过；Git 输出 LF/CRLF 转换提示 |
| 隔离 Edge + mock IPC 离线夹具 | 10 项通过，0 项失败 |

离线场景覆盖初始接入状态、连接测试成功、连接测试失败提示、创建并显示全服务器/只读令牌作用域、配置导出、导出文件不含模拟密钥、IPC 调用记录不含密钥、撤销结果。未使用真实 MCP 端点、系统凭据库或客户端配置文件。浏览器未保存截图。

## 文件范围

本批修改 MCP 配置弹窗与共享辅助代码，并新增本回执。未修改 `.agent-pipeline/state.json`，未巡检，未暂存、提交或推送。

已参考技能：`security-permissions`、`api-development`、`ui-frontend`。
