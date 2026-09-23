use crate::error::CommandError;
use crate::models::{WorkbenchCommandRequest, WorkbenchCommandResult};
use crate::services::workbench::WorkbenchService;
use crate::state::AppState;
use tauri::Manager;

/// 执行工作台发起的单次远程命令。
#[tauri::command]
pub async fn execute_workbench_command(
    app: tauri::AppHandle,
    request: WorkbenchCommandRequest,
) -> Result<WorkbenchCommandResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        WorkbenchService::execute(&state.db, request).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("工作台命令任务异常终止: {error}"),
    })?
}
