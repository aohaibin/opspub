use crate::{
    error::CommandError,
    models::server_import::*,
    services::server_import::{self, ServerImportService},
    state::AppState,
};
use tauri::Manager;

#[tauri::command]
pub async fn preview_server_import(
    app: tauri::AppHandle,
    request: ImportPreviewRequest,
) -> Result<ImportPreview, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = app.path().home_dir().map_err(|_| CommandError {
            code: "IO_ERROR".into(),
            message: "无法获取用户目录".into(),
        })?;
        app.state::<ServerImportService>()
            .preview(&app.state::<AppState>().db, request, &home)
            .map_err(CommandError::from)
    })
    .await
    .map_err(task_error)?
}

#[tauri::command]
pub async fn commit_server_import(
    app: tauri::AppHandle,
    request: ImportCommitRequest,
) -> Result<Vec<ImportOutcome>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        app.state::<ServerImportService>()
            .commit(&app.state::<AppState>().db, request)
            .map_err(CommandError::from)
    })
    .await
    .map_err(task_error)?
}

#[tauri::command]
pub fn discard_server_import(
    state: tauri::State<'_, ServerImportService>,
    token: String,
) -> Result<(), CommandError> {
    state.discard(&token).map_err(CommandError::from)
}

#[tauri::command]
pub async fn save_server_import_template(
    app: tauri::AppHandle,
    path: String,
) -> Result<(), CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let groups = app
            .state::<AppState>()
            .db
            .get_all_servers()
            .map_err(CommandError::from)?
            .into_iter()
            .map(|s| s.group)
            .collect();
        server_import::save_template(std::path::Path::new(&path), groups)
            .map_err(CommandError::from)
    })
    .await
    .map_err(task_error)?
}

#[tauri::command]
pub async fn open_server_remote_desktop(
    app: tauri::AppHandle,
    server_id: i64,
) -> Result<(), CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        server_import::open_remote_desktop(&app.state::<AppState>().db, server_id)
            .map_err(CommandError::from)
    })
    .await
    .map_err(task_error)?
}

fn task_error(_: impl std::fmt::Display) -> CommandError {
    CommandError {
        code: "INTERNAL".into(),
        message: "导入后台任务异常结束，请重新选择文件".into(),
    }
}
