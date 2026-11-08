use crate::database::Database;
use crate::services::mcp::McpServerManager;
use crate::services::sftp::SftpManager;
use crate::services::terminal::TerminalManager;
use std::sync::Arc;

use ai_profile::client::Verifier;

/// 应用全局状态，通过 tauri::State 注入到 Command 中
pub struct AppState {
    pub db: Database,
    pub terminals: TerminalManager,
    pub sftps: SftpManager,
    pub mcp: McpServerManager,
    pub verifier: Verifier,
    pub device_channel: Arc<crate::services::device_channel::DeviceChannelManager>,
}

impl AppState {
    pub fn new(db: Database, verifier: Verifier) -> Self {
        Self {
            db,
            terminals: TerminalManager::default(),
            sftps: SftpManager::default(),
            mcp: McpServerManager::default(),
            verifier,
            device_channel: Arc::new(
                crate::services::device_channel::DeviceChannelManager::default(),
            ),
        }
    }
}
