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
        tx.execute("INSERT INTO ai_approvals(server_id,server_alias,action,command,requested_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6)", params![server_id,alias,action,command,current,current+600])?;
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

    pub fn reject_ai_approval(&self, id: i64) -> Result<(), AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let changed = conn.execute("UPDATE ai_approvals SET status='rejected',decided_at=?2 WHERE id=?1 AND status='pending' AND expires_at>?2", params![id,now()])?;
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
        ) {
            return Err(AppError::Custom("仅允许 AI 只读操作".into()));
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
    use super::{lock_state, Database};
    use crate::database::schema;
    use rusqlite::{params, Connection};
    use std::sync::Mutex;

    fn test_db() -> Database {
        let conn = Connection::open_in_memory().expect("in-memory db");
        schema::migrate(&conn).expect("schema");
        conn.execute("INSERT INTO servers(alias,hostname,ai_policy,os_type) VALUES('test','localhost','approval','linux')", []).expect("server");
        Database {
            conn: Mutex::new(conn),
        }
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
        db.reject_ai_approval(rejected.id).expect("reject");
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
}
