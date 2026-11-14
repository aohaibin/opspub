---
name: redis-ops
description: Redis 运维速查 —— 健康/慢查询/内存/持久化/Cluster/Sentinel，含危险命令清单。
触发词: redis, 缓存, redis-cli, 内存暴涨, redis 慢, oom, 持久化, rdb, aof, cluster, sentinel, redis 主从, redis 备份, redis 连不上, redis 起不来, redis 报错, 缓存挂了, 缓存连不上, 清缓存, 刷缓存, key 没了, 缓存丢了, redis 7, redis 安装, 装 redis, 部署 redis, valkey, keydb, redis stack, bigkey, hot key, 大 key, 热 key, requirepass, slowlog, dbsize, keys 命令, scan 替代 keys, redis 主从切换, replicaof, sentinel 切主
dangerous_commands:
  - '(?i)\bredis-cli\b[^\n]*\b(?:FLUSHALL|FLUSHDB)\b'
  - '(?i)\bredis-cli\b[^\n]*\bDEBUG\s+SLEEP\b'
  - '(?i)\bredis-cli\b[^\n]*\bSHUTDOWN\b'
  - '(?i)\bredis-cli\b[^\n]*\bCONFIG\s+SET\s+save\b'
  - '(?i)\bredis-cli\b[^\n]*\bCLUSTER\s+RESET\b'
---

# redis-ops —— Redis 运维速查

适用：用户报"redis 内存炸了"/"接口慢都是 redis 拖的"/"主从切完了没同步上"/"忘了 requirepass"/"想备份单库"。

## 🤖 第零步：优先用 OpsPub 专用工具

- 🔴 **数据 CRUD（GET/SET/DEL/SCAN/HGETALL/慢日志查询等）走 `redis_*` 工具**（`redis_get` / `redis_set` / `redis_del` / `redis_scan` / `redis_exec`，详见 **redis-tools** 技能）——密码不进 shell history、SCAN 不阻塞、`FLUSHALL`/`FLUSHDB` 进「极高危」审批（须用户验证身份）、`CONFIG`/`SHUTDOWN` 在 executor 永久拦。**别用 `ssh_exec redis-cli` 去读写 key**。
- **本技能讲的是服务端运维**（redis.conf 配置、RDB/AOF 持久化、主从/哨兵/Cluster 拓扑、内存淘汰/maxmemory 调优）——这些不是数据 CRUD，走 `sftp_*` + `ssh_exec`：
  - **看 redis 服务状态** → `service_status(server, "redis")` 或 `redis-server`（任何档位放行）。
  - **看日志** → `tail_log(server, "/var/log/redis/redis-server.log")`。
  - **查 6379 端口** → `port_check(server, 6379)`。
  - **改 redis.conf** → `sftp_read` 看现状 + `sftp_write` 整文件写，写完 `ssh_exec sudo systemctl restart redis`（或在 redis_exec 里走 `CONFIG REWRITE`，但 `CONFIG SET`/`CONFIG REWRITE` 受策略管控）。

⚠️ 写操作、`sudo` 重启会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## ⭐ 装机：`install_app(server, "redis")` 一把过（应用商店同款，进台账）

### 装前**强制**探测（避免重复装/撞端口）
1. MCP `list_installed_services` 查现有 `redis_conn`——🔴 **Redis 是全机共享设施，已装就复用、别重复装**。
2. 端口 6379 是否占用（`port_check`）。

🔴 **装 Redis 一律用 `install_app`**——Redis 在 OpsPub 应用商店目录里，`install_app` = 应用商店 UI 同款：密码 OpsPub 生成并**同步进容器+凭据库（两边一致、必连得上）**、容器 `reeve-redis`、绑 `127.0.0.1`、compose 落 `/opt/reeve/stacks/redis`、**自动登记 `redis_conn` 凭据带 SSH 隧道**（「数据库→Redis」页即装即连）。

```json
{ "tool": "install_app", "args": { "server": "<别名>", "app": "redis" } }
```
可选 `version` / `port`（默认 6379）。label 通用名 `Redis`，第二个项目共用同一套。

> ⛔ **别用 `install_with_secret` 手写 docker-compose 装 Redis**——手写易致"存的密码≠容器密码"（工作台连不上）、容器命名/路径不规范。`install_with_secret` 只留给应用商店目录里没有的自定义服务。

## 🪟 Windows 服务器（OpsPub 原生安装 = Memurai —— 与上文 Linux 不同）

目标机是 **Windows** 时，OpsPub 装的是 **Memurai**（Redis 兼容的 Windows 原生实现，官方 Redis 不出 Windows 版）。上文 systemctl / apt / `/etc/redis` 不适用，改用下表：

| 事项 | Linux（Redis） | **Windows（Memurai）** |
|------|-------|------|
| 安装 | `install_app(server,"redis")`（Docker） | `install_app(server,"redis")` 同款——Windows 走 choco `memurai-developer`，**无需 Docker** |
| 服务名 | `redis` / `redis-server` | **`Memurai`** |
| 启停/重启 | `systemctl restart redis` | `Restart-Service Memurai`（`ssh_exec` 包 `powershell -Command`） |
| 服务状态 | `service_status(server,"redis")` | `service_status(server,"Memurai")`（OS 感知） |
| CLI | `redis-cli` | `memurai-cli.exe`（`C:\Program Files\Memurai\`；与 redis-cli 命令完全兼容） |
| 主配置 | `/etc/redis/redis.conf` | `C:\Program Files\Memurai\memurai.conf`（改配置用 `sftp_read`+`sftp_write`，改完 `Restart-Service Memurai`） |

🔴 **查/改数据首选 `redis_*` 工具**（`redis_scan`/`redis_get`/`redis_set`/`redis_del`/`redis_exec`）——走 SSH 隧道协议层，**Memurai 与 Redis 协议 100% 兼容，Windows / Linux 完全一样**。上文所有 `INFO` / `CONFIG` / 内存诊断命令在 Memurai **原样适用**。
- **绑定**：OpsPub 已在 memurai.conf 写 `bind 127.0.0.1` + `requirepass`（密码由 OpsPub 生成入凭据库 `redis_conn`），仅本机，远程走 SSH 隧道。
- **未验证**：Redis Cluster / Sentinel 在 Windows/Memurai 非常规，OpsPub 未验证。

## 第一步：连接和健康（Linux）

```bash
redis-cli -h 127.0.0.1 -p 6379 ping            # 无密码
redis-cli -h <host> -p <port> -a '<pass>' ping  # 有密码（⚠️ 命令行带 -a 会进 shell history）
# 推荐：用 REDISCLI_AUTH 环境变量传密码
REDISCLI_AUTH='<pass>' redis-cli -h <host> -p <port> ping
```

`PONG` = 通；`NOAUTH Authentication required` = 要密码。

## 第二步：基础诊断

```bash
redis-cli INFO server      # 版本 / uptime / 进程
redis-cli INFO memory      # used_memory_human / maxmemory / mem_fragmentation_ratio
redis-cli INFO stats       # 命中率：keyspace_hits / keyspace_misses
redis-cli INFO replication # 主从角色 / 复制偏移
redis-cli INFO persistence # RDB / AOF 状态
redis-cli DBSIZE           # 当前 db 的 key 数
redis-cli CLIENT LIST      # 连接列表
```

## 第三步：内存暴涨排查

**永远不要** `KEYS *`（O(N) 会阻塞）—— 用 `--bigkeys` / `MEMORY USAGE`：

```bash
redis-cli --bigkeys                          # 扫描各类型的最大 key（采样，安全）
redis-cli MEMORY USAGE <key>                 # 单 key 占用
redis-cli MEMORY STATS                       # 整体内存分布
redis-cli --memkeys                          # 类似 --bigkeys 但更细
redis-cli --hotkeys                          # 热 key（需 LFU 模式）
```

确认 `maxmemory-policy`：

```bash
redis-cli CONFIG GET maxmemory-policy
# allkeys-lru（推荐缓存场景）/ volatile-lru / noeviction（默认，会 OOM）
```

## 第四步：慢查询

```bash
redis-cli CONFIG GET slowlog-log-slower-than   # 阈值（微秒；默认 10000 = 10ms）
redis-cli SLOWLOG GET 50                       # 最近 50 条慢 log
redis-cli SLOWLOG RESET                        # 清空（看完一次后清，便于下次复盘）
redis-cli SLOWLOG LEN                          # 数量
```

## 第五步：持久化

| 模式 | 触发 | 文件 |
|------|------|------|
| **RDB** | `save 900 1` / `BGSAVE` 命令 | `<dir>/dump.rdb` |
| **AOF** | 每条写命令追加 | `<dir>/appendonly.aof` |
| **混合** | RDB base + AOF 增量（推荐） | 上述两者 |

```bash
redis-cli CONFIG GET dir                     # 持久化目录
redis-cli CONFIG GET save                    # RDB 触发条件
redis-cli CONFIG GET appendonly              # AOF 是否开启
redis-cli CONFIG GET aof-use-rdb-preamble    # 混合持久化
redis-cli BGSAVE                             # 异步全量 RDB（推荐）
redis-cli BGREWRITEAOF                       # 异步重写 AOF
redis-cli LASTSAVE                           # 上次成功 RDB 的 unix 时间戳
```

## 第六步：备份与恢复

**备份**（在 master 上做，从库会自动同步状态）：

```bash
# 1) 触发 RDB
redis-cli BGSAVE
# 2) 等到 LASTSAVE 时间戳变化
redis-cli LASTSAVE
# 3) 拷走 dump.rdb（用 OpsPub SFTP）
ls -lh "$(redis-cli CONFIG GET dir | tail -n1)/dump.rdb"
```

**恢复**：服务停掉 → 替换 dump.rdb → 启动。`AOF` 优先于 `RDB` 加载，恢复 RDB 时需要先关 AOF 或删 appendonly.aof。

## 第七步：主从 / 哨兵

主从状态：

```bash
redis-cli INFO replication
# role:master + connected_slaves:N → master OK
# role:slave + master_link_status:up → slave OK
```

切主（运维场景）：

```bash
# 在 slave 上：晋升为 master
redis-cli REPLICAOF NO ONE
# 在其它实例上：指向新 master
redis-cli REPLICAOF <new-master-ip> <port>
```

Sentinel：

```bash
redis-cli -p 26379 SENTINEL masters
redis-cli -p 26379 SENTINEL master <mymaster>
redis-cli -p 26379 SENTINEL slaves <mymaster>
redis-cli -p 26379 SENTINEL get-master-addr-by-name <mymaster>
```

Cluster：

```bash
redis-cli -c -p 6379 CLUSTER INFO
redis-cli -c -p 6379 CLUSTER NODES
redis-cli --cluster check 127.0.0.1:6379
```

## 第八步：常用配置位置

| 内容 | 路径 |
|------|------|
| 主配置（包安装） | `/etc/redis/redis.conf` 或 `/etc/redis.conf` |
| 主配置（Docker） | `/opt/1panel/apps/redis/redis/conf/redis.conf`（1Panel） |
| 数据目录 | `CONFIG GET dir` 看 |
| 日志 | `/var/log/redis/redis-server.log` 或 `journalctl -u redis` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `FLUSHALL` / `FLUSHDB` | 清所有 / 当前 db 数据，**不可恢复** |
| `KEYS *` | O(N) 阻塞（生产**禁用**），用 `SCAN` 代替 |
| `DEBUG SLEEP n` | 阻塞 redis n 秒（接口全挂） |
| `CONFIG SET save ""` | 关 RDB 持久化（无 AOF 时丢全部数据） |
| `CLUSTER RESET` | 重置节点 cluster 状态（脑裂高危） |
| `SHUTDOWN` | 关 redis（带 NOSAVE 时丢未持久化数据） |
| `redis-cli -a` | 命令行明文密码会进 shell history，用 `REDISCLI_AUTH` 环境变量 |

## 教训

- **永远用 `--scan` 不用 `KEYS`**，哪怕 `KEYS user:*` 在 100w key 的库上也会阻塞数百毫秒，足以让上游接口超时雪崩。
- 切主只切一次 —— 用 sentinel/cluster 不要手 `REPLICAOF`，否则一不留神就脑裂。
- `--bigkeys` 是采样的，结果只代表"扫到的最大值"；持续暴涨的场景要循环跑几轮。
- `requirepass` 改了之后**必须**同步改 slave 的 `masterauth`、Sentinel 的 `sentinel auth-pass`，否则主从断连。

---
