use crate::{
    database::Database,
    error::AppError,
    remote::{server, RemoteConfig},
    state::AppState,
};
use ring::rand::{SecureRandom, SystemRandom};
use sha2::{Digest, Sha256};
use std::{
    net::Ipv4Addr,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

pub const DEVICE_CHANNEL_PORT: u16 = 59145;
const PAIRING_WINDOW_SECONDS: u64 = 120;

pub use crate::models::device_channel::{
    DeviceChannelStatus, NetworkInterface, PairedDevice, PairingRequest, PairingResult,
    PairingSession,
};

struct PendingPairing {
    id: String,
    secret_hash: String,
    expires_at: u64,
}
#[derive(Default)]
struct Runtime {
    handle: Option<server::RemoteHandle>,
    host: Option<String>,
    persistent: bool,
    pending: Option<PendingPairing>,
    pairing_session_id: Option<String>,
    paired_device_id: Option<String>,
}
#[derive(Default)]
pub struct DeviceChannelManager {
    // Serializes listener changes and expiry so an old timer cannot close a newer channel.
    operations: tokio::sync::Mutex<()>,
    runtime: Mutex<Runtime>,
    pub assistant_operation: tokio::sync::Mutex<()>,
}

pub fn list_private_interfaces() -> Result<Vec<NetworkInterface>, AppError> {
    let interfaces = if_addrs::get_if_addrs()
        .map_err(|e| AppError::Custom(format!("读取网络适配器失败: {e}")))?;
    let mut result = interfaces
        .into_iter()
        .filter_map(|interface| {
            let address = match interface.addr {
                if_addrs::IfAddr::V4(address)
                    if address.ip.is_private() && !address.ip.is_loopback() =>
                {
                    address.ip
                }
                _ => return None,
            };
            let virtual_nic = [
                "virtual",
                "docker",
                "vmware",
                "vethernet",
                "wsl",
                "loopback",
            ]
            .iter()
            .any(|value| interface.name.to_lowercase().contains(value));
            Some(NetworkInterface {
                name: interface.name,
                address: address.to_string(),
                recommended: !virtual_nic,
            })
        })
        .collect::<Vec<_>>();
    result.sort_by(|a, b| {
        b.recommended
            .cmp(&a.recommended)
            .then_with(|| a.address.cmp(&b.address))
    });
    result.dedup_by(|a, b| a.address == b.address);
    Ok(result)
}

pub async fn start_pairing(
    manager: &Arc<DeviceChannelManager>,
    app: AppHandle,
    address: &str,
) -> Result<PairingSession, AppError> {
    let _operation = manager.operations.lock().await;
    validate_private_address(address)?;
    ensure_gateway(manager, app, address).await?;
    let session_id = random_hex(16)?;
    let secret = random_hex(32)?;
    let expires_at = now_epoch_seconds() + PAIRING_WINDOW_SECONDS;
    {
        let mut runtime = manager
            .runtime
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        runtime.pending = Some(PendingPairing {
            id: session_id.clone(),
            secret_hash: token_hash(&secret),
            expires_at,
        });
        runtime.pairing_session_id = Some(session_id.clone());
        runtime.paired_device_id = None;
    }
    let session = PairingSession {
        session_id: session_id.clone(),
        base_url: format!("http://{address}:{DEVICE_CHANNEL_PORT}"),
        // Fragment is consumed by the same-origin companion page, never sent in a URL or access log.
        pairing_url: format!(
            "http://{address}:{DEVICE_CHANNEL_PORT}/#session={session_id}&secret={secret}"
        ),
        expires_at,
    };
    let manager = Arc::clone(manager);
    tokio::spawn(async move {
        tokio::time::sleep(Duration::from_secs(PAIRING_WINDOW_SECONDS)).await;
        let _ = cancel_pairing(&manager, &session_id).await;
    });
    Ok(session)
}

pub fn complete_pairing(
    manager: &DeviceChannelManager,
    db: &Database,
    request: PairingRequest,
) -> Result<PairingResult, AppError> {
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
        return Err(AppError::InvalidInput("设备名称需为 1–64 个字符".into()));
    }
    let mut runtime = manager
        .runtime
        .lock()
        .map_err(|e| AppError::Custom(e.to_string()))?;
    let pending = runtime
        .pending
        .as_ref()
        .ok_or_else(|| AppError::InvalidInput("配对码已失效，请在电脑重新生成".into()))?;
    if !pairing_matches(
        pending,
        &request.session_id,
        &request.secret,
        now_epoch_seconds(),
    ) {
        return Err(AppError::InvalidInput("配对码不正确或已过期".into()));
    }
    let token = random_hex(32)?;
    let device = PairedDevice {
        id: random_hex(16)?,
        name: name.into(),
        created_at: now_epoch_seconds(),
        last_seen_at: None,
    };
    // Keep the pairing mutex until the DB insert succeeds: only one phone can redeem a QR code.
    db.save_paired_device(&device, &token_hash(&token))?;
    if let Err(error) = super::audit::AuditService::add_log(
        db,
        "全局",
        "pair_mobile_device",
        &format!("device:{}", device.id),
        "paired",
    ) {
        db.revoke_paired_device(&device.id)?;
        return Err(error);
    }
    runtime.pending = None;
    runtime.paired_device_id = Some(device.id.clone());
    Ok(PairingResult { device, token })
}

pub async fn start_channel(
    manager: &Arc<DeviceChannelManager>,
    app: AppHandle,
    address: &str,
) -> Result<DeviceChannelStatus, AppError> {
    let _operation = manager.operations.lock().await;
    validate_private_address(address)?;
    ensure_gateway(manager, app, address).await?;
    let mut runtime = manager
        .runtime
        .lock()
        .map_err(|e| AppError::Custom(e.to_string()))?;
    runtime.persistent = true;
    Ok(status_from_runtime(&runtime))
}

async fn ensure_gateway(
    manager: &Arc<DeviceChannelManager>,
    app: AppHandle,
    address: &str,
) -> Result<(), AppError> {
    {
        let runtime = manager
            .runtime
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        if runtime.handle.is_some() && runtime.host.as_deref() == Some(address) {
            return Ok(());
        }
        if runtime.persistent {
            return Err(AppError::InvalidInput(
                "请先关闭正在运行的通道，再切换网卡".into(),
            ));
        }
    }
    stop_current(manager).await?;
    let handle = server::start_device(
        RemoteConfig {
            host: address.into(),
            port: DEVICE_CHANNEL_PORT,
            base_path: "/v1".into(),
            require_token: true,
        },
        app,
    )
    .await
    .map_err(|e| AppError::Custom(format!("启动设备通道失败: {e}")))?;
    let mut runtime = manager
        .runtime
        .lock()
        .map_err(|e| AppError::Custom(e.to_string()))?;
    runtime.handle = Some(handle);
    runtime.host = Some(address.into());
    Ok(())
}

pub async fn cancel_pairing(
    manager: &Arc<DeviceChannelManager>,
    session_id: &str,
) -> Result<(), AppError> {
    let _operation = manager.operations.lock().await;
    let stop = {
        let mut runtime = manager
            .runtime
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        // A redeemed session still needs to close its temporary listener on expiry.
        if runtime.pairing_session_id.as_deref() != Some(session_id) {
            return Ok(());
        }
        runtime.pending = None;
        runtime.pairing_session_id = None;
        runtime.paired_device_id = None;
        !runtime.persistent
    };
    if stop {
        stop_current(manager).await?;
    }
    Ok(())
}

pub async fn stop_channel(manager: &Arc<DeviceChannelManager>) -> Result<(), AppError> {
    let _operation = manager.operations.lock().await;
    stop_current(manager).await
}
async fn stop_current(manager: &DeviceChannelManager) -> Result<(), AppError> {
    let handle = {
        let mut runtime = manager
            .runtime
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        let handle = runtime.handle.take();
        *runtime = Runtime::default();
        handle
    };
    if let Some(handle) = handle {
        handle.shutdown().await;
    }
    Ok(())
}
pub fn status(manager: &DeviceChannelManager) -> Result<DeviceChannelStatus, AppError> {
    let runtime = manager
        .runtime
        .lock()
        .map_err(|e| AppError::Custom(e.to_string()))?;
    Ok(status_from_runtime(&runtime))
}
fn status_from_runtime(runtime: &Runtime) -> DeviceChannelStatus {
    let running = runtime.handle.is_some();
    DeviceChannelStatus {
        running,
        pairing: runtime
            .pending
            .as_ref()
            .is_some_and(|p| p.expires_at > now_epoch_seconds()),
        persistent: runtime.persistent,
        host: runtime.host.clone(),
        port: running.then_some(DEVICE_CHANNEL_PORT),
        base_url: runtime
            .host
            .as_ref()
            .filter(|_| running)
            .map(|host| format!("http://{host}:{DEVICE_CHANNEL_PORT}")),
        paired_device_id: runtime.paired_device_id.clone(),
    }
}

pub fn authenticate(app: &AppHandle, token: &str) -> Result<Option<String>, AppError> {
    if token.len() != 64 || !token.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Ok(None);
    }
    let state = app.state::<AppState>();
    if !status(&state.device_channel)?.running {
        return Ok(None);
    }
    // Query on every request, so device revocation takes effect without restarting the channel.
    state.db.authenticate_paired_device(&token_hash(token))
}
pub fn list_devices(db: &Database) -> Result<Vec<PairedDevice>, AppError> {
    db.list_paired_devices()
}
pub fn revoke_device(db: &Database, id: &str) -> Result<(), AppError> {
    db.revoke_paired_device(id)?;
    super::audit::AuditService::add_log(
        db,
        "全局",
        "revoke_mobile_device",
        &format!("device:{id}"),
        "revoked",
    )?;
    Ok(())
}
fn token_hash(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn pairing_matches(pending: &PendingPairing, id: &str, secret: &str, now: u64) -> bool {
    now < pending.expires_at
        && pending.id == id
        && secret.len() == 64
        && pending.secret_hash == token_hash(secret)
}
fn validate_private_address(address: &str) -> Result<(), AppError> {
    let ip = address
        .parse::<Ipv4Addr>()
        .map_err(|_| AppError::InvalidInput("请选择有效的 IPv4 网卡".into()))?;
    if !ip.is_private() || ip.is_loopback() {
        return Err(AppError::InvalidInput(
            "设备通道只允许绑定私网 IPv4 地址".into(),
        ));
    }
    if !list_private_interfaces()?
        .iter()
        .any(|nic| nic.address == address)
    {
        return Err(AppError::InvalidInput(
            "网卡已断开或地址已变化，请刷新重试".into(),
        ));
    }
    Ok(())
}
fn random_hex(length: usize) -> Result<String, AppError> {
    let mut bytes = vec![0; length];
    SystemRandom::new()
        .fill(&mut bytes)
        .map_err(|_| AppError::Custom("生成设备安全令牌失败".into()))?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_private_ipv4_addresses_can_be_bound() {
        for address in ["8.8.8.8", "0.0.0.0", "127.0.0.1", "not-an-ip", "::1"] {
            assert!(validate_private_address(address).is_err());
        }
    }
    #[test]
    fn pairing_rejects_expiry_wrong_secret_and_wrong_session() {
        let secret = "a".repeat(64);
        let pending = PendingPairing {
            id: "session".into(),
            secret_hash: token_hash(&secret),
            expires_at: 200,
        };
        assert!(pairing_matches(&pending, "session", &secret, 199));
        assert!(!pairing_matches(&pending, "session", &secret, 200));
        assert!(!pairing_matches(&pending, "other", &secret, 199));
        assert!(!pairing_matches(&pending, "session", &"b".repeat(64), 199));
    }

    #[test]
    fn pairing_is_single_use_and_revocation_invalidates_the_saved_token() {
        let db = Database::init(":memory:").expect("database");
        let manager = DeviceChannelManager::default();
        let secret = "a".repeat(64);
        manager.runtime.lock().expect("runtime").pending = Some(PendingPairing {
            id: "test-session".into(),
            secret_hash: token_hash(&secret),
            expires_at: now_epoch_seconds() + 120,
        });
        let request = || PairingRequest {
            session_id: "test-session".into(),
            secret: secret.clone(),
            name: "test phone".into(),
        };
        let result = complete_pairing(&manager, &db, request()).expect("pair");
        assert!(
            complete_pairing(&manager, &db, request()).is_err(),
            "a redeemed QR cannot be used twice"
        );
        assert!(
            db.authenticate_paired_device(&token_hash(&secret))
                .expect("lookup")
                .is_none(),
            "pairing secret must not authorize API access"
        );
        assert_eq!(
            db.authenticate_paired_device(&token_hash(&result.token))
                .expect("lookup"),
            Some(result.device.id.clone())
        );
        revoke_device(&db, &result.device.id).expect("revoke");
        assert!(db
            .authenticate_paired_device(&token_hash(&result.token))
            .expect("lookup")
            .is_none());
    }

    #[test]
    fn simultaneous_scans_only_register_one_device() {
        let db = Arc::new(Database::init(":memory:").expect("database"));
        let manager = Arc::new(DeviceChannelManager::default());
        let secret = "a".repeat(64);
        manager.runtime.lock().expect("runtime").pending = Some(PendingPairing {
            id: "race".into(),
            secret_hash: token_hash(&secret),
            expires_at: now_epoch_seconds() + 120,
        });
        let threads = (0..2)
            .map(|_| {
                let db = db.clone();
                let manager = manager.clone();
                let secret = secret.clone();
                std::thread::spawn(move || {
                    complete_pairing(
                        &manager,
                        &db,
                        PairingRequest {
                            session_id: "race".into(),
                            secret,
                            name: "phone".into(),
                        },
                    )
                    .is_ok()
                })
            })
            .collect::<Vec<_>>();
        assert_eq!(
            threads
                .into_iter()
                .map(|thread| usize::from(thread.join().expect("join")))
                .sum::<usize>(),
            1
        );
        assert_eq!(db.list_paired_devices().expect("devices").len(), 1);
    }

    #[tokio::test]
    async fn stale_pairing_timer_does_not_cancel_new_session_or_persistent_channel() {
        let manager = Arc::new(DeviceChannelManager::default());
        {
            let mut runtime = manager.runtime.lock().expect("runtime");
            runtime.persistent = true;
            runtime.pairing_session_id = Some("new".into());
            runtime.pending = Some(PendingPairing {
                id: "new".into(),
                secret_hash: "hash".into(),
                expires_at: now_epoch_seconds() + 120,
            });
        }
        cancel_pairing(&manager, "old").await.expect("stale expiry");
        assert!(manager.runtime.lock().expect("runtime").pending.is_some());
        cancel_pairing(&manager, "new")
            .await
            .expect("current expiry");
        let runtime = manager.runtime.lock().expect("runtime");
        assert!(runtime.persistent);
        assert!(runtime.pending.is_none());
    }
}
