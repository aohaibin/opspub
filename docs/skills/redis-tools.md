---
name: redis-tools
description: OpsPub Redis 直连工具 redis_get / redis_set / redis_del / redis_scan / redis_exec —— 通过已登记的 redis_conn 凭据安全操作 Redis，密码加密 + 危险命令拦截（清库类进极高危审批，改配置 / 逃逸类永久拦）。
触发词: redis, 缓存, redis 查询, redis 写入, redis 删除, KEYS, SCAN, GET, SET, HGETALL, LRANGE, ZRANGE, INFO, 慢日志, slowlog, redis 密码, redis 连接, redis_get, redis_set, redis_del, redis_scan, redis_exec, 看 redis, 查 redis, 取 key, 写 key, 删 key, 扫 key, 看 key, redis 直连, 不用 ssh 跑 redis, redis ttl, expire, hash 字段, list 元素, zset 排名
dangerous_commands:
  # AI 经 redis_exec 跑的 pseudo command 形如 "[opspub-internal] redis_exec <args...>"。这里加一些
  # 跟主防线（redis_exec.rs::check_dangerous_redis）独立的补充模式，trusted 档也挡住。
  - '(?i)\[opspub-internal\]\s+redis_(?:exec|set|del)\s+[^\n]*\bFLUSHALL\b'
  - '(?i)\[opspub-internal\]\s+redis_(?:exec|set|del)\s+[^\n]*\bFLUSHDB\b'
  - '(?i)\[opspub-internal\]\s+redis_(?:exec|set|del)\s+[^\n]*\bSHUTDOWN\b'
  - '(?i)\[opspub-internal\]\s+redis_(?:exec|set|del)\s+[^\n]*\bCONFIG\s+(?:SET|RESETSTAT)\b'
---

# redis-tools —— Redis 直连工具

## 🤖 适用场景

用户问"看下 Redis 里 user:42 的值"、"清缓存"、"统计有多少 session"、"批量删过期 key"、"查 INFO" ……
**只要用户在 OpsPub 登记过 redis_conn 凭据，AI 都应该用 redis_* 工具，而不是 `ssh_exec redis-cli ...`**。

## 🔴 为什么不用 ssh_exec + redis-cli？

| 坑 | redis_* 工具（推荐） | ssh_exec redis-cli |
|----|---------------------|--------------------|
| 密码暴露 | 永远在加密金库；AI 看不到 | `-a <pwd>` 留 shell 历史 / ps |
| 结果格式 | 结构化 JSON（含 nil / 数组 / map） | 文本难解析 |
| 危险命令拦截 | 危险命令分级拦截（FLUSHALL 要用户验证身份才放行）+ 出口审计 | 走 ssh 的 `redis-cli FLUSHALL` 同样会进极高危审批，但密码会暴露在命令行里 |
| KEYS 阻塞坑 | 内置 SCAN，不让你用 KEYS * | redis-cli KEYS * 会阻塞生产 |
| 协议安全 | redis-rs 自己编 RESP，无注入风险 | shell 拼接 +  `;`/`\n` 注入风险 |

## 用前必读：先查可用凭据

```text
list_installed_services() → 筛 kind="redis_conn"
拿 label 或 id（vs_xxx）作为 `credential` 参数
```

如果用户没登记，引导他去「服务凭据」页"+ 新建 DB 凭据"选 Redis kind。

## 工具一览

| 工具 | 用途 | 档位 |
|------|------|------|
| `redis_scan(pattern?, limit?)` | 用 SCAN 列 key（不阻塞服务端） | Readonly |
| `redis_get(key)` | 读一个 key 的值 | Readonly |
| `redis_set(key, value, ttlSecs?)` | 写一个 key，可选 TTL | Mutating |
| `redis_del(keys[])` | 删一组 key（1-100 个） | Mutating |
| `redis_exec(args[])` | 任意命令，按命令名自动判定只读/写入 | 自动 |

## 极高危（任何档位都进审批，须用户验证身份）

- `FLUSHALL` / `FLUSHDB` — 一键清空整个实例 / 当前 db，**不可恢复**。不会被直接拦死，而是进**极高危审批**：用户必须在 OpsPub 桌面端**手敲服务器别名并验证身份**（Windows Hello / Touch ID / 主密码）才会执行，每次一验、只放行这一条；你的调用会等到用户裁决（最长 5 分钟）。发起前先用 `redis_exec ["DBSIZE"]` / `INFO keyspace` 确认会清掉多少 key 并讲给用户；被拒绝或超时就停手，别重试。

## 永久拦截（任何档位，没有审批出口）

- `CONFIG` — 改运行时配置（如 requirepass / dir）
- `SHUTDOWN` — 让 Redis 进程退出
- `DEBUG` — DEBUG SLEEP / SEGFAULT 等会挂服务端
- `SCRIPT` — Lua 脚本管理（加载 / 清空）
- `REPLICAOF` / `SLAVEOF` — 改主从关系
- `MIGRATE` — 搬数据到别的实例

## redis_scan —— 列 key 的正确姿势

```jsonc
{
  "credential": "阿里云 Redis - 缓存",
  "pattern": "user:*:session",
  "limit": 500
}
```

返回：
```jsonc
{
  "keys": ["user:1:session", "user:2:session", ...],
  "totalScanned": 487,
  "truncated": false,
  "limit": 500
}
```

**永远用 SCAN，不要用 KEYS \***。SCAN 在 redis-rs 内部自动 cursor 翻页，O(1) 不阻塞。KEYS * 在大库会阻塞 Redis 几秒到几十秒。

## redis_set 注意点

- `ttlSecs` 不传 = 永不过期（Redis 默认行为）
- value 总是字符串；存对象先 `JSON.stringify`
- 想 EXAT/PXAT 精确到秒等高级用法 → 用 redis_exec

## redis_exec —— 任意命令

适用于 redis_get/set 不够的场景：

```jsonc
// HGETALL
{ "credential": "...", "args": ["HGETALL", "user:42:profile"] }

// LRANGE 取列表前 10
{ "credential": "...", "args": ["LRANGE", "queue:tasks", "0", "9"] }

// ZRANGEBYSCORE
{ "credential": "...", "args": ["ZRANGEBYSCORE", "leaderboard", "100", "200", "WITHSCORES"] }

// INFO 看内存
{ "credential": "...", "args": ["INFO", "memory"] }

// XADD / XRANGE 流操作
{ "credential": "...", "args": ["XADD", "events", "*", "type", "login", "user", "42"] }
```

只读判定（INFO/HGETALL/LRANGE/ZRANGE/SCAN/HSCAN 等）自动走 Readonly 档；写入（HSET/LPUSH/ZADD/XADD 等）走 Mutating 档。

## 大批量删除模板

避免 KEYS 阻塞 + 一次删太多：

```text
1. redis_scan(pattern="cache:expired:*", limit=1000) → 拿到 keys 数组
2. 分批 redis_del(keys=batch_of_100)  ← 每次最多 100 个
3. 重复直到 scan 返回空
```

## 排查清单

| 现象 | 排查 |
|------|------|
| 连接超时（5s） | host/port 不可达 → 让用户在「服务凭据」页点"测试连接"验证 |
| NOAUTH Authentication required | 密码错；reveal password 字段对比 |
| MOVED / ASK / CLUSTERDOWN | 是 Redis Cluster，单 endpoint 不能跨槽访问 |
| `[binary:Nb]` 占位 | value 是二进制，不是 UTF-8；用 redis_exec + 对应命令显式处理 |
| FLUSHALL / FLUSHDB 没有直接执行 | 它们是「极高危」，会进审批队列：等用户在 OpsPub 桌面端手敲服务器别名并验证身份；被拒绝 / 超时就停手，别换写法 |

---
