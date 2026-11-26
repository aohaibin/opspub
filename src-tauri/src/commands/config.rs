use crate::error::CommandError;
use crate::models::AppConfig;
use crate::services::app_logo::{self, LogoColor, LogoSyncResult};
use crate::services::config::ConfigService;
use crate::state::AppState;

/// 获取所有配置
#[tauri::command]
pub fn get_all_config(state: tauri::State<'_, AppState>) -> Result<Vec<AppConfig>, CommandError> {
    ConfigService::get_all(&state.db).map_err(|e| e.into())
}

/// 获取单个配置
#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>, key: String) -> Result<String, CommandError> {
    ConfigService::get(&state.db, &key).map_err(|e| e.into())
}

/// 设置配置
#[tauri::command]
pub fn set_config(
    state: tauri::State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), CommandError> {
    ConfigService::set(&state.db, &key, &value).map_err(|e| e.into())
}

/// 删除配置
#[tauri::command]
pub fn delete_config(state: tauri::State<'_, AppState>, key: String) -> Result<(), CommandError> {
    ConfigService::delete(&state.db, &key).map_err(|e| e.into())
}

/// 保存 Logo 配色并同步可更新的系统图标。
#[tauri::command]
pub async fn save_logo_color(
    app: tauri::AppHandle,
    color: LogoColor,
) -> Result<LogoSyncResult, CommandError> {
    app_logo::save(app, color).await.map_err(Into::into)
}
