use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterface {
    pub name: String,
    pub address: String,
    pub recommended: bool,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceChannelStatus {
    pub running: bool,
    pub pairing: bool,
    pub persistent: bool,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub base_url: Option<String>,
    pub paired_device_id: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingSession {
    pub session_id: String,
    pub base_url: String,
    pub pairing_url: String,
    pub expires_at: u64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairedDevice {
    pub id: String,
    pub name: String,
    pub created_at: u64,
    pub last_seen_at: Option<u64>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingRequest {
    pub session_id: String,
    pub secret: String,
    pub name: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingResult {
    pub device: PairedDevice,
    pub token: String,
}
