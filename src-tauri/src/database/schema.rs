use rusqlite::Connection;

use crate::error::AppError;

/// 当前 Schema 版本
pub const SCHEMA_VERSION: i32 = 11;

/// 获取数据库版本
pub fn get_version(conn: &Connection) -> Result<i32, AppError> {
    let version: i32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    Ok(version)
}

/// 设置数据库版本
pub fn set_version(conn: &Connection, version: i32) -> Result<(), AppError> {
    conn.pragma_update(None, "user_version", version)?;
    Ok(())
}

/// 执行数据库迁移
pub fn migrate(conn: &Connection) -> Result<(), AppError> {
    let mut version = get_version(conn)?;

    if version > SCHEMA_VERSION {
        return Err(AppError::Custom(format!(
            "数据库版本({})高于应用支持的版本({}), 请升级应用",
            version, SCHEMA_VERSION
        )));
    }

    while version < SCHEMA_VERSION {
        match version {
            0 => migrate_v0_to_v1(conn)?,
            1 => migrate_v1_to_v2(conn)?,
            2 => migrate_v2_to_v3(conn)?,
            3 => migrate_v3_to_v4(conn)?,
            4 => migrate_v4_to_v5(conn)?,
            5 => migrate_v5_to_v6(conn)?,
            6 => migrate_v6_to_v7(conn)?,
            7 => migrate_v7_to_v8(conn)?,
            8 => migrate_v8_to_v9(conn)?,
            9 => migrate_v9_to_v10(conn)?,
            10 => migrate_v10_to_v11(conn)?,
            _ => {
                return Err(AppError::Custom(format!("未知的数据库版本: {}", version)));
            }
        }
        version = get_version(conn)?;
    }

    log::info!("数据库迁移完成, 当前版本: {}", version);
    Ok(())
}

/// v0 -> v1: 初始化表结构
fn migrate_v0_to_v1(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移: v0 -> v1");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS app_config (
            key         TEXT PRIMARY KEY,
            value       TEXT NOT NULL,
            created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        INSERT OR IGNORE INTO app_config (key, value) VALUES ('theme', 'dark');
        INSERT OR IGNORE INTO app_config (key, value) VALUES ('language', 'zh-CN');
        INSERT OR IGNORE INTO app_config (key, value) VALUES ('sidebar_collapsed', 'false');
        ",
    )?;

    set_version(conn, 1)?;
    Ok(())
}

/// v1 -> v2: 添加软删除支持
fn migrate_v1_to_v2(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移: v1 -> v2（软删除支持）");

    conn.execute_batch(
        "
        ALTER TABLE app_config ADD COLUMN deleted_at TEXT DEFAULT NULL;
        ",
    )?;

    set_version(conn, 2)?;
    Ok(())
}

/// v2 -> v3: 添加服务器资产表
fn migrate_v2_to_v3(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移: v2 -> v3（服务器资产）");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS servers (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            alias        TEXT NOT NULL UNIQUE,
            hostname     TEXT NOT NULL,
            port         INTEGER NOT NULL DEFAULT 22,
            username     TEXT NOT NULL DEFAULT 'root',
            auth_type    TEXT NOT NULL DEFAULT 'password',
            tags         TEXT NOT NULL DEFAULT '[]',
            `group`      TEXT NOT NULL DEFAULT '默认',
            ai_policy    TEXT NOT NULL DEFAULT 'trusted',
            os_type      TEXT NOT NULL DEFAULT 'linux',
            created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_servers_alias ON servers(alias);
        CREATE INDEX IF NOT EXISTS idx_servers_group ON servers(`group`);
        CREATE INDEX IF NOT EXISTS idx_servers_policy ON servers(ai_policy);
        ",
    )?;

    set_version(conn, 3)?;
    Ok(())
}

/// v3 -> v4: 添加审核日志表和告警规则表
fn migrate_v3_to_v4(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移: v3 -> v4（审核日志 + 告警规则）");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS audit_logs (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            server_alias   TEXT NOT NULL,
            command        TEXT NOT NULL,
            user           TEXT NOT NULL DEFAULT 'system',
            result         TEXT NOT NULL DEFAULT 'success',
            created_at     TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_audit_logs_server ON audit_logs(server_alias);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at);

        CREATE TABLE IF NOT EXISTS alert_rules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            metric      TEXT NOT NULL,
            threshold   TEXT NOT NULL,
            severity    TEXT NOT NULL DEFAULT 'warning',
            enabled     INTEGER NOT NULL DEFAULT 1,
            created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        ",
    )?;

    set_version(conn, 4)?;
    Ok(())
}

/// v4 -> v5: 服务器资产增强（收藏 / 系统架构 / 最近探活时间）
///
/// 字段语义（避免前端误判，特此注明）：
/// - `favorite`：左侧分组树「我的收藏」的数据来源，SQLite 无布尔类型，用 0/1 存储。
/// - `arch`：目标机 CPU 架构，由首次成功连通后写回。默认空串表示「尚未探测」，
///   前端应显示占位符，而不能把空串当成 linux/amd64。
/// - `last_used_at`：每次成功探活后刷新，供「最近用过」排序。NULL 表示从未使用过，
///   刻意不与 created_at 混用，否则新纳管但没连过的机器会错误地排在「最近用过」顶部。
fn migrate_v4_to_v5(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移: v4 -> v5（服务器资产增强）");

    conn.execute_batch(
        "
        ALTER TABLE servers ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE servers ADD COLUMN arch TEXT NOT NULL DEFAULT '';
        ALTER TABLE servers ADD COLUMN last_used_at TEXT DEFAULT NULL;

        CREATE INDEX IF NOT EXISTS idx_servers_favorite ON servers(favorite);
        ",
    )?;

    set_version(conn, 5)?;
    Ok(())
}

/// v5 -> v6: 持久化 SSH 主机身份与最近认证状态。
///
/// 这里只保存公开的主机指纹和非敏感结果摘要；密码、私钥内容及口令绝不落库。
fn migrate_v5_to_v6(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移: v5 -> v6（SSH 验证状态）");

    conn.execute_batch(
        "
        ALTER TABLE servers ADD COLUMN host_key_fingerprint TEXT NOT NULL DEFAULT '';
        ALTER TABLE servers ADD COLUMN last_connection_status TEXT NOT NULL DEFAULT 'unknown';
        ALTER TABLE servers ADD COLUMN last_connection_message TEXT NOT NULL DEFAULT '';
        ALTER TABLE servers ADD COLUMN last_connected_at TEXT DEFAULT NULL;

        CREATE INDEX IF NOT EXISTS idx_servers_connection_status
            ON servers(last_connection_status);
        ",
    )?;

    set_version(conn, 6)?;
    Ok(())
}

/// v6 -> v7: 添加 sudo 权限、本地代理、跳板机与 AI 专用账号支持
fn migrate_v6_to_v7(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移: v6 -> v7（服务器扩展属性：sudo/代理/跳板机/AI专用账号）");

    conn.execute_batch(
        "
        ALTER TABLE servers ADD COLUMN allow_sudo INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE servers ADD COLUMN use_local_proxy INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE servers ADD COLUMN bastion_id INTEGER DEFAULT NULL;
        ALTER TABLE servers ADD COLUMN ai_username TEXT NOT NULL DEFAULT '';
        ",
    )?;

    set_version(conn, 7)?;
    Ok(())
}

/// v7 -> v8：数据库连接元数据。密码由系统凭据管理器托管，不落 SQLite。
fn migrate_v7_to_v8(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移 v7 -> v8（数据库连接）");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS database_connections (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            name            TEXT NOT NULL,
            server_id       INTEGER NOT NULL,
            engine          TEXT NOT NULL,
            host            TEXT NOT NULL,
            port            INTEGER NOT NULL,
            username        TEXT NOT NULL DEFAULT '',
            database_name   TEXT NOT NULL DEFAULT '',
            db_index        INTEGER NOT NULL DEFAULT 0,
            is_prod_protect INTEGER NOT NULL DEFAULT 0,
            prod_databases  TEXT NOT NULL DEFAULT '',
            prod_db_list    TEXT NOT NULL DEFAULT '',
            ssh_tunnel      INTEGER NOT NULL DEFAULT 0,
            ai_tier         TEXT NOT NULL DEFAULT 'default',
            created_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );

        CREATE INDEX IF NOT EXISTS idx_database_connections_server
            ON database_connections(server_id);
        CREATE INDEX IF NOT EXISTS idx_database_connections_engine
            ON database_connections(engine);
        ",
    )?;

    set_version(conn, 8)?;
    Ok(())
}

/// v8 -> v9：AI 审批记录持久化；默认锁定由缺失的配置项表示。
fn migrate_v8_to_v9(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS ai_approvals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id INTEGER NOT NULL,
            server_alias TEXT NOT NULL,
            action TEXT NOT NULL,
            command TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            requested_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            decided_at INTEGER,
            finished_at INTEGER,
            result TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_ai_approvals_status ON ai_approvals(status, expires_at);",
    )?;
    set_version(conn, 9)?;
    Ok(())
}

/// v9 -> v10：MCP Scoped Token 元数据。令牌密文存入系统凭据管理器，不落 SQLite。
fn migrate_v9_to_v10(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移 v9 -> v10（MCP 令牌）");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS mcp_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            client TEXT NOT NULL,
            server_scope TEXT NOT NULL DEFAULT '*',
            tool_scope TEXT NOT NULL DEFAULT 'readonly',
            expires_at TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            token_hint TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            revoked_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_mcp_tokens_status ON mcp_tokens(status, expires_at);",
    )?;
    set_version(conn, 10)?;
    Ok(())
}

/// v10 -> v11：敏感库只保存脱敏元数据，原始命中内容不落库。
fn migrate_v10_to_v11(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移 v10 -> v11（敏感库）");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS sensitive_entries (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id     INTEGER,
            server_alias  TEXT NOT NULL DEFAULT '',
            detected_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            secret_type   TEXT NOT NULL,
            label         TEXT NOT NULL,
            masked_value  TEXT NOT NULL,
            source        TEXT NOT NULL,
            status        TEXT NOT NULL DEFAULT 'pending',
            value_hash    TEXT NOT NULL,
            match_count   INTEGER NOT NULL DEFAULT 1,
            created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_sensitive_entries_status
            ON sensitive_entries(status, detected_at);
        CREATE INDEX IF NOT EXISTS idx_sensitive_entries_type
            ON sensitive_entries(secret_type);
        CREATE INDEX IF NOT EXISTS idx_sensitive_entries_server
            ON sensitive_entries(server_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sensitive_entries_dedup
            ON sensitive_entries(server_id, source, value_hash, status);",
    )?;
    set_version(conn, 11)?;
    Ok(())
}
