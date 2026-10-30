use crate::error::CommandError;
use crate::services::inspection::InspectionService;
use crate::state::AppState;
use tauri::Manager;

#[tauri::command]
pub async fn run_inspection_probe(
    app: tauri::AppHandle,
    server_id: i64,
) -> Result<crate::models::WorkbenchCommandResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        InspectionService::run_probe(&app.state::<AppState>().db, server_id)
            .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("巡检探针任务异常终止: {error}"),
    })?
}
