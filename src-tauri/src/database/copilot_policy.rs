use rusqlite::{params, OptionalExtension};

use super::Database;
use crate::error::AppError;
use crate::models::{AiApproval, AiLockState};

const LOCK_KEY: &str = "ai_unlock_until";

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn lock_state(value: Option<String>, current: i64) -> AiLockState {
    let until = value.and_then(|text| text.parse::<i64>().ok());
    let unlocked = matches!(until, Some(-1)) || until.is_some_and(|value| value > current);
    AiLockState {
        locked: !unlocked,
        unlock_until: if unlocked && until != Some(-1) {
            until
        } else {
            None
        },
    }
}

fn approval_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AiApproval> {
    Ok(AiApproval {
        id: row.get(0)?,
        server_id: row.get(1)?,
        server_alias: row.get(2)?,
        action: row.get(3)?,
        command: row.get(4)?,
        status: row.get(5)?,
        requested_at: row.get(6)?,
        expires_at: row.get(7)?,
        decided_at: row.get(8)?,
        finished_at: row.get(9)?,
        result: row.get(10)?,
    })
}

impl Database {
    pub fn get_ai_lock(&self) -> Result<AiLockState, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let value = conn
            .query_row(
                "SELECT value FROM app_config WHERE key=?1 AND deleted_at IS NULL",
                [LOCK_KEY],
                |row| row.get(0),
            )
            .optional()?;
        Ok(lock_state(value, now()))
    }

    pub fn set_ai_lock_until(&self, until: Option<i64>) -> Result<AiLockState, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        // 后端持久化总开关，不能以 WebView 内存状态作为授权凭据。
        let value = until.unwrap_or(0).to_string();
        conn.execute("INSERT INTO app_config(key,value,deleted_at) VALUES(?1,?2,NULL) ON CONFLICT(key) DO UPDATE SET value=excluded.value,deleted_at=NULL,updated_at=datetime('now','localtime')", params![LOCK_KEY, value])?;
        Ok(lock_state(Some(value), now()))
    }

    pub fn create_ai_approval(
        &self,
        server_id: i64,
        action: &str,
        command: &str,
    ) -> Result<AiApproval, AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let tx = conn.transaction()?;
        let value: Option<String> = tx
            .query_row(
                "SELECT value FROM app_config WHERE key=?1 AND deleted_at IS NULL",
                [LOCK_KEY],
                |row| row.get(0),
            )
            .optional()?;
        if lock_state(value, now()).locked {
            return Err(AppError::Custom(
                "AI 操作已锁定，请先在 AI 桥接中心打开总开关".into(),
            ));
        }
        let server: Option<(String, String, String)> = tx
            .query_row(
                "SELECT alias,ai_policy,os_type FROM servers WHERE id=?1",
                [server_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let (alias, policy, os_type) =
            server.ok_or_else(|| AppError::NotFound("目标服务器不存在".into()))?;
        if os_type != "linux" {
            return Err(AppError::Custom("当前改动工具只支持 Linux 主机".into()));
        }
        if matches!(policy.as_str(), "denied" | "disabled") {
            return Err(AppError::Custom("该服务器对 AI 禁用".into()));
        }
        if !matches!(
            policy.as_str(),
            "trusted" | "autonomous" | "allowlist" | "approval" | "strict"
        ) {
            return Err(AppError::Custom("仅允许 AI 只读操作".into()));
        }
        let current = now();
        tx.execute("INSERT INTO ai_approvals(server_id,server_alias,action,command,requested_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6)", params![server_id,alias,action,command,current,current+900])?;
        let id = tx.last_insert_rowid();
        tx.commit()?;
        drop(conn);
        self.get_ai_approval(id)?
            .ok_or_else(|| AppError::NotFound("审批记录未找到".into()))
    }

    pub fn get_ai_approval(&self, id: i64) -> Result<Option<AiApproval>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let result = conn.query_row("SELECT id,server_id,server_alias,action,command,status,requested_at,expires_at,decided_at,finished_at,result FROM ai_approvals WHERE id=?1", [id], approval_row).optional()?;
        Ok(result)
    }

    pub fn list_ai_approvals(&self) -> Result<Vec<AiApproval>, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        conn.execute(
            "UPDATE ai_approvals SET status='expired' WHERE status='pending' AND expires_at<=?1",
            [now()],
        )?;
        conn.execute(
            "UPDATE mcp_operation_tasks SET status='expired', updated_at=?1, error_code='approval_expired'
             WHERE status='pending_approval' AND id IN (
                 SELECT task_id FROM mcp_approval_bindings b
                 JOIN ai_approvals a ON a.id=b.approval_id
                 WHERE a.status='expired'
             )",
            [now()],
        )?;
        // 进程崩溃后无法断言远端命令是否已经生效，标记未知且禁止重放。
        conn.execute(
            "UPDATE ai_approvals SET status='unknown',result='执行状态未知，请人工核查服务器；不可重复批准此申请' WHERE status='executing' AND decided_at<?1",
            [now() - 600],
        )?;
        let mut stmt = conn.prepare("SELECT id,server_id,server_alias,action,command,status,requested_at,expires_at,decided_at,finished_at,result FROM ai_approvals ORDER BY id DESC LIMIT 100")?;
        let approvals = stmt
            .query_map([], approval_row)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(approvals)
    }

    pub fn reject_ai_approval(&self, id: i64, reason: &str) -> Result<(), AppError> {
        let reason = reason.trim();
        if reason.len() > 500 {
            return Err(AppError::InvalidInput(
                "审批驳回原因不能超过 500 个字符".into(),
            ));
        }
        let reason = if reason.is_empty() {
            "人工审批驳回"
        } else {
            reason
        };
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let changed = conn.execute("UPDATE ai_approvals SET status='rejected',decided_at=?2,result=?3 WHERE id=?1 AND status='pending' AND expires_at>?2", params![id,now(),reason])?;
        if changed == 0 {
            return Err(AppError::Custom("审批已处理或已过期".into()));
        }
        Ok(())
    }

    /// 原子占用审批。占用后即使 SSH 失败也不可复用，避免重复下发改动命令。
    pub fn take_ai_approval(&self, id: i64) -> Result<AiApproval, AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let tx = conn.transaction()?;
        let approval = tx.query_row("SELECT id,server_id,server_alias,action,command,status,requested_at,expires_at,decided_at,finished_at,result FROM ai_approvals WHERE id=?1", [id], approval_row).optional()?.ok_or_else(|| AppError::NotFound("审批记录不存在".into()))?;
        if approval.status != "pending" || approval.expires_at <= now() {
            return Err(AppError::Custom("审批已处理或已过期".into()));
        }
        let value: Option<String> = tx
            .query_row(
                "SELECT value FROM app_config WHERE key=?1 AND deleted_at IS NULL",
                [LOCK_KEY],
                |row| row.get(0),
            )
            .optional()?;
        if lock_state(value, now()).locked {
            return Err(AppError::Custom(
                "AI 操作已锁定，请先在 AI 桥接中心打开总开关".into(),
            ));
        }
        let server: Option<(String, String, String)> = tx
            .query_row(
                "SELECT alias,ai_policy,os_type FROM servers WHERE id=?1",
                [approval.server_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        let (alias, policy, os_type) =
            server.ok_or_else(|| AppError::NotFound("目标服务器不存在".into()))?;
        if alias != approval.server_alias {
            return Err(AppError::Custom("目标服务器已变更，请重新申请审批".into()));
        }
        if os_type != "linux" {
            return Err(AppError::Custom("目标服务器不再是 Linux 主机".into()));
        }
        if matches!(policy.as_str(), "denied" | "disabled") {
            return Err(AppError::Custom("该服务器对 AI 禁用".into()));
        }
        if !matches!(
            policy.as_str(),
            "trusted" | "autonomous" | "allowlist" | "approval" | "strict"
        ) && !(policy == "readonly" && approval.action == "mcp_readonly")
        {
            return Err(AppError::Custom("仅允许 AI 只读操作".into()));
        }
        if let Some((task_id, token_id, source_client)) = tx
            .query_row(
                "SELECT task_id, token_id, source_client FROM mcp_approval_bindings WHERE approval_id=?1",
                [id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?, row.get::<_, String>(2)?)),
            )
            .optional()?
        {
            let bound: Option<(String, Option<String>, String, Option<String>, String, i64)> = tx
                .query_row(
                    "SELECT t.status, t.plan_id, t.source_client, k.expires_at,
                            k.status, t.expires_at
                     FROM mcp_operation_tasks t
                     JOIN mcp_tokens k ON k.id=t.token_id
                     WHERE t.id=?1 AND t.token_id=?2",
                    params![task_id, token_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?)),
                )
                .optional()?;
            let Some((task_status, plan_id, task_client, token_expiry, token_status, task_expiry)) = bound else {
                return Err(AppError::Custom("MCP 任务或 Token 不存在，已停止执行".into()));
            };
            let local_now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
            let token_expired = token_expiry.as_deref().is_some_and(|value| value <= local_now.as_str());
            let plan_matches: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM ai_approval_plans WHERE approval_id=?1 AND plan_id=?2)",
                params![id, plan_id],
                |row| row.get(0),
            )?;
            let server_scope: String = tx.query_row(
                "SELECT server_scope FROM mcp_tokens WHERE id=?1", [token_id], |row| row.get(0),
            )?;
            let tool_scope: String = tx.query_row(
                "SELECT tool_scope FROM mcp_tokens WHERE id=?1", [token_id], |row| row.get(0),
            )?;
            if task_status != "pending_approval"
                || task_expiry <= now()
                || !plan_matches
                || task_client != source_client
                || token_status != "active"
                || token_expired
                || !server_scope.split(',').any(|item| item.trim() == alias)
                || !tool_scope.split(',').any(|item| item.trim() == "request_approval")
            {
                tx.execute(
                    "UPDATE ai_approvals SET status='failed', finished_at=?2,
                     result='MCP Token 已撤销、过期或授权/任务状态已变化，未执行命令'
                     WHERE id=?1 AND status='pending'",
                    params![id, now()],
                )?;
                tx.execute(
                    "UPDATE mcp_operation_tasks SET status='failed', updated_at=?2,
                     error_code='authorization_changed'
                     WHERE id=?1 AND status='pending_approval'",
                    params![task_id, now()],
                )?;
                tx.commit()?;
                return Err(AppError::Custom("MCP Token 已撤销、过期或授权/任务状态已变化，已停止执行".into()));
            }
        }
        tx.execute(
            "UPDATE ai_approvals SET status='executing',decided_at=?2 WHERE id=?1",
            params![id, now()],
        )?;
        tx.commit()?;
        Ok(approval)
    }

    pub fn finish_ai_approval(&self, id: i64, success: bool, result: &str) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        conn.execute("UPDATE ai_approvals SET status=?2,finished_at=?3,result=?4 WHERE id=?1 AND status='executing'", params![id,if success {"completed"} else {"failed"},now(),result])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{lock_state, now, Database};
    use crate::database::schema;
    use rusqlite::{params, Connection};
    use std::sync::Mutex;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory db");
        schema::migrate(&conn).expect("schema");
        conn.execute("INSERT INTO servers(alias,hostname,ai_policy,os_type) VALUES('test','localhost','approval','linux')", []).expect("server");
        Database {
            conn: Mutex::new(conn),
            path: std::path::PathBuf::new(),
        }
    }

    fn mcp_approval_db() -> (Database, i64) {
        let db = test_db();
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        let conn = db.conn.lock().expect("db lock");
        conn.execute(
            "INSERT INTO mcp_tokens(name,client,server_scope,tool_scope,token_hint)
             VALUES('test','custom','test','request_approval','masked')",
            [],
        )
        .expect("token");
        let token_id = conn.last_insert_rowid();
        let current = now();
        conn.execute(
            "INSERT INTO action_plans
             (id,action,summary,original_request,original_command,normalized_command,command_sha256,
              rule_version,risk_level,risk_reason,requires_approval,status,expires_at,created_at,updated_at)
             VALUES('mcp-plan','mcp_readonly','read status','MCP request','df -h','df -h','hash',
              'policy-v1','low_readonly','read-only',1,'pending_approval',?1,?2,?2)",
            params![current + 900, current],
        )
        .expect("plan");
        conn.execute(
            "INSERT INTO mcp_operation_tasks
             (id,token_id,source_client,idempotency_key,request_sha256,plan_id,summary,status,
              created_at,updated_at,expires_at,skill_ids)
             VALUES('mcp-task',?1,'custom','request-1','hash','mcp-plan','read status',
              'pending_approval',?2,?2,?3,'[]')",
            params![token_id, current, current + 900],
        )
        .expect("task");
        conn.execute(
            "INSERT INTO ai_approvals(server_id,server_alias,action,command,requested_at,expires_at)
             VALUES(1,'test','mcp_readonly','df -h',?1,?2)",
            params![current, current + 900],
        )
        .expect("approval");
        let approval_id = conn.last_insert_rowid();
        conn.execute(
            "INSERT INTO ai_approval_plans(approval_id,plan_id,created_at) VALUES(?1,'mcp-plan',?2)",
            params![approval_id, current],
        )
        .expect("approval plan link");
        conn.execute(
            "INSERT INTO mcp_approval_bindings(approval_id,task_id,token_id,source_client,created_at)
             VALUES(?1,'mcp-task',?2,'custom',?3)",
            params![approval_id, token_id, current],
        )
        .expect("MCP binding");
        drop(conn);
        (db, approval_id)
    }

    #[test]
    fn lock_defaults_closed_and_expires() {
        assert!(lock_state(None, 100).locked);
        assert!(lock_state(Some("100".into()), 100).locked);
        assert!(!lock_state(Some("101".into()), 100).locked);
        assert!(!lock_state(Some("-1".into()), 100).locked);
    }

    #[test]
    fn approval_requires_global_unlock_and_server_policy() {
        let db = test_db();
        assert!(db
            .create_ai_approval(1, "restart_nginx", "systemctl restart nginx")
            .unwrap_err()
            .to_string()
            .contains("AI 操作已锁定"));
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        {
            let conn = db.conn.lock().expect("db lock");
            conn.execute("UPDATE servers SET ai_policy='denied' WHERE id=1", [])
                .expect("policy");
        }
        assert!(db
            .create_ai_approval(1, "restart_nginx", "systemctl restart nginx")
            .unwrap_err()
            .to_string()
            .contains("该服务器对 AI 禁用"));
        {
            let conn = db.conn.lock().expect("db lock");
            conn.execute("UPDATE servers SET ai_policy='readonly' WHERE id=1", [])
                .expect("policy");
        }
        assert!(db
            .create_ai_approval(1, "restart_nginx", "systemctl restart nginx")
            .unwrap_err()
            .to_string()
            .contains("仅允许 AI 只读操作"));
    }

    #[test]
    fn approval_is_one_time_and_rechecks_lock() {
        let db = test_db();
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        let first = db
            .create_ai_approval(1, "restart_nginx", "systemctl restart nginx")
            .expect("approval");
        db.set_ai_lock_until(None).expect("lock");
        assert!(db
            .take_ai_approval(first.id)
            .unwrap_err()
            .to_string()
            .contains("AI 操作已锁定"));
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        db.take_ai_approval(first.id).expect("take");
        assert!(db.take_ai_approval(first.id).is_err());
        db.finish_ai_approval(first.id, false, "network error")
            .expect("finish");
        assert_eq!(
            db.get_ai_approval(first.id)
                .expect("get")
                .expect("row")
                .status,
            "failed"
        );
        let rejected = db
            .create_ai_approval(1, "restart_nginx", "systemctl restart nginx")
            .expect("approval");
        db.reject_ai_approval(rejected.id, "测试驳回")
            .expect("reject");
        assert!(db.take_ai_approval(rejected.id).is_err());
        let expired = db
            .create_ai_approval(1, "restart_nginx", "systemctl restart nginx")
            .expect("approval");
        {
            let conn = db.conn.lock().expect("db lock");
            conn.execute(
                "UPDATE ai_approvals SET expires_at=0 WHERE id=?1",
                params![expired.id],
            )
            .expect("expire");
        }
        assert!(db.take_ai_approval(expired.id).is_err());
        assert_eq!(
            db.list_ai_approvals()
                .expect("list")
                .into_iter()
                .find(|item| item.id == expired.id)
                .expect("row")
                .status,
            "expired"
        );
        let changed = db
            .create_ai_approval(1, "restart_nginx", "systemctl restart nginx")
            .expect("approval");
        {
            let conn = db.conn.lock().expect("db lock");
            conn.execute("UPDATE servers SET ai_policy='disabled' WHERE id=1", [])
                .expect("disable");
        }
        assert!(db
            .take_ai_approval(changed.id)
            .unwrap_err()
            .to_string()
            .contains("该服务器对 AI 禁用"));
    }

    #[test]
    fn mcp_approval_rechecks_token_and_task_inside_atomic_claim() {
        let (db, approval_id) = mcp_approval_db();
        db.revoke_mcp_token(1).expect("revoke token");
        assert!(db
            .take_ai_approval(approval_id)
            .expect_err("revoked token cannot be claimed")
            .to_string()
            .contains("MCP Token"));
        assert_eq!(
            db.get_ai_approval(approval_id)
                .expect("read approval")
                .expect("approval")
                .status,
            "failed"
        );
        assert_eq!(
            db.get_mcp_operation_task(1, "mcp-task")
                .expect("read task")
                .expect("task")
                .status,
            crate::models::McpTaskStatus::Failed
        );
    }

    #[test]
    fn mcp_readonly_approval_can_be_claimed_only_for_bound_readonly_server() {
        let (db, approval_id) = mcp_approval_db();
        db.take_ai_approval(approval_id)
            .expect("valid MCP read-only approval");
        assert_eq!(
            db.get_ai_approval(approval_id)
                .expect("read approval")
                .expect("approval")
                .status,
            "executing"
        );
    }
}
