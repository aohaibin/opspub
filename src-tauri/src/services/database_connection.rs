use std::io::Read;
use std::time::Instant;

use keyring::{Entry, Error as KeyringError};
use ssh2::Session;

use crate::database::Database;
use crate::error::AppError;
use crate::models::{
    DatabaseConnection, DatabaseConnectionInput, DatabaseProbeResult, DatabaseQueryRequest,
    DatabaseQueryResult, DatabaseTableItem, MongoCollectionItem, RedisKeyItem,
};
use crate::models::{TerminalOpenRequest, WorkbenchCommandResult};
use crate::services::server::ServerService;

const DATABASE_CREDENTIAL_SERVICE: &str = "com.opsentr.yunwei.database";

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
        let password = input.password.or_else(|| None);
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
        if connection.is_prod_protect
            && is_protected_database(&connection, request.database_name.as_deref())
            && is_mutating_sql(sql)
        {
            return Err(AppError::InvalidInput(
                "当前数据库启用了生产保护，仅允许执行查询类 SQL（SELECT/SHOW/DESCRIBE/EXPLAIN）"
                    .into(),
            ));
        }
        let command = build_sql_command(
            &connection,
            get_password(connection.id)?.as_deref(),
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
            "postgresql" => {
                "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
            }
            _ => "SHOW DATABASES",
        };
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
            "postgresql" => "SELECT table_name, table_type FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY table_name",
            "mysql" | "mariadb" => "SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME",
            "clickhouse" => "SHOW TABLES",
            _ => return Err(AppError::InvalidInput("当前连接不支持结构查询".into())),
        };
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
    if input.name.trim().is_empty() || input.host.trim().is_empty() {
        return Err(AppError::InvalidInput("连接名称和主机地址不能为空".into()));
    }
    if input.server_id <= 0 {
        return Err(AppError::InvalidInput("请选择用于 SSH 访问的服务器".into()));
    }
    if !(1..=65535).contains(&input.port) {
        return Err(AppError::InvalidInput(
            "数据库端口必须在 1-65535 之间".into(),
        ));
    }
    let engine = normalize_engine(&input.engine);
    if ![
        "mysql",
        "mariadb",
        "postgresql",
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
        "mongo" | "mongodb" => "mongodb".into(),
        "redis" => "redis".into(),
        "clickhouse" => "clickhouse".into(),
        other => other.to_string(),
    }
}

fn is_sql_engine(engine: &str) -> bool {
    matches!(
        normalize_engine(engine).as_str(),
        "mysql" | "mariadb" | "postgresql" | "clickhouse"
    )
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
        "mysql" | "mariadb" => Ok(format!(
            "MYSQL_PWD={} mysql --batch --raw --default-character-set=utf8mb4 -h {} -P {} -u {} {} -e {}",
            shell_quote(password), host, connection.port, user,
            if database.is_empty() { String::new() } else { shell_quote(database) }, sql
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
    let statement = sql.trim_start().to_ascii_lowercase();
    let has_rows = statement.starts_with("select")
        || statement.starts_with("show")
        || statement.starts_with("describe")
        || statement.starts_with("desc ")
        || statement.starts_with("explain")
        || statement.starts_with("with ");
    if !has_rows {
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
