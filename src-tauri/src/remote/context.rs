// RemoteContext — 通过 axum State 注入到每个 handler
//
// 持有 AppHandle（让 handler 能访问 AppState/DB/事件总线等）+ 可选 Token
// + 共享的 FailureTracker（鉴权防暴力）。

use std::sync::Arc;

use crate::remote::failure_tracker::FailureTracker;

#[derive(Clone)]
pub struct DeviceIdentity(pub String);

#[derive(Clone)]
pub struct RemoteContext {
    pub app_handle: tauri::AppHandle,
    pub token: Option<String>,
    pub failure_tracker: Arc<FailureTracker>,
    pub device_channel: bool,
    pub allowed_origin: Option<String>,
}

impl RemoteContext {
    pub fn new(app_handle: tauri::AppHandle, token: Option<String>) -> Self {
        Self {
            app_handle,
            token,
            failure_tracker: Arc::new(FailureTracker::default()),
            device_channel: false,
            allowed_origin: None,
        }
    }
}
