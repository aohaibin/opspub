use super::{audit::AuditService, copilot::CopilotService, model_service::ModelService};
use crate::{error::AppError, models::CopilotRequest, state::AppState};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};

pub fn bootstrap(app: &AppHandle) -> Result<Value, AppError> {
    let state = app.state::<AppState>();
    // Only expose selection metadata: never serialize connection credentials or provider settings.
    let servers = state
        .db
        .get_all_servers()?
        .into_iter()
        .map(|server| json!({"id":server.id,"alias":server.alias}))
        .collect::<Vec<_>>();
    let models = ModelService::list(&state.db)?
        .into_iter()
        .filter(|profile| profile.enabled)
        .map(|profile| json!({"id":profile.id,"name":profile.name}))
        .collect::<Vec<_>>();
    Ok(
        json!({"servers":servers,"models":models,"lock":CopilotService::get_lock(app)?,"channel":super::device_channel::status(&state.device_channel)?}),
    )
}

pub fn lock(app: &AppHandle, device: &str) -> Result<Value, AppError> {
    AuditService::add_log(
        &app.state::<AppState>().db,
        "全局",
        "mobile_emergency_lock",
        &format!("device:{device}"),
        "requested",
    )?;
    Ok(serde_json::to_value(CopilotService::set_lock(
        app, "locked",
    )?)?)
}

pub fn decide(app: AppHandle, device: &str, id: i64, approve: bool) -> Result<Value, AppError> {
    // Existing approval service checks expiry, plan hash, policy version, AI lock and post-verification.
    AuditService::add_log(
        &app.state::<AppState>().db,
        "全局",
        &format!("mobile_approval:{id}"),
        &format!("device:{device}"),
        if approve {
            "approve_requested"
        } else {
            "reject_requested"
        },
    )?;
    if approve {
        Ok(serde_json::to_value(CopilotService::approve_and_execute(
            app, id,
        )?)?)
    } else {
        CopilotService::reject_approval(&app, id, "已配对手机人工驳回")?;
        Ok(json!({"ok":true}))
    }
}

pub fn chat(app: AppHandle, device: &str, request: CopilotRequest) -> Result<Value, AppError> {
    if request.history.len() > 40
        || request.history.iter().any(|item| {
            item.content.len() > 16_000 || !matches!(item.role.as_str(), "user" | "assistant")
        })
    {
        return Err(AppError::InvalidInput(
            "聊天历史过长或角色无效，请新建会话".into(),
        ));
    }
    AuditService::add_log(
        &app.state::<AppState>().db,
        "全局",
        "mobile_copilot_chat",
        &format!("device:{device}"),
        "requested",
    )?;
    Ok(serde_json::to_value(CopilotService::chat(app, request)?)?)
}

pub fn knowledge(query: &str) -> Result<Value, AppError> {
    if query.chars().count() > 100 {
        return Err(AppError::InvalidInput("搜索词不能超过 100 字".into()));
    }
    let query = query.trim().to_lowercase();
    // Share the same bundled 41-skill knowledge source as the desktop Skills page.
    let source = include_str!("../../../docs/skills-index-20261006.md");
    let entries = source
        .split("\n## ")
        .skip(1)
        .filter_map(|section| {
            let (title, content) = section.split_once('\n')?;
            let number = title.split('.').next()?.parse::<u32>().ok()?;
            if !(1..=41).contains(&number)
                || (!query.is_empty() && !section.to_lowercase().contains(&query))
            {
                return None;
            }
            Some(json!({"title":title.trim(),"content":content.trim()}))
        })
        .take(41)
        .collect::<Vec<_>>();
    Ok(json!({"source":"内置运维技能知识库","entries":entries}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn knowledge_search_uses_the_same_41_bundled_skills() {
        assert_eq!(
            knowledge("").expect("all")["entries"]
                .as_array()
                .expect("entries")
                .len(),
            41
        );
        assert!(!knowledge("docker").expect("search")["entries"]
            .as_array()
            .expect("entries")
            .is_empty());
        assert!(knowledge("no-such-skill-xyz").expect("empty")["entries"]
            .as_array()
            .expect("entries")
            .is_empty());
    }
}
