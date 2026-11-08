use super::{credential::CredentialService, server, server_transport};
use crate::{
    database::Database,
    error::AppError,
    models::{server_form::*, Server, SshProbeRequest, StoredSshCredential},
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

struct Verified {
    hash: Vec<u8>,
    fingerprint: String,
    at: Instant,
}
#[derive(Default)]
pub struct ServerFormService {
    verified: Mutex<HashMap<String, Verified>>,
    save_lock: Mutex<()>,
}

fn invalid(message: &str) -> AppError {
    AppError::InvalidInput(message.into())
}

pub(crate) fn validate(db: &Database, input: &mut ServerFormRequest) -> Result<(), AppError> {
    input.alias = input.alias.trim().into();
    input.hostname = input.hostname.trim().into();
    input.username = input.username.trim().into();
    input.group = input.group.trim().into();
    input.ai_username = input.ai_username.trim().into();
    if input.group.is_empty() {
        input.group = "默认".into();
    }
    if input.alias.is_empty() || input.username.is_empty() {
        return Err(invalid("别名和用户名不能为空"));
    }
    server_transport::validate_host(&input.hostname)?;
    for value in [
        &input.alias,
        &input.username,
        &input.group,
        &input.ai_username,
    ] {
        if value.len() > 256 || value.chars().any(char::is_control) {
            return Err(invalid("字段过长或包含控制字符"));
        }
    }
    if !(1..=65535).contains(&input.port) {
        return Err(invalid("端口必须为 1–65535 的整数"));
    }
    if !["ssh", "rdp"].contains(&input.protocol.as_str())
        || !["linux", "windows"].contains(&input.os_type.as_str())
    {
        return Err(invalid("连接方式或系统类型无效"));
    }
    if !["password", "key", "agent"].contains(&input.auth_type.as_str()) {
        return Err(invalid("认证方式无效"));
    }
    if ![
        "disabled",
        "readonly",
        "approval",
        "trusted",
        "allowlist",
        "strict",
        "autonomous",
        "denied",
    ]
    .contains(&input.ai_policy.as_str())
    {
        return Err(invalid("AI 策略无效"));
    }
    let options = &mut input.connection_options;
    if !["auto", "public", "lan", "cross_border"].contains(&options.network_env.as_str()) {
        return Err(invalid("网络环境无效"));
    }
    if !["system", "fullscreen", "1920x1080", "1440x900"]
        .contains(&options.rdp_display_mode.as_str())
        || options.rdp_port == 0
    {
        return Err(invalid("远程桌面显示方式或端口无效"));
    }
    options.connection_proxy = options.connection_proxy.trim().into();
    if !options.connection_proxy.is_empty() {
        server_transport::parse_proxy(&options.connection_proxy)?;
    }
    if (input.use_local_proxy && !options.connection_proxy.is_empty())
        || (input.bastion_id.is_some()
            && (input.use_local_proxy || !options.connection_proxy.is_empty()))
    {
        return Err(invalid("本机代理与专有连接代理只能选择一种"));
    }
    if input.protocol == "rdp" {
        input.os_type = "windows".into();
        input.auth_type = "password".into();
        input.ai_policy = "disabled".into();
        input.allow_sudo = false;
        input.use_local_proxy = false;
        input.bastion_id = None;
        input.ai_username.clear();
        options.connection_proxy.clear();
        options.rdp_enabled = true;
        options.rdp_port = input.port as u16;
    }
    let tags: Vec<String> =
        serde_json::from_str(&input.tags).map_err(|_| invalid("标签格式无效"))?;
    input.tags = serde_json::to_string(&tags)?;
    let mut ids = vec![];
    if let Some(id) = input.id {
        ids.push(id);
    }
    let mut next = input.bastion_id;
    for depth in 0..=5 {
        let Some(id) = next else {
            break;
        };
        if depth == 5 || ids.contains(&id) {
            return Err(invalid("跳板机链包含循环或超过 5 跳"));
        }
        ids.push(id);
        let jump = db
            .get_server_by_id(id)?
            .ok_or_else(|| invalid("所选跳板机不存在"))?;
        if jump.protocol != "ssh" {
            return Err(invalid("仅远程桌面连接不能用作跳板机"));
        }
        next = jump.bastion_id;
    }
    if let Some(credentials) = &input.credentials {
        if let Some(text) = credentials
            .private_key_text
            .as_deref()
            .filter(|text| !text.is_empty())
        {
            if text.len() > 32_768
                || !text.trim().starts_with("-----BEGIN ")
                || !text.contains("PRIVATE KEY-----")
                || !text.contains("-----END ")
            {
                return Err(invalid("请粘贴完整的 PEM / OpenSSH 私钥文本"));
            }
        }
    }
    Ok(())
}

pub(crate) fn draft_server(db: &Database, input: &ServerFormRequest) -> Result<Server, AppError> {
    let old = input
        .id
        .map(|id| db.get_server_by_id(id))
        .transpose()?
        .flatten();
    let fingerprint = old
        .as_ref()
        .filter(|s| {
            s.hostname == input.hostname && s.port == input.port && s.protocol == input.protocol
        })
        .map(|s| s.host_key_fingerprint.clone())
        .unwrap_or_default();
    Ok(Server {
        id: input.id.unwrap_or(0),
        alias: input.alias.clone(),
        hostname: input.hostname.clone(),
        port: input.port,
        username: input.username.clone(),
        auth_type: input.auth_type.clone(),
        tags: input.tags.clone(),
        group: input.group.clone(),
        ai_policy: input.ai_policy.clone(),
        os_type: input.os_type.clone(),
        protocol: input.protocol.clone(),
        connection_options: input.connection_options.clone(),
        favorite: false,
        arch: String::new(),
        last_used_at: None,
        host_key_fingerprint: fingerprint,
        last_connection_status: "unknown".into(),
        last_connection_message: String::new(),
        last_connected_at: None,
        allow_sudo: input.allow_sudo,
        use_local_proxy: input.use_local_proxy,
        bastion_id: input.bastion_id,
        ai_username: input.ai_username.clone(),
        created_at: String::new(),
        updated_at: String::new(),
    })
}

fn credentials(db: &Database, input: &ServerFormRequest) -> Result<StoredSshCredential, AppError> {
    let mut saved = StoredSshCredential::default();
    if let Some(id) = input.id {
        // 仅连接身份完全相同时复用凭据，避免将旧密码发送给新主机或新账号。
        if db.get_server_by_id(id)?.is_some_and(|s| {
            s.username == input.username
                && s.auth_type == input.auth_type
                && s.hostname == input.hostname
                && s.port == input.port
                && s.protocol == input.protocol
        }) {
            saved = CredentialService::get(id)?.unwrap_or_default();
        }
    }
    if let Some(value) = &input.credentials {
        if value.password.is_some() {
            saved.password = value.password.clone();
        }
        if value
            .private_key_path
            .as_deref()
            .is_some_and(|s| !s.is_empty())
        {
            saved.private_key_path = value.private_key_path.clone();
            saved.private_key_text = None;
        }
        if value
            .private_key_text
            .as_deref()
            .is_some_and(|s| !s.is_empty())
        {
            saved.private_key_text = value.private_key_text.clone();
            saved.private_key_path = None;
        }
        if value.passphrase.is_some() {
            saved.passphrase = value.passphrase.clone();
        }
    }
    Ok(saved)
}

fn hash(input: &ServerFormRequest) -> Result<Vec<u8>, AppError> {
    let mut input = input.clone();
    input.verification_token = None;
    Ok(Sha256::digest(serde_json::to_vec(&input)?).to_vec())
}

impl ServerFormService {
    pub fn probe(
        &self,
        db: &Database,
        mut input: ServerFormRequest,
        trusted_fingerprint: Option<String>,
    ) -> Result<ServerFormProbeResult, AppError> {
        validate(db, &mut input)?;
        if input.protocol != "ssh" {
            return Err(invalid("仅远程桌面无需 SSH 验证"));
        }
        let mut target = draft_server(db, &input)?;
        // 信任确认必须绑定用户刚看到的指纹，不能简单地“信任任意新指纹”。
        if target.host_key_fingerprint.is_empty() {
            target.host_key_fingerprint = trusted_fingerprint.unwrap_or_default();
        }
        let c = credentials(db, &input)?;
        input.credentials = Some(c.clone());
        let result = server::probe_ssh(
            db,
            &target,
            &SshProbeRequest {
                server_id: target.id,
                password: c.password,
                private_key_path: c.private_key_path,
                private_key_text: c.private_key_text,
                passphrase: c.passphrase,
                trust_host_key: false,
            },
        )
        .map_err(|e| AppError::Custom(e.message))?;
        let verification_token = if result.connected {
            let mut tickets = self.verified.lock().map_err(|_| invalid("验证服务忙"))?;
            tickets.retain(|_, t| t.at.elapsed() < Duration::from_secs(900));
            if tickets.len() >= 32 {
                return Err(invalid("连接验证过多，请稍后重试"));
            }
            let token = uuid::Uuid::new_v4().to_string();
            tickets.insert(
                token.clone(),
                Verified {
                    hash: hash(&input)?,
                    fingerprint: result.fingerprint.clone(),
                    at: Instant::now(),
                },
            );
            Some(token)
        } else {
            None
        };
        Ok(ServerFormProbeResult {
            result,
            verification_token,
        })
    }

    pub fn save(&self, db: &Database, mut input: ServerFormRequest) -> Result<i64, AppError> {
        let _guard = self.save_lock.lock().map_err(|_| invalid("保存服务忙"))?;
        validate(db, &mut input)?;
        let supplied_credentials = input.credentials.is_some();
        let credential = credentials(db, &input)?;
        input.credentials = Some(credential.clone());
        let target = draft_server(db, &input)?;
        let mut fingerprint = target.host_key_fingerprint;
        if let Some(token) = input.verification_token.as_ref() {
            let tickets = self.verified.lock().map_err(|_| invalid("验证服务忙"))?;
            let ticket = tickets
                .get(token)
                .filter(|t| t.at.elapsed() < Duration::from_secs(900))
                .ok_or_else(|| invalid("连接验证已过期，请重新测试连接"))?;
            if ticket.hash != hash(&input)? {
                return Err(invalid("连接配置已变化，请重新测试连接"));
            }
            fingerprint = ticket.fingerprint.clone();
        }
        if input.protocol == "rdp" {
            fingerprint.clear();
        }
        let before = input.id.map(CredentialService::get).transpose()?.flatten();
        if input.protocol == "ssh"
            && input.auth_type == "password"
            && credential
                .password
                .as_deref()
                .unwrap_or_default()
                .is_empty()
        {
            return Err(invalid("请输入登录密码"));
        }
        if input.protocol == "ssh"
            && input.auth_type == "key"
            && credential
                .private_key_path
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
            && credential
                .private_key_text
                .as_deref()
                .unwrap_or_default()
                .trim()
                .is_empty()
        {
            return Err(invalid("请输入私钥文本或选择私钥文件"));
        }
        let mut touched = None;
        let result = db.save_server_form(
            &input,
            &fingerprint,
            input.verification_token.is_some(),
            |id| {
                if supplied_credentials && input.auth_type != "agent" {
                    touched = Some(id);
                    let filtered = match input.auth_type.as_str() {
                        "password" => StoredSshCredential {
                            password: credential.password.clone(),
                            ..Default::default()
                        },
                        _ => StoredSshCredential {
                            password: None,
                            ..credential.clone()
                        },
                    };
                    CredentialService::save(id, &filtered)?;
                } else if input.auth_type == "agent"
                    || (input.id.is_some()
                        && input.protocol == "rdp"
                        && credential.password.is_none())
                {
                    touched = Some(id);
                    CredentialService::delete(id)?;
                }
                Ok(())
            },
        );
        if result.is_err() {
            if let Some(id) = touched {
                if let Some(old) = before {
                    CredentialService::save(id, &old)?;
                } else {
                    CredentialService::delete(id)?;
                }
            }
        }
        if result.is_ok() {
            if let Some(token) = &input.verification_token {
                if let Ok(mut tickets) = self.verified.lock() {
                    tickets.remove(token);
                }
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input() -> ServerFormRequest {
        serde_json::from_value(serde_json::json!({
            "id": null, "alias": "demo", "hostname": "192.0.2.1", "port": 22,
            "username": "root", "authType": "password", "protocol": "ssh", "osType": "linux",
            "group": "生产/网关", "tags": "[\"test\"]", "aiPolicy": "readonly", "allowSudo": false,
            "useLocalProxy": false, "bastionId": null, "aiUsername": "", "credentials": {"password": "test-only"}
        })).expect("test input")
    }

    #[test]
    fn server_form_roundtrips_options_without_credentials_and_keeps_favorites() {
        let db = Database::init(":memory:").expect("db");
        let mut request = input();
        request.connection_options.network_env = "cross_border".into();
        request.connection_options.rdp_enabled = true;
        request.connection_options.rdp_display_mode = "1440x900".into();
        validate(&db, &mut request).expect("validate");
        let id = db
            .save_server_form(&request, "SHA256:test", true, |_| Ok(()))
            .expect("save");
        db.set_favorite(id, true).expect("favorite");
        request.id = Some(id);
        request.alias = "renamed".into();
        db.save_server_form(&request, "SHA256:test", false, |_| Ok(()))
            .expect("edit");
        let saved = db.get_server_by_id(id).expect("load").expect("server");
        assert_eq!(saved.alias, "renamed");
        assert!(saved.favorite);
        assert_eq!(saved.connection_options, request.connection_options);
        assert_eq!(saved.last_connection_status, "verified");
        assert!(saved.last_connected_at.is_some());
        assert!(!serde_json::to_string(&saved)
            .expect("json")
            .contains("test-only"));
    }

    #[test]
    fn server_form_credential_failure_rolls_back_new_and_existing_rows() {
        let db = Database::init(":memory:").expect("db");
        let mut request = input();
        assert!(db
            .save_server_form(&request, "", false, |_| Err(invalid("vault unavailable")))
            .is_err());
        assert!(db.get_all_servers().expect("rows").is_empty());
        let id = db
            .save_server_form(&request, "", false, |_| Ok(()))
            .expect("save");
        request.id = Some(id);
        request.alias = "changed".into();
        assert!(db
            .save_server_form(&request, "", false, |_| Err(invalid("vault unavailable")))
            .is_err());
        assert_eq!(
            db.get_server_by_id(id).expect("load").expect("row").alias,
            "demo"
        );
        request.id = None;
        request.alias = "DEMO".into();
        assert!(db
            .save_server_form(&request, "", false, |_| Ok(()))
            .is_err());
    }

    #[test]
    fn server_form_rejects_bad_ports_proxy_and_jump_cycles_and_limits_rdp() {
        let db = Database::init(":memory:").expect("db");
        for port in [0, -1, 65536] {
            let mut r = input();
            r.port = port;
            assert!(validate(&db, &mut r).is_err());
        }
        let mut r = input();
        r.connection_options.connection_proxy = "http://user:secret@localhost:8080".into();
        assert!(validate(&db, &mut r).is_err());
        let id = db
            .save_server_form(&input(), "", false, |_| Ok(()))
            .expect("save");
        let mut r = input();
        r.id = Some(id);
        r.bastion_id = Some(id);
        assert!(validate(&db, &mut r).is_err());
        let mut r = input();
        r.protocol = "rdp".into();
        r.port = 3389;
        r.allow_sudo = true;
        r.ai_policy = "trusted".into();
        validate(&db, &mut r).expect("rdp");
        assert_eq!(r.ai_policy, "disabled");
        assert_eq!(r.os_type, "windows");
        assert!(!r.allow_sudo);
        assert!(r.connection_options.rdp_enabled);
        assert_eq!(r.connection_options.rdp_port, 3389);
    }

    #[test]
    fn server_form_verification_binds_credentials_and_route_and_expires() {
        let db = Database::init(":memory:").expect("db");
        let service = ServerFormService::default();
        let initial = input();
        let digest = hash(&initial).expect("hash");
        let mut r = initial.clone();
        r.credentials.as_mut().expect("credential").password = Some("different".into());
        assert_ne!(digest, hash(&r).expect("hash"));
        r = initial.clone();
        r.hostname = "192.0.2.2".into();
        assert_ne!(digest, hash(&r).expect("hash"));
        r = initial.clone();
        r.connection_options.connection_proxy = "socks5://localhost:1080".into();
        assert_ne!(digest, hash(&r).expect("hash"));
        service.verified.lock().expect("tickets").insert(
            "expired".into(),
            Verified {
                hash: digest,
                fingerprint: "SHA256:test".into(),
                at: Instant::now() - Duration::from_secs(901),
            },
        );
        r = initial;
        r.verification_token = Some("expired".into());
        assert!(service
            .save(&db, r)
            .expect_err("expired token")
            .to_string()
            .contains("过期"));
        assert!(db.get_all_servers().expect("rows").is_empty());
    }
}
