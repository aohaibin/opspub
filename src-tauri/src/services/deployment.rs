use std::time::Instant;

use chrono::Local;
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    DeployRunRequest, DeployRunResult, DeployTarget, DeployTargetInput, DeploymentHistory,
    DeploymentProgress, WorkbenchCommandRequest,
};
use crate::services::audit::AuditService;
use crate::services::workbench::WorkbenchService;

const TARGETS_KEY: &str = "deployment.targets";
const HISTORY_KEY: &str = "deployment.history";
const RECIPES: [&str; 7] = [
    "1panel-app",
    "custom-script",
    "docker-compose",
    "node-pm2",
    "static-nginx",
    "static-openresty",
    "systemd-binary",
];

pub struct DeploymentService;

impl DeploymentService {
    pub fn list_targets(db: &Database) -> Result<Vec<DeployTarget>, AppError> {
        let raw = db.get_config(TARGETS_KEY)?.unwrap_or_else(|| "[]".into());
        serde_json::from_str(&raw).map_err(AppError::from)
    }

    pub fn save_target(db: &Database, input: DeployTargetInput) -> Result<DeployTarget, AppError> {
        validate_target(&input)?;
        let mut targets = Self::list_targets(db)?;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let target = if let Some(id) = input.id.filter(|value| !value.trim().is_empty()) {
            let existing = targets
                .iter_mut()
                .find(|target| target.id == id)
                .ok_or_else(|| AppError::NotFound("部署目标不存在".into()))?;
            existing.name = input.name.trim().to_string();
            existing.server_id = input.server_id;
            existing.recipe = input.recipe;
            existing.remote_path = input.remote_path.trim().to_string();
            existing.artifact_path = input.artifact_path.unwrap_or_default().trim().to_string();
            existing.health_command = input.health_command.unwrap_or_default().trim().to_string();
            existing.updated_at = now;
            existing.clone()
        } else {
            let target = DeployTarget {
                id: Uuid::new_v4().to_string(),
                name: input.name.trim().to_string(),
                server_id: input.server_id,
                recipe: input.recipe,
                remote_path: input.remote_path.trim().to_string(),
                artifact_path: input.artifact_path.unwrap_or_default().trim().to_string(),
                health_command: input.health_command.unwrap_or_default().trim().to_string(),
                created_at: now.clone(),
                updated_at: now,
            };
            targets.push(target.clone());
            target
        };
        db.set_config(TARGETS_KEY, &serde_json::to_string(&targets)?)?;
        Ok(target)
    }

    pub fn delete_target(db: &Database, id: &str) -> Result<bool, AppError> {
        let mut targets = Self::list_targets(db)?;
        let before = targets.len();
        targets.retain(|target| target.id != id);
        if before == targets.len() {
            return Ok(false);
        }
        db.set_config(TARGETS_KEY, &serde_json::to_string(&targets)?)?;
        Ok(true)
    }

    pub fn list_history(db: &Database, target_id: Option<&str>) -> Result<Vec<DeploymentHistory>, AppError> {
        let raw = db.get_config(HISTORY_KEY)?.unwrap_or_else(|| "[]".into());
        let history: Vec<DeploymentHistory> = serde_json::from_str(&raw)?;
        Ok(history
            .into_iter()
            .filter(|item| target_id.map(|id| item.target_id == id).unwrap_or(true))
            .collect())
    }

    pub fn deploy(
        app: AppHandle,
        request: DeployRunRequest,
        action: &str,
    ) -> Result<DeployRunResult, AppError> {
        let state = app.state::<crate::state::AppState>();
        let target = Self::list_targets(&state.db)?
            .into_iter()
            .find(|target| target.id == request.target_id)
            .ok_or_else(|| AppError::NotFound("部署目标不存在".into()))?;
        let server = state
            .db
            .get_server_by_id(target.server_id)?
            .ok_or_else(|| AppError::NotFound("部署目标绑定的服务器不存在".into()))?;
        if server.os_type != "linux" {
            return Err(AppError::InvalidInput("部署目前只支持 Linux SSH 服务器".into()));
        }

        let version = normalize_version(request.version.as_deref().unwrap_or_default())?;
        let timeout = request.timeout_secs.unwrap_or(600).clamp(10, 1800);
        emit_progress(&app, &target.id, "preflight", "正在检查部署目标和远端环境", false);
        let command = if action == "rollback" {
            build_rollback_command(&target)?
        } else {
            build_deploy_command(&target, &version)?
        };
        AuditService::add_log(&state.db, &server.alias, &command, "deployment", "dispatched")?;
        emit_progress(&app, &target.id, "deploy", "已通过本地校验，开始远端部署", false);
        let started = Instant::now();
        let result = WorkbenchService::execute_with_timeout(
            &state.db,
            WorkbenchCommandRequest {
                server_id: target.server_id,
                command: command.clone(),
                password: None,
                private_key_path: None,
                passphrase: None,
            },
            timeout,
        );
        let duration_ms = started.elapsed().as_millis();
        let (status, stdout, stderr, exit_code) = match result {
            Ok(result) => {
                let status = if result.exit_code == 0 { "success" } else { "failed" };
                (status.to_string(), result.stdout, result.stderr, result.exit_code)
            }
            Err(error) => {
                let message = error.to_string();
                ("failed".into(), String::new(), message, 1)
            }
        };
        let history = DeploymentHistory {
            id: Uuid::new_v4().to_string(),
            target_id: target.id.clone(),
            target_name: target.name.clone(),
            version: version.clone(),
            action: action.to_string(),
            status: status.clone(),
            output: stdout.clone(),
            error: stderr.clone(),
            created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        };
        Self::append_history(&state.db, history.clone())?;
        AuditService::add_log(
            &state.db,
            &server.alias,
            &command,
            "deployment",
            &format!("{status} exit={exit_code} duration_ms={duration_ms}"),
        )?;
        emit_progress(
            &app,
            &target.id,
            if status == "success" { "done" } else { "failed" },
            if status == "success" { "部署完成" } else { "部署失败，已保留失败现场" },
            true,
        );
        Ok(DeployRunResult { history, stdout, stderr, exit_code, duration_ms })
    }

    fn append_history(db: &Database, item: DeploymentHistory) -> Result<(), AppError> {
        let mut history = Self::list_history(db, None)?;
        history.insert(0, item);
        history.truncate(100);
        db.set_config(HISTORY_KEY, &serde_json::to_string(&history)?)?;
        Ok(())
    }
}

fn validate_target(input: &DeployTargetInput) -> Result<(), AppError> {
    if input.name.trim().is_empty() || input.name.len() > 80 {
        return Err(AppError::InvalidInput("部署目标名称不能为空且不能超过 80 个字符".into()));
    }
    if !RECIPES.contains(&input.recipe.as_str()) {
        return Err(AppError::InvalidInput("不支持的部署配方".into()));
    }
    validate_remote_path(&input.remote_path)?;
    if let Some(path) = input.artifact_path.as_deref().filter(|path| !path.trim().is_empty()) {
        validate_remote_path(path)?;
    }
    if let Some(command) = input.health_command.as_deref().filter(|command| !command.trim().is_empty()) {
        validate_health_command(command)?;
    }
    Ok(())
}

fn validate_remote_path(path: &str) -> Result<(), AppError> {
    let path = path.trim();
    if !path.starts_with('/') || path.contains("..") || path.len() > 240 || path.chars().any(char::is_control) {
        return Err(AppError::InvalidInput("远端路径必须是安全的绝对路径，且不能包含 ..".into()));
    }
    Ok(())
}

fn validate_health_command(command: &str) -> Result<(), AppError> {
    let lower = command.to_ascii_lowercase();
    if command.contains(['\n', '\r']) || command.len() > 500 || ["rm -", "mkfs", "wipefs", "shutdown", "reboot", "dd ", ":(){"].iter().any(|item| lower.contains(item)) {
        return Err(AppError::InvalidInput("健康检查命令只能是短的只读命令".into()));
    }
    Ok(())
}

fn normalize_version(version: &str) -> Result<String, AppError> {
    let value = if version.trim().is_empty() {
        Local::now().format("%Y%m%d_%H%M%S").to_string()
    } else {
        version.trim().to_string()
    };
    if value.len() > 64 || !value.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-')) {
        return Err(AppError::InvalidInput("版本号只能包含字母、数字、点、下划线和短横线".into()));
    }
    Ok(value)
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn build_deploy_command(target: &DeployTarget, version: &str) -> Result<String, AppError> {
    let base = shell_quote(&target.remote_path);
    let release = shell_quote(&format!("{}/releases/{}", target.remote_path, version));
    let mut script = format!("set -eu; BASE={base}; RELEASE={release}; mkdir -p \"$RELEASE\"; ");
    if !target.artifact_path.is_empty() {
        let artifact = shell_quote(&target.artifact_path);
        script.push_str(&format!("if [ -d {artifact} ]; then cp -a {artifact}/. \"$RELEASE/\"; else cp {artifact} \"$RELEASE/\"; fi; "));
    }
    script.push_str(&match target.recipe.as_str() {
        "docker-compose" | "1panel-app" => "cd \"$RELEASE\"; docker compose up -d --build; ln -sfn \"$RELEASE\" \"$BASE/current\"; ".into(),
        "node-pm2" => format!("cd \"$RELEASE\"; npm ci --omit=dev; ln -sfn \"$RELEASE\" \"$BASE/current\"; pm2 reload {} --update-env || pm2 start \"$BASE/current\"; ", shell_quote(&target.name)),
        "systemd-binary" => format!("ln -sfn \"$RELEASE\" \"$BASE/current\"; sudo systemctl restart {}; ", shell_quote(&target.name)),
        "static-nginx" | "static-openresty" => "ln -sfn \"$RELEASE\" \"$BASE/current\"; nginx -t; nginx -s reload; ".into(),
        "custom-script" => "ln -sfn \"$RELEASE\" \"$BASE/current\"; ".into(),
        _ => return Err(AppError::InvalidInput("不支持的部署配方".into())),
    });
    if !target.health_command.is_empty() {
        script.push_str(&format!("{}; ", target.health_command));
    }
    script.push_str("printf 'DEPLOYMENT_OK\\n'");
    Ok(script)
}

fn build_rollback_command(target: &DeployTarget) -> Result<String, AppError> {
    let base = shell_quote(&target.remote_path);
    let mut script = format!("set -eu; BASE={base}; CURRENT=$(readlink -f \"$BASE/current\" 2>/dev/null || true); PREVIOUS=$(find \"$BASE/releases\" -mindepth 1 -maxdepth 1 -type d ! -path \"$CURRENT\" -printf '%T@ %p\\n' 2>/dev/null | sort -nr | sed -n '1p' | cut -d' ' -f2-); test -n \"$PREVIOUS\"; ln -sfn \"$PREVIOUS\" \"$BASE/current\"; ");
    if target.recipe == "docker-compose" || target.recipe == "1panel-app" {
        script.push_str("cd \"$BASE/current\"; docker compose up -d; ");
    } else if target.recipe == "static-nginx" || target.recipe == "static-openresty" {
        script.push_str("nginx -t; nginx -s reload; ");
    } else if target.recipe == "systemd-binary" {
        script.push_str(&format!("sudo systemctl restart {}; ", shell_quote(&target.name)));
    } else if target.recipe == "node-pm2" {
        script.push_str(&format!("pm2 reload {} --update-env; ", shell_quote(&target.name)));
    }
    if !target.health_command.is_empty() {
        script.push_str(&format!("{}; ", target.health_command));
    }
    script.push_str("printf 'ROLLBACK_OK\\n'");
    Ok(script)
}

fn emit_progress(app: &AppHandle, target_id: &str, stage: &str, message: &str, completed: bool) {
    let _ = app.emit("deployment-progress", DeploymentProgress {
        target_id: target_id.to_string(),
        stage: stage.to_string(),
        message: message.to_string(),
        completed,
    });
}

#[cfg(test)]
mod tests {
    use super::{normalize_version, shell_quote};

    #[test]
    fn quotes_shell_values() {
        assert_eq!(shell_quote("/opt/app"), "'/opt/app'");
        assert!(shell_quote("a'b").contains("\\''"));
    }

    #[test]
    fn validates_release_version() {
        assert!(normalize_version("v1.2.0").is_ok());
        assert!(normalize_version("../prod").is_err());
    }
}
