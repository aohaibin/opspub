use regex::Regex;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{ActionRiskLevel, PolicyRule};

pub struct PolicyRuleService;

impl PolicyRuleService {
    pub fn list(db: &Database, include_disabled: bool) -> Result<Vec<PolicyRule>, AppError> {
        db.list_policy_rules(include_disabled)
    }

    pub fn save(db: &Database, mut rule: PolicyRule) -> Result<PolicyRule, AppError> {
        if rule.builtin {
            return Err(AppError::InvalidInput(
                "内置策略规则由后端维护，不能从设置页创建或修改".into(),
            ));
        }
        validate_rule(&rule)?;
        let now = chrono::Utc::now().timestamp();
        if rule.created_at <= 0 {
            rule.created_at = now;
        }
        rule.updated_at = now;
        db.save_policy_rule(&rule)?;
        db.get_policy_rule(&rule.id)?
            .ok_or_else(|| AppError::NotFound("策略规则保存后未找到".into()))
    }

    pub fn set_enabled(db: &Database, id: &str, enabled: bool) -> Result<bool, AppError> {
        let id = id.trim();
        if id.is_empty() {
            return Err(AppError::InvalidInput("策略规则 ID 不能为空".into()));
        }
        Ok(db.set_policy_rule_enabled(id, enabled)?)
    }

    pub fn delete(db: &Database, id: &str) -> Result<bool, AppError> {
        let id = id.trim();
        if id.is_empty() {
            return Err(AppError::InvalidInput("策略规则 ID 不能为空".into()));
        }
        db.delete_policy_rule(id)
    }
}

fn validate_rule(rule: &PolicyRule) -> Result<(), AppError> {
    if rule.id.trim().is_empty() || rule.id.len() > 120 {
        return Err(AppError::InvalidInput("策略规则 ID 无效".into()));
    }
    if rule.label.trim().is_empty() || rule.label.len() > 200 {
        return Err(AppError::InvalidInput(
            "策略规则说明不能为空且不能超过 200 个字符".into(),
        ));
    }
    if rule.pattern.trim().is_empty() || rule.pattern.len() > 2_000 {
        return Err(AppError::InvalidInput(
            "策略规则表达式不能为空且不能超过 2000 个字符".into(),
        ));
    }
    Regex::new(rule.pattern.trim())
        .map_err(|error| AppError::InvalidInput(format!("策略规则表达式无效: {error}")))?;
    if !matches!(rule.action.as_str(), "block" | "review") {
        return Err(AppError::InvalidInput(
            "用户规则动作只能是 block 或 review；自动放行必须使用后端受控模板".into(),
        ));
    }
    if matches!(&rule.risk_level, ActionRiskLevel::Extreme) && rule.action != "block" {
        return Err(AppError::InvalidInput(
            "极高危规则必须使用永久阻断动作".into(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_rule;
    use crate::models::{ActionRiskLevel, PolicyRule};

    fn rule() -> PolicyRule {
        PolicyRule {
            id: "custom:test".into(),
            label: "测试规则".into(),
            pattern: r"^echo\s+safe$".into(),
            risk_level: ActionRiskLevel::Medium,
            action: "review".into(),
            enabled: true,
            builtin: false,
            rule_version: "policy-v1".into(),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn validates_regex_and_action() {
        assert!(validate_rule(&rule()).is_ok());
        let mut invalid = rule();
        invalid.pattern = "[".into();
        assert!(validate_rule(&invalid).is_err());
        invalid = rule();
        invalid.action = "execute".into();
        assert!(validate_rule(&invalid).is_err());
        invalid = rule();
        invalid.action = "allow".into();
        assert!(validate_rule(&invalid).is_err());
    }

    #[test]
    fn extreme_rules_must_block() {
        let mut invalid = rule();
        invalid.risk_level = ActionRiskLevel::Extreme;
        invalid.action = "review".into();
        assert!(validate_rule(&invalid).is_err());
    }
}
