use tauri::Manager;

use crate::error::CommandError;
use crate::models::{
    DatabaseConnection, DatabaseConnectionInput, DatabaseProbeResult, DatabaseQueryRequest,
    DatabaseQueryResult, DatabaseTableItem, MongoCollectionItem, RedisKeyItem,
};
use crate::services::database_connection::DatabaseConnectionService;
use crate::state::AppState;

#[tauri::command]
pub fn list_database_connections(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DatabaseConnection>, CommandError> {
    DatabaseConnectionService::list(&state.db).map_err(CommandError::from)
}

#[tauri::command]
pub fn add_database_connection(
    state: tauri::State<'_, AppState>,
    input: DatabaseConnectionInput,
) -> Result<DatabaseConnection, CommandError> {
    DatabaseConnectionService::create(&state.db, input).map_err(CommandError::from)
}

#[tauri::command]
pub fn update_database_connection(
    state: tauri::State<'_, AppState>,
    id: i64,
    input: DatabaseConnectionInput,
) -> Result<DatabaseConnection, CommandError> {
    DatabaseConnectionService::update(&state.db, id, input).map_err(CommandError::from)
}

#[tauri::command]
pub fn delete_database_connection(
    state: tauri::State<'_, AppState>,
    id: i64,
) -> Result<bool, CommandError> {
    DatabaseConnectionService::delete(&state.db, id).map_err(CommandError::from)
}

#[tauri::command]
pub async fn test_database_connection(
    app: tauri::AppHandle,
    input: DatabaseConnectionInput,
) -> Result<DatabaseProbeResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::test_draft(&state.db, input).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("数据库测试任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn test_saved_database_connection(
    app: tauri::AppHandle,
    id: i64,
) -> Result<DatabaseProbeResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::test_saved(&state.db, id).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("数据库测试任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn execute_database_query(
    app: tauri::AppHandle,
    request: DatabaseQueryRequest,
) -> Result<DatabaseQueryResult, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::execute_query(&state.db, request).map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("数据库查询任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn list_sql_databases(
    app: tauri::AppHandle,
    connection_id: i64,
) -> Result<Vec<String>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::list_sql_databases(&state.db, connection_id)
            .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("数据库列表查询任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn list_database_tables(
    app: tauri::AppHandle,
    connection_id: i64,
    database_name: Option<String>,
) -> Result<Vec<DatabaseTableItem>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::list_database_tables(
            &state.db,
            connection_id,
            database_name.as_deref(),
        )
        .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("数据库结构查询任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn list_redis_keys(
    app: tauri::AppHandle,
    connection_id: i64,
    pattern: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<RedisKeyItem>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::list_redis_keys(
            &state.db,
            connection_id,
            pattern.as_deref(),
            limit.unwrap_or(200),
        )
        .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("Redis 键查询任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn get_redis_value(
    app: tauri::AppHandle,
    connection_id: i64,
    key: String,
) -> Result<String, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::get_redis_value(&state.db, connection_id, &key)
            .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("Redis 值查询任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn list_mongo_collections(
    app: tauri::AppHandle,
    connection_id: i64,
) -> Result<Vec<MongoCollectionItem>, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::list_mongo_collections(&state.db, connection_id)
            .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("MongoDB 集合查询任务异常结束: {error}"),
    })?
}

#[tauri::command]
pub async fn query_mongo_collection(
    app: tauri::AppHandle,
    connection_id: i64,
    collection: String,
    limit: Option<u32>,
) -> Result<String, CommandError> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        DatabaseConnectionService::query_mongo_collection(
            &state.db,
            connection_id,
            &collection,
            limit.unwrap_or(100),
        )
        .map_err(CommandError::from)
    })
    .await
    .map_err(|error| CommandError {
        code: "INTERNAL".into(),
        message: format!("MongoDB 文档查询任务异常结束: {error}"),
    })?
}
