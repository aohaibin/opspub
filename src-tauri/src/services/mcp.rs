use std::io::{BufRead, BufReader, Read, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;

use axum::{
    extract::{Json, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Router,
};
use keyring::{Entry, Error as KeyringError};
use serde_json::Value;
use tauri::Manager;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    CopilotRequest, McpClientConfig, McpStatus, McpToken, McpTokenCreated, McpTokenInput,
};
use crate::services::copilot::CopilotService;

const TOKEN_SERVICE: &str = "com.opsentr.yunwei.mcp";
const TOKEN_TIME_FORMAT: &str = "%Y-%m-%d %H:%M:%S";
const MCP_CONFIG_KEY: &str = "opspub";
const LEGACY_MCP_CONFIG_KEY: &str = "opssentry";

pub struct McpService;

const DEFAULT_HTTP_PORT: u16 = 18180;

#[derive(Default)]
pub struct McpServerManager {
    runtime: Mutex<Option<McpRuntime>>,
    last_error: Mutex<Option<String>>,
}

struct McpRuntime {
    port: u16,
    started_at: String,
    shutdown: Option<oneshot::Sender<()>>,
    join: JoinHandle<()>,
}

#[derive(Clone)]
struct McpHttpState {
    app: tauri::AppHandle,
}

#[derive(Clone)]
struct McpAuth {
    server_scope: String,
    tool_scope: String,
}

impl McpService {
    pub async fn start_http(
        manager: &McpServerManager,
        app: tauri::AppHandle,
        requested_port: Option<u16>,
    ) -> Result<u16, AppError> {
        {
            let guard = manager
                .runtime
                .lock()
                .map_err(|e| AppError::Custom(e.to_string()))?;
            if let Some(runtime) = guard.as_ref() {
                return Ok(runtime.port);
            }
        }
        let port = requested_port.unwrap_or(DEFAULT_HTTP_PORT);
        if port == 0 {
            return Err(AppError::InvalidInput("MCP HTTP 端口必须大于 0".into()));
        }
        let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => listener,
            Err(error) => {
                let message = format!("MCP HTTP 端口 {} 启动失败：{}", port, error);
                if let Ok(mut last_error) = manager.last_error.lock() {
                    *last_error = Some(message.clone());
                }
                return Err(AppError::Custom(message));
            }
        };

        // 绑定端口是异步操作，期间可能有另一个启动请求先完成；二次检查避免覆盖已运行的实例。
        let mut guard = manager
            .runtime
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        if let Some(runtime) = guard.as_ref() {
            return Ok(runtime.port);
        }
        let state = McpHttpState { app };
        let router = Router::new()
            .route("/mcp", post(mcp_rpc))
            .route("/health", get(mcp_health))
            .with_state(state);
        let (shutdown, rx) = oneshot::channel();
        let join = tokio::spawn(async move {
            let _ = axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = rx.await;
                })
                .await;
        });
        *guard = Some(McpRuntime {
            port,
            started_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            shutdown: Some(shutdown),
            join,
        });
        if let Ok(mut last_error) = manager.last_error.lock() {
            *last_error = None;
        }
        Ok(port)
    }

    pub async fn stop_http(manager: &McpServerManager) -> Result<bool, AppError> {
        let runtime = manager
            .runtime
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?
            .take();
        if let Some(mut runtime) = runtime {
            if let Some(tx) = runtime.shutdown.take() {
                let _ = tx.send(());
            }
            let _ = runtime.join.await;
            if let Ok(mut last_error) = manager.last_error.lock() {
                *last_error = None;
            }
            return Ok(true);
        }
        Ok(false)
    }

    pub fn runtime_status(manager: &McpServerManager) -> Result<Option<(u16, String)>, AppError> {
        let guard = manager
            .runtime
            .lock()
            .map_err(|e| AppError::Custom(e.to_string()))?;
        Ok(guard
            .as_ref()
            .map(|runtime| (runtime.port, runtime.started_at.clone())))
    }

    pub fn status(app: &tauri::AppHandle) -> Result<McpStatus, AppError> {
        let manager = &app.state::<crate::state::AppState>().mcp;
        let runtime = McpService::runtime_status(manager)?;
        let (http_port, http_started_at, http_running) = runtime
            .map(|(port, started)| (port, Some(started), true))
            .unwrap_or((DEFAULT_HTTP_PORT, None, false));
        let endpoint_error = if http_running {
            None
        } else {
            manager
                .last_error
                .lock()
                .map_err(|e| AppError::Custom(e.to_string()))?
                .clone()
        };
        Ok(McpStatus {
            version: app.package_info().version.to_string(),
            stdio_path: stdio_launcher_path(app),
            http_url: format!("http://127.0.0.1:{http_port}/mcp"),
            http_port,
            http_running,
            stdio_ready: http_running,
            in_process_ready: true,
            http_started_at,
            endpoint_message: if http_running {
                "127.0.0.1 仅本机监听".into()
            } else if endpoint_error.is_some() {
                "端点启动失败".into()
            } else {
                "端点未启动".into()
            },
            endpoint_error,
            last_tested_at: None,
            message: if http_running {
                "本地 MCP HTTP 服务已启动".into()
            } else {
                "本地 MCP HTTP 服务未启动；可点击启动端点".into()
            },
        })
    }

    pub fn test(app: &tauri::AppHandle) -> Result<McpStatus, AppError> {
        let mut status = Self::status(app)?;
        let http_running = status.http_running && probe_http_endpoint(status.http_port);
        status.http_running = http_running;
        status.stdio_ready = http_running;
        status.last_tested_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
        status.endpoint_message = if http_running {
            "127.0.0.1 仅本机监听".into()
        } else {
            "端点未启动或端口不可达".into()
        };
        status.message = if http_running {
            "MCP HTTP 端点测试成功".into()
        } else {
            "MCP HTTP 端点未响应，请检查服务状态".into()
        };
        Ok(status)
    }

    pub fn list_tokens(db: &Database) -> Result<Vec<McpToken>, AppError> {
        let mut tokens = db.get_all_mcp_tokens()?;
        for token in &mut tokens {
            if token.status == "active" && !token_is_current(&token.expires_at) {
                token.status = "expired".into();
            }
        }
        Ok(tokens)
    }

    pub fn create_token(db: &Database, input: McpTokenInput) -> Result<McpTokenCreated, AppError> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(AppError::InvalidInput("令牌名称不能为空".into()));
        }
        let client = input.client.trim();
        if !["claude", "codex", "cursor", "opencode", "custom"].contains(&client) {
            return Err(AppError::InvalidInput("不支持的 MCP 客户端类型".into()));
        }
        let server_scope = input.server_scope.trim();
        if server_scope.is_empty() {
            return Err(AppError::InvalidInput("至少需要授权一个服务器范围".into()));
        }
        let tool_scope = input.tool_scope.trim();
        if tool_scope.is_empty() {
            return Err(AppError::InvalidInput("至少需要授权一个工具范围".into()));
        }
        let expires_at = normalize_expiry(input.expires_at.as_deref())?;
        let secret = format!(
            "mcp_{}_{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        let hint = format!("{}...{}", &secret[..10], &secret[secret.len() - 6..]);
        let id = db.add_mcp_token(
            name,
            client,
            server_scope,
            tool_scope,
            expires_at.as_deref(),
            &hint,
        )?;
        if let Err(error) = entry_for(id)?.set_password(&secret) {
            let _ = db.delete_mcp_token(id);
            return Err(AppError::Custom(format!("保存 MCP 令牌失败: {error}")));
        }
        let token = db
            .get_mcp_token(id)?
            .ok_or_else(|| AppError::NotFound("MCP 令牌创建后未找到".into()))?;
        Ok(McpTokenCreated { token, secret })
    }

    pub fn revoke_token(db: &Database, id: i64) -> Result<bool, AppError> {
        if db.get_mcp_token(id)?.is_none() {
            return Ok(false);
        }
        let changed = db.revoke_mcp_token(id)?;
        match entry_for(id)?.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => {}
            Err(e) => return Err(AppError::Custom(format!("删除 MCP 令牌失败: {e}"))),
        }
        Ok(changed)
    }

    pub fn client_config(
        db: &Database,
        app: &tauri::AppHandle,
        token_id: i64,
        client: &str,
    ) -> Result<McpClientConfig, AppError> {
        let token = db
            .get_mcp_token(token_id)?
            .ok_or_else(|| AppError::NotFound("MCP 令牌不存在".into()))?;
        if token.status != "active" {
            return Err(AppError::InvalidInput("MCP 令牌已撤销".into()));
        }
        if !token_is_current(&token.expires_at) {
            return Err(AppError::InvalidInput("MCP 令牌已过期".into()));
        }
        if token.client != client && token.client != "custom" {
            return Err(AppError::InvalidInput(format!(
                "此令牌仅授权给 {} 客户端",
                token.client
            )));
        }
        let secret = entry_for(token_id)?
            .get_password()
            .map_err(|e| AppError::Custom(format!("读取 MCP 令牌失败: {e}")))?;
        let (path, format, content) = render_config(app, client, &secret)?;
        Ok(McpClientConfig {
            client: client.into(),
            path: path.to_string_lossy().into_owned(),
            format,
            content,
        })
    }

    pub fn inject_config(
        db: &Database,
        app: &tauri::AppHandle,
        token_id: i64,
        client: &str,
    ) -> Result<McpClientConfig, AppError> {
        let config = Self::client_config(db, app, token_id, client)?;
        let path = PathBuf::from(&config.path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        if path.exists() {
            let backup = path.with_extension(format!(
                "bak.{}",
                chrono::Local::now().format("%Y%m%d%H%M%S")
            ));
            std::fs::copy(&path, backup)?;
        }
        let content = if path.exists() {
            let existing = std::fs::read_to_string(&path)?;
            merge_client_config(&existing, &config.content, client, &config.format)?
        } else {
            config.content.clone()
        };
        std::fs::write(&path, content)?;
        Ok(config)
    }
}

fn probe_http_endpoint(port: u16) -> bool {
    let Ok(address) = format!("127.0.0.1:{port}").parse::<std::net::SocketAddr>() else {
        return false;
    };
    let Ok(mut stream) = std::net::TcpStream::connect_timeout(&address, Duration::from_millis(500))
    else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let request = format!("GET /health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    if stream.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut response = Vec::new();
    if stream.read_to_end(&mut response).is_err() {
        return false;
    }
    let response = String::from_utf8_lossy(&response);
    response.starts_with("HTTP/1.1 200") && response.contains("opspub-mcp")
}

async fn mcp_health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "service": "opspub-mcp" }))
}

async fn mcp_rpc(
    State(state): State<McpHttpState>,
    headers: HeaderMap,
    Json(request): Json<Value>,
) -> impl IntoResponse {
    let auth = match authenticate_http(&state.app, &headers) {
        Ok(auth) => auth,
        Err(status) => {
            return (status, Json(serde_json::json!({ "error": "unauthorized" }))).into_response()
        }
    };
    let response = handle_rpc(&state.app, Some(auth), request);
    if response.is_null() {
        return StatusCode::NO_CONTENT.into_response();
    }
    Json(response).into_response()
}

fn authenticate_http(app: &tauri::AppHandle, headers: &HeaderMap) -> Result<McpAuth, StatusCode> {
    let provided = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| {
            let (scheme, token) = value.split_once(' ')?;
            scheme
                .eq_ignore_ascii_case("bearer")
                .then_some(token.trim())
        })
        .filter(|value| !value.is_empty())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let db = &app.state::<crate::state::AppState>().db;
    let tokens = db
        .get_all_mcp_tokens()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    for token in tokens {
        if token.status != "active" {
            continue;
        }
        if let Some(expires_at) = token.expires_at.as_deref() {
            let Ok(expiry) = chrono::NaiveDateTime::parse_from_str(expires_at, TOKEN_TIME_FORMAT)
            else {
                continue;
            };
            if expiry <= chrono::Local::now().naive_local() {
                continue;
            }
        }
        let Ok(secret) = entry_for(token.id).and_then(|entry| {
            entry
                .get_password()
                .map_err(|e| AppError::Custom(e.to_string()))
        }) else {
            continue;
        };
        if secret == provided {
            return Ok(McpAuth {
                server_scope: token.server_scope,
                tool_scope: token.tool_scope,
            });
        }
    }
    Err(StatusCode::UNAUTHORIZED)
}

fn handle_rpc(app: &tauri::AppHandle, auth: Option<McpAuth>, request: Value) -> Value {
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    let method = request
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if method.starts_with("notifications/") {
        return Value::Null;
    }
    match method {
        "initialize" => {
            if auth.is_none() {
                return rpc_error(id, -32001, "需要 Bearer Token");
            }
            serde_json::json!({
            "jsonrpc": "2.0", "id": id,
            "result": { "protocolVersion": "2024-11-05", "capabilities": { "tools": {} }, "serverInfo": { "name": "OpsPub MCP", "version": "0.1.0" } }
            })
        }
        "ping" => {
            if auth.is_none() {
                return rpc_error(id, -32001, "需要 Bearer Token");
            }
            serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": {} })
        }
        "tools/list" => {
            let Some(auth) = auth else {
                return rpc_error(id, -32001, "需要 Bearer Token");
            };
            serde_json::json!({ "jsonrpc": "2.0", "id": id, "result": { "tools": mcp_tools_for_scope(&auth.tool_scope) } })
        }
        "tools/call" => {
            let Some(auth) = auth else {
                return rpc_error(id, -32001, "需要 Bearer Token");
            };
            handle_tool_call(
                app,
                auth,
                id,
                request.get("params").cloned().unwrap_or_default(),
            )
        }
        _ => rpc_error(id, -32601, "不支持的 MCP 方法"),
    }
}

fn rpc_error(id: Value, code: i32, message: &str) -> Value {
    serde_json::json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn mcp_tools() -> Value {
    serde_json::json!([
        {"name":"list_servers","description":"列出已配置服务器（不返回凭据）","inputSchema":{"type":"object","properties":{}}},
        {"name":"system_info","description":"执行受控只读系统健康探针","inputSchema":{"type":"object","properties":{"serverId":{"type":"integer"},"serverAlias":{"type":"string"}},"required":[]}},
        {"name":"disk_usage","description":"查询磁盘使用率","inputSchema":{"type":"object","properties":{"serverId":{"type":"integer"},"serverAlias":{"type":"string"}}}},
        {"name":"service_status","description":"查询 Nginx 服务状态","inputSchema":{"type":"object","properties":{"serverId":{"type":"integer"},"serverAlias":{"type":"string"}}}},
        {"name":"port_check","description":"查询监听端口","inputSchema":{"type":"object","properties":{"serverId":{"type":"integer"},"serverAlias":{"type":"string"}}}},
        {"name":"tail_log","description":"查询最近系统日志","inputSchema":{"type":"object","properties":{"serverId":{"type":"integer"},"serverAlias":{"type":"string"}}}}
    ])
}

fn handle_tool_call(app: &tauri::AppHandle, auth: McpAuth, id: Value, params: Value) -> Value {
    let tool = params
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !tool_allowed(&auth.tool_scope, tool) {
        return rpc_error(id, -32003, "令牌不允许调用此工具");
    }
    let arguments = params.get("arguments").cloned().unwrap_or_default();
    let message = match tool {
        "list_servers" => "列出服务器",
        "system_info" => "检查服务器健康",
        "disk_usage" => "查看磁盘使用率",
        "service_status" => "检查 nginx 状态",
        "port_check" => "查看监听端口",
        "tail_log" => "查看最近日志",
        _ => return rpc_error(id, -32602, "未知工具"),
    };
    let state = app.state::<crate::state::AppState>();
    if tool == "list_servers" {
        return list_servers_response(&state.db, &auth.server_scope, id);
    }
    let selected_id = arguments
        .get("serverId")
        .and_then(Value::as_i64)
        .or_else(|| {
            let alias = arguments.get("serverAlias").and_then(Value::as_str)?;
            state
                .db
                .get_all_servers()
                .ok()?
                .iter()
                .find(|server| server.alias == alias)
                .map(|server| server.id)
        });
    if tool != "list_servers" {
        if let Some(server_id) = selected_id {
            if let Ok(Some(server)) = state.db.get_server_by_id(server_id) {
                if !server_allowed(&auth.server_scope, &server.alias) {
                    return rpc_error(id, -32003, "令牌不包含此服务器");
                }
            } else {
                return rpc_error(id, -32602, "服务器不存在");
            }
        } else {
            return rpc_error(id, -32602, "必须提供 serverId 或 serverAlias");
        }
    }
    match CopilotService::chat(
        app.clone(),
        CopilotRequest {
            message: message.into(),
            server_id: selected_id,
            provider: Some("mcp".into()),
        },
    ) {
        Ok(response) => {
            serde_json::json!({ "jsonrpc":"2.0", "id":id, "result":{"content":[{"type":"text","text":response.reply}],"isError":response.tool_calls.iter().any(|call| call.status == "failed" || call.status == "blocked") } })
        }
        Err(error) => rpc_error(id, -32000, &error.to_string()),
    }
}

fn tool_allowed(scope: &str, tool: &str) -> bool {
    let values = scope.split(',').map(str::trim).collect::<Vec<_>>();
    values.contains(&"*")
        || values.contains(&tool)
        || (values.contains(&"readonly")
            && [
                "list_servers",
                "system_info",
                "disk_usage",
                "service_status",
                "port_check",
                "tail_log",
            ]
            .contains(&tool))
}

fn mcp_tools_for_scope(scope: &str) -> Value {
    let allowed = mcp_tools()
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter(|tool| {
            tool.get("name")
                .and_then(Value::as_str)
                .map(|name| tool_allowed(scope, name))
                .unwrap_or(false)
        })
        .collect::<Vec<_>>();
    Value::Array(allowed)
}

fn list_servers_response(db: &Database, scope: &str, id: Value) -> Value {
    let servers = match db.get_all_servers() {
        Ok(servers) => servers,
        Err(error) => return rpc_error(id, -32000, &error.to_string()),
    };
    let visible = servers
        .into_iter()
        .filter(|server| server_allowed(scope, &server.alias))
        .map(|server| {
            serde_json::json!({
                "id": server.id,
                "alias": server.alias,
                "hostname": server.hostname,
                "port": server.port,
                "username": server.username,
                "group": server.group,
                "osType": server.os_type,
                "aiPolicy": server.ai_policy,
                "lastConnectionStatus": server.last_connection_status,
                "lastConnectedAt": server.last_connected_at,
            })
        })
        .collect::<Vec<_>>();
    serde_json::json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": {
            "content": [{"type": "text", "text": serde_json::to_string_pretty(&visible).unwrap_or_else(|_| "[]".into())}],
            "isError": false
        }
    })
}

fn server_allowed(scope: &str, alias: &str) -> bool {
    scope.trim() == "*" || scope.split(',').map(str::trim).any(|value| value == alias)
}

fn normalize_expiry(value: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(None);
    };
    let expiry = chrono::NaiveDateTime::parse_from_str(value, TOKEN_TIME_FORMAT).map_err(|_| {
        AppError::InvalidInput(format!("令牌有效期格式无效，应为 YYYY-MM-DD HH:MM:SS"))
    })?;
    if expiry <= chrono::Local::now().naive_local() {
        return Err(AppError::InvalidInput("令牌有效期必须晚于当前时间".into()));
    }
    Ok(Some(value.to_string()))
}

fn token_is_current(expires_at: &Option<String>) -> bool {
    expires_at.as_deref().map_or(true, |value| {
        chrono::NaiveDateTime::parse_from_str(value, TOKEN_TIME_FORMAT)
            .map(|expiry| expiry > chrono::Local::now().naive_local())
            .unwrap_or(false)
    })
}

fn stdio_launcher_path(app: &tauri::AppHandle) -> String {
    let _ = app;
    std::env::current_exe()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| {
            if cfg!(windows) {
                "OpsPub AI.exe".into()
            } else {
                "OpsPub AI".into()
            }
        })
}

/// 外部客户端启动当前程序时的 stdio 适配器：每条 JSON-RPC 请求通过本机 HTTP 端点转发。
pub fn run_stdio_proxy(token: &str, port: u16) -> Result<(), String> {
    let stdin = std::io::stdin();
    let mut reader = BufReader::new(stdin.lock());
    let mut line = String::new();
    loop {
        line.clear();
        if reader.read_line(&mut line).map_err(|e| e.to_string())? == 0 {
            break;
        }
        if line.trim().is_empty() {
            continue;
        }
        let body = line.trim().as_bytes();
        let mut stream = std::net::TcpStream::connect_timeout(
            &format!("127.0.0.1:{port}")
                .parse::<std::net::SocketAddr>()
                .map_err(|e| e.to_string())?,
            Duration::from_secs(3),
        )
        .map_err(|e| format!("无法连接本地 MCP HTTP 服务：{e}"))?;
        let request = format!(
            "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        );
        stream
            .write_all(request.as_bytes())
            .map_err(|e| e.to_string())?;
        stream.write_all(body).map_err(|e| e.to_string())?;
        stream.flush().map_err(|e| e.to_string())?;
        let mut response = Vec::new();
        stream
            .read_to_end(&mut response)
            .map_err(|e| e.to_string())?;
        let separator = response
            .windows(4)
            .position(|window| window == b"\r\n\r\n")
            .ok_or_else(|| "MCP HTTP 响应格式无效".to_string())?;
        let headers = String::from_utf8_lossy(&response[..separator]);
        if headers.contains(" 204 ") {
            continue;
        }
        let payload = String::from_utf8_lossy(&response[separator + 4..]);
        let mut out = std::io::stdout().lock();
        writeln!(out, "{}", payload.trim()).map_err(|e| e.to_string())?;
        out.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 注入时保留客户端已有配置，只替换 OpsPub 这一项；旧版键名会自动迁移。
fn merge_client_config(
    existing: &str,
    generated: &str,
    client: &str,
    format: &str,
) -> Result<String, AppError> {
    if format == "JSON" {
        let mut current: Value = serde_json::from_str(existing).map_err(|e| {
            AppError::InvalidInput(format!("无法解析 {client} 配置文件，请先修复 JSON：{e}"))
        })?;
        let generated_value: Value = serde_json::from_str(generated)?;
        let key = if client == "opencode" {
            "mcp"
        } else {
            "mcpServers"
        };
        let target = current
            .as_object_mut()
            .ok_or_else(|| AppError::InvalidInput("客户端配置根节点必须是 JSON 对象".into()))?;
        let generated_server = generated_value
            .get(key)
            .and_then(Value::as_object)
            .and_then(|servers| servers.get(MCP_CONFIG_KEY))
            .cloned()
            .ok_or_else(|| AppError::InvalidInput("生成的 MCP 配置缺少 opspub 节点".into()))?;
        let servers = target
            .entry(key)
            .or_insert_with(|| Value::Object(Default::default()));
        let servers = servers
            .as_object_mut()
            .ok_or_else(|| AppError::InvalidInput(format!("{key} 必须是 JSON 对象")))?;
        servers.insert(MCP_CONFIG_KEY.into(), generated_server);
        servers.remove(LEGACY_MCP_CONFIG_KEY);
        return serde_json::to_string_pretty(&current).map_err(AppError::from);
    }

    let section = format!("[mcp_servers.{MCP_CONFIG_KEY}]");
    let legacy_section = format!("[mcp_servers.{LEGACY_MCP_CONFIG_KEY}]");
    if existing
        .lines()
        .any(|line| line.trim() == section || line.trim() == legacy_section)
    {
        let mut output = Vec::new();
        let mut replacing = false;
        let mut inserted = false;
        for line in existing.lines() {
            if line.trim() == section || line.trim() == legacy_section {
                replacing = true;
                if !inserted {
                    output.extend(generated.lines().map(str::to_string));
                    inserted = true;
                }
                continue;
            }
            if replacing && line.starts_with('[') {
                replacing = false;
                output.push(line.to_string());
            } else if !replacing {
                output.push(line.to_string());
            }
        }
        if !inserted {
            output.extend(generated.lines().map(str::to_string));
        }
        return Ok(output.join("\n") + "\n");
    }
    Ok(format!("{}\n{}", existing.trim_end(), generated))
}

fn entry_for(id: i64) -> Result<Entry, AppError> {
    Entry::new(TOKEN_SERVICE, &format!("token-{id}"))
        .map_err(|e| AppError::Custom(format!("访问系统凭据库失败: {e}")))
}

fn render_config(
    app: &tauri::AppHandle,
    client: &str,
    secret: &str,
) -> Result<(PathBuf, String, String), AppError> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| AppError::Custom(format!("无法定位用户主目录: {e}")))?;
    let launcher = std::env::current_exe().unwrap_or_else(|_| {
        PathBuf::from(if cfg!(windows) {
            "OpsPub AI.exe"
        } else {
            "OpsPub AI"
        })
    });
    let port = McpService::runtime_status(&app.state::<crate::state::AppState>().mcp)?
        .map(|(port, _)| port)
        .ok_or_else(|| AppError::InvalidInput("请先启动 MCP HTTP 端点，再生成客户端配置".into()))?;
    let port_arg = port.to_string();
    let (path, format, content) = match client {
        "claude" => (home.join(".claude.json"), "JSON".into(), serde_json::json!({"mcpServers":{(MCP_CONFIG_KEY):{"command":launcher,"args":["--mcp-stdio","--token",secret,"--port",port_arg]}}}).to_string()),
        "cursor" => (home.join(".cursor").join("mcp.json"), "JSON".into(), serde_json::json!({"mcpServers":{(MCP_CONFIG_KEY):{"command":launcher,"args":["--mcp-stdio","--token",secret,"--port",port_arg]}}}).to_string()),
        "opencode" => (home.join(".config").join("opencode").join("opencode.json"), "JSON".into(), serde_json::json!({"mcp":{(MCP_CONFIG_KEY):{"type":"local","command":[launcher,"--mcp-stdio","--token",secret,"--port",port_arg]}}}).to_string()),
        "codex" => (home.join(".codex").join("config.toml"), "TOML".into(), format!("[mcp_servers.{MCP_CONFIG_KEY}]\ncommand = \"{}\"\nargs = [\"--mcp-stdio\", \"--token\", \"{}\", \"--port\", \"{}\"]\n", launcher.to_string_lossy().replace('\\', "\\\\"), secret, port)),
        _ => return Err(AppError::InvalidInput("不支持的 MCP 客户端类型".into())),
    };
    Ok((path, format, content))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_or_past_expiry_is_rejected() {
        assert!(normalize_expiry(Some("not-a-date")).is_err());
        assert!(normalize_expiry(Some("2000-01-01 00:00:00")).is_err());
        assert!(!token_is_current(&Some("not-a-date".into())));
        assert!(token_is_current(&None));
    }

    #[test]
    fn tool_scope_filters_tools() {
        let readonly = mcp_tools_for_scope("readonly");
        assert_eq!(readonly.as_array().map(Vec::len), Some(6));
        let one = mcp_tools_for_scope("disk_usage");
        assert_eq!(one.as_array().map(Vec::len), Some(1));
        assert_eq!(
            one.as_array()
                .and_then(|items| items.first())
                .and_then(|item| item.get("name"))
                .and_then(Value::as_str),
            Some("disk_usage")
        );
    }

    #[test]
    fn json_config_merge_preserves_other_servers() {
        let existing =
            r#"{"mcpServers":{"other":{"command":"other"},"opssentry":{"command":"old"}}}"#;
        let generated = r#"{"mcpServers":{"opspub":{"command":"new","args":["--port","18180"]}}}"#;
        let merged = merge_client_config(existing, generated, "claude", "JSON");
        assert!(merged.is_ok());
        let value: Value = serde_json::from_str(&merged.unwrap_or_default()).unwrap_or(Value::Null);
        assert_eq!(value["mcpServers"]["other"]["command"], "other");
        assert_eq!(value["mcpServers"][MCP_CONFIG_KEY]["command"], "new");
        assert!(value["mcpServers"].get(LEGACY_MCP_CONFIG_KEY).is_none());
    }

    #[test]
    fn toml_config_merge_migrates_legacy_key_once() {
        let existing = "[mcp_servers.opssentry]\ncommand = \"old\"\n\n[mcp_servers.other]\ncommand = \"keep\"\n\n[mcp_servers.opspub]\ncommand = \"stale\"\n";
        let generated = "[mcp_servers.opspub]\ncommand = \"new\"\n";
        let merged = merge_client_config(existing, generated, "codex", "TOML");

        assert!(merged.is_ok());
        let merged = merged.unwrap_or_default();
        assert_eq!(merged.matches("[mcp_servers.opspub]").count(), 1);
        assert!(!merged.contains("[mcp_servers.opssentry]"));
        assert!(merged.contains("[mcp_servers.other]\ncommand = \"keep\""));
        assert!(merged.contains("[mcp_servers.opspub]\ncommand = \"new\""));
    }

    #[test]
    fn server_scope_matches_only_explicit_aliases() {
        assert!(server_allowed("*", "any"));
        assert!(server_allowed("prod, staging", "staging"));
        assert!(!server_allowed("prod, staging", "dev"));
        assert!(!server_allowed("", "dev"));
    }
}
