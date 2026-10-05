use crate::error::CommandError;
use crate::models::{McpClientConfig, McpStatus, McpToken, McpTokenCreated, McpTokenInput};
use crate::services::mcp::McpService;
use crate::state::AppState;
use tauri::Manager;

#[tauri::command]
pub fn get_mcp_status(app: tauri::AppHandle) -> Result<McpStatus, CommandError> {
    McpService::status(&app).map_err(Into::into)
}

#[tauri::command]
pub fn test_mcp_connection(app: tauri::AppHandle) -> Result<McpStatus, CommandError> {
    McpService::test(&app).map_err(Into::into)
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
pub fn create_mcp_token(
    state: tauri::State<'_, AppState>,
    input: McpTokenInput,
) -> Result<McpTokenCreated, CommandError> {
    McpService::create_token(&state.db, input).map_err(Into::into)
}

#[tauri::command]
pub fn revoke_mcp_token(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, CommandError> {
    McpService::revoke_token(&state.db, id).map_err(Into::into)
}

#[tauri::command]
pub fn get_mcp_client_config(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    token_id: i64,
    client: String,
) -> Result<McpClientConfig, CommandError> {
    McpService::client_config(&state.db, &app, token_id, &client).map_err(Into::into)
}

#[tauri::command]
pub fn inject_mcp_client_config(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
    token_id: i64,
    client: String,
) -> Result<McpClientConfig, CommandError> {
    McpService::inject_config(&state.db, &app, token_id, &client).map_err(Into::into)
}
