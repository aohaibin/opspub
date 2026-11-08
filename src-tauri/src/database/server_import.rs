use crate::{database::Database, error::AppError, models::server_import::ImportServerRow};

impl Database {
    pub fn insert_imported_server(
        &self,
        row: &ImportServerRow,
        auth: &str,
        policy: &str,
    ) -> Result<i64, AppError> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Custom("服务器数据库忙，请重试".into()))?;
        conn.execute(
            "INSERT INTO servers (alias,hostname,port,username,auth_type,tags,`group`,ai_policy,os_type,protocol) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
            rusqlite::params![row.alias, row.hostname, row.port, row.username, auth, serde_json::to_string(&row.tags)?, row.group, policy, row.os_type, row.protocol],
        )?;
        Ok(conn.last_insert_rowid())
    }
}
