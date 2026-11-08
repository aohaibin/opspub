use rusqlite::Connection;

use crate::error::AppError;

/// 当前 Schema 版本
pub const SCHEMA_VERSION: i32 = 17;

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
            11 => migrate_v11_to_v12(conn)?,
            12 => migrate_v12_to_v13(conn)?,
            13 => migrate_v13_to_v14(conn)?,
            14 => migrate_v14_to_v15(conn)?,
            15 => migrate_v15_to_v16(conn)?,
            16 => migrate_v16_to_v17(conn)?,
            _ => {
                return Err(AppError::Custom(format!("未知的数据库版本: {}", version)));
            }
        }
        version = get_version(conn)?;
    }

    log::info!("数据库迁移完成, 当前版本: {}", version);
    Ok(())
}

fn migrate_v16_to_v17(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("BEGIN; ALTER TABLE servers ADD COLUMN connection_options TEXT NOT NULL DEFAULT '{}'; PRAGMA user_version=17; COMMIT;")?;
    Ok(())
}

fn migrate_v15_to_v16(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch("BEGIN; ALTER TABLE servers ADD COLUMN protocol TEXT NOT NULL DEFAULT 'ssh' CHECK (protocol IN ('ssh','rdp')); PRAGMA user_version=16; COMMIT;")?;
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

/// v11 -> v12：结构化 AI 操作计划、批次、目标、验证步骤和审批事件。
fn migrate_v11_to_v12(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移 v11 -> v12（AI 操作计划与审批批次）");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS action_plans (
            id TEXT PRIMARY KEY,
            conversation_id TEXT,
            action TEXT NOT NULL,
            summary TEXT NOT NULL,
            original_request TEXT NOT NULL,
            original_command TEXT NOT NULL,
            normalized_command TEXT NOT NULL,
            command_sha256 TEXT NOT NULL,
            rule_version TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            risk_reason TEXT NOT NULL,
            matched_rules TEXT NOT NULL DEFAULT '[]',
            requires_approval INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'draft',
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_action_plans_status_expiry
            ON action_plans(status, expires_at);
        CREATE INDEX IF NOT EXISTS idx_action_plans_conversation
            ON action_plans(conversation_id, created_at);

        CREATE TABLE IF NOT EXISTS action_plan_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id TEXT NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
            server_id INTEGER NOT NULL,
            server_alias TEXT NOT NULL,
            sequence_no INTEGER NOT NULL,
            role TEXT NOT NULL DEFAULT 'target',
            status TEXT NOT NULL DEFAULT 'pending',
            result TEXT NOT NULL DEFAULT '',
            started_at INTEGER,
            finished_at INTEGER,
            UNIQUE(plan_id, server_id)
        );
        CREATE INDEX IF NOT EXISTS idx_action_plan_targets_status
            ON action_plan_targets(plan_id, status, sequence_no);

        CREATE TABLE IF NOT EXISTS approval_batches (
            id TEXT PRIMARY KEY,
            plan_id TEXT NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
            mode TEXT NOT NULL DEFAULT 'single',
            canary_server_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            expires_at INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            decided_at INTEGER,
            finished_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_approval_batches_status_expiry
            ON approval_batches(status, expires_at);

        CREATE TABLE IF NOT EXISTS plan_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id TEXT NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
            target_id INTEGER REFERENCES action_plan_targets(id) ON DELETE CASCADE,
            step_id TEXT NOT NULL,
            label TEXT NOT NULL,
            command TEXT NOT NULL,
            expected_result TEXT NOT NULL DEFAULT '',
            required INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'pending',
            exit_code INTEGER,
            result_summary TEXT NOT NULL DEFAULT '',
            started_at INTEGER,
            finished_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_plan_verifications_status
            ON plan_verifications(plan_id, status);

        CREATE TABLE IF NOT EXISTS approval_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id TEXT NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
            batch_id TEXT REFERENCES approval_batches(id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            actor TEXT NOT NULL,
            details TEXT NOT NULL DEFAULT '',
            previous_hash TEXT NOT NULL DEFAULT '',
            event_hash TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_approval_events_plan
            ON approval_events(plan_id, id);",
    )?;
    set_version(conn, 12)?;
    Ok(())
}

/// v12 -> v13：后端统一策略规则库。前端安全页只管理规则，不作为最终执行依据。
fn migrate_v12_to_v13(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移 v12 -> v13（策略规则库）");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS policy_rules (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            pattern TEXT NOT NULL,
            risk_level TEXT NOT NULL,
            action TEXT NOT NULL DEFAULT 'review',
            enabled INTEGER NOT NULL DEFAULT 1,
            builtin INTEGER NOT NULL DEFAULT 0,
            rule_version TEXT NOT NULL DEFAULT 'policy-v1',
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_policy_rules_enabled
            ON policy_rules(enabled, risk_level);
        CREATE INDEX IF NOT EXISTS idx_policy_rules_builtin
            ON policy_rules(builtin, id);

        INSERT OR IGNORE INTO policy_rules
            (id, label, pattern, risk_level, action, builtin, rule_version, created_at, updated_at)
        VALUES
            ('builtin:rm-root', '根目录强制删除', '^rm\\s+-(rf|fr)\\s+/(.*)?$', 'extreme', 'block', 1, 'policy-v1', strftime('%s','now'), strftime('%s','now')),
            ('builtin:mkfs-device', '格式化块设备', '^mkfs(\\.[a-z0-9]+)?\\s+/dev/.*$', 'extreme', 'block', 1, 'policy-v1', strftime('%s','now'), strftime('%s','now')),
            ('builtin:dd-device', '底层裸盘复写', '^dd\\s+if=.*\\s+of=/dev/[a-z]+$', 'extreme', 'block', 1, 'policy-v1', strftime('%s','now'), strftime('%s','now')),
            ('builtin:drop-database', '直接删除主数据库', '(?i)drop\\s+database\\s+.*', 'extreme', 'block', 1, 'policy-v1', strftime('%s','now'), strftime('%s','now')),
            ('builtin:iptables-flush', '清空所有防护链', '^iptables\\s+-(F|X|Z)$', 'high', 'review', 1, 'policy-v1', strftime('%s','now'), strftime('%s','now')),
            ('builtin:curl-shell', '下载后直接交给解释器', '(?i)(curl|wget)[^|]*\\|\\s*(bash|sh|python|perl)', 'high', 'review', 1, 'policy-v1', strftime('%s','now'), strftime('%s','now'));",
    )?;
    set_version(conn, 13)?;
    Ok(())
}

/// v13 -> v14：将现有审批记录与结构化操作计划建立关联。
fn migrate_v13_to_v14(conn: &Connection) -> Result<(), AppError> {
    log::info!("数据库迁移 v13 -> v14（审批与操作计划关联）");
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS ai_approval_plans (
            approval_id INTEGER PRIMARY KEY REFERENCES ai_approvals(id) ON DELETE CASCADE,
            plan_id TEXT NOT NULL UNIQUE REFERENCES action_plans(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_approval_plans_plan
            ON ai_approval_plans(plan_id);",
    )?;
    set_version(conn, 14)?;
    Ok(())
}

// 设备凭据只保存 SHA-256 摘要，备份和数据库读取都不能还原手机令牌。
fn migrate_v14_to_v15(conn: &Connection) -> Result<(), AppError> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS paired_devices (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            created_at INTEGER NOT NULL,
            last_seen_at INTEGER
        );",
    )?;
    set_version(conn, 15)
}

#[cfg(test)]
mod tests {
    use super::{migrate, SCHEMA_VERSION};
    use rusqlite::Connection;

    #[test]
    fn migration_v14_creates_plan_and_policy_tables() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        // v11 数据库已经有 servers 表；后续迁移会为该表添加连接选项。
        conn.execute_batch("CREATE TABLE servers (id INTEGER PRIMARY KEY, alias TEXT)").expect("v11 server table");
        conn.pragma_update(None, "user_version", 11)
            .expect("set starting schema version");

        migrate(&conn).expect("migrate schema");

        let version: i32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .expect("read schema version");
        assert_eq!(version, SCHEMA_VERSION);

        for table in [
            "action_plans",
            "action_plan_targets",
            "approval_batches",
            "plan_verifications",
            "approval_events",
            "policy_rules",
            "ai_approval_plans",
        ] {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
                    [table],
                    |row| row.get(0),
                )
                .expect("check table exists");
            assert!(exists, "missing table {table}");
        }

        let columns = conn
            .prepare("PRAGMA table_info(action_plans)")
            .expect("prepare schema introspection")
            .query_map([], |row| row.get::<_, String>(1))
            .expect("query schema columns")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect schema columns");
        for column in [
            "original_command",
            "normalized_command",
            "command_sha256",
            "rule_version",
            "risk_level",
        ] {
            assert!(
                columns.iter().any(|name| name == column),
                "missing column {column}"
            );
        }

        let builtin_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM policy_rules WHERE builtin = 1 AND action = 'block'",
                [],
                |row| row.get(0),
            )
            .expect("count builtin hard-block rules");
        assert!(builtin_count >= 4, "expected seeded hard-block rules");
    }
}
