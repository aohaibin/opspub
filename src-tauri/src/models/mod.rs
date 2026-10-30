use serde::{Deserialize, Serialize};

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub key: String,
    pub value: String,
}

/// 模型服务配置正文。API key 不在此结构中，单独保存在系统凭据管理器。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub preset_key: Option<String>,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    pub extra: std::collections::HashMap<String, String>,
    pub enabled: bool,
    pub updated_at: String,
}

/// 前端列表使用的模型服务摘要，永不返回 API key。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileSummary {
    pub id: String,
    pub name: String,
    pub preset_key: Option<String>,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    pub extra: std::collections::HashMap<String, String>,
    pub enabled: bool,
    pub has_api_key: bool,
    pub updated_at: String,
}

/// 新建或编辑模型服务的入参。api_key 只在本次 IPC 调用中传输。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelProfileInput {
    pub id: Option<String>,
    pub name: String,
    pub preset_key: Option<String>,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    #[serde(default)]
    pub extra: std::collections::HashMap<String, String>,
    pub api_key: Option<String>,
    #[serde(default = "default_enabled")]
    pub enabled: bool,
}

fn default_enabled() -> bool { true }

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelVerifyOutcome {
    pub ok: bool,
    pub result: Option<ai_profile::client::VerifyOk>,
    pub error: Option<ai_profile::VerifyError>,
    pub actionable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelImportResult {
    pub name: String,
    pub preset_key: Option<String>,
    pub protocol: String,
    pub base_url: String,
    pub model: String,
    pub model_fallback: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelImportBatchResult {
    pub profiles: Vec<ModelImportResult>,
    pub skipped: usize,
    pub bundle: bool,
}

/// 系统信息
#[derive(Debug, Clone, Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub app_version: String,
    pub data_dir: String,
}

/// 服务器资产
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Server {
    pub id: i64,
    pub alias: String,
    pub hostname: String,
    pub port: i32,
    pub username: String,
    pub auth_type: String, // "password" / "key"
    pub tags: String,      // JSON 数组字符串，如 ["生产环境","腾讯云"]
    pub group: String,
    pub ai_policy: String, // "trusted" / "allowlist" / "approval" / "denied"
    pub os_type: String,   // "linux" / "windows"
    /// 是否收藏（左侧分组树「我的收藏」）
    pub favorite: bool,
    /// CPU 架构，空串表示尚未探测（不要当成 linux/amd64 处理）
    pub arch: String,
    /// 最近一次成功连通/探活时间，None 表示从未使用过
    pub last_used_at: Option<String>,
    /// 首次 SSH 认证时由用户确认并保存的主机公钥指纹
    pub host_key_fingerprint: String,
    /// unknown / verified / failed / host_key_changed
    pub last_connection_status: String,
    /// 最近一次 SSH 验证结果摘要，不包含密码、私钥等敏感信息
    pub last_connection_message: String,
    /// 最近一次 SSH 认证成功时间
    pub last_connected_at: Option<String>,
    /// 是否允许 sudo 提权
    pub allow_sudo: bool,
    /// 是否借用本机本地代理连接
    pub use_local_proxy: bool,
    /// 跳板机服务器 ID，None 表示直连
    pub bastion_id: Option<i64>,
    /// AI 专用 SSH 账号（留空则与主账号一致）
    pub ai_username: String,
    pub created_at: String,
    pub updated_at: String,
}

/// SFTP 操作的短时认证请求。
///
/// 凭据只在当前 IPC 调用中使用，不会写入数据库、日志或会话状态。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpRequest {
    pub server_id: i64,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

/// SFTP 远程目录条目。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpFileEntry {
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: String,
    pub permissions: String,
    pub owner: String,
}

/// 当前进程中保持的 SFTP 会话摘要。凭据和 SSH 句柄只保留在 Rust 后台线程中。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpSessionInfo {
    pub session_id: String,
    pub server_id: i64,
    pub status: String,
    pub started_at: String,
    pub message: String,
}

/// SFTP 上传请求。文件内容由前端通过 IPC 传入，避免在 Rust 侧暴露本地路径。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpUploadRequest {
    pub request: SftpRequest,
    pub remote_dir: String,
    pub file_name: String,
    pub content: Vec<u8>,
}

/// SFTP 下载请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpPathRequest {
    pub request: SftpRequest,
    pub path: String,
}

/// SFTP 重命名请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpRenameRequest {
    pub request: SftpRequest,
    pub source_path: String,
    pub target_path: String,
}

/// SFTP 远程复制请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpCopyRequest {
    pub request: SftpRequest,
    pub source_path: String,
    pub target_path: String,
}

/// SFTP 权限修改请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpChmodRequest {
    pub request: SftpRequest,
    pub path: String,
    pub mode: u32,
}

/// SFTP 远程压缩请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SftpArchiveRequest {
    pub request: SftpRequest,
    pub source_path: String,
    pub archive_path: String,
}

/// 工作台远程命令请求。凭据仅随本次 IPC 调用传递，不写入数据库或会话状态。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchCommandRequest {
    pub server_id: i64,
    pub command: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

/// 工作台远程命令结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchCommandResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// AI 助手请求。凭据不属于此结构，远端连接由 Rust 从系统凭据管理器读取。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotRequest {
    pub message: String,
    pub server_id: Option<i64>,
    pub provider: Option<String>,
    pub model_profile_id: Option<String>,
    #[serde(default)]
    pub history: Vec<CopilotHistoryMessage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotHistoryMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotToolCall {
    pub tool: String,
    pub server_alias: Option<String>,
    pub status: String,
    pub output: String,
    pub approval_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotResponse {
    pub reply: String,
    pub tool_calls: Vec<CopilotToolCall>,
    pub warnings: Vec<String>,
    pub model_name: Option<String>,
    pub history_trimmed: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CopilotProgress {
    pub stage: String,
    pub message: String,
    pub server_alias: Option<String>,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiLockState {
    pub locked: bool,
    pub unlock_until: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiApproval {
    pub id: i64,
    pub server_id: i64,
    pub server_alias: String,
    pub action: String,
    pub command: String,
    pub status: String,
    pub requested_at: i64,
    pub expires_at: i64,
    pub decided_at: Option<i64>,
    pub finished_at: Option<i64>,
    pub result: String,
}

/// 部署目标配置。凭据不属于目标配置，远端执行时由系统凭据管理器读取。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployTarget {
    pub id: String,
    pub name: String,
    pub server_id: i64,
    pub recipe: String,
    pub remote_path: String,
    pub artifact_path: String,
    pub health_command: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 创建或更新部署目标的请求。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployTargetInput {
    pub id: Option<String>,
    pub name: String,
    pub server_id: i64,
    pub recipe: String,
    pub remote_path: String,
    pub artifact_path: Option<String>,
    pub health_command: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployRunRequest {
    pub target_id: String,
    pub version: Option<String>,
    pub timeout_secs: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentHistory {
    pub id: String,
    pub target_id: String,
    pub target_name: String,
    pub version: String,
    pub action: String,
    pub status: String,
    pub output: String,
    pub error: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeployRunResult {
    pub history: DeploymentHistory,
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentProgress {
    pub target_id: String,
    pub stage: String,
    pub message: String,
    pub completed: bool,
}

/// 连通性探测结果
///
/// 探测为纯 TCP 三次握手，不涉及认证：握手成功只代表「网络可达 + 端口有服务监听」，
/// 不代表账号密码正确。前端文案需据此区分「可达」与「可登录」。
#[derive(Debug, Clone, Serialize)]
pub struct ConnectivityResult {
    /// 是否连通
    pub ok: bool,
    /// TCP 握手耗时（毫秒）；失败时为 None
    pub latency_ms: Option<u64>,
    /// 面向用户的结果说明（成功或失败原因）
    pub message: String,
}

/// SSH 认证测试请求。
///
/// 凭据只通过当前 IPC 调用短暂进入 Rust，绝不写入数据库或审计日志。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshProbeRequest {
    pub server_id: i64,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    #[serde(default)]
    pub trust_host_key: bool,
}

/// 系统凭据库中的 SSH 登录信息。
///
/// 该结构只在 Rust 进程和操作系统凭据管理器之间序列化，不作为查询结果返回前端。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSshCredential {
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

/// 数据库连接配置。数据库密码只保存在系统凭据管理器中，不会出现在该结构或 SQLite 中。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConnection {
    pub id: i64,
    pub name: String,
    pub server_id: i64,
    pub engine: String,
    pub host: String,
    pub port: i32,
    pub username: String,
    pub database_name: String,
    pub db_index: i32,
    pub is_prod_protect: bool,
    pub prod_databases: String,
    pub prod_db_list: String,
    pub ssh_tunnel: bool,
    pub ai_tier: String,
    pub created_at: String,
    pub updated_at: String,
}

/// 新建数据库连接请求。password 仅在 IPC 调用期间使用，成功后立即写入系统凭据管理器。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseConnectionInput {
    #[serde(default)]
    pub connection_id: Option<i64>,
    pub name: String,
    pub server_id: i64,
    pub engine: String,
    pub host: String,
    pub port: i32,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub database_name: String,
    #[serde(default)]
    pub db_index: i32,
    #[serde(default)]
    pub password: Option<String>,
    #[serde(default)]
    pub is_prod_protect: bool,
    #[serde(default)]
    pub prod_databases: String,
    #[serde(default)]
    pub prod_db_list: String,
    #[serde(default)]
    pub ssh_tunnel: bool,
    #[serde(default = "default_database_ai_tier")]
    pub ai_tier: String,
}

fn default_database_ai_tier() -> String {
    "default".to_string()
}

/// 数据库查询请求。password 不从前端传递，服务端按连接 ID 从系统凭据管理器读取。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQueryRequest {
    pub connection_id: i64,
    pub sql: String,
    #[serde(default)]
    pub database_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseQueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub affected_rows: usize,
    pub time_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseProbeResult {
    pub ok: bool,
    pub message: String,
    pub latency_ms: Option<u64>,
}

/// SQL 数据库中的表/视图摘要，用于数据库工作台的“结构”浏览器。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseTableItem {
    pub name: String,
    pub table_type: String,
}

/// Column metadata for a table structure view and schema operations.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseColumnItem {
    pub name: String,
    pub data_type: String,
    pub nullable: bool,
    pub default_value: Option<String>,
    pub primary_key: bool,
    pub auto_increment: bool,
    pub comment: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseColumnInput {
    pub connection_id: i64,
    pub database_name: Option<String>,
    pub table_name: String,
    pub name: String,
    pub data_type: String,
    #[serde(default = "default_column_nullable")]
    pub nullable: bool,
    pub default_value: Option<String>,
}

fn default_column_nullable() -> bool {
    true
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RedisKeyItem {
    pub key: String,
    pub key_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MongoCollectionItem {
    pub name: String,
    pub document_count: Option<u64>,
}

/// SSH 认证及只读系统摘要探测结果
#[derive(Debug, Clone, Serialize)]
pub struct SshProbeResult {
    pub connected: bool,
    pub requires_host_key_trust: bool,
    pub fingerprint: String,
    pub host_key_type: String,
    pub latency_ms: u64,
    pub remote_hostname: String,
    pub os_name: String,
    pub arch: String,
    pub uptime: String,
    pub message: String,
}

/// 打开交互式 SSH 终端的请求。
///
/// 凭据只用于建立当前内存会话，建立完成后仅保留已认证的 SSH 通道。
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOpenRequest {
    pub server_id: i64,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
}

/// 已建立的终端会话摘要。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionInfo {
    pub session_id: String,
    pub server_id: i64,
    pub status: String,
    pub started_at: String,
    /// 会话离开终端页面期间累积的输出，重新进入时用于恢复显示。
    pub output: String,
    /// 最近一次生命周期状态提示。
    pub message: String,
}

/// SSH PTY 输出事件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub session_id: String,
    pub data: String,
}

/// SSH PTY 生命周期事件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalStatusEvent {
    pub session_id: String,
    pub status: String,
    pub message: String,
}

/// 从 ~/.ssh/config 解析出的主机条目
///
/// 只做「读取 + 解析 + 预览」，不自动写入资产表：
/// 该文件里常混有跳板机、生产机等敏感条目，导入必须由用户逐条勾选确认。
#[derive(Debug, Clone, Serialize)]
pub struct SshConfigHost {
    /// Host 别名，用于生成资产别名
    pub alias: String,
    /// HostName，未配置时回退为别名（ssh 自身也是这个行为）
    pub hostname: String,
    pub port: i32,
    pub username: String,
    /// IdentityFile 路径；空串表示该条目未显式指定私钥
    pub identity_file: String,
}

/// 审核日志
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditLog {
    pub id: i64,
    pub server_alias: String,
    pub command: String,
    pub user: String,
    pub result: String, // "success" / "failed" / "denied"
    pub created_at: String,
}

/// 敏感库条目。只保存脱敏预览、来源和哈希，绝不保存命中的原文。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitiveEntry {
    pub id: i64,
    pub server_id: Option<i64>,
    pub server_alias: String,
    pub detected_at: String,
    pub secret_type: String,
    pub label: String,
    pub masked_value: String,
    pub source: String,
    pub status: String,
    pub value_hash: String,
    pub match_count: i64,
    pub created_at: String,
    pub updated_at: String,
}

/// 敏感库列表筛选条件。
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitiveListFilter {
    pub server_id: Option<i64>,
    pub status: Option<String>,
    pub secret_type: Option<String>,
    pub search: Option<String>,
}

/// 单次敏感内容扫描请求。content 只在本次 IPC 调用内存在，不写入数据库或日志。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitiveScanRequest {
    pub server_id: Option<i64>,
    pub server_alias: Option<String>,
    pub source: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SensitiveScanResult {
    pub entries: Vec<SensitiveEntry>,
    pub match_count: usize,
    pub sanitized_content: String,
}

/// 告警规则
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertRule {
    pub id: i64,
    pub name: String,
    pub metric: String,
    pub threshold: String,
    pub severity: String, // "critical" / "warning" / "info"
    pub enabled: bool,
    pub created_at: String,
}

/// MCP 本地接入端点状态。真实协议服务未启动时必须明确返回 stopped，避免 UI 伪造 READY。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub version: String,
    pub stdio_path: String,
    pub http_url: String,
    pub http_port: u16,
    pub http_running: bool,
    pub stdio_ready: bool,
    pub in_process_ready: bool,
    pub http_started_at: Option<String>,
    pub endpoint_message: String,
    pub endpoint_error: Option<String>,
    pub last_tested_at: Option<String>,
    pub message: String,
}

/// MCP Scoped Token 元数据。secret 永不通过列表接口返回。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToken {
    pub id: i64,
    pub name: String,
    pub client: String,
    pub server_scope: String,
    pub tool_scope: String,
    pub expires_at: Option<String>,
    pub status: String,
    pub token_hint: String,
    pub created_at: String,
    pub revoked_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTokenInput {
    pub name: String,
    pub client: String,
    pub server_scope: String,
    pub tool_scope: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTokenCreated {
    pub token: McpToken,
    pub secret: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpClientConfig {
    pub client: String,
    pub path: String,
    pub format: String,
    pub content: String,
}
