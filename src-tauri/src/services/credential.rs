use keyring::{Entry, Error as KeyringError};

use crate::error::AppError;
use crate::models::StoredSshCredential;

// 使用稳定的应用标识，确保开发版、安装版以及升级后的版本都能读取同一份凭据。
const CREDENTIAL_SERVICE: &str = "com.opsentr.yunwei.ssh";
// 开发配置、旧版本和曾经使用过的应用标识都保留兼容读取。
const COMPAT_CREDENTIAL_SERVICES: &[&str] = &[
    "com.opsentr.yunwei.dev.ssh",
    "com.agilefr.tauri.ssh",
    "com.agilefr.tauri.dev.ssh",
];

pub struct CredentialService;

impl CredentialService {
    pub fn save(server_id: i64, credential: &StoredSshCredential) -> Result<(), AppError> {
        if credential
            .password
            .as_deref()
            .unwrap_or_default()
            .is_empty()
            && credential
                .private_key_path
                .as_deref()
                .unwrap_or_default()
                .is_empty()
        {
            return Err(AppError::InvalidInput("SSH 凭据不能为空".into()));
        }

        let payload = serde_json::to_string(credential)?;
        // 主服务名写入失败必须返回错误；兼容服务名采用尽力写入，避免某个旧后端不可用阻断新版本保存。
        let primary_entry = entry_for(CREDENTIAL_SERVICE, server_id)?;
        primary_entry
            .set_password(&payload)
            .map_err(keyring_error("保存 SSH 凭据"))?;
        // 立即回读一次，确认 Windows Credential Manager 已经落盘，而不是只写入当前进程缓存。
        let saved_payload = primary_entry
            .get_password()
            .map_err(keyring_error("校验 SSH 凭据"))?;
        if saved_payload != payload {
            return Err(AppError::Custom("SSH 凭据写入后校验不一致".into()));
        }
        for service in COMPAT_CREDENTIAL_SERVICES {
            if let Ok(entry) = entry_for(service, server_id) {
                if let Err(error) = entry.set_password(&payload) {
                    log::debug!("写入兼容 SSH 凭据服务失败 (service={}): {}", service, error);
                }
            }
        }
        Ok(())
    }

    pub fn get(server_id: i64) -> Result<Option<StoredSshCredential>, AppError> {
        let mut last_error: Option<AppError> = None;
        for service in std::iter::once(CREDENTIAL_SERVICE)
            .chain(COMPAT_CREDENTIAL_SERVICES.iter().copied())
        {
            let entry = match entry_for(service, server_id) {
                Ok(entry) => entry,
                Err(error) => {
                    last_error = Some(error);
                    continue;
                }
            };
            match entry.get_password() {
                Ok(payload) => {
                    let credential = serde_json::from_str(&payload).map_err(AppError::from)?;
                    if service != CREDENTIAL_SERVICE {
                        // 旧版本凭据读取成功后立即迁移，后续启动不再依赖旧服务名。
                        if let Err(error) = entry_for(CREDENTIAL_SERVICE, server_id)
                            .and_then(|entry| {
                                entry
                                    .set_password(&payload)
                                    .map_err(keyring_error("迁移 SSH 凭据"))
                            })
                        {
                            log::warn!("迁移 SSH 凭据失败 (service={}): {}", service, error);
                        }
                    }
                    return Ok(Some(credential));
                }
                Err(KeyringError::NoEntry) => continue,
                Err(error) => {
                    // 某个平台的兼容服务可能不可读，继续尝试其他服务名；主服务全部失败时仍返回错误。
                    log::debug!("读取兼容 SSH 凭据服务失败 (service={}): {}", service, error);
                    last_error = Some(AppError::Custom(format!("读取系统 SSH 凭据失败: {error}")));
                    continue;
                }
            }
        }

        match last_error {
            Some(error) => Err(error),
            None => Ok(None),
        }
    }

    pub fn delete(server_id: i64) -> Result<(), AppError> {
        for service in std::iter::once(CREDENTIAL_SERVICE)
            .chain(COMPAT_CREDENTIAL_SERVICES.iter().copied())
        {
            match entry_for(service, server_id)?.delete_credential() {
                Ok(()) | Err(KeyringError::NoEntry) => {}
                Err(error) => {
                    return Err(AppError::Custom(format!("删除系统 SSH 凭据失败: {error}")))
                }
            }
        }

        Ok(())
    }
}

fn entry_for(service: &str, server_id: i64) -> Result<Entry, AppError> {
    Entry::new(service, &format!("server-{server_id}"))
        .map_err(|error| AppError::Custom(format!("访问系统凭据库失败: {error}")))
}

fn keyring_error(action: &'static str) -> impl FnOnce(KeyringError) -> AppError {
    move |error| AppError::Custom(format!("{action}失败: {error}"))
}
