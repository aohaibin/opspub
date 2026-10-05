use crate::database::Database;
use crate::error::AppError;
use crate::models::AuditLog;

/// 审核日志服务
pub struct AuditService;

impl AuditService {
    /// 添加审核日志
    pub fn add_log(
        db: &Database,
        server_alias: &str,
        command: &str,
        user: &str,
        result: &str,
    ) -> Result<i64, AppError> {
        db.add_audit_log(server_alias, command, user, result)
    }

    /// 获取审核日志
    pub fn get_logs(db: &Database, limit: i32) -> Result<Vec<AuditLog>, AppError> {
        db.get_audit_logs(limit)
    }
}
