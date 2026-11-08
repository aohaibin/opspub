use axum::Json;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceChannelResponse {
    pub authenticated: bool,
    pub version: &'static str,
    pub service: &'static str,
}

pub async fn status() -> Json<DeviceChannelResponse> {
    Json(DeviceChannelResponse {
        authenticated: true,
        version: env!("CARGO_PKG_VERSION"),
        service: "opspub-device-channel",
    })
}
