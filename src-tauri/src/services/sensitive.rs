use chrono::Local;
use regex::Regex;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    SensitiveEntry, SensitiveListFilter, SensitiveScanRequest, SensitiveScanResult,
};

mod projection;
pub(super) use projection::project_fields;

const MAX_SCAN_BYTES: usize = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES: usize = 200;
const REDACTED_SOURCE: &str = "[REDACTED]";
const REDACTED_CREDENTIAL: &str = "[REDACTED: credential]";
const REDACTED_TOKEN: &str = "[REDACTED: token]";
const REDACTED_PRIVATE_KEY: &str = "[REDACTED: private key]";
const REDACTED_IP: &str = "[REDACTED: public IP]";
const SOURCE_PLACEHOLDERS: &[&str] = &[
    REDACTED_SOURCE,
    REDACTED_CREDENTIAL,
    REDACTED_TOKEN,
    REDACTED_PRIVATE_KEY,
    REDACTED_IP,
];

pub struct SensitiveService;

struct ScanRule {
    secret_type: &'static str,
    default_label: &'static str,
    regex: Regex,
}

pub struct OutboundSanitizeResult {
    pub content: String,
    pub match_count: usize,
}

impl SensitiveService {
    pub fn list(
        db: &Database,
        filter: SensitiveListFilter,
    ) -> Result<Vec<SensitiveEntry>, AppError> {
        let rows = db.get_sensitive_entries(
            filter.server_id,
            filter.status.as_deref(),
            filter.secret_type.as_deref(),
        )?;
        // 搜索与详情、CSV 共用这里投影后的来源。
        let mut entries: Vec<_> = rows
            .into_iter()
            .map(|(mut entry, source_projected)| {
                if !source_projected && !is_known_legacy_source(&entry.source) {
                    entry.source = REDACTED_SOURCE.to_owned();
                }
                entry
            })
            .collect();
        if let Some(search) = filter
            .search
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            let needle = search.to_ascii_lowercase();
            entries.retain(|entry| {
                [&entry.server_alias, &entry.label, &entry.source]
                    .iter()
                    .any(|field| field.to_ascii_lowercase().contains(&needle))
            });
        }
        Ok(entries)
    }

    pub fn scan(
        db: &Database,
        request: SensitiveScanRequest,
    ) -> Result<SensitiveScanResult, AppError> {
        let content = request.content;
        if content.trim().is_empty() {
            return Err(AppError::InvalidInput("待扫描内容不能为空".into()));
        }
        if content.len() > MAX_SCAN_BYTES {
            return Err(AppError::InvalidInput(format!(
                "待扫描内容不能超过 {} MB",
                MAX_SCAN_BYTES / 1024 / 1024
            )));
        }

        let source = request.source.trim();
        if source.is_empty() || source.len() > MAX_SOURCE_BYTES {
            return Err(AppError::InvalidInput(
                "来源不能为空且不能超过 200 个字符".into(),
            ));
        }
        let server_alias = request
            .server_alias
            .as_deref()
            .unwrap_or("未关联服务器")
            .trim();
        if server_alias.len() > 160 {
            return Err(AppError::InvalidInput(
                "服务器别名不能超过 160 个字符".into(),
            ));
        }

        let rules = build_rules()?;
        let (sanitized_content, matches) = sanitize_text(&content, &rules);
        let source = project_source(source, &rules, &matches);
        let detected_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut entries = Vec::with_capacity(matches.len());

        for item in matches {
            let entry = db.add_sensitive_entry(
                request.server_id,
                server_alias,
                &detected_at,
                item.secret_type,
                &item.label,
                &item.masked_value,
                &source,
                &item.value_hash,
                1,
            )?;
            entries.push(entry);
        }

        Ok(SensitiveScanResult {
            match_count: entries.len(),
            entries,
            sanitized_content,
        })
    }

    /// 扫描并替换即将发送给外部模型的内容；记录失败时调用方必须停止发送。
    pub fn sanitize_outbound(
        db: &Database,
        content: &str,
        source: &str,
    ) -> Result<OutboundSanitizeResult, AppError> {
        if content.len() > MAX_SCAN_BYTES {
            return Err(AppError::InvalidInput(format!(
                "AI 请求内容不能超过 {} MB",
                MAX_SCAN_BYTES / 1024 / 1024
            )));
        }
        let source = source.trim();
        if source.is_empty() || source.len() > MAX_SOURCE_BYTES {
            return Err(AppError::InvalidInput("AI 请求拦截来源无效".into()));
        }

        let rules = build_rules()?;
        let (sanitized, matches) = sanitize_text(content, &rules);
        if matches.is_empty() {
            return Ok(OutboundSanitizeResult {
                content: sanitized,
                match_count: 0,
            });
        }

        let source = project_source(source, &rules, &matches);
        let detected_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        for item in &matches {
            // AI 请求没有可信的服务器归属，使用独立别名避免误归到某台主机。
            db.add_sensitive_entry(
                None,
                "AI 对话",
                &detected_at,
                item.secret_type,
                &item.label,
                &item.masked_value,
                &source,
                &item.value_hash,
                1,
            )?;
        }

        Ok(OutboundSanitizeResult {
            content: sanitized,
            match_count: matches.len(),
        })
    }

    pub fn update_status(db: &Database, id: i64, status: &str) -> Result<bool, AppError> {
        if id <= 0 {
            return Err(AppError::InvalidInput("敏感条目 ID 无效".into()));
        }
        if !matches!(
            status,
            "pending" | "retained" | "false_positive" | "discarded"
        ) {
            return Err(AppError::InvalidInput("敏感条目状态无效".into()));
        }
        db.update_sensitive_status(id, status)
    }

    pub fn delete(db: &Database, id: i64) -> Result<bool, AppError> {
        if id <= 0 {
            return Err(AppError::InvalidInput("敏感条目 ID 无效".into()));
        }
        db.delete_sensitive_entry(id)
    }

    pub fn export_csv(db: &Database, filter: SensitiveListFilter) -> Result<String, AppError> {
        let entries = Self::list(db, filter)?;
        let mut csv = String::from("时间,服务器,类型,标签,脱敏预览,来源,状态,命中次数\n");
        for entry in entries {
            let row = [
                entry.detected_at,
                entry.server_alias,
                entry.secret_type,
                entry.label,
                entry.masked_value,
                entry.source,
                entry.status,
                entry.match_count.to_string(),
            ];
            csv.push_str(
                &row.iter()
                    .map(|value| csv_cell(value))
                    .collect::<Vec<_>>()
                    .join(","),
            );
            csv.push('\n');
        }
        Ok(csv)
    }
}

struct SanitizedMatch {
    secret_type: &'static str,
    label: String,
    masked_value: String,
    value_hash: String,
    secret_value: String,
}

fn project_source(source: &str, rules: &[ScanRule], body_matches: &[SanitizedMatch]) -> String {
    let (sanitized, source_matches) = sanitize_text(source, rules);
    let sanitized = sanitized.trim();
    if sanitized.is_empty() || sanitized.len() > MAX_SOURCE_BYTES {
        return REDACTED_SOURCE.to_owned();
    }

    // 占位符包含标点，字符规则只应用于占位符以外的文本。
    let mut remainder = sanitized.to_owned();
    for placeholder in SOURCE_PLACEHOLDERS {
        remainder = remainder.replace(placeholder, " ");
    }
    if !remainder
        .chars()
        .all(|ch| ch.is_alphanumeric() || matches!(ch, ' ' | '.' | '-' | '_' | '%' | '·'))
    {
        return REDACTED_SOURCE.to_owned();
    }
    // 赋值中的裸值也可能出现在备注里。对完整展示文本检查，避免值跨越占位符边界。
    // 搜索忽略 ASCII 大小写，检查时使用相同的匹配行为。
    let visible = sanitized.to_ascii_lowercase();
    if body_matches.iter().chain(&source_matches).any(|item| {
        item.secret_value.len() <= visible.len()
            && visible.contains(&item.secret_value.to_ascii_lowercase())
    }) {
        return REDACTED_SOURCE.to_owned();
    }
    sanitized.to_owned()
}

fn is_known_legacy_source(source: &str) -> bool {
    // 旧记录只有指纹，无法判断自由文本是否复用了秘密。仅放行完整的固定标签和占位符。
    SOURCE_PLACEHOLDERS.contains(&source)
        || matches!(
            source,
            "手动测试"
                | "audit-server"
                | "audit-command"
                | "audit-user"
                | "audit-result"
                | "copilot-outbound-user"
                | "copilot-outbound-context"
                | "copilot-outbound-history"
                | "mcp-audit-request"
                | "mcp-response"
                | "mcp-response-error"
                | "mcp_readonly_query"
                | "mcp_plan_preview"
                | "mcp-task-result"
                | "mcp-task-step-result"
                | "mcp-task-source"
                | "mcp-task-summary"
                | "mcp-task-error-code"
                | "mcp-deployment-target"
                | "mcp-deployment-server"
                | "mcp-deployment-recipe"
                | "mcp-deployment-path"
                | "mcp-deployment-artifact"
                | "mcp-deployment-history"
                | "mcp-server-list"
        )
}

fn sanitize_text(content: &str, rules: &[ScanRule]) -> (String, Vec<SanitizedMatch>) {
    let mut text = content.replace('\0', "");
    let mut seen = HashSet::new();
    let mut matches = Vec::new();

    for rule in rules {
        let mut found = rule.regex.captures_iter(&text).peekable();
        if found.peek().is_none() {
            continue;
        }
        for captures in found {
            let Some(matched) = captures.get(0) else {
                continue;
            };
            let raw = matched.as_str();
            let value_hash = hash_value(raw);
            if !seen.insert(value_hash.clone()) {
                continue;
            }
            matches.push(SanitizedMatch {
                secret_type: rule.secret_type,
                label: label_for(rule, raw),
                masked_value: mask_value(raw, rule.secret_type == "private_key"),
                value_hash,
                secret_value: captures
                    .name("value")
                    .unwrap_or(matched)
                    .as_str()
                    .to_owned(),
            });
        }
        text = rule
            .regex
            .replace_all(&text, replacement_for(rule.secret_type))
            .into_owned();
    }

    (text, matches)
}

fn replacement_for(secret_type: &str) -> &'static str {
    match secret_type {
        "private_key" => REDACTED_PRIVATE_KEY,
        "credential" => REDACTED_CREDENTIAL,
        "token" => REDACTED_TOKEN,
        "ip" => REDACTED_IP,
        _ => REDACTED_SOURCE,
    }
}

fn build_rules() -> Result<Vec<ScanRule>, AppError> {
    let specs = [
        (
            "private_key",
            "PEM 私钥",
            r"-----BEGIN [A-Z0-9 ]+-----[\s\S]*?-----END [A-Z0-9 ]+-----",
        ),
        (
            "credential",
            "凭据字段",
            r#"(?im)(?:password|passwd|secret|credential)\s*[:=]\s*(?P<value>[^\s"'\x60,;]+)"#,
        ),
        (
            "token",
            "Token 字段",
            r#"(?im)(?:token|api[_-]?key|access[_-]?key)\s*[:=]\s*(?P<value>[^\s"'\x60,;]+)"#,
        ),
    ];
    let mut rules = specs
        .into_iter()
        .map(|(secret_type, default_label, pattern)| {
            Regex::new(pattern)
                .map(|regex| ScanRule {
                    secret_type,
                    default_label,
                    regex,
                })
                .map_err(|error| AppError::Custom(format!("敏感规则初始化失败: {error}")))
        })
        .collect::<Result<Vec<_>, _>>()?;
    rules.extend(projection::literal_rules()?.iter().map(|rule| ScanRule {
        secret_type: rule.secret_type.as_str(),
        default_label: rule.label.as_str(),
        regex: rule.regex.clone(),
    }));
    Ok(rules)
}

fn label_for(rule: &ScanRule, raw: &str) -> String {
    if rule.secret_type == "private_key" {
        return raw
            .lines()
            .next()
            .unwrap_or(rule.default_label)
            .trim()
            .to_string();
    }
    let lower = raw.to_ascii_lowercase();
    if lower.contains("password") || lower.contains("passwd") {
        "密码字段".into()
    } else if lower.contains("secret") || lower.contains("credential") {
        "Secret 字段".into()
    } else if lower.contains("token")
        || lower.contains("api")
        || lower.contains("access")
        || raw.starts_with("eyJ")
        || raw.starts_with("gh")
    {
        "访问 Token".into()
    } else {
        rule.default_label.into()
    }
}

fn mask_value(raw: &str, private_key: bool) -> String {
    if private_key {
        return raw
            .lines()
            .next()
            .map(|header| format!("{header} ... [REDACTED]"))
            .unwrap_or_else(|| "[REDACTED]".into());
    }
    let chars: Vec<char> = raw.chars().collect();
    if chars.len() <= 8 {
        return "****".into();
    }
    let head: String = chars.iter().take(3).collect();
    let tail: String = chars
        .iter()
        .rev()
        .take(2)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{head}****{tail}")
}

fn hash_value(value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn csv_cell(value: &str) -> String {
    let escaped = value.replace('"', "\"\"");
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use super::{
        build_rules, hash_value, mask_value, sanitize_text, SensitiveService, REDACTED_CREDENTIAL,
        REDACTED_SOURCE,
    };
    use crate::database::Database;
    use crate::models::{SensitiveEntry, SensitiveListFilter, SensitiveScanRequest};

    fn scan_entry(db: &Database, content: &str, source: &str) -> SensitiveEntry {
        let result = SensitiveService::scan(
            db,
            SensitiveScanRequest {
                server_id: None,
                server_alias: None,
                content: content.into(),
                source: source.into(),
            },
        )
        .expect("scan synthetic credential");
        assert_eq!(result.match_count, 1);
        result.entries.into_iter().next().expect("one match")
    }

    fn assert_hidden_from_search(db: &Database, marker: &str) {
        let filter = SensitiveListFilter {
            search: Some(marker.into()),
            ..Default::default()
        };
        assert!(SensitiveService::list(db, filter.clone())
            .expect("search visible fields")
            .is_empty());
        let filtered_csv = SensitiveService::export_csv(db, filter).expect("export search results");
        assert_eq!(filtered_csv.lines().count(), 1);
        let csv = SensitiveService::export_csv(db, SensitiveListFilter::default())
            .expect("export all entries");
        assert!(!csv.contains(marker));
    }

    #[test]
    fn scan_projects_sources_before_persistence_and_reading() {
        let db = Database::init(":memory:").expect("open isolated database");
        let marker = "review-marker-synthetic";
        let content = format!("password={marker}");
        let mixed = "运维备注 [REDACTED: credential] 由手工检查";
        let cases = [
            (content.clone(), REDACTED_CREDENTIAL),
            (marker.into(), REDACTED_SOURCE),
            (format!("password=\"{marker}\""), REDACTED_SOURCE),
            (format!("运维备注 password={marker} 由手工检查"), mixed),
            (mixed.into(), mixed),
            (format!("Review ticket {marker}"), REDACTED_SOURCE),
            (
                format!("Review ticket {}", marker.to_ascii_uppercase()),
                REDACTED_SOURCE,
            ),
            (
                format!("Review password={marker} confirm {marker}"),
                REDACTED_SOURCE,
            ),
            (
                "Review password=source-only-marker confirm source-only-marker".into(),
                REDACTED_SOURCE,
            ),
            (
                format!("Review password={marker} note=second-synthetic"),
                REDACTED_SOURCE,
            ),
            ("ssh_exec · .env 检查".into(), "ssh_exec · .env 检查"),
        ];
        let mut expected = Vec::new();
        for (source, projected) in cases {
            let entry = scan_entry(&db, &content, &source);
            assert_eq!(entry.source, projected);
            expected.push(projected);
        }
        expected.reverse();

        let stored = db
            .get_sensitive_entries(None, None, None)
            .expect("read stored rows");
        assert!(stored.iter().all(|(_, projected)| *projected));
        assert_eq!(
            stored
                .iter()
                .map(|(entry, _)| entry.source.as_str())
                .collect::<Vec<_>>(),
            expected,
        );
        let listed =
            SensitiveService::list(&db, SensitiveListFilter::default()).expect("list entries");
        assert_eq!(
            listed
                .iter()
                .map(|entry| entry.source.as_str())
                .collect::<Vec<_>>(),
            expected
        );
        let csv = SensitiveService::export_csv(&db, SensitiveListFilter::default())
            .expect("export entries");
        let sources = csv::Reader::from_reader(csv.as_bytes())
            .records()
            .map(|row| row.expect("parse CSV")[5].to_owned())
            .collect::<Vec<_>>();
        assert_eq!(sources, expected);
        for hidden in [marker, "second-synthetic", "source-only-marker"] {
            assert_hidden_from_search(&db, hidden);
        }
    }

    #[test]
    fn legacy_sources_only_expose_fixed_labels_and_standalone_placeholders() {
        let uri = format!("file:{}?mode=memory&cache=shared", uuid::Uuid::new_v4());
        let conn = rusqlite::Connection::open(&uri).expect("open shared in-memory fixture");
        crate::database::schema::migrate(&conn).expect("initialize fixture schema");
        conn.execute_batch(
            "ALTER TABLE sensitive_entries DROP COLUMN source_projected;
             PRAGMA user_version=23;",
        )
        .expect("recreate the legacy schema");
        let marker = "legacy-marker-synthetic";
        let assignment = format!("password={marker}");
        let value_hash = hash_value(&assignment);
        let cases = [
            (marker.into(), REDACTED_SOURCE),
            (assignment, REDACTED_SOURCE),
            (
                format!("Review [REDACTED: credential] {marker}"),
                REDACTED_SOURCE,
            ),
            (format!("audit-command {marker}"), REDACTED_SOURCE),
            ("Unverified note_foo".into(), REDACTED_SOURCE),
            (REDACTED_CREDENTIAL.into(), REDACTED_CREDENTIAL),
            ("手动测试".into(), "手动测试"),
            ("audit-command".into(), "audit-command"),
        ];
        for (index, (source, _)) in cases.iter().enumerate() {
            conn.execute(
                "INSERT INTO sensitive_entries
                 (server_alias, detected_at, secret_type, label, masked_value, source, value_hash)
                 VALUES ('Fixture', '2026-01-01 00:00:00', 'credential', ?1, '****', ?2, ?3)",
                rusqlite::params![format!("Legacy row {index}"), source, value_hash],
            )
            .expect("seed legacy record without a projection flag");
        }
        let db = Database::init(&uri).expect("migrate legacy rows");
        let list =
            SensitiveService::list(&db, SensitiveListFilter::default()).expect("list legacy rows");
        assert_eq!(list.len(), cases.len());
        for (entry, (_, expected)) in list.iter().zip(cases.iter().rev()) {
            assert_eq!(entry.source, *expected);
        }
        let stored = db
            .get_sensitive_entries(None, None, None)
            .expect("inspect original legacy rows");
        assert!(stored.iter().all(|(_, projected)| !projected));
        assert_eq!(stored.last().expect("bare legacy row").0.source, marker);
        for hidden in [marker, "note_foo"] {
            assert_hidden_from_search(&db, hidden);
        }
        let csv = SensitiveService::export_csv(&db, SensitiveListFilter::default())
            .expect("export legacy entries");
        let sources = csv::Reader::from_reader(csv.as_bytes())
            .records()
            .map(|row| row.expect("parse CSV")[5].to_owned())
            .collect::<Vec<_>>();
        assert_eq!(
            sources,
            cases
                .iter()
                .rev()
                .map(|(_, projected)| *projected)
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn outbound_scan_projects_the_source_before_saving() {
        let db = Database::init(":memory:").expect("open isolated database");
        let marker = "outbound-synthetic-marker";
        let result = SensitiveService::sanitize_outbound(
            &db,
            &format!("token={marker}"),
            &format!("Outbound report {marker}"),
        )
        .expect("scan outbound content");
        assert_eq!(result.match_count, 1);
        assert!(!result.content.contains(marker));
        let stored = db
            .get_sensitive_entries(None, None, None)
            .expect("read stored rows");
        assert_eq!(stored.len(), 1);
        assert!(stored[0].1);
        assert_eq!(stored[0].0.source, REDACTED_SOURCE);
        assert_hidden_from_search(&db, marker);
    }

    #[test]
    fn recognized_value_can_include_placeholder_text() {
        let db = Database::init(":memory:").expect("open isolated database");
        let marker = "tag[REDACTED]";
        let entry = scan_entry(
            &db,
            &format!("password={marker}"),
            &format!("Note {marker}"),
        );
        assert_eq!(entry.source, REDACTED_SOURCE);
        assert_hidden_from_search(&db, marker);
    }

    #[test]
    fn literal_search_limits_bulk_status_and_csv_to_matching_rows() {
        let db = Database::init(":memory:").expect("open isolated database");
        for index in 0..52 {
            let source = match index {
                0..=25 => "note_foo",
                26 => "note%foo",
                _ => "noteXfoo",
            };
            scan_entry(&db, &format!("password=fixture-{index}"), source);
        }
        let filter = SensitiveListFilter {
            search: Some(" Note_Foo ".into()),
            ..Default::default()
        };
        let matching =
            SensitiveService::list(&db, filter.clone()).expect("literal underscore search");
        assert_eq!(matching.len(), 26);
        assert!(matching.iter().all(|entry| entry.source == "note_foo"));
        for entry in &matching {
            assert!(SensitiveService::update_status(&db, entry.id, "retained")
                .expect("mark matching record"));
        }
        let pending = SensitiveService::list(
            &db,
            SensitiveListFilter {
                status: Some("pending".into()),
                ..Default::default()
            },
        )
        .expect("read untouched records");
        assert_eq!(pending.len(), 26);
        assert!(pending.iter().all(|entry| entry.source != "note_foo"));
        let csv = SensitiveService::export_csv(&db, filter).expect("export only literal matches");
        let mut reader = csv::Reader::from_reader(csv.as_bytes());
        let rows = reader
            .records()
            .collect::<Result<Vec<_>, _>>()
            .expect("parse CSV");
        assert_eq!(rows.len(), 26);
        assert!(rows
            .iter()
            .all(|row| &row[5] == "note_foo" && &row[6] == "retained"));
        let percent = SensitiveListFilter {
            search: Some("%".into()),
            ..Default::default()
        };
        let rows = SensitiveService::list(&db, percent.clone()).expect("literal percent search");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].source, "note%foo");
        let csv = SensitiveService::export_csv(&db, percent).expect("export literal percent match");
        assert_eq!(csv.lines().count(), 2);
        assert!(csv.contains("note%foo"));
    }

    #[test]
    fn masks_without_retaining_secret() {
        assert_eq!(mask_value("password123", false), "pas****23");
        assert!(mask_value(
            "-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----",
            true
        )
        .contains("REDACTED"));
    }

    #[test]
    fn rules_compile_and_hash_is_stable() {
        assert!(build_rules().is_ok());
        assert_eq!(hash_value("secret"), hash_value("secret"));
        assert_ne!(hash_value("secret"), hash_value("other"));
    }

    #[test]
    fn outbound_text_replaces_sensitive_values_without_touching_safe_text() {
        let input = concat!(
            "password=hunter2 safe-text ",
            "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-value-long ",
            "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----"
        );
        let rules = build_rules().expect("compile rules");
        let (sanitized, matches) = sanitize_text(input, &rules);

        assert_eq!(matches.len(), 3);
        assert!(sanitized.contains("safe-text"));
        assert!(!sanitized.contains("hunter2"));
        assert!(!sanitized.contains("eyJhbGciOiJIUzI1NiJ9"));
        assert!(!sanitized.contains("-----BEGIN PRIVATE KEY-----"));
        assert!(sanitized.contains("[REDACTED: credential]"));
        assert!(sanitized.contains("[REDACTED: token]"));
        assert!(sanitized.contains("[REDACTED: private key]"));
    }
}
