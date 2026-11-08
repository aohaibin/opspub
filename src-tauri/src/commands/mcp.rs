use crate::error::CommandError;
use crate::models::{
    McpClientConfig, McpClientState, McpStatus, McpToken, McpTokenCreated, McpTokenInput,
    McpTokenTest, McpToolDefinition,
};
use crate::services::mcp::McpService;
use crate::state::AppState;
use tauri::Manager;

#[tauri::command]
pub fn get_mcp_status(app: tauri::AppHandle) -> Result<McpStatus, CommandError> {
    McpService::status(&app).map_err(Into::into)
}

#[tauri::command]
pub async fn test_mcp_connection(app: tauri::AppHandle) -> Result<McpStatus, CommandError> {
    blocking(move || McpService::test(&app)).await
}

#[tauri::command]
pub async fn start_mcp_http(
    app: tauri::AppHandle,
    port: Option<u16>,
) -> Result<McpStatus, CommandError> {
    let state = app.state::<AppState>();
    McpService::start_http(&state.mcp, app.clone(), port)
        .await
        .map_err(CommandError::from)?;
    McpService::status(&app).map_err(Into::into)
}

#[tauri::command]
pub async fn stop_mcp_http(app: tauri::AppHandle) -> Result<McpStatus, CommandError> {
    let state = app.state::<AppState>();
    McpService::stop_http(&state.mcp)
        .await
        .map_err(CommandError::from)?;
    McpService::status(&app).map_err(Into::into)
}

#[tauri::command]
pub fn list_mcp_tokens(state: tauri::State<'_, AppState>) -> Result<Vec<McpToken>, CommandError> {
    McpService::list_tokens(&state.db).map_err(Into::into)
}

#[tauri::command]
pub async fn create_mcp_token(
    app: tauri::AppHandle,
    input: McpTokenInput,
) -> Result<McpTokenCreated, CommandError> {
    blocking(move || McpService::create_token(&app.state::<AppState>().db, input)).await
}

#[tauri::command]
pub async fn revoke_mcp_token(app: tauri::AppHandle, id: i64) -> Result<bool, CommandError> {
    blocking(move || McpService::revoke_token(&app.state::<AppState>().db, id)).await
}

#[tauri::command]
pub async fn get_mcp_client_config(
    app: tauri::AppHandle,
    token_id: i64,
    client: String,
) -> Result<McpClientConfig, CommandError> {
    blocking(move || {
        McpService::client_config(&app.state::<AppState>().db, &app, token_id, &client)
    })
    .await
}

#[tauri::command]
pub async fn inject_mcp_client_config(
    app: tauri::AppHandle,
    token_id: i64,
    client: String,
) -> Result<McpClientConfig, CommandError> {
    blocking(move || {
        McpService::inject_config(&app.state::<AppState>().db, &app, token_id, &client)
    })
    .await
}

#[tauri::command]
pub async fn list_mcp_clients(app: tauri::AppHandle) -> Result<Vec<McpClientState>, CommandError> {
    blocking(move || McpService::clients(&app)).await
}

#[tauri::command]
pub fn list_mcp_tools() -> Result<Vec<McpToolDefinition>, CommandError> {
    McpService::tools().map_err(Into::into)
}

#[tauri::command]
pub async fn test_mcp_token(
    app: tauri::AppHandle,
    token_id: i64,
) -> Result<McpTokenTest, CommandError> {
    blocking(move || McpService::test_token(&app, token_id)).await
}

async fn blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, crate::error::AppError> + Send + 'static,
) -> Result<T, CommandError> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|_| CommandError {
            code: "INTERNAL".into(),
            message: "MCP 后台任务异常结束，请重试".into(),
        })?
        .map_err(Into::into)
}
