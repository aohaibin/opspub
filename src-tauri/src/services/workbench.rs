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
        Self::execute_with_timeout_limit(db, request, timeout_secs, None).map(|(result, _)| result)
    }

    /// 执行命令并限制每个输出流的捕获大小，供外部查询等不可信输出场景使用。
    pub fn execute_with_timeout_bounded(
        db: &Database,
        request: WorkbenchCommandRequest,
        timeout_secs: u32,
        max_output_bytes: usize,
    ) -> Result<(WorkbenchCommandResult, bool), AppError> {
        if max_output_bytes == 0 {
            return Err(AppError::InvalidInput("命令输出上限必须大于 0".into()));
        }
        Self::execute_with_timeout_limit(db, request, timeout_secs, Some(max_output_bytes))
    }

    fn execute_with_timeout_limit(
        db: &Database,
        request: WorkbenchCommandRequest,
        timeout_secs: u32,
        max_output_bytes: Option<usize>,
    ) -> Result<(WorkbenchCommandResult, bool), AppError> {
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
        if max_output_bytes.is_some() {
            channel
                .handle_extended_data(ssh2::ExtendedData::Merge)
                .map_err(|error| AppError::Custom(format!("合并命令输出通道失败: {error}")))?;
        }
        channel
            .exec(command)
            .map_err(|error| AppError::Custom(format!("执行工作台命令失败: {error}")))?;

        let (stdout, stderr, truncated) = match max_output_bytes {
            Some(limit) => {
                let (stdout, truncated) = read_channel_output(&mut channel, Some(limit))
                    .map_err(|error| AppError::Custom(format!("读取命令输出失败: {error}")))?;
                (stdout, String::new(), truncated)
            }
            None => {
                let (stdout, _) = read_channel_output(&mut channel, None)
                    .map_err(|error| AppError::Custom(format!("读取命令输出失败: {error}")))?;
                let mut stderr_channel = channel.stderr();
                let (stderr, _) = read_channel_output(&mut stderr_channel, None)
                    .map_err(|error| AppError::Custom(format!("读取命令错误输出失败: {error}")))?;
                (stdout, stderr, false)
            }
        };
        channel
            .wait_close()
            .map_err(|error| AppError::Custom(format!("等待命令结束失败: {error}")))?;

        Ok((
            WorkbenchCommandResult {
                stdout,
                stderr,
                exit_code: channel.exit_status().unwrap_or(1),
            },
            truncated,
        ))
    }
}

fn read_channel_output<R: Read>(
    reader: &mut R,
    max_bytes: Option<usize>,
) -> std::io::Result<(String, bool)> {
    match max_bytes {
        None => {
            let mut output = String::new();
            reader.read_to_string(&mut output)?;
            Ok((output, false))
        }
        Some(limit) => {
            let mut bytes = Vec::with_capacity(limit.saturating_add(1));
            let mut buffer = [0_u8; 8192];
            let mut truncated = false;
            loop {
                let read = reader.read(&mut buffer)?;
                if read == 0 {
                    break;
                }
                let remaining = limit.saturating_add(1).saturating_sub(bytes.len());
                let retained = read.min(remaining);
                bytes.extend_from_slice(&buffer[..retained]);
                truncated |= retained < read || bytes.len() > limit;
            }
            if truncated {
                bytes.truncate(limit);
                while std::str::from_utf8(&bytes).is_err() {
                    bytes.pop();
                }
            }
            Ok((String::from_utf8_lossy(&bytes).into_owned(), truncated))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::read_channel_output;
    use std::io::Cursor;

    #[test]
    fn bounded_reader_does_not_retain_more_than_limit() {
        let mut reader = Cursor::new("abc中文def".as_bytes().to_vec());
        let (output, truncated) = read_channel_output(&mut reader, Some(5)).expect("read output");
        assert_eq!(output, "abc");
        assert!(truncated);
    }

    #[test]
    fn unbounded_reader_preserves_existing_behavior() {
        let mut reader = Cursor::new("safe output".as_bytes().to_vec());
        assert_eq!(
            read_channel_output(&mut reader, None).expect("read output"),
            ("safe output".into(), false)
        );
    }
}
