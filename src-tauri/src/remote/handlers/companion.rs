use crate::{
    error::AppError,
    models::CopilotRequest,
    remote::context::{DeviceIdentity, RemoteContext},
    services::{
        copilot::CopilotService,
        device_channel::{self, PairingRequest},
        mobile_companion,
    },
    state::AppState,
};
use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::Html,
    Extension, Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::Manager;

type HttpError = (StatusCode, Json<Value>);
fn error(err: AppError) -> HttpError {
    (
        StatusCode::BAD_REQUEST,
        Json(json!({"message":err.to_string()})),
    )
}
async fn run<T: serde::Serialize + Send + 'static>(
    operation: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<Json<T>, HttpError> {
    tokio::task::spawn_blocking(operation)
        .await
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"message":"后台任务异常结束，请在电脑端查看日志"})),
            )
        })?
        .map(Json)
        .map_err(error)
}
pub async fn page() -> Html<&'static str> {
    Html(include_str!("../companion.html"))
}
pub async fn pair(
    State(ctx): State<RemoteContext>,
    Json(request): Json<PairingRequest>,
) -> Result<Json<device_channel::PairingResult>, HttpError> {
    if ctx.failure_tracker.is_locked() {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({"message":"尝试过于频繁，请稍后重试"})),
        ));
    }
    let tracker = ctx.failure_tracker.clone();
    let result = run(move || {
        device_channel::complete_pairing(
            &ctx.app_handle.state::<AppState>().device_channel,
            &ctx.app_handle.state::<AppState>().db,
            request,
        )
    })
    .await;
    if result.is_err() {
        tracker.record_failure();
    }
    result
}
pub async fn bootstrap(State(ctx): State<RemoteContext>) -> Result<Json<Value>, HttpError> {
    run(move || mobile_companion::bootstrap(&ctx.app_handle)).await
}
pub async fn approvals(
    State(ctx): State<RemoteContext>,
) -> Result<Json<Vec<crate::models::AiApprovalDetail>>, HttpError> {
    run(move || CopilotService::list_approval_details(&ctx.app_handle)).await
}
pub async fn lock(
    State(ctx): State<RemoteContext>,
    Extension(device): Extension<DeviceIdentity>,
) -> Result<Json<Value>, HttpError> {
    run(move || mobile_companion::lock(&ctx.app_handle, &device.0)).await
}
#[derive(Deserialize)]
pub struct Decision {
    id: i64,
    approve: bool,
}
pub async fn decide(
    State(ctx): State<RemoteContext>,
    Extension(device): Extension<DeviceIdentity>,
    Json(input): Json<Decision>,
) -> Result<Json<Value>, HttpError> {
    let manager = ctx.app_handle.state::<AppState>().device_channel.clone();
    let _guard = manager.assistant_operation.try_lock().map_err(|_| {
        (
            StatusCode::CONFLICT,
            Json(json!({"message":"已有 AI 或审批任务执行中，请稍后重试"})),
        )
    })?;
    run(move || mobile_companion::decide(ctx.app_handle, &device.0, input.id, input.approve)).await
}
pub async fn chat(
    State(ctx): State<RemoteContext>,
    Extension(device): Extension<DeviceIdentity>,
    Json(input): Json<CopilotRequest>,
) -> Result<Json<Value>, HttpError> {
    let manager = ctx.app_handle.state::<AppState>().device_channel.clone();
    let _guard = manager.assistant_operation.try_lock().map_err(|_| {
        (
            StatusCode::CONFLICT,
            Json(json!({"message":"已有 AI 或审批任务执行中，请稍后重试"})),
        )
    })?;
    run(move || mobile_companion::chat(ctx.app_handle, &device.0, input)).await
}
#[derive(Deserialize)]
pub struct Search {
    #[serde(default)]
    q: String,
}
pub async fn knowledge(Query(query): Query<Search>) -> Result<Json<Value>, HttpError> {
    mobile_companion::knowledge(&query.q)
        .map(Json)
        .map_err(error)
}
