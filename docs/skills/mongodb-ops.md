---
name: mongodb-ops
description: MongoDB 运维速查 —— mongosh / 备份恢复 / 复制集 / 分片 / 索引 / 慢查询。
触发词: mongodb, mongo, mongosh, mongodump, mongorestore, replica set, rs.status, sharding, mongo 慢查询, mongo 索引, oplog, 副本集, 分片集群, mongodb 7, mongodb 8, mongo 安装, 装 mongo, 部署 mongo, mongo 连不上, mongo 起不来, mongo 报错, db.collection, find 慢, aggregate 慢, 文档数据库, nosql, 没建索引, mongo 备份, mongo 恢复, mongo 主从, scram-sha-256, mongo 密码, db.runCommand, server status
dangerous_commands:
  - '(?i)\bmongosh?\b[^\n]*--eval\s+["''][^"'']*\bdb\.dropDatabase\('
  - '(?i)\bmongosh?\b[^\n]*--eval\s+["''][^"'']*\bdb\.\w+\.drop\('
  - '(?i)\bmongosh?\b[^\n]*--eval\s+["''][^"'']*\bdb\.\w+\.(?:remove|deleteMany)\(\s*\{\s*\}'
  # mongorestore --drop：恢复前清空目标集合，误用会丢现网数据
  - '(?i)\bmongorestore\b[^\n]*\s--drop(?:\s|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/mongo(?:db)?(?:\s|/|$)'
---

# mongodb-ops —— MongoDB 运维

适用：用户运维 MongoDB；想"连不上"/"备份恢复"/"副本集状态"/"慢查询"/"索引建好没"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 mongod 服务状态** → `service_status(server, "mongod")`（= systemctl status，任何档位放行）。
- **看日志尾部** → `tail_log(server, "/var/log/mongodb/mongod.log")`。
- **查 27017 端口** → `port_check(server, 27017)`。
- **改 mongod.conf** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell 转义坑），写完 `ssh_exec sudo systemctl restart mongod`。

🔴 **MongoDB 的数据操作（find/aggregate/createIndex/rs.status 等）走 `ssh_exec mongosh --eval '...'`**——OpsPub 的 `db_*` 工具只认 MySQL / PostgreSQL / SQLite / SQL Server，**没有 MongoDB 适配**。`mongodb_conn` 凭据只供「人用数据库工作台」（「数据库 → MongoDB」页）和备份使用，AI 侧不能用 `db_query` 查 Mongo，别尝试。

⚠️ `mongosh --eval` 里的写操作、`sudo` 重启都会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## ⭐ 装机：`install_app(server, "mongodb")` 一把过（应用商店同款，进台账）

### 装前**强制**探测（避免重复装/撞端口）
1. MCP `list_installed_services` 查现有 `mongodb_conn`——已装就复用（共享设施）。
2. 端口 27017 是否占用（`port_check`）。

🔴 **装 MongoDB 一律用 `install_app`**——mongodb 在 OpsPub 应用商店目录里，`install_app` = 应用商店 UI 同款：密码 OpsPub 生成并**同步进容器+凭据库（两边一致、必连得上）**、容器 `opspub-mongodb`、绑 `127.0.0.1`、compose 落 `/opt/opspub/stacks/mongodb`、**自动登记 `mongodb_conn` 凭据带 SSH 隧道**（「数据库→MongoDB」页即装即连）。

```json
{ "tool": "install_app", "args": { "server": "<别名>", "app": "mongodb" } }
```
可选 `version` / `port`（默认 27017）。label 通用名、共享复用。

> ⛔ **别用 `install_with_secret` 手写 docker-compose 装 MongoDB**——手写易致"存的密码≠容器密码"（尤其 data 卷非空时新密码用不了），且容器命名/路径不规范。`install_with_secret` 只留给应用商店目录里没有的自定义服务。
> 注：data 卷非空（装失败重来）→ 先 `rm -rf <stacks>/mongodb/data` 再重 `install_app`；复用旧数据需旧密码、用 `save_credential` 登记。

装完 AI 收到 `vault_id`，用户在「服务凭据」页能看到。**OpsPub MCP 的 `db_query` 不支持 MongoDB**（仅 MySQL / PostgreSQL / SQLite / SQL Server），但凭据已加密入库：用户可在「数据库 → MongoDB」页直接连，备份页也能选它做备份；AI 要操作数据仍走 `ssh_exec mongosh`。
> 注：早期版本在「数据库」页手建的 Mongo 凭据 kind 是旧写法 `mongo_conn`，OpsPub 同样认（列表里看到别当成别的服务）；**登记新凭据一律用 `mongodb_conn`**。

### 已有 MongoDB / 仅入库

只需把现有 MongoDB 的连接信息加密入库（不装机）：

```json
{
  "tool": "save_credential",
  "args": {
    "server": "<别名>",
    "kind": "mongodb_conn",
    "label": "MongoDB（已存在）",
    "fields": { "host": "127.0.0.1", "port": "27017", "user": "admin", "password": "<密码>", "auth_source": "admin" },
    "secretFields": ["password"]
  }
}
```

## 🪟 Windows 服务器（OpsPub 原生安装 —— 与上文 Linux 命令全不同！）

目标机是 **Windows** 时，上文 systemctl / apt / `/etc/mongod.conf` / `/var/lib/mongodb` **一律不适用**。🔴 OpsPub 在 Windows **钉 MongoDB 4.4.3**（5.0+ 要求 CPU AVX、8.x 在 Server 2019 加载即崩 `0xC0000139`；4.4 是最后一个宽兼容版，且自带 legacy `mongo.exe` shell）。改用下表：

| 事项 | Linux | **Windows（OpsPub 装的）** |
|------|-------|------|
| 安装 | `install_app(server,"mongodb")`（Docker，7/8） | `install_app(server,"mongodb")` 同款——Windows 走 choco **钉 4.4.3**，**无需 Docker** |
| 服务名 | `mongod` | **`MongoDB`** |
| 启停/重启 | `systemctl restart mongod` | `Restart-Service MongoDB`（`ssh_exec` 包 `powershell -Command`） |
| 服务状态 | `service_status(server,"mongod")` | `service_status(server,"MongoDB")`（OS 感知） |
| shell / 客户端 | `mongosh` | **`mongo.exe`**（4.4 自带 legacy shell，非 mongosh）：`C:\Program Files\MongoDB\Server\4.4\bin\mongo.exe` |
| 主配置 | `/etc/mongod.conf` | `C:\Program Files\MongoDB\Server\4.4\bin\mongod.cfg`（YAML，改配置用 `sftp_read`+`sftp_write`） |
| 数据目录 | `/var/lib/mongodb` | `C:\ProgramData\MongoDB\data\db` |

🔴 **shell 语法差异**：Windows 是 **`mongo.exe`（旧版 mongo shell）**，不是 `mongosh`——大多数 `db.xxx()` 命令通用，但 `mongosh` 独有的新语法/顶层 await 不支持。上文 `mongosh` 命令在 Windows 换成 `mongo.exe --eval "..."`。
- **绑定**：mongod.cfg 默认 `bindIp: 127.0.0.1`（OpsPub 保持，仅本机），并已 `security.authorization: enabled`。root 用户建在 **admin 库**，密码由 OpsPub 生成入凭据库（`mongodb_conn`）。
- **认证**：连接必须 `-u root -p <pwd> --authenticationDatabase admin`（authSource=admin）。
- **备份**：`mongodump.exe`/`mongorestore.exe`（4.4 随 server 装在 `bin\`；新版 MongoDB 已拆成独立 database-tools，4.4 仍自带）。
- **未验证**：副本集 / 分片在 Windows 单机非常规，OpsPub 未验证。

## 第一步：连接（Linux，mongosh）

```bash
mongosh "mongodb://user:pass@host:27017/mydb?authSource=admin&replicaSet=rs0"
mongosh --host host --port 27017 -u admin -p --authenticationDatabase admin
mongosh                                         # localhost 默认
```

mongosh 内：

```js
show dbs
use mydb
show collections
db.getCollectionInfos()
db.stats()
db.serverStatus()
db.hostInfo()
```

## 第二步：常用查询

```js
db.users.find({status: "active"}).limit(10).pretty()
db.users.find({age: {$gt: 18}}).sort({createdAt: -1})
db.users.countDocuments({status: "active"})
db.users.aggregate([
    {$match: {status: "active"}},
    {$group: {_id: "$dept", count: {$sum: 1}}}
])
db.users.findOne({_id: ObjectId("...")})
```

## 第三步：索引

```js
db.users.getIndexes()
db.users.createIndex({email: 1}, {unique: true, background: true})
db.users.createIndex({dept: 1, createdAt: -1})         // 复合索引（前缀有用）
db.users.createIndex({"name": "text"})                  // 全文索引
db.users.createIndex({expireAt: 1}, {expireAfterSeconds: 0})  // TTL
db.users.dropIndex("email_1")
db.users.stats()                                        // 含索引大小
```

EXPLAIN：

```js
db.users.find({email: "x"}).explain("executionStats")
// 看 winningPlan.stage: IXSCAN（用索引）/ COLLSCAN（全表）
```

## 第四步：慢查询

```js
// 开启 profiler
db.setProfilingLevel(1, {slowms: 100})    // 0=关 / 1=慢查询 / 2=全部
db.setProfilingLevel(0)                   // 关

// 查 profile
db.system.profile.find().sort({ts: -1}).limit(10).pretty()

// 当前在跑的操作
db.currentOp()
db.currentOp({"secs_running": {$gt: 3}})
db.killOp(<opid>)                          // ⚠️ 走审批
```

## 第五步：用户 / 权限

```js
use admin
db.createUser({
    user: "appuser",
    pwd: "xxx",
    roles: [
        {role: "readWrite", db: "mydb"},
        {role: "read", db: "logs"}
    ]
})

show users
db.updateUser("appuser", {roles: [{role: "read", db: "mydb"}]})
db.changeUserPassword("appuser", "newpass")
db.dropUser("appuser")
```

常用内置角色：

| Role | 范围 |
|------|------|
| `read` | 单 db 只读 |
| `readWrite` | 单 db 读写 |
| `dbAdmin` | 单 db 管理（索引/统计/集合管理） |
| `dbOwner` | dbAdmin + readWrite + userAdmin |
| `readAnyDatabase` | 全部 db 只读（admin db 用） |
| `clusterMonitor` | 监控权限 |
| `root` | 全部（**慎给**） |

## 第六步：备份

### mongodump（逻辑备份）

> 💾 **备份产物统一落 `~/.opspub/backups/`**（OpsPub 远程工作区），别臆造 `/backup`、`/data/backup`。先 `ssh_exec mkdir -p ~/.opspub/backups`。

```bash
# 单库
mongodump --uri="mongodb://user:pass@host/mydb?authSource=admin" -o ~/.opspub/backups/mongo-$(date +%F)

# 全库
mongodump --uri="mongodb://user:pass@host/?authSource=admin" -o ~/.opspub/backups/mongo-$(date +%F)
mongodump -h host -u admin -p --authenticationDatabase admin -o ~/.opspub/backups/mongo-$(date +%F)

# 副本集（推荐从 secondary 备份，减小 primary 压力）
mongodump --uri="mongodb://user:pass@sec1,sec2/mydb?readPreference=secondary&authSource=admin" \
    --oplog --gzip --archive=~/.opspub/backups/dump-$(date +%F).gz

# 参数
--oplog              # 一致性快照（仅副本集）
--gzip               # 压缩
--archive=file       # 单文件归档
--db mydb            # 单库
--collection users   # 单集合
--query '{"status": "active"}'   # 条件
```

### mongorestore

```bash
mongorestore --uri="..." /backup
mongorestore --uri="..." --gzip --archive=/backup/dump.gz
mongorestore --uri="..." --drop /backup           # ⚠️ 恢复前删原表
mongorestore --uri="..." --nsInclude="mydb.*"
mongorestore --uri="..." --nsFrom="oldname.*" --nsTo="newname.*"
```

### 物理备份

- **MongoDB Atlas**：cloud 快照
- **filesystem snapshot**：LVM / EBS snapshot（先 `db.fsyncLock()` → 快照 → unlock）
- **percona-backup-mongodb**：开源企业级（PITR）

## 第七步：副本集（Replica Set）

```js
// 状态
rs.status()
rs.config()
rs.printSecondaryReplicationInfo()        // 各 secondary 延迟

// 初始化
rs.initiate({
    _id: "rs0",
    members: [
        {_id: 0, host: "mongo1:27017"},
        {_id: 1, host: "mongo2:27017"},
        {_id: 2, host: "mongo3:27017", arbiterOnly: true}    // 仲裁节点
    ]
})

// 加节点
rs.add("mongo4:27017")
rs.addArb("arb:27017")
rs.remove("mongo4:27017")

// 切主（⚠️ 走审批）
rs.stepDown(60)              // 当前 primary 让位（60 秒不参选）
rs.reconfig({...})           // 修改配置
```

### oplog

```js
use local
db.oplog.rs.find().sort({ts: -1}).limit(1)
// 容量
db.serverStatus().oplog
// 窗口期（推算）
db.runCommand({ replSetGetStatus: 1 })
```

oplog 不够大 → secondary 跟不上 → 退化为 RECOVERING 状态。调整：

```js
db.adminCommand({replSetResizeOplog: 1, size: 16384})    // MB，仅副本集成员
```

## 第八步：分片（Sharding）

```js
// 进 mongos
sh.status()
sh.enableSharding("mydb")
db.adminCommand({shardCollection: "mydb.users", key: {userId: "hashed"}})

// 加 shard
sh.addShard("rs1/mongo1:27017,mongo2:27017,mongo3:27017")

// balancer
sh.getBalancerState()
sh.stopBalancer()           // 批量导入数据前先停
sh.startBalancer()

// chunks
sh.status({verbose: true})
```

> 分片是**大集群**的事；中小业务直接 3 节点副本集 + 索引 + 读写分离够用。

## 第九步：连接 / 配置文件

```yaml
# /etc/mongod.conf
storage:
  dbPath: /var/lib/mongo
  journal: { enabled: true }
  wiredTiger:
    engineConfig:
      cacheSizeGB: 8         # 默认 (RAM-1GB)/2；调到 RAM*50%

systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true

net:
  port: 27017
  bindIp: 127.0.0.1,10.0.0.5      # ⚠️ 默认 127.0.0.1；公开必加认证

security:
  authorization: enabled
  keyFile: /etc/mongod.keyfile     # 副本集成员间认证

replication:
  replSetName: rs0
```

```bash
sudo systemctl restart mongod
mongosh --eval 'db.adminCommand({getParameter: "*"})' | less
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 配置 | `/etc/mongod.conf` |
| 数据 | `dbPath`（默认 `/var/lib/mongo` 或 `/var/lib/mongodb`） |
| 日志 | `/var/log/mongodb/mongod.log` 或 journal |
| keyFile（副本集） | `/etc/mongod.keyfile`（**chmod 400 mongod:mongod**） |
| socket | `/tmp/mongodb-27017.sock` |
| systemd unit | `mongod` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `db.dropDatabase()` | 删整库 |
| `db.<col>.drop()` | 删集合 |
| `db.<col>.remove({})` / `deleteMany({})` | 清空集合 |
| `rs.reconfig()` 错配置 | 副本集脑裂 / 无 primary |
| `rs.stepDown()` 在唯一健康 primary | 短暂无 primary |
| `sh.stopBalancer()` 忘了 startBalancer | 数据分布永久失衡 |
| `rm -rf /var/lib/mongo` | 删数据目录 |
| 改 `bindIp: 0.0.0.0` 但**没开认证** | 公网直接读写库（每年都有事故） |

## 教训

- 默认 `bindIp: 127.0.0.1` 是**保护机制**；改 0.0.0.0 / 加公网 IP 时**必须同时开认证 + 防火墙**。
- 副本集 `keyFile` 权限必须 `0400 mongod:mongod`，否则成员间认证失败 → secondary 永远连不上。
- 索引在大集合上 createIndex **必须加 `background: true`**（4.x+；5.0+ 默认 background），否则会阻塞读写。
- `mongodump` 是**逻辑备份**（导 BSON）；TB 级数据应该用 percona-backup-mongodb 或文件系统快照。
- 副本集**至少 3 个节点**（含 1 个 arbiter），2 节点没法选主。
- `db.currentOp()` 看着很慢的 op，`db.killOp()` 前先看清是不是关键业务批处理；杀掉**正在跑的 transaction** 会回滚。
- oplog 窗口 < 写入速率 × secondary 重连时间 = secondary 必跟不上；扩大 oplog 比加 secondary 优先。

---
