// require_token 中间件 —— 校验 Authorization: Bearer <token>
//
// 无凭据时拒绝访问；已配对设备按数据库摘要鉴权，撤销即时生效。

use axum::{
    extract::{Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};

use crate::remote::context::RemoteContext;

pub async fn require_token(
    State(ctx): State<RemoteContext>,
    headers: HeaderMap,
    mut req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if !ctx.device_channel && ctx.failure_tracker.is_locked() {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    if ctx.device_channel {
        let provided = headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "));
        if let Some(id) = provided.and_then(|token| {
            crate::services::device_channel::authenticate(&ctx.app_handle, token)
                .ok()
                .flatten()
        }) {
            req.extensions_mut()
                .insert(crate::remote::context::DeviceIdentity(id));
            return Ok(next.run(req).await);
        }
        if ctx.failure_tracker.is_locked() {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        ctx.failure_tracker.record_failure();
        return Err(StatusCode::UNAUTHORIZED);
    }
    if let Some(expected) = ctx.token.as_deref() {
        let provided = headers
            .get("Authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.strip_prefix("Bearer "));

        match provided {
            Some(t) if t == expected => Ok(next.run(req).await),
            _ => {
                ctx.failure_tracker.record_failure();
                Err(StatusCode::UNAUTHORIZED)
            }
        }
    } else {
        // Missing configuration must never open protected endpoints.
        Err(StatusCode::UNAUTHORIZED)
    }
}

pub async fn same_origin(
    State(ctx): State<RemoteContext>,
    req: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if let Some(expected) = ctx.allowed_origin.as_deref() {
        if req
            .headers()
            .get("origin")
            .is_some_and(|origin| origin.to_str().ok() != Some(expected))
        {
            return Err(StatusCode::FORBIDDEN);
        }
        // Also reject DNS rebinding: only the concrete NIC address is a valid host.
        let expected_host = expected.strip_prefix("http://").unwrap_or(expected);
        if req.headers().get("host").and_then(|v| v.to_str().ok()) != Some(expected_host) {
            return Err(StatusCode::FORBIDDEN);
        }
    }
    let mut response = next.run(req).await;
    response.headers_mut().insert(
        "cache-control",
        "no-store"
            .parse()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    response.headers_mut().insert(
        "x-frame-options",
        "DENY"
            .parse()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    response.headers_mut().insert(
        "x-content-type-options",
        "nosniff"
            .parse()
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    Ok(response)
}
