use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Instant;

use keyring::{Entry, Error as KeyringError};
use mysql::prelude::Queryable;
use mysql::{OptsBuilder, SslOpts, Value as MysqlValue};
use rusqlite::{types::ValueRef, Connection as SqliteConnection};
use ssh2::ErrorCode as SshErrorCode;
use ssh2::Session;
use tiberius::{AuthMethod, Client as SqlServerClient, Config as SqlServerConfig, EncryptionLevel};
use tokio::net::TcpStream as TokioTcpStream;
use tokio_util::compat::TokioAsyncWriteCompatExt;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    DatabaseConnection, DatabaseConnectionInput, DatabaseProbeResult, DatabaseQueryRequest,
    DatabaseQueryResult, DatabaseTableItem, MongoCollectionItem, RedisKeyItem,
};
use crate::models::{TerminalOpenRequest, WorkbenchCommandResult};
use crate::services::server::ServerService;

const DATABASE_CREDENTIAL_SERVICE: &str = "com.opsentr.yunwei.database";

/// Rustls 依赖同时包含多个 provider 时，连接建立前必须显式选择一个。
/// 该调用是幂等的：应用启动时已完成初始化时直接返回，不影响其他 TLS 客户端。
fn ensure_rustls_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct DatabaseCredential {
    password: String,
}

pub struct DatabaseConnectionService;

impl DatabaseConnectionService {
    pub fn list(db: &Database) -> Result<Vec<DatabaseConnection>, AppError> {
        db.get_all_database_connections()
    }

    pub fn create(
        db: &Database,
        input: DatabaseConnectionInput,
    ) -> Result<DatabaseConnection, AppError> {
        validate_input(&input)?;
        let id = db.add_database_connection(
            input.name.trim(),
            input.server_id,
            &normalize_engine(&input.engine),
            input.host.trim(),
            input.port,
            input.username.trim(),
            input.database_name.trim(),
            input.db_index,
            input.is_prod_protect,
            input.prod_databases.trim(),
            input.prod_db_list.trim(),
            input.ssh_tunnel,
            input.ai_tier.trim(),
        )?;

        if let Some(password) = input.password.as_deref().filter(|value| !value.is_empty()) {
            if let Err(error) = save_password(id, password) {
                let _ = db.delete_database_connection(id);
                return Err(error);
            }
        }

        db.get_database_connection(id)?
            .ok_or_else(|| AppError::NotFound(format!("数据库连接 {} 创建后不存在", id)))
    }

    pub fn update(
        db: &Database,
        id: i64,
        input: DatabaseConnectionInput,
    ) -> Result<DatabaseConnection, AppError> {
        validate_input(&input)?;
        let updated = db.update_database_connection(
            id,
            input.name.trim(),
            input.server_id,
            &normalize_engine(&input.engine),
            input.host.trim(),
            input.port,
            input.username.trim(),
            input.database_name.trim(),
            input.db_index,
            input.is_prod_protect,
            input.prod_databases.trim(),
            input.prod_db_list.trim(),
            input.ssh_tunnel,
            input.ai_tier.trim(),
        )?;
        if !updated {
            return Err(AppError::NotFound(format!(
                "database connection {id} does not exist"
            )));
        }
        if let Some(password) = input.password.as_deref().filter(|value| !value.is_empty()) {
            save_password(id, password)?;
        }
        db.get_database_connection(id)?.ok_or_else(|| {
            AppError::NotFound(format!("database connection {id} disappeared after update"))
        })
    }

    pub fn delete(db: &Database, id: i64) -> Result<bool, AppError> {
        let deleted = db.delete_database_connection(id)?;
        if deleted {
            delete_password(id)?;
        }
        Ok(deleted)
    }

    pub fn test_draft(
        db: &Database,
        input: DatabaseConnectionInput,
    ) -> Result<DatabaseProbeResult, AppError> {
        validate_input(&input)?;
        let started = Instant::now();
        let record = input_to_record(input.clone());
        let password = match input.password.filter(|value| !value.is_empty()) {
            Some(password) => Some(password),
            None => match input.connection_id {
                Some(id) => get_password(id)?,
                None => None,
            },
        };
        let result = run_probe(db, &record, password.as_deref());
        Ok(DatabaseProbeResult {
            ok: result.is_ok(),
            message: result
                .map(|output| output.trim().to_string())
                .unwrap_or_else(|error| error.to_string()),
            latency_ms: Some(started.elapsed().as_millis() as u64),
        })
    }

    pub fn test_saved(db: &Database, id: i64) -> Result<DatabaseProbeResult, AppError> {
        let connection = get_connection(db, id)?;
        let started = Instant::now();
        let result = run_probe(db, &connection, get_password(id)?.as_deref());
        Ok(DatabaseProbeResult {
            ok: result.is_ok(),
            message: result
                .map(|output| output.trim().to_string())
                .unwrap_or_else(|error| error.to_string()),
            latency_ms: Some(started.elapsed().as_millis() as u64),
        })
    }

    pub fn execute_query(
        db: &Database,
        request: DatabaseQueryRequest,
    ) -> Result<DatabaseQueryResult, AppError> {
        let sql = request.sql.trim();
        if sql.is_empty() {
            return Err(AppError::InvalidInput("SQL 语句不能为空".into()));
        }
        if sql.len() > 1_000_000 {
            return Err(AppError::InvalidInput("SQL 语句不能超过 1 MB".into()));
        }
        let connection = get_connection(db, request.connection_id)?;
        if !is_sql_engine(&connection.engine) {
            return Err(AppError::InvalidInput("当前连接不是 SQL 数据库".into()));
        }
        let protected_database = if is_sqlite_engine(&connection.engine) {
            Some("main")
        } else {
            request.database_name.as_deref()
        };
        if connection.is_prod_protect
            && is_protected_database(&connection, protected_database)
            && is_mutating_sql(sql)
        {
            return Err(AppError::InvalidInput(
                "当前数据库启用了生产保护，仅允许执行查询类 SQL（SELECT/SHOW/DESCRIBE/EXPLAIN）"
                    .into(),
            ));
        }
        let password = get_password(connection.id)?;
        if is_sqlite_engine(&connection.engine) {
            let started = Instant::now();
            let (columns, rows, affected_rows) = execute_sqlite_query(&connection, sql)?;
            return Ok(DatabaseQueryResult {
                columns,
                rows,
                affected_rows,
                time_ms: started.elapsed().as_millis() as u64,
            });
        }
        if is_mysql_engine(&connection.engine) {
            let started = Instant::now();
            let (columns, rows, affected_rows) = execute_mysql_query(
                db,
                &connection,
                password.as_deref(),
                sql,
                request.database_name.as_deref(),
            )?;
            return Ok(DatabaseQueryResult {
                columns,
                rows,
                affected_rows,
                time_ms: started.elapsed().as_millis() as u64,
            });
        }
        if is_oracle_engine(&connection.engine) || is_sqlserver_engine(&connection.engine) {
            let started = Instant::now();
            let (columns, rows, affected_rows) = execute_native_sql_query(
                db,
                &connection,
                password.as_deref(),
                sql,
                request.database_name.as_deref(),
            )?;
            return Ok(DatabaseQueryResult {
                columns,
                rows,
                affected_rows,
                time_ms: started.elapsed().as_millis() as u64,
            });
        }
        let command = build_sql_command(
            &connection,
            password.as_deref(),
            sql,
            request.database_name.as_deref(),
        )?;
        let started = Instant::now();
        let output = execute_remote(db, connection.server_id, command)?;
        if output.exit_code != 0 {
            return Err(AppError::Custom(if output.stderr.trim().is_empty() {
                format!("数据库查询失败（退出码 {}）", output.exit_code)
            } else {
                output.stderr.trim().to_string()
            }));
        }
        let (columns, rows) = parse_tabular_output(&output.stdout, sql);
        Ok(DatabaseQueryResult {
            affected_rows: rows.len(),
            columns,
            rows,
            time_ms: started.elapsed().as_millis() as u64,
        })
    }

    /// 列出 SQL 数据库中的库名。数据库名来自远端数据库服务，不再使用前端演示数据。
    pub fn list_sql_databases(db: &Database, id: i64) -> Result<Vec<String>, AppError> {
        let connection = get_connection(db, id)?;
        if !is_sql_engine(&connection.engine) {
            return Err(AppError::InvalidInput("当前连接不是 SQL 数据库".into()));
        }
        let sql = match normalize_engine(&connection.engine).as_str() {
            "sqlite" => return Ok(vec!["main".to_string()]),
            "oracle" => {
                let service_name = connection.database_name.trim();
                return Ok(if service_name.is_empty() {
                    Vec::new()
                } else {
                    vec![service_name.to_string()]
                });
            }
            "postgresql" => {
                "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
            }
            "sqlserver" => "SELECT name FROM sys.databases ORDER BY name",
            _ => "SHOW DATABASES",
        };
        if is_mysql_engine(&connection.engine) {
            let (_, rows, _) =
                execute_mysql_query(db, &connection, get_password(id)?.as_deref(), sql, None)?;
            return Ok(rows
                .into_iter()
                .filter_map(|row| row.into_iter().next())
                .filter(|value| !value.trim().is_empty())
                .collect());
        }
        if is_sqlserver_engine(&connection.engine) {
            let (_, rows, _) =
                execute_native_sql_query(db, &connection, get_password(id)?.as_deref(), sql, None)?;
            return Ok(rows
                .into_iter()
                .filter_map(|row| row.first().cloned())
                .collect());
        }
        let command = build_sql_command(&connection, get_password(id)?.as_deref(), sql, None)?;
        let output = execute_remote(db, connection.server_id, command)?;
        if output.exit_code != 0 {
            return Err(AppError::Custom(database_command_error(
                &output.stderr,
                output.exit_code,
            )));
        }
        Ok(parse_single_column_output(&output.stdout))
    }

    /// 获取当前数据库的表/视图列表，供结构面板展示。
    pub fn list_database_tables(
        db: &Database,
        id: i64,
        database_name: Option<&str>,
    ) -> Result<Vec<DatabaseTableItem>, AppError> {
        let connection = get_connection(db, id)?;
        if !is_sql_engine(&connection.engine) {
            return Err(AppError::InvalidInput("当前连接不是 SQL 数据库".into()));
        }
        let engine = normalize_engine(&connection.engine);
        let sql = match engine.as_str() {
            "sqlite" => "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
            "postgresql" => "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_name",
            "mysql" | "mariadb" => "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
            "oracle" => "SELECT table_name, 'TABLE' FROM user_tables UNION ALL SELECT view_name, 'VIEW' FROM user_views ORDER BY 1",
            "sqlserver" => "SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME",
            "clickhouse" => "SHOW TABLES",
            _ => return Err(AppError::InvalidInput("当前连接不支持结构查询".into())),
        };
        if is_sqlite_engine(&connection.engine) {
            let (_, rows, _) = execute_sqlite_query(&connection, sql)?;
            return Ok(rows
                .into_iter()
                .filter_map(|row| {
                    let name = row.first()?.trim();
                    if name.is_empty() {
                        return None;
                    }
                    Some(DatabaseTableItem {
                        name: name.to_string(),
                        table_type: row.get(1).cloned().unwrap_or_else(|| "table".to_string()),
                    })
                })
                .collect());
        }
        if is_mysql_engine(&connection.engine) {
            let (_, rows, _) = execute_mysql_query(
                db,
                &connection,
                get_password(id)?.as_deref(),
                sql,
                database_name,
            )?;
            return Ok(rows
                .into_iter()
                .filter_map(|row| {
                    let name = row.first()?.trim();
                    if name.is_empty() {
                        return None;
                    }
                    Some(DatabaseTableItem {
                        name: name.to_string(),
                        table_type: row.get(1).cloned().unwrap_or_else(|| "TABLE".to_string()),
                    })
                })
                .collect());
        }
        if is_oracle_engine(&connection.engine) || is_sqlserver_engine(&connection.engine) {
            let (_, rows, _) = execute_native_sql_query(
                db,
                &connection,
                get_password(id)?.as_deref(),
                sql,
                database_name,
            )?;
            return Ok(rows
                .into_iter()
                .filter_map(|row| {
                    let name = row.first()?.trim();
                    if name.is_empty() {
                        return None;
                    }
                    Some(DatabaseTableItem {
                        name: name.to_string(),
                        table_type: row.get(1).cloned().unwrap_or_else(|| "TABLE".to_string()),
                    })
                })
                .collect());
        }
        let command = build_sql_command(
            &connection,
            get_password(id)?.as_deref(),
            sql,
            database_name,
        )?;
        let output = execute_remote(db, connection.server_id, command)?;
        if output.exit_code != 0 {
            return Err(AppError::Custom(database_command_error(
                &output.stderr,
                output.exit_code,
            )));
        }
        let (columns, rows) = parse_tabular_output(&output.stdout, sql);
        let name_index = columns
            .iter()
            .position(|column| {
                column.eq_ignore_ascii_case("table_name") || column.eq_ignore_ascii_case("name")
            })
            .unwrap_or(0);
        let type_index = columns
            .iter()
            .position(|column| column.eq_ignore_ascii_case("table_type"))
            .unwrap_or(usize::MAX);
        Ok(rows
            .into_iter()
            .filter_map(|row| {
                let name = row.get(name_index)?.trim();
                if name.is_empty() {
                    return None;
                }
                Some(DatabaseTableItem {
                    name: name.to_string(),
                    table_type: row
                        .get(type_index)
                        .map(|value| value.to_string())
                        .unwrap_or_else(|| "TABLE".to_string()),
                })
            })
            .collect())
    }

    pub fn list_redis_keys(
        db: &Database,
        id: i64,
        pattern: Option<&str>,
        limit: u32,
    ) -> Result<Vec<RedisKeyItem>, AppError> {
        let connection = get_connection(db, id)?;
        if normalize_engine(&connection.engine) != "redis" {
            return Err(AppError::InvalidInput("当前连接不是 Redis".into()));
        }
        let limit = limit.clamp(1, 500);
        let pattern = pattern.unwrap_or("*").trim();
        let password = get_password(id)?;
        let auth = redis_auth(password.as_deref());
        let command = format!(
            "redis-cli {auth} -h {host} -p {port} -n {db} --scan --pattern {pattern} | head -n {limit}",
            auth = auth,
            host = shell_quote(&connection.host),
            port = connection.port,
            db = connection.db_index,
            pattern = shell_quote(pattern),
            limit = limit,
        );
        let output = execute_remote(db, connection.server_id, command)?;
        if output.exit_code != 0 {
            return Err(AppError::Custom(output.stderr.trim().to_string()));
        }
        Ok(output
            .stdout
            .lines()
            .filter(|key| !key.trim().is_empty())
            .map(|key| RedisKeyItem {
                key: key.to_string(),
                key_type: "unknown".to_string(),
            })
            .collect())
    }

    pub fn get_redis_value(db: &Database, id: i64, key: &str) -> Result<String, AppError> {
        if key.trim().is_empty() {
            return Err(AppError::InvalidInput("Redis 键不能为空".into()));
        }
        let connection = get_connection(db, id)?;
        if normalize_engine(&connection.engine) != "redis" {
            return Err(AppError::InvalidInput("当前连接不是 Redis".into()));
        }
        let auth = redis_auth(get_password(id)?.as_deref());
        let command = format!(
            "redis-cli {auth} -h {host} -p {port} -n {db} --raw GET {key}",
            auth = auth,
            host = shell_quote(&connection.host),
            port = connection.port,
            db = connection.db_index,
            key = shell_quote(key),
        );
        let output = execute_remote(db, connection.server_id, command)?;
        if output.exit_code != 0 {
            return Err(AppError::Custom(output.stderr.trim().to_string()));
        }
        Ok(output.stdout)
    }

    pub fn list_mongo_collections(
        db: &Database,
        id: i64,
    ) -> Result<Vec<MongoCollectionItem>, AppError> {
        let connection = get_connection(db, id)?;
        if normalize_engine(&connection.engine) != "mongodb" {
            return Err(AppError::InvalidInput("当前连接不是 MongoDB".into()));
        }
        let command = mongo_command(
            &connection,
            get_password(id)?.as_deref(),
            "db.getCollectionNames().join('\\n')",
        )?;
        let output = execute_remote(db, connection.server_id, command)?;
        if output.exit_code != 0 {
            return Err(AppError::Custom(output.stderr.trim().to_string()));
        }
        Ok(output
            .stdout
            .lines()
            .filter(|name| !name.trim().is_empty())
            .map(|name| MongoCollectionItem {
                name: name.trim().to_string(),
                document_count: None,
            })
            .collect())
    }

    pub fn query_mongo_collection(
        db: &Database,
        id: i64,
        collection: &str,
        limit: u32,
    ) -> Result<String, AppError> {
        if !collection
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || "_.$-".contains(ch))
        {
            return Err(AppError::InvalidInput(
                "MongoDB 集合名称包含非法字符".into(),
            ));
        }
        let connection = get_connection(db, id)?;
        if normalize_engine(&connection.engine) != "mongodb" {
            return Err(AppError::InvalidInput("当前连接不是 MongoDB".into()));
        }
        let limit = limit.clamp(1, 500);
        let expression = format!(
            "JSON.stringify(db.getCollection({}).find({{}}).limit({}).toArray())",
            js_quote(collection),
            limit
        );
        let command = mongo_command(&connection, get_password(id)?.as_deref(), &expression)?;
        let output = execute_remote(db, connection.server_id, command)?;
        if output.exit_code != 0 {
            return Err(AppError::Custom(output.stderr.trim().to_string()));
        }
        Ok(output.stdout.trim().to_string())
    }
}

fn validate_input(input: &DatabaseConnectionInput) -> Result<(), AppError> {
    if input.name.trim().is_empty() {
        return Err(AppError::InvalidInput("连接名称不能为空".into()));
    }
    let engine = normalize_engine(&input.engine);
    if is_sqlite_engine(&engine) {
        if input.host.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "SQLite 数据库文件路径不能为空".into(),
            ));
        }
        if input.server_id != 0 {
            return Err(AppError::InvalidInput(
                "SQLite 连接仅支持本机数据库文件".into(),
            ));
        }
        if input.port != 0 {
            return Err(AppError::InvalidInput("SQLite 不需要填写数据库端口".into()));
        }
        return Ok(());
    }
    if is_oracle_engine(&engine) && input.database_name.trim().is_empty() {
        return Err(AppError::InvalidInput("Oracle 服务名不能为空".into()));
    }
    if input.host.trim().is_empty() {
        return Err(AppError::InvalidInput("数据库主机地址不能为空".into()));
    }
    if input.server_id <= 0 {
        return Err(AppError::InvalidInput("请选择用于 SSH 访问的服务器".into()));
    }
    if !(1..=65535).contains(&input.port) {
        return Err(AppError::InvalidInput(
            "数据库端口必须在 1-65535 之间".into(),
        ));
    }
    if ![
        "sqlite",
        "mysql",
        "mariadb",
        "postgresql",
        "oracle",
        "sqlserver",
        "redis",
        "mongodb",
        "clickhouse",
    ]
    .contains(&engine.as_str())
    {
        return Err(AppError::InvalidInput(format!(
            "暂不支持 {} 数据库引擎",
            input.engine
        )));
    }
    Ok(())
}

fn normalize_engine(engine: &str) -> String {
    match engine.trim().to_ascii_lowercase().as_str() {
        "mysql" => "mysql".into(),
        "mariadb" => "mariadb".into(),
        "postgres" | "postgresql" => "postgresql".into(),
        "microsoft sql server" | "mssql" | "sql_server" | "sql-server" => "sqlserver".into(),
        "mongo" | "mongodb" => "mongodb".into(),
        "redis" => "redis".into(),
        "clickhouse" => "clickhouse".into(),
        other => other.to_string(),
    }
}

fn is_sql_engine(engine: &str) -> bool {
    matches!(
        normalize_engine(engine).as_str(),
        "sqlite" | "mysql" | "mariadb" | "postgresql" | "oracle" | "sqlserver" | "clickhouse"
    )
}

fn is_sqlite_engine(engine: &str) -> bool {
    normalize_engine(engine) == "sqlite"
}

fn is_mysql_engine(engine: &str) -> bool {
    matches!(normalize_engine(engine).as_str(), "mysql" | "mariadb")
}

fn is_oracle_engine(engine: &str) -> bool {
    normalize_engine(engine) == "oracle"
}

fn is_sqlserver_engine(engine: &str) -> bool {
    normalize_engine(engine) == "sqlserver"
}

fn is_protected_database(connection: &DatabaseConnection, database_name: Option<&str>) -> bool {
    let configured = connection
        .prod_databases
        .split([',', '\n', ';'])
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();
    configured.is_empty()
        || database_name
            .or_else(|| Some(connection.database_name.as_str()))
            .is_some_and(|database| {
                configured
                    .iter()
                    .any(|item| item.eq_ignore_ascii_case(database))
            })
}

fn is_mutating_sql(sql: &str) -> bool {
    let statement = sql.trim_start().to_ascii_lowercase();
    [
        "insert ",
        "update ",
        "delete ",
        "replace ",
        "alter ",
        "drop ",
        "truncate ",
        "create ",
        "grant ",
        "revoke ",
        "call ",
        "do ",
    ]
    .iter()
    .any(|prefix| statement.starts_with(prefix))
}

fn input_to_record(input: DatabaseConnectionInput) -> DatabaseConnection {
    DatabaseConnection {
        id: 0,
        name: input.name,
        server_id: input.server_id,
        engine: normalize_engine(&input.engine),
        host: input.host,
        port: input.port,
        username: input.username,
        database_name: input.database_name,
        db_index: input.db_index,
        is_prod_protect: input.is_prod_protect,
        prod_databases: input.prod_databases,
        prod_db_list: input.prod_db_list,
        ssh_tunnel: input.ssh_tunnel,
        ai_tier: input.ai_tier,
        created_at: String::new(),
        updated_at: String::new(),
    }
}

fn get_connection(db: &Database, id: i64) -> Result<DatabaseConnection, AppError> {
    db.get_database_connection(id)?
        .ok_or_else(|| AppError::NotFound(format!("数据库连接 {} 不存在", id)))
}

fn entry_for(id: i64) -> Result<Entry, AppError> {
    Entry::new(DATABASE_CREDENTIAL_SERVICE, &format!("database-{id}"))
        .map_err(|error| AppError::Custom(format!("访问数据库系统凭据失败: {error}")))
}

fn save_password(id: i64, password: &str) -> Result<(), AppError> {
    let payload = serde_json::to_string(&DatabaseCredential {
        password: password.into(),
    })?;
    entry_for(id)?
        .set_password(&payload)
        .map_err(|error| AppError::Custom(format!("保存数据库凭据失败: {error}")))
}

fn get_password(id: i64) -> Result<Option<String>, AppError> {
    match entry_for(id)?.get_password() {
        Ok(payload) => Ok(Some(
            serde_json::from_str::<DatabaseCredential>(&payload)?.password,
        )),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(AppError::Custom(format!("读取数据库凭据失败: {error}"))),
    }
}

fn delete_password(id: i64) -> Result<(), AppError> {
    match entry_for(id)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(AppError::Custom(format!("删除数据库凭据失败: {error}"))),
    }
}

fn run_probe(
    db: &Database,
    connection: &DatabaseConnection,
    password: Option<&str>,
) -> Result<String, AppError> {
    // 测试连接也可能从独立后台线程进入，不能只依赖 Tauri 启动钩子。
    ensure_rustls_provider();
    if is_sqlite_engine(&connection.engine) {
        execute_sqlite_query(connection, "SELECT 1")?;
        return Ok("SQLite 数据库文件连接成功".to_string());
    }
    if is_mysql_engine(&connection.engine) {
        execute_mysql_query(db, connection, password, "SELECT 1", None)?;
        return Ok("MySQL/MariaDB 连接成功".to_string());
    }
    if is_oracle_engine(&connection.engine) || is_sqlserver_engine(&connection.engine) {
        execute_native_sql_query(db, connection, password, "SELECT 1", None)?;
        return Ok(format!(
            "{} 连接成功",
            display_database_engine(&connection.engine)
        ));
    }
    let command = match normalize_engine(&connection.engine).as_str() {
        "redis" => format!(
            "redis-cli {} -h {} -p {} -n {} PING",
            redis_auth(password),
            shell_quote(&connection.host),
            connection.port,
            connection.db_index
        ),
        "mongodb" => mongo_command(connection, password, "db.runCommand({ ping: 1 }).ok")?,
        _ => build_sql_command(connection, password, "SELECT 1", None)?,
    };
    let output = execute_remote(db, connection.server_id, command)?;
    if output.exit_code != 0 {
        return Err(AppError::Custom(output.stderr.trim().to_string()));
    }
    Ok(output.stdout)
}

fn build_sql_command(
    connection: &DatabaseConnection,
    password: Option<&str>,
    sql: &str,
    database_name: Option<&str>,
) -> Result<String, AppError> {
    let engine = normalize_engine(&connection.engine);
    let database = database_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&connection.database_name);
    let host = shell_quote(&connection.host);
    let user = shell_quote(&connection.username);
    let sql = shell_quote(sql);
    let password = password.unwrap_or_default();
    match engine.as_str() {
        "sqlite" => Err(AppError::Custom(
            "SQLite 必须使用应用内置驱动连接".into(),
        )),
        "mysql" | "mariadb" => Err(AppError::Custom(
            "MySQL/MariaDB 必须使用应用内置驱动连接".into(),
        )),
        "oracle" | "sqlserver" => Err(AppError::Custom(
            "Oracle/SQL Server 必须使用应用内置驱动连接".into(),
        )),
        "postgresql" => Ok(format!(
            "PGPASSWORD={} psql -A -F '\t' -P footer=off -h {} -p {} -U {} {} -c {}",
            shell_quote(password), host, connection.port, user,
            if database.is_empty() { shell_quote("postgres") } else { shell_quote(database) }, sql
        )),
        "clickhouse" => Ok(format!(
            "clickhouse-client --host {} --port {} --user {} --password {} --format TSVWithNames --query {}",
            host, connection.port, user, shell_quote(password), sql
        )),
        _ => Err(AppError::InvalidInput("当前连接不支持 SQL 查询".into())),
    }
}

fn mongo_command(
    connection: &DatabaseConnection,
    password: Option<&str>,
    expression: &str,
) -> Result<String, AppError> {
    let mut command = format!(
        "mongosh --quiet --host {}:{}",
        shell_quote(&connection.host),
        connection.port
    );
    if !connection.username.trim().is_empty() {
        command.push_str(&format!(
            " --username {}",
            shell_quote(&connection.username)
        ));
    }
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        command.push_str(&format!(" --password {}", shell_quote(password)));
    }
    if !connection.database_name.trim().is_empty() {
        command.push_str(&format!(
            " --authenticationDatabase {}",
            shell_quote(&connection.database_name)
        ));
    }
    command.push_str(&format!(" --eval {}", shell_quote(expression)));
    Ok(command)
}

fn redis_auth(password: Option<&str>) -> String {
    password
        .filter(|value| !value.is_empty())
        .map(|value| format!("--pass {}", shell_quote(value)))
        .unwrap_or_default()
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn display_database_engine(engine: &str) -> &'static str {
    match normalize_engine(engine).as_str() {
        "oracle" => "Oracle",
        "sqlserver" => "SQL Server",
        _ => "SQL 数据库",
    }
}

fn execute_native_sql_query(
    db: &Database,
    connection: &DatabaseConnection,
    password: Option<&str>,
    sql: &str,
    database_name: Option<&str>,
) -> Result<(Vec<String>, Vec<Vec<String>>, usize), AppError> {
    if is_oracle_engine(&connection.engine) {
        execute_oracle_query(db, connection, password, sql)
    } else {
        execute_sqlserver_query(db, connection, password, sql, database_name)
    }
}

fn execute_oracle_query(
    db: &Database,
    connection: &DatabaseConnection,
    password: Option<&str>,
    sql: &str,
) -> Result<(Vec<String>, Vec<Vec<String>>, usize), AppError> {
    ensure_rustls_provider();
    let password = password.unwrap_or_default().to_string();
    let tunnel = if connection.ssh_tunnel {
        Some(open_database_tunnel(db, connection)?)
    } else {
        None
    };
    let host = if tunnel.is_some() {
        "127.0.0.1"
    } else {
        &connection.host
    };
    let port = tunnel
        .as_ref()
        .map(|value| value.port)
        .unwrap_or(connection.port as u16);
    let service_name = connection.database_name.clone();
    let username = connection.username.clone();
    let sql = sql.to_string();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| AppError::Custom(format!("初始化 Oracle 驱动失败: {error}")))?;
    let result = runtime.block_on(async move {
        let config = oracle_rs::Config::new(host, port, service_name, username, password);
        let client = oracle_rs::Connection::connect_with_config(config)
            .await
            .map_err(|error| format!("Oracle 连接失败: {error}"))?;
        let mut result = client
            .query(&sql, &[])
            .await
            .map_err(|error| format!("Oracle 查询失败: {error}"))?;
        let columns = result
            .columns
            .iter()
            .map(|column| column.name.clone())
            .collect();
        while result.has_more_rows {
            let next = client
                .fetch_more(result.cursor_id, &result.columns, 100)
                .await
                .map_err(|error| format!("读取 Oracle 后续结果失败: {error}"))?;
            result.rows.extend(next.rows);
            result.has_more_rows = next.has_more_rows;
        }
        let rows = result
            .rows
            .iter()
            .map(|row| {
                row.values()
                    .iter()
                    .map(|value| {
                        if value.is_null() {
                            String::new()
                        } else {
                            value.to_string()
                        }
                    })
                    .collect()
            })
            .collect::<Vec<Vec<String>>>();
        let affected = result.rows_affected as usize;
        let _ = client.close().await;
        Ok::<_, String>((columns, rows, affected))
    });
    drop(tunnel);
    result.map_err(AppError::Custom)
}

fn execute_sqlserver_query(
    db: &Database,
    connection: &DatabaseConnection,
    password: Option<&str>,
    sql: &str,
    database_name: Option<&str>,
) -> Result<(Vec<String>, Vec<Vec<String>>, usize), AppError> {
    ensure_rustls_provider();
    let password = password.unwrap_or_default().to_string();
    let tunnel = if connection.ssh_tunnel {
        Some(open_database_tunnel(db, connection)?)
    } else {
        None
    };
    let host = if tunnel.is_some() {
        "127.0.0.1"
    } else {
        &connection.host
    };
    let port = tunnel
        .as_ref()
        .map(|value| value.port)
        .unwrap_or(connection.port as u16);
    let database = database_name
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(&connection.database_name)
        .to_string();
    let username = connection.username.clone();
    let sql = sql.to_string();
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| AppError::Custom(format!("初始化 SQL Server 驱动失败: {error}")))?;
    let result = runtime.block_on(async move {
        let mut config = SqlServerConfig::new();
        config.host(host);
        config.port(port);
        config.authentication(AuthMethod::sql_server(username, password));
        config.encryption(EncryptionLevel::Required);
        config.trust_webpki_roots();
        if !database.is_empty() {
            config.database(database);
        }
        let address = config.get_addr();
        let tcp = TokioTcpStream::connect(address)
            .await
            .map_err(|error| format!("SQL Server 网络连接失败: {error}"))?;
        tcp.set_nodelay(true)
            .map_err(|error| format!("SQL Server 网络配置失败: {error}"))?;
        let mut client = SqlServerClient::connect(config, tcp.compat_write())
            .await
            .map_err(|error| format!("SQL Server 登录失败: {error}"))?;
        if !sql_returns_rows(&sql) {
            let affected = client
                .execute(sql, &[])
                .await
                .map_err(|error| format!("SQL Server 执行失败: {error}"))?
                .total() as usize;
            return Ok((Vec::new(), Vec::new(), affected));
        }
        let mut stream = client
            .simple_query(sql)
            .await
            .map_err(|error| format!("SQL Server 查询失败: {error}"))?;
        let columns: Vec<String> = stream
            .columns()
            .await
            .map_err(|error| format!("读取 SQL Server 列信息失败: {error}"))?
            .unwrap_or_default()
            .iter()
            .map(|column| column.name().to_string())
            .collect();
        let rows = stream
            .into_first_result()
            .await
            .map_err(|error| format!("读取 SQL Server 查询结果失败: {error}"))?;
        let mut values = Vec::with_capacity(rows.len());
        for row in &rows {
            let mut row_values = Vec::with_capacity(columns.len());
            for index in 0..columns.len() {
                let value = row
                    .get_column_data(index)
                    .map_err(|error| format!("读取 SQL Server 字段失败: {error}"))?;
                row_values.push(sqlserver_value_to_string(value));
            }
            values.push(row_values);
        }
        Ok::<_, String>((columns, values, rows.len()))
    });
    drop(tunnel);
    result.map_err(AppError::Custom)
}

fn sqlserver_value_to_string(value: &tiberius::ColumnData<'_>) -> String {
    use tiberius::ColumnData;
    match value {
        ColumnData::U8(Some(value)) => value.to_string(),
        ColumnData::I16(Some(value)) => value.to_string(),
        ColumnData::I32(Some(value)) => value.to_string(),
        ColumnData::I64(Some(value)) => value.to_string(),
        ColumnData::F32(Some(value)) => value.to_string(),
        ColumnData::F64(Some(value)) => value.to_string(),
        ColumnData::Bit(Some(value)) => value.to_string(),
        ColumnData::String(Some(value)) => value.to_string(),
        ColumnData::Guid(Some(value)) => value.to_string(),
        ColumnData::Binary(Some(value)) => value.iter().map(|byte| format!("{byte:02x}")).collect(),
        ColumnData::Numeric(Some(value)) => value.to_string(),
        ColumnData::Xml(Some(value)) => format!("{value:?}"),
        ColumnData::DateTime(Some(value)) => format!("{value:?}"),
        ColumnData::SmallDateTime(Some(value)) => format!("{value:?}"),
        ColumnData::Time(Some(value)) => format!("{value:?}"),
        ColumnData::Date(Some(value)) => format!("{value:?}"),
        ColumnData::DateTime2(Some(value)) => format!("{value:?}"),
        ColumnData::DateTimeOffset(Some(value)) => format!("{value:?}"),
        _ => String::new(),
    }
}

fn sql_returns_rows(sql: &str) -> bool {
    let statement = sql.trim_start().to_ascii_lowercase();
    [
        "select ",
        "select\n",
        "with ",
        "with\n",
        "show ",
        "describe ",
        "desc ",
        "explain ",
        "exec ",
        "execute ",
    ]
    .iter()
    .any(|prefix| statement.starts_with(prefix))
}

fn execute_mysql_query(
    db: &Database,
    connection: &DatabaseConnection,
    password: Option<&str>,
    sql: &str,
    database_name: Option<&str>,
) -> Result<(Vec<String>, Vec<Vec<String>>, usize), AppError> {
    ensure_rustls_provider();
    let mut tunnel = if connection.ssh_tunnel {
        Some(open_database_tunnel(db, connection)?)
    } else {
        None
    };
    let mysql_host = if tunnel.is_some() {
        "127.0.0.1".to_string()
    } else {
        connection.host.clone()
    };
    let mysql_port = tunnel
        .as_ref()
        .map(|value| value.port)
        .unwrap_or(connection.port as u16);
    let mut builder = OptsBuilder::new()
        .ip_or_hostname(Some(mysql_host.clone()))
        .tcp_port(mysql_port)
        .user(Some(connection.username.clone()))
        .db_name(
            database_name
                .filter(|value| !value.trim().is_empty())
                .or_else(|| {
                    (!connection.database_name.trim().is_empty())
                        .then_some(&connection.database_name)
                })
                .map(str::to_owned),
        )
        .prefer_socket(false)
        .ssl_opts(Some(
            SslOpts::default()
                .with_danger_skip_domain_validation(tunnel.is_some())
                // SSH 隧道下服务端通常使用私有 CA 或自签证书；SSH 主机指纹已先行验证，
                // 隧道保护了 TLS 握手链路，因此只对隧道模式跳过数据库证书链验证。
                .with_danger_accept_invalid_certs(tunnel.is_some()),
        ))
        .tcp_connect_timeout(Some(std::time::Duration::from_secs(10)));
    if let Some(password) = password.filter(|value| !value.is_empty()) {
        builder = builder.pass(Some(password.to_string()));
    }

    let mode = if tunnel.is_some() {
        "SSH 隧道"
    } else {
        "直连"
    };
    let mut conn = match mysql::Conn::new(builder) {
        Ok(connection) => connection,
        Err(error) => {
            let tunnel_failure = tunnel
                .as_mut()
                .and_then(MysqlTunnel::join_and_failure)
                .map(|failure| format!("；SSH 转发细节：{failure}"))
                .unwrap_or_default();
            return Err(AppError::Custom(format!(
                "MySQL/MariaDB 连接失败（{} {}:{}，{}，已启用 TLS）: {error}{tunnel_failure}",
                mode, mysql_host, mysql_port, connection.username
            )));
        }
    };
    let mut result = conn
        .query_iter(sql)
        .map_err(|error| AppError::Custom(format!("MySQL/MariaDB 查询失败: {error}")))?;
    let affected_rows = result.affected_rows() as usize;
    let columns = result
        .columns()
        .as_ref()
        .iter()
        .map(|column| column.name_str().to_string())
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    for row in &mut result {
        let row =
            row.map_err(|error| AppError::Custom(format!("读取 MySQL/MariaDB 结果失败: {error}")))?;
        rows.push(
            row.unwrap_raw()
                .into_iter()
                .map(|value| value.map(mysql_value_to_string).unwrap_or_default())
                .collect(),
        );
    }
    drop(result);
    drop(conn);
    drop(tunnel);
    Ok((columns, rows, affected_rows))
}

fn execute_sqlite_query(
    connection: &DatabaseConnection,
    sql: &str,
) -> Result<(Vec<String>, Vec<Vec<String>>, usize), AppError> {
    if !std::path::Path::new(&connection.host).is_file() {
        return Err(AppError::InvalidInput(format!(
            "SQLite 数据库文件不存在: {}",
            connection.host
        )));
    }
    let sqlite = SqliteConnection::open_with_flags(
        &connection.host,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE,
    )
    .map_err(|error| AppError::Custom(format!("打开 SQLite 数据库失败: {}", error)))?;
    sqlite
        .busy_timeout(std::time::Duration::from_secs(5))
        .map_err(|error| AppError::Custom(format!("配置 SQLite 数据库失败: {}", error)))?;
    let mut statement = sqlite
        .prepare(sql)
        .map_err(|error| AppError::Custom(format!("准备 SQLite 查询失败: {}", error)))?;
    let columns = statement
        .column_names()
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let mut rows = Vec::new();
    let mut result_rows = statement
        .query([])
        .map_err(|error| AppError::Custom(format!("执行 SQLite 查询失败: {}", error)))?;
    while let Some(row) = result_rows
        .next()
        .map_err(|error| AppError::Custom(format!("读取 SQLite 查询结果失败: {}", error)))?
    {
        let mut values = Vec::with_capacity(columns.len());
        for index in 0..columns.len() {
            let value = row
                .get_ref(index)
                .map_err(|error| AppError::Custom(format!("读取 SQLite 字段失败: {}", error)))?;
            values.push(sqlite_value_to_string(value));
        }
        rows.push(values);
    }
    drop(result_rows);
    let affected_rows = sqlite.changes() as usize;
    Ok((columns, rows, affected_rows))
}

fn sqlite_value_to_string(value: ValueRef<'_>) -> String {
    match value {
        ValueRef::Null => String::new(),
        ValueRef::Integer(value) => value.to_string(),
        ValueRef::Real(value) => value.to_string(),
        ValueRef::Text(value) => String::from_utf8_lossy(value).into_owned(),
        ValueRef::Blob(value) => value.iter().map(|byte| format!("{byte:02x}")).collect(),
    }
}

struct MysqlTunnel {
    port: u16,
    worker: Option<JoinHandle<()>>,
    failure: Arc<Mutex<Option<String>>>,
}

impl MysqlTunnel {
    fn join_and_failure(&mut self) -> Option<String> {
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        self.failure.lock().ok().and_then(|failure| failure.clone())
    }
}

impl Drop for MysqlTunnel {
    fn drop(&mut self) {
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

fn open_database_tunnel(
    db: &Database,
    connection: &DatabaseConnection,
) -> Result<MysqlTunnel, AppError> {
    let (_, session) = ServerService::connect_terminal(
        db,
        &TerminalOpenRequest {
            server_id: connection.server_id,
            password: None,
            private_key_path: None,
            passphrase: None,
        },
    )?;
    let listener = TcpListener::bind(("127.0.0.1", 0))
        .map_err(|error| AppError::Custom(format!("创建本地数据库隧道失败: {error}")))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| AppError::Custom(format!("配置本地数据库隧道失败: {error}")))?;
    let port = listener
        .local_addr()
        .map_err(|error| AppError::Custom(format!("读取本地数据库隧道端口失败: {error}")))?
        .port();
    let target_host = connection.host.clone();
    let target_port = connection.port as u16;
    let failure = Arc::new(Mutex::new(None));
    let worker_failure = Arc::clone(&failure);
    let worker = thread::Builder::new()
        .name("database-ssh-tunnel".into())
        .spawn(move || {
            let result = (|| -> Result<(), String> {
                let started = Instant::now();
                let (mut client, _) = loop {
                    match listener.accept() {
                        Ok(connection) => break connection,
                        Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                            if started.elapsed() >= std::time::Duration::from_secs(12) {
                                return Err("等待 MySQL 客户端连接 SSH 隧道超时".into());
                            }
                            thread::sleep(std::time::Duration::from_millis(10));
                        }
                        Err(error) => return Err(error.to_string()),
                    }
                };
                let mut channel = session
                    .channel_direct_tcpip(&target_host, target_port, None)
                    .map_err(|error| error.to_string())?;
                session.set_blocking(false);
                client
                    .set_nonblocking(true)
                    .map_err(|error| error.to_string())?;
                relay_database_tunnel(&mut client, &mut channel)
            })();
            if let Err(error) = result {
                if let Ok(mut failure) = worker_failure.lock() {
                    *failure = Some(error);
                }
            }
        })
        .map_err(|error| AppError::Custom(format!("启动本地数据库隧道失败: {error}")))?;
    Ok(MysqlTunnel {
        port,
        worker: Some(worker),
        failure,
    })
}

fn relay_database_tunnel(
    client: &mut TcpStream,
    channel: &mut ssh2::Channel,
) -> Result<(), String> {
    let mut to_ssh = vec![0u8; 32 * 1024];
    let mut to_ssh_len = 0usize;
    let mut to_ssh_offset = 0usize;
    let mut to_client = vec![0u8; 32 * 1024];
    let mut to_client_len = 0usize;
    let mut to_client_offset = 0usize;
    let mut client_eof = false;
    let mut ssh_eof_sent = false;
    let mut ssh_eof = false;
    let mut ssh_bytes_received = 0usize;

    loop {
        let mut progressed = false;
        if !client_eof && to_ssh_len == to_ssh_offset {
            match client.read(&mut to_ssh) {
                Ok(0) => client_eof = true,
                Ok(length) => {
                    to_ssh_len = length;
                    to_ssh_offset = 0;
                    progressed = true;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        if to_ssh_offset < to_ssh_len {
            match channel.write(&to_ssh[to_ssh_offset..to_ssh_len]) {
                Ok(0) => return Err("SSH 隧道写入被关闭".into()),
                Ok(length) => {
                    to_ssh_offset += length;
                    progressed = true;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        if client_eof && to_ssh_len == to_ssh_offset && !ssh_eof_sent {
            match channel.send_eof() {
                Ok(()) => ssh_eof_sent = true,
                Err(error) if error.code() == SshErrorCode::Session(-37) => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        if !ssh_eof && to_client_len == to_client_offset {
            match channel.read(&mut to_client) {
                Ok(0) => ssh_eof = true,
                Ok(length) => {
                    to_client_len = length;
                    to_client_offset = 0;
                    ssh_bytes_received += length;
                    progressed = true;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        if to_client_offset < to_client_len {
            match client.write(&to_client[to_client_offset..to_client_len]) {
                Ok(0) => return Err("本地数据库隧道写入被关闭".into()),
                Ok(length) => {
                    to_client_offset += length;
                    progressed = true;
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(error) => return Err(error.to_string()),
            }
        }
        if ssh_eof && to_client_len == to_client_offset {
            if ssh_bytes_received == 0 {
                return Err("远程数据库 SSH 通道在返回 MySQL 握手数据前关闭".into());
            }
            return Ok(());
        }
        if !progressed {
            thread::sleep(std::time::Duration::from_millis(2));
        }
    }
}

fn mysql_value_to_string(value: MysqlValue) -> String {
    match value {
        MysqlValue::NULL => String::new(),
        MysqlValue::Bytes(bytes) => String::from_utf8_lossy(&bytes).into_owned(),
        MysqlValue::Int(value) => value.to_string(),
        MysqlValue::UInt(value) => value.to_string(),
        MysqlValue::Float(value) => value.to_string(),
        MysqlValue::Double(value) => value.to_string(),
        MysqlValue::Date(year, month, day, hour, minute, second, micros) => {
            format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}. {micros:06}")
                .replace(". ", ".")
        }
        MysqlValue::Time(negative, days, hours, minutes, seconds, micros) => format!(
            "{}{days} {:02}:{minutes:02}:{seconds:02}. {micros:06}",
            if negative { "-" } else { "" },
            hours
        )
        .replace(". ", "."),
    }
}

fn js_quote(value: &str) -> String {
    format!("'{}'", value.replace('\\', "\\\\").replace('\'', "\\'"))
}

fn parse_tabular_output(stdout: &str, sql: &str) -> (Vec<String>, Vec<Vec<String>>) {
    let lines: Vec<&str> = stdout
        .lines()
        .filter(|line| !line.trim().is_empty())
        .collect();
    if lines.is_empty() {
        return (Vec::new(), Vec::new());
    }
    if !sql_returns_rows(sql) {
        return (Vec::new(), Vec::new());
    }
    let columns = lines[0].split('\t').map(str::to_string).collect();
    let rows = lines[1..]
        .iter()
        .map(|line| line.split('\t').map(str::to_string).collect())
        .collect();
    (columns, rows)
}

fn parse_single_column_output(stdout: &str) -> Vec<String> {
    let mut lines = stdout
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if lines.first().is_some_and(|line| {
        matches!(
            line.to_ascii_lowercase().as_str(),
            "database" | "datname" | "name"
        )
    }) {
        lines.remove(0);
    }
    lines
}

fn database_command_error(stderr: &str, exit_code: i32) -> String {
    if stderr.trim().is_empty() {
        format!("数据库命令失败（退出码 {}）", exit_code)
    } else {
        stderr.trim().to_string()
    }
}

fn execute_remote(
    db: &Database,
    server_id: i64,
    command: String,
) -> Result<WorkbenchCommandResult, AppError> {
    let (_, session): (_, Session) = ServerService::connect_terminal(
        db,
        &TerminalOpenRequest {
            server_id,
            password: None,
            private_key_path: None,
            passphrase: None,
        },
    )?;
    let mut channel = session
        .channel_session()
        .map_err(|error| AppError::Custom(format!("创建数据库命令通道失败: {error}")))?;
    channel
        .exec(&command)
        .map_err(|error| AppError::Custom(format!("执行数据库命令失败: {error}")))?;
    let mut stdout = String::new();
    let mut stderr = String::new();
    channel
        .read_to_string(&mut stdout)
        .map_err(|error| AppError::Custom(format!("读取数据库输出失败: {error}")))?;
    channel
        .stderr()
        .read_to_string(&mut stderr)
        .map_err(|error| AppError::Custom(format!("读取数据库错误输出失败: {error}")))?;
    channel
        .wait_close()
        .map_err(|error| AppError::Custom(format!("等待数据库命令结束失败: {error}")))?;
    Ok(WorkbenchCommandResult {
        stdout,
        stderr,
        exit_code: channel.exit_status().unwrap_or(1),
    })
}

#[cfg(test)]
mod tests {
    use super::{execute_sqlite_query, normalize_engine, DatabaseConnection};
    use rusqlite::Connection;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(name: &str) -> std::path::PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        std::env::temp_dir().join(format!("reeve-{name}-{}-{nonce}.db", std::process::id()))
    }

    fn sqlite_record(path: &std::path::Path) -> DatabaseConnection {
        DatabaseConnection {
            id: 0,
            name: "local-test".into(),
            server_id: 0,
            engine: "sqlite".into(),
            host: path.to_string_lossy().into_owned(),
            port: 0,
            username: String::new(),
            database_name: String::new(),
            db_index: 0,
            is_prod_protect: false,
            prod_databases: String::new(),
            prod_db_list: String::new(),
            ssh_tunnel: false,
            ai_tier: "default".into(),
            created_at: String::new(),
            updated_at: String::new(),
        }
    }

    #[test]
    fn sqlite_query_reads_rows_and_schema_from_local_file() {
        let path = temp_db_path("query");
        let setup = Connection::open(&path).expect("create test database");
        setup
            .execute_batch("CREATE TABLE items (id INTEGER, name TEXT); INSERT INTO items VALUES (7, 'alpha');")
            .expect("seed test database");
        drop(setup);

        let connection = sqlite_record(&path);
        let (columns, rows, _) =
            execute_sqlite_query(&connection, "SELECT id, name FROM items").expect("query rows");
        assert_eq!(columns, vec!["id", "name"]);
        assert_eq!(rows, vec![vec!["7", "alpha"]]);

        let (_, tables, _) = execute_sqlite_query(
            &connection,
            "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .expect("query schema");
        assert_eq!(tables, vec![vec!["items", "table"]]);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn sqlite_query_does_not_create_a_missing_database_file() {
        let path = temp_db_path("missing");
        let connection = sqlite_record(&path);
        assert!(execute_sqlite_query(&connection, "SELECT 1").is_err());
        assert!(!path.exists());
    }

    #[test]
    fn normalizes_oracle_and_sql_server_engine_names() {
        assert_eq!(normalize_engine("Oracle"), "oracle");
        assert_eq!(normalize_engine("Microsoft SQL Server"), "sqlserver");
        assert_eq!(normalize_engine("MSSQL"), "sqlserver");
    }
}
