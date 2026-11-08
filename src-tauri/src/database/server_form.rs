use super::Database;
use crate::{error::AppError, models::server_form::ServerFormRequest};

impl Database {
    /// 资产与连接选项在同一事务写入；凭据保存失败时不留下半条服务器记录。
    pub fn save_server_form(
        &self,
        input: &ServerFormRequest,
        fingerprint: &str,
        verified: bool,
        persist_credential: impl FnOnce(i64) -> Result<(), AppError>,
    ) -> Result<i64, AppError> {
        let mut conn = self
            .conn
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let tx = conn.transaction()?;
        let duplicate: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM servers WHERE lower(alias)=lower(?1) AND id != ?2)",
            rusqlite::params![input.alias, input.id.unwrap_or(0)],
            |r| r.get(0),
        )?;
        if duplicate {
            return Err(AppError::InvalidInput(
                "此别名已存在，请使用其他别名".into(),
            ));
        }
        let id = if let Some(id) = input.id {
            let exists: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM servers WHERE id=?1)",
                [id],
                |r| r.get(0),
            )?;
            if !exists {
                return Err(AppError::NotFound("服务器不存在".into()));
            }
            id
        } else {
            tx.execute("INSERT INTO servers(alias,hostname,port,username,auth_type,tags,`group`,ai_policy,os_type) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
                rusqlite::params![input.alias,input.hostname,input.port,input.username,input.auth_type,input.tags,input.group,input.ai_policy,input.os_type])?;
            tx.last_insert_rowid()
        };
        tx.execute("UPDATE servers SET alias=?1,hostname=?2,port=?3,username=?4,auth_type=?5,tags=?6,`group`=?7,ai_policy=?8,os_type=?9,allow_sudo=?10,use_local_proxy=?11,bastion_id=?12,ai_username=?13,protocol=?14,connection_options=?15,host_key_fingerprint=?16,
            last_connection_status=CASE WHEN ?18 THEN 'verified' WHEN ?16='' OR username!=?4 OR auth_type!=?5 THEN 'unknown' ELSE last_connection_status END,
            last_connection_message=CASE WHEN ?18 THEN 'SSH 连接验证成功' WHEN ?16='' OR username!=?4 OR auth_type!=?5 THEN '' ELSE last_connection_message END,
            last_connected_at=CASE WHEN ?18 THEN datetime('now','localtime') WHEN ?16='' THEN NULL ELSE last_connected_at END,
            arch=?19,updated_at=datetime('now','localtime') WHERE id=?17",
            rusqlite::params![input.alias,input.hostname,input.port,input.username,input.auth_type,input.tags,input.group,input.ai_policy,input.os_type,input.allow_sudo,input.use_local_proxy,input.bastion_id,input.ai_username,input.protocol,serde_json::to_string(&input.connection_options)?,fingerprint,id,verified,input.arch])?;
        persist_credential(id)?;
        tx.commit()?;
        Ok(id)
    }
}
