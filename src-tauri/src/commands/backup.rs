use crate::{
    error::CommandError,
    services::backup::{BackupService, BackupStorageEndpoint, BackupStorageInput},
    state::AppState,
};

#[tauri::command]
pub fn export_workspace_backup(
    state: tauri::State<'_, AppState>,
    path: String,
    passphrase: String,
) -> Result<(), CommandError> {
    BackupService::export(&state.db, &path, &passphrase).map_err(Into::into)
}

#[tauri::command]
pub fn restore_workspace_backup(
    state: tauri::State<'_, AppState>,
    path: String,
    passphrase: String,
) -> Result<(), CommandError> {
    BackupService::restore(&state.db, &path, &passphrase).map_err(CommandError::from)?;
    state.terminals.close_all();
    state.sftps.close_all();
    Ok(())
}

#[tauri::command]
pub fn list_backup_storage(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<BackupStorageEndpoint>, CommandError> {
    BackupService::list_storage(&state.db).map_err(Into::into)
}

#[tauri::command]
pub fn save_backup_storage(
    state: tauri::State<'_, AppState>,
    input: BackupStorageInput,
) -> Result<BackupStorageEndpoint, CommandError> {
    BackupService::save_storage(&state.db, input).map_err(Into::into)
}

#[tauri::command]
pub fn delete_backup_storage(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), CommandError> {
    BackupService::delete_storage(&state.db, &id).map_err(Into::into)
}

#[tauri::command]
pub fn test_backup_storage(
    state: tauri::State<'_, AppState>,
    input: BackupStorageInput,
) -> Result<(), CommandError> {
    BackupService::test_storage(&state.db, &input).map_err(Into::into)
}

#[tauri::command]
pub fn push_backup_to_storage(
    state: tauri::State<'_, AppState>,
    endpoint_id: String,
    local_path: String,
) -> Result<String, CommandError> {
    BackupService::push_backup(&state.db, &endpoint_id, &local_path).map_err(Into::into)
}

#[tauri::command]
pub fn pull_backup_from_storage(
    state: tauri::State<'_, AppState>,
    endpoint_id: String,
    filename: String,
    local_path: String,
) -> Result<(), CommandError> {
    BackupService::pull_backup(&state.db, &endpoint_id, &filename, &local_path).map_err(Into::into)
}
