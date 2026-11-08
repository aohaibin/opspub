use crate::error::AppError;
use keyring::{Entry, Error as KeyringError};

const ALERT_CREDENTIAL_SERVICE: &str = "com.opspub.alerts";
const CHANNELS: [&str; 3] = ["feishu", "wecom", "custom"];

pub struct AlertService;

impl AlertService {
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
            "custom" => serde_json::json!({ "title": title.trim(), "body": body.trim(), "source": "opspub" }),
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
            return Err(AppError::Custom(format!("通知渠道返回 HTTP {}", response.status())));
        }
        if channel != "custom" {
            let result: serde_json::Value = response
                .json()
                .map_err(|error| AppError::Custom(format!("通知渠道响应格式无效: {error}")))?;
            let rejected = if channel == "feishu" {
                result.get("code").and_then(serde_json::Value::as_i64).is_some_and(|code| code != 0)
            } else {
                result.get("errcode").and_then(serde_json::Value::as_i64).is_some_and(|code| code != 0)
            };
            if rejected {
                return Err(AppError::Custom("通知平台拒绝了该消息，请检查机器人配置和平台响应".into()));
            }
        }
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
        let account = if channel == "custom" { "default-webhook" } else { channel };
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
    use super::{validate_channel, validate_url};

    #[test]
    fn rejects_non_http_urls() {
        assert!(validate_url("file:///tmp/alert").is_err());
    }

    #[test]
    fn rejects_unknown_channel() {
        assert!(validate_channel("smtp").is_err());
    }
}
