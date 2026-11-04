use crate::error::CommandError;
use crate::services::alerts::AlertService;

#[tauri::command]
pub fn save_alert_webhook_url(url: String) -> Result<(), CommandError> {
    AlertService::save_webhook_url(&url).map_err(CommandError::from)
}

#[tauri::command]
pub fn get_alert_webhook_status() -> Result<bool, CommandError> {
    AlertService::webhook_configured().map_err(CommandError::from)
}

#[tauri::command]
pub fn delete_alert_webhook_url() -> Result<(), CommandError> {
    AlertService::delete_webhook_url().map_err(CommandError::from)
}

#[tauri::command]
pub async fn send_alert_webhook(title: String, body: String) -> Result<(), CommandError> {
    tauri::async_runtime::spawn_blocking(move || AlertService::send_webhook(&title, &body))
        .await
        .map_err(|error| CommandError {
            code: "INTERNAL".into(),
            message: format!("Webhook 任务异常终止: {error}"),
        })?
        .map_err(CommandError::from)
}
