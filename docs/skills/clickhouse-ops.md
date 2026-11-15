---
name: clickhouse-ops
description: ClickHouse 运维 —— clickhouse-client / system.* / parts / merges / ReplicatedMergeTree / 备份。
触发词: clickhouse, ck 库, click house, olap, mergetree, replicatedmergetree, distributed, materialized view, clickhouse 慢, clickhouse 备份, clickhouse-backup, clickhouse 安装, 装 clickhouse, 部署 clickhouse, clickhouse-client, clickhouse 连不上, clickhouse 起不来, parts 太多, too many parts, merge 太慢, replica 不同步, 数据导入, optimize 表, alter table, ttl, partition, 大数据查询, 分析型数据库, 列式数据库, system.parts, system.merges, system.replication_queue
dangerous_commands:
  - '(?i)\bclickhouse-client\b[^\n]*--query\s+["''][^"'']*\bDROP\s+(?:DATABASE|TABLE)\b'
  - '(?i)\bclickhouse-client\b[^\n]*--query\s+["''][^"'']*\bTRUNCATE\s+TABLE\b'
  - '(?i)\bclickhouse-client\b[^\n]*--query\s+["''][^"'']*\bDROP\s+PARTITION\b'
  # SYSTEM DROP REPLICA：清副本元数据，集群层面误用难恢复
  - '(?i)\bclickhouse-client\b[^\n]*--query\s+["''][^"'']*\bSYSTEM\s+DROP\s+REPLICA\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:/var/lib/clickhouse|/data/clickhouse)(?:\s|/|$)'
---

# clickhouse-ops —— ClickHouse 运维

适用：用户用 ClickHouse 做 OLAP；想"查表慢"/"part 太多"/"replica 不同步"/"备份"/"加节点"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 ClickHouse 优先用 `install_app(server, "clickhouse")`**（在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run` / apt 装仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。

- **看 clickhouse-server 服务状态** → `service_status(server, "clickhouse-server")`（任何档位放行）。
- **看日志尾部** → `tail_log(server, "/var/log/clickhouse-server/clickhouse-server.err.log")`。
- **查端口** → `port_check(server, 9000)`（TCP）/ `port_check(server, 8123)`（HTTP）。
- **改 config.xml / users.xml** → `sftp_read` 看现状 + `sftp_write` 整文件写，写完 `ssh_exec clickhouse-client -q "SYSTEM RELOAD CONFIG"`。

🔴 **ClickHouse 的查询/DDL（SELECT、ALTER、OPTIMIZE 等）走 `ssh_exec clickhouse-client --query '...'`**——OpsPub 的 `db_*` 工具**只认 mysql/postgres/sqlite**（`detect_driver_from_kind`），**没有 ClickHouse 适配**。OpsPub 能加密存 ClickHouse 凭据供「人用数据库工作台」，但 AI 侧不能用 `db_query` 查 CH，别尝试。

⚠️ 写 SQL（DROP/ALTER/OPTIMIZE）、改配置、`sudo` 重启都会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## 第一步：连接

```bash
clickhouse-client -h host -u default --password 'xxx' --database mydb
clickhouse-client -h host -q "SHOW DATABASES"
clickhouse-client --multiquery < script.sql
clickhouse-client --format Pretty -q "..."
clickhouse-client --format CSVWithNames -q "SELECT ..." > ~/.opspub/backups/export-$(date +%F).csv   # 导出落 OpsPub 工作区

# HTTP 接口
curl 'http://host:8123/?query=SHOW%20DATABASES' -u 'default:xxx'
curl 'http://host:8123/?database=mydb' --data-binary "SELECT count() FROM mytable"
```

## 第二步：system.* 高频表

ClickHouse 的"运维一切都靠 system.*"：

```sql
-- 实时查询
SELECT query_id, user, elapsed, formatReadableSize(memory_usage), query
FROM system.processes ORDER BY elapsed DESC;

-- 历史查询（**前提**：config 里启用 query_log）
SELECT query_duration_ms, read_rows, formatReadableSize(memory_usage), query
FROM system.query_log
WHERE event_time > now() - INTERVAL 1 HOUR AND type = 'QueryFinish'
ORDER BY query_duration_ms DESC LIMIT 20;

-- 表的 parts
SELECT table, count() AS parts, formatReadableSize(sum(bytes_on_disk)) AS size
FROM system.parts WHERE active GROUP BY table ORDER BY parts DESC;

-- 表的 part 详情
SELECT name, partition, rows, formatReadableSize(bytes_on_disk), modification_time
FROM system.parts WHERE active AND table = 'mytable';

-- merges 进度
SELECT * FROM system.merges;

-- mutations 进度
SELECT * FROM system.mutations WHERE NOT is_done;

-- 副本状态
SELECT database, table, is_leader, total_replicas, active_replicas,
       absolute_delay, queue_size, log_max_index, log_pointer
FROM system.replicas;

-- 表大小 + 行数
SELECT database, name, engine,
       formatReadableSize(total_bytes), total_rows
FROM system.tables WHERE database NOT IN ('system','INFORMATION_SCHEMA');

-- 磁盘 / 存储策略
SELECT * FROM system.disks;
SELECT * FROM system.storage_policies;

-- 集群拓扑
SELECT * FROM system.clusters;

-- macros（每节点配置标识）
SELECT * FROM system.macros;
```

## 第三步：杀查询

```sql
KILL QUERY WHERE query_id = '<uuid>';                    -- ⚠️ 走审批
KILL QUERY WHERE user = 'badguy';
KILL QUERY WHERE elapsed > 600;                          -- 杀超过 10 分钟的
KILL MUTATION WHERE table = 'mytable' AND mutation_id = 'mutation_42.txt';
```

## 第四步：MergeTree 家族

| 引擎 | 用途 |
|------|------|
| `MergeTree` | 基础列式存储 |
| `ReplacingMergeTree(ver)` | 按 ORDER BY 去重（按 ver 取最新） |
| `SummingMergeTree` | 数值列自动求和 |
| `AggregatingMergeTree` | 配合物化视图聚合 |
| `CollapsingMergeTree` / `VersionedCollapsing*` | 累加抵消（计数风格） |
| `Replicated*` 前缀 | 上述任一引擎的副本版本（基于 ZooKeeper / Keeper） |
| `Distributed` | 跨 shard 路由（不存数据，只转发） |

### Replicated 表的 ZK 路径

```sql
CREATE TABLE mytable ON CLUSTER mycluster (
    id UInt64, ts DateTime, v Float64
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/mytable', '{replica}')
ORDER BY (id, ts)
PARTITION BY toYYYYMM(ts);
```

`{shard}` `{replica}` 是 `macros` 替换。

## 第五步：partition 操作

```sql
-- 列分区
SELECT DISTINCT partition FROM system.parts WHERE table = 'mytable' AND active;

-- 删分区（**回收磁盘的主要手段**）
ALTER TABLE mytable DROP PARTITION '202401';                    -- ⚠️ 走审批
ALTER TABLE mytable DETACH PARTITION '202401';                  -- 分离到 detached/，可手工恢复

-- 优化（强制 merge，慎用大表）
OPTIMIZE TABLE mytable PARTITION '202401' FINAL;                -- 阻塞 + IO 重
OPTIMIZE TABLE mytable PARTITION '202401' DEDUPLICATE;
```

## 第六步：TTL（自动过期）

```sql
ALTER TABLE mytable MODIFY TTL ts + INTERVAL 90 DAY;

-- 多级 TTL：先冷存储再删
ALTER TABLE mytable MODIFY TTL
    ts + INTERVAL 30 DAY TO VOLUME 'cold',
    ts + INTERVAL 90 DAY DELETE;
```

## 第七步：mutations（DELETE / UPDATE 异步实现）

```sql
ALTER TABLE mytable DELETE WHERE id = 12345;
ALTER TABLE mytable UPDATE name = 'newname' WHERE id = 12345;

-- 看进度
SELECT * FROM system.mutations WHERE NOT is_done;
-- 取消
KILL MUTATION WHERE table = 'mytable' AND mutation_id = '...';
```

> ⚠️ Mutations 是**异步**且**重写整个 part**（含未变的行），代价高；不要拿 ClickHouse 当 OLTP。

## 第八步：备份

### clickhouse-backup（推荐）

```bash
# 装
curl -sLO https://github.com/Altinity/clickhouse-backup/releases/latest/download/clickhouse-backup-linux-amd64.tar.gz
tar xzf clickhouse-backup-linux-amd64.tar.gz
sudo mv build/linux/amd64/clickhouse-backup /usr/local/bin/

# 配置 /etc/clickhouse-backup/config.yml（最少）
clickhouse:
  username: backup
  password: xxx
  port: 9000
general:
  remote_storage: s3
s3:
  endpoint: minio.example.com:9000
  bucket: ch-backup
  access_key: xxx
  secret_key: xxx

# 操作
clickhouse-backup create my-backup                            # 本地快照
clickhouse-backup upload my-backup                            # 上传到 S3
clickhouse-backup list local
clickhouse-backup list remote
clickhouse-backup restore my-backup                           # 恢复
clickhouse-backup restore_remote my-backup
```

### Native FREEZE（增量硬链接快照）

```sql
ALTER TABLE mytable FREEZE PARTITION '202401';
-- 文件出现在 /var/lib/clickhouse/shadow/<n>/store/...
```

## 第九步：分布式集群

```sql
-- 集群配置在 /etc/clickhouse-server/config.d/clusters.xml
-- (远程节点列表 + shard/replica 拓扑)

-- 创建分布式表（不存数据，路由到 shard）
CREATE TABLE mytable_dist AS mytable
ENGINE = Distributed('mycluster', 'mydb', 'mytable', rand());

-- 路由用 hash on ORDER BY 第一列更好
ENGINE = Distributed('mycluster', 'mydb', 'mytable', cityHash64(id));

-- 查 / 写都走 _dist 表
SELECT count() FROM mytable_dist;
INSERT INTO mytable_dist VALUES (...);
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 主配置 | `/etc/clickhouse-server/config.xml` |
| 用户 / 权限 | `/etc/clickhouse-server/users.xml`（或 users.d/*.xml） |
| 集群配置 | `/etc/clickhouse-server/config.d/clusters.xml` |
| 数据 | `/var/lib/clickhouse/`（store / data / metadata） |
| 日志 | `/var/log/clickhouse-server/` |
| socket | TCP 9000 / HTTP 8123 / TLS 9440 |
| systemd | `clickhouse-server` |

## 危险操作清单（务必经审批）

| 命令 / SQL | 后果 |
|-----------|------|
| `DROP DATABASE` / `DROP TABLE` | 删表 + 数据（**Replicated 表会通知所有副本**） |
| `TRUNCATE TABLE` | 清空表 |
| `ALTER TABLE DROP PARTITION` | 删分区数据 |
| `ALTER TABLE ... DELETE WHERE` | 异步重写整 part |
| `OPTIMIZE TABLE ... FINAL` 大表 | 阻塞 + 磁盘 IO 飙满几小时 |
| `SYSTEM DROP REPLICA` / `DROP DATABASE ... SYNC` | 副本元数据清理 |
| `rm -rf /var/lib/clickhouse` | 删数据目录 |
| 删 detached 分区 | 误删后恢复无门 |
| 改 `<users>` 配置错 + reload | 自己登不上 |

## 教训

- ClickHouse **不是 OLTP**：DELETE / UPDATE 都重写 part，每秒几千次更新 = 性能崩溃。
- "parts 太多"（`Too many parts (300)`）告警 = 写入太碎（频繁小 INSERT）；解决：**批量插入** 1000-10000 行一次，或者 Buffer Engine 中间层。
- ReplicatedMergeTree 需要 ZooKeeper / ClickHouse Keeper —— 后者是官方内置替代，新部署优先用 Keeper。
- 副本"卡住"（`absolute_delay > 1000`）多半是 ZK 连接不稳 / 网络抖动；先看 `system.replication_queue`。
- TB 级备份**不要 dump SQL**，用 `clickhouse-backup` 增量 + S3 / MinIO。
- 改 `users.xml` 之后大多数情况会**自动 reload**（watching files），但**别依赖** —— 显式 SYSTEM RELOAD CONFIG 更可靠。
- 分布式表 INSERT 走 `_dist` 慢且容易丢（异步转发），写入直接连各 shard 的 local 表更稳。

---
