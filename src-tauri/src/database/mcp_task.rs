use rusqlite::{params, OptionalExtension};

use crate::error::AppError;
use crate::models::{
    McpApprovalBinding, McpOperationTask, McpTaskStatus, McpTaskStep, McpTaskStepStatus,
    NewMcpOperationTask,
};

use super::Database;

impl Database {
    pub fn get_mcp_task_approval(
        &self,
        token_id: i64,
        task_id: &str,
    ) -> Result<Option<(i64, String)>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.query_row(
            "SELECT a.id, a.status
             FROM ai_approvals a
             JOIN mcp_approval_bindings b ON b.approval_id=a.id
             WHERE b.task_id=?1 AND b.token_id=?2
             ORDER BY a.id DESC LIMIT 1",
            params![task_id, token_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(AppError::from)
    }

    pub fn get_mcp_approval_binding(
        &self,
        approval_id: i64,
    ) -> Result<Option<McpApprovalBinding>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        conn.query_row(
            "SELECT task_id, token_id, source_client, created_at
             FROM mcp_approval_bindings WHERE approval_id=?1",
            [approval_id],
            |row| {
                Ok(McpApprovalBinding {
                    task_id: row.get(0)?,
                    token_id: row.get(1)?,
                    source_client: row.get(2)?,
                    created_at: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(AppError::from)
    }

    pub fn attach_mcp_task_approval(
        &self,
        task_id: &str,
        plan_id: &str,
        approval_id: i64,
        token_id: i64,
        source_client: &str,
        now: i64,
    ) -> Result<bool, AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let tx = conn.transaction()?;
        let changed = tx.execute(
            "UPDATE mcp_operation_tasks SET status='pending_approval', plan_id=?1, updated_at=?2
             WHERE id=?3 AND token_id=?4 AND status='draft' AND expires_at>?2",
            params![plan_id, now, task_id, token_id],
        )?;
        if changed == 1 {
            tx.execute(
                "INSERT INTO mcp_approval_bindings
                 (approval_id, task_id, token_id, source_client, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![approval_id, task_id, token_id, source_client, now],
            )?;
        }
        tx.commit()?;
        Ok(changed == 1)
    }

    /// Atomically create one MCP task per token and idempotency key.
    pub fn create_mcp_operation_task(
        &self,
        task: &NewMcpOperationTask,
    ) -> Result<(McpOperationTask, bool), AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let tx = conn.transaction()?;
        let existing = tx
            .query_row(
                "SELECT id, request_sha256 FROM mcp_operation_tasks
                 WHERE token_id=?1 AND idempotency_key=?2",
                params![task.token_id, task.idempotency_key],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        if let Some((id, request_hash)) = existing {
            if request_hash != task.request_sha256 {
                return Err(AppError::InvalidInput("幂等键已用于不同请求内容".into()));
            }
            let loaded = load_task(&tx, &id)?
                .ok_or_else(|| AppError::Custom("幂等任务记录在读取时消失".into()))?;
            tx.commit()?;
            return Ok((loaded, false));
        }

        tx.execute(
            "INSERT INTO mcp_operation_tasks
             (id, token_id, source_client, idempotency_key, request_sha256, plan_id,
              summary, status, created_at, updated_at, expires_at, result, skill_ids)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9, ?10, ?11, ?12)",
            params![
                task.id,
                task.token_id,
                task.source_client,
                task.idempotency_key,
                task.request_sha256,
                task.plan_id,
                task.summary,
                task.status.as_str(),
                task.created_at,
                task.expires_at,
                task.result,
                serde_json::to_string(&task.skill_ids)
                    .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?
            ],
        )?;
        for step in &task.steps {
            tx.execute(
                "INSERT INTO mcp_operation_task_steps
                 (id, task_id, sequence, kind, target_server_id, status, input_sha256)
                 VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)",
                params![
                    step.id,
                    task.id,
                    step.sequence,
                    step.kind,
                    step.target_server_id,
                    step.input_sha256
                ],
            )?;
        }
        let loaded = load_task(&tx, &task.id)?
            .ok_or_else(|| AppError::Custom("MCP 任务创建后读取失败".into()))?;
        tx.commit()?;
        Ok((loaded, true))
    }

    pub fn get_mcp_operation_task(
        &self,
        token_id: i64,
        task_id: &str,
    ) -> Result<Option<McpOperationTask>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let owned_id = conn
            .query_row(
                "SELECT id FROM mcp_operation_tasks WHERE id=?1 AND token_id=?2",
                params![task_id, token_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        owned_id
            .map(|id| load_task(&conn, &id))
            .transpose()
            .map(Option::flatten)
    }

    pub fn expire_mcp_operation_tasks(&self, now: i64) -> Result<usize, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        Ok(conn.execute(
            "UPDATE mcp_operation_tasks SET status='expired', updated_at=?1
             WHERE status IN ('draft','pending_approval','queued') AND expires_at<=?1",
            [now],
        )?)
    }

    /// Recover durable MCP jobs after an application restart.  A command that
    /// was already running cannot be replayed safely, so it becomes unknown;
    /// only explicitly queued approvals are returned for resumption.
    pub fn recover_mcp_operation_tasks(&self, now: i64) -> Result<Vec<(i64, String)>, AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let tx = conn.transaction()?;
        tx.execute(
            "UPDATE mcp_operation_tasks
             SET status='expired', updated_at=?1, error_code='approval_expired'
             WHERE status IN ('draft','pending_approval','queued') AND expires_at<=?1",
            [now],
        )?;
        tx.execute(
            "UPDATE ai_approvals SET status='expired', finished_at=?1,
                 result='MCP approval expired before the background worker resumed'
             WHERE status IN ('pending','executing') AND id IN (
                 SELECT b.approval_id FROM mcp_approval_bindings b
                 JOIN mcp_operation_tasks t ON t.id=b.task_id
                 WHERE t.status='expired'
             )",
            [now],
        )?;
        tx.execute(
            "UPDATE action_plans SET status='expired', updated_at=?1
             WHERE id IN (
                 SELECT plan_id FROM mcp_operation_tasks WHERE status='expired'
             ) AND status IN ('pending_approval','approved')",
            [now],
        )?;
        tx.execute(
            "UPDATE approval_batches SET status='expired', finished_at=?1
             WHERE plan_id IN (
                 SELECT plan_id FROM mcp_operation_tasks WHERE status='expired'
             ) AND status IN ('pending','approved')",
            [now],
        )?;
        tx.execute(
            "UPDATE mcp_operation_tasks
             SET status='unknown', updated_at=?1, error_code='interrupted_after_restart',
                 result=COALESCE(result, 'Application restarted while remote execution was in progress')
             WHERE status IN ('executing','verifying')",
            [now],
        )?;
        tx.execute(
            "UPDATE mcp_operation_task_steps
             SET status='unknown', finished_at=?1,
                 result=COALESCE(result, 'Application restarted while this step was running')
             WHERE status='running'",
            [now],
        )?;
        tx.execute(
            "UPDATE ai_approvals SET status='unknown', finished_at=?1,
                 result='Application restarted during remote execution; verify the server before retrying'
             WHERE status='executing' AND id IN (
                 SELECT b.approval_id FROM mcp_approval_bindings b
                 JOIN mcp_operation_tasks t ON t.id=b.task_id
                 WHERE t.status='unknown' AND t.error_code='interrupted_after_restart'
             )",
            [now],
        )?;
        tx.execute(
            "UPDATE action_plans SET status='unknown', updated_at=?1
             WHERE status='executing' AND id IN (
                 SELECT plan_id FROM mcp_operation_tasks
                 WHERE status='unknown' AND error_code='interrupted_after_restart'
             )",
            [now],
        )?;
        tx.execute(
            "UPDATE approval_batches SET status='unknown', finished_at=?1
             WHERE status='executing' AND plan_id IN (
                 SELECT plan_id FROM mcp_operation_tasks
                 WHERE status='unknown' AND error_code='interrupted_after_restart'
             )",
            [now],
        )?;
        let mut stmt = tx.prepare(
            "SELECT b.approval_id, t.id
             FROM mcp_operation_tasks t
             JOIN mcp_approval_bindings b ON b.task_id=t.id
             WHERE t.status='queued' AND t.expires_at>?1
             ORDER BY t.created_at",
        )?;
        let queued = stmt
            .query_map([now], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        drop(stmt);
        tx.commit()?;
        Ok(queued)
    }

    /// Compare-and-set prevents two workers from executing the same queued task.
    pub fn claim_mcp_operation_task(&self, task_id: &str, now: i64) -> Result<bool, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        Ok(conn.execute(
            "UPDATE mcp_operation_tasks
             SET status='executing', updated_at=?1
             WHERE id=?2 AND status='queued' AND expires_at>?1",
            params![now, task_id],
        )? == 1)
    }

    /// Cancel a task only while no remote command has started.
    ///
    /// Running and verifying tasks are deliberately not changed here: without
    /// a remote process handle, reporting them as cancelled would falsely
    /// claim that the remote command stopped.
    pub fn cancel_mcp_operation_task(
        &self,
        token_id: i64,
        source_client: &str,
        task_id: &str,
        now: i64,
    ) -> Result<McpTaskStatus, AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let tx = conn.transaction()?;
        let task = tx
            .query_row(
                "SELECT status, source_client FROM mcp_operation_tasks
                 WHERE id=?1 AND token_id=?2",
                params![task_id, token_id],
                |row| {
                    Ok((
                        McpTaskStatus::parse(&row.get::<_, String>(0)?),
                        row.get::<_, String>(1)?,
                    ))
                },
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound("MCP 任务不存在或不属于当前 Token".into()))?;
        if task.1 != source_client {
            return Err(AppError::InvalidInput("MCP 调用来源与任务不匹配".into()));
        }
        if matches!(task.0, McpTaskStatus::Executing | McpTaskStatus::Verifying) {
            return Err(AppError::InvalidInput(
                "MCP 任务已经开始远程执行，未报告为已取消".into(),
            ));
        }
        if !matches!(
            task.0,
            McpTaskStatus::Draft | McpTaskStatus::PendingApproval | McpTaskStatus::Queued
        ) {
            return Err(AppError::InvalidInput(
                "MCP 任务已结束，不能重复取消".into(),
            ));
        }

        let changed = tx.execute(
            "UPDATE mcp_operation_tasks SET status='cancelled', updated_at=?1,
             error_code='cancelled_by_client'
             WHERE id=?2 AND token_id=?3 AND source_client=?4
               AND status IN ('draft','pending_approval','queued')",
            params![now, task_id, token_id, source_client],
        )?;
        if changed != 1 {
            return Err(AppError::Custom("MCP 任务状态已变化，请重新查询".into()));
        }
        if task.0 == McpTaskStatus::PendingApproval {
            tx.execute(
                "UPDATE ai_approvals SET status='rejected', decided_at=?1,
                 finished_at=?1, result='MCP 任务已由客户端取消'
                 WHERE id IN (
                   SELECT approval_id FROM mcp_approval_bindings WHERE task_id=?2
                 ) AND status='pending'",
                params![now, task_id],
            )?;
            tx.execute(
                "UPDATE action_plans SET status='cancelled', updated_at=?1
                 WHERE id IN (SELECT plan_id FROM mcp_operation_tasks WHERE id=?2)",
                params![now, task_id],
            )?;
            tx.execute(
                "UPDATE approval_batches SET status='cancelled', finished_at=?1
                 WHERE plan_id IN (SELECT plan_id FROM mcp_operation_tasks WHERE id=?2)",
                params![now, task_id],
            )?;
        }
        tx.commit()?;
        Ok(McpTaskStatus::Cancelled)
    }

    pub fn request_mcp_operation_task_cancellation(
        &self,
        token_id: i64,
        source_client: &str,
        task_id: &str,
        now: i64,
    ) -> Result<McpTaskStatus, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        let changed = conn.execute(
            "UPDATE mcp_operation_tasks SET error_code='cancel_requested', updated_at=?1
             WHERE id=?2 AND token_id=?3 AND source_client=?4
               AND status IN ('executing','verifying')",
            params![now, task_id, token_id, source_client],
        )?;
        if changed != 1 {
            return Err(AppError::InvalidInput(
                "MCP task is not running or is not owned by this token".into(),
            ));
        }
        conn.query_row(
            "SELECT status FROM mcp_operation_tasks WHERE id=?1",
            [task_id],
            |row| Ok(McpTaskStatus::parse(&row.get::<_, String>(0)?)),
        )
        .map_err(AppError::from)
    }

    pub fn transition_mcp_operation_task(
        &self,
        task_id: &str,
        expected: McpTaskStatus,
        next: McpTaskStatus,
        now: i64,
        result: Option<&str>,
        error_code: Option<&str>,
    ) -> Result<bool, AppError> {
        let allowed = matches!(
            (expected, next),
            (McpTaskStatus::Draft, McpTaskStatus::PendingApproval)
                | (McpTaskStatus::Draft, McpTaskStatus::Rejected)
                | (McpTaskStatus::Draft, McpTaskStatus::Expired)
                | (McpTaskStatus::PendingApproval, McpTaskStatus::Queued)
                | (McpTaskStatus::PendingApproval, McpTaskStatus::Rejected)
                | (McpTaskStatus::PendingApproval, McpTaskStatus::Expired)
                | (McpTaskStatus::Queued, McpTaskStatus::Executing)
                | (McpTaskStatus::Queued, McpTaskStatus::Cancelled)
                | (McpTaskStatus::Queued, McpTaskStatus::Expired)
                | (McpTaskStatus::Executing, McpTaskStatus::Verifying)
                | (McpTaskStatus::Executing, McpTaskStatus::Succeeded)
                | (McpTaskStatus::Executing, McpTaskStatus::Failed)
                | (McpTaskStatus::Executing, McpTaskStatus::Unknown)
                | (McpTaskStatus::Executing, McpTaskStatus::Cancelled)
                | (McpTaskStatus::Verifying, McpTaskStatus::Succeeded)
                | (McpTaskStatus::Verifying, McpTaskStatus::Executing)
                | (McpTaskStatus::Verifying, McpTaskStatus::Failed)
                | (McpTaskStatus::Verifying, McpTaskStatus::Unknown)
                | (McpTaskStatus::Verifying, McpTaskStatus::Cancelled)
        );
        if !allowed {
            return Err(AppError::InvalidInput("不允许的 MCP 任务状态转换".into()));
        }
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        Ok(conn.execute(
            "UPDATE mcp_operation_tasks SET status=?1, updated_at=?2,
             result=COALESCE(?3, result), error_code=COALESCE(?4, error_code)
             WHERE id=?5 AND status=?6",
            params![
                next.as_str(),
                now,
                result,
                error_code,
                task_id,
                expected.as_str()
            ],
        )? == 1)
    }

    pub fn mcp_operation_task_cancel_requested(&self, task_id: &str) -> Result<bool, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        Ok(conn
            .query_row(
                "SELECT error_code FROM mcp_operation_tasks WHERE id=?1",
                [task_id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten()
            .as_deref()
            == Some("cancel_requested"))
    }

    pub fn transition_mcp_operation_step(
        &self,
        task_id: &str,
        step_id: &str,
        expected: McpTaskStepStatus,
        next: McpTaskStepStatus,
        now: i64,
        result: Option<&str>,
        exit_code: Option<i32>,
    ) -> Result<bool, AppError> {
        let allowed = matches!(
            (expected, next),
            (McpTaskStepStatus::Pending, McpTaskStepStatus::Running)
                | (McpTaskStepStatus::Pending, McpTaskStepStatus::Skipped)
                | (McpTaskStepStatus::Running, McpTaskStepStatus::Succeeded)
                | (McpTaskStepStatus::Running, McpTaskStepStatus::Failed)
                | (McpTaskStepStatus::Running, McpTaskStepStatus::Unknown)
        );
        if !allowed {
            return Err(AppError::InvalidInput("不允许的 MCP 步骤状态转换".into()));
        }
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        Ok(conn.execute(
            "UPDATE mcp_operation_task_steps SET status=?1, result=COALESCE(?2, result),
             exit_code=COALESCE(?3, exit_code),
             started_at=CASE WHEN ?1='running' THEN ?4 ELSE started_at END,
             finished_at=CASE WHEN ?1 IN ('succeeded','failed','skipped','unknown') THEN ?4 ELSE finished_at END
             WHERE id=?5 AND task_id=?6 AND status=?7
               AND (?1!='running' OR EXISTS (
                   SELECT 1 FROM mcp_operation_tasks
                   WHERE id=?6 AND status IN ('executing','verifying')
                     AND COALESCE(error_code,'')!='cancel_requested'
               ))",
            params![
                next.as_str(),
                result,
                exit_code,
                now,
                step_id,
                task_id,
                expected.as_str()
            ],
        )? == 1)
    }

    pub fn skip_pending_mcp_operation_steps(
        &self,
        task_id: &str,
        now: i64,
        reason: &str,
    ) -> Result<usize, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|error| AppError::Custom(error.to_string()))?;
        Ok(conn.execute(
            "UPDATE mcp_operation_task_steps
             SET status='skipped', result=COALESCE(result, ?1), finished_at=?2
             WHERE task_id=?3 AND status='pending'",
            params![reason, now, task_id],
        )?)
    }
}

fn load_task(
    conn: &rusqlite::Connection,
    task_id: &str,
) -> Result<Option<McpOperationTask>, AppError> {
    let task = conn
        .query_row(
            "SELECT id, token_id, source_client, idempotency_key, request_sha256, plan_id,
                    summary, status, error_code, result, created_at, updated_at, expires_at, skill_ids
             FROM mcp_operation_tasks WHERE id=?1",
            [task_id],
            |row| {
                Ok(McpOperationTask {
                    id: row.get(0)?,
                    token_id: row.get(1)?,
                    source_client: row.get(2)?,
                    idempotency_key: row.get(3)?,
                    request_sha256: row.get(4)?,
                    plan_id: row.get(5)?,
                    summary: row.get(6)?,
                    status: McpTaskStatus::parse(&row.get::<_, String>(7)?),
                    error_code: row.get(8)?,
                    result: row.get(9)?,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    expires_at: row.get(12)?,
                    skill_ids: serde_json::from_str::<Vec<String>>(&row.get::<_, String>(13)?)
                        .map_err(|error| {
                            rusqlite::Error::FromSqlConversionFailure(
                                13,
                                rusqlite::types::Type::Text,
                                Box::new(error),
                            )
                        })?,
                    steps: Vec::new(),
                })
            },
        )
        .optional()?;
    let Some(mut task) = task else {
        return Ok(None);
    };
    let mut stmt = conn.prepare(
        "SELECT id, sequence, kind, target_server_id, status, input_sha256, result,
                exit_code, started_at, finished_at
         FROM mcp_operation_task_steps WHERE task_id=?1 ORDER BY sequence",
    )?;
    task.steps = stmt
        .query_map([task_id], |row| {
            Ok(McpTaskStep {
                id: row.get(0)?,
                sequence: row.get(1)?,
                kind: row.get(2)?,
                target_server_id: row.get(3)?,
                status: McpTaskStepStatus::parse(&row.get::<_, String>(4)?),
                input_sha256: row.get(5)?,
                result: row.get(6)?,
                exit_code: row.get(7)?,
                started_at: row.get(8)?,
                finished_at: row.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(task))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::schema;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn database() -> Database {
        let conn = Connection::open_in_memory().expect("open db");
        schema::migrate(&conn).expect("migrate db");
        conn.execute(
            "INSERT INTO mcp_tokens (name, client, server_scope, tool_scope, token_hint)
             VALUES ('test', 'custom', 'server', 'system_info', 'masked')",
            [],
        )
        .expect("token");
        Database {
            conn: Mutex::new(conn),
            path: std::path::PathBuf::new(),
        }
    }

    fn sample_task(key: &str, hash: &str) -> NewMcpOperationTask {
        NewMcpOperationTask {
            id: format!("task-{key}"),
            token_id: 1,
            source_client: "custom".into(),
            idempotency_key: key.into(),
            request_sha256: hash.into(),
            plan_id: None,
            summary: "inspect service".into(),
            status: McpTaskStatus::Queued,
            created_at: 100,
            expires_at: 200,
            result: None,
            skill_ids: vec!["docker-ps".into()],
            steps: vec![crate::models::NewMcpTaskStep {
                id: format!("step-{key}"),
                sequence: 0,
                kind: "inspection".into(),
                target_server_id: Some(7),
                input_sha256: "step-hash".into(),
            }],
        }
    }

    #[test]
    fn task_creation_is_idempotent_and_rejects_key_reuse() {
        let db = database();
        let task = sample_task("same", "request-hash");
        let (created, is_new) = db.create_mcp_operation_task(&task).expect("create");
        assert!(is_new);
        assert_eq!(created.steps.len(), 1);
        assert_eq!(created.skill_ids, ["docker-ps"]);
        let (retried, is_new) = db.create_mcp_operation_task(&task).expect("retry");
        assert!(!is_new);
        assert_eq!(retried.id, created.id);
        assert!(db
            .create_mcp_operation_task(&sample_task("same", "different-hash"))
            .is_err());
        assert!(db
            .get_mcp_operation_task(2, &created.id)
            .expect("other token")
            .is_none());
    }

    #[test]
    fn concurrent_retries_create_exactly_one_task_for_same_token_and_key() {
        let db = std::sync::Arc::new(database());
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(8));
        let handles = (0..8)
            .map(|_| {
                let db = std::sync::Arc::clone(&db);
                let barrier = std::sync::Arc::clone(&barrier);
                let task = sample_task("concurrent", "same-request");
                std::thread::spawn(move || {
                    barrier.wait();
                    db.create_mcp_operation_task(&task)
                        .expect("concurrent idempotent create")
                })
            })
            .collect::<Vec<_>>();

        let results = handles
            .into_iter()
            .map(|handle| handle.join().expect("worker thread"))
            .collect::<Vec<_>>();
        let first_id = &results[0].0.id;
        assert!(results.iter().all(|(task, _)| &task.id == first_id));
        assert_eq!(results.iter().filter(|(_, created)| *created).count(), 1);
        assert_eq!(
            db.get_mcp_operation_task(1, first_id)
                .expect("load created task")
                .expect("task exists")
                .steps
                .len(),
            1
        );
    }

    #[test]
    fn task_steps_and_cancellation_are_scoped_to_token_and_source_client() {
        let db = database();
        let task = sample_task("scope", "scope-hash");
        db.create_mcp_operation_task(&task).expect("create task");

        // The task owner is the only token that can observe its steps.
        assert!(db
            .get_mcp_operation_task(2, &task.id)
            .expect("cross-token lookup")
            .is_none());
        assert!(db
            .cancel_mcp_operation_task(1, "another-client", &task.id, 150)
            .is_err());
        assert_eq!(
            db.get_mcp_operation_task(1, &task.id)
                .expect("owner lookup")
                .expect("task")
                .steps[0]
                .status,
            McpTaskStepStatus::Pending
        );
    }

    #[test]
    fn task_claim_and_transitions_are_compare_and_set() {
        let db = database();
        let task = sample_task("claim", "hash");
        db.create_mcp_operation_task(&task).expect("create");
        assert!(db
            .transition_mcp_operation_task(
                &task.id,
                McpTaskStatus::Queued,
                McpTaskStatus::PendingApproval,
                150,
                None,
                None
            )
            .is_err());
        assert!(!db
            .claim_mcp_operation_task(&task.id, 250)
            .expect("expired task"));
        assert!(db
            .claim_mcp_operation_task(&task.id, 150)
            .expect("claim task"));
        assert!(!db
            .transition_mcp_operation_task(
                &task.id,
                McpTaskStatus::Queued,
                McpTaskStatus::Executing,
                150,
                None,
                None
            )
            .expect("stale transition"));
        assert!(!db
            .claim_mcp_operation_task(&task.id, 150)
            .expect("second claim"));
        assert!(db
            .transition_mcp_operation_step(
                &task.id,
                "step-claim",
                McpTaskStepStatus::Pending,
                McpTaskStepStatus::Running,
                151,
                None,
                None
            )
            .expect("start step"));
        assert!(db
            .transition_mcp_operation_step(
                &task.id,
                "step-claim",
                McpTaskStepStatus::Running,
                McpTaskStepStatus::Succeeded,
                152,
                Some("healthy"),
                Some(0)
            )
            .expect("finish step"));
        let loaded = db
            .get_mcp_operation_task(1, &task.id)
            .expect("load owned task")
            .expect("task");
        assert_eq!(loaded.steps[0].status, McpTaskStepStatus::Succeeded);
        assert_eq!(loaded.steps[0].exit_code, Some(0));
    }

    #[test]
    fn cancellation_is_owner_scoped_and_never_fakes_stopping_running_work() {
        let db = database();
        let task = sample_task("cancel", "hash");
        db.create_mcp_operation_task(&task).expect("create");
        assert_eq!(
            db.cancel_mcp_operation_task(1, "custom", &task.id, 150)
                .expect("cancel queued task"),
            McpTaskStatus::Cancelled
        );
        assert_eq!(
            db.get_mcp_operation_task(1, &task.id)
                .expect("load cancelled task")
                .expect("task")
                .status,
            McpTaskStatus::Cancelled
        );
        assert!(db
            .cancel_mcp_operation_task(2, "custom", &task.id, 151)
            .is_err());

        let running = sample_task("running", "hash");
        db.create_mcp_operation_task(&running)
            .expect("create running");
        assert!(db
            .claim_mcp_operation_task(&running.id, 150)
            .expect("claim running task"));
        assert!(db
            .cancel_mcp_operation_task(1, "custom", &running.id, 151)
            .is_err());
        assert_eq!(
            db.request_mcp_operation_task_cancellation(1, "custom", &running.id, 152)
                .expect("request cancellation"),
            McpTaskStatus::Executing
        );
        assert!(db
            .mcp_operation_task_cancel_requested(&running.id)
            .expect("read cancellation request"));
        assert_eq!(
            db.get_mcp_operation_task(1, &running.id)
                .expect("load running task")
                .expect("task")
                .status,
            McpTaskStatus::Executing
        );
    }

    #[test]
    fn cancelled_task_cannot_atomically_start_a_pending_step() {
        let db = database();
        let task = sample_task("cancel-before-step", "hash");
        db.create_mcp_operation_task(&task).expect("create task");
        assert!(db
            .claim_mcp_operation_task(&task.id, 150)
            .expect("claim task"));
        assert_eq!(
            db.request_mcp_operation_task_cancellation(1, "custom", &task.id, 151)
                .expect("request cancel"),
            McpTaskStatus::Executing
        );
        assert!(!db
            .transition_mcp_operation_step(
                &task.id,
                "step-cancel-before-step",
                McpTaskStepStatus::Pending,
                McpTaskStepStatus::Running,
                152,
                None,
                None
            )
            .expect("cancelled step cannot start"));
    }

    #[test]
    fn restart_recovery_marks_inflight_unknown_and_leaves_queued_work_unclaimed() {
        let db = database();
        let running = sample_task("restart-running", "hash-running");
        db.create_mcp_operation_task(&running)
            .expect("create running task");
        assert!(db
            .claim_mcp_operation_task(&running.id, 150)
            .expect("claim running task"));
        assert!(db
            .transition_mcp_operation_step(
                &running.id,
                "step-restart-running",
                McpTaskStepStatus::Pending,
                McpTaskStepStatus::Running,
                151,
                None,
                None,
            )
            .expect("start running step"));

        let queued = sample_task("restart-queued", "hash-queued");
        db.create_mcp_operation_task(&queued)
            .expect("create queued task");
        {
            let conn = db.conn.lock().expect("database lock");
            conn.execute(
                "UPDATE mcp_operation_tasks SET status='queued' WHERE id=?1",
                [&queued.id],
            )
            .expect("queue task");
        }

        let resumed = db.recover_mcp_operation_tasks(180).expect("recover tasks");
        assert!(resumed.is_empty());
        let recovered = db
            .get_mcp_operation_task(1, &running.id)
            .expect("load recovered task")
            .expect("running task exists");
        assert_eq!(recovered.status, McpTaskStatus::Unknown);
        assert_eq!(
            recovered.error_code.as_deref(),
            Some("interrupted_after_restart")
        );
        assert_eq!(recovered.steps[0].status, McpTaskStepStatus::Unknown);
        assert_eq!(
            db.get_mcp_operation_task(1, &queued.id)
                .expect("load queued task")
                .expect("queued task exists")
                .status,
            McpTaskStatus::Queued
        );
    }

    #[test]
    fn task_and_steps_survive_database_reopen_and_expire() {
        let dir = tempfile::tempdir().expect("temp dir");
        let path = dir.path().join("mcp-tasks.db");
        let db = Database::init(path.to_str().expect("db path")).expect("initialize");
        db.add_mcp_token("test", "custom", "server", "system_info", None, "masked")
            .expect("create token");
        let task = sample_task("persist", "stable-hash");
        db.create_mcp_operation_task(&task).expect("create task");
        drop(db);

        let db = Database::init(path.to_str().expect("db path")).expect("reopen");
        let loaded = db
            .get_mcp_operation_task(1, &task.id)
            .expect("load persisted task")
            .expect("persisted task exists");
        assert_eq!(loaded.request_sha256, "stable-hash");
        assert_eq!(loaded.skill_ids, ["docker-ps"]);
        assert_eq!(loaded.steps.len(), 1);
        assert_eq!(db.expire_mcp_operation_tasks(200).expect("expire"), 1);
        assert_eq!(
            db.get_mcp_operation_task(1, &task.id)
                .expect("reload expired")
                .expect("task")
                .status,
            McpTaskStatus::Expired
        );
    }
}
