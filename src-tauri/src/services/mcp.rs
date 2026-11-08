use std::io::{BufRead, BufReader, Read, Write};
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
    CopilotRequest, McpClientConfig, McpClientState, McpStatus, McpToken, McpTokenCreated,
    McpTokenInput, McpTokenTest, McpToolDefinition,
};
use crate::services::copilot::CopilotService;

const TOKEN_SERVICE: &str = "com.opsentr.yunwei.mcp";
const TOKEN_TIME_FORMAT: &str = "%Y-%m-%d %H:%M:%S";
#[cfg(test)]
const MCP_CONFIG_KEY: &str = "opspub";
#[cfg(test)]
const LEGACY_MCP_CONFIG_KEY: &str = "opssentry";
const PROTOCOL_VERSION: &str = "2025-03-26";
mod client_config;

pub struct McpService;

const DEFAULT_HTTP_PORT: u16 = 18180;

#[derive(Default)]
pub struct McpServerManager {
    runtime: Mutex<Option<McpRuntime>>,
    last_error: Mutex<Option<String>>,
    last_test: Mutex<Option<(String, bool)>>,
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
            if let Some(runtime) = guard.as_ref().filter(|runtime| !runtime.join.is_finished()) {
                return Ok(runtime.port);
            }
        }
        let port = requested_port.unwrap_or(saved_port(&app.state::<crate::state::AppState>().db)?);
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
        if let Some(runtime) = guard.as_ref().filter(|runtime| !runtime.join.is_finished()) {
            return Ok(runtime.port);
        }
        app.state::<crate::state::AppState>()
            .db
            .set_config("mcp.http_port", &port.to_string())?;
        if let Ok(mut test) = manager.last_test.lock() {
            *test = None;
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
            // 正在运行的远程探针不能让“停止端点”永久等待；停止后 stdio 同时不可用。
            if tokio::time::timeout(Duration::from_secs(3), &mut runtime.join)
                .await
                .is_err()
            {
                runtime.join.abort();
            }
            if let Ok(mut test) = manager.last_test.lock() {
                *test = None;
            }
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
            .filter(|runtime| !runtime.join.is_finished())
            .map(|runtime| (runtime.port, runtime.started_at.clone())))
    }

    pub fn status(app: &tauri::AppHandle) -> Result<McpStatus, AppError> {
        let manager = &app.state::<crate::state::AppState>().mcp;
        let runtime = McpService::runtime_status(manager)?;
        let (http_port, http_started_at, http_running) = runtime
            .map(|(port, started)| (port, Some(started), true))
            .unwrap_or((
                saved_port(&app.state::<crate::state::AppState>().db)?,
                None,
                false,
            ));
        let endpoint_error = if http_running {
            None
        } else {
            manager
                .last_error
                .lock()
                .map_err(|e| AppError::Custom(e.to_string()))?
                .clone()
        };
        let last_test = manager
            .last_test
            .lock()
            .map_err(|_| AppError::Custom("无法读取测试状态".into()))?
            .clone();
        Ok(McpStatus {
            protocol_version: PROTOCOL_VERSION.into(),
            version: app.package_info().version.to_string(),
            stdio_path: stdio_launcher_path(app),
            http_url: format!("http://127.0.0.1:{http_port}/mcp"),
            http_port,
            http_running,
            stdio_ready: http_running && last_test.as_ref().map_or(true, |(_, ok)| *ok),
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
            last_tested_at: last_test.as_ref().map(|(at, _)| at.clone()),
            message: if let Some((_, ok)) = last_test {
                if ok {
                    "本机端点健康检查通过；可继续测试令牌授权".into()
                } else {
                    "端点健康检查失败，请检查端口占用或重新启动".into()
                }
            } else if http_running {
                "本地 MCP HTTP 服务已启动".into()
            } else {
                "本地 MCP HTTP 服务未启动；可点击启动端点".into()
            },
        })
    }

    pub fn test(app: &tauri::AppHandle) -> Result<McpStatus, AppError> {
        let mut status = Self::status(app)?;
        let http_running = status.http_running && probe_http_endpoint(status.http_port);
        status.stdio_ready = http_running;
        status.last_tested_at = Some(chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string());
        if let Ok(mut test) = app.state::<crate::state::AppState>().mcp.last_test.lock() {
            *test = Some((
                status.last_tested_at.clone().unwrap_or_default(),
                http_running,
            ));
        }
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
        if name.chars().count() > 80 || name.chars().any(char::is_control) {
            return Err(AppError::InvalidInput(
                "令牌名称最多 80 字且不能包含控制字符".into(),
            ));
        }
        let (server_scope, tool_scope) =
            normalize_scopes(db, &input.server_scope, &input.tool_scope)?;
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
            &server_scope,
            &tool_scope,
            expires_at.as_deref(),
            &hint,
        )?;
        let saved = entry_for(id).and_then(|entry| {
            entry
                .set_password(&secret)
                .map_err(|_| AppError::Custom("系统凭据库拒绝保存 MCP 令牌".into()))?;
            let check = entry
                .get_password()
                .map_err(|_| AppError::Custom("无法回读 MCP 令牌".into()))?;
            if check != secret {
                return Err(AppError::Custom("MCP 令牌写入校验失败".into()));
            }
            Ok(())
        });
        if let Err(error) = saved {
            if let Ok(entry) = entry_for(id) {
                let _ = entry.delete_credential();
            }
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
        let _secret = entry_for(token_id)?
            .get_password()
            .map_err(|e| AppError::Custom(format!("读取 MCP 令牌失败: {e}")))?;
        let home = app
            .path()
            .home_dir()
            .map_err(|_| AppError::Custom("无法定位用户主目录".into()))?;
        let launcher = std::env::current_exe()?;
        let port = Self::status(app)?.http_port;
        client_config::render(&home, &launcher, port, token_id, client)
    }

    pub fn inject_config(
        db: &Database,
        app: &tauri::AppHandle,
        token_id: i64,
        client: &str,
    ) -> Result<McpClientConfig, AppError> {
        let mut config = Self::client_config(db, app, token_id, client)?;
        client_config::write(&mut config)?;
        Ok(config)
    }

    pub fn clients(app: &tauri::AppHandle) -> Result<Vec<McpClientState>, AppError> {
        let home = app
            .path()
            .home_dir()
            .map_err(|_| AppError::Custom("无法定位用户主目录".into()))?;
        let tokens = Self::list_tokens(&app.state::<crate::state::AppState>().db)?;
        Ok(client_config::inspect(
            &home,
            &std::env::current_exe()?,
            Self::status(app)?.http_port,
            &tokens,
        ))
    }

    pub fn tools() -> Result<Vec<McpToolDefinition>, AppError> {
        Ok(serde_json::from_value(mcp_tools())?)
    }

    /// 只验证本机 MCP 握手和工具授权，不连接用户的远程服务器。
    pub fn test_token(app: &tauri::AppHandle, token_id: i64) -> Result<McpTokenTest, AppError> {
        let token = Self::list_tokens(&app.state::<crate::state::AppState>().db)?
            .into_iter()
            .find(|t| t.id == token_id && t.status == "active")
            .ok_or_else(|| AppError::InvalidInput("令牌不存在、已撤销或已过期".into()))?;
        let status = Self::status(app)?;
        if !status.http_running {
            return Err(AppError::InvalidInput("请先启动端点，再测试令牌".into()));
        }
        let secret = entry_for(token_id)?
            .get_password()
            .map_err(|_| AppError::Custom("系统凭据库中没有此令牌，请重新创建".into()))?;
        let started = std::time::Instant::now();
        let client = reqwest::blocking::Client::builder()
            .no_proxy()
            .timeout(Duration::from_secs(5))
            .build()
            .map_err(|_| AppError::Custom("无法创建 MCP 测试连接".into()))?;
        for (id, method) in [(1, "initialize"), (2, "tools/list")] {
            let response: Value = client.post(&status.http_url).bearer_auth(&secret)
                .json(&serde_json::json!({"jsonrpc":"2.0","id":id,"method":method,"params":{"protocolVersion":PROTOCOL_VERSION,"capabilities":{},"clientInfo":{"name":"OpsPub self-test","version":env!("CARGO_PKG_VERSION")}}}))
                .send().map_err(|_| AppError::Custom("MCP 端点未响应，请检查状态".into()))?
                .error_for_status().map_err(|_| AppError::Custom("MCP 拒绝此令牌，请检查有效期和凭据".into()))?.json().map_err(|_| AppError::Custom("MCP 响应不是有效 JSON".into()))?;
            if response.get("error").is_some() || response.get("result").is_none() {
                return Err(AppError::Custom("MCP 握手或工具发现返回错误".into()));
            }
            if method == "tools/list" {
                let names = response["result"]["tools"]
                    .as_array()
                    .ok_or_else(|| AppError::Custom("工具发现响应无效".into()))?
                    .iter()
                    .filter_map(|v| v["name"].as_str().map(str::to_owned))
                    .collect::<Vec<_>>();
                let expected = mcp_tools_for_scope(&token.tool_scope);
                if expected != response["result"]["tools"] {
                    return Err(AppError::Custom("工具范围与令牌授权不一致".into()));
                }
                return Ok(McpTokenTest {
                    tools: names,
                    latency_ms: started.elapsed().as_millis() as u64,
                    tested_at: chrono::Local::now().format(TOKEN_TIME_FORMAT).to_string(),
                    message: "认证、协议握手和工具范围检查通过；未执行远程命令".into(),
                });
            }
        }
        Err(AppError::Custom("MCP 测试未完成".into()))
    }
}

fn saved_port(db: &Database) -> Result<u16, AppError> {
    Ok(db
        .get_config("mcp.http_port")?
        .and_then(|s| s.parse::<u16>().ok())
        .filter(|p| *p > 0)
        .unwrap_or(DEFAULT_HTTP_PORT))
}

fn normalize_scopes(
    db: &Database,
    servers: &str,
    tools: &str,
) -> Result<(String, String), AppError> {
    fn split(value: &str) -> Vec<&str> {
        let mut items = value
            .split(',')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>();
        items.sort_unstable();
        items.dedup();
        items
    }
    let servers = split(servers);
    let tools = split(tools);
    if servers.is_empty() || tools.is_empty() {
        return Err(AppError::InvalidInput("请选择授权服务器和工具范围".into()));
    }
    let known = db.get_all_servers()?;
    if servers != ["*"]
        && servers.iter().any(|s| {
            *s == "*"
                || !known
                    .iter()
                    .any(|server| server.alias == *s && server.protocol != "rdp")
        })
    {
        return Err(AppError::InvalidInput(
            "服务器范围包含不存在的别名或仅远程桌面条目，请重新选择".into(),
        ));
    }
    let definitions = mcp_tools();
    if tools != ["readonly"]
        && tools != ["*"]
        && tools.iter().any(|name| {
            !definitions
                .as_array()
                .is_some_and(|items| items.iter().any(|t| t["name"].as_str() == Some(name)))
        })
    {
        return Err(AppError::InvalidInput(
            "工具范围包含未知名称，请从工具目录选择".into(),
        ));
    }
    Ok((servers.join(","), tools.join(",")))
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
    // MCP 的凭据读取与 SSH 探针均为阻塞调用，不能占住 HTTP 运行时线程。
    if !valid_origin(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let response = match tokio::task::spawn_blocking(move || {
        let auth = authenticate_http(&state.app, &headers)?;
        Ok::<_, StatusCode>(handle_rpc(&state.app, Some(auth), request))
    })
    .await
    {
        Ok(Ok(response)) => response,
        Ok(Err(status)) => {
            return (status, Json(serde_json::json!({ "error": "unauthorized" }))).into_response()
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };
    if response.is_null() {
        return StatusCode::ACCEPTED.into_response();
    }
    Json(response).into_response()
}

fn valid_origin(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get("origin") else {
        return true;
    };
    origin
        .to_str()
        .ok()
        .and_then(|s| reqwest::Url::parse(s).ok())
        .is_some_and(|url| {
            url.scheme() == "http"
                && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))
        })
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
    if request.get("jsonrpc").and_then(Value::as_str) != Some("2.0")
        || !request.get("method").is_some_and(Value::is_string)
    {
        return rpc_error(id, -32600, "无效的 JSON-RPC 2.0 请求");
    }
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
            let version = if request["params"]["protocolVersion"] == "2024-11-05" {
                "2024-11-05"
            } else {
                PROTOCOL_VERSION
            };
            serde_json::json!({
            "jsonrpc": "2.0", "id": id,
            "result": { "protocolVersion": version, "capabilities": { "tools": {} }, "serverInfo": { "name": "OpsPub MCP", "version": app.package_info().version.to_string() } }
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
                if let Err(error) = guard_remote_target(&state.db, &server) {
                    return rpc_error(id, -32003, &error.to_string());
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
            provider: Some("local-safe-tools".into()),
            model_profile_id: None,
            skill_ids: Vec::new(),
            skill_context: None,
            history: Vec::new(),
        },
    ) {
        Ok(response) => {
            let failed = response.tool_calls.is_empty()
                || response
                    .tool_calls
                    .iter()
                    .any(|call| call.status != "success");
            // 失败时把策略/凭据错误交还客户端，避免只给出笼统的“未获得结果”。
            let mut text = response.reply;
            for call in response
                .tool_calls
                .iter()
                .filter(|call| call.status != "success")
            {
                text.push_str(&format!("\n{}: {}", call.status, call.output));
            }
            serde_json::json!({ "jsonrpc":"2.0", "id":id, "result":{"content":[{"type":"text","text":text}],"isError":failed } })
        }
        Err(error) => rpc_error(id, -32000, &error.to_string()),
    }
}

fn guard_remote_target(db: &Database, server: &crate::models::Server) -> Result<(), AppError> {
    if server.protocol == "rdp" || server.os_type != "linux" {
        return Err(AppError::InvalidInput(
            "当前 MCP 远程探针仅支持 Linux SSH 服务器".into(),
        ));
    }
    if db.get_ai_lock()?.locked {
        return Err(AppError::InvalidInput(
            "AI 操作已锁定，请在 OpsPub 顶栏开启 AI 操作".into(),
        ));
    }
    match server.ai_policy.as_str() {
        "disabled" | "denied" => Err(AppError::InvalidInput("该服务器对 AI 禁用".into())),
        // 旧的聊天只读分支会直接执行，外部 MCP 不能因此绕过审批档位。
        "approval" | "strict" => Err(AppError::InvalidInput(
            "此服务器要求逐次审批；MCP 只读探针尚未接入审批流，未执行。请在 OpsPub 终端中人工查询"
                .into(),
        )),
        "readonly" | "allowlist" | "trusted" | "autonomous" => Ok(()),
        _ => Err(AppError::InvalidInput(
            "无法识别服务器 AI 策略，未执行".into(),
        )),
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
        .filter(|server| server.protocol != "rdp" && server_allowed(scope, &server.alias))
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
pub fn run_stdio_with_token_id(id: i64, port: u16) -> Result<(), String> {
    let token = entry_for(id)
        .map_err(|_| "系统凭据库不可用")?
        .get_password()
        .map_err(|_| "未找到 MCP 令牌，请在 OpsPub 中重新创建")?;
    run_stdio_proxy(&token, port)
}

pub fn run_stdio_proxy(token: &str, port: u16) -> Result<(), String> {
    let stdin = std::io::stdin();
    let stdout = std::io::stdout();
    run_stdio_session(token, port, BufReader::new(stdin.lock()), stdout.lock())
}

fn run_stdio_session(
    token: &str,
    port: u16,
    mut reader: impl BufRead,
    mut out: impl Write,
) -> Result<(), String> {
    if token.is_empty() || token.chars().any(char::is_control) {
        return Err("MCP 令牌无效".into());
    }
    // stdio 模式不会运行 Tauri Builder，必须在创建 HTTP 客户端前同样初始化 TLS provider。
    crate::install_rustls_provider();
    let client = reqwest::blocking::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    loop {
        let mut line = String::new();
        let count = reader
            .by_ref()
            .take(1_048_577)
            .read_line(&mut line)
            .map_err(|e| e.to_string())?;
        if count == 0 {
            break;
        }
        if count > 1_048_576 {
            return Err("MCP 请求超过 1 MiB 限制".into());
        }
        if line.trim().is_empty() {
            continue;
        }
        let response = client
            .post(format!("http://127.0.0.1:{port}/mcp"))
            .bearer_auth(token)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .body(line)
            .send()
            .map_err(|_| "无法连接 OpsPub MCP，请在应用中启动端点")?;
        if response.status() == reqwest::StatusCode::ACCEPTED
            || response.status() == reqwest::StatusCode::NO_CONTENT
        {
            continue;
        }
        if !response.status().is_success() {
            return Err(format!(
                "MCP HTTP {}，请在 OpsPub 中检查令牌和端点",
                response.status().as_u16()
            ));
        }
        let payload: Value = response.json().map_err(|_| "MCP 响应不是有效 JSON")?;
        writeln!(out, "{}", payload).map_err(|e| e.to_string())?;
        out.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 注入时保留客户端已有配置，只替换 OpsPub 这一项；旧版键名会自动迁移。
#[cfg(test)]
fn merge_client_config(
    existing: &str,
    generated: &str,
    client: &str,
    format: &str,
) -> Result<String, AppError> {
    client_config::merge(existing, generated, client, format)
}

fn entry_for(id: i64) -> Result<Entry, AppError> {
    Entry::new(TOKEN_SERVICE, &format!("token-{id}"))
        .map_err(|e| AppError::Custom(format!("访问系统凭据库失败: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stdio_transport_handles_chunked_json_and_silent_notifications() {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listen");
        let port = listener.local_addr().expect("address").port();
        let server = std::thread::spawn(move || {
            for index in 0..3 {
                let (stream, _) = listener.accept().expect("accept");
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .expect("timeout");
                let mut reader = BufReader::new(stream);
                let mut length = 0;
                let mut authenticated = false;
                loop {
                    let mut header = String::new();
                    reader.read_line(&mut header).expect("header");
                    if header == "\r\n" {
                        break;
                    }
                    let lower = header.to_ascii_lowercase();
                    if let Some(value) = lower.strip_prefix("content-length:") {
                        length = value.trim().parse::<usize>().expect("length");
                    }
                    if lower.trim() == "authorization: bearer test-only-token" {
                        authenticated = true;
                    }
                }
                assert!(authenticated);
                let mut body = vec![0; length];
                reader.read_exact(&mut body).expect("body");
                let request: Value = serde_json::from_slice(&body).expect("json");
                if index == 1 {
                    assert_eq!(request["method"], "notifications/initialized");
                    reader.get_mut().write_all(b"HTTP/1.1 202 Accepted\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").expect("notification");
                } else {
                    let response = serde_json::json!({"jsonrpc":"2.0","id":request["id"],"result":{"ok":true}}).to_string();
                    write!(reader.get_mut(), "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n{:x}\r\n{}\r\n0\r\n\r\n", response.len(), response).expect("response");
                }
            }
        });
        let input = "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\"}\n{\"jsonrpc\":\"2.0\",\"method\":\"notifications/initialized\"}\n{\"jsonrpc\":\"2.0\",\"id\":2,\"method\":\"tools/list\"}\n";
        let mut output = Vec::new();
        run_stdio_session("test-only-token", port, input.as_bytes(), &mut output).expect("proxy");
        server.join().expect("server");
        let text = String::from_utf8(output).expect("utf8");
        let responses = text
            .lines()
            .map(|line| serde_json::from_str::<Value>(line).expect("response"))
            .collect::<Vec<_>>();
        assert_eq!(responses.len(), 2);
        assert_eq!(responses[0]["id"], 1);
        assert_eq!(responses[1]["id"], 2);
    }

    #[test]
    fn stdio_rejects_header_injection_before_connecting() {
        assert!(run_stdio_session("bad\r\nheader", 1, "".as_bytes(), Vec::new()).is_err());
    }

    fn sample_server(db: &Database) -> crate::models::Server {
        let id = db
            .add_server(
                "mcp-test",
                "192.0.2.1",
                22,
                "test",
                "password",
                "[]",
                "test",
                "readonly",
                "linux",
                "",
                false,
                false,
                None,
                "",
            )
            .expect("server");
        db.get_server_by_id(id).expect("load").expect("exists")
    }

    #[test]
    fn scopes_validate_aliases_and_actual_tools() {
        let db = Database::init(":memory:").expect("db");
        sample_server(&db);
        assert_eq!(
            normalize_scopes(
                &db,
                " mcp-test, mcp-test ",
                "system_info,disk_usage,disk_usage"
            )
            .expect("scope"),
            ("mcp-test".into(), "disk_usage,system_info".into())
        );
        for (servers, tools) in [
            ("", "readonly"),
            ("missing", "readonly"),
            ("*,mcp-test", "readonly"),
            ("*", "ssh_exec"),
            ("*", "readonly,system_info"),
            ("*", ""),
        ] {
            assert!(
                normalize_scopes(&db, servers, tools).is_err(),
                "{servers} {tools}"
            );
        }
        assert!(normalize_scopes(&db, "*", "readonly").is_ok());
        assert!(!tool_allowed("disk_usage", "system_info"));
    }

    #[test]
    fn port_and_token_metadata_survive_reload_with_expiry_and_revocation() {
        let dir = tempfile::tempdir().expect("dir");
        let path = dir.path().join("mcp.db");
        let db = Database::init(path.to_str().expect("path")).expect("db");
        assert_eq!(saved_port(&db).expect("port"), 18180);
        db.set_config("mcp.http_port", "18220").expect("port");
        let active = db
            .add_mcp_token("active", "custom", "*", "readonly", None, "masked")
            .expect("token");
        db.add_mcp_token(
            "expired",
            "custom",
            "*",
            "readonly",
            Some("2000-01-01 00:00:00"),
            "masked",
        )
        .expect("token");
        drop(db);
        let db = Database::init(path.to_str().expect("path")).expect("reload");
        assert_eq!(saved_port(&db).expect("port"), 18220);
        assert!(McpService::list_tokens(&db)
            .expect("tokens")
            .iter()
            .any(|t| t.status == "expired"));
        db.revoke_mcp_token(active).expect("revoke");
        assert!(McpService::list_tokens(&db)
            .expect("tokens")
            .iter()
            .all(|t| t.status != "active"));
    }

    #[test]
    fn mcp_remote_gate_does_not_bypass_lock_or_approval_policy() {
        let db = Database::init(":memory:").expect("db");
        let mut server = sample_server(&db);
        assert!(guard_remote_target(&db, &server).is_err());
        db.set_ai_lock_until(Some(-1)).expect("unlock");
        assert!(guard_remote_target(&db, &server).is_ok());
        for policy in ["disabled", "denied", "approval", "strict", "unknown"] {
            server.ai_policy = policy.into();
            assert!(guard_remote_target(&db, &server).is_err(), "{policy}");
        }
        server.ai_policy = "readonly".into();
        server.os_type = "windows".into();
        assert!(guard_remote_target(&db, &server).is_err());
    }

    #[test]
    fn http_origin_rejects_external_sites_and_malformed_origins() {
        let mut headers = HeaderMap::new();
        assert!(valid_origin(&headers));
        for origin in [
            "http://localhost:1420",
            "http://127.0.0.1:1420",
            "http://[::1]:1420",
        ] {
            headers.insert("origin", origin.parse().expect("header"));
            assert!(valid_origin(&headers), "{origin}");
        }
        for origin in [
            "https://example.com",
            "http://localhost.evil.test",
            "null",
            "file:///tmp/index.html",
        ] {
            headers.insert("origin", origin.parse().expect("header"));
            assert!(!valid_origin(&headers), "{origin}");
        }
    }

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
