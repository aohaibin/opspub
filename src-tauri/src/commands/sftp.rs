use crate::error::CommandError;
use crate::models::{
    SftpArchiveRequest, SftpChmodRequest, SftpCopyRequest, SftpFileEntry, SftpPathRequest,
    SftpRenameRequest, SftpRequest, SftpUploadRequest,
};
use crate::services::sftp::SftpService;
use crate::state::AppState;
use tauri::Manager;

/// 读取远程目录。
#[tauri::command]
pub async fn sftp_list(
    app: tauri::AppHandle,
    request: SftpRequest,
    path: String,
) -> Result<Vec<SftpFileEntry>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        SftpService::list(&state.db, request, &path).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("读取 SFTP 目录任务异常终止: {error}"),
    })?
}

/// 上传本地文件内容到远程目录。
#[tauri::command]
pub async fn sftp_upload(
    app: tauri::AppHandle,
    input: SftpUploadRequest,
) -> Result<SftpFileEntry, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        SftpService::upload(&state.db, input).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("上传 SFTP 文件任务异常终止: {error}"),
    })?
}

/// 下载远程文件内容。
#[tauri::command]
pub async fn sftp_download(
    app: tauri::AppHandle,
    input: SftpPathRequest,
) -> Result<Vec<u8>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        SftpService::download(&state.db, input).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("下载 SFTP 文件任务异常终止: {error}"),
    })?
}

/// 创建远程目录。
#[tauri::command]
pub async fn sftp_mkdir(app: tauri::AppHandle, input: SftpPathRequest) -> Result<(), CommandError> {
    run_unit(app, move |state| SftpService::mkdir(&state.db, input)).await
}

/// 重命名远程文件或目录。
#[tauri::command]
pub async fn sftp_rename(
    app: tauri::AppHandle,
    input: SftpRenameRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| SftpService::rename(&state.db, input)).await
}

/// 复制远程文件或目录。
#[tauri::command]
pub async fn sftp_copy(app: tauri::AppHandle, input: SftpCopyRequest) -> Result<(), CommandError> {
    run_unit(app, move |state| SftpService::copy(&state.db, input)).await
}

/// 修改远程文件或目录权限。
#[tauri::command]
pub async fn sftp_chmod(
    app: tauri::AppHandle,
    input: SftpChmodRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| SftpService::chmod(&state.db, input)).await
}

/// 递归删除远程文件或目录。
#[tauri::command]
pub async fn sftp_delete(
    app: tauri::AppHandle,
    input: SftpPathRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| SftpService::delete(&state.db, input)).await
}

/// 在远程主机上用 tar 创建 gzip 压缩包。
#[tauri::command]
pub async fn sftp_archive(
    app: tauri::AppHandle,
    input: SftpArchiveRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| SftpService::archive(&state.db, input)).await
}

async fn run_unit<F>(app: tauri::AppHandle, operation: F) -> Result<(), CommandError>
where
    F: FnOnce(&AppState) -> Result<(), crate::error::AppError> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        operation(&state).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("SFTP 任务异常终止: {error}"),
    })?
}
