use ai_profile::{client::{ServiceConfig, Verifier}, preset_by_key, vendors, Kind, Protocol, ProviderPreset, Vendor};
use keyring::{Entry, Error as KeyringError};

use crate::{database::Database, error::AppError, models::{ModelImportResult, ModelProfile, ModelProfileInput, ModelProfileSummary}};

const CONFIG_PREFIX: &str = "ai.model.";
const CREDENTIAL_SERVICE: &str = "com.opsentr.yunwei.ai-model";

pub struct ModelService;

/// 供受控聊天调用使用的配置。密钥只在 Rust 进程内短暂存在，不会序列化或返回前端。
#[derive(Clone)]
pub struct ChatModelConfig {
    pub name: String,
    pub protocol: Protocol,
    pub base_url: String,
    pub model: String,
    pub api_key: String,
    pub preset_key: Option<String>,
}

impl ModelService {
    pub fn vendors() -> Vec<Vendor> { vendors(&[Kind::Chat]) }

    pub fn preset(key: &str) -> Option<&'static ProviderPreset> { preset_by_key(key) }

    pub fn chat_config(db: &Database, id: &str) -> Result<ChatModelConfig, AppError> {
        let raw = db
            .get_config(&format!("{CONFIG_PREFIX}{id}"))?
            .ok_or_else(|| AppError::NotFound("所选模型配置不存在".into()))?;
        let profile: ModelProfile = serde_json::from_str(&raw)?;
        if !profile.enabled {
            return Err(AppError::InvalidInput("所选模型配置已停用".into()));
        }
        let protocol = Protocol::parse(&profile.protocol)
            .ok_or_else(|| AppError::InvalidInput("模型服务协议无效".into()))?;
        let base_url = if profile.base_url.trim().is_empty() {
            profile
                .preset_key
                .as_deref()
                .and_then(preset_by_key)
                .and_then(|preset| preset.endpoint())
                .unwrap_or(protocol.default_base_url())
                .to_string()
        } else {
            profile.base_url.trim().to_string()
        };
        if profile.model.trim().is_empty() {
            return Err(AppError::InvalidInput("模型名称不能为空".into()));
        }
        Ok(ChatModelConfig {
            name: profile.name,
            protocol,
            base_url,
            model: profile.model,
            api_key: keyring_get(id)?.unwrap_or_default(),
            preset_key: profile.preset_key,
        })
    }

    pub fn list(db: &Database) -> Result<Vec<ModelProfileSummary>, AppError> {
        let mut profiles = Vec::new();
        for config in db.get_all_config()? {
            if !config.key.starts_with(CONFIG_PREFIX) { continue; }
            let profile: ModelProfile = serde_json::from_str(&config.value)?;
            profiles.push(ModelProfileSummary {
                has_api_key: keyring_has(profile.id.as_str())?,
                id: profile.id,
                name: profile.name,
                preset_key: profile.preset_key,
                protocol: profile.protocol,
                base_url: profile.base_url,
                model: profile.model,
                extra: profile.extra,
                enabled: profile.enabled,
                updated_at: profile.updated_at,
            });
        }
        profiles.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(profiles)
    }

    pub fn save(db: &Database, input: ModelProfileInput) -> Result<ModelProfileSummary, AppError> {
        let name = input.name.trim();
        if name.is_empty() { return Err(AppError::InvalidInput("模型服务名称不能为空".into())); }
        let protocol = Protocol::parse(input.protocol.trim()).ok_or_else(|| AppError::InvalidInput("模型服务协议无效".into()))?;
        if let Some(key) = input.preset_key.as_deref() {
            let preset = preset_by_key(key).ok_or_else(|| AppError::InvalidInput("模型服务预置不存在".into()))?;
            if preset.kind != Kind::Chat { return Err(AppError::InvalidInput("当前预置不是对话模型服务".into())); }
            if preset.protocol != protocol { return Err(AppError::InvalidInput("预置协议与模型服务协议不匹配".into())); }
        }
        let id = input.id.filter(|value| !value.trim().is_empty()).unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let key = format!("{CONFIG_PREFIX}{id}");
        let old = db.get_config(&key)?.and_then(|raw| serde_json::from_str::<ModelProfile>(&raw).ok());
        if let Some(api_key) = input.api_key.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            keyring_save(&id, api_key)?;
        } else if old.is_none() && !input.extra.is_empty() && input.base_url.trim().is_empty() {
            // 本地服务允许空 key；其他新配置不强制要求 key，以兼容无鉴权网关。
        }
        let profile = ModelProfile { id: id.clone(), name: name.to_string(), preset_key: input.preset_key, protocol: protocol.as_str().into(), base_url: input.base_url.trim().to_string(), model: input.model.trim().to_string(), extra: input.extra, enabled: input.enabled, updated_at: chrono::Utc::now().to_rfc3339() };
        db.set_config(&key, &serde_json::to_string(&profile)?)?;
        Self::summary(profile)
    }

    pub fn delete(db: &Database, id: &str) -> Result<(), AppError> {
        let key = format!("{CONFIG_PREFIX}{id}");
        db.delete_config(&key)?;
        keyring_delete(id)?;
        Ok(())
    }

    pub fn export(db: &Database, id: &str) -> Result<String, AppError> {
        let raw = db.get_config(&format!("{CONFIG_PREFIX}{id}"))?
            .ok_or_else(|| AppError::NotFound("模型服务配置不存在".into()))?;
        let profile: ModelProfile = serde_json::from_str(&raw)?;
        let protocol = Protocol::parse(&profile.protocol).ok_or_else(|| AppError::InvalidInput("模型服务协议无效".into()))?;
        let api_key = keyring_get(id)?.unwrap_or_default();
        Ok(ai_profile::to_profile(&profile.name, protocol, &profile.base_url, &api_key, &profile.model))
    }

    pub async fn verify(verifier: &Verifier, input: &ModelProfileInput, stored_id: Option<&str>) -> Result<crate::models::ModelVerifyOutcome, AppError> {
        let protocol = Protocol::parse(input.protocol.trim()).ok_or_else(|| AppError::InvalidInput("模型服务协议无效".into()))?;
        let api_key = match input.api_key.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            Some(value) => value.to_string(),
            None => stored_id.map(keyring_get).transpose()?.flatten().unwrap_or_default(),
        };
        let extra_values: Vec<(String, String)> = input.extra.iter().map(|(key, value)| (key.clone(), value.clone())).collect();
        let extra_refs: Vec<(&str, &str)> = extra_values.iter().map(|(key, value)| (key.as_str(), value.as_str())).collect();
        let mut config = ServiceConfig::new(protocol, input.base_url.trim()).with_api_key(&api_key).with_model(input.model.trim()).with_extra(&extra_refs);
        if let Some(key) = input.preset_key.as_deref() { config = config.with_preset(key); }
        Ok(match verifier.verify(config).await {
            Ok(result) => crate::models::ModelVerifyOutcome { ok: true, actionable: true, result: Some(result), error: None },
            Err(error) => crate::models::ModelVerifyOutcome { ok: false, actionable: error.is_actionable(), result: None, error: Some(error) },
        })
    }

    pub fn import(db: &Database, text: &str) -> Result<crate::models::ModelImportBatchResult, AppError> {
        let parsed = ai_profile::parse_profiles(text, "").map_err(|error| AppError::InvalidInput(error.to_string()))?;
        let mut imported = Vec::with_capacity(parsed.profiles.len());
        for profile in parsed.profiles {
            let preset_key = ai_profile::preset::infer_preset_key(profile.protocol, Some(&profile.base_url));
            let preset_key = preset_by_key(preset_key).map(|preset| preset.key.to_string());
            let name = if profile.name.trim().is_empty() { "导入的模型服务".to_string() } else { profile.name };
            let saved = Self::save(db, ModelProfileInput {
                id: None,
                name: name.clone(),
                preset_key,
                protocol: profile.protocol.as_str().to_string(),
                base_url: profile.base_url,
                model: profile.model.clone(),
                extra: std::collections::HashMap::new(),
                api_key: Some(profile.api_key),
                enabled: true,
            })?;
            imported.push(ModelImportResult { name, preset_key: saved.preset_key, protocol: saved.protocol, base_url: saved.base_url, model: saved.model, model_fallback: profile.model_fallback });
        }
        Ok(crate::models::ModelImportBatchResult { profiles: imported, skipped: parsed.skipped, bundle: parsed.bundle })
    }

    fn summary(profile: ModelProfile) -> Result<ModelProfileSummary, AppError> {
        Ok(ModelProfileSummary { has_api_key: keyring_has(&profile.id)?, id: profile.id, name: profile.name, preset_key: profile.preset_key, protocol: profile.protocol, base_url: profile.base_url, model: profile.model, extra: profile.extra, enabled: profile.enabled, updated_at: profile.updated_at })
    }
}

fn entry(id: &str) -> Result<Entry, AppError> { Entry::new(CREDENTIAL_SERVICE, &format!("profile-{id}")).map_err(|error| AppError::Custom(format!("访问模型服务凭据失败: {error}"))) }
fn keyring_save(id: &str, value: &str) -> Result<(), AppError> { entry(id)?.set_password(value).map_err(|error| AppError::Custom(format!("保存模型服务密钥失败: {error}"))) }
fn keyring_get(id: &str) -> Result<Option<String>, AppError> { match entry(id)?.get_password() { Ok(value) => Ok(Some(value)), Err(KeyringError::NoEntry) => Ok(None), Err(error) => Err(AppError::Custom(format!("读取模型服务密钥失败: {error}"))) } }
fn keyring_has(id: &str) -> Result<bool, AppError> { Ok(keyring_get(id)?.is_some()) }
fn keyring_delete(id: &str) -> Result<(), AppError> { match entry(id)?.delete_credential() { Ok(()) | Err(KeyringError::NoEntry) => Ok(()), Err(error) => Err(AppError::Custom(format!("删除模型服务密钥失败: {error}"))) } }
