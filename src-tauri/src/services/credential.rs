use keyring::{Entry, Error as KeyringError};

use crate::error::AppError;
use crate::models::StoredSshCredential;

const CREDENTIAL_SERVICE: &str = if cfg!(debug_assertions) {
    "com.agilefr.tauri.dev.ssh"
} else {
    "com.agilefr.tauri.ssh"
};

pub struct CredentialService;

impl CredentialService {
    pub fn save(server_id: i64, credential: &StoredSshCredential) -> Result<(), AppError> {
        if credential.password.as_deref().unwrap_or_default().is_empty()
            && credential
                .private_key_path
                .as_deref()
                .unwrap_or_default()
                .is_empty()
        {
            return Err(AppError::InvalidInput("SSH 凭据不能为空".into()));
        }

        let payload = serde_json::to_string(credential)?;
        entry(server_id)?
            .set_password(&payload)
            .map_err(keyring_error("保存 SSH 凭据"))
    }

    pub fn get(server_id: i64) -> Result<Option<StoredSshCredential>, AppError> {
        match entry(server_id)?.get_password() {
            Ok(payload) => serde_json::from_str(&payload).map(Some).map_err(AppError::from),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(AppError::Custom(format!(
                "读取系统 SSH 凭据失败: {error}"
            ))),
        }
    }

    pub fn delete(server_id: i64) -> Result<(), AppError> {
        match entry(server_id)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(AppError::Custom(format!(
                "删除系统 SSH 凭据失败: {error}"
            ))),
        }
    }

}

fn entry(server_id: i64) -> Result<Entry, AppError> {
    Entry::new(CREDENTIAL_SERVICE, &format!("server-{server_id}"))
        .map_err(|error| AppError::Custom(format!("访问系统凭据库失败: {error}")))
}

fn keyring_error(action: &'static str) -> impl FnOnce(KeyringError) -> AppError {
    move |error| AppError::Custom(format!("{action}失败: {error}"))
}
