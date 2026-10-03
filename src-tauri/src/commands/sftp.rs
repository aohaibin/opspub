use crate::error::CommandError;
use crate::models::{
    SftpArchiveRequest, SftpChmodRequest, SftpCopyRequest, SftpFileEntry, SftpPathRequest,
    SftpRenameRequest, SftpRequest, SftpSessionInfo, SftpUploadRequest,
};
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
        state
            .sftps
            .list(&state.db, request, &path)
            .map_err(CommandError::from)
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
        state
            .sftps
            .upload(&state.db, input)
            .map_err(CommandError::from)
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
        state
            .sftps
            .download(&state.db, input)
            .map_err(CommandError::from)
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
    run_unit(app, move |state| state.sftps.mkdir(&state.db, input)).await
}

/// 重命名远程文件或目录。
#[tauri::command]
pub async fn sftp_rename(
    app: tauri::AppHandle,
    input: SftpRenameRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| state.sftps.rename(&state.db, input)).await
}

/// 复制远程文件或目录。
#[tauri::command]
pub async fn sftp_copy(app: tauri::AppHandle, input: SftpCopyRequest) -> Result<(), CommandError> {
    run_unit(app, move |state| state.sftps.copy(&state.db, input)).await
}

/// 修改远程文件或目录权限。
#[tauri::command]
pub async fn sftp_chmod(
    app: tauri::AppHandle,
    input: SftpChmodRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| state.sftps.chmod(&state.db, input)).await
}

/// 递归删除远程文件或目录。
#[tauri::command]
pub async fn sftp_delete(
    app: tauri::AppHandle,
    input: SftpPathRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| state.sftps.delete(&state.db, input)).await
}

/// 在远程主机上用 tar 创建 gzip 压缩包。
#[tauri::command]
pub async fn sftp_archive(
    app: tauri::AppHandle,
    input: SftpArchiveRequest,
) -> Result<(), CommandError> {
    run_unit(app, move |state| state.sftps.archive(&state.db, input)).await
}

/// 建立或复用指定服务器的 SFTP 会话。
#[tauri::command]
pub async fn open_sftp_session(
    app: tauri::AppHandle,
    request: SftpRequest,
) -> Result<SftpSessionInfo, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        state
            .sftps
            .open(&state.db, request)
            .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("建立 SFTP 会话任务异常终止: {error}"),
    })?
}

/// 列出当前仍保持的 SFTP 会话，用于切换菜单后恢复标签。
#[tauri::command]
pub fn list_sftp_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<SftpSessionInfo>, CommandError> {
    Ok(state.sftps.list_sessions())
}

/// 手动关闭指定服务器的 SFTP 会话。
#[tauri::command]
pub fn close_sftp_session(
    state: tauri::State<'_, AppState>,
    server_id: i64,
) -> Result<(), CommandError> {
    state.sftps.close(server_id);
    Ok(())
}

/// 应用退出前关闭全部 SFTP 会话。
#[tauri::command]
pub fn close_all_sftp_sessions(state: tauri::State<'_, AppState>) -> Result<(), CommandError> {
    state.sftps.close_all();
    Ok(())
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
