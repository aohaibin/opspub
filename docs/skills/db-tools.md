---
name: db-tools
description: OpsPub 数据库直连工具 db_query / db_execute —— 通过已登记的 DB 凭据（mysql_conn / postgres_conn / sqlite_conn / mssql_conn）跑 SQL，避免 ssh_exec + mysql/psql CLI 的密码暴露 + 输出解析坑。
触发词: 数据库, 查 db, 查表, 查记录, 查询数据, mysql 查询, postgres 查询, sqlite 查询, SQL 查询, 数据库连接, db_query, db_execute, 数据条数, select 数据, insert 数据, update 数据, 看表, 看库, 表结构, desc 表, show tables, show databases, 跑 sql, 执行 sql, count 行, 多少条数据, 表里有多少, 查一下, 数据库直连, 不用 ssh 查库, 给我看, 表数据, explain, explain analyze, 查询计划, sql server 查询, sqlserver 查询, mssql 查询
dangerous_commands:
  # 这些匹配 pseudo command "[opspub-internal] db_<op> <sql 首 80 字>"。SQL 文本前 80 字内匹配即拦。
  # 主防线在 services/db_exec/safe_sql.rs（任何档都拦库级 D-R-O-P / TRUNCATE / 无 WHERE 全表删改）；
  # 这里加一些 SQL 特有的高风险补充，让 trusted 档也能挡住。
  - '(?i)\[opspub-internal\]\s+db_execute\s+[^\n]*\bDROP\s+USER\b'
  - '(?i)\[opspub-internal\]\s+db_execute\s+[^\n]*\bALTER\s+USER\s+[^\n]*\bIDENTIFIED\s+BY\b'
  - '(?i)\[opspub-internal\]\s+db_execute\s+[^\n]*\bFLUSH\s+PRIVILEGES\b'
  - '(?i)\[opspub-internal\]\s+db_execute\s+[^\n]*\bSHUTDOWN\b'
---

# db-tools —— 数据库直连（首选 db_query / db_execute）

## 🤖 适用场景

用户问"查一下 X 表"、"看下 users 表里有多少条"、"统计今日订单"、"改一下某用户的状态"、"加个索引"、"看下表结构"、"导出数据"……
**只要能通过 SQL 完成、且用户在 OpsPub 里登记过 DB 凭据，AI 都应该用 `db_query` / `db_execute`，而不是 `ssh_exec mysql -e ...`**。

## 🔴 为什么不用 ssh_exec + mysql CLI？

| 坑 | db_query/db_execute（推荐） | ssh_exec mysql -e |
|----|---------------------------|-------------------|
| 密码暴露 | 永远在 OpsPub 加密金库里，AI 看不到 | `-p<pwd>` 留在 shell 历史 + ps + audit |
| 结果格式 | 结构化 JSON（columns + rows）直接用 | 文本表格，AI 容易解析错 |
| 危险 SQL 拦截 | 内置黑名单 + 出口脱敏，任何档都拦 | 完全裸跑 |
| 多库支持 | 同一接口跑 MySQL / PostgreSQL / SQLite / SQL Server | 每个 CLI 都不一样 |
| 占位符防注入 | 原生 `?` / `$1` 参数绑定 | 自己拼字符串，极易翻车 |
| 行数限制 | 默认 100 行（防误打全表 dump） | 没限制，可能爆几百万行 |

**结论**：对**已登记的 DB 凭据**，永远先 db_query / db_execute；只有用户**没登记凭据 + 拒绝登记**时才 fallback 到 ssh_exec。

## 用前必读：先查可用凭据

```text
1. list_installed_services()
   → 返回所有服务凭据；筛选 kind ∈ {mysql_conn, postgres_conn, sqlite_conn, mssql_conn}（MongoDB / ClickHouse 不在此列，见 mongodb-ops / clickhouse-ops）
2. 拿 label 或 id (vs_xxx) 作为 db_query / db_execute 的 `credential` 参数
   - 优先用 label（更直观）；label 同名时会报 ambiguous，再用 id
```

如果用户说"查一下我那个 RDS"但 `list_installed_services` 里没找到，应该：
- 询问用户：是哪台 DB？host / port / user / database 各是什么？
- 引导用户去「服务凭据」页点"+ 新建 DB 凭据"，或者
- 让用户在对话里把凭据信息告诉你，你用 install_with_secret 或直接 fallback ssh_exec（仅当用户授权）

## db_query —— 只读查询

### 入参

```jsonc
{
  "credential": "阿里云 RDS - 主库",  // label 或 vault_id
  "sql": "SELECT id, name, created_at FROM users WHERE status=? ORDER BY id DESC",
  "params": [1],                       // 占位符按位置绑定；MySQL/SQLite 用 ?，PostgreSQL 用 $1，**SQL Server 不支持 params**（传了会被拒绝：值内联进 SQL、自行转义单引号，中文用 N'…'）
  "limit": 50                          // 可选；默认 100，最大 10000
}
```

### 出参

```jsonc
{
  "driver": "mysql",
  "columns": ["id", "name", "created_at"],
  "rows": [
    {"id": 1, "name": "alice", "created_at": "2026-01-01 10:00:00"},
    {"id": 2, "name": "bob",   "created_at": "2026-01-02 11:30:00"}
  ],
  "rowCount": 2,
  "totalFetched": 2,    // 实际从 DB 取了多少（截断前）
  "truncated": false,
  "limit": 100
}
```

### 准入限制

- **只接 SELECT / WITH 开头**；INSERT/UPDATE/DELETE 等会被拒绝（用 db_execute）
- **拒绝多语句注入**：`SELECT 1; DROP TABLE x` —— 即使两条都是 SELECT 也拒
- **driver-specific 类型**（DATE/TIMESTAMP/UUID/JSONB/DECIMAL/...）需要在 SQL 里显式 CAST：
  - PostgreSQL: `SELECT created_at::text` 或 `SELECT to_jsonb(t.*)::text`
  - MySQL: `SELECT DATE_FORMAT(t, '%Y-%m-%d %H:%i:%s')`
  - 否则会落到 `[unsupported:TYPENAME]` 占位

### 结果脱敏

行里的字符串值如果命中 redaction 规则（含 "password" / "token" / "secret" / "api_key" 等关键词的列名值），会被替换为 `[REDACTED:rule_id]`，明文进入用户的「敏感库」可后续 reveal。这意味着 AI 看到的查询结果**绝不会包含明文凭据**。

## db_execute —— 写入 / DDL

### 入参

```jsonc
{
  "credential": "阿里云 RDS - 主库",
  "sql": "UPDATE users SET status=? WHERE id=?",
  "params": [2, 42]
}
```

### 出参

```jsonc
{
  "driver": "mysql",
  "rowsAffected": 1
}
```

### 准入限制（核心）

按目标凭据所属服务器的 `ai_policy` 5 档：

| 档位 | db_execute 行为 |
|------|----------------|
| `disabled` | 拒绝 |
| `readonly` | 拒绝（写操作） |
| `approval` | 拒绝（P1 暂未对接审批队列；让用户在 UI 跑或调到 trusted） |
| `allowlist` | 拒绝（同上） |
| `trusted` | 自动执行 |

**危险 SQL 分两类，任何档位（含 trusted）都不放过**（safe_sql.rs）：

① **极高危**（不可恢复，但用户本人在场时可能正当需要）→ **进审批队列，必须由用户本人在 OpsPub 桌面端手敲目标并验证身份**
（Windows Hello / Touch ID / 主密码）才会执行，每次一验、只放行这一条；你的调用会等到用户裁决（最长 5 分钟）：

- `DROP DATABASE` / `DROP SCHEMA`（用户要手敲**库名**）
- `TRUNCATE` 任何对象（手敲**表名**）
- **无 WHERE 的全表 DELETE / UPDATE**（手敲**表名**；启发式：`DELETE FROM x` / `UPDATE x SET` 后不出现 WHERE，或 WHERE 恒真如 `1=1`）

发起前先用只读 SQL 确认目标（库大小、表行数、有没有备份）并把影响讲给用户；被拒绝或超时就停手，别换写法重试。

② **永远禁止**（没有审批出口，换写法也没用）：

- `GRANT ALL PRIVILEGES` / `REVOKE ALL`（提权）
- `REPLACE INTO`（MySQL 下等于 DELETE+INSERT，会静默毁数据；改用 `INSERT ... ON DUPLICATE KEY UPDATE`）
- SQL Server 的系统命令逃逸：`xp_cmdshell` / `sp_OA*` / `sp_configure` / `xp_reg*` 等

skill 补充（走普通危险审批，点一下即可）：`DROP USER` / `ALTER USER ... IDENTIFIED BY` / `FLUSH PRIVILEGES` / `SHUTDOWN`

## 占位符防注入（强制）

| 场景 | ✅ 正确 | ❌ 错误（被注入风险） |
|------|---------|---------------------|
| 单参数 | `sql:"SELECT * FROM u WHERE id=?", params:[42]` | `sql:"SELECT * FROM u WHERE id=" + userInput` |
| 多参数 | `params:[42, "active"]` | 字符串拼接 |
| LIKE 模糊 | `sql:"... WHERE name LIKE ?", params:["%alice%"]` | 把 `%` 拼进 SQL |
| IN 子句 | 多个 `?` 占位：`WHERE id IN (?,?,?)` + `params:[1,2,3]` | 字符串拼接 IN 列表 |

PostgreSQL 注意用 `$1/$2`：`SELECT * FROM u WHERE id=$1` + `params:[42]`。

## 常见模式速查

### 探查表结构

```sql
-- MySQL / MariaDB
SHOW TABLES;
DESC users;
SHOW CREATE TABLE users;

-- PostgreSQL（注意 driver_specific 列要 CAST）
SELECT table_name FROM information_schema.tables WHERE table_schema='public';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users';

-- SQLite
SELECT name FROM sqlite_master WHERE type='table';
PRAGMA table_info(users);
```

### 统计

```sql
SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?
-- params: ["2026-05-01"]
```

### 分页（适配 limit + offset）

```sql
SELECT id, name FROM users ORDER BY id LIMIT ? OFFSET ?
-- params: [50, 0]   ← 第 1 页
-- params: [50, 50]  ← 第 2 页
```

> 注意：`db_query` 的 `limit` 参数是**外层截断**，不会改 SQL；如果 SQL 里已有 LIMIT，二者取小。

### 批量插入

```sql
-- 一条 INSERT 多 VALUES 直接用 db_execute
INSERT INTO logs(level, msg) VALUES (?, ?), (?, ?), (?, ?)
-- params: ["info","a","info","b","warn","c"]
```

### 多语句原子事务（db_transaction）

需要"全部成功才生效，任一失败回滚"时用 db_transaction：

```jsonc
{
  "credential": "阿里云 RDS",
  "statements": [
    { "sql": "UPDATE users SET status='inactive' WHERE id=?", "params": [42] },
    { "sql": "INSERT INTO audit_log(user_id, action) VALUES (?, ?)", "params": [42, "deactivate"] }
  ]
}
```

返回：

```jsonc
{
  "driver": "mysql",
  "perStatement": [1, 1],
  "totalRowsAffected": 2
}
```

约束：
- 最多 50 条语句
- 每条都过危险 SQL 黑名单 + 高危 DDL 强制审批（命中即整体拒绝，事务不开）
- 任一失败 → ROLLBACK；全部成功 → COMMIT

## 🧠 大查询前先 EXPLAIN（强烈建议）

AI 在跑 **未知数据量** 的 SELECT 之前，应该先用 EXPLAIN 看执行计划，避免一次 query 几百万行打挂 DB。

### MySQL / MariaDB

```sql
EXPLAIN SELECT * FROM orders WHERE created_at >= '2026-01-01'
```

关键字段：
- `type`：`ALL` = 全表扫描（危险）；`ref`/`range`/`const` = 用索引（安全）
- `rows`：估算行数；> 10 万 时停下来思考
- `Extra`：含 `Using filesort` / `Using temporary` 提示 SQL 重写或加索引

### PostgreSQL

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM orders WHERE created_at >= '2026-01-01'
```

- `Seq Scan` = 全表扫；`Index Scan` = 走索引
- `actual rows` 比 `estimated` 差很多 → 需要 ANALYZE 更新统计信息

## ⚠️ UPDATE / DELETE 前必须先 SELECT 验证 WHERE

写操作之前，**永远先用 db_query 验证 WHERE 条件命中多少行**。这是最有效的"误删保护"。

### 推荐模式

```text
1. SELECT COUNT(*) FROM users WHERE last_login_at < '2025-01-01'
   → 结果：1247 行
2. （可选）SELECT * FROM users WHERE last_login_at < '2025-01-01' LIMIT 5
   → 抽样看 5 行确认是不是预期范围
3. 告诉用户："准备 UPDATE 这 1247 个用户的 status=inactive，确认吗？"
4. 用户确认后才 db_execute 真的跑 UPDATE
```

### 反模式（禁止）

```text
❌ 用户说"把不活跃用户标记为 inactive"
❌ AI 直接 db_execute UPDATE users SET status='inactive' WHERE last_login_at < '...'
❌ 跑完才发现日期写错，多更新了 10 万行
```

### 大批量写的检查清单

| 检查项 | 做法 |
|--------|------|
| WHERE 命中行数 | 先 `SELECT COUNT(*)` |
| 是否影响生产关键表 | 看表名 + 字段（users/orders/payments 等需要更慎重） |
| 是否可回滚 | 没 BEGIN/COMMIT 包就无法回滚；考虑 db_transaction（未来） |
| 是否需要先备份 | 大改动前提示用户 `mysqldump --where=...` 留底 |

## 排查清单（连不上 / 报错）

| 现象 | 排查 |
|------|------|
| 连接超时（5s） | host/port 不可达 → 让用户在「服务凭据」页点"测试连接"验证 |
| Access denied | user/password 错 → reveal 字段对比 |
| Unknown database | database 名错 → `SHOW DATABASES` |
| 字符集乱码 | MySQL connect 默认 utf8mb4；DB 端字符集不对头 |
| `[unsupported:DATE]` 占位 | driver-specific 类型，SQL 里 CAST 成文本 |
| `truncated: true` + 不全 | 加大 `limit` 或加 `WHERE` 缩小集合 |
| db_execute 总是 denied | 服务器 `ai_policy` 不是 trusted；让用户调档位或自己在 UI 跑 |

---
