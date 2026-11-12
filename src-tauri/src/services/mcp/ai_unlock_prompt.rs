use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;
use tauri::{Emitter, Manager};

use super::McpAuth;
use crate::state::AppState;

const EVENT: &str = "mcp-ai-unlock-requested";
const PROMPT_COOLDOWN: Duration = Duration::from_secs(15);

#[derive(Default)]
pub(super) struct UnlockPromptGate {
    last_prompt: Mutex<Option<Instant>>,
}

impl UnlockPromptGate {
    fn reserve(&self, now: Instant) -> bool {
        let Ok(mut last) = self.last_prompt.lock() else {
            return false;
        };
        // 多个客户端同时轮询时也只唤起一次窗口，避免请求造成弹窗轰炸。
        if last.is_some_and(|previous| now.saturating_duration_since(previous) < PROMPT_COOLDOWN) {
            return false;
        }
        *last = Some(now);
        true
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct UnlockRequest<'a> {
    source_client: &'a str,
    token_id: i64,
    tool: &'a str,
}

fn is_locked_failure(response: &Value) -> bool {
    response.pointer("/result/isError").and_then(Value::as_bool) == Some(true)
        && response
            .pointer("/result/structuredContent/code")
            .and_then(Value::as_str)
            == Some("AI_LOCKED")
}

pub(super) fn notify_if_locked(
    app: &tauri::AppHandle,
    auth: &McpAuth,
    tool: &str,
    response: &Value,
) {
    // 只接受后端生成的结构化锁定错误，远端日志或错误文本中的字样不能触发授权提示。
    if !is_locked_failure(response) {
        return;
    }
    let state = app.state::<AppState>();
    if !state.db.get_ai_lock().is_ok_and(|lock| lock.locked) {
        return;
    }
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if !state.mcp.unlock_prompt.reserve(Instant::now()) {
        return;
    }
    // 仅发送已认证的来源与工具标识，不转发请求参数、命令或真实 Token。
    let request = UnlockRequest {
        source_client: &auth.client,
        token_id: auth.token_id,
        tool,
    };
    if let Err(error) = app.emit_to("main", EVENT, &request) {
        log::warn!("MCP 开启 AI 提示发送失败: {error}");
        return;
    }
    if let Err(error) = window
        .show()
        .and_then(|_| window.unminimize())
        .and_then(|_| window.set_focus())
    {
        log::warn!("MCP 开启 AI 提示窗口唤起失败: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_structured_lock_failures_request_unlock() {
        let locked = super::super::tool_failure(
            Value::from(1),
            "AI 操作已锁定，请在 OpsPub 顶栏开启 AI 操作",
        );
        assert!(is_locked_failure(&locked));
        let remote_output = serde_json::json!({"result": {
            "isError": false,
            "content": [{"type":"text", "text":"AI_LOCKED: 请解锁"}],
            "structuredContent": {"code":"AI_LOCKED"}
        }});
        assert!(!is_locked_failure(&remote_output));
        assert!(!is_locked_failure(&super::super::tool_failure(
            Value::from(2),
            "该服务器对 AI 禁用"
        )));
        assert!(!is_locked_failure(&super::super::rpc_error(
            Value::from(3),
            -32003,
            "令牌不允许调用此工具"
        )));
    }

    #[test]
    fn repeated_requests_are_throttled_across_clients() {
        let gate = UnlockPromptGate::default();
        let now = Instant::now();
        assert!(gate.reserve(now));
        assert!(!gate.reserve(now));
        assert!(!gate.reserve(now + Duration::from_secs(14)));
        assert!(gate.reserve(now + PROMPT_COOLDOWN));
    }

    #[test]
    fn unlock_event_contains_only_source_metadata() {
        let event = UnlockRequest {
            source_client: "codex",
            token_id: 2,
            tool: "system_info",
        };
        let payload = serde_json::to_value(&event).expect("event");
        assert_eq!(
            payload,
            serde_json::json!({"sourceClient":"codex", "tokenId":2, "tool":"system_info"})
        );
    }
}
