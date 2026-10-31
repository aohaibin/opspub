use crate::error::AppError;
use keyring::{Entry, Error as KeyringError};

const ALERT_CREDENTIAL_SERVICE: &str = "com.opspub.alerts";
const WEBHOOK_ACCOUNT: &str = "default-webhook";

pub struct AlertService;

impl AlertService {
    pub fn save_webhook_url(url: &str) -> Result<(), AppError> {
        validate_url(url)?;
        Self::webhook_entry()?
            .set_password(url.trim())
            .map_err(|error| AppError::Custom(format!("保存 Webhook 凭据失败: {error}")))
    }

    pub fn webhook_configured() -> Result<bool, AppError> {
        match Self::webhook_entry()?.get_password() {
            Ok(_) => Ok(true),
            Err(KeyringError::NoEntry) => Ok(false),
            Err(error) => Err(AppError::Custom(format!("读取 Webhook 凭据状态失败: {error}"))),
        }
    }

    pub fn delete_webhook_url() -> Result<(), AppError> {
        match Self::webhook_entry()?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(AppError::Custom(format!("删除 Webhook 凭据失败: {error}"))),
        }
    }

    /// 从系统凭据管理器读取地址发送通用告警负载；凭据不会写入日志或返回值。
    pub fn send_webhook(title: &str, body: &str) -> Result<(), AppError> {
        let url = Self::webhook_entry()?
            .get_password()
            .map_err(|error| AppError::Custom(format!("读取 Webhook 凭据失败: {error}")))?;
        let parsed = validate_url(&url)?;
        if title.trim().is_empty() || body.trim().is_empty() {
            return Err(AppError::InvalidInput("测试告警标题和内容不能为空".into()));
        }

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| AppError::Custom(format!("创建 Webhook 客户端失败: {error}")))?;
        let response = client
            .post(parsed)
            .json(&serde_json::json!({
                "title": title.trim(),
                "body": body.trim(),
                "source": "opspub",
            }))
            .send()
            .map_err(|error| AppError::Custom(format!("发送 Webhook 失败: {error}")))?;
        if !response.status().is_success() {
            return Err(AppError::Custom(format!("Webhook 返回 HTTP {}", response.status())));
        }
        Ok(())
    }

    fn webhook_entry() -> Result<Entry, AppError> {
        Entry::new(ALERT_CREDENTIAL_SERVICE, WEBHOOK_ACCOUNT)
            .map_err(|error| AppError::Custom(format!("访问系统凭据库失败: {error}")))
    }
}

fn validate_url(url: &str) -> Result<reqwest::Url, AppError> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|error| AppError::InvalidInput(format!("Webhook 地址无效: {error}")))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(AppError::InvalidInput("Webhook 仅支持有效的 http 或 https 地址".into()));
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::validate_url;

    #[test]
    fn rejects_non_http_urls() {
        let error = validate_url("file:///tmp/alert")
            .expect_err("file URL should be rejected");
        assert!(error.to_string().contains("http") || error.to_string().contains("Webhook"));
    }
}
