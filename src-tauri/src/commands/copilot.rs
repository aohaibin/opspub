use crate::error::CommandError;
use crate::models::{AiApproval, AiLockState, CopilotRequest, CopilotResponse};
use crate::services::copilot::CopilotService;

#[tauri::command]
pub async fn copilot_chat(
    app: tauri::AppHandle,
    request: CopilotRequest,
) -> Result<CopilotResponse, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        CopilotService::chat(app, request).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("AI 助手任务异常终止: {error}"),
    })?
}

#[tauri::command]
pub fn get_ai_lock(app: tauri::AppHandle) -> Result<AiLockState, CommandError> {
    CopilotService::get_lock(&app).map_err(Into::into)
}

#[tauri::command]
pub fn set_ai_lock(app: tauri::AppHandle, duration: String) -> Result<AiLockState, CommandError> {
    CopilotService::set_lock(&app, &duration).map_err(Into::into)
}

#[tauri::command]
pub fn list_ai_approvals(app: tauri::AppHandle) -> Result<Vec<AiApproval>, CommandError> {
    CopilotService::list_approvals(&app).map_err(Into::into)
}

#[tauri::command]
pub fn reject_ai_approval(app: tauri::AppHandle, id: i64) -> Result<(), CommandError> {
    CopilotService::reject_approval(&app, id).map_err(Into::into)
}

#[tauri::command]
pub async fn approve_ai_approval(
    app: tauri::AppHandle,
    id: i64,
) -> Result<AiApproval, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        CopilotService::approve_and_execute(app, id).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("审批任务异常终止: {error}"),
    })?
}
