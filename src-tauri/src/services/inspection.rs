use crate::database::Database;
use crate::error::AppError;
use crate::models::{WorkbenchCommandRequest, WorkbenchCommandResult};
use crate::services::audit::AuditService;
use crate::services::copilot_policy::CopilotPolicyService;
use crate::services::workbench::WorkbenchService;

/// MCP 只读探针的单个输出流上限，避免远端日志无限增长占用本机内存。
const MCP_PROBE_CAPTURE_BYTES: usize = 16 * 1024;

const INSPECTION_PROBE: &str = "printf 'HOST\\t'; hostname 2>/dev/null || true; printf 'UPTIME\\t'; (uptime -p 2>/dev/null || uptime 2>/dev/null || true); printf 'MEM\\t'; (free -m 2>/dev/null | awk 'NR==2 {printf \"%d%%\",$3*100/$2}' || true); printf 'DISK\\t'; (df -P / 2>/dev/null | awk 'NR==2 {print $5}' || true); printf 'PORTS\\t'; (ss -lnt 2>/dev/null | awk 'NR>1 {print $4}' | head -20 | tr '\\n' ' ' || true); printf 'SSHROOT\\t'; (sshd -T 2>/dev/null | awk 'tolower($1)==\"permitrootlogin\" {print $2; found=1} END {if (!found) exit 1}' || grep -hEi '^[[:space:]]*PermitRootLogin' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -1 | awk '{print $2}' || true); printf 'SSHPASS\\t'; (sshd -T 2>/dev/null | awk 'tolower($1)==\"passwordauthentication\" {print $2; found=1} END {if (!found) exit 1}' || grep -hEi '^[[:space:]]*PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -1 | awk '{print $2}' || true); printf 'DOCKER137\\t'; (docker ps -a --format '{{.Status}}' 2>/dev/null | grep -cE 'Exited \\(137\\)' || true)";

pub struct InspectionService;

fn valid_service_name(name: &str) -> bool {
    let mut chars = name.chars();
    name.len() <= 64
        && chars.next().is_some_and(|ch| ch.is_ascii_alphanumeric())
        && chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '@' | '-'))
}

fn valid_container_name(name: &str) -> bool {
    let mut chars = name.chars();
    name.len() <= 128
        && chars.next().is_some_and(|ch| ch.is_ascii_alphanumeric())
        && chars.all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '_' | '.' | '-'))
}

fn bounded_lines(lines: Option<u32>, default: u32) -> Result<u32, AppError> {
    let lines = lines.unwrap_or(default);
    if (1..=500).contains(&lines) {
        Ok(lines)
    } else {
        Err(AppError::InvalidInput(
            "lines 必须是 1 到 500 之间的整数".into(),
        ))
    }
}

fn mcp_probe_command(
    tool: &str,
    service_name: Option<&str>,
    container_name: Option<&str>,
    lines: Option<u32>,
) -> Result<String, AppError> {
    if !matches!(tool, "service_status" | "service_logs") && service_name.is_some() {
        return Err(AppError::InvalidInput(
            "仅 service_status 和 service_logs 接受 serviceName 参数".into(),
        ));
    }
    if tool != "docker_logs" && container_name.is_some() {
        return Err(AppError::InvalidInput(
            "仅 docker_logs 接受 containerName 参数".into(),
        ));
    }
    let command = match tool {
        "system_info" => "df -h -x tmpfs -x devtmpfs && free -h && uptime".into(),
        "disk_usage" => "df -h -x tmpfs -x devtmpfs".into(),
        "memory_usage" => "free -h".into(),
        "process_list" => "ps -eo pid,comm,%cpu,%mem --sort=-%cpu".into(),
        "service_status" => {
            let name = service_name.unwrap_or("nginx").trim();
            if !valid_service_name(name) {
                return Err(AppError::InvalidInput(
                    "serviceName 仅允许 1-64 位字母、数字、下划线、点、@ 和连字符，且必须以字母或数字开头".into(),
                ));
            }
            format!("systemctl is-active {name}")
        }
        "service_logs" => {
            let name = service_name.unwrap_or("nginx").trim();
            if !valid_service_name(name) {
                return Err(AppError::InvalidInput(
                    "serviceName 仅允许 1-64 位字母、数字、下划线、点、@ 和连字符，且必须以字母或数字开头".into(),
                ));
            }
            format!(
                "journalctl -u {name} -n {} --no-pager",
                bounded_lines(lines, 50)?
            )
        }
        "service_list" => "systemctl list-units --type=service --state=running --no-pager".into(),
        "port_check" => "ss -tulpn".into(),
        "tail_log" => "journalctl -n 50 --no-pager".into(),
        "cpu_info" => "lscpu".into(),
        "docker_list" => {
            "docker ps -a --format '{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}\\t{{.Ports}}'"
                .into()
        }
        "docker_logs" => {
            let name = container_name
                .map(str::trim)
                .filter(|name| valid_container_name(name))
                .ok_or_else(|| {
                    AppError::InvalidInput("containerName 不是有效的 Docker 容器名或 ID".into())
                })?;
            format!(
                "docker logs --tail {} --timestamps {name}",
                bounded_lines(lines, 100)?
            )
        }
        _ => return Err(AppError::InvalidInput("未知的只读巡检工具".into())),
    };
    Ok(command)
}

impl InspectionService {
    pub fn run_mcp_probe(
        db: &Database,
        server_id: i64,
        tool: &str,
        service_name: Option<&str>,
        container_name: Option<&str>,
        lines: Option<u32>,
    ) -> Result<(WorkbenchCommandResult, bool), AppError> {
        let server = db
            .get_server_by_id(server_id)?
            .ok_or_else(|| AppError::NotFound(format!("服务器 {server_id} 不存在")))?;
        let command = mcp_probe_command(tool, service_name, container_name, lines)?;
        CopilotPolicyService::authorize_readonly_probe(db, &server, &command)?;
        AuditService::add_log(db, &server.alias, &command, "mcp", "started")?;
        let result = WorkbenchService::execute_with_timeout_bounded(
            db,
            WorkbenchCommandRequest {
                server_id,
                command: command.clone(),
                password: None,
                private_key_path: None,
                passphrase: None,
            },
            30,
            MCP_PROBE_CAPTURE_BYTES,
        );
        match result {
            Ok((output, output_truncated)) => {
                AuditService::add_log(
                    db,
                    &server.alias,
                    &command,
                    "mcp",
                    &format!("exit={}", output.exit_code),
                )?;
                Ok((output, output_truncated))
            }
            Err(error) => {
                let _ = AuditService::add_log(db, &server.alias, &command, "mcp", "failed");
                Err(error)
            }
        }
    }

    pub fn run_probe(db: &Database, server_id: i64) -> Result<WorkbenchCommandResult, AppError> {
        let server = db
            .get_server_by_id(server_id)?
            .ok_or_else(|| AppError::NotFound(format!("服务器 {server_id} 不存在")))?;
        if server.os_type != "linux" {
            return Err(AppError::InvalidInput(
                "只读巡检探针当前仅支持 Linux SSH 主机".into(),
            ));
        }

        AuditService::add_log(
            db,
            &server.alias,
            "inspection_readonly_probe",
            "inspector",
            "dispatched",
        )?;
        let result = WorkbenchService::execute_with_timeout(
            db,
            WorkbenchCommandRequest {
                server_id,
                command: INSPECTION_PROBE.into(),
                password: None,
                private_key_path: None,
                passphrase: None,
            },
            30,
        );
        match result {
            Ok(output) => {
                AuditService::add_log(
                    db,
                    &server.alias,
                    "inspection_readonly_probe",
                    "inspector",
                    &format!("exit={}", output.exit_code),
                )?;
                Ok(output)
            }
            Err(error) => {
                AuditService::add_log(
                    db,
                    &server.alias,
                    "inspection_readonly_probe",
                    "inspector",
                    "failed",
                )?;
                Err(error)
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{mcp_probe_command, INSPECTION_PROBE};
    use crate::services::copilot_policy_engine::{assess_shell_command, RiskLevel};

    #[test]
    fn fixed_probe_is_read_only_and_contains_expected_checks() {
        assert!(INSPECTION_PROBE.contains("df -P /"));
        assert!(INSPECTION_PROBE.contains("ss -lnt"));
        assert!(INSPECTION_PROBE.contains("sshd -T"));
        assert!(!INSPECTION_PROBE.contains("sudo "));
        assert!(!INSPECTION_PROBE.contains("rm -"));
        assert!(!INSPECTION_PROBE.contains("systemctl restart"));
    }

    #[test]
    fn mcp_probes_are_fixed_and_pass_the_shared_readonly_classifier() {
        for tool in [
            "system_info",
            "disk_usage",
            "memory_usage",
            "process_list",
            "service_status",
            "service_logs",
            "service_list",
            "port_check",
            "tail_log",
            "cpu_info",
            "docker_list",
        ] {
            let command = mcp_probe_command(tool, None, None, None).expect("known probe");
            let assessment = assess_shell_command(&command);
            assert_eq!(
                assessment.level,
                RiskLevel::LowReadOnly,
                "{tool}: {command}"
            );
            assert!(!assessment.requires_approval, "{tool}: {command}");
        }
        assert!(mcp_probe_command("run_command", None, None, None).is_err());
        for name in ["nginx", "ssh", "app-service@v2.1"] {
            let command =
                mcp_probe_command("service_status", Some(name), None, None).expect("service");
            assert_eq!(assess_shell_command(&command).level, RiskLevel::LowReadOnly);
        }
        for name in ["", "-rf", "nginx;id", "$(id)"] {
            assert!(mcp_probe_command("service_status", Some(name), None, None).is_err());
        }
        assert!(mcp_probe_command("service_logs", Some("nginx"), None, Some(500)).is_ok());
        assert!(mcp_probe_command("service_logs", Some("nginx"), None, Some(501)).is_err());
        assert!(mcp_probe_command("docker_logs", None, Some("api-1"), Some(100)).is_ok());
        assert!(mcp_probe_command("docker_logs", None, Some("api;id"), Some(100)).is_err());
        assert!(mcp_probe_command("docker_logs", None, Some("api-1"), Some(0)).is_err());
    }
}
