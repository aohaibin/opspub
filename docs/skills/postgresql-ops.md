---
name: postgresql-ops
description: PostgreSQL 运维速查 —— psql / pg_dump / 角色权限 / 慢查询 / vacuum / 流复制 / extension。
触发词: postgres, postgresql, psql, pg_dump, pg_restore, pg_basebackup, vacuum, autovacuum, pgsql, postgresql 备份, postgresql 主从, replication, wal, pg_wal, role, extension, slow query, pg_stat_statements, postgres 连不上, postgres 慢, pg 连接超时, postgres 起不来, 数据库连不上, pg 安装, 装 postgres, 部署 postgres, postgres 17, postgres 16, postgresql 17, 死锁, pg 锁表, pg 慢查询, pg 备份, pg 恢复, pgbouncer, postgis, 表膨胀, vacuum full, pg_hba.conf, postgresql.conf, scram-sha-256
dangerous_commands:
  - '(?i)\bpsql\b[^\n]*-c\s+["''][^"'']*\bDROP\s+(?:DATABASE|SCHEMA|TABLE|ROLE|USER)\b'
  - '(?i)\bpsql\b[^\n]*-c\s+["''][^"'']*\bTRUNCATE\s+\w+'
  - '(?i)\bpsql\b[^\n]*-c\s+["''][^"'']*\bDELETE\s+FROM\s+\w+\s*(?:;|["''])'
  - '(?:^|[\s;&|])pg_resetwal\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/postgresql(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\b[^\n]*pg_wal\b'
---

# postgresql-ops —— PostgreSQL 运维速查

适用：用户报"pg 连不上 / 慢死 / 表锁 / 主从延迟 / vacuum 跑不停 / 想备份 / 改用户权限"。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| **查数据（SELECT/WITH/EXPLAIN）** | `db_query(credential, "SELECT ...")` | `psql -c "SELECT ..."` |
| **写数据（INSERT/UPDATE/DDL）** | `db_execute(credential, "...")` | `psql -c "UPDATE ..."` |
| **多语句原子事务** | `db_transaction(credential, ["...", "..."])` | `psql -c "BEGIN;...;COMMIT;"` |
| 看 postgres 服务状态 | `service_status(server, "postgresql")` | systemctl status |
| 看日志尾部 | `tail_log(server, "/var/lib/postgresql/<ver>/main/log/...")` | tail -n |
| 查 5432 端口监听 | `port_check(server, 5432)` | ss -tlnH |
| 改 postgresql.conf / pg_hba.conf | `sftp_read` 看现状 + `sftp_write` 整文件写 | vi / sed -i |

`credential` = OpsPub 登记的 DB 凭据 label 或 vault_id（kind=`postgres_conn`，经 `list_installed_services` 筛）。

🔴 **AI 查/改 PostgreSQL 数据，优先 `db_*` 工具而非 `ssh_exec psql -c`**，理由：① 密码不进 shell history / `ps`（`db_*` 由 OpsPub 后端注入解密凭据，不用 `PGPASSWORD=` 暴露）；② 结构化结果（带列名/类型）；③ 危险 SQL 自动拦（见下）；④ 出口脱敏。`db_query` 只读（仅 SELECT/WITH），**readonly 档也放行**。
- 🛑 **「极高危」SQL**：`DROP DATABASE` / `TRUNCATE` / 无 WHERE 的 `UPDATE`/`DELETE` —— `db_*` 不会直接执行，而是进**极高危审批**：用户必须在 OpsPub 桌面端**手敲库名 / 表名并验证身份**（Windows Hello / Touch ID / 主密码）才会批准，每次一验、只放行这一条。你的调用会等到用户裁决（最长 5 分钟）；被拒绝或超时就停手，**别绕道改用 `ssh_exec psql -c` / `dropdb`**（那条路同样是极高危审批，只是换了个入口）。`GRANT ALL` 等提权写法则永久拦截，没有审批出口。发起前先用只读 SQL 确认目标（库大小、表行数、有没有备份）并讲给用户。
- **服务端运维**（启停 postgres、改 postgresql.conf/pg_hba.conf、流复制、pg_dump 备份、vacuum 配置）仍走 `service_status` / `sftp_*` / `ssh_exec`——这些不是 SQL，`db_*` 不覆盖。

⚠️ 含 `sudo` 或写操作的命令会触发**用户审批**——执行前先告诉用户，被拒后不要原样重试。

## ⭐ 装机：`install_app(server, "postgres")` 一把过（应用商店同款，进台账）

### 装前**强制**探测（避免重复装/撞端口）
1. MCP `list_installed_services` 查现有 `postgres_conn`——已装就复用（共享设施）。
2. 端口 5432 是否占用（`port_check`）。

🔴 **装 PostgreSQL 一律用 `install_app`**——postgres 在 OpsPub 应用商店目录里，`install_app` = 应用商店 UI 同款：密码 OpsPub 生成并**同步进容器+凭据库（两边一致、必连得上）**、容器 `reeve-postgres`、绑 `127.0.0.1`、compose 落 `/opt/reeve/stacks/postgres`、**自动登记 `postgres_conn` 凭据带 SSH 隧道**（「数据库」页即装即连）。

```json
{ "tool": "install_app", "args": { "server": "<别名>", "app": "postgres" } }
```
可选 `version` / `port`（默认 5432）。label 通用名、共享复用。

> ⛔ **别用 `install_with_secret` 手写 docker-compose 装 PostgreSQL**——手写易致"存的密码≠容器密码"（尤其 PGDATA 非空时新密码用不了 → password authentication failed），且容器命名/路径不规范。`install_with_secret` 只留给应用商店目录里没有的自定义服务。
> 注：data 卷非空（装失败重来）→ 先 `rm -rf <stacks>/postgres/data` 再重 `install_app`；要复用旧数据则需旧密码、用 `save_credential` 登记。

## 🪟 Windows 服务器（OpsPub 原生安装 —— 与上文 Linux 命令全不同！）

目标机是 **Windows** 时，上文 systemctl / apt / `/etc/postgresql` / `/var/lib/pgsql` **一律不适用**。OpsPub 在 Windows 用 **EDB binaries-zip**（非 bitrock 安装器）装 PostgreSQL **16.14**，改用下表：

| 事项 | Linux | **Windows（OpsPub 装的）** |
|------|-------|------|
| 安装 | `install_app(server,"postgres")`（Docker） | `install_app(server,"postgres")` 同款——Windows 走 binaries-zip + `initdb`（16.14），**无需 Docker**（下 311MB 较久） |
| 服务名 | `postgresql` / `postgresql-16` | **`postgresql`** |
| 启停/重启 | `systemctl restart postgresql` | `Restart-Service postgresql`（`ssh_exec` 包 `powershell -Command`；PG 拒绝 admin 交互启动，只能作服务运行） |
| 服务状态 | `service_status(server,"postgresql")` | `service_status(server,"postgresql")`（OS 感知，直接用） |
| 客户端 exe | `psql` | `C:\OpsPub\pg\pgsql\bin\psql.exe`（同目录有 `pg_dump.exe`/`pg_ctl.exe`） |
| 主配置 | `/etc/postgresql/16/main/postgresql.conf` | `C:\OpsPub\pg\pgdata\postgresql.conf` + `pg_hba.conf`（改配置用 `sftp_read`+`sftp_write`，改完 `Restart-Service postgresql`） |
| 数据目录 | `/var/lib/pgsql/16/data` | `C:\OpsPub\pg\pgdata` |

🔴 **查/改数据仍首选 `db_*` 工具**——走 SSH 隧道协议层，**Windows / Linux 一样**。上文所有诊断 SQL（`pg_stat_activity` / 慢查询 / 杀连接 / 锁）在 Windows **原样适用**。
- **绑定**：OpsPub 已在 postgresql.conf 写 `listen_addresses = '127.0.0.1'`（仅本机），远程走 SSH 隧道。superuser=`postgres`，密码由 OpsPub 生成入凭据库（`postgres_conn`，scram-sha-256）。
- **备份**：`pg_dump.exe` 在 `bin\` 下，`$env:PGPASSFILE` 或 `$env:PGPASSWORD` 传密码（`ssh_exec` 里用 `powershell`），重定向到 Windows 路径。
- **未验证**：流复制 / pg_basebackup 主从在 Windows 非常规，OpsPub 未验证——用户坚持则走终端手动并提醒。

## 第一步：连接（Linux）

```bash
psql -h <host> -p 5432 -U postgres -d mydb         # 交互输密码
PGPASSWORD='xxx' psql -h ... -U postgres            # 环境变量
psql "postgresql://user:pass@host:5432/db?sslmode=require"  # URI

# .pgpass 文件（推荐，权限 0600）
echo "host:port:db:user:pass" >> ~/.pgpass
chmod 600 ~/.pgpass
```

不带 `-h` 默认走 socket：`/var/run/postgresql/.s.PGSQL.5432`（Debian）/ `/tmp/.s.PGSQL.5432`（自编译）。

psql 元命令：

```sql
\l            -- 列数据库
\c mydb       -- 切库
\dt           -- 列表
\d+ mytable   -- 表详情（含索引/外键/触发器）
\du           -- 列角色
\dn           -- 列 schema
\dp mytable   -- 表权限
\df+ myfunc   -- 函数定义
\timing on    -- 显示耗时
\x auto       -- 长行自动 expanded 显示
\watch 1      -- 重复跑上条 SQL（实时 dashboard）
```

## 第二步：状态诊断

```sql
-- 当前连接
SELECT pid, usename, datname, state, query_start, state_change, query
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY query_start;

-- 数据库大小
SELECT pg_size_pretty(pg_database_size(datname)) AS size, datname
FROM pg_database ORDER BY pg_database_size(datname) DESC;

-- 大表 TOP
SELECT schemaname, relname,
       pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;

-- 锁
SELECT * FROM pg_locks WHERE granted = false;
```

## 第三步：慢查询（必装 pg_stat_statements）

```sql
-- 一次性启用
ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';
-- 改完要 restart（不是 reload）
SELECT pg_reload_conf();   -- shared_preload_libraries 不支持 reload，必须 systemctl restart

CREATE EXTENSION pg_stat_statements;

-- top 慢 SQL
SELECT round(total_exec_time::numeric, 2) AS total_ms,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       left(query, 100) AS query
FROM pg_stat_statements
ORDER BY total_exec_time DESC LIMIT 20;

-- 重置统计
SELECT pg_stat_statements_reset();
```

慢日志（配置）：

```ini
# postgresql.conf
log_min_duration_statement = 500   # 记录 >500ms 的 SQL
log_statement = 'ddl'              # 'none'/'ddl'/'mod'/'all'
log_line_prefix = '%t [%p]: user=%u,db=%d,app=%a,client=%h '
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
```

```sql
SELECT pg_reload_conf();   -- 大部分参数 reload 生效
```

## 第四步：杀连接

```sql
-- 优雅取消（终止 query，连接保留）
SELECT pg_cancel_backend(<pid>);

-- 强杀（终止整个连接）
SELECT pg_terminate_backend(<pid>);

-- 一键杀某库的所有连接（删库前必跑）
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = 'mydb' AND pid <> pg_backend_pid();
```

## 第五步：备份

### 逻辑备份（pg_dump）

> 💾 **备份产物统一落 `~/.reeve/backups/`**（OpsPub 远程工作区），别臆造 `/backup`、`/data/backup`。先 `ssh_exec mkdir -p ~/.reeve/backups`；文件名带日期避免覆盖旧备份。

```bash
# 单库
pg_dump -h host -U postgres -F c -f ~/.reeve/backups/mydb-$(date +%F).dump mydb    # custom format（推荐）
pg_dump -h host -U postgres -F p -f ~/.reeve/backups/mydb-$(date +%F).sql mydb     # plain SQL

# 全库（集群级，含角色）
pg_dumpall -h host -U postgres > ~/.reeve/backups/all-$(date +%F).sql
pg_dumpall -h host -U postgres -g > ~/.reeve/backups/globals.sql       # 只角色 + tablespace

# 参数
-F c     # custom（推荐，可并行恢复）
-F d     # directory（多文件，可并行）
-F t     # tar
-j 4     # 并行（仅 -F d）
-Z 9     # 压缩级
--no-acl --no-owner   # 跨实例迁移用
-s       # 只 schema
-a       # 只数据
```

### 恢复

```bash
# custom / directory 格式
pg_restore -h host -U postgres -d mydb -j 4 mydb.dump
pg_restore --clean --if-exists --create -d postgres mydb.dump  # 重建库

# plain SQL
psql -h host -U postgres -d mydb < mydb.sql
```

### 物理备份（pg_basebackup）

```bash
# 全量基础备份（搭配 WAL 归档做 PITR）—— 落 OpsPub 工作区
pg_basebackup -h primary -U replicator -D ~/.reeve/backups/base -Ft -z -P -X stream
```

## 第六步：流复制（主从）

### 主库配置

```ini
# postgresql.conf
wal_level = replica
max_wal_senders = 10
wal_keep_size = 2GB             # 14+ （13- 用 wal_keep_segments）
archive_mode = on
archive_command = 'cp %p /archive/%f'

# pg_hba.conf
host replication replicator 10.0.0.0/24 scram-sha-256
```

### 创建复制用户

```sql
CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'xxx';
```

### 从库初始化

```bash
# 1) 停止 standby pg
systemctl stop postgresql

# 2) 清空 data
rm -rf /var/lib/postgresql/<ver>/main/*

# 3) 拉基础备份
pg_basebackup -h primary -U replicator -D /var/lib/postgresql/<ver>/main \
              -R -P -X stream   # -R 自动生成 standby.signal + recovery 配置

# 4) 启动
systemctl start postgresql
```

### 状态检查

```sql
-- 主库
SELECT * FROM pg_stat_replication;
SELECT pg_current_wal_lsn(), pg_walfile_name(pg_current_wal_lsn());

-- 从库
SELECT pg_is_in_recovery();    -- true = 在 standby
SELECT pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();

-- 延迟（字节）
SELECT pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn) AS lag_bytes
FROM pg_stat_replication;
```

### 切主（promote）

```bash
# 从库执行
pg_ctl promote -D /var/lib/postgresql/<ver>/main
# 或 SQL
SELECT pg_promote();
```

## 第七步：vacuum / autovacuum

```sql
-- 表膨胀粗看
SELECT relname, n_dead_tup, n_live_tup,
       round(n_dead_tup::numeric / nullif(n_live_tup, 0), 2) AS dead_ratio
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC LIMIT 20;

-- 手动
VACUUM ANALYZE mytable;
VACUUM FULL mytable;        -- ⚠️ 排他锁 + 重写整表（**业务高峰别用**）

-- autovacuum 状态
SELECT relname, last_autovacuum, autovacuum_count
FROM pg_stat_user_tables ORDER BY last_autovacuum DESC NULLS LAST LIMIT 20;
```

autovacuum 调参（postgresql.conf）：

```ini
autovacuum = on
autovacuum_naptime = 1min
autovacuum_vacuum_scale_factor = 0.1     # 表 10% 死元组就触发
autovacuum_analyze_scale_factor = 0.05
maintenance_work_mem = 1GB               # 大表 vacuum 要够内存
```

## 第八步：角色 / 权限

```sql
CREATE ROLE app LOGIN PASSWORD 'xxx';
CREATE DATABASE mydb OWNER app;
GRANT CONNECT ON DATABASE mydb TO app;
GRANT USAGE ON SCHEMA public TO app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app;

-- 默认权限（新建表自动授予）
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;

-- 改密码
ALTER ROLE app PASSWORD 'newpass';

-- 撤销 + 删除
REVOKE ALL ON DATABASE mydb FROM app;
DROP ROLE app;
```

## 第九步：常用 extension

| extension | 用途 |
|-----------|------|
| `pg_stat_statements` | 慢查询统计（强烈推荐预装） |
| `pgcrypto` | 加密函数（uuid/sha/aes） |
| `uuid-ossp` | uuid_generate_v4() 等 |
| `postgis` | 地理空间 |
| `pg_trgm` | trigram + GIN 模糊查询索引 |
| `btree_gin` / `btree_gist` | 复合索引 |
| `pg_partman` | 表分区自动化 |
| `timescaledb` | 时序数据 |

```sql
CREATE EXTENSION pg_stat_statements;
DROP EXTENSION pg_stat_statements;
\dx                 -- 列已装
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 主配置 | `/etc/postgresql/<ver>/main/postgresql.conf` (Debian) / `/var/lib/pgsql/data/postgresql.conf` (RHEL) |
| 认证配置 | `pg_hba.conf`（与主配置同目录） |
| 数据目录 | `SHOW data_directory`（默认 `/var/lib/postgresql/<ver>/main`） |
| WAL | `<data_dir>/pg_wal/` |
| 日志 | `<data_dir>/log/` 或 journal |
| socket | `/var/run/postgresql/.s.PGSQL.5432`（Debian）/ `/tmp/.s.PGSQL.5432` |
| systemd unit | `postgresql@<ver>-main`（Debian） / `postgresql-<ver>`（RHEL） |
| Docker / 1Panel | `/opt/1panel/apps/postgresql/postgresql/data/` |

## 危险操作清单（务必经审批）

| 命令 / SQL | 后果 |
|-----------|------|
| `DROP DATABASE` / `DROP TABLE` / `DROP ROLE` | 永久丢数据 / 失去权限 |
| `TRUNCATE TABLE` | 全表清空，不可回滚 |
| 无 WHERE 的 `DELETE` / `UPDATE` | 全表覆盖 |
| `VACUUM FULL` 大表 | 排他锁 + 长时间阻塞业务 |
| `pg_resetwal` | 重置 WAL（**事务日志直接丢**，最后手段救火专用） |
| `rm pg_wal/*` | 删 WAL（库直接起不来） |
| `rm -rf /var/lib/postgresql` | 删数据目录 |
| `pg_terminate_backend` 主从复制连接 | 主从断连 |

## 教训

- **PITR 必须**搭 `archive_mode=on` + `archive_command` 把 WAL 归档到独立存储；只有 base backup 没归档 = PITR 不了。
- `VACUUM FULL` 是排他锁，**业务低峰才能用**；想缩表又不阻塞用 `pg_repack`。
- `pg_stat_statements` 是慢查询神器，**所有生产 pg 上线第一件事就是装它**。
- 改 `shared_preload_libraries` 要 **`systemctl restart`**，`SELECT pg_reload_conf()` 没用。
- 切主后**永远要更新连接串**到所有客户端，否则写还会指向老主。
- `pg_dump` 是逻辑备份，恢复时按行重建索引；TB 级库**用 `pg_basebackup` + WAL 归档**做物理备份。
- 主从延迟瞬时飙大多半是**长事务**：从库 standby 不能清死元组要等 master 完成，看 `pg_stat_activity` 找长事务。

---
