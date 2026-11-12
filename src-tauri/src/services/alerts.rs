use crate::error::AppError;
use keyring::{Entry, Error as KeyringError};
use lettre::Transport;
use serde::{Deserialize, Serialize};

const ALERT_CREDENTIAL_SERVICE: &str = "com.opspub.alerts";
const CHANNELS: [&str; 4] = ["feishu", "wecom", "custom", "email"];
const EMAIL_ACCOUNT: &str = "email";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AlertEmailConfig {
    pub host: String,
    pub port: u16,
    pub encryption: String,
    pub username: String,
    pub password: String,
    pub from: String,
    pub to: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AlertEmailPublicConfig {
    pub host: String,
    pub port: u16,
    pub encryption: String,
    pub username: String,
    pub from: String,
    pub to: String,
}

pub struct AlertService;

impl AlertService {
    pub fn save_email_config(mut config: AlertEmailConfig) -> Result<(), AppError> {
        validate_email_config(&config)?;
        if config.password.trim().is_empty() {
            config.password = Self::read_email_config()
                .ok()
                .map(|existing| existing.password)
                .filter(|password| !password.is_empty())
                .ok_or_else(|| AppError::InvalidInput("首次配置邮箱必须填写 SMTP 密码".into()))?;
        }
        let serialized = serde_json::to_string(&config)
            .map_err(|error| AppError::Custom(format!("邮箱配置序列化失败: {error}")))?;
        Self::entry(EMAIL_ACCOUNT)?
            .set_password(&serialized)
            .map_err(|error| AppError::Custom(format!("保存邮箱通知配置失败: {error}")))
    }

    fn read_email_config() -> Result<AlertEmailConfig, AppError> {
        let serialized = Self::entry(EMAIL_ACCOUNT)?
            .get_password()
            .map_err(|error| AppError::Custom(format!("读取邮箱通知配置失败: {error}")))?;
        serde_json::from_str(&serialized)
            .map_err(|error| AppError::Custom(format!("邮箱通知配置已损坏，请重新配置: {error}")))
    }

    pub fn get_email_config() -> Result<Option<AlertEmailPublicConfig>, AppError> {
        let serialized = match Self::entry(EMAIL_ACCOUNT)?.get_password() {
            Ok(value) => value,
            Err(KeyringError::NoEntry) => return Ok(None),
            Err(error) => return Err(AppError::Custom(format!("读取邮箱通知配置失败: {error}"))),
        };
        let config: AlertEmailConfig = serde_json::from_str(&serialized).map_err(|error| {
            AppError::Custom(format!("邮箱通知配置已损坏，请重新配置: {error}"))
        })?;
        Ok(Some(AlertEmailPublicConfig {
            host: config.host,
            port: config.port,
            encryption: config.encryption,
            username: config.username,
            from: config.from,
            to: config.to,
        }))
    }

    pub fn save_channel_url(channel: &str, url: &str) -> Result<(), AppError> {
        validate_channel(channel)?;
        validate_url(url)?;
        Self::entry(channel)?
            .set_password(url.trim())
            .map_err(|error| AppError::Custom(format!("保存通知渠道凭据失败: {error}")))
    }

    pub fn channel_configured(channel: &str) -> Result<bool, AppError> {
        validate_channel(channel)?;
        match Self::entry(channel)?.get_password() {
            Ok(_) => Ok(true),
            Err(KeyringError::NoEntry) => Ok(false),
            Err(error) => Err(AppError::Custom(format!("读取通知渠道状态失败: {error}"))),
        }
    }

    pub fn delete_channel_url(channel: &str) -> Result<(), AppError> {
        validate_channel(channel)?;
        match Self::entry(channel)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(AppError::Custom(format!("删除通知渠道凭据失败: {error}"))),
        }
    }

    pub fn send_channel(channel: &str, title: &str, body: &str) -> Result<(), AppError> {
        validate_channel(channel)?;
        if title.trim().is_empty() || body.trim().is_empty() {
            return Err(AppError::InvalidInput("告警标题和内容不能为空".into()));
        }
        if channel == "email" {
            return Self::send_email(title, body);
        }
        let url = Self::entry(channel)?
            .get_password()
            .map_err(|error| AppError::Custom(format!("读取通知渠道凭据失败: {error}")))?;
        let payload = match channel {
            "feishu" => serde_json::json!({
                "msg_type": "interactive",
                "card": {
                    "header": { "title": { "tag": "plain_text", "content": title.trim() } },
                    "elements": [{ "tag": "div", "text": { "tag": "lark_md", "content": body.trim() } }]
                }
            }),
            "wecom" => serde_json::json!({
                "msgtype": "markdown",
                "markdown": { "content": format!("# {}\n\n{}", title.trim(), body.trim()) }
            }),
            "custom" => {
                serde_json::json!({ "title": title.trim(), "body": body.trim(), "source": "opspub" })
            }
            _ => return Err(AppError::InvalidInput("不支持的通知渠道".into())),
        };
        let response = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|error| AppError::Custom(format!("创建通知客户端失败: {error}")))?
            .post(validate_url(&url)?)
            .json(&payload)
            .send()
            .map_err(|error| AppError::Custom(format!("发送通知失败: {error}")))?;
        if !response.status().is_success() {
            return Err(AppError::Custom(format!(
                "通知渠道返回 HTTP {}",
                response.status()
            )));
        }
        if channel != "custom" {
            let result: serde_json::Value = response
                .json()
                .map_err(|error| AppError::Custom(format!("通知渠道响应格式无效: {error}")))?;
            let rejected = if channel == "feishu" {
                result
                    .get("code")
                    .and_then(serde_json::Value::as_i64)
                    .is_some_and(|code| code != 0)
            } else {
                result
                    .get("errcode")
                    .and_then(serde_json::Value::as_i64)
                    .is_some_and(|code| code != 0)
            };
            if rejected {
                return Err(AppError::Custom(
                    "通知平台拒绝了该消息，请检查机器人配置和平台响应".into(),
                ));
            }
        }
        Ok(())
    }

    fn send_email(title: &str, body: &str) -> Result<(), AppError> {
        let config = Self::read_email_config()?;
        validate_email_config(&config)?;
        let email = lettre::Message::builder()
            .from(
                config
                    .from
                    .parse()
                    .map_err(|error| AppError::InvalidInput(format!("发件人地址无效: {error}")))?,
            )
            .to(config
                .to
                .parse()
                .map_err(|error| AppError::InvalidInput(format!("收件人地址无效: {error}")))?)
            .subject(title.trim())
            .header(lettre::message::header::ContentType::TEXT_PLAIN)
            .body(body.trim().to_string())
            .map_err(|error| AppError::Custom(format!("创建邮件失败: {error}")))?;
        let credentials = lettre::transport::smtp::authentication::Credentials::new(
            config.username.clone(),
            config.password.clone(),
        );
        let builder = match config.encryption.as_str() {
            "tls" => lettre::SmtpTransport::relay(&config.host),
            "starttls" => lettre::SmtpTransport::starttls_relay(&config.host),
            "none" => Ok(lettre::SmtpTransport::builder_dangerous(&config.host)),
            _ => return Err(AppError::InvalidInput("SMTP 加密方式无效".into())),
        }
        .map_err(|error| AppError::Custom(format!("创建 SMTP 客户端失败: {error}")))?;
        builder
            .port(config.port)
            .credentials(credentials)
            .timeout(Some(std::time::Duration::from_secs(10)))
            .build()
            .send(&email)
            .map_err(|error| AppError::Custom(format!("邮件发送失败: {error}")))?;
        Ok(())
    }

    // Keep the original IPC names working for existing builds and stored settings.
    pub fn save_webhook_url(url: &str) -> Result<(), AppError> {
        Self::save_channel_url("custom", url)
    }

    pub fn webhook_configured() -> Result<bool, AppError> {
        Self::channel_configured("custom")
    }

    pub fn delete_webhook_url() -> Result<(), AppError> {
        Self::delete_channel_url("custom")
    }

    pub fn send_webhook(title: &str, body: &str) -> Result<(), AppError> {
        Self::send_channel("custom", title, body)
    }

    fn entry(channel: &str) -> Result<Entry, AppError> {
        let account = if channel == "custom" {
            "default-webhook"
        } else {
            channel
        };
        Entry::new(ALERT_CREDENTIAL_SERVICE, account)
            .map_err(|error| AppError::Custom(format!("访问系统凭据库失败: {error}")))
    }
}

fn validate_channel(channel: &str) -> Result<(), AppError> {
    if CHANNELS.contains(&channel) {
        Ok(())
    } else {
        Err(AppError::InvalidInput("不支持的通知渠道".into()))
    }
}

fn validate_email_config(config: &AlertEmailConfig) -> Result<(), AppError> {
    if config.host.trim().is_empty() || config.host.chars().any(char::is_whitespace) {
        return Err(AppError::InvalidInput("SMTP 服务器地址无效".into()));
    }
    if config.port == 0 {
        return Err(AppError::InvalidInput(
            "SMTP 端口必须在 1-65535 之间".into(),
        ));
    }
    if !matches!(config.encryption.as_str(), "starttls" | "tls" | "none") {
        return Err(AppError::InvalidInput("SMTP 加密方式无效".into()));
    }
    if config.username.trim().is_empty() {
        return Err(AppError::InvalidInput("SMTP 用户名不能为空".into()));
    }
    if config.from.parse::<lettre::message::Mailbox>().is_err() {
        return Err(AppError::InvalidInput("发件人邮箱地址无效".into()));
    }
    if config.to.parse::<lettre::message::Mailbox>().is_err() {
        return Err(AppError::InvalidInput("收件人邮箱地址无效".into()));
    }
    Ok(())
}

fn validate_url(url: &str) -> Result<reqwest::Url, AppError> {
    let parsed = reqwest::Url::parse(url.trim())
        .map_err(|error| AppError::InvalidInput(format!("Webhook 地址无效: {error}")))?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return Err(AppError::InvalidInput(
            "Webhook 仅支持有效的 http 或 https 地址".into(),
        ));
    }
    Ok(parsed)
}

#[cfg(test)]
mod tests {
    use super::{validate_channel, validate_email_config, validate_url, AlertEmailConfig};

    #[test]
    fn rejects_non_http_urls() {
        assert!(validate_url("file:///tmp/alert").is_err());
    }

    #[test]
    fn rejects_unknown_channel() {
        assert!(validate_channel("smtp").is_err());
    }

    #[test]
    fn accepts_valid_email_config() {
        let config = AlertEmailConfig {
            host: "smtp.example.com".into(),
            port: 587,
            encryption: "starttls".into(),
            username: "ops@example.com".into(),
            password: "secret".into(),
            from: "ops@example.com".into(),
            to: "admin@example.com".into(),
        };
        assert!(validate_email_config(&config).is_ok());
    }
}
