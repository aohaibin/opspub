use std::time::Instant;

use regex::Regex;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppError;
use crate::models::{
    AiApproval, AiLockState, CopilotProgress, CopilotRequest, CopilotResponse, CopilotToolCall,
    Server, WorkbenchCommandRequest,
};
use crate::services::audit::AuditService;
use crate::services::workbench::WorkbenchService;

const EVENT_NAME: &str = "copilot-progress";
const MAX_MESSAGE_LENGTH: usize = 2_000;
const MAX_OUTPUT_LENGTH: usize = 12_000;

pub struct CopilotService;

impl CopilotService {
    pub fn get_lock(app: &AppHandle) -> Result<AiLockState, AppError> {
        app.state::<crate::state::AppState>().db.get_ai_lock()
    }

    pub fn set_lock(app: &AppHandle, duration: &str) -> Result<AiLockState, AppError> {
        let until = match duration {
            "locked" => None,
            "30m" => Some(chrono::Utc::now().timestamp() + 1800),
            "2h" => Some(chrono::Utc::now().timestamp() + 7200),
            "1d" => Some(chrono::Utc::now().timestamp() + 86400),
            "forever" => Some(-1),
            _ => return Err(AppError::InvalidInput("无效的 AI 放行时长".into())),
        };
        let db = &app.state::<crate::state::AppState>().db;
        let state = db.set_ai_lock_until(until)?;
        AuditService::add_log(
            db,
            "全局",
            "AI 操作总开关",
            "human",
            if state.locked { "locked" } else { "unlocked" },
        )?;
        Ok(state)
    }

    pub fn list_approvals(app: &AppHandle) -> Result<Vec<AiApproval>, AppError> {
        app.state::<crate::state::AppState>().db.list_ai_approvals()
    }

    pub fn reject_approval(app: &AppHandle, id: i64) -> Result<(), AppError> {
        let db = &app.state::<crate::state::AppState>().db;
        db.reject_ai_approval(id)?;
        let approval = db
            .get_ai_approval(id)?
            .ok_or_else(|| AppError::NotFound("审批记录不存在".into()))?;
        AuditService::add_log(
            db,
            &approval.server_alias,
            &approval.command,
            "human",
            "rejected",
        )?;
        Ok(())
    }

    pub fn approve_and_execute(app: AppHandle, id: i64) -> Result<AiApproval, AppError> {
        let state = app.state::<crate::state::AppState>();
        let db = &state.db;
        let approval = match db.take_ai_approval(id) {
            Ok(approval) => approval,
            Err(error) => {
                if let Ok(Some(item)) = db.get_ai_approval(id) {
                    let _ = AuditService::add_log(
                        db,
                        &item.server_alias,
                        &item.command,
                        "human",
                        &format!("blocked: {error}"),
                    );
                }
                return Err(error);
            }
        };
        // 数据库存储的动作仍须按后端白名单复核，绝不从前端接收可执行命令。
        if approval.action != "restart_nginx" || approval.command != "systemctl restart nginx" {
            db.finish_ai_approval(id, false, "动作不在受控白名单")?;
            return Err(AppError::Custom("审批动作不在受控白名单".into()));
        }
        if let Err(error) = AuditService::add_log(
            db,
            &approval.server_alias,
            &approval.command,
            "human",
            "approved",
        ) {
            db.finish_ai_approval(id, false, "审批审计记录失败，未执行命令")?;
            return Err(error);
        }
        let result = WorkbenchService::execute_with_timeout(
            db,
            WorkbenchCommandRequest {
                server_id: approval.server_id,
                command: approval.command.clone(),
                password: None,
                private_key_path: None,
                passphrase: None,
            },
            30,
        );
        let (success, detail) = match result {
            Ok(output) => (
                output.exit_code == 0,
                format!(
                    "exit_code={} {}",
                    output.exit_code,
                    redact_output(&output.stderr)
                ),
            ),
            Err(error) => (false, redact_output(&error.to_string())),
        };
        db.finish_ai_approval(id, success, &detail)?;
        AuditService::add_log(
            db,
            &approval.server_alias,
            &approval.command,
            "copilot",
            if success { "success" } else { "failed" },
        )?;
        db.get_ai_approval(id)?
            .ok_or_else(|| AppError::NotFound("审批记录不存在".into()))
    }

    pub fn chat(app: AppHandle, request: CopilotRequest) -> Result<CopilotResponse, AppError> {
        let message = request.message.trim();
        if message.is_empty() || message.len() > MAX_MESSAGE_LENGTH {
            return Err(AppError::InvalidInput(
                "AI 问题不能为空且不能超过 2000 个字符".into(),
            ));
        }

        let state = app.state::<crate::state::AppState>();
        let servers = state.db.get_all_servers()?;
        let lower = message.to_ascii_lowercase();
        let provider = request.provider.as_deref().unwrap_or("local-safe-tools");
        if is_mutating_request(message, &lower) {
            if is_restart_nginx(message, &lower) {
                let targets = select_targets(&servers, request.server_id, &lower);
                if targets.len() != 1 {
                    return Err(AppError::InvalidInput(
                        "重启 Nginx 需要明确选择一台服务器".into(),
                    ));
                }
                let target = targets[0];
                let approval = match state.db.create_ai_approval(
                    target.id,
                    "restart_nginx",
                    "systemctl restart nginx",
                ) {
                    Ok(approval) => approval,
                    Err(error) => {
                        let _ = AuditService::add_log(
                            &state.db,
                            &target.alias,
                            "systemctl restart nginx",
                            "copilot",
                            &format!("blocked: {error}"),
                        );
                        return Err(error);
                    }
                };
                AuditService::add_log(
                    &state.db,
                    &target.alias,
                    &approval.command,
                    "copilot",
                    "pending_approval",
                )?;
                return Ok(CopilotResponse {
                    reply: format!("已为 {} 提交重启 Nginx 申请（#{}），10 分钟内请在下方审批区人工放行或拒绝。申请阶段不会执行命令。", target.alias, approval.id),
                    tool_calls: vec![CopilotToolCall { tool: "restart_nginx".into(), server_alias: Some(target.alias.clone()), status: "pending".into(), output: "等待人工审批".into(), approval_id: Some(approval.id) }],
                    warnings: Vec::new(),
                });
            }
            let _ = AuditService::add_log(
                &state.db,
                "全局",
                "unsupported_ai_action",
                "copilot",
                "blocked: unsupported action",
            );
            return Ok(CopilotResponse {
                reply: "该改动指令不在 AI 助手受控动作白名单中，未向服务器下发命令。目前仅支持明确选择单台 Linux 主机后申请“重启 nginx”。".into(),
                tool_calls: vec![CopilotToolCall {
                    tool: "policy_guard".into(),
                    server_alias: None,
                    status: "blocked".into(),
                    output: "改动型操作需要人工确认，未向服务器下发命令".into(),
                    approval_id: None,
                }],
                warnings: vec!["只读工具不受顶部 AI 锁影响；未列入白名单的改动操作始终拒绝".into()],
            });
        }

        if is_server_list_request(&lower) {
            return Ok(list_servers_response(&servers));
        }

        let Some(command) = select_readonly_command(message, &lower) else {
            return Ok(CopilotResponse {
                reply: "我可以帮你执行受控只读探针，例如：检查所有服务器健康、查看磁盘/内存、确认 Nginx 状态、查看最近日志或监听端口。请选择目标服务器后再试。".into(),
                tool_calls: Vec::new(),
                warnings: Vec::new(),
            });
        };

        let targets = select_targets(&servers, request.server_id, &lower);
        if targets.is_empty() {
            return Ok(CopilotResponse {
                reply: "没有找到可用的目标服务器。请先在服务器菜单添加 Linux SSH 服务器，并在上方选择目标。".into(),
                tool_calls: Vec::new(),
                warnings: Vec::new(),
            });
        }

        let mut tool_calls = Vec::new();
        let mut warnings = if provider != "local-safe-tools" {
            vec![format!(
                "当前未配置 {} 的模型凭据，已使用本地受控工具模式执行。",
                provider
            )]
        } else {
            Vec::new()
        };
        let mut summaries = Vec::new();
        for server in targets {
            if server.os_type != "linux" {
                tool_calls.push(CopilotToolCall {
                    tool: command.tool.into(),
                    server_alias: Some(server.alias.clone()),
                    status: "skipped".into(),
                    output: "当前只读探针使用 Linux 命令，Windows 主机已跳过".into(),
                    approval_id: None,
                });
                continue;
            }
            if matches!(server.ai_policy.as_str(), "denied" | "disabled") {
                let _ = AuditService::add_log(
                    &state.db,
                    &server.alias,
                    command.command,
                    "copilot",
                    "blocked: server disabled",
                );
                tool_calls.push(CopilotToolCall {
                    tool: command.tool.into(),
                    server_alias: Some(server.alias.clone()),
                    status: "blocked".into(),
                    output: "该服务器的 AI 策略为禁用，未建立 SSH 会话".into(),
                    approval_id: None,
                });
                continue;
            }

            emit(
                &app,
                "running",
                &format!("正在通过受控凭据检查 {}", server.alias),
                Some(&server.alias),
                false,
            );
            let started = Instant::now();
            let result = WorkbenchService::execute_with_timeout(
                &state.db,
                WorkbenchCommandRequest {
                    server_id: server.id,
                    command: command.command.into(),
                    password: None,
                    private_key_path: None,
                    passphrase: None,
                },
                30,
            );
            let duration_ms = started.elapsed().as_millis();
            match result {
                Ok(result) => {
                    let output = redact_output(&format!(
                        "{}{}",
                        result.stdout,
                        if result.stderr.is_empty() {
                            String::new()
                        } else {
                            format!("\n{}", result.stderr)
                        }
                    ));
                    let status = if result.exit_code == 0 {
                        "success"
                    } else {
                        "failed"
                    };
                    let _ = AuditService::add_log(
                        &state.db,
                        &server.alias,
                        command.command,
                        "copilot",
                        &format!(
                            "{status} exit={} duration_ms={duration_ms}",
                            result.exit_code
                        ),
                    );
                    summaries.push(format!("【{}】\n{}", server.alias, output.trim()));
                    tool_calls.push(CopilotToolCall {
                        tool: command.tool.into(),
                        server_alias: Some(server.alias.clone()),
                        status: status.into(),
                        output,
                        approval_id: None,
                    });
                }
                Err(error) => {
                    let text = error.to_string();
                    warnings.push(format!("{}：{}", server.alias, text));
                    let _ = AuditService::add_log(
                        &state.db,
                        &server.alias,
                        command.command,
                        "copilot",
                        "failed",
                    );
                    tool_calls.push(CopilotToolCall {
                        tool: command.tool.into(),
                        server_alias: Some(server.alias.clone()),
                        status: "failed".into(),
                        output: text,
                        approval_id: None,
                    });
                }
            }
            emit(
                &app,
                "completed",
                &format!("{} 检查完成", server.alias),
                Some(&server.alias),
                true,
            );
        }

        let reply = if summaries.is_empty() {
            "没有获得可展示的探针结果，请检查服务器策略、SSH 凭据和网络连接。".into()
        } else {
            format!(
                "已完成受控只读检查（{}）。结果如下：\n\n{}",
                command.label,
                summaries.join("\n\n")
            )
        };
        Ok(CopilotResponse {
            reply,
            tool_calls,
            warnings,
        })
    }
}

struct ReadonlyCommand {
    tool: &'static str,
    label: &'static str,
    command: &'static str,
}

fn select_readonly_command(message: &str, lower: &str) -> Option<ReadonlyCommand> {
    let _ = message;
    if lower.contains("nginx") {
        return Some(ReadonlyCommand { tool: "service_status", label: "Nginx 状态", command: "systemctl is-active nginx --quiet && systemctl status nginx --no-pager -n 8 || systemctl status nginx --no-pager -n 8" });
    }
    if lower.contains("端口") || lower.contains("监听") || lower.contains("port") {
        return Some(ReadonlyCommand {
            tool: "port_check",
            label: "监听端口",
            command: "ss -tulpn",
        });
    }
    if lower.contains("日志") || lower.contains("log") {
        return Some(ReadonlyCommand {
            tool: "tail_log",
            label: "最近日志",
            command: "journalctl -n 50 --no-pager",
        });
    }
    if lower.contains("磁盘") || lower.contains("disk") {
        return Some(ReadonlyCommand {
            tool: "disk_usage",
            label: "磁盘使用率",
            command: "df -h -x tmpfs -x devtmpfs",
        });
    }
    if lower.contains("内存") || lower.contains("memory") {
        return Some(ReadonlyCommand {
            tool: "system_info",
            label: "内存使用率",
            command: "free -h",
        });
    }
    if lower.contains("健康") || lower.contains("巡检") || lower.contains("health") {
        return Some(ReadonlyCommand {
            tool: "system_info",
            label: "服务器健康状态",
            command: "df -h -x tmpfs -x devtmpfs && free -h && uptime",
        });
    }
    None
}

fn select_targets<'a>(
    servers: &'a [Server],
    selected_id: Option<i64>,
    lower: &str,
) -> Vec<&'a Server> {
    if let Some(id) = selected_id {
        return servers.iter().filter(|server| server.id == id).collect();
    }
    if lower.contains("所有") || lower.contains("全部") || lower.contains("每台") {
        return servers.iter().collect();
    }
    if servers.len() == 1 {
        return servers.iter().collect();
    }
    Vec::new()
}

fn is_server_list_request(lower: &str) -> bool {
    lower.contains("有哪些服务器")
        || lower.contains("服务器列表")
        || lower == "服务器"
        || lower.contains("列出服务器")
}
fn is_mutating_request(message: &str, lower: &str) -> bool {
    [
        "重启",
        "安装",
        "删除",
        "卸载",
        "部署",
        "回滚",
        "修改",
        "写入",
        "执行脚本",
        "修复",
        "restart",
        "install",
        "delete",
        "deploy",
    ]
    .iter()
    .any(|word| message.contains(word) || lower.contains(word))
}
fn is_restart_nginx(message: &str, lower: &str) -> bool {
    matches!(message.trim(), "重启 nginx" | "重启nginx") || lower.trim() == "restart nginx"
}

fn list_servers_response(servers: &[Server]) -> CopilotResponse {
    let output = if servers.is_empty() {
        "当前没有已配置服务器。".into()
    } else {
        servers
            .iter()
            .map(|server| {
                format!(
                    "{} · {}:{} · {} · AI策略 {}",
                    server.alias, server.hostname, server.port, server.os_type, server.ai_policy
                )
            })
            .collect::<Vec<_>>()
            .join("\n")
    };
    CopilotResponse {
        reply: format!("当前共有 {} 台服务器：\n{}", servers.len(), output),
        tool_calls: vec![CopilotToolCall {
            tool: "list_servers".into(),
            server_alias: None,
            status: "success".into(),
            output,
            approval_id: None,
        }],
        warnings: Vec::new(),
    }
}

fn redact_output(value: &str) -> String {
    let mut text = value.replace('\0', "");
    if let Ok(pem) = Regex::new(r"-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----") {
        text = pem
            .replace_all(&text, "[REDACTED: private key]")
            .into_owned();
    }
    if let Ok(secret) =
        Regex::new(r"(?i)(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*[^\s]+")
    {
        text = secret.replace_all(&text, "$1=[REDACTED]").into_owned();
    }
    if text.len() > MAX_OUTPUT_LENGTH {
        let mut end = MAX_OUTPUT_LENGTH;
        while !text.is_char_boundary(end) {
            end -= 1;
        }
        text.truncate(end);
        text.push_str("\n...[输出已截断]");
    }
    text
}

fn emit(app: &AppHandle, stage: &str, message: &str, server_alias: Option<&str>, completed: bool) {
    let _ = app.emit(
        EVENT_NAME,
        CopilotProgress {
            stage: stage.into(),
            message: message.into(),
            server_alias: server_alias.map(str::to_string),
            completed,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::{is_mutating_request, is_restart_nginx, redact_output, select_readonly_command};

    #[test]
    fn only_known_readonly_commands_are_selected() {
        assert_eq!(
            select_readonly_command("看磁盘", "看磁盘").unwrap().tool,
            "disk_usage"
        );
        assert!(select_readonly_command("随便聊聊", "随便聊聊").is_none());
    }

    #[test]
    fn mutating_requests_are_blocked_and_output_is_redacted() {
        assert!(is_mutating_request("重启 nginx", "restart nginx"));
        assert!(is_restart_nginx("重启 nginx", "重启 nginx"));
        assert!(!is_restart_nginx(
            "重启 nginx; rm -rf /",
            "重启 nginx; rm -rf /"
        ));
        assert!(redact_output("password=hunter2").contains("[REDACTED]"));
    }
}
