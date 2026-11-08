use super::StoredSshCredential;
use serde::{Deserialize, Serialize};

/// 非敏感连接选项；密码和私钥始终放在系统凭据库。
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct ServerConnectionOptions {
    pub network_env: String,
    pub connection_proxy: String,
    pub rdp_enabled: bool,
    pub rdp_port: u16,
    pub rdp_display_mode: String,
    pub rdp_admin_session: bool,
}
impl Default for ServerConnectionOptions {
    fn default() -> Self {
        Self {
            network_env: "auto".into(),
            connection_proxy: String::new(),
            rdp_enabled: false,
            rdp_port: 3389,
            rdp_display_mode: "system".into(),
            rdp_admin_session: false,
        }
    }
}

// 不派生 Debug：此请求包含一次性输入的凭据。
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFormRequest {
    pub id: Option<i64>,
    pub alias: String,
    pub hostname: String,
    pub port: i32,
    pub username: String,
    pub auth_type: String,
    pub protocol: String,
    pub os_type: String,
    #[serde(default)]
    pub arch: String,
    pub group: String,
    pub tags: String,
    pub ai_policy: String,
    pub allow_sudo: bool,
    pub use_local_proxy: bool,
    pub bastion_id: Option<i64>,
    pub ai_username: String,
    #[serde(default)]
    pub connection_options: ServerConnectionOptions,
    pub credentials: Option<StoredSshCredential>,
    pub verification_token: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerFormProbeResult {
    pub result: super::SshProbeResult,
    pub verification_token: Option<String>,
}
