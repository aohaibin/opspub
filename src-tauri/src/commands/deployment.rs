use crate::error::CommandError;
use crate::models::{DeployRunRequest, DeployRunResult, DeployTarget, DeployTargetInput, DeploymentHistory};
use crate::services::deployment::DeploymentService;
use crate::state::AppState;

#[tauri::command]
pub fn list_deploy_targets(state: tauri::State<'_, AppState>) -> Result<Vec<DeployTarget>, CommandError> {
    DeploymentService::list_targets(&state.db).map_err(Into::into)
}

#[tauri::command]
pub fn save_deploy_target(state: tauri::State<'_, AppState>, input: DeployTargetInput) -> Result<DeployTarget, CommandError> {
    DeploymentService::save_target(&state.db, input).map_err(Into::into)
}

#[tauri::command]
pub fn delete_deploy_target(state: tauri::State<'_, AppState>, id: String) -> Result<bool, CommandError> {
    DeploymentService::delete_target(&state.db, &id).map_err(Into::into)
}

#[tauri::command]
pub fn list_deployment_history(state: tauri::State<'_, AppState>, target_id: Option<String>) -> Result<Vec<DeploymentHistory>, CommandError> {
    DeploymentService::list_history(&state.db, target_id.as_deref()).map_err(Into::into)
}

#[tauri::command]
pub async fn deploy_target(app: tauri::AppHandle, request: DeployRunRequest) -> Result<DeployRunResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || DeploymentService::deploy(app, request, "deploy").map_err(CommandError::from))
        .await
        .map_err(|error| CommandError { code: "INTERNAL".into(), message: format!("部署任务异常终止: {error}") })?
}

#[tauri::command]
pub async fn rollback_deploy_target(app: tauri::AppHandle, request: DeployRunRequest) -> Result<DeployRunResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || DeploymentService::deploy(app, request, "rollback").map_err(CommandError::from))
        .await
        .map_err(|error| CommandError { code: "INTERNAL".into(), message: format!("回滚任务异常终止: {error}") })?
}
