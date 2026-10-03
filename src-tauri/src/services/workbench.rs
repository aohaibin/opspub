use std::io::Read;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{TerminalOpenRequest, WorkbenchCommandRequest, WorkbenchCommandResult};
use crate::services::server::ServerService;

pub struct WorkbenchService;

impl WorkbenchService {
    pub fn execute(
        db: &Database,
        request: WorkbenchCommandRequest,
    ) -> Result<WorkbenchCommandResult, AppError> {
        Self::execute_with_timeout(db, request, 30)
    }

    pub fn execute_with_timeout(
        db: &Database,
        request: WorkbenchCommandRequest,
        timeout_secs: u32,
    ) -> Result<WorkbenchCommandResult, AppError> {
        let command = request.command.trim();
        if command.is_empty() {
            return Err(AppError::InvalidInput("远程命令不能为空".into()));
        }

        let (_, session) = ServerService::connect_terminal(
            db,
            &TerminalOpenRequest {
                server_id: request.server_id,
                password: request.password,
                private_key_path: request.private_key_path,
                passphrase: request.passphrase,
            },
        )?;
        session.set_timeout(timeout_secs.saturating_mul(1000));
        let mut channel = session
            .channel_session()
            .map_err(|error| AppError::Custom(format!("创建工作台命令通道失败: {error}")))?;
        channel
            .exec(command)
            .map_err(|error| AppError::Custom(format!("执行工作台命令失败: {error}")))?;

        let mut stdout = String::new();
        let mut stderr = String::new();
        channel
            .read_to_string(&mut stdout)
            .map_err(|error| AppError::Custom(format!("读取命令输出失败: {error}")))?;
        channel
            .stderr()
            .read_to_string(&mut stderr)
            .map_err(|error| AppError::Custom(format!("读取命令错误输出失败: {error}")))?;
        channel
            .wait_close()
            .map_err(|error| AppError::Custom(format!("等待命令结束失败: {error}")))?;

        Ok(WorkbenchCommandResult {
            stdout,
            stderr,
            exit_code: channel.exit_status().unwrap_or(1),
        })
    }
}
