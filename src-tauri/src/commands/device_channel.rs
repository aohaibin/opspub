use tauri::State;

use crate::{
    error::CommandError,
    services::device_channel::{
        self, DeviceChannelStatus, NetworkInterface, PairedDevice, PairingSession,
    },
    state::AppState,
};

#[tauri::command]
pub fn list_device_network_interfaces() -> Result<Vec<NetworkInterface>, CommandError> {
    device_channel::list_private_interfaces().map_err(Into::into)
}

#[tauri::command]
pub async fn create_phone_pairing_session(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    address: String,
) -> Result<PairingSession, CommandError> {
    device_channel::start_pairing(&state.device_channel, app, &address)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn start_device_channel(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    address: String,
) -> Result<DeviceChannelStatus, CommandError> {
    device_channel::start_channel(&state.device_channel, app, &address)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub async fn stop_device_channel(state: State<'_, AppState>) -> Result<(), CommandError> {
    device_channel::stop_channel(&state.device_channel)
        .await
        .map_err(Into::into)
}

#[tauri::command]
pub fn get_device_channel_status(
    state: State<'_, AppState>,
) -> Result<DeviceChannelStatus, CommandError> {
    device_channel::status(&state.device_channel).map_err(Into::into)
}

#[tauri::command]
pub fn list_paired_devices(state: State<'_, AppState>) -> Result<Vec<PairedDevice>, CommandError> {
    device_channel::list_devices(&state.db).map_err(Into::into)
}

#[tauri::command]
pub fn revoke_paired_device(state: State<'_, AppState>, id: String) -> Result<(), CommandError> {
    device_channel::revoke_device(&state.db, &id).map_err(Into::into)
}

#[tauri::command]
pub async fn cancel_phone_pairing_session(
    state: State<'_, AppState>,
    session_id: String,
) -> Result<(), CommandError> {
    device_channel::cancel_pairing(&state.device_channel, &session_id)
        .await
        .map_err(Into::into)
}
