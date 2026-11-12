use crate::error::CommandError;
use crate::services::alerts::{AlertEmailConfig, AlertEmailPublicConfig, AlertService};

#[tauri::command]
pub fn get_alert_email_config() -> Result<Option<AlertEmailPublicConfig>, CommandError> {
    AlertService::get_email_config().map_err(CommandError::from)
}

#[tauri::command]
pub fn save_alert_email_config(
    host: String,
    port: u16,
    encryption: String,
    username: String,
    password: String,
    from: String,
    to: String,
) -> Result<(), CommandError> {
    AlertService::save_email_config(AlertEmailConfig {
        host,
        port,
        encryption,
        username,
        password,
        from,
        to,
    })
    .map_err(CommandError::from)
}

#[tauri::command]
pub fn save_alert_channel_url(channel: String, url: String) -> Result<(), CommandError> {
    AlertService::save_channel_url(&channel, &url).map_err(CommandError::from)
}

#[tauri::command]
pub fn get_alert_channel_status(channel: String) -> Result<bool, CommandError> {
    AlertService::channel_configured(&channel).map_err(CommandError::from)
}

#[tauri::command]
pub fn delete_alert_channel_url(channel: String) -> Result<(), CommandError> {
    AlertService::delete_channel_url(&channel).map_err(CommandError::from)
}

#[tauri::command]
pub async fn send_alert_channel(
    channel: String,
    title: String,
    body: String,
) -> Result<(), CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        AlertService::send_channel(&channel, &title, &body)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("通知任务异常终止: {error}"),
    })?
    .map_err(CommandError::from)
}

// Compatibility commands used by older frontend bundles.
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
