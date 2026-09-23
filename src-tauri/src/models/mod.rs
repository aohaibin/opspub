use serde::{Deserialize, Serialize};

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub key: String,
    pub value: String,
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
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshProbeRequest {
    pub server_id: i64,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    #[serde(default)]
    pub trust_host_key: bool,
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
