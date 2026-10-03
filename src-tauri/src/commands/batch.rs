use crate::error::CommandError;
use crate::services::batch::{BatchService, BatchTargetRequest, BatchTargetResult};
use crate::state::AppState;
use tauri::Manager;

#[tauri::command]
pub async fn execute_batch_target(
    app: tauri::AppHandle,
    request: BatchTargetRequest,
) -> Result<BatchTargetResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        BatchService::execute(&state.db, request).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("批量目标任务异常终止: {error}"),
    })?
}
