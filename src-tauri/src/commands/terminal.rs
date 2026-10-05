use tauri::Manager;

use crate::error::CommandError;
use crate::models::{TerminalOpenRequest, TerminalSessionInfo};
use crate::state::AppState;

/// 建立交互式 SSH PTY 会话。阻塞握手放入专用线程池，避免卡住 IPC 调度。
#[tauri::command]
pub async fn open_terminal_session(
    app: tauri::AppHandle,
    request: TerminalOpenRequest,
) -> Result<TerminalSessionInfo, CommandError> {
    let task_app = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let state = task_app.state::<AppState>();
        state
            .terminals
            .open(task_app.clone(), &state.db, request)
            .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("SSH 终端任务异常终止: {error}"),
    })?
}

/// 列出当前进程仍保持的终端会话，用于切换菜单后恢复标签和屏幕输出。
#[tauri::command]
pub fn list_terminal_sessions(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<TerminalSessionInfo>, CommandError> {
    Ok(state.terminals.list())
}

/// 应用退出前统一请求关闭所有 SSH PTY 会话。
#[tauri::command]
pub fn close_all_terminal_sessions(state: tauri::State<'_, AppState>) -> Result<(), CommandError> {
    state.terminals.close_all();
    Ok(())
}

/// 向远程 PTY 写入原始键盘数据。
#[tauri::command]
pub fn write_terminal_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
    data: String,
) -> Result<(), CommandError> {
    state
        .terminals
        .write(&session_id, data)
        .map_err(CommandError::from)
}

/// 同步前端终端尺寸，保证远程 TTY 的换行与全屏程序布局正确。
#[tauri::command]
pub fn resize_terminal_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
    cols: u32,
    rows: u32,
) -> Result<(), CommandError> {
    state
        .terminals
        .resize(&session_id, cols, rows)
        .map_err(CommandError::from)
}

/// 主动关闭 SSH PTY 会话。重复关闭按幂等成功处理。
#[tauri::command]
pub fn close_terminal_session(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<(), CommandError> {
    state
        .terminals
        .close(&session_id)
        .map_err(CommandError::from)
}
