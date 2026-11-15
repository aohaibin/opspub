---
name: mssql-ops
description: SQL Server 运维速查（Linux / Docker 版）—— 装机、连不上 / 起不来、备份还原、版本与许可，含 OpsPub 的 db_* 工具对 SQL Server 的边界。
触发词: sql server, sqlserver, mssql, sqlcmd, 微软数据库, 装 sql server, 部署 sql server, 安装 sqlserver, sa 密码, MSSQL_SA_PASSWORD, sqlserver 连不上, sqlserver 起不来, sqlserver 内存, mssql 容器, 1433, bak 备份, sqlserver 备份, sqlserver 还原, express 版, developer 版, mssql_conn
dangerous_commands:
  - '(?i)\bsqlcmd\b[^\n]*\bxp_cmdshell\b'
  - '(?i)\bsqlcmd\b[^\n]*\bsp_configure\b'
  - '(?i)\bsqlcmd\b[^\n]*\bDROP\s+LOGIN\b'
  - '(?i)\bsqlcmd\b[^\n]*\bALTER\s+SERVER\s+ROLE\b'
---

# mssql-ops —— SQL Server 运维速查（Linux / Docker）

适用：用户要装 SQL Server、报"sqlserver 连不上 / 容器起不来 / sa 登录失败"、问"怎么备份"、"Developer 和 Express 差别"。
Windows 原生 SQL Server 走微软官方安装器，**不在 OpsPub 应用商店范围**；本技能只讲 Linux 服务器上的 Docker 版。

## 🤖 第零步：优先用 OpsPub 专用工具

- **查 / 改数据** → `db_query` / `db_execute` / `db_transaction`（凭据 kind=`mssql_conn`，用 `list_installed_services` 查 vault_id），与 MySQL / PostgreSQL 走**同一套**策略 + 审批 + 脱敏 + 审计。SQL Server 的边界：
  - 🔴 **不支持 `params` 占位参数**（传了会被明确拒绝）：值内联进 SQL，自己转义单引号；**中文字符串用 `N'…'`**，否则乱码。
  - **永久拦截**：`xp_cmdshell` / `sp_OA*` / `sp_configure` / `xp_reg*`（它们能让 SQL 执行系统命令、绕过 OpsPub 的命令审批——要跑系统命令请用 `ssh_exec`）。库级 DROP / TRUNCATE / 无 WHERE 全表删改则属「极高危」：进审批队列，须用户在 OpsPub 桌面端手敲库名 / 表名并验证身份才会执行，不是永久拦截。
  - **别用 `ssh_exec sqlcmd` 读写数据**：密码会进命令行 / 环境，还绕开了上面的拦截与出口脱敏。
- **看容器** → `docker_list_containers`；**看日志** → `ssh_exec docker logs --tail 100 opspub-sqlserver`（只读放行）；**查端口** → `port_check(server, 1433)`。

⚠️ 写操作、`sudo` 会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## ⭐ 装机：`install_app(server, "sqlserver")`

### 装前**强制**探测
1. `list_installed_services` 查现有 `mssql_conn`——已装就复用，别重复装。
2. **可用内存 ≥ 2GB**（`system_info`）：低于此值 sqlservr 进程启动即退出，表现为"装完容器 exited、连不上"。
3. 端口 1433 是否占用（`system_listen_ports`）。

`install_app` 做的事（应用商店 UI 同款）：镜像 `mcr.microsoft.com/mssql/server:<版本>`（可选 `2022-latest`（默认）/ `2019-latest` / `2025-latest`）、容器 `opspub-sqlserver`、绑 `127.0.0.1:1433`、数据卷 `opspub-sqlserver-data:/var/opt/mssql`；`sa` 密码由 OpsPub 生成并同步进容器与凭据库；自动登记 `mssql_conn`（user=`sa`、database=`master`，带 SSH 隧道，「数据库」页即装即连）。

```json
{ "tool": "install_app", "args": { "server": "<别名>", "app": "sqlserver" } }
```

🔴 **装机前要告知用户的三点**（别替用户决定）：
1. 镜像在 **mcr.microsoft.com**（不在 Docker Hub），Docker Hub 镜像加速器对它无效，拉取直连微软。
2. **默认 Developer 版：功能全、免费，但仅限开发测试**。生产要改 `MSSQL_PID` 为 Express（免费，单库 10GB 上限）或用已购买的授权——在安装预览的 compose 里由用户改。
3. 安装即视为接受微软最终用户许可协议（`ACCEPT_EULA=Y`）。

> ⛔ 别用 `install_with_secret` 手写 docker-compose 装 SQL Server：手写易致"存的密码≠容器密码"，容器命名 / 路径也不规范。

## 排障

| 现象 | 常见原因 | 处理 |
|------|---------|------|
| 容器 exited / 反复重启 | 可用内存不足 2GB；或 sa 密码不满足策略（≥8 位，大写 / 小写 / 数字 / 符号至少三类） | `docker logs --tail 50 opspub-sqlserver` 看原因；先确认 `free -h` |
| `Login failed for user 'sa'` | `MSSQL_SA_PASSWORD` **只在首次初始化数据卷时生效**，之后改 env 不会改密码；凭据库里的才是真值 | 别重新生成密码"试试"；真忘了要重置 sa，交给用户在终端做 |
| 客户端报证书不受信任 | 容器用自签证书 | 客户端勾选"信任服务器证书"（sqlcmd `-C`、JDBC `trustServerCertificate=true`）；OpsPub「数据库」页已处理 |
| 中文乱码 | 列用了 VARCHAR / 字面量没加 `N` | 用 NVARCHAR + `N'…'`；要中文排序规则须在**首次启动**前设 `MSSQL_COLLATION` |

## 备份还原（手工；OpsPub 备份页暂不支持 SQL Server）

- **备份**：经 `db_execute` 跑 `BACKUP DATABASE [库名] TO DISK = N'/var/opt/mssql/data/库名.bak' WITH INIT, COMPRESSION`（`/var/opt/mssql/data` 是默认备份目录），再 `ssh_exec docker cp opspub-sqlserver:/var/opt/mssql/data/库名.bak ~/.opspub/backups/mssql/`。被策略拦就把命令交给用户在「数据库」页 / 终端执行。
- **还原**（`RESTORE DATABASE … WITH REPLACE`）是破坏性操作：先告知用户影响范围并**等明确确认**，不要在 AI 侧直接做。

## 部署应用时用 SQL Server（compose.db 暂不支持）

`compose.db` 目前只支持 MySQL / PostgreSQL。应用用 SQL Server 时走 `opspub-app-deploy` 技能第 3 步的「引擎不支持时的出口」：先告知用户 → 在 `ssh_exec_script` 里于**容器内**用 sqlcmd 建库 / LOGIN / USER，sa 密码取容器自带环境变量（`-P "$MSSQL_SA_PASSWORD"`，密码不出现在命令里），应用账号密码在服务器端生成、不进 stdout → 建完用 `save_credential`（kind=`mssql_conn`）补登记。sqlcmd 的位置随镜像而异（常见 `/opt/mssql-tools18/bin/sqlcmd`，2019 镜像在 `/opt/mssql-tools/bin/`，**以实际镜像为准**，先 `ls /opt` 确认）。

## 铁律

- 凭据永不进对话 / 日志（`[REDACTED:xxx]` 是正常脱敏，别因此重新生成密码死循环）。
- 共享设施（整机一套）：已装就复用，库名 / 账号用应用自己的标识。

---
