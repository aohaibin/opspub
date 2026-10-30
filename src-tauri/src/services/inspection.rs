use crate::database::Database;
use crate::error::AppError;
use crate::models::{WorkbenchCommandRequest, WorkbenchCommandResult};
use crate::services::audit::AuditService;
use crate::services::workbench::WorkbenchService;

const INSPECTION_PROBE: &str = "printf 'HOST\\t'; hostname 2>/dev/null || true; printf 'UPTIME\\t'; (uptime -p 2>/dev/null || uptime 2>/dev/null || true); printf 'MEM\\t'; (free -m 2>/dev/null | awk 'NR==2 {printf \"%d%%\",$3*100/$2}' || true); printf 'DISK\\t'; (df -P / 2>/dev/null | awk 'NR==2 {print $5}' || true); printf 'PORTS\\t'; (ss -lnt 2>/dev/null | awk 'NR>1 {print $4}' | head -20 | tr '\\n' ' ' || true); printf 'SSHROOT\\t'; (sshd -T 2>/dev/null | awk 'tolower($1)==\"permitrootlogin\" {print $2; found=1} END {if (!found) exit 1}' || grep -hEi '^[[:space:]]*PermitRootLogin' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -1 | awk '{print $2}' || true); printf 'SSHPASS\\t'; (sshd -T 2>/dev/null | awk 'tolower($1)==\"passwordauthentication\" {print $2; found=1} END {if (!found) exit 1}' || grep -hEi '^[[:space:]]*PasswordAuthentication' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | tail -1 | awk '{print $2}' || true); printf 'DOCKER137\\t'; (docker ps -a --format '{{.Status}}' 2>/dev/null | grep -cE 'Exited \\(137\\)' || true)";

pub struct InspectionService;

impl InspectionService {
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
    use super::INSPECTION_PROBE;

    #[test]
    fn fixed_probe_is_read_only_and_contains_expected_checks() {
        assert!(INSPECTION_PROBE.contains("df -P /"));
        assert!(INSPECTION_PROBE.contains("ss -lnt"));
        assert!(INSPECTION_PROBE.contains("sshd -T"));
        assert!(!INSPECTION_PROBE.contains("sudo "));
        assert!(!INSPECTION_PROBE.contains("rm -"));
        assert!(!INSPECTION_PROBE.contains("systemctl restart"));
    }
}
