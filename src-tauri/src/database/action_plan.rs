use rusqlite::{params, OptionalExtension};

use crate::error::AppError;
use crate::models::{
    ActionPlan, ActionPlanTarget, ActionRiskLevel, ApprovalBatch, RiskAssessment, VerificationStep,
};

use super::Database;

impl Database {
    pub fn create_action_plan(&self, plan: &ActionPlan) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let tx = conn.unchecked_transaction()?;
        let matched_rules = serde_json::to_string(&plan.risk.matched_rules)
            .map_err(|error| AppError::Custom(format!("序列化命中规则失败: {error}")))?;
        tx.execute(
            "INSERT INTO action_plans
             (id, conversation_id, action, summary, original_request, original_command,
              normalized_command, command_sha256, rule_version, risk_level, risk_reason,
              matched_rules, requires_approval, status, expires_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)",
            params![
                plan.id,
                plan.conversation_id,
                plan.action,
                plan.summary,
                plan.original_request,
                plan.original_command,
                plan.normalized_command,
                plan.command_sha256,
                plan.rule_version,
                risk_level_name(&plan.risk.level),
                plan.risk.reason,
                matched_rules,
                plan.risk.requires_approval as i32,
                plan.status,
                plan.expires_at,
                plan.created_at,
            ],
        )?;

        for (sequence_no, target) in plan.targets.iter().enumerate() {
            tx.execute(
                "INSERT INTO action_plan_targets
                 (plan_id, server_id, server_alias, sequence_no, role, status)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    plan.id,
                    target.server_id,
                    target.server_alias,
                    sequence_no as i64,
                    target.role,
                    target.status,
                ],
            )?;
        }

        for step in &plan.verification_steps {
            tx.execute(
                "INSERT INTO plan_verifications
                 (plan_id, step_id, label, command, expected_result, required)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    plan.id,
                    step.id,
                    step.label,
                    step.command,
                    step.expected_result,
                    step.required as i32,
                ],
            )?;
        }

        tx.commit()?;
        Ok(())
    }

    pub fn get_action_plan(&self, id: &str) -> Result<Option<ActionPlan>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let row = conn
            .query_row(
                "SELECT id, conversation_id, action, summary, original_request, original_command,
                        normalized_command, command_sha256, rule_version, risk_level, risk_reason,
                        matched_rules, requires_approval, status, expires_at, created_at
                 FROM action_plans WHERE id = ?1",
                [id],
                |row| {
                    let matched_rules: String = row.get(11)?;
                    Ok(ActionPlan {
                        id: row.get(0)?,
                        conversation_id: row.get(1)?,
                        action: row.get(2)?,
                        summary: row.get(3)?,
                        original_request: row.get(4)?,
                        original_command: row.get(5)?,
                        normalized_command: row.get(6)?,
                        command_sha256: row.get(7)?,
                        rule_version: row.get(8)?,
                        risk: RiskAssessment {
                            level: parse_risk_level(&row.get::<_, String>(9)?),
                            reason: row.get(10)?,
                            matched_rules: serde_json::from_str(&matched_rules).map_err(
                                |error| {
                                    rusqlite::Error::FromSqlConversionFailure(
                                        11,
                                        rusqlite::types::Type::Text,
                                        Box::new(error),
                                    )
                                },
                            )?,
                            requires_approval: row.get::<_, i32>(12)? != 0,
                        },
                        targets: Vec::new(),
                        verification_steps: Vec::new(),
                        status: row.get(13)?,
                        expires_at: row.get(14)?,
                        created_at: row.get(15)?,
                    })
                },
            )
            .optional()?;
        let Some(mut plan) = row else {
            return Ok(None);
        };

        let mut target_stmt = conn.prepare(
            "SELECT server_id, server_alias, role, status
             FROM action_plan_targets WHERE plan_id = ?1 ORDER BY sequence_no, id",
        )?;
        plan.targets = target_stmt
            .query_map([id], |row| {
                Ok(ActionPlanTarget {
                    server_id: row.get(0)?,
                    server_alias: row.get(1)?,
                    role: row.get(2)?,
                    status: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        let mut verification_stmt = conn.prepare(
            "SELECT step_id, label, command, expected_result, required
             FROM plan_verifications WHERE plan_id = ?1 ORDER BY id",
        )?;
        plan.verification_steps = verification_stmt
            .query_map([id], |row| {
                Ok(VerificationStep {
                    id: row.get(0)?,
                    label: row.get(1)?,
                    command: row.get(2)?,
                    expected_result: row.get(3)?,
                    required: row.get::<_, i32>(4)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Some(plan))
    }

    pub fn expire_action_plans(&self, now: i64) -> Result<usize, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        Ok(conn.execute(
            "UPDATE action_plans SET status = 'expired', updated_at = ?1
             WHERE status IN ('draft', 'pending_approval') AND expires_at <= ?1",
            [now],
        )?)
    }

    pub fn update_action_plan_status(&self, plan_id: &str, status: &str) -> Result<(), AppError> {
        if !matches!(
            status,
            "pending_approval"
                | "approved"
                | "executing"
                | "completed"
                | "failed"
                | "expired"
                | "rejected"
        ) {
            return Err(AppError::InvalidInput("无效的操作计划状态".into()));
        }
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.execute(
            "UPDATE action_plans SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, chrono::Utc::now().timestamp(), plan_id],
        )?;
        Ok(())
    }

    pub fn update_approval_batch_status(
        &self,
        batch_id: &str,
        status: &str,
    ) -> Result<(), AppError> {
        if !matches!(
            status,
            "pending" | "approved" | "executing" | "completed" | "failed" | "expired" | "rejected"
        ) {
            return Err(AppError::InvalidInput("无效的审批批次状态".into()));
        }
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.execute(
            "UPDATE approval_batches SET status = ?1,
                    decided_at = CASE WHEN ?1 IN ('approved','rejected') THEN ?2 ELSE decided_at END,
                    finished_at = CASE WHEN ?1 IN ('completed','failed','expired') THEN ?2 ELSE finished_at END
             WHERE id = ?3",
            params![status, chrono::Utc::now().timestamp(), batch_id],
        )?;
        Ok(())
    }

    pub fn create_approval_batch(&self, batch: &ApprovalBatch) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.execute(
            "INSERT INTO approval_batches
             (id, plan_id, mode, canary_server_id, status, expires_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                batch.id,
                batch.plan_id,
                batch.mode,
                batch.canary_server_id,
                batch.status,
                batch.expires_at,
                batch.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn link_ai_approval_to_plan(
        &self,
        approval_id: i64,
        plan_id: &str,
    ) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.execute(
            "INSERT INTO ai_approval_plans(approval_id, plan_id, created_at)
             VALUES (?1, ?2, ?3)",
            params![approval_id, plan_id, chrono::Utc::now().timestamp()],
        )?;
        Ok(())
    }

    pub fn get_action_plan_for_approval(
        &self,
        approval_id: i64,
    ) -> Result<Option<ActionPlan>, AppError> {
        let plan_id = {
            let conn = self
                .conn
                .lock()
                .map_err(|error| AppError::Custom(error.to_string()))?;
            conn.query_row(
                "SELECT plan_id FROM ai_approval_plans WHERE approval_id = ?1",
                [approval_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
        };
        match plan_id {
            Some(plan_id) => self.get_action_plan(&plan_id),
            None => Ok(None),
        }
    }

    pub fn delete_pending_action_plan(&self, plan_id: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.execute(
            "DELETE FROM action_plans WHERE id = ?1 AND status = 'pending_approval'",
            [plan_id],
        )?;
        Ok(())
    }

    pub fn append_approval_event(
        &self,
        plan_id: &str,
        batch_id: Option<&str>,
        event_type: &str,
        actor: &str,
        details: &str,
        previous_hash: &str,
        event_hash: &str,
        created_at: i64,
    ) -> Result<i64, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.execute(
            "INSERT INTO approval_events
             (plan_id, batch_id, event_type, actor, details, previous_hash, event_hash, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                plan_id,
                batch_id,
                event_type,
                actor,
                details,
                previous_hash,
                event_hash,
                created_at
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }
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
        }
    }

    fn sample_plan() -> ActionPlan {
        ActionPlan {
            id: "plan-test".into(),
            conversation_id: Some("conversation-test".into()),
            action: "restart_nginx".into(),
            summary: "重启 Nginx".into(),
            original_request: "请重启 nginx".into(),
            original_command: "systemctl restart nginx".into(),
            normalized_command: "systemctl restart nginx".into(),
            command_sha256: "hash".into(),
            rule_version: "policy-v1".into(),
            risk: RiskAssessment {
                level: ActionRiskLevel::Medium,
                reason: "修改服务状态".into(),
                matched_rules: vec!["service_restart".into()],
                requires_approval: true,
            },
            targets: vec![ActionPlanTarget {
                server_id: 1,
                server_alias: "test".into(),
                role: "canary".into(),
                status: "pending".into(),
            }],
            verification_steps: vec![VerificationStep {
                id: "health".into(),
                label: "检查服务状态".into(),
                command: "systemctl is-active nginx".into(),
                expected_result: "active".into(),
                required: true,
            }],
            status: "pending_approval".into(),
            expires_at: 2_000,
            created_at: 1_000,
        }
    }

    #[test]
    fn action_plan_round_trip_and_expiry_work_transactionally() {
        let db = database();
        let plan = sample_plan();
        db.create_action_plan(&plan).expect("create plan");
        let loaded = db
            .get_action_plan(&plan.id)
            .expect("load plan")
            .expect("plan");
        assert_eq!(loaded.original_command, plan.original_command);
        assert_eq!(loaded.targets.len(), 1);
        assert_eq!(loaded.verification_steps.len(), 1);
        assert_eq!(loaded.risk.level, ActionRiskLevel::Medium);

        assert_eq!(db.expire_action_plans(1_999).expect("expire plans"), 0);
        assert_eq!(db.expire_action_plans(2_000).expect("expire plans"), 1);
        assert_eq!(
            db.get_action_plan(&plan.id)
                .expect("load plan")
                .unwrap()
                .status,
            "expired"
        );
    }

    #[test]
    fn approval_events_are_append_only_rows() {
        let db = database();
        let plan = sample_plan();
        db.create_action_plan(&plan).expect("create plan");
        let id = db
            .append_approval_event(
                &plan.id, None, "created", "copilot", "draft", "", "hash", 1_001,
            )
            .expect("append event");
        assert!(id > 0);
    }

    #[test]
    fn approval_link_points_to_persisted_action_plan() {
        let db = database();
        let plan = sample_plan();
        db.create_action_plan(&plan).expect("create plan");
        {
            let conn = db.conn.lock().expect("database lock");
            conn.execute(
                "INSERT INTO ai_approvals(server_id, server_alias, action, command, requested_at, expires_at)
                 VALUES (1, 'test', 'restart_nginx', 'systemctl restart nginx', 1000, 2000)",
                [],
            )
            .expect("create approval");
        }
        db.link_ai_approval_to_plan(1, &plan.id)
            .expect("link approval and plan");

        let conn = db.conn.lock().expect("database lock");
        let linked_plan: String = conn
            .query_row(
                "SELECT plan_id FROM ai_approval_plans WHERE approval_id = 1",
                [],
                |row| row.get(0),
            )
            .expect("read approval link");
        assert_eq!(linked_plan, plan.id);
    }
}
