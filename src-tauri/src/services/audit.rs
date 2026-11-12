use crate::database::Database;
use crate::error::AppError;
use crate::models::{AuditLog, AuditLogPage};
use crate::services::sensitive::SensitiveService;

const MAX_AUDIT_FIELD_BYTES: usize = 12_000;
const AUDIT_RETENTION_DAYS: i64 = 180;
const MAX_AUDIT_PAGE_SIZE: i32 = 100;
const MAX_AUDIT_OFFSET: i32 = 1_000_000;

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
        db.purge_audit_logs(AUDIT_RETENTION_DAYS)?;
        let safe_server_alias = sanitize_audit_field(db, server_alias, "audit-server")?;
        let safe_command = sanitize_audit_field(db, command, "audit-command")?;
        let safe_user = sanitize_audit_field(db, user, "audit-user")?;
        let safe_result = sanitize_audit_field(db, result, "audit-result")?;
        db.add_audit_log(&safe_server_alias, &safe_command, &safe_user, &safe_result)
    }

    /// 获取审核日志
    pub fn get_logs(db: &Database, limit: i32) -> Result<Vec<AuditLog>, AppError> {
        if limit <= 0 {
            return Err(AppError::InvalidInput("审计日志条数必须是正整数".into()));
        }
        db.purge_audit_logs(AUDIT_RETENTION_DAYS)?;
        db.get_audit_logs(limit.min(500))
    }

    /// 获取有界审计日志页，避免前端一次性加载完整日志库。
    pub fn get_logs_page(db: &Database, limit: i32, offset: i32) -> Result<AuditLogPage, AppError> {
        if limit <= 0 || offset < 0 || offset > MAX_AUDIT_OFFSET {
            return Err(AppError::InvalidInput("审计日志分页参数超出范围".into()));
        }
        db.purge_audit_logs(AUDIT_RETENTION_DAYS)?;
        let limit = limit.min(MAX_AUDIT_PAGE_SIZE);
        let (records, total) = db.get_audit_logs_page(limit, offset)?;
        let has_more = i64::from(offset) + (records.len() as i64) < total;
        Ok(AuditLogPage {
            records,
            total,
            limit,
            offset,
            has_more,
        })
    }
}

fn sanitize_audit_field(db: &Database, value: &str, source: &str) -> Result<String, AppError> {
    let safe = SensitiveService::sanitize_outbound(db, value, source)?.content;
    if safe.len() <= MAX_AUDIT_FIELD_BYTES {
        return Ok(safe);
    }
    let marker = "\n...[审计字段已截断]";
    let mut end = MAX_AUDIT_FIELD_BYTES.saturating_sub(marker.len());
    while !safe.is_char_boundary(end) {
        end -= 1;
    }
    Ok(format!("{}{}", &safe[..end], marker))
}

#[cfg(test)]
mod tests {
    use super::{AuditService, MAX_AUDIT_FIELD_BYTES, MAX_AUDIT_OFFSET, MAX_AUDIT_PAGE_SIZE};
    use crate::database::Database;

    #[test]
    fn audit_log_redacts_credentials_before_persisting() {
        let db = Database::init(":memory:").expect("database");
        AuditService::add_log(
            &db,
            "test-server",
            "curl -H 'Authorization: token=secret-value-123456'",
            "mcp-client",
            "password=hunter2",
        )
        .expect("audit log");
        let logs = AuditService::get_logs(&db, 10).expect("logs");
        assert_eq!(logs.len(), 1);
        assert!(!logs[0].command.contains("secret-value-123456"));
        assert!(!logs[0].result.contains("hunter2"));
    }

    #[test]
    fn audit_log_limit_is_bounded_and_positive() {
        let db = Database::init(":memory:").expect("database");
        assert!(AuditService::get_logs(&db, 0).is_err());
        assert!(AuditService::get_logs(&db, 10_000).is_ok());
    }

    #[test]
    fn audit_log_pages_are_bounded_and_report_total() {
        let db = Database::init(":memory:").expect("database");
        for index in 0..3 {
            AuditService::add_log(
                &db,
                "test-server",
                &format!("command-{index}"),
                "test",
                "ok",
            )
            .expect("audit log");
        }

        let first = AuditService::get_logs_page(&db, 2, 0).expect("first page");
        assert_eq!(first.records.len(), 2);
        assert_eq!(first.total, 3);
        assert_eq!(first.limit, 2);
        assert_eq!(first.offset, 0);
        assert!(first.has_more);

        let second = AuditService::get_logs_page(&db, 2, 2).expect("second page");
        assert_eq!(second.records.len(), 1);
        assert_eq!(second.total, 3);
        assert!(!second.has_more);
        assert_ne!(first.records[0].id, second.records[0].id);
    }

    #[test]
    fn audit_log_page_rejects_invalid_offsets_and_bounds_page_size() {
        let db = Database::init(":memory:").expect("database");
        assert!(AuditService::get_logs_page(&db, 10, -1).is_err());
        assert!(AuditService::get_logs_page(&db, 10, MAX_AUDIT_OFFSET + 1).is_err());
        assert!(AuditService::get_logs_page(&db, 0, 0).is_err());
        let page = AuditService::get_logs_page(&db, 1_000, 0).expect("bounded page");
        assert_eq!(page.limit, MAX_AUDIT_PAGE_SIZE);
    }

    #[test]
    fn audit_log_fields_are_bounded_including_truncation_marker() {
        let db = Database::init(":memory:").expect("database");
        let large = "x".repeat(MAX_AUDIT_FIELD_BYTES * 2);
        AuditService::add_log(&db, &large, &large, "test", &large).expect("audit log");
        let log = AuditService::get_logs(&db, 1)
            .expect("logs")
            .into_iter()
            .next()
            .expect("one log");
        assert!(log.server_alias.len() <= MAX_AUDIT_FIELD_BYTES);
        assert!(log.command.len() <= MAX_AUDIT_FIELD_BYTES);
        assert!(log.result.len() <= MAX_AUDIT_FIELD_BYTES);
        assert!(log.command.ends_with("[审计字段已截断]"));
    }

    #[test]
    fn audit_log_retention_rejects_unsafe_periods() {
        let db = Database::init(":memory:").expect("database");
        assert!(db.purge_audit_logs(0).is_err());
        assert!(db.purge_audit_logs(3_651).is_err());
    }
}
