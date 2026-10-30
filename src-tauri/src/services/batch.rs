use std::time::Instant;

use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::database::Database;
use crate::error::AppError;
use crate::models::WorkbenchCommandRequest;
use crate::services::audit::AuditService;
use crate::services::workbench::WorkbenchService;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTargetRequest {
    pub server_id: i64,
    pub command: String,
    pub timeout_secs: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchTargetResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
    pub duration_ms: u128,
}

pub struct BatchService;

fn validate_command(command: &str, timeout_secs: u32) -> Result<(), AppError> {
    if command.is_empty() || command.contains(['\n', '\r']) || command.len() > 4096 {
        return Err(AppError::InvalidInput(
            "只能执行长度不超过 4096 的单行命令".into(),
        ));
    }
    if !(1..=600).contains(&timeout_secs) {
        return Err(AppError::InvalidInput(
            "单台超时须在 1 到 600 秒之间".into(),
        ));
    }

    let forbidden = [
        r"(?i)\brm\s+-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\s+/(?:\s|$|[;&|*])",
        r"(?i)\b(?:mkfs(?:\.[a-z0-9]+)?|wipefs)\s+.*?/dev/",
        r"(?i)\bdd\s+.*?\bof=/dev/",
    ];
    for pattern in forbidden {
        if Regex::new(pattern)
            .map_err(|error| AppError::Custom(error.to_string()))?
            .is_match(command)
        {
            return Err(AppError::InvalidInput("命令命中高危操作阻断规则".into()));
        }
    }
    Ok(())
}

impl BatchService {
    pub fn generate(db: &Database, profile_id: &str, prompt: &str) -> Result<String, AppError> {
        if profile_id.trim().is_empty() || prompt.trim().is_empty() || prompt.chars().count() > 2000
        {
            return Err(AppError::InvalidInput(
                "请选择模型并填写 2000 字以内的运维需求".into(),
            ));
        }
        let reply =
            crate::services::copilot::CopilotService::draft_batch_command(db, profile_id, prompt)?;
        validate_generated_command(&reply)
    }

    pub fn execute(
        db: &Database,
        request: BatchTargetRequest,
    ) -> Result<BatchTargetResult, AppError> {
        let command = request.command.trim();
        // 最小物理阻断；更广泛的审批策略仍由应用安全闸门负责。
        validate_command(command, request.timeout_secs)?;

        let server = db
            .get_server_by_id(request.server_id)?
            .ok_or_else(|| AppError::NotFound(format!("服务器 {} 不存在", request.server_id)))?;
        if server.os_type != "linux" {
            return Err(AppError::InvalidInput(
                "批量命令当前只支持 Linux SSH 主机".into(),
            ));
        }

        // 先记录下发，再执行远端命令；审计不可写时禁止执行。
        AuditService::add_log(db, &server.alias, command, "batch-runner", "dispatched")?;
        let started = Instant::now();
        let result = WorkbenchService::execute_with_timeout(
            db,
            WorkbenchCommandRequest {
                server_id: server.id,
                command: command.to_string(),
                password: None,
                private_key_path: None,
                passphrase: None,
            },
            request.timeout_secs,
        );
        let duration_ms = started.elapsed().as_millis();
        match result {
            Ok(output) => {
                AuditService::add_log(
                    db,
                    &server.alias,
                    command,
                    "batch-runner",
                    &format!("exit={} duration_ms={duration_ms}", output.exit_code),
                )?;
                Ok(BatchTargetResult {
                    stdout: output.stdout,
                    stderr: output.stderr,
                    exit_code: output.exit_code,
                    duration_ms,
                })
            }
            Err(error) => {
                AuditService::add_log(
                    db,
                    &server.alias,
                    command,
                    "batch-runner",
                    &format!("failed duration_ms={duration_ms}"),
                )?;
                Err(error)
            }
        }
    }
}

fn validate_generated_command(reply: &str) -> Result<String, AppError> {
    let text = reply.trim();
    if text.starts_with("REFUSED:") || text.contains("```") || text.contains("[REDACTED") {
        return Err(AppError::InvalidInput(
            "模型未生成可用命令，请调整需求；敏感或被拒绝的内容不会填入命令框".into(),
        ));
    }
    validate_command(text, 30)?;
    Ok(text.to_string())
}

#[cfg(test)]
mod tests {
    use super::{validate_command, validate_generated_command};

    #[test]
    fn model_drafts_must_be_single_unmasked_commands() {
        assert_eq!(
            validate_generated_command(" df -h ").expect("valid draft"),
            "df -h"
        );
        for reply in [
            "REFUSED: unsafe",
            "```bash\nuptime\n```",
            "uptime\nwhoami",
            "echo [REDACTED: credential]",
            "rm -rf /",
        ] {
            assert!(validate_generated_command(reply).is_err());
        }
    }

    #[test]
    fn blocks_destructive_root_commands() {
        assert!(validate_command("rm -rf /", 30).is_err());
        assert!(validate_command("rm -fr /; echo done", 30).is_err());
        assert!(validate_command("mkfs.ext4 /dev/sda", 30).is_err());
        assert!(validate_command("dd if=/dev/zero of=/dev/sda", 30).is_err());
        assert!(validate_command("df -h && uptime", 30).is_ok());
    }

    #[test]
    fn validates_single_line_and_timeout() {
        assert!(validate_command("uptime\nwhoami", 30).is_err());
        assert!(validate_command("uptime", 0).is_err());
        assert!(validate_command("uptime", 600).is_ok());
        assert!(validate_command("uptime", 601).is_err());
    }
}
