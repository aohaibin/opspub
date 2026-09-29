use tauri::Manager;

use crate::error::CommandError;
use crate::models::{
    ConnectivityResult, Server, SshConfigHost, SshProbeRequest, SshProbeResult,
    StoredSshCredential,
};
use crate::services::credential::CredentialService;
use crate::services::server::ServerService;
use crate::state::AppState;

/// 获取所有服务器
#[tauri::command]
pub fn list_servers(state: tauri::State<'_, AppState>) -> Result<Vec<Server>, CommandError> {
    ServerService::get_all(&state.db).map_err(|e| e.into())
}

/// 返回已有系统凭据的服务器 ID。
///
/// 不把密码、私钥路径或口令返回给 WebView；真正建立 SSH/SFTP/工作台连接时，
/// 由 Rust 侧直接从当前用户的系统凭据管理器读取。
#[tauri::command]
pub fn list_saved_ssh_credentials(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<i64>, CommandError> {
    let servers = ServerService::get_all(&state.db).map_err(CommandError::from)?;
    let mut result = Vec::new();
    for server in servers {
        if CredentialService::get(server.id)
            .map_err(CommandError::from)?
            .is_some()
        {
            result.push(server.id);
        }
    }
    Ok(result)
}

/// 保存 SSH 凭据到当前用户的系统凭据管理器。
#[tauri::command]
pub fn save_ssh_credentials(
    server_id: i64,
    password: Option<String>,
    private_key_path: Option<String>,
    passphrase: Option<String>,
) -> Result<(), CommandError> {
    CredentialService::save(
        server_id,
        &StoredSshCredential {
            password,
            private_key_path,
            passphrase,
        },
    )
    .map_err(|e| e.into())
}

/// 从当前用户的系统凭据管理器中删除 SSH 凭据。
#[tauri::command]
pub fn delete_ssh_credentials(server_id: i64) -> Result<(), CommandError> {
    CredentialService::delete(server_id).map_err(|e| e.into())
}

/// 添加服务器
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn add_server(
    state: tauri::State<'_, AppState>,
    alias: String,
    hostname: String,
    port: i32,
    username: String,
    auth_type: String,
    tags: String,
    group: String,
    ai_policy: String,
    os_type: String,
    arch: Option<String>,
    allow_sudo: Option<bool>,
    use_local_proxy: Option<bool>,
    bastion_id: Option<i64>,
    ai_username: Option<String>,
) -> Result<i64, CommandError> {
    ServerService::add(
        &state.db,
        &alias,
        &hostname,
        port,
        &username,
        &auth_type,
        &tags,
        &group,
        &ai_policy,
        &os_type,
        arch.as_deref().unwrap_or_default(),
        allow_sudo.unwrap_or(false),
        use_local_proxy.unwrap_or(false),
        bastion_id,
        ai_username.as_deref().unwrap_or_default(),
    )
    .map_err(|e| e.into())
}

/// 更新服务器
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_server(
    state: tauri::State<'_, AppState>,
    id: i64,
    alias: String,
    hostname: String,
    port: i32,
    username: String,
    auth_type: String,
    tags: String,
    group: String,
    ai_policy: String,
    os_type: String,
    arch: Option<String>,
    allow_sudo: Option<bool>,
    use_local_proxy: Option<bool>,
    bastion_id: Option<i64>,
    ai_username: Option<String>,
) -> Result<(), CommandError> {
    ServerService::update(
        &state.db,
        id,
        &alias,
        &hostname,
        port,
        &username,
        &auth_type,
        &tags,
        &group,
        &ai_policy,
        &os_type,
        arch.as_deref().unwrap_or_default(),
        allow_sudo.unwrap_or(false),
        use_local_proxy.unwrap_or(false),
        bastion_id,
        ai_username.as_deref().unwrap_or_default(),
    )
    .map_err(|e| e.into())
}

/// 删除服务器
#[tauri::command]
pub fn delete_server(state: tauri::State<'_, AppState>, id: i64) -> Result<bool, CommandError> {
    ServerService::delete(&state.db, id).map_err(|e| e.into())
}

/// 批量删除服务器
#[tauri::command]
pub fn batch_delete_servers(
    state: tauri::State<'_, AppState>,
    ids: Vec<i64>,
) -> Result<usize, CommandError> {
    ServerService::batch_delete(&state.db, &ids).map_err(|e| e.into())
}

/// 批量设置 AI 策略档位
#[tauri::command]
pub fn batch_update_server_policy(
    state: tauri::State<'_, AppState>,
    ids: Vec<i64>,
    ai_policy: String,
) -> Result<usize, CommandError> {
    ServerService::batch_update_policy(&state.db, &ids, &ai_policy).map_err(|e| e.into())
}

/// 批量追加标签
#[tauri::command]
pub fn batch_add_server_tags(
    state: tauri::State<'_, AppState>,
    ids: Vec<i64>,
    tags: Vec<String>,
) -> Result<usize, CommandError> {
    ServerService::batch_add_tags(&state.db, &ids, &tags).map_err(|e| e.into())
}

/// 切换收藏状态
#[tauri::command]
pub fn set_server_favorite(
    state: tauri::State<'_, AppState>,
    id: i64,
    favorite: bool,
) -> Result<bool, CommandError> {
    ServerService::set_favorite(&state.db, id, favorite).map_err(|e| e.into())
}

/// 测试服务器连通性（TCP 握手探测）
///
/// 探测最长会阻塞数秒，必须走 spawn_blocking：
/// 若直接在 async 任务里做阻塞 IO，会占住 async 运行时的工作线程，
/// 批量探测时多个请求互相争抢线程，界面会整体卡住。
#[tauri::command]
pub async fn test_server_connectivity(
    state: tauri::State<'_, AppState>,
    hostname: String,
    port: i32,
    server_id: Option<i64>,
) -> Result<ConnectivityResult, CommandError> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        ServerService::test_connectivity(&hostname, port)
    })
    .await
    .map_err(|e| CommandError {
        code: "INTERNAL".to_string(),
        message: format!("探测任务异常终止: {}", e),
    })?;

    // 只有探活成功才刷新「最近用过」；失败也刷会导致不可达的机器挤在列表顶部
    if result.ok {
        if let Some(id) = server_id {
            // 刷不上时间不影响探测结论本身，因此失败只记日志不向上抛错
            if let Err(e) = ServerService::touch_last_used(&state.db, id) {
                log::warn!("刷新服务器最近使用时间失败 (id={}): {}", id, e);
            }
        }
    }

    Ok(result)
}

/// 验证 SSH 凭据并读取远端只读系统摘要。
///
/// libssh2 的握手、认证和命令通道都是阻塞 IO，因此放入专用阻塞线程池，
/// 避免占用 Tauri 异步运行时工作线程导致界面其他 IPC 一起卡住。
#[tauri::command]
pub async fn test_server_ssh(
    app: tauri::AppHandle,
    request: SshProbeRequest,
) -> Result<SshProbeResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        ServerService::test_ssh(&state.db, request).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".to_string(),
        message: format!("SSH 验证任务异常终止: {error}"),
    })?
}

/// 读取并解析 ~/.ssh/config，返回可纳管的主机清单
///
/// 只做预览：解析结果不会自动落库，必须由用户勾选后逐条走 add_server，
/// 这样既能复用同一套字段校验，也避免批量写入未经验证的配置。
#[tauri::command]
pub fn import_ssh_config(app: tauri::AppHandle) -> Result<Vec<SshConfigHost>, CommandError> {
    let path = app
        .path()
        .home_dir()
        .map_err(|e| CommandError {
            code: "IO_ERROR".to_string(),
            message: format!("无法定位用户主目录: {}", e),
        })?
        .join(".ssh")
        .join("config");

    ServerService::read_ssh_config(&path).map_err(|e| e.into())
}
