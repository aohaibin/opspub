use crate::{
    error::CommandError,
    models::server_form::{ServerFormProbeResult, ServerFormRequest},
    services::server_form::ServerFormService,
    state::AppState,
};
use tauri::Manager;

#[tauri::command]
pub async fn save_server_form(
    app: tauri::AppHandle,
    request: ServerFormRequest,
) -> Result<i64, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<ServerFormService>()
            .save(&app.state::<AppState>().db, request)
            .map_err(CommandError::from)
    })
    .await
    .map_err(task_error)?
}

#[tauri::command]
pub async fn test_server_form(
    app: tauri::AppHandle,
    request: ServerFormRequest,
    trusted_fingerprint: Option<String>,
) -> Result<ServerFormProbeResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<ServerFormService>()
            .probe(&app.state::<AppState>().db, request, trusted_fingerprint)
            .map_err(CommandError::from)
    })
    .await
    .map_err(task_error)?
}

fn task_error(_: impl std::fmt::Display) -> CommandError {
    CommandError {
        code: "INTERNAL".into(),
        message: "服务器配置任务异常结束，请重试".into(),
    }
}
