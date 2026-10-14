use chrono::Local;
use regex::Regex;
use sha2::{Digest, Sha256};

use crate::database::Database;
use crate::error::AppError;
use crate::models::{SensitiveEntry, SensitiveListFilter, SensitiveScanRequest, SensitiveScanResult};

const MAX_SCAN_BYTES: usize = 5 * 1024 * 1024;

pub struct SensitiveService;

struct ScanRule {
    secret_type: &'static str,
    default_label: &'static str,
    regex: Regex,
}

impl SensitiveService {
    pub fn list(db: &Database, filter: SensitiveListFilter) -> Result<Vec<SensitiveEntry>, AppError> {
        db.get_sensitive_entries(&filter)
    }

    pub fn scan(db: &Database, request: SensitiveScanRequest) -> Result<SensitiveScanResult, AppError> {
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
        if source.is_empty() || source.len() > 200 {
            return Err(AppError::InvalidInput("来源不能为空且不能超过 200 个字符".into()));
        }
        let server_alias = request.server_alias.as_deref().unwrap_or("未关联服务器").trim();
        if server_alias.len() > 160 {
            return Err(AppError::InvalidInput("服务器别名不能超过 160 个字符".into()));
        }

        let rules = build_rules()?;
        let detected_at = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut entries = Vec::new();
        let mut seen = Vec::<String>::new();

        for rule in rules {
            for matched in rule.regex.find_iter(&content) {
                let raw = matched.as_str();
                let hash = hash_value(raw);
                if seen.iter().any(|item| item == &hash) {
                    continue;
                }
                seen.push(hash.clone());

                let label = label_for(&rule, raw);
                let masked_value = mask_value(raw, rule.secret_type == "private_key");
                let entry = db.add_sensitive_entry(
                    request.server_id,
                    server_alias,
                    &detected_at,
                    rule.secret_type,
                    &label,
                    &masked_value,
                    source,
                    &hash,
                    1,
                )?;
                entries.push(entry);
            }
        }

        Ok(SensitiveScanResult {
            match_count: entries.len(),
            entries,
        })
    }

    pub fn update_status(db: &Database, id: i64, status: &str) -> Result<bool, AppError> {
        if id <= 0 {
            return Err(AppError::InvalidInput("敏感条目 ID 无效".into()));
        }
        if !matches!(status, "pending" | "retained" | "false_positive" | "discarded") {
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
        let entries = db.get_sensitive_entries(&filter)?;
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
            r#"(?im)(?:password|passwd|secret|credential)\s*[:=]\s*[^\s"'\x60,;]+"#,
        ),
        (
            "token",
            "Token 字段",
            r#"(?im)(?:token|api[_-]?key|access[_-]?key)\s*[:=]\s*[^\s"'\x60,;]+"#,
        ),
        ("token", "JWT Token", r"\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b"),
        ("token", "GitHub Token", r"\bgh[pousr]_[A-Za-z0-9_]{20,}\b"),
        ("credential", "AWS Access Key", r"\bAKIA[0-9A-Z]{16}\b"),
        (
            "ip",
            "公网 IP 地址",
            r"\b(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b",
        ),
    ];
    specs
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
        .collect()
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
    } else if lower.contains("token") || lower.contains("api") || lower.contains("access") || raw.starts_with("eyJ") || raw.starts_with("gh") {
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
    let tail: String = chars.iter().rev().take(2).collect::<Vec<_>>().into_iter().rev().collect();
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
    use super::{build_rules, hash_value, mask_value};

    #[test]
    fn masks_without_retaining_secret() {
        assert_eq!(mask_value("password123", false), "pas****23");
        assert!(mask_value("-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----", true).contains("REDACTED"));
    }

    #[test]
    fn rules_compile_and_hash_is_stable() {
        assert!(build_rules().is_ok());
        assert_eq!(hash_value("secret"), hash_value("secret"));
        assert_ne!(hash_value("secret"), hash_value("other"));
    }
}
