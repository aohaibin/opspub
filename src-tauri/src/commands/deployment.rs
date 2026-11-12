use crate::error::CommandError;
use crate::models::{
    DeployRunRequest, DeployRunResult, DeployTarget, DeployTargetInput, DeploymentArtifact,
    DeploymentGroup, DeploymentGroupInput, DeploymentGroupRunRequest, DeploymentGroupRunResult,
    DeploymentHistory,
};
use crate::services::deployment::DeploymentService;
use crate::state::AppState;

#[tauri::command]
pub fn authorize_deploy_artifact_root(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<String, CommandError> {
    DeploymentService::authorize_artifact_root(&state.db, &path).map_err(Into::into)
}

#[tauri::command]
pub fn list_deploy_artifact_roots(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<String>, CommandError> {
    DeploymentService::list_artifact_roots(&state.db).map_err(Into::into)
}

#[tauri::command]
pub fn register_deploy_artifact(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<DeploymentArtifact, CommandError> {
    DeploymentService::register_artifact(&state.db, &path).map_err(Into::into)
}

#[tauri::command]
pub fn list_deploy_artifacts(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DeploymentArtifact>, CommandError> {
    DeploymentService::list_artifacts(&state.db).map_err(Into::into)
}

#[tauri::command]
pub fn revoke_deploy_artifact(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, CommandError> {
    DeploymentService::revoke_artifact(&state.db, &id).map_err(Into::into)
}

#[tauri::command]
pub fn list_deploy_targets(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DeployTarget>, CommandError> {
    DeploymentService::list_targets(&state.db).map_err(Into::into)
}

#[tauri::command]
pub fn save_deploy_target(
    state: tauri::State<'_, AppState>,
    input: DeployTargetInput,
) -> Result<DeployTarget, CommandError> {
    DeploymentService::save_target(&state.db, input).map_err(Into::into)
}

#[tauri::command]
pub fn delete_deploy_target(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, CommandError> {
    DeploymentService::delete_target(&state.db, &id).map_err(Into::into)
}

#[tauri::command]
pub fn list_deployment_groups(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DeploymentGroup>, CommandError> {
    DeploymentService::list_groups(&state.db).map_err(Into::into)
}

#[tauri::command]
pub fn save_deployment_group(
    state: tauri::State<'_, AppState>,
    input: DeploymentGroupInput,
) -> Result<DeploymentGroup, CommandError> {
    DeploymentService::save_group(&state.db, input).map_err(Into::into)
}

#[tauri::command]
pub fn delete_deployment_group(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, CommandError> {
    DeploymentService::delete_group(&state.db, &id).map_err(Into::into)
}

#[tauri::command]
pub fn list_deployment_history(
    state: tauri::State<'_, AppState>,
    target_id: Option<String>,
) -> Result<Vec<DeploymentHistory>, CommandError> {
    DeploymentService::list_history(&state.db, target_id.as_deref()).map_err(Into::into)
}

#[tauri::command]
pub async fn deploy_target(
    app: tauri::AppHandle,
    request: DeployRunRequest,
) -> Result<DeployRunResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        DeploymentService::deploy(app, request, "deploy").map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("部署任务异常终止: {error}"),
    })?
}

#[tauri::command]
pub async fn rollback_deploy_target(
    app: tauri::AppHandle,
    request: DeployRunRequest,
) -> Result<DeployRunResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        DeploymentService::deploy(app, request, "rollback").map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("回滚任务异常终止: {error}"),
    })?
}

#[tauri::command]
pub async fn deploy_group(
    app: tauri::AppHandle,
    request: DeploymentGroupRunRequest,
) -> Result<DeploymentGroupRunResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        DeploymentService::deploy_group(app, request).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("部署组任务异常终止: {error}"),
    })?
}
