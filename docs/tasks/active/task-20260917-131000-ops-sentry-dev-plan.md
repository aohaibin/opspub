# 任务：OpsSentry 远程运维助手 — 详细开发计划

**状态**: 🟢 进行中
**创建时间**: 2026-09-17 13:10:00
**更新时间**: 2026-09-20
**Git 分支**: rapiddeep

---

## 📋 需求描述

基于 `docs/remote-ops-ai-prototype.html` 原型设计，在 template-tauri 框架上开发一个**受控远程运维与智能环境诊断平台**（代号 OpsSentry / OpsPub）。

---

## 🎯 实施进度

### Phase 0：项目初始化与基础设施 ✅ 已完成

- [x] 重命名项目：`productName` → "运维助手" / `identifier` → "com.opsentr.yunwei"
- [x] 更新 tauri.conf.json（窗口尺寸：1440x900）
- [x] 添加 Cargo.toml 依赖：ssh2、ring、hmac、sha2、regex、dashmap、uuid
- [x] 新建 Database schema：servers 表、audit_logs 表
- [x] 新建 Rust 数据模型：Server、AuditLog
- [x] 新建 Service 层：server.rs、audit.rs
- [x] 新建 Command 层：server.rs、audit.rs
- [x] 更新 lib.rs：注册新 Commands

### Phase 1：服务器资产 + 只读监控 🔄 进行中

- [x] 后端 - 服务器 CRUD（list/add/update/delete）
- [x] 后端 - 审核日志（get/add）
- [x] 前端 - 类型定义：`types/server.ts`
- [x] 前端 - API 封装：`lib/api/server.ts`
- [x] 前端 - 服务器管理页：`pages/servers/index.tsx`
- [x] 前端 - 工作台监控页：`pages/workbench/index.tsx`
- [x] 更新路由：`Router.tsx`
- [x] 更新导航：`Sidebar.tsx`
- [x] TypeScript 编译检查通过

### Phase 1.5：服务器资产页面对齐原型（VIEW 1）✅ 已完成

**后端**

- [x] Schema v5 迁移：`servers` 表新增 `favorite` / `arch` / `last_used_at`
- [x] `SshConfigHost` 模型 + `ConnectivityResult` 模型
- [x] DAO：`SERVER_COLUMNS` 常量 + `map_server_row`（消除列索引错位风险）
- [x] DAO：`batch_delete_servers` / `batch_update_policy` / `batch_add_tags`（事务内读改写）/ `set_favorite` / `touch_last_used`
- [x] Service：TCP 连通性探测（`connect_timeout` 3s，按单次握手计时，区分 DNS 失败与 TCP 不可达）
- [x] Service：`~/.ssh/config` 解析（跳过通配符 Host 与全局默认段）
- [x] Service：字段校验（端口范围、认证方式、系统、AI 策略）+ 标签规范化（统一存 JSON 数组）
- [x] Command：9 个（含 `test_server_connectivity` 走 `spawn_blocking`、`import_ssh_config`）
- [x] 单元测试 6 个（标签规范化 / 枚举校验 / 探测入参 / 探测不可达 / ssh config 解析 ×2）

**前端**

- [x] 类型：`Server` 扩展 + `ConnectivityResult` / `ServerPayload` / `SshConfigHost`
- [x] API 封装：批量操作、连通性探测、ssh config 导入
- [x] 左栏分组树（全部 / 收藏 / 最近用过 / 自定义分组，带计数）+ 标签快捷过滤
- [x] 工具栏：搜索 + 系统筛选（带计数）+ 标签多选下拉
- [x] 表格：名称标签 / 地址 / 系统架构 / 认证 / AI 策略（行内可改）/ 连通状态 / 操作
- [x] 批量操作条：批量测通（并发） / 批量标签 / AI 策略 / 移除
- [x] 新增编辑弹窗（含连通性测试）、Windows 接入向导、ssh config 导入预览
- [x] 底部三张说明卡片（MCP / AI 安全分级 / Windows 免代理）
- [x] `tsc --noEmit` 与 `npm run build` 均通过

### Phase 1.6：真实 SSH 身份验证与工作台联动 ✅ 已完成

**后端**

- [x] Schema v6：保存主机公钥指纹、最近 SSH 状态、结果摘要与成功时间
- [x] `ssh2` 真实握手与密码 / 私钥认证，阻塞 IO 通过 `spawn_blocking` 执行
- [x] 首次连接先返回 SHA-256 主机指纹，人工确认后才发送认证请求
- [x] 已保存指纹发生变化时拒绝认证，并记录 `host_key_changed` 状态
- [x] 认证成功后执行只读命令，采集远程主机名、系统、架构与运行时间
- [x] 密码、私钥口令不落库、不进入审计日志

**前端**

- [x] 可复用 SSH 验证弹窗：密码 / 私钥表单、首次指纹确认、成功摘要
- [x] 服务器资产表新增 SSH 状态列与验证入口，和 TCP 探活状态明确分离
- [x] 工作台改为服务器主从布局，展示真实认证状态、主机指纹和最近结果
- [x] 工作台“在线”假统计已移除，统计口径改为 `last_connection_status=verified`
- [x] `tsc --noEmit`、`pnpm build`、`cargo check`、`cargo test` 均通过

**顺带修复**

- [x] IPC 参数命名 bug：Tauri v2 默认把 Rust 参数名转 camelCase 作为 IPC 键且无 snake_case 兜底
      （`tauri-macros` 的 `argument_case` 默认 `Camel`），原 `add_server` / `update_server` / `add_audit_log`
      传的是 snake_case，运行时必然报 `missing required key`。已在 `lib/api/server.ts` 统一转换。

### Phase 2-8：待实现（见计划文档）

---

## 📝 关键技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| SSH 实现 | `ssh2` crate | 成熟稳定，纯 Rust API |
| 终端方案 | xterm.js + IPC 事件流 | 不用额外 WebSocket 服务 |
| 凭据加密 | `ring` AES-GCM + vault | AI 永远看不到明文 |
| 审计防篡改 | HMAC-SHA256 链式签名 | 轻量有效 |

---

## 📊 当前状态

**已完成**: Phase 0 + Phase 1 + Phase 1.5 + Phase 1.6（真实 SSH 身份验证与工作台联动）
**正在进行**: 待使用真实 Linux / Windows OpenSSH 主机完成端到端认证验证
**下一步**:
1. 实测密码与私钥认证、首次指纹确认、指纹变化拒绝流程
2. 继续 Phase 2（交互式远程终端与 SFTP）

---

## ⚠️ 已知问题

1. **sqlx 依赖冲突**：已暂时移除 sqlx（与 rusqlite 的 sqlite3 链接冲突），后续需要单独处理
2. **Windows SSH 端到端验证待完成**：当前已通过 Windows 本地编译，仍需连接真实 Windows OpenSSH 主机验证远程摘要命令
3. **凭据不持久化**：当前在 SSH 验证弹窗逐次输入，凭据金库（AES-GCM）尚未实现
4. **远程会话能力待实现**：当前只执行固定只读系统摘要命令，尚无交互式终端、SFTP 与 ProxyJump
5. **git 状态**：本轮改动尚未提交，按约定等审计 + 测试后再提交

---

## 📐 约定（踩坑记录）

### Tauri v2 IPC 参数命名

**发出去用 camelCase，收回来是 snake_case**，两者不对称，容易写错：

- 调用方向：`tauri-macros` 的 `argument_case` 默认是 `Camel`，Rust 参数 `auth_type`
  在 IPC 里的键是 `authType`；运行时是 `serde_json::Value::get(key)` 精确查找，
  **没有 snake_case 兜底**，写错直接报 `command xxx missing required key`。
- 返回方向：`Server` 等结构体没有 `rename_all`，序列化仍是 `auth_type`。

因此 `lib/api/server.ts` 里用 `toIpcPayload()` 做一次显式映射。

---

## 📁 新增文件

### 后端
- `src-tauri/src/models/mod.rs` — 扩展模型（Server、AuditLog）
- `src-tauri/src/database/mod.rs` — 扩展 DAO（服务器、审核日志）
- `src-tauri/src/database/schema.rs` — 扩展 Schema（v3/v4/v5 迁移）
- `src-tauri/src/services/server.rs` — 服务器服务（CRUD + 探活 + ssh config 解析）
- `src-tauri/src/services/audit.rs` — 审核服务
- `src-tauri/src/commands/server.rs` — 服务器 Commands（9 个）
- `src-tauri/src/commands/audit.rs` — 审核 Commands

### 前端
- `src/types/server.ts` — 服务器类型定义
- `src/lib/api/server.ts` — 服务器 API 封装
- `src/pages/servers/index.tsx` — 服务器资产页
- `src/pages/servers/lib/serverMeta.ts` — 标签解析 / 策略元数据 / 搜索匹配
- `src/pages/servers/components/ServerGroupPanel.tsx` — 左栏分组树 + 标签过滤
- `src/pages/servers/components/ServerToolbar.tsx` — 搜索 / 系统筛选 / 标签下拉
- `src/pages/servers/components/ServerFormModal.tsx` — 新增编辑弹窗（含探活）
- `src/pages/servers/components/BatchActionBar.tsx` — 批量操作条
- `src/pages/servers/components/WindowsGuideModal.tsx` — Windows 接入向导
- `src/pages/servers/components/ImportSSHConfigModal.tsx` — ssh config 导入预览
- `src/pages/workbench/index.tsx` — 工作台监控页

---

## 💬 变更记录

### 2026-09-20
**变更类型**: 原型对齐
**变更内容**:
- 服务器菜单右侧页面改为原型的满高工作区布局：标题栏、左右等高主体、可滚动连接表格与底部说明卡
- 分组面板改为独立滚动区，窄屏时自动切换为上下布局
- 统一原型的紧凑按钮、间距、面板边框与主题变量，保留现有筛选、批量操作和连接行为
- `tsc --noEmit`、`pnpm build`、`git diff --check` 通过；Tauri 开发地址 `http://localhost:1420/` 返回 200

**影响范围**: `src/pages/servers/index.tsx`、`src/pages/servers/components/ServerGroupPanel.tsx`、`src/styles/variables.css`

### 2026-09-19
**变更类型**: 功能实现
**变更内容**:
- 新增真实 SSH 握手、密码 / 私钥认证、首次主机指纹确认与指纹变化拦截
- 新增远程只读系统摘要与 Schema v6 连接状态持久化
- 服务器资产页新增 SSH 状态与验证入口，工作台改为真实状态主从视图
- 新增 SSH 辅助函数单测；Rust 10 个测试、TypeScript 检查与前端生产构建通过

**影响范围**: 后端 models/database/services/commands/lib、前端 types/lib/components/pages/servers/pages/workbench

### 2026-09-17 23:10
**变更类型**: 功能实现
**变更内容**:
- 服务器资产页面按原型 VIEW 1 完整实现：分组树、标签过滤、搜索、系统筛选、
  表格全列、行内 AI 策略调整、行内连通性测试、收藏、批量操作条、两块接入向导
- 后端补齐：Schema v5、批量 DAO（含事务）、TCP 探活、`~/.ssh/config` 解析、字段校验
- 修复 IPC 参数 camelCase 隐患（原 CRUD 接口运行时必然报 missing required key）
- 新增 6 个后端单元测试，`cargo check` 零警告，`tsc` 与 `npm run build` 通过

**影响范围**: 后端 models/database/services/commands/lib、前端 types/lib/pages/servers

### 2026-09-17 14:30
**变更类型**: 进度更新
**变更内容**:
- Phase 0 完成：项目初始化、数据库扩展、依赖添加
- Phase 1 大部分完成：服务器 CRUD、审核日志、前端页面

**影响范围**: 后端模型、数据库、API、前端页面
