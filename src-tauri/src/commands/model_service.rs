use crate::{error::CommandError, models::{ModelImportBatchResult, ModelProfileInput, ModelProfileSummary, ModelVerifyOutcome}, services::model_service::ModelService};
use tauri::Manager;

#[tauri::command]
pub fn list_model_vendors() -> Result<Vec<ai_profile::Vendor>, CommandError> { Ok(ModelService::vendors()) }

#[tauri::command]
pub fn get_model_preset(key: String) -> Result<Option<&'static ai_profile::ProviderPreset>, CommandError> { Ok(ModelService::preset(&key)) }

#[tauri::command]
pub fn list_model_profiles(app: tauri::AppHandle) -> Result<Vec<ModelProfileSummary>, CommandError> { ModelService::list(&app.state::<crate::state::AppState>().db).map_err(Into::into) }

#[tauri::command]
pub fn save_model_profile(app: tauri::AppHandle, input: ModelProfileInput) -> Result<ModelProfileSummary, CommandError> { ModelService::save(&app.state::<crate::state::AppState>().db, input).map_err(Into::into) }

#[tauri::command]
pub fn delete_model_profile(app: tauri::AppHandle, id: String) -> Result<(), CommandError> { ModelService::delete(&app.state::<crate::state::AppState>().db, &id).map_err(Into::into) }

#[tauri::command]
pub fn export_model_profile(app: tauri::AppHandle, id: String) -> Result<String, CommandError> { ModelService::export(&app.state::<crate::state::AppState>().db, &id).map_err(Into::into) }

#[tauri::command]
pub async fn verify_model_service(app: tauri::AppHandle, input: ModelProfileInput) -> Result<ModelVerifyOutcome, CommandError> {
    let state = app.state::<crate::state::AppState>();
    ModelService::verify(&state.verifier, &input, input.id.as_deref()).await.map_err(Into::into)
}

#[tauri::command]
pub fn import_model_profiles(app: tauri::AppHandle, text: String) -> Result<ModelImportBatchResult, CommandError> { ModelService::import(&app.state::<crate::state::AppState>().db, &text).map_err(Into::into) }
