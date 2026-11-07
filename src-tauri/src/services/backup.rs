use std::{num::NonZeroU32, path::Path};

use keyring::Entry;
use ring::{
    aead, pbkdf2,
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize};

use crate::{database::Database, error::AppError};

const MAGIC: &[u8; 8] = b"OPSPUBB1";
const SALT_LEN: usize = 16;
const NONCE_LEN: usize = 12;
const KEY_LEN: usize = 32;
const PBKDF2_ITERATIONS: u32 = 600_000;
const MAX_BACKUP_SIZE: u64 = 2 * 1024 * 1024 * 1024;
const STORAGE_CONFIG_KEY: &str = "backup.storage.endpoints";
const STORAGE_CREDENTIAL_SERVICE: &str = "com.opspub.backup.storage";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStorageEndpoint {
    pub id: String,
    pub name: String,
    pub url: String,
    pub username: String,
    pub remote_dir: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupStorageInput {
    pub id: Option<String>,
    pub name: String,
    pub url: String,
    pub username: String,
    pub password: String,
    pub remote_dir: String,
    pub enabled: bool,
}

pub struct BackupService;

impl BackupService {
    pub fn export(db: &Database, path: &str, passphrase: &str) -> Result<(), AppError> {
        validate_passphrase(passphrase)?;
        let snapshot = db.export_snapshot()?;
        let encrypted = encrypt(&snapshot, passphrase)?;
        let target = Path::new(path);
        if target.extension().and_then(|value| value.to_str()) != Some("opspubbak") {
            return Err(AppError::InvalidInput(
                "备份文件扩展名必须为 .opspubbak".into(),
            ));
        }
        std::fs::write(target, encrypted)?;
        Ok(())
    }

    pub fn restore(db: &Database, path: &str, passphrase: &str) -> Result<(), AppError> {
        validate_passphrase(passphrase)?;
        let source = Path::new(path);
        if source.extension().and_then(|value| value.to_str()) != Some("opspubbak") {
            return Err(AppError::InvalidInput("请选择 .opspubbak 备份文件".into()));
        }
        let metadata = std::fs::metadata(source)?;
        if metadata.len() > MAX_BACKUP_SIZE {
            return Err(AppError::InvalidInput("备份文件超过 2 GB 限制".into()));
        }
        let encrypted = std::fs::read(source)?;
        let snapshot = decrypt(&encrypted, passphrase)?;
        db.restore_snapshot(&snapshot)
    }

    pub fn list_storage(db: &Database) -> Result<Vec<BackupStorageEndpoint>, AppError> {
        let json = db
            .get_config(STORAGE_CONFIG_KEY)?
            .unwrap_or_else(|| "[]".into());
        serde_json::from_str(&json).map_err(AppError::from)
    }

    pub fn save_storage(
        db: &Database,
        input: BackupStorageInput,
    ) -> Result<BackupStorageEndpoint, AppError> {
        let name = input.name.trim();
        if name.is_empty() || input.username.trim().is_empty() {
            return Err(AppError::InvalidInput("存储端名称和账号不能为空".into()));
        }
        let url = validate_storage_url(&input.url)?;
        let id = input
            .id
            .filter(|id| !id.trim().is_empty())
            .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        if input.password.is_empty() && !credential_exists(&id) {
            return Err(AppError::InvalidInput(
                "新存储端必须填写密码或应用密码".into(),
            ));
        }
        if !input.password.is_empty() {
            Entry::new(STORAGE_CREDENTIAL_SERVICE, &id)
                .map_err(|error| AppError::Custom(format!("访问系统凭据库失败: {error}")))?
                .set_password(&input.password)
                .map_err(|error| AppError::Custom(format!("保存 WebDAV 密码失败: {error}")))?;
        }
        let endpoint = BackupStorageEndpoint {
            id: id.clone(),
            name: name.to_string(),
            url,
            username: input.username.trim().to_string(),
            remote_dir: sanitize_remote_dir(&input.remote_dir)?,
            enabled: input.enabled,
        };
        let mut endpoints = Self::list_storage(db)?;
        if let Some(existing) = endpoints.iter_mut().find(|item| item.id == id) {
            *existing = endpoint.clone();
        } else {
            endpoints.push(endpoint.clone());
        }
        db.set_config(STORAGE_CONFIG_KEY, &serde_json::to_string(&endpoints)?)?;
        Ok(endpoint)
    }

    pub fn delete_storage(db: &Database, id: &str) -> Result<(), AppError> {
        let mut endpoints = Self::list_storage(db)?;
        endpoints.retain(|endpoint| endpoint.id != id);
        db.set_config(STORAGE_CONFIG_KEY, &serde_json::to_string(&endpoints)?)?;
        if let Ok(entry) = Entry::new(STORAGE_CREDENTIAL_SERVICE, id) {
            match entry.delete_credential() {
                Ok(()) | Err(keyring::Error::NoEntry) => {}
                Err(error) => {
                    return Err(AppError::Custom(format!("删除 WebDAV 密码失败: {error}")))
                }
            }
        }
        Ok(())
    }

    pub fn test_storage(db: &Database, input: &BackupStorageInput) -> Result<(), AppError> {
        let endpoint = endpoint_from_input(input)?;
        let password = if input.password.is_empty() {
            let id = input
                .id
                .as_deref()
                .filter(|id| !id.is_empty())
                .ok_or_else(|| AppError::InvalidInput("请填写 WebDAV 应用密码".into()))?;
            let configured = Self::list_storage(db)?.iter().any(|saved| saved.id == id);
            if !configured {
                return Err(AppError::InvalidInput("请填写 WebDAV 应用密码".into()));
            }
            storage_password(id)?
        } else {
            input.password.clone()
        };
        webdav_request(
            &endpoint,
            &password,
            reqwest::Method::from_bytes(b"PROPFIND")
                .map_err(|e| AppError::Custom(e.to_string()))?,
            "",
            Some(b"<?xml version=\"1.0\"?><d:propfind xmlns:d=\"DAV:\"><d:allprop/></d:propfind>"),
        )?;
        Ok(())
    }

    pub fn push_backup(
        db: &Database,
        endpoint_id: &str,
        local_path: &str,
    ) -> Result<String, AppError> {
        let endpoint = Self::list_storage(db)?
            .into_iter()
            .find(|item| item.id == endpoint_id)
            .ok_or_else(|| AppError::NotFound("备份存储端不存在".into()))?;
        if !endpoint.enabled {
            return Err(AppError::InvalidInput("该备份存储端已停用".into()));
        }
        let path = Path::new(local_path);
        if path.extension().and_then(|value| value.to_str()) != Some("opspubbak") {
            return Err(AppError::InvalidInput(
                "请选择 .opspubbak 加密备份文件".into(),
            ));
        }
        let bytes = std::fs::read(path)?;
        if bytes.len() as u64 > MAX_BACKUP_SIZE {
            return Err(AppError::InvalidInput("备份文件超过 2 GB 限制".into()));
        }
        let filename = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| AppError::InvalidInput("备份文件名无效".into()))?;
        let password = storage_password(&endpoint.id)?;
        let response = webdav_request(
            &endpoint,
            &password,
            reqwest::Method::PUT,
            filename,
            Some(&bytes),
        )?;
        Ok(format!("{} ({})", filename, response))
    }

    pub fn pull_backup(
        db: &Database,
        endpoint_id: &str,
        filename: &str,
        local_path: &str,
    ) -> Result<(), AppError> {
        let endpoint = Self::list_storage(db)?
            .into_iter()
            .find(|item| item.id == endpoint_id)
            .ok_or_else(|| AppError::NotFound("备份存储端不存在".into()))?;
        if !endpoint.enabled {
            return Err(AppError::InvalidInput("该备份存储端已停用".into()));
        }
        if filename.is_empty()
            || filename.contains('/')
            || filename.contains('\\')
            || !filename.ends_with(".opspubbak")
        {
            return Err(AppError::InvalidInput(
                "请输入有效的 .opspubbak 文件名".into(),
            ));
        }
        if Path::new(local_path)
            .extension()
            .and_then(|value| value.to_str())
            != Some("opspubbak")
        {
            return Err(AppError::InvalidInput(
                "本地保存文件扩展名必须为 .opspubbak".into(),
            ));
        }
        let password = storage_password(&endpoint.id)?;
        let bytes = webdav_download(&endpoint, &password, filename)?;
        if bytes.len() as u64 > MAX_BACKUP_SIZE {
            return Err(AppError::InvalidInput("备份文件超过 2 GB 限制".into()));
        }
        if !bytes.starts_with(MAGIC) {
            return Err(AppError::InvalidInput(
                "远端文件不是有效的 OpsPub 加密备份".into(),
            ));
        }
        std::fs::write(local_path, bytes)?;
        Ok(())
    }
}

fn endpoint_from_input(input: &BackupStorageInput) -> Result<BackupStorageEndpoint, AppError> {
    Ok(BackupStorageEndpoint {
        id: input.id.clone().unwrap_or_default(),
        name: input.name.trim().to_string(),
        url: validate_storage_url(&input.url)?,
        username: input.username.trim().to_string(),
        remote_dir: sanitize_remote_dir(&input.remote_dir)?,
        enabled: input.enabled,
    })
}

fn validate_storage_url(raw: &str) -> Result<String, AppError> {
    let parsed = reqwest::Url::parse(raw.trim())
        .map_err(|_| AppError::InvalidInput("请输入有效的 HTTP 或 HTTPS WebDAV 地址".into()))?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
    {
        return Err(AppError::InvalidInput(
            "WebDAV 地址仅支持不含账号密码的 HTTP/HTTPS URL".into(),
        ));
    }
    Ok(parsed.to_string().trim_end_matches('/').to_string())
}

fn sanitize_remote_dir(raw: &str) -> Result<String, AppError> {
    let value = raw.trim().trim_matches('/');
    if value
        .split('/')
        .any(|segment| segment == ".." || segment == ".")
    {
        return Err(AppError::InvalidInput(
            "远端目录不能包含 . 或 .. 路径段".into(),
        ));
    }
    Ok(value.to_string())
}

fn credential_exists(id: &str) -> bool {
    Entry::new(STORAGE_CREDENTIAL_SERVICE, id)
        .and_then(|entry| entry.get_password())
        .is_ok()
}

fn storage_password(id: &str) -> Result<String, AppError> {
    Entry::new(STORAGE_CREDENTIAL_SERVICE, id)
        .and_then(|entry| entry.get_password())
        .map_err(|error| AppError::Custom(format!("读取系统 WebDAV 凭据失败: {error}")))
}

fn webdav_url(endpoint: &BackupStorageEndpoint, filename: &str) -> Result<reqwest::Url, AppError> {
    let mut url =
        reqwest::Url::parse(&endpoint.url).map_err(|error| AppError::Custom(error.to_string()))?;
    {
        let mut segments = url
            .path_segments_mut()
            .map_err(|_| AppError::InvalidInput("WebDAV URL 不支持路径追加".into()))?;
        segments.pop_if_empty();
        for segment in endpoint
            .remote_dir
            .split('/')
            .filter(|value| !value.is_empty())
        {
            segments.push(segment);
        }
        if !filename.is_empty() {
            segments.push(filename);
        }
    }
    Ok(url)
}

fn webdav_client() -> Result<reqwest::blocking::Client, AppError> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| AppError::Custom(format!("创建 WebDAV 客户端失败: {error}")))
}

fn webdav_request(
    endpoint: &BackupStorageEndpoint,
    password: &str,
    method: reqwest::Method,
    filename: &str,
    body: Option<&[u8]>,
) -> Result<String, AppError> {
    let client = webdav_client()?;
    let url = webdav_url(endpoint, filename)?;
    let mut request = client
        .request(method, url)
        .basic_auth(&endpoint.username, Some(password));
    if body.is_some() {
        request = request.header("Depth", "0");
    }
    if let Some(body) = body {
        request = request.body(body.to_vec());
    }
    let response = request
        .send()
        .map_err(|error| AppError::Custom(format!("WebDAV 请求失败: {error}")))?;
    let status = response.status();
    if status.is_success() || status.as_u16() == 207 {
        Ok(status.to_string())
    } else {
        Err(AppError::Custom(format!("WebDAV 返回 HTTP {status}")))
    }
}

fn webdav_download(
    endpoint: &BackupStorageEndpoint,
    password: &str,
    filename: &str,
) -> Result<Vec<u8>, AppError> {
    let response = webdav_client()?
        .get(webdav_url(endpoint, filename)?)
        .basic_auth(&endpoint.username, Some(password))
        .send()
        .map_err(|error| AppError::Custom(format!("下载 WebDAV 备份失败: {error}")))?;
    let status = response.status();
    if !status.is_success() {
        return Err(AppError::Custom(format!("WebDAV 返回 HTTP {status}")));
    }
    response
        .bytes()
        .map(|bytes| bytes.to_vec())
        .map_err(|error| AppError::Custom(format!("读取 WebDAV 备份失败: {error}")))
}

fn validate_passphrase(passphrase: &str) -> Result<(), AppError> {
    let length = passphrase.chars().count();
    let classes = [
        passphrase.chars().any(|c| c.is_ascii_lowercase()),
        passphrase.chars().any(|c| c.is_ascii_uppercase()),
        passphrase.chars().any(|c| c.is_ascii_digit()),
        passphrase.chars().any(|c| !c.is_ascii_alphanumeric()),
    ]
    .into_iter()
    .filter(|present| *present)
    .count();
    if length < 12 || (length < 16 && classes < 3) {
        return Err(AppError::InvalidInput(
            "备份密码需至少 12 位且包含 3 类字符，或至少 16 位".into(),
        ));
    }
    Ok(())
}

fn encrypt(plain: &[u8], passphrase: &str) -> Result<Vec<u8>, AppError> {
    let rng = SystemRandom::new();
    let mut salt = [0u8; SALT_LEN];
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rng.fill(&mut salt)
        .map_err(|_| AppError::Custom("生成备份随机数失败".into()))?;
    rng.fill(&mut nonce_bytes)
        .map_err(|_| AppError::Custom("生成备份随机数失败".into()))?;

    let mut key = [0u8; KEY_LEN];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(PBKDF2_ITERATIONS)
            .ok_or_else(|| AppError::Custom("备份加密参数无效".into()))?,
        &salt,
        passphrase.as_bytes(),
        &mut key,
    );
    let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key)
        .map_err(|_| AppError::Custom("初始化备份加密失败".into()))?;
    key.fill(0);
    let cipher = aead::LessSafeKey::new(unbound);
    let mut ciphertext = plain.to_vec();
    cipher
        .seal_in_place_append_tag(
            aead::Nonce::assume_unique_for_key(nonce_bytes),
            aead::Aad::from(MAGIC.as_slice()),
            &mut ciphertext,
        )
        .map_err(|_| AppError::Custom("加密备份数据失败".into()))?;

    let mut output = Vec::with_capacity(MAGIC.len() + SALT_LEN + NONCE_LEN + ciphertext.len());
    output.extend_from_slice(MAGIC);
    output.extend_from_slice(&salt);
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

fn decrypt(payload: &[u8], passphrase: &str) -> Result<Vec<u8>, AppError> {
    let header_len = MAGIC.len() + SALT_LEN + NONCE_LEN;
    if payload.len() < header_len + aead::AES_256_GCM.tag_len() || !payload.starts_with(MAGIC) {
        return Err(AppError::InvalidInput(
            "备份文件格式无效或文件已损坏".into(),
        ));
    }
    let salt_start = MAGIC.len();
    let nonce_start = salt_start + SALT_LEN;
    let mut key = [0u8; KEY_LEN];
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        NonZeroU32::new(PBKDF2_ITERATIONS)
            .ok_or_else(|| AppError::Custom("备份加密参数无效".into()))?,
        &payload[salt_start..nonce_start],
        passphrase.as_bytes(),
        &mut key,
    );
    let unbound = aead::UnboundKey::new(&aead::AES_256_GCM, &key)
        .map_err(|_| AppError::Custom("初始化备份解密失败".into()))?;
    key.fill(0);
    let cipher = aead::LessSafeKey::new(unbound);
    let nonce: [u8; NONCE_LEN] = payload[nonce_start..header_len]
        .try_into()
        .map_err(|_| AppError::InvalidInput("备份文件格式无效".into()))?;
    let mut plaintext = payload[header_len..].to_vec();
    let plaintext_len = cipher
        .open_in_place(
            aead::Nonce::assume_unique_for_key(nonce),
            aead::Aad::from(MAGIC.as_slice()),
            &mut plaintext,
        )
        .map_err(|_| AppError::InvalidInput("备份密码错误或文件已损坏".into()))?
        .len();
    plaintext.truncate(plaintext_len);
    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::{decrypt, encrypt};

    #[test]
    fn encrypted_backup_round_trips_and_rejects_wrong_password() {
        let original = b"SQLite format 3\0sample database";
        let encrypted = encrypt(original, "StrongBackup#2026").expect("encrypt backup");
        assert_ne!(encrypted, original);
        assert_eq!(
            decrypt(&encrypted, "StrongBackup#2026").expect("decrypt backup"),
            original
        );
        assert!(decrypt(&encrypted, "WrongPassword#2026").is_err());
    }
}
