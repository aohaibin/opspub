use crate::error::CommandError;
use crate::models::{SensitiveEntry, SensitiveListFilter, SensitiveScanRequest, SensitiveScanResult};
use crate::services::sensitive::SensitiveService;
use crate::state::AppState;

#[tauri::command]
pub fn list_sensitive_entries(
    state: tauri::State<'_, AppState>,
    filter: SensitiveListFilter,
) -> Result<Vec<SensitiveEntry>, CommandError> {
    SensitiveService::list(&state.db, filter).map_err(Into::into)
}

#[tauri::command]
pub fn scan_sensitive_content(
    state: tauri::State<'_, AppState>,
    request: SensitiveScanRequest,
) -> Result<SensitiveScanResult, CommandError> {
    SensitiveService::scan(&state.db, request).map_err(Into::into)
}

#[tauri::command]
pub fn update_sensitive_status(
    state: tauri::State<'_, AppState>,
    id: i64,
    status: String,
) -> Result<bool, CommandError> {
    SensitiveService::update_status(&state.db, id, &status).map_err(Into::into)
}

#[tauri::command]
pub fn delete_sensitive_entry(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<bool, CommandError> {
    SensitiveService::delete(&state.db, id).map_err(Into::into)
}

#[tauri::command]
pub fn export_sensitive_csv(
    state: tauri::State<'_, AppState>,
    filter: SensitiveListFilter,
) -> Result<String, CommandError> {
    SensitiveService::export_csv(&state.db, filter).map_err(Into::into)
}
