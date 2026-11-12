use std::fs;
use std::path::{Path, PathBuf};
use std::time::Instant;

use chrono::Local;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use uuid::Uuid;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    DeployRunRequest, DeployRunResult, DeployTarget, DeployTargetInput, DeploymentArtifact,
    DeploymentGroup, DeploymentGroupInput, DeploymentGroupRunRequest, DeploymentGroupRunResult,
    DeploymentHistory, DeploymentProgress, SftpRequest, SftpUploadRequest, WorkbenchCommandRequest,
    WorkbenchCommandResult,
};
use crate::services::audit::AuditService;
use crate::services::workbench::WorkbenchService;

const TARGETS_KEY: &str = "deployment.targets";
const GROUPS_KEY: &str = "deployment.groups";
const HISTORY_KEY: &str = "deployment.history";
const ARTIFACT_ROOTS_KEY: &str = "deployment.artifact_roots";
const ARTIFACTS_KEY: &str = "deployment.artifacts";
const MAX_ARTIFACT_SIZE: u64 = 512 * 1024 * 1024;
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
    pub fn list_artifact_roots(db: &Database) -> Result<Vec<String>, AppError> {
        let raw = db
            .get_config(ARTIFACT_ROOTS_KEY)?
            .unwrap_or_else(|| "[]".into());
        serde_json::from_str(&raw).map_err(AppError::from)
    }

    /// Explicitly authorizes a local directory. MCP never accepts arbitrary
    /// local paths; artifacts must be registered below one of these roots.
    pub fn authorize_artifact_root(db: &Database, path: &str) -> Result<String, AppError> {
        let canonical = canonical_local_path(path, true)?;
        let value = canonical.to_string_lossy().to_string();
        let mut roots = Self::list_artifact_roots(db)?;
        if !roots.iter().any(|item| item == &value) {
            roots.push(value.clone());
            db.set_config(ARTIFACT_ROOTS_KEY, &serde_json::to_string(&roots)?)?;
        }
        Ok(value)
    }

    pub fn list_artifacts(db: &Database) -> Result<Vec<DeploymentArtifact>, AppError> {
        let raw = db.get_config(ARTIFACTS_KEY)?.unwrap_or_else(|| "[]".into());
        serde_json::from_str(&raw).map_err(AppError::from)
    }

    /// Registers a regular local file and captures its immutable deployment
    /// identity. Symlinks and credential-like files are rejected.
    pub fn register_artifact(db: &Database, path: &str) -> Result<DeploymentArtifact, AppError> {
        let canonical = canonical_local_path(path, false)?;
        let roots = Self::list_artifact_roots(db)?;
        if !roots.iter().any(|root| {
            Path::new(root)
                .canonicalize()
                .ok()
                .is_some_and(|root| canonical.starts_with(root))
        }) {
            return Err(AppError::InvalidInput(
                "本地产物必须位于已授权目录内".into(),
            ));
        }
        let name = canonical
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::InvalidInput("本地产物文件名无效".into()))?;
        if is_sensitive_artifact_name(name) {
            return Err(AppError::InvalidInput(
                "拒绝登记可能包含密码、私钥或令牌的敏感文件".into(),
            ));
        }
        let size = fs::metadata(&canonical)?.len();
        if size == 0 || size > MAX_ARTIFACT_SIZE {
            return Err(AppError::InvalidInput(format!(
                "本地产物大小必须在 1 字节到 {} MiB 之间",
                MAX_ARTIFACT_SIZE / 1024 / 1024
            )));
        }
        let sha256 = sha256_file(&canonical)?;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut artifacts = Self::list_artifacts(db)?;
        if let Some(existing) = artifacts
            .iter_mut()
            .find(|item| item.path == canonical.to_string_lossy())
        {
            existing.size = size;
            existing.sha256 = sha256;
            existing.updated_at = now;
            let result = existing.clone();
            db.set_config(ARTIFACTS_KEY, &serde_json::to_string(&artifacts)?)?;
            return Ok(result);
        }
        let artifact = DeploymentArtifact {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            path: canonical.to_string_lossy().to_string(),
            size,
            sha256,
            created_at: now.clone(),
            updated_at: now,
        };
        artifacts.push(artifact.clone());
        db.set_config(ARTIFACTS_KEY, &serde_json::to_string(&artifacts)?)?;
        Ok(artifact)
    }

    pub fn revoke_artifact(db: &Database, id: &str) -> Result<bool, AppError> {
        let mut artifacts = Self::list_artifacts(db)?;
        let before = artifacts.len();
        artifacts.retain(|item| item.id != id);
        if before == artifacts.len() {
            return Ok(false);
        }
        db.set_config(ARTIFACTS_KEY, &serde_json::to_string(&artifacts)?)?;
        Ok(true)
    }

    pub fn get_artifact(db: &Database, id: &str) -> Result<DeploymentArtifact, AppError> {
        Self::list_artifacts(db)?
            .into_iter()
            .find(|item| item.id == id)
            .ok_or_else(|| AppError::NotFound("本地产物未登记或已撤销".into()))
    }

    pub fn validate_target_artifact(
        db: &Database,
        target: &DeployTarget,
    ) -> Result<Option<DeploymentArtifact>, AppError> {
        let Some(id) = target
            .artifact_id
            .as_deref()
            .filter(|id| !id.trim().is_empty())
        else {
            return Ok(None);
        };
        if target.artifact_path.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "使用本地产物时必须配置远端制品路径".into(),
            ));
        }
        let artifact = Self::get_artifact(db, id)?;
        let roots = Self::list_artifact_roots(db)?;
        let canonical = canonical_local_path(&artifact.path, false)?;
        if canonical.to_string_lossy() != artifact.path
            || !roots.iter().any(|root| {
                Path::new(root)
                    .canonicalize()
                    .ok()
                    .is_some_and(|root| canonical.starts_with(root))
            })
        {
            return Err(AppError::InvalidInput(
                "本地产物已离开授权目录或路径发生变化".into(),
            ));
        }
        let current = snapshot_artifact(&canonical)?;
        if current.size != artifact.size || current.sha256 != artifact.sha256 {
            return Err(AppError::InvalidInput(
                "本地产物已变化，需重新登记后再创建计划".into(),
            ));
        }
        Ok(Some(artifact))
    }

    /// Reads and verifies the exact bytes that will be uploaded at execution
    /// time, closing the approval-to-execution TOCTOU window.
    pub fn read_verified_artifact(
        db: &Database,
        target: &DeployTarget,
    ) -> Result<Option<(DeploymentArtifact, Vec<u8>)>, AppError> {
        let Some(artifact) = Self::validate_target_artifact(db, target)? else {
            return Ok(None);
        };
        let bytes = fs::read(&artifact.path)?;
        if bytes.len() as u64 != artifact.size || sha256(&bytes) != artifact.sha256 {
            return Err(AppError::InvalidInput(
                "本地产物在审批后发生变化，已拒绝上传和部署".into(),
            ));
        }
        Ok(Some((artifact, bytes)))
    }

    pub fn list_targets(db: &Database) -> Result<Vec<DeployTarget>, AppError> {
        let raw = db.get_config(TARGETS_KEY)?.unwrap_or_else(|| "[]".into());
        serde_json::from_str(&raw).map_err(AppError::from)
    }

    /// Returns the current target snapshot used by MCP read-only tools.
    pub fn get_target(db: &Database, target_id: &str) -> Result<DeployTarget, AppError> {
        Self::list_targets(db)?
            .into_iter()
            .find(|target| target.id == target_id)
            .ok_or_else(|| AppError::NotFound("部署目标不存在".into()))
    }

    /// Builds a deployment command bound to the current target configuration.
    /// The trailing comment is inert shell syntax and lets the approval path
    /// identify the target/action/snapshot without trusting client metadata.
    pub fn build_mcp_plan(
        db: &Database,
        target_id: &str,
        action: &str,
        version: Option<&str>,
    ) -> Result<(DeployTarget, String, String, String), AppError> {
        if !matches!(action, "deploy" | "rollback") {
            return Err(AppError::InvalidInput(
                "部署动作仅支持 deploy 或 rollback".into(),
            ));
        }
        let target = Self::get_target(db, target_id)?;
        if target.health_command.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "MCP 部署目标必须配置健康检查命令".into(),
            ));
        }
        let server = db
            .get_server_by_id(target.server_id)?
            .ok_or_else(|| AppError::NotFound("部署目标绑定的服务器不存在".into()))?;
        if server.protocol == "rdp" || server.os_type != "linux" {
            return Err(AppError::InvalidInput(
                "MCP 部署仅支持 Linux SSH 服务器".into(),
            ));
        }
        let normalized_version = if action == "rollback" {
            "rollback".to_string()
        } else {
            normalize_version(version.unwrap_or_default())?
        };
        let base_command = if action == "rollback" {
            build_rollback_command(&target)?
        } else {
            build_deploy_command(&target, &normalized_version)?
        };
        let artifact = if action == "deploy" {
            Self::validate_target_artifact(db, &target)?
        } else {
            None
        };
        let snapshot = target_snapshot_hash(&target, artifact.as_ref())?;
        let command = format!(
            "{base_command}; # opspub-deployment {} {action} {normalized_version} {snapshot}{}",
            target.id,
            artifact
                .as_ref()
                .map(|item| format!(" {} {} {}", item.id, item.sha256, item.size))
                .unwrap_or_default()
        );
        let verification = target.health_command.clone();
        Ok((target, command, verification, snapshot))
    }

    /// Parses and validates an MCP deployment command against the current
    /// target. This is called again at approval and execution time, so editing
    /// a target invalidates any existing deployment approval.
    pub fn validate_mcp_command(
        db: &Database,
        command: &str,
        verification_command: Option<&str>,
    ) -> Result<(String, String, String), AppError> {
        let (target_id, action, version, snapshot, _) = parse_mcp_marker(command)?;
        let target = Self::get_target(db, &target_id)?;
        if target.health_command.trim().is_empty()
            || verification_command.map(str::trim) != Some(target.health_command.trim())
        {
            return Err(AppError::InvalidInput(
                "部署目标健康检查已变化，旧计划失效".into(),
            ));
        }
        let (_, expected, _, expected_snapshot) =
            Self::build_mcp_plan(db, &target_id, &action, Some(&version))?;
        if snapshot != expected_snapshot
            || normalize_command(command) != normalize_command(&expected)
        {
            return Err(AppError::InvalidInput(
                "部署目标、版本或配置已变化，旧计划失效".into(),
            ));
        }
        Ok((target_id, action, version))
    }

    pub fn is_mcp_deployment_command(command: &str) -> bool {
        parse_mcp_marker(command).is_ok()
    }

    pub fn mcp_deployment_marker(command: &str) -> Option<(String, String, String, String)> {
        parse_mcp_marker(command)
            .ok()
            .map(|(target, action, version, snapshot, _)| (target, action, version, snapshot))
    }

    /// Executes an approval-bound deployment command without rebuilding it from
    /// client supplied fields. The target snapshot is checked immediately
    /// before dispatch, so editing or deleting a target invalidates approval.
    pub fn execute_mcp_command(
        app: AppHandle,
        command: &str,
        verification_command: &str,
        timeout_secs: u32,
    ) -> Result<WorkbenchCommandResult, AppError> {
        let state = app.state::<crate::state::AppState>();
        let db = &state.db;
        let (target_id, action, version) =
            Self::validate_mcp_command(db, command, Some(verification_command))?;
        let target = Self::get_target(db, &target_id)?;
        let server = db
            .get_server_by_id(target.server_id)?
            .ok_or_else(|| AppError::NotFound("部署目标绑定的服务器不存在".into()))?;
        let timeout = timeout_secs.clamp(10, 1800);
        emit_progress(
            &app,
            &target.id,
            "deploy",
            "已通过部署快照校验，开始远端执行",
            false,
        );
        if action == "deploy" {
            if let Some((_artifact, content)) = Self::read_verified_artifact(db, &target)? {
                let remote = Path::new(&target.artifact_path);
                let file_name = remote
                    .file_name()
                    .and_then(|value| value.to_str())
                    .filter(|value| !value.is_empty())
                    .ok_or_else(|| AppError::InvalidInput("远端制品路径必须包含文件名".into()))?;
                let remote_dir = remote
                    .parent()
                    .and_then(|value| value.to_str())
                    .unwrap_or("/")
                    .to_string();
                state.sftps.upload(
                    db,
                    SftpUploadRequest {
                        request: SftpRequest {
                            server_id: target.server_id,
                            password: None,
                            private_key_path: None,
                            passphrase: None,
                        },
                        remote_dir,
                        file_name: file_name.to_string(),
                        content,
                    },
                )?;
                AuditService::add_log(
                    db,
                    &server.alias,
                    &target.artifact_path,
                    "deployment",
                    "local_artifact_uploaded",
                )?;
            }
        }
        AuditService::add_log(db, &server.alias, command, "deployment", "mcp_dispatched")?;
        let started = Instant::now();
        let result = WorkbenchService::execute_with_timeout(
            db,
            WorkbenchCommandRequest {
                server_id: target.server_id,
                command: command.to_string(),
                password: None,
                private_key_path: None,
                passphrase: None,
            },
            timeout,
        );
        let duration_ms = started.elapsed().as_millis();
        let (status, stdout, stderr, exit_code) = match &result {
            Ok(output) => {
                let status = if output.exit_code == 0 {
                    "success"
                } else {
                    "failed"
                };
                (
                    status,
                    output.stdout.clone(),
                    output.stderr.clone(),
                    output.exit_code,
                )
            }
            Err(error) => ("failed", String::new(), error.to_string(), 1),
        };
        Self::append_history(
            db,
            DeploymentHistory {
                id: Uuid::new_v4().to_string(),
                target_id: target.id.clone(),
                target_name: target.name.clone(),
                version,
                action: action.clone(),
                status: status.to_string(),
                verification_status: if status == "success" {
                    "pending".into()
                } else {
                    "not_run".into()
                },
                rollback_status: if action == "rollback" {
                    if status == "success" {
                        "succeeded"
                    } else {
                        "failed"
                    }
                    .into()
                } else {
                    "not_attempted".into()
                },
                output: stdout.clone(),
                error: stderr.clone(),
                created_at: Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            },
        )?;
        AuditService::add_log(
            db,
            &server.alias,
            command,
            "deployment",
            &format!("{status} exit={exit_code} duration_ms={duration_ms}"),
        )?;
        emit_progress(
            &app,
            &target.id,
            if status == "success" {
                "done"
            } else {
                "failed"
            },
            if status == "success" {
                "部署完成"
            } else {
                "部署失败，已保留失败现场"
            },
            true,
        );
        result
    }

    pub fn record_mcp_verification(
        db: &Database,
        target_id: &str,
        action: &str,
        version: &str,
        passed: bool,
        output: &str,
    ) -> Result<(), AppError> {
        let mut history = Self::list_history(db, None)?;
        let item = history
            .iter_mut()
            .find(|item| {
                item.target_id == target_id
                    && item.action == action
                    && item.version == version
                    && item.verification_status == "pending"
            })
            .ok_or_else(|| AppError::NotFound("待更新的部署验证记录不存在".into()))?;
        item.verification_status = if passed { "passed" } else { "failed" }.into();
        if !passed {
            item.status = "failed".into();
            item.error = if item.error.is_empty() {
                format!("健康检查失败: {output}")
            } else {
                format!("{}\n健康检查失败: {output}", item.error)
            };
        } else if !output.trim().is_empty() {
            item.output.push_str("\n[health-check]\n");
            item.output.push_str(output);
        }
        db.set_config(HISTORY_KEY, &serde_json::to_string(&history)?)?;
        Ok(())
    }

    pub fn save_target(db: &Database, input: DeployTargetInput) -> Result<DeployTarget, AppError> {
        validate_target(&input)?;
        if let Some(artifact_id) = input
            .artifact_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
        {
            if input
                .artifact_path
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
            {
                return Err(AppError::InvalidInput(
                    "使用本地产物时必须配置远端制品路径".into(),
                ));
            }
            let _ = Self::get_artifact(db, artifact_id)?;
        }
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
            existing.artifact_id = input.artifact_id.filter(|value| !value.trim().is_empty());
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
                artifact_id: input.artifact_id.filter(|value| !value.trim().is_empty()),
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

    pub fn list_groups(db: &Database) -> Result<Vec<DeploymentGroup>, AppError> {
        let raw = db.get_config(GROUPS_KEY)?.unwrap_or_else(|| "[]".into());
        serde_json::from_str(&raw).map_err(AppError::from)
    }

    pub fn save_group(
        db: &Database,
        input: DeploymentGroupInput,
    ) -> Result<DeploymentGroup, AppError> {
        validate_group(&input)?;
        let targets = Self::list_targets(db)?;
        let target_ids = input
            .target_ids
            .into_iter()
            .filter(|id| targets.iter().any(|target| target.id == *id))
            .collect::<Vec<_>>();
        if target_ids.is_empty() {
            return Err(AppError::InvalidInput("部署组至少需要一个有效目标".into()));
        }
        let mut groups = Self::list_groups(db)?;
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let group = if let Some(id) = input.id.filter(|value| !value.trim().is_empty()) {
            let existing = groups
                .iter_mut()
                .find(|group| group.id == id)
                .ok_or_else(|| AppError::NotFound("部署组不存在".into()))?;
            existing.name = input.name.trim().to_string();
            existing.description = input.description.unwrap_or_default().trim().to_string();
            existing.stop_on_fail = input.stop_on_fail.unwrap_or(true);
            existing.target_ids = target_ids;
            existing.updated_at = now;
            existing.clone()
        } else {
            let group = DeploymentGroup {
                id: Uuid::new_v4().to_string(),
                name: input.name.trim().to_string(),
                description: input.description.unwrap_or_default().trim().to_string(),
                stop_on_fail: input.stop_on_fail.unwrap_or(true),
                target_ids,
                created_at: now.clone(),
                updated_at: now,
            };
            groups.push(group.clone());
            group
        };
        db.set_config(GROUPS_KEY, &serde_json::to_string(&groups)?)?;
        Ok(group)
    }

    pub fn delete_group(db: &Database, id: &str) -> Result<bool, AppError> {
        let mut groups = Self::list_groups(db)?;
        let before = groups.len();
        groups.retain(|group| group.id != id);
        if before == groups.len() {
            return Ok(false);
        }
        db.set_config(GROUPS_KEY, &serde_json::to_string(&groups)?)?;
        Ok(true)
    }

    pub fn deploy_group(
        app: tauri::AppHandle,
        request: DeploymentGroupRunRequest,
    ) -> Result<DeploymentGroupRunResult, AppError> {
        let state = app.state::<crate::state::AppState>();
        let group = Self::list_groups(&state.db)?
            .into_iter()
            .find(|group| group.id == request.group_id)
            .ok_or_else(|| AppError::NotFound("部署组不存在".into()))?;
        let mut results = Vec::new();
        let timeout = request.timeout_secs;
        let canary_target_id = request
            .canary_first
            .then(|| group.target_ids.first().cloned())
            .flatten();
        let mut stopped_after_canary_failure = false;
        for (index, target_id) in group.target_ids.into_iter().enumerate() {
            let result = Self::deploy(
                app.clone(),
                DeployRunRequest {
                    target_id,
                    version: None,
                    timeout_secs: timeout,
                },
                "deploy",
            )?;
            let success = result.exit_code == 0;
            results.push(result);
            let canary_failed = request.canary_first && index == 0 && !success;
            if canary_failed {
                stopped_after_canary_failure = true;
                break;
            }
            if !success && group.stop_on_fail {
                break;
            }
        }
        Ok(DeploymentGroupRunResult {
            group_id: group.id,
            success: results.iter().all(|result| result.exit_code == 0),
            results,
            canary_target_id,
            stopped_after_canary_failure,
        })
    }

    pub fn list_history(
        db: &Database,
        target_id: Option<&str>,
    ) -> Result<Vec<DeploymentHistory>, AppError> {
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
            return Err(AppError::InvalidInput(
                "部署目前只支持 Linux SSH 服务器".into(),
            ));
        }

        let version = normalize_version(request.version.as_deref().unwrap_or_default())?;
        let timeout = request.timeout_secs.unwrap_or(600).clamp(10, 1800);
        emit_progress(
            &app,
            &target.id,
            "preflight",
            "正在检查部署目标和远端环境",
            false,
        );
        let command = if action == "rollback" {
            build_rollback_command(&target)?
        } else {
            build_deploy_command(&target, &version)?
        };
        AuditService::add_log(
            &state.db,
            &server.alias,
            &command,
            "deployment",
            "dispatched",
        )?;
        emit_progress(
            &app,
            &target.id,
            "deploy",
            "已通过本地校验，开始远端部署",
            false,
        );
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
        let (mut status, mut stdout, mut stderr, mut exit_code) = match result {
            Ok(result) => {
                let status = if result.exit_code == 0 {
                    "success"
                } else {
                    "failed"
                };
                (
                    status.to_string(),
                    result.stdout,
                    result.stderr,
                    result.exit_code,
                )
            }
            Err(error) => {
                let message = error.to_string();
                ("failed".into(), String::new(), message, 1)
            }
        };
        let mut verification_status = if target.health_command.trim().is_empty() {
            "not_configured".to_string()
        } else {
            "pending".to_string()
        };
        if status == "success" && !target.health_command.trim().is_empty() {
            emit_progress(
                &app,
                &target.id,
                "verification",
                "部署命令已完成，正在单独执行健康检查",
                false,
            );
            let verification_result = WorkbenchService::execute_with_timeout(
                &state.db,
                WorkbenchCommandRequest {
                    server_id: target.server_id,
                    command: target.health_command.clone(),
                    password: None,
                    private_key_path: None,
                    passphrase: None,
                },
                timeout.min(60),
            );
            match verification_result {
                Ok(result) if result.exit_code == 0 => {
                    verification_status = "passed".into();
                    if !result.stdout.trim().is_empty() {
                        stdout.push_str("\n[health-check]\n");
                        stdout.push_str(&result.stdout);
                    }
                    if !result.stderr.trim().is_empty() {
                        stderr.push_str("\n[health-check]\n");
                        stderr.push_str(&result.stderr);
                    }
                }
                Ok(result) => {
                    verification_status = "failed".into();
                    status = "failed".into();
                    exit_code = if result.exit_code == 0 {
                        1
                    } else {
                        result.exit_code
                    };
                    stderr.push_str(&format!(
                        "\n[health-check failed: exit {}]\n{}",
                        result.exit_code, result.stderr
                    ));
                    if !result.stdout.trim().is_empty() {
                        stderr.push_str(&format!("\n{}", result.stdout));
                    }
                }
                Err(error) => {
                    verification_status = "failed".into();
                    status = "failed".into();
                    exit_code = 1;
                    stderr.push_str(&format!("\n[health-check error]\n{error}"));
                }
            }
        }
        let rollback_status = if action == "rollback" {
            if status == "success" {
                "succeeded"
            } else {
                "failed"
            }
        } else {
            "not_attempted"
        };
        let history = DeploymentHistory {
            id: Uuid::new_v4().to_string(),
            target_id: target.id.clone(),
            target_name: target.name.clone(),
            version: version.clone(),
            action: action.to_string(),
            status: status.clone(),
            verification_status,
            rollback_status: rollback_status.into(),
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
            if status == "success" {
                "done"
            } else {
                "failed"
            },
            if status == "success" {
                "部署完成"
            } else {
                "部署失败，已保留失败现场"
            },
            true,
        );
        Ok(DeployRunResult {
            history,
            stdout,
            stderr,
            exit_code,
            duration_ms,
        })
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
        return Err(AppError::InvalidInput(
            "部署目标名称不能为空且不能超过 80 个字符".into(),
        ));
    }
    if !RECIPES.contains(&input.recipe.as_str()) {
        return Err(AppError::InvalidInput("不支持的部署配方".into()));
    }
    validate_remote_path(&input.remote_path)?;
    if let Some(path) = input
        .artifact_path
        .as_deref()
        .filter(|path| !path.trim().is_empty())
    {
        validate_remote_path(path)?;
    }
    if let Some(command) = input
        .health_command
        .as_deref()
        .filter(|command| !command.trim().is_empty())
    {
        validate_health_command(command)?;
    }
    Ok(())
}

fn validate_group(input: &DeploymentGroupInput) -> Result<(), AppError> {
    let name = input.name.trim();
    if name.is_empty() || name.len() > 80 || name.chars().any(char::is_control) {
        return Err(AppError::InvalidInput(
            "部署组名称不能为空且不能超过 80 个字符".into(),
        ));
    }
    if input.target_ids.is_empty() {
        return Err(AppError::InvalidInput(
            "部署组至少需要选择一个部署目标".into(),
        ));
    }
    Ok(())
}

fn validate_remote_path(path: &str) -> Result<(), AppError> {
    let path = path.trim();
    if !path.starts_with('/')
        || path.contains("..")
        || path.len() > 240
        || path.chars().any(char::is_control)
    {
        return Err(AppError::InvalidInput(
            "远端路径必须是安全的绝对路径，且不能包含 ..".into(),
        ));
    }
    Ok(())
}

fn validate_health_command(command: &str) -> Result<(), AppError> {
    let lower = command.to_ascii_lowercase();
    if command.contains(['\n', '\r'])
        || command.len() > 500
        || [
            "rm -", "mkfs", "wipefs", "shutdown", "reboot", "dd ", ":(){",
        ]
        .iter()
        .any(|item| lower.contains(item))
    {
        return Err(AppError::InvalidInput(
            "健康检查命令只能是短的只读命令".into(),
        ));
    }
    Ok(())
}

fn normalize_version(version: &str) -> Result<String, AppError> {
    let value = if version.trim().is_empty() {
        Local::now().format("%Y%m%d_%H%M%S").to_string()
    } else {
        version.trim().to_string()
    };
    if value.len() > 64
        || !value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-'))
    {
        return Err(AppError::InvalidInput(
            "版本号只能包含字母、数字、点、下划线和短横线".into(),
        ));
    }
    Ok(value)
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn normalize_command(command: &str) -> String {
    command.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn target_snapshot_hash(
    target: &DeployTarget,
    artifact: Option<&DeploymentArtifact>,
) -> Result<String, AppError> {
    let bytes = serde_json::to_vec(&(
        target,
        artifact.map(|item| (&item.id, item.size, &item.sha256)),
    ))?;
    Ok(format!("{:x}", Sha256::digest(bytes)))
}

fn snapshot_artifact(path: &Path) -> Result<DeploymentArtifact, AppError> {
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_ARTIFACT_SIZE {
        return Err(AppError::InvalidInput("本地产物大小或文件类型无效".into()));
    }
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::InvalidInput("本地产物文件名无效".into()))?;
    if is_sensitive_artifact_name(name) {
        return Err(AppError::InvalidInput("拒绝访问敏感本地文件".into()));
    }
    Ok(DeploymentArtifact {
        id: String::new(),
        name: name.into(),
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        sha256: sha256_file(path)?,
        created_at: String::new(),
        updated_at: String::new(),
    })
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn sha256_file(path: &Path) -> Result<String, AppError> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    std::io::copy(&mut file, &mut hasher)?;
    Ok(format!("{:x}", hasher.finalize()))
}

fn is_sensitive_artifact_name(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    let segments = lower.split(['.', '-', '_']).collect::<Vec<_>>();
    [
        ".env",
        "id_rsa",
        "id_ed25519",
        "id_ecdsa",
        "credentials",
        "secrets",
        "token",
        "password",
    ]
    .iter()
    .any(|sensitive| lower == *sensitive || lower.starts_with(&format!("{sensitive}.")))
        || ["pem", "key", "p12", "pfx"]
            .iter()
            .any(|ext| lower.ends_with(&format!(".{ext}")))
        || segments.iter().any(|part| {
            matches!(
                *part,
                "secret" | "secrets" | "credential" | "credentials" | "password" | "token"
            )
        })
}

fn canonical_local_path(path: &str, directory: bool) -> Result<PathBuf, AppError> {
    let raw = path.trim();
    let path = Path::new(raw);
    if !path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(AppError::InvalidInput(
            "本地路径必须是无路径穿越的绝对路径".into(),
        ));
    }
    let mut current = PathBuf::new();
    for component in path.components() {
        current.push(component.as_os_str());
        if let Ok(metadata) = fs::symlink_metadata(&current) {
            if metadata.file_type().is_symlink() {
                return Err(AppError::InvalidInput("路径中不允许包含符号链接".into()));
            }
        }
    }
    let metadata = fs::symlink_metadata(path)?;
    if (directory && !metadata.is_dir()) || (!directory && !metadata.is_file()) {
        return Err(AppError::InvalidInput(if directory {
            "授权路径必须是目录".into()
        } else {
            "本地产物必须是普通文件".into()
        }));
    }
    let canonical = path.canonicalize()?;
    if !canonical.is_absolute() {
        return Err(AppError::InvalidInput("本地路径必须是绝对路径".into()));
    }
    Ok(canonical)
}

fn parse_mcp_marker(
    command: &str,
) -> Result<
    (
        String,
        String,
        String,
        String,
        Option<(String, String, u64)>,
    ),
    AppError,
> {
    let normalized = normalize_command(command);
    let (base, marker) = normalized
        .rsplit_once("; # opspub-deployment ")
        .ok_or_else(|| AppError::InvalidInput("MCP 部署命令缺少受控快照标记".into()))?;
    if base.trim().is_empty() {
        return Err(AppError::InvalidInput("MCP 部署命令主体为空".into()));
    }
    let fields = marker.split_whitespace().collect::<Vec<_>>();
    if !matches!(fields.len(), 4 | 7)
        || fields[0].is_empty()
        || !matches!(fields[1], "deploy" | "rollback")
        || fields[2].is_empty()
        || fields[3].len() != 64
        || !fields[3].bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(AppError::InvalidInput("MCP 部署快照标记无效".into()));
    }
    let artifact = if fields.len() == 7 {
        if fields[4].is_empty()
            || fields[5].len() != 64
            || !fields[5].bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(AppError::InvalidInput("MCP 本地产物快照无效".into()));
        }
        Some((
            fields[4].to_string(),
            fields[5].to_string(),
            fields[6]
                .parse::<u64>()
                .map_err(|_| AppError::InvalidInput("MCP 本地产物大小无效".into()))?,
        ))
    } else {
        None
    };
    Ok((
        fields[0].to_string(),
        fields[1].to_string(),
        fields[2].to_string(),
        fields[3].to_string(),
        artifact,
    ))
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
        script.push_str(&format!(
            "sudo systemctl restart {}; ",
            shell_quote(&target.name)
        ));
    } else if target.recipe == "node-pm2" {
        script.push_str(&format!(
            "pm2 reload {} --update-env; ",
            shell_quote(&target.name)
        ));
    }
    script.push_str("printf 'ROLLBACK_OK\\n'");
    Ok(script)
}

fn emit_progress(app: &AppHandle, target_id: &str, stage: &str, message: &str, completed: bool) {
    let _ = app.emit(
        "deployment-progress",
        DeploymentProgress {
            target_id: target_id.to_string(),
            stage: stage.to_string(),
            message: message.to_string(),
            completed,
        },
    );
}

#[cfg(test)]
mod tests {
    use super::{normalize_version, parse_mcp_marker, shell_quote, DeploymentService, TARGETS_KEY};
    use crate::database::Database;
    use crate::models::DeployTargetInput;
    use std::fs;

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

    #[test]
    fn deployment_health_check_is_not_embedded_in_the_write_command() {
        let target = crate::models::DeployTarget {
            id: "target-1".into(),
            name: "api".into(),
            server_id: 1,
            recipe: "custom-script".into(),
            remote_path: "/opt/api".into(),
            artifact_path: String::new(),
            artifact_id: None,
            health_command: "curl -fsS http://127.0.0.1:8080/health".into(),
            created_at: String::new(),
            updated_at: String::new(),
        };
        let command = super::build_deploy_command(&target, "v1.2.3").expect("build command");
        assert!(command.contains("DEPLOYMENT_OK"));
        assert!(!command.contains(&target.health_command));
    }

    #[test]
    fn mcp_health_verification_failure_is_persisted_separately_from_execution() {
        let db = Database::init(":memory:").expect("db");
        DeploymentService::append_history(
            &db,
            crate::models::DeploymentHistory {
                id: "history-1".into(),
                target_id: "target-1".into(),
                target_name: "api".into(),
                version: "v1.2.3".into(),
                action: "deploy".into(),
                status: "success".into(),
                verification_status: "pending".into(),
                rollback_status: "not_attempted".into(),
                output: "DEPLOYMENT_OK".into(),
                error: String::new(),
                created_at: "now".into(),
            },
        )
        .expect("append history");
        DeploymentService::record_mcp_verification(
            &db,
            "target-1",
            "deploy",
            "v1.2.3",
            false,
            "HTTP probe returned 503",
        )
        .expect("record failed probe");

        let history = DeploymentService::list_history(&db, Some("target-1")).expect("load history");
        assert_eq!(history[0].status, "failed");
        assert_eq!(history[0].verification_status, "failed");
        assert!(history[0].error.contains("HTTP probe returned 503"));
        assert_eq!(history[0].rollback_status, "not_attempted");
    }

    #[test]
    fn old_deployment_history_defaults_to_unverified_and_unattempted_rollback() {
        let old = r#"{"id":"h","targetId":"t","targetName":"api","version":"v1","action":"deploy","status":"success","output":"ok","error":"","createdAt":"now"}"#;
        let history: crate::models::DeploymentHistory =
            serde_json::from_str(old).expect("deserialize old history");
        assert_eq!(history.verification_status, "not_configured");
        assert_eq!(history.rollback_status, "not_attempted");
    }

    #[test]
    fn artifact_registration_is_scoped_and_rejects_sensitive_or_changed_files() {
        let db = Database::init(":memory:").expect("db");
        let root = tempfile::tempdir().expect("root");
        let outside = tempfile::tempdir().expect("outside");
        let artifact_path = root.path().join("release.tar.gz");
        fs::write(&artifact_path, b"release-v1").expect("write artifact");
        let outside_path = outside.path().join("other.tar.gz");
        fs::write(&outside_path, b"outside").expect("write outside");
        DeploymentService::authorize_artifact_root(&db, root.path().to_str().expect("root path"))
            .expect("authorize root");
        assert!(DeploymentService::register_artifact(
            &db,
            outside_path.to_str().expect("outside path")
        )
        .is_err());

        let artifact = DeploymentService::register_artifact(
            &db,
            artifact_path.to_str().expect("artifact path"),
        )
        .expect("register artifact");
        assert_eq!(artifact.size, 10);
        assert_eq!(artifact.sha256.len(), 64);

        let secret_path = root.path().join("client.pem");
        fs::write(&secret_path, b"private-key").expect("write secret");
        assert!(DeploymentService::register_artifact(
            &db,
            secret_path.to_str().expect("secret path")
        )
        .is_err());

        fs::write(&artifact_path, b"release-v2").expect("change artifact");
        assert!(DeploymentService::get_artifact(&db, &artifact.id).is_ok());
        assert!(super::snapshot_artifact(&artifact_path).is_ok());
        assert!(DeploymentService::validate_target_artifact(
            &db,
            &crate::models::DeployTarget {
                id: "target".into(),
                name: "target".into(),
                server_id: 1,
                recipe: "custom-script".into(),
                remote_path: "/opt/app".into(),
                artifact_path: "/tmp/release.tar.gz".into(),
                artifact_id: Some(artifact.id),
                health_command: "true".into(),
                created_at: String::new(),
                updated_at: String::new(),
            }
        )
        .is_err());
    }

    #[test]
    fn mcp_plan_binds_target_action_version_and_health_check() {
        let db = Database::init(":memory:").expect("db");
        let server_id = db
            .add_server(
                "deploy-test",
                "192.0.2.8",
                22,
                "deploy",
                "password",
                "[]",
                "test",
                "approval",
                "linux",
                "",
                false,
                false,
                None,
                "",
            )
            .expect("server");
        let target = DeploymentService::save_target(
            &db,
            DeployTargetInput {
                id: None,
                name: "web".into(),
                server_id,
                recipe: "custom-script".into(),
                remote_path: "/opt/web".into(),
                artifact_path: Some("/tmp/web.tar".into()),
                artifact_id: None,
                health_command: Some("systemctl is-active nginx".into()),
            },
        )
        .expect("target");
        let (saved_target, command, verification, snapshot) =
            DeploymentService::build_mcp_plan(&db, &target.id, "deploy", Some("v1.2.3"))
                .expect("plan");
        assert_eq!(saved_target.id, target.id);
        assert_eq!(verification, "systemctl is-active nginx");
        let marker = parse_mcp_marker(&command).expect("marker");
        assert_eq!(marker.0, target.id);
        assert_eq!(marker.1, "deploy");
        assert_eq!(marker.2, "v1.2.3");
        assert_eq!(marker.3, snapshot);
        assert!(
            DeploymentService::validate_mcp_command(&db, &command, Some(&verification)).is_ok()
        );

        let mut edited = target.clone();
        edited.remote_path = "/srv/changed".into();
        edited.updated_at = "changed".into();
        db.set_config(
            TARGETS_KEY,
            &serde_json::to_string(&[edited]).expect("json"),
        )
        .expect("save edited target");
        assert!(
            DeploymentService::validate_mcp_command(&db, &command, Some(&verification)).is_err()
        );

        DeploymentService::delete_target(&db, &target.id).expect("delete target");
        assert!(
            DeploymentService::validate_mcp_command(&db, &command, Some(&verification)).is_err()
        );
    }
}
