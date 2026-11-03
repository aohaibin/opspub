use crate::error::CommandError;
use crate::models::PolicyRule;
use crate::services::policy::PolicyRuleService;
use crate::state::AppState;
use tauri::Manager;

#[tauri::command]
pub fn list_policy_rules(
    app: tauri::AppHandle,
    include_disabled: Option<bool>,
) -> Result<Vec<PolicyRule>, CommandError> {
    PolicyRuleService::list(
        &app.state::<AppState>().db,
        include_disabled.unwrap_or(false),
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn save_policy_rule(
    app: tauri::AppHandle,
    rule: PolicyRule,
) -> Result<PolicyRule, CommandError> {
    PolicyRuleService::save(&app.state::<AppState>().db, rule).map_err(Into::into)
}

#[tauri::command]
pub fn set_policy_rule_enabled(
    app: tauri::AppHandle,
    id: String,
    enabled: bool,
) -> Result<bool, CommandError> {
    PolicyRuleService::set_enabled(&app.state::<AppState>().db, &id, enabled).map_err(Into::into)
}

#[tauri::command]
pub fn delete_policy_rule(app: tauri::AppHandle, id: String) -> Result<bool, CommandError> {
    PolicyRuleService::delete(&app.state::<AppState>().db, &id).map_err(Into::into)
}
