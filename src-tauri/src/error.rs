use serde::Serialize;
use thiserror::Error;

/// 应用统一错误类型（内部使用）
#[derive(Debug, Error)]
pub enum AppError {
    #[error("IO 错误: {0}")]
    Io(#[from] std::io::Error),

    #[error("数据库错误: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("JSON 解析错误: {0}")]
    Json(#[from] serde_json::Error),

    #[error("未找到: {0}")]
    NotFound(String),

    #[error("参数无效: {0}")]
    InvalidInput(String),

    #[error("远程上传目标已存在：{0}")]
    SftpUploadConflict(String),

    #[error("{0}")]
    Custom(String),
}

/// 结构化错误响应（传递给前端）
///
/// 前端可通过 `code` 字段做精细错误处理：
/// ```typescript
/// try { await invoke("get_config", { key }); }
/// catch (e) {
///   const err = JSON.parse(e as string);
///   if (err.code === "NOT_FOUND") { /* 特定处理 */ }
/// }
/// ```
#[derive(Debug, Serialize)]
pub struct CommandError {
    /// 错误码（大写蛇形：IO_ERROR, DATABASE_ERROR, NOT_FOUND, INVALID_INPUT, INTERNAL）
    pub code: String,
    /// 用户友好的错误信息
    pub message: String,
}

impl From<AppError> for CommandError {
    fn from(err: AppError) -> Self {
        let code = match &err {
            AppError::Io(_) => "IO_ERROR",
            AppError::Database(_) => "DATABASE_ERROR",
            AppError::Json(_) => "JSON_ERROR",
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::InvalidInput(_) => "INVALID_INPUT",
            AppError::SftpUploadConflict(_) => "SFTP_UPLOAD_CONFLICT",
            AppError::Custom(_) => "INTERNAL",
        };
        CommandError {
            code: code.to_string(),
            message: err.to_string(),
        }
    }
}

/// 让 Tauri Command 能直接使用 CommandError 作为错误类型
/// Tauri 要求错误类型实现 Into<InvokeError>，序列化为 JSON 字符串传递给前端
impl From<CommandError> for String {
    fn from(err: CommandError) -> String {
        // 用 unwrap_or 而非 unwrap_or_else：兜底值是已有字段、不是惰性计算，
        // 包一层闭包对性能无益，反而触发 clippy::unnecessary_lazy_evaluations
        serde_json::to_string(&err).unwrap_or(err.message)
    }
}

/// 保留 AppError -> String 的转换（向后兼容）
impl From<AppError> for String {
    fn from(err: AppError) -> String {
        let cmd_err: CommandError = err.into();
        cmd_err.into()
    }
}
