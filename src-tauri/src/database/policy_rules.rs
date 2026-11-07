use rusqlite::{params, OptionalExtension};

use crate::error::AppError;
use crate::models::{ActionRiskLevel, PolicyRule};

use super::Database;

impl Database {
    pub fn list_policy_rules(&self, include_disabled: bool) -> Result<Vec<PolicyRule>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let mut statement = conn.prepare(
            "SELECT id, label, pattern, risk_level, action, enabled, builtin, rule_version,
                    created_at, updated_at
             FROM policy_rules
             WHERE (?1 = 1 OR enabled = 1)
             ORDER BY builtin DESC, risk_level, label, id",
        )?;
        let rows = statement
            .query_map([include_disabled as i32], map_policy_rule_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_policy_rule(&self, id: &str) -> Result<Option<PolicyRule>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.query_row(
            "SELECT id, label, pattern, risk_level, action, enabled, builtin, rule_version,
                    created_at, updated_at
             FROM policy_rules WHERE id = ?1",
            [id],
            map_policy_rule_row,
        )
        .optional()
        .map_err(AppError::from)
    }

    pub fn save_policy_rule(&self, rule: &PolicyRule) -> Result<(), AppError> {
        if rule.id.trim().is_empty()
            || rule.label.trim().is_empty()
            || rule.pattern.trim().is_empty()
            || rule.rule_version.trim().is_empty()
        {
            return Err(AppError::InvalidInput("策略规则字段不能为空".into()));
        }
        if rule.builtin && !rule.id.starts_with("builtin:") {
            return Err(AppError::InvalidInput("内置规则 ID 格式无效".into()));
        }
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let existing_builtin: Option<bool> = conn
            .query_row(
                "SELECT builtin != 0 FROM policy_rules WHERE id = ?1",
                [&rule.id],
                |row| row.get(0),
            )
            .optional()?;
        if existing_builtin == Some(true) {
            return Err(AppError::InvalidInput(
                "内置策略规则由后端管理，不能从设置页修改".into(),
            ));
        }
        conn.execute(
            "INSERT INTO policy_rules
             (id, label, pattern, risk_level, action, enabled, builtin, rule_version, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
             ON CONFLICT(id) DO UPDATE SET
               label = excluded.label,
               pattern = excluded.pattern,
               risk_level = excluded.risk_level,
               action = excluded.action,
               enabled = excluded.enabled,
               rule_version = excluded.rule_version,
               updated_at = excluded.updated_at",
            params![
                rule.id,
                rule.label,
                rule.pattern,
                risk_level_name(&rule.risk_level),
                rule.action,
                rule.enabled as i32,
                rule.builtin as i32,
                rule.rule_version,
                rule.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn set_policy_rule_enabled(&self, id: &str, enabled: bool) -> Result<bool, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let changed = conn.execute(
            "UPDATE policy_rules SET enabled = ?1, updated_at = ?2 WHERE id = ?3 AND builtin = 0",
            params![enabled as i32, chrono::Utc::now().timestamp(), id],
        )?;
        Ok(changed > 0)
    }

    pub fn delete_policy_rule(&self, id: &str) -> Result<bool, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let builtin: Option<bool> = conn
            .query_row(
                "SELECT builtin != 0 FROM policy_rules WHERE id = ?1",
                [id],
                |row| row.get(0),
            )
            .optional()?;
        if builtin == Some(true) {
            return Err(AppError::InvalidInput("内置策略规则不可删除".into()));
        }
        Ok(conn.execute("DELETE FROM policy_rules WHERE id = ?1", [id])? > 0)
    }
}

fn map_policy_rule_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<PolicyRule> {
    Ok(PolicyRule {
        id: row.get(0)?,
        label: row.get(1)?,
        pattern: row.get(2)?,
        risk_level: parse_risk_level(&row.get::<_, String>(3)?),
        action: row.get(4)?,
        enabled: row.get::<_, i32>(5)? != 0,
        builtin: row.get::<_, i32>(6)? != 0,
        rule_version: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn risk_level_name(level: &ActionRiskLevel) -> &'static str {
    match level {
        ActionRiskLevel::Extreme => "extreme",
        ActionRiskLevel::High => "high",
        ActionRiskLevel::Medium => "medium",
        ActionRiskLevel::LowReadonly => "low_readonly",
        ActionRiskLevel::Unknown => "unknown",
    }
}

fn parse_risk_level(value: &str) -> ActionRiskLevel {
    match value {
        "extreme" => ActionRiskLevel::Extreme,
        "high" => ActionRiskLevel::High,
        "medium" => ActionRiskLevel::Medium,
        "low_readonly" => ActionRiskLevel::LowReadonly,
        _ => ActionRiskLevel::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::schema;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn database() -> Database {
        let conn = Connection::open_in_memory().expect("open database");
        schema::migrate(&conn).expect("migrate database");
        Database {
            conn: Mutex::new(conn),
            path: std::path::PathBuf::new(),
        }
    }

    fn rule(id: &str, builtin: bool) -> PolicyRule {
        PolicyRule {
            id: id.into(),
            label: "根目录删除".into(),
            pattern: r"^rm\s+-rf\s+/$".into(),
            risk_level: ActionRiskLevel::Extreme,
            action: "block".into(),
            enabled: true,
            builtin,
            rule_version: "policy-v1".into(),
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn policy_rule_crud_preserves_risk_and_enabled_filter() {
        let db = database();
        db.save_policy_rule(&rule("custom-root", false))
            .expect("save custom");
        db.set_policy_rule_enabled("custom-root", false)
            .expect("disable custom");

        let enabled = db.list_policy_rules(false).expect("list enabled");
        assert!(enabled.iter().any(|item| item.id == "builtin:rm-root"));
        assert!(enabled.iter().all(|item| item.id != "custom-root"));
        assert_eq!(
            enabled
                .iter()
                .find(|item| item.id == "builtin:rm-root")
                .map(|item| &item.risk_level),
            Some(&ActionRiskLevel::Extreme)
        );
        let all = db.list_policy_rules(true).expect("list all");
        assert!(all.iter().any(|item| item.id == "builtin:rm-root"));
        assert!(all.iter().any(|item| item.id == "custom-root"));
    }

    #[test]
    fn builtin_rules_cannot_be_deleted_or_downgraded() {
        let db = database();
        assert!(db.delete_policy_rule("builtin:rm-root").is_err());

        let mut downgrade = rule("builtin:rm-root", false);
        downgrade.label = "改写内置".into();
        assert!(db.save_policy_rule(&downgrade).is_err());
    }
}
