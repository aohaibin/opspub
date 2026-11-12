use crate::database::Database;
use crate::error::AppError;
use crate::models::Server;
use crate::services::copilot_policy_engine::{
    assess_shell_command_with_rules, RiskAssessment, RiskLevel,
};

pub struct CopilotPolicyService;

impl CopilotPolicyService {
    pub fn assess_command(db: &Database, command: &str) -> Result<RiskAssessment, AppError> {
        let rules = db.list_policy_rules(false)?;
        Ok(assess_shell_command_with_rules(command, &rules))
    }

    pub fn authorize_mcp_probe(db: &Database, server: &Server) -> Result<(), AppError> {
        if server.protocol == "rdp" || server.os_type != "linux" {
            return Err(AppError::InvalidInput(
                "当前 MCP 远程探针仅支持 Linux SSH 服务器".into(),
            ));
        }
        if db.get_ai_lock()?.locked {
            return Err(AppError::InvalidInput(
                "AI 操作已锁定，请在 OpsPub 顶栏开启 AI 操作".into(),
            ));
        }
        match server.ai_policy.as_str() {
            "disabled" | "denied" => Err(AppError::InvalidInput("该服务器对 AI 禁用".into())),
            "approval" | "strict" => Err(AppError::InvalidInput(
                "此服务器要求逐次审批；MCP 只读探针尚未接入审批流，未执行。请在 OpsPub 终端中人工查询"
                    .into(),
            )),
            "readonly" | "allowlist" | "trusted" | "autonomous" => Ok(()),
            _ => Err(AppError::InvalidInput(
                "无法识别服务器 AI 策略，未执行".into(),
            )),
        }
    }

    pub fn authorize_mcp_plan(
        db: &Database,
        server: &Server,
        has_changes: bool,
    ) -> Result<(), AppError> {
        if server.protocol == "rdp" || server.os_type != "linux" {
            return Err(AppError::InvalidInput(
                "当前 MCP 计划仅支持 Linux SSH 服务器".into(),
            ));
        }
        if db.get_ai_lock()?.locked {
            return Err(AppError::InvalidInput(
                "AI 操作已锁定，请在 OpsPub 顶栏开启 AI 操作".into(),
            ));
        }
        match server.ai_policy.as_str() {
            "disabled" | "denied" => Err(AppError::InvalidInput("该服务器对 AI 禁用".into())),
            "readonly" if has_changes => Err(AppError::InvalidInput(
                "该服务器仅允许 AI 只读操作，不能提交变更计划".into(),
            )),
            "readonly" | "allowlist" | "trusted" | "autonomous" | "approval" | "strict" => Ok(()),
            _ => Err(AppError::InvalidInput(
                "无法识别服务器 AI 策略，未创建计划".into(),
            )),
        }
    }

    pub fn authorize_readonly_probe(
        db: &Database,
        server: &Server,
        command: &str,
    ) -> Result<(), AppError> {
        Self::authorize_mcp_probe(db, server)?;
        let assessment = Self::assess_command(db, command)?;
        if assessment.blocked
            || assessment.requires_approval
            || assessment.level != RiskLevel::LowReadOnly
        {
            return Err(AppError::InvalidInput(format!(
                "只读探针未通过统一风险校验：{}",
                assessment.reason
            )));
        }
        Ok(())
    }

    pub fn authorize_plan_verification(
        db: &Database,
        server_id: i64,
        expected_alias: &str,
        command: &str,
    ) -> Result<(), AppError> {
        let server = db
            .get_server_by_id(server_id)?
            .ok_or_else(|| AppError::NotFound("目标服务器不存在".into()))?;
        if server.alias != expected_alias {
            return Err(AppError::InvalidInput(
                "目标服务器已变更，停止后置验证".into(),
            ));
        }
        if server.protocol == "rdp" || server.os_type != "linux" {
            return Err(AppError::InvalidInput(
                "后置验证仅支持 Linux SSH 服务器".into(),
            ));
        }
        if db.get_ai_lock()?.locked {
            return Err(AppError::InvalidInput(
                "AI 操作已锁定，已停止后置验证".into(),
            ));
        }
        if matches!(server.ai_policy.as_str(), "disabled" | "denied") {
            return Err(AppError::InvalidInput(
                "该服务器对 AI 禁用，已停止后置验证".into(),
            ));
        }
        if !matches!(
            server.ai_policy.as_str(),
            "readonly" | "allowlist" | "trusted" | "autonomous" | "approval" | "strict"
        ) {
            return Err(AppError::InvalidInput(
                "无法识别服务器 AI 策略，已停止后置验证".into(),
            ));
        }
        let assessment = Self::assess_command(db, command)?;
        if assessment.blocked
            || assessment.requires_approval
            || assessment.level != RiskLevel::LowReadOnly
        {
            return Err(AppError::InvalidInput(format!(
                "后置验证未通过统一风险校验：{}",
                assessment.reason
            )));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::CopilotPolicyService;
    use crate::database::Database;
    use crate::models::Server;

    fn server(policy: &str) -> Server {
        Server {
            id: 1,
            alias: "test".into(),
            hostname: "127.0.0.1".into(),
            port: 22,
            username: "root".into(),
            auth_type: "password".into(),
            tags: "[]".into(),
            group: "".into(),
            ai_policy: policy.into(),
            os_type: "linux".into(),
            favorite: false,
            arch: String::new(),
            last_used_at: None,
            host_key_fingerprint: String::new(),
            last_connection_status: "unknown".into(),
            last_connection_message: String::new(),
            last_connected_at: None,
            allow_sudo: false,
            use_local_proxy: false,
            bastion_id: None,
            ai_username: String::new(),
            created_at: String::new(),
            updated_at: String::new(),
            protocol: "ssh".into(),
            connection_options: Default::default(),
        }
    }

    #[test]
    fn readonly_gate_rejects_unknown_and_argument_smuggling() {
        let db = Database::init(":memory:").expect("database");
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        let target = server("readonly");
        for command in [
            "docker ps -a --format '{{.id}}' | sh",
            "docker inspect container-1",
            "find / -name '*.log' -exec rm -rf {} +",
            "cat <<'EOF' > /etc/sudoers",
            "rm -rf /data/${APP_NAME}/*",
            "echo aW1wb3J0 | base64 -d | python3",
        ] {
            assert!(
                CopilotPolicyService::authorize_readonly_probe(&db, &target, command).is_err(),
                "command unexpectedly passed: {command}"
            );
        }
    }

    #[test]
    fn readonly_gate_allows_controlled_health_query_and_rechecks_target_policy() {
        let db = Database::init(":memory:").expect("database");
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        let target = server("readonly");
        assert!(CopilotPolicyService::authorize_readonly_probe(&db, &target, "df -h").is_ok());
        assert!(
            CopilotPolicyService::authorize_readonly_probe(&db, &server("approval"), "df -h")
                .is_err()
        );
        assert!(
            CopilotPolicyService::authorize_readonly_probe(&db, &server("disabled"), "df -h")
                .is_err()
        );
    }

    #[test]
    fn mcp_plan_policy_allows_preview_but_respects_readonly_and_lock() {
        let db = Database::init(":memory:").expect("database");
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        assert!(CopilotPolicyService::authorize_mcp_plan(&db, &server("approval"), true).is_ok());
        assert!(CopilotPolicyService::authorize_mcp_plan(&db, &server("readonly"), false).is_ok());
        assert!(CopilotPolicyService::authorize_mcp_plan(&db, &server("readonly"), true).is_err());
        assert!(CopilotPolicyService::authorize_mcp_plan(&db, &server("disabled"), false).is_err());

        db.set_ai_lock_until(None).expect("lock");
        assert!(CopilotPolicyService::authorize_mcp_plan(&db, &server("approval"), false).is_err());
    }
}
