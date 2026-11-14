---
name: mysql-ops
description: MySQL / MariaDB 安装与运维 —— 1Panel/Docker/原生 三路线安装 + 连接/状态/慢查询/备份/恢复/主从/binlog。
触发词: mysql, mariadb, 安装 mysql, 装 mysql, 部署 mysql, mysql 安装, mysqldump, binlog, 主从, 复制, replication, gtid, slave, 从库, 慢查询, slowlog, mysql 备份, mysql 恢复, 数据库锁, deadlock, innodb, processlist, mysql 连接数, max_connections, 数据库慢, 查询慢, 数据库连不上, 库连不上, 数据库连接超时, 数据库挂了, 库挂了, 表锁, 锁表
dangerous_commands:
  - '(?i)\bmysql\b[^\n]*-e\s+["''][^"'']*\bDROP\s+(?:DATABASE|SCHEMA|TABLE)\b'
  - '(?i)\bmysql\b[^\n]*-e\s+["''][^"'']*\bTRUNCATE\s+TABLE\b'
  - '(?i)\bmysql\b[^\n]*-e\s+["''][^"'']*\bDELETE\s+FROM\s+\w+\s*(?:;|["''])'
  - '(?i)\bmysql\b[^\n]*-e\s+["''][^"'']*\bGRANT\s+ALL\s+PRIVILEGES\s+ON\s+\*\.\*'
  - '(?i)\bmysql\b[^\n]*-e\s+["''][^"'']*\bRESET\s+(?:MASTER|SLAVE)\b'
  - '(?i)\bmysqladmin\b[^\n]*\bshutdown\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/mysql(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\b[^\n]*\bbinlog\.\d+'
---

# mysql-ops —— MySQL / MariaDB 安装与运维

适用：用户报"装一个 mysql / 数据库连不上 / 慢死 / 锁住了 / 主从延迟大 / 想备份恢复 / 改用户密码 / 看 binlog"。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| **查数据（SELECT/SHOW/EXPLAIN）** | `db_query(credential, "SELECT ...")` | `mysql -e "SELECT ..."` |
| **写数据（INSERT/UPDATE/DDL）** | `db_execute(credential, "...")` | `mysql -e "UPDATE ..."` |
| **多语句原子事务** | `db_transaction(credential, ["...", "..."])` | `mysql -e "BEGIN;...;COMMIT;"` |
| 看 mysqld 服务状态 | `service_status(server, "mysql")` | systemctl status |
| 看错误日志尾部 | `tail_log(server, "/var/log/mysql/error.log")` | tail -n |
| 查 3306 端口监听 | `port_check(server, 3306)` | ss -tlnH |
| 改 my.cnf | `sftp_read` 看现状 + `sftp_write` 整文件写 | vi / sed -i |

`credential` = OpsPub 登记的 DB 凭据 label 或 vault_id（kind=`mysql_conn`，经 `list_installed_services` 筛）。

🔴 **AI 查/改 MySQL 数据，优先 `db_*` 工具而非 `ssh_exec mysql -e`**，理由：① 密码不进 shell history / `ps`（`db_*` 由 OpsPub 后端注入解密凭据）；② 结构化结果（带列名/类型），不用解析文本；③ 危险 SQL 自动拦（见下）；④ 出口脱敏。`db_query` 只读（仅 SELECT/WITH），**readonly 档也放行**。
- 🛑 **「极高危」SQL**：`DROP DATABASE` / `TRUNCATE` / 无 WHERE 的 `UPDATE`/`DELETE` —— `db_*` 不会直接执行，而是进**极高危审批**：用户必须在 OpsPub 桌面端**手敲库名 / 表名并验证身份**（Windows Hello / Touch ID / 主密码）才会批准，每次一验、只放行这一条。你的调用会等到用户裁决（最长 5 分钟）；被拒绝或超时就停手，**别绕道改用 `ssh_exec mysql -e`**（那条路同样是极高危审批，只是换了个入口）。`GRANT ALL` 等提权写法则永久拦截，没有审批出口。发起前先用只读 SQL 确认目标（库大小、表行数、有没有备份）并讲给用户。
- **服务端运维**（启停 mysqld、改 my.cnf、主从复制配置、mysqldump 备份、慢日志开关）仍走 `service_status` / `sftp_*` / `ssh_exec`——这些不是 SQL，`db_*` 不覆盖。

⚠️ 含 `sudo` 或写操作的命令会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## 🤖 安装 MySQL（AI 应该自己装，不让用户去 Web UI 点）

### Step 0：问用户版本偏好（强制）

首次决定装 MySQL 时，**必须**先问用户。OpsPub 内置默认 **MySQL 8.4 LTS**。当前版本生命周期（2026 状态）：

| 版本 | 类型 | 状态 | 推荐 |
|------|------|------|------|
| **8.4 LTS** | LTS | premier 支持到 2029-04，延长到 2032-04 | ⭐ 默认推荐 |
| 9.x（9.0/9.1/9.2） | Innovation | **均已 EOL** | ❌ 不要用 |
| 8.0 LTS | LTS | **已 EOL（2026-04-30）** | 仅老库迁移用 |
| 5.7 | EOL（2023-10） | ⛔ 安全风险 | 拒绝装新的 |
| MariaDB 11.4 LTS | MariaDB LTS | 支持到 2029-05 | 用户明说要 MariaDB 时 |

发这段问用户：

> 准备装 MySQL，默认 **8.4 LTS**（长期支持到 2029-04）。要装别的版本吗？
> - **A. 默认 MySQL 8.4 LTS** — 直接回复"继续"
> - **B. 旧库迁移要 8.0** — 注意 8.0 已 EOL，没有安全更新
> - **C. MariaDB 11.4 LTS** — 兼容 MySQL，社区驱动
> - **D. 其他** — 列出版本号

收到回复前**不要装**。下面 image tag 用 `mysql:8.4`（不是 `8.0`）。

### Step 0.5：装前**强制**四步探测（避免重复装/撞端口/密码不一致）

光看 `dpkg -l | grep mysql` 或 `systemctl is-active mysql` **远远不够** —— docker 容器形态的 MySQL 既不在 dpkg 也不在 systemd 里，漏检会撞端口。**必须四件套全跑**：

1. **MCP `list_installed_services`**（不是 ssh_exec！）：查 OpsPub「服务凭据」里有没有 `kind=mysql_conn` 的同主机记录。已存在 → 询问用户是「复用现有」还是「另装新实例」，**不要直接装第二份**。
2. **`docker ps -a` 查容器**（覆盖 docker 路径）：
   ```bash
   docker ps -a --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | grep -iE 'mysql|mariadb' || echo "no docker mysql"
   ```
3. **`ss -tlnp 'sport = :3306'` 查端口占用**（覆盖任何路径）：
   ```bash
   ss -tlnp 'sport = :3306' || echo "port 3306 free"
   ```
4. **检查目标 data 目录是否非空**（**关键！**）：
   ```bash
   # 替换 <install_dir> 为计划安装路径（如 /opt/mysql 或 /opt/1panel/apps/mysql/mysql8）
   ls -A <install_dir>/data 2>/dev/null | head -1 || echo "data dir empty/missing"
   ```
   ⚠️ **MySQL 容器的 `MYSQL_ROOT_PASSWORD` env 只在 data 卷为空时生效**！data 卷非空 = MySQL 复用旧数据 = root 密码沿用第一次初始化的那份。如果之前装过失败 → data 卷已被初始化 → vault 里存的"新生成密码"跟实际容器里的密码**对不上**，安装看似成功但「测试连接」必报 1045 access denied。

   data 卷非空时**必须**先跟用户确认：
   - 「清空重装」→ `rm -rf <install_dir>/data` + 然后重新 `install_app(server,"mysql")`
   - 「复用旧数据」→ 用户得提供旧密码（`install_app` 会生成新密码、对不上旧数据）→ 用 `save_credential` 把旧密码登记成 `mysql_conn`（密码经脱敏 vaultRef 传 `fieldsFromVault`）
   - 默认走「清空重装」（绝大多数场景都是装失败 + 想重来）

### 路线决策（按已有环境从上到下选）

| 已有环境 | 路线 | 部署到哪 | 面板可见性 |
|----------|------|----------|------------|
| **已装 1Panel** | 走 1Panel 风格 compose | `/opt/1panel/apps/mysql/<name>/` | 在 1Panel「容器→编排」可见可管 |
| 已装 Docker（无 1Panel） | 普通 docker compose | `/opt/mysql/` 或项目目录 | docker / portainer 可见 |
| 都没有 | 原生 apt/dnf | 系统包路径 | systemctl 管 |

详细 1Panel 风格 compose 模板见 `1panel-ops` 技能；下面是**纯 Docker 路线**和**原生路线**：

### 路线 B：纯 Docker（无 1Panel）—— AI 自动跑

```bash
# 1. 生成强密码（输出会被 OpsPub 敏感库捕获）
MYSQL_PWD=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)
echo "ROOT_PASSWORD=${MYSQL_PWD}"

# 2. 建目录
mkdir -p /opt/mysql/{data,conf,log}

# 3. sftp_write /opt/mysql/docker-compose.yml（见下方模板）

# 4. sftp_write /opt/mysql/.env（含 MYSQL_ROOT_PASSWORD=xxx）

# 5. 启动
cd /opt/mysql && docker compose up -d

# 6. 验证
sleep 5
docker ps --format 'table {{.Names}}\t{{.Status}}' | grep mysql
docker logs --tail 20 mysql 2>&1 | grep -i 'ready for connections'
docker exec mysql mysql -uroot -p"${MYSQL_PWD}" -e "SELECT VERSION();"
```

**docker-compose.yml 模板**（最小可用 MySQL **8.4 LTS**，含内存限制适合小机器；端口默认仅 127.0.0.1，密码进 .env）：

> ⚠️ 必须先 sftp_write `.env`（含 `MYSQL_ROOT_PASSWORD=<strong>`），再 sftp_write `docker-compose.yml` —— compose 启动时会自动读同目录 `.env`。**绝不**把密码硬编码进 yml。
>
> ⚠️ image tag 用 `mysql:8.4`（默认）；用户在 Step 0 选其它版本时按用户的填，但 **不要默认贴 `mysql:8.0`**——那个版本 2026-04 已 EOL，没有安全更新。

```yaml
services:
  mysql:
    image: mysql:8.4                  # ⭐ 默认 8.4 LTS（支持到 2029-04）；用户明说要别的版本才改
    container_name: mysql
    restart: unless-stopped
    ports:
      - "127.0.0.1:3306:3306"        # ⚠️ 默认仅本机！需外网访问必须先问用户、加防火墙白名单 + 反向代理
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      TZ: Asia/Shanghai
    volumes:
      - ./data:/var/lib/mysql
      - ./conf/my.cnf:/etc/mysql/conf.d/my.cnf:ro
      - ./log:/var/log/mysql
    command:
      # MySQL 8.x 默认 caching_sha2_password —— 不要改成 native_password！那是过时的 5.7 兼容方案
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    healthcheck:
      # 注意双 $$：compose 转义 → 容器内读 $MYSQL_ROOT_PASSWORD 环境变量
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u root -p$$MYSQL_ROOT_PASSWORD || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
```

配套 `.env`（与 compose 同目录，**单独 sftp_write 写一次**）：

```
MYSQL_ROOT_PASSWORD=<openssl rand 生成的强密码>
```

启动前清理同名残留容器（防止上次失败安装的）：

```bash
docker rm -f mysql 2>/dev/null || true
cd /opt/mysql && docker compose up -d
```

完成后告诉用户：**密码已存到 `/opt/mysql/.env`，需要时 `cat /opt/mysql/.env` 查看**（不在对话中明文贴出来）。

小内存 my.cnf（< 1G 空闲）：

```ini
[mysqld]
innodb_buffer_pool_size=128M
max_connections=50
performance_schema=OFF
skip-name-resolve
```

### ⭐ 推荐：用 `install_app(server, "mysql")` 一把过（应用商店同款，进台账）

🔴 **装 MySQL 一律用 `install_app`**——MySQL 在 OpsPub 应用商店目录里，`install_app` = 应用商店 UI 同款：密码 OpsPub 生成并**同步进容器+凭据库（两边一致、必连得上）**、容器规范命名 `reeve-mysql`、绑 `127.0.0.1`、compose 落 `/opt/reeve/stacks/mysql`、**自动登记 `mysql_conn` 凭据并带 SSH 隧道**（「数据库」页即装即连）。

```json
{ "tool": "install_app", "args": { "server": "<别名>", "app": "mysql" } }
```
可选 `version`（如 `"8.4"`）/ `port`（默认 3306，绑 127.0.0.1）。MySQL 是**全机共享设施**：一台机装一套、label 通用名 `MySQL`、第二个项目复用同一套（在它上面建独立库账号，见 reeve-app-deploy 的 `compose.db`）。

> ⛔ **别再用 `install_with_secret` 手写 docker-compose 装 MySQL**——手写脚本极易出"存进凭据库的密码 ≠ 容器实际密码"（工作台连不上，本项目踩过的坑），且容器命名 / 路径不规范。`install_with_secret` 只留给**应用商店目录里没有的自定义服务**。

装完 AI 收到 `vault_id`，用户在「服务凭据」页 / 「数据库」页都能用。

### 路线 C：原生 apt 安装（无 Docker）

```bash
# Debian/Ubuntu
DEBIAN_FRONTEND=noninteractive apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y mysql-server
systemctl enable --now mysql

# 取临时初始密码（MySQL 8.x 装完默认无密码 + auth_socket，需要 sudo 切 root）
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH caching_sha2_password BY '<密码>';"
sudo mysql -e "FLUSH PRIVILEGES;"

# RHEL/Rocky 用 dnf，MariaDB 用 mariadb-server
dnf install -y mysql-server   # 实际可能是 mysql-community-server，要先加官方 yum repo
```

### ⚠️ 关键：不要让用户去面板 UI 点

用户即使有 1Panel，**AI 也直接用上面的 compose 在 `/opt/1panel/apps/mysql/<name>/` 里部署**，装完告诉用户「在 1Panel 容器页能看到」。**绝不要写**「请打开 1Panel 应用商店 → 搜索 MySQL → 点安装」这类把任务推回去给用户的话。

## 🪟 Windows 服务器（OpsPub 原生安装 —— 与上文 Linux 命令全不同！）

目标机是 **Windows** 时（`list_servers` 的 os=windows / `uname` 失败见到 `C:\`），上文 systemctl / apt / `/etc/` / `/var/lib` **一律不适用**，改用下表：

| 事项 | Linux | **Windows（OpsPub 装的）** |
|------|-------|------|
| 安装 | `install_app(server,"mysql")`（Docker） | `install_app(server,"mysql")` 同款——Windows 走 choco 原生（MySQL 9.6 / MariaDB 12.3），**无需 Docker** |
| 服务名 | `mysql` / `mysqld` | **`MySQL`**（MariaDB 也叫 `MySQL`，故两者**同机互斥**） |
| 启停/重启 | `systemctl restart mysql` | `Restart-Service MySQL`（经 `ssh_exec` 要包 `powershell -Command "..."`；重操作走审批） |
| 服务状态 | `service_status(server,"mysql")` | `service_status(server,"MySQL")`（该工具 OS 感知，直接用） |
| 客户端 exe | `mysql` | MySQL：`C:\tools\mysql\current\bin\mysql.exe`；MariaDB：`C:\Program Files\MariaDB *\bin\mysql.exe` |
| 主配置 | `/etc/mysql/my.cnf` | MySQL：`C:\tools\mysql\current\my.ini`；MariaDB：`C:\Program Files\MariaDB *\data\my.ini`（改配置用 `sftp_read`+`sftp_write`） |
| 数据目录 | `/var/lib/mysql` | MySQL：`C:\ProgramData\MySQL`；MariaDB：`...\MariaDB *\data` |
| 错误日志 | `/var/log/mysql/error.log` | 数据目录下 `*.err` |

🔴 **查/改数据仍首选 `db_*` 工具**（`db_query`/`db_execute`/`db_transaction`）——走 SSH 隧道协议层直连，**Windows / Linux 完全一样**，跨 OS 最稳。上文所有 `SHOW PROCESSLIST` / 慢查询 / 锁排查 / 用户管理 SQL 在 Windows **原样适用**（是 SQL，不分 OS）。
- **绑定**：OpsPub 装的 MySQL/MariaDB 已在 my.ini 写死 `bind-address=127.0.0.1`（仅本机），远程走 SSH 隧道（「数据库」页自动）。root 默认密码由 OpsPub 生成入凭据库（`mysql_conn`）。
- **备份**：`mysqldump` / `mysql` 在 `bin\` 下，用法同 Linux；重定向 `>` 到 Windows 路径（如 `C:\OpsPub\backups\db-2026-07-02.sql`）。
- **未验证**：主从复制 / xtrabackup 等在 Windows 非常规，OpsPub 未验证——用户坚持则走终端手动并提醒非常规。

## 第一步：连接（Linux）

```bash
mysql -h <host> -P 3306 -u <user> -p          # 交互输入密码（推荐）
mysql -u <user> -p<pass>                       # ⚠️ 命令行密码会进 history
MYSQL_PWD='<pass>' mysql -u <user>             # 环境变量传密码
mysql --defaults-file=/etc/my.cnf.d/client.cnf # 从配置文件读密码
```

> 配置文件传密码（推荐）：
> ```ini
> [client]
> user=root
> password=xxx
> ```
> 权限：`chmod 600`，所有者匹配。

不带 `-h` 默认走 socket：`/var/run/mysqld/mysqld.sock` 或 `/var/lib/mysql/mysql.sock`。

## 第二步：状态诊断

```sql
SHOW PROCESSLIST;                          -- 当前连接 + 状态 + 跑的查询
SHOW FULL PROCESSLIST;                     -- 查询完整文本
SELECT * FROM information_schema.processlist WHERE COMMAND <> 'Sleep' ORDER BY TIME DESC LIMIT 20;

SHOW STATUS LIKE 'Threads%';               -- Threads_connected / Threads_running
SHOW STATUS LIKE 'Connections';            -- 累计连接数
SHOW STATUS LIKE 'Aborted_%';              -- 异常中断
SHOW STATUS LIKE 'Innodb_row_lock%';       -- 行锁等待

SHOW VARIABLES LIKE 'max_connections';     -- 最大连接数
SHOW VARIABLES LIKE 'wait_timeout';        -- 空闲连接超时
SHOW VARIABLES LIKE 'datadir';             -- 数据目录

SHOW ENGINE INNODB STATUS\G                -- 死锁 / 缓冲池 / 事务概览
```

## 第三步：慢查询

```sql
SHOW VARIABLES LIKE '%slow%';              -- 慢日志开关 + 路径
SHOW VARIABLES LIKE 'long_query_time';     -- 阈值（秒，默认 10）

SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;            -- 1 秒
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
```

分析：

```bash
mysqldumpslow -s t -t 10 /var/log/mysql/slow.log    # top 10 累计耗时
pt-query-digest /var/log/mysql/slow.log              # percona 工具，最佳
```

## 第四步：锁排查

```sql
-- MySQL 8.0+
SELECT * FROM performance_schema.data_locks;
SELECT * FROM performance_schema.data_lock_waits;

-- MySQL 5.7
SELECT * FROM information_schema.innodb_locks;
SELECT * FROM information_schema.innodb_lock_waits;
SELECT * FROM information_schema.innodb_trx ORDER BY trx_started;

-- 找阻塞链
SELECT b.trx_id AS blocking_trx, b.trx_query AS blocking_query,
       w.trx_id AS waiting_trx, w.trx_query AS waiting_query
FROM information_schema.innodb_lock_waits lw
JOIN information_schema.innodb_trx b ON lw.blocking_trx_id = b.trx_id
JOIN information_schema.innodb_trx w ON lw.requesting_trx_id = w.trx_id;
```

杀掉某个会话（⚠️ 走审批）：

```sql
KILL <thread_id>;            -- 从 processlist / trx 表拿 id
```

## 第五步：备份

### 逻辑备份（mysqldump）

> 💾 **备份产物统一落 `~/.reeve/backups/`**（OpsPub 远程工作区，便于统一管理 + 后续 SFTP 取回），别散落 `/tmp` 或臆造 `/data/backup`。先 `ssh_exec mkdir -p ~/.reeve/backups`。

```bash
# 单库
mysqldump -u root -p --single-transaction --routines --triggers --events <db> > ~/.reeve/backups/<db>-$(date +%F).sql

# 多库
mysqldump -u root -p --single-transaction --databases db1 db2 > ~/.reeve/backups/multi-$(date +%F).sql

# 全库（含 mysql 系统库）
mysqldump -u root -p --all-databases --single-transaction --master-data=2 > ~/.reeve/backups/all-$(date +%F).sql

# 只导结构
mysqldump -u root -p --no-data <db> > ~/.reeve/backups/<db>-schema.sql

# 只导数据
mysqldump -u root -p --no-create-info <db> > ~/.reeve/backups/<db>-data.sql
```

> ⚠️ `mysqldump ... > file.sql` 的 `>` 会**覆盖**同名文件——给文件名带日期（`$(date +%F)`）避免误覆盖昨天的备份。

关键参数：

| 参数 | 含义 |
|------|------|
| `--single-transaction` | InnoDB 一致性快照（不锁表） |
| `--master-data=2` | 写入 binlog 位点作注释（搭配 PITR） |
| `--lock-tables=false` | 别误锁 |
| `--routines` `--triggers` `--events` | 别漏存储过程 / 触发器 / 事件 |
| `--set-gtid-purged=OFF` | 跨实例迁移要关 |

### 物理备份

- **xtrabackup**（Percona）：在线、不阻塞、增量、TB 级别推荐
- **mariabackup**（MariaDB 自带）：同上

### 恢复

```bash
mysql -u root -p <db> < db.sql
# 大文件加速：先关掉日志和外键
mysql -u root -p -e "SET SESSION foreign_key_checks=0; SET SESSION unique_checks=0; SOURCE big.sql;"
```

## 第六步：binlog 与 PITR

```sql
SHOW MASTER STATUS;                        -- 当前 binlog 文件 + position
SHOW BINARY LOGS;                          -- 全部 binlog
SHOW VARIABLES LIKE 'log_bin%';            -- 是否开启 + 路径
SHOW VARIABLES LIKE 'binlog_format';       -- ROW / STATEMENT / MIXED
SHOW VARIABLES LIKE 'binlog_expire_logs_seconds';   -- 自动清理时长（秒；老版本 expire_logs_days 天）
```

解析 binlog：

```bash
mysqlbinlog --start-datetime='2024-01-01 00:00:00' \
            --stop-datetime='2024-01-01 23:59:59' \
            /var/lib/mysql/binlog.000123 > replay.sql
```

应用到从库（PITR 回放）：

```bash
mysqlbinlog binlog.0001 binlog.0002 | mysql -u root -p
```

清理（⚠️ 主从环境必须确认从库已消费）：

```sql
PURGE BINARY LOGS TO 'binlog.000100';
PURGE BINARY LOGS BEFORE '2024-01-01 00:00:00';
```

> ⚠️ **不要**手 `rm binlog.0000xxx`，会让 mysql 的 `binlog.index` 不一致，主从重启可能起不来。

## 第七步：主从复制

### 状态

```sql
-- 从库
SHOW SLAVE STATUS\G                        -- 5.7-
SHOW REPLICA STATUS\G                      -- 8.0+
```

关键字段：

| 字段 | 含义 | 健康值 |
|------|------|--------|
| `Slave_IO_Running` / `Replica_IO_Running` | I/O 线程 | `Yes` |
| `Slave_SQL_Running` / `Replica_SQL_Running` | SQL 线程 | `Yes` |
| `Seconds_Behind_Master` | 延迟 | `0` 理想（高峰可能短暂飙） |
| `Last_IO_Error` / `Last_SQL_Error` | 错误 | 空 |
| `Retrieved_Gtid_Set` / `Executed_Gtid_Set` | GTID 模式下的位点 | 二者差距 = 待消费 |

### 搭建 / 切主（⚠️ 走审批）

```sql
-- 传统位点模式
CHANGE MASTER TO MASTER_HOST='10.0.0.1', MASTER_PORT=3306,
  MASTER_USER='repl', MASTER_PASSWORD='xxx',
  MASTER_LOG_FILE='binlog.000123', MASTER_LOG_POS=4567;

-- GTID 模式
CHANGE MASTER TO MASTER_HOST='10.0.0.1', MASTER_PORT=3306,
  MASTER_USER='repl', MASTER_PASSWORD='xxx',
  MASTER_AUTO_POSITION=1;

START SLAVE;                              -- 5.7-
START REPLICA;                            -- 8.0+
```

跳过错误事务（**最后手段，会破坏一致性**）：

```sql
SET GLOBAL sql_slave_skip_counter = 1;
-- 或 GTID
SET GTID_NEXT='aaa-bbb:N'; BEGIN; COMMIT; SET GTID_NEXT='AUTOMATIC';
```

## 第八步：用户管理

```sql
CREATE USER 'app'@'10.0.%' IDENTIFIED BY 'xxx';
GRANT SELECT, INSERT, UPDATE, DELETE ON mydb.* TO 'app'@'10.0.%';
SHOW GRANTS FOR 'app'@'10.0.%';
RENAME USER 'old'@'%' TO 'new'@'%';
ALTER USER 'app'@'10.0.%' IDENTIFIED BY 'newpass';
DROP USER 'app'@'10.0.%';
FLUSH PRIVILEGES;                          -- 直接 INSERT mysql.user 后才需要；用 GRANT 不需要
```

> ⚠️ `GRANT ALL PRIVILEGES ON *.* TO 'app'@'%'` —— 给业务账号 superuser 权限是经典事故源，**走审批**。

## 第九步：配置 / 路径速查表

| 内容 | 路径 |
|------|------|
| 主配置 | `/etc/mysql/my.cnf`（Debian）/ `/etc/my.cnf`（RHEL）/ `/etc/my.cnf.d/*.cnf` |
| Docker / 1Panel | `/opt/1panel/apps/mysql/mysql/conf/my.cnf` |
| 数据目录 | `SHOW VARIABLES LIKE 'datadir'`（默认 `/var/lib/mysql/`） |
| binlog | `datadir` 下 `binlog.NNN` |
| 错误日志 | `SHOW VARIABLES LIKE 'log_error'`（常见 `/var/log/mysql/error.log`） |
| 慢日志 | `SHOW VARIABLES LIKE 'slow_query_log_file'` |
| socket | `/var/run/mysqld/mysqld.sock` 或 `datadir/mysql.sock` |
| systemd unit | `mysqld` 或 `mariadb` |

## 危险操作清单（务必经审批）

| 命令 / SQL | 后果 |
|-----------|------|
| `DROP DATABASE` / `DROP TABLE` | 数据永久消失（除非有 binlog + 已备份） |
| `TRUNCATE TABLE` | 同上，比 DELETE 快但**不可回滚** |
| 无 WHERE 的 `DELETE` / `UPDATE` | 全表覆盖，事故经典款 |
| `GRANT ALL ON *.*` | 权限过高 |
| `RESET MASTER` / `RESET REPLICA` | 清 binlog / 复制状态（**主从必崩**） |
| `mysqladmin shutdown` | 关数据库（无 graceful；用 systemctl stop） |
| `rm /var/lib/mysql` | 删数据目录（**所有数据消失**） |
| `rm binlog.xxx` | 让 binlog.index 不一致，主从重启失败 |
| `STOP SLAVE; SKIP COUNTER` | 跳事务（**破坏主从一致**） |

## 教训

- **改任何 SQL 前先 BEGIN + SELECT 验证范围**，确认 row count 再 COMMIT。
- 备份必须**定期 restore 演练**：没演练过的备份等于没备份。
- 主从延迟瞬时飙到几千秒多半是大事务 / 大表 DDL；先看是否在跑批量任务，再考虑切流量。
- 数据库压力曲线诡异 = 经典原因：① 缓存击穿（应用层） ② 慢查询积压（看 slow log） ③ 临时表写满 disk（`SHOW STATUS LIKE 'Created_tmp%'`） ④ 复制线程吃 CPU（GTID 模式 + 大量小事务）。
- `mysqldump --single-transaction` 只对 **InnoDB 表**有效；MyISAM 表会被锁（生产应该早就不用 MyISAM 了，但要确认）。
- 切主前**永远先在从库 SHOW SLAVE STATUS\G 确认 Seconds_Behind_Master=0**，否则切完丢数据。

---
