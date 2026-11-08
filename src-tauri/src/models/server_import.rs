use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ImportSource {
    SshConfig,
    Finalshell,
    Spreadsheet,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreviewRequest {
    pub source: ImportSource,
    pub path: Option<String>,
}

/// 预览永不包含密码、口令或私钥内容；凭据由 Rust 直接写入系统凭据管理器。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportServerRow {
    pub index: usize,
    pub alias: String,
    pub hostname: String,
    pub port: i32,
    pub username: String,
    pub group: String,
    pub tags: Vec<String>,
    pub os_type: String,
    pub protocol: String,
    pub auth_type: String,
    pub has_password: bool,
    pub error: Option<String>,
    pub warning: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub token: String,
    pub path: String,
    pub rows: Vec<ImportServerRow>,
    pub warnings: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitRequest {
    pub token: String,
    pub indices: Vec<usize>,
    pub ai_policy: String,
    pub default_auth_type: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub index: usize,
    pub alias: String,
    pub server_id: Option<i64>,
    pub error: Option<String>,
}
