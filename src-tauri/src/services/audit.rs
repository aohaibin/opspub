use crate::database::Database;
use crate::error::AppError;
use crate::models::{AuditLog, AuditLogPage};
use crate::services::sensitive::{project_fields, SensitiveService};

const MAX_AUDIT_FIELD_BYTES: usize = 12_000;
const AUDIT_RETENTION_DAYS: i64 = 180;
pub const AUDIT_RETENTION_CONFIG_KEY: &str = "audit.retention_days";
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
        purge_expired_logs(db)?;
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
        purge_expired_logs(db)?;
        project_logs(db.get_audit_logs(limit.min(500))?)
    }

    /// 获取有界审计日志页，避免前端一次性加载完整日志库。
    pub fn get_logs_page(db: &Database, limit: i32, offset: i32) -> Result<AuditLogPage, AppError> {
        if limit <= 0 || offset < 0 || offset > MAX_AUDIT_OFFSET {
            return Err(AppError::InvalidInput("审计日志分页参数超出范围".into()));
        }
        purge_expired_logs(db)?;
        let limit = limit.min(MAX_AUDIT_PAGE_SIZE);
        let (records, total) = db.get_audit_logs_page(limit, offset)?;
        let has_more = i64::from(offset) + (records.len() as i64) < total;
        let records = project_logs(records)?;
        Ok(AuditLogPage {
            records,
            total,
            limit,
            offset,
            has_more,
        })
    }
}

pub fn parse_retention_days(value: &str) -> Option<i64> {
    value
        .parse()
        .ok()
        .filter(|days| (0..=3650).contains(days))
}

fn purge_expired_logs(db: &Database) -> Result<(), AppError> {
    let days = db
        .get_config(AUDIT_RETENTION_CONFIG_KEY)?
        .as_deref()
        .and_then(parse_retention_days)
        .unwrap_or(AUDIT_RETENTION_DAYS);
    // 0 表示保留全部历史，不能交给数据库层作为删除条件。
    if days > 0 {
        db.purge_audit_logs(days)?;
    }
    Ok(())
}

fn project_logs(records: Vec<AuditLog>) -> Result<Vec<AuditLog>, AppError> {
    // 旧记录可能来自脱敏规则不完整的版本。读取时投影，保留原始日志存证和分页信息。
    records
        .into_iter()
        .map(|mut log| {
            [log.server_alias, log.command, log.user, log.result] =
                project_fields([&log.server_alias, &log.command, &log.user, &log.result])?;
            Ok(log)
        })
        .collect()
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
        let logs = db
            .get_audit_logs(10)
            .expect("read stored fields before the display projection");
        assert_eq!(logs.len(), 1);
        assert!(!logs[0].command.contains("secret-value-123456"));
        assert!(!logs[0].result.contains("hunter2"));
    }

    #[test]
    fn reads_project_mixed_legacy_fields_without_writing_to_the_vault() {
        let db = Database::init(":memory:").expect("database");
        let command = "MYSQL_ROOT_PASSWORD='fixture env value' mysql -pFIXTURE_CLI -p'fixture; quoted' --execute=fixture-query";
        let result =
            r#"success {"access_token":"fixture match","text":"fixture-receipt FIXTURE_CLI"}"#;
        let id = db
            .add_audit_log(
                "fixture-target fixture match",
                command,
                "fixture-actor FIXTURE ENV VALUE",
                result,
            )
            .expect("seed legacy row directly");
        let page = AuditService::get_logs_page(&db, 20, 0).expect("page");
        assert_eq!(
            (page.total, page.limit, page.offset, page.has_more),
            (1, 20, 0, false)
        );
        let row = &page.records[0];
        assert_eq!(row.id, id);
        assert_eq!(
            row.command,
            "MYSQL_ROOT_PASSWORD=[REDACTED] mysql -p[REDACTED] -p[REDACTED] --execute=fixture-query"
        );
        assert_eq!(
            row.result,
            r#"success {"access_token":[REDACTED],"text":"fixture-receipt [REDACTED]"}"#
        );
        assert_eq!(row.server_alias, "fixture-target [REDACTED]");
        assert_eq!(row.user, "fixture-actor [REDACTED]");
        let unpaged = AuditService::get_logs(&db, 20).expect("list");
        assert_eq!(unpaged[0].command, row.command);
        assert_eq!(unpaged[0].result, row.result);
        let stored = db.get_audit_logs(20).expect("read stored fields");
        assert_eq!(stored[0].command, command);
        assert_eq!(stored[0].result, result);
        assert!(db
            .get_sensitive_entries(None, None, None)
            .expect("read vault")
            .is_empty());
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
