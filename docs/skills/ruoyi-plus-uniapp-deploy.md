---
name: ruoyi-plus-uniapp-deploy
description: RuoYi-Plus + uniapp（ruoyi-plus-uniapp）全栈部署配方 —— 走 OpsPub 部署目标(Target)：共享 MySQL/Redis + deploy_upsert_target，产物进工作台、可一键重部署/回滚。
触发词: ruoyi, ruoyi-plus, ruoyi-plus-uniapp, ruoyi-vue-plus, ruoyivue, ryplus, ryplus_uni, ryplus-uni, 若依, 若依plus, 若依部署, plus-ui, plus-uniapp, plus-app, ruoyi 部署, ruoyi上线, 部署若依, springboot+vue 部署, 后台管理系统部署, 后台管理部署
---

# ruoyi-plus-uniapp 全栈部署（OpsPub 原生路径）

适用：用户说「用 OpsPub 部署 ruoyi-plus-uniapp / 若依-plus / ryplus 到某服务器」「上线后台管理系统」。
本配方 = **Spring Boot 3 + JDK21 后端 + plus-ui(PC) 静态前端 + MySQL8 + Redis7**，默认 Docker。

> 📎 **本技能 = 通用 `opspub-app-deploy` 配方的 ruoyi 特化**：通用骨架（探环境→install_app 共享库→deploy_upsert_target compose 托管两条凭据→stacks 目录→static-openresty 前端同域反代→验收）见 `opspub-app-deploy`（`get_skill("opspub-app-deploy")`），那里有完整步骤 + 每条铁律的原因。**本技能只补 ruoyi 的专属值**，对照着用。
>
> 🔴 **核心纪律（同通用）：走「部署目标(Target)」，绝不 `ssh_exec` 手写 docker-compose / openssl 生成 .env；建库账号默认也交给引擎（引擎不支持的库类型除外，见通用配方第 3 步「引擎不支持时的出口」）**——手写产物不进台账、不可一键重部署。

## ruoyi 专属值（`<应用标识>` = `ryplus_uni`，套进通用配方）
| 项 | 值 |
|----|----|
| `<应用标识>`（容器名/库名/库账号/栈目录/target 前缀） | **`ryplus_uni`**（来源：`ruoyi-admin/.../application.yml` 的 `app.id`；redisson keyPrefix/clientName/库名 DB_NAME 都=`${app.id}`） |
| 后端镜像 | `bellsoft/liberica-openjdk-rocky:21` 挂载 jar 跑；本机 `mvn clean package -DskipTests` 出 jar |
| 后端 deployRoot | `/opt/opspub/stacks/ryplus_uni`；容器名 `ryplus_uni`；监听 `127.0.0.1:5500` |
| compose.db | `{ vaultId:<共享 MySQL root>, mode:"create", dbName:"ryplus_uni", dbUser:"ryplus_uni" }` |
| initSqls | `["<本机>/script/sql/ry_plus_sys.sql", "<本机>/script/sql/ry_plus_app.sql"]`（先 sys 后 app） |
| 低内存 JVM | `-Xms256m -Xmx640m -XX:+UseG1GC`（<2G 必加 swap） |
| 关掉省内存的开关(env) | `MONITOR_ENABLED`/`SNAIL_JOB_ENABLED`/`ROCKETMQ_ENABLED`/`MQTT_ENABLED`/`LANGCHAIN4J_ENABLED`/`OPEN_API_ENABLED` 全设 false（要哪个再单开） |
| RSA 接口加密 | 默认 `API_ENCRYPT_ENABLED=true`，用框架默认 RSA 密钥对（前后端配对、登录可用）；JWT 用 `secrets:["JWT_SECRET_KEY"]` 自动轮换 |
| 前端 plus-ui | `pnpm build:prod`；`plus-ui/.env.production` 的 `VITE_APP_BASE_API='/ryplus_uni'`；static-openresty target `vars:{apiProxyPort:"5500", apiProxyPrefix:"ryplus_uni", sslEmail:<邮箱>}` |
| 验收接口 | `GET https://<域名>/ryplus_uni/auth/imgCode` 返回 200 + 验证码图（证明 HTTPS→反代→后端→Redis 全通） |

下面是带 ruoyi 实值的完整步骤（与通用配方逐条对应，可直接照做）。

## 🤖 第零步：优先用 OpsPub 专用工具
- **探环境**（只读，任何档位放行）：`system_info` / `disk_usage`（看**内存+swap**、磁盘）、`port_check`（80/443/3306/6379/5500 是否占用）、`service_status`、`ssh_exec`(只读) 查 Docker/解析。
- **装共享库**：`install_app(server, "mysql")` / `install_app(server, "redis")`（**应用商店同款**：密码 OpsPub 生成同步进容器+凭据库**必连得上**、容器 `opspub-mysql`/`opspub-redis`、绑 127.0.0.1、自动登记 _conn 带隧道）。🔴 **别用 `install_with_secret` 手写脚本装 DB**（手写易致存的密码≠容器密码、工作台连不上）。
- **建/触发部署**：`deploy_upsert_target`（产出部署目标，只写不执行）→ `deploy_dry_run`（预览）→ `deploy_run`（执行，进部署历史、可回滚）。
- **传产物**：`sftp_upload`（jar / dist 大文件）；`sftp_read`/`sftp_write`（小文件/改配置）。
- 改动型操作（装库/部署/sudo）会按服务器档位走**审批**——提前告知用户、被拒别原样重试。

## 部署流程

### 1. 探环境 → 报告 → 等确认（严禁探完直接干）
探完把现状 + 默认 Docker 方案讲给用户，**拿到明确「确认/继续」才动手**。重点报：内存+swap（ruoyi 全栈吃内存，<2G 必须加 swap）、Docker 装没装、域名解析、80/443 安全组、本地构建链（JDK21/Maven/Node/pnpm）。

### 2. 共享 MySQL/Redis 一次装好（通用设施，整机一套）
- 🔴 用 **`install_app(server, "mysql")`** + **`install_app(server, "redis")`**（应用商店同款模板）——容器 `opspub-mysql`/`opspub-redis`、绑 `127.0.0.1`、密码两边一致**必连得上**、label 通用名（**不带项目**）、自动登记 `mysql_conn`/`redis_conn` 带 `__tunnel_server_id`。**别用 `install_with_secret` 手写**（连不上的根因）。
- 🔴 **已装就复用**（`list_installed_services` 查），别按项目重复装、别套 `ryplus-` 前缀——它们是共享的，第二个 app 也用这套。
- 记下返回的两个 `vault_id`，下一步引用。

### 3. 建后端部署目标 `deploy_upsert_target`（recipe=`docker-compose`，开 `compose` 托管）
> 🔴 **命名分两类，别混**：
> - **共享 MySQL/Redis 凭据 = `MySQL` / `Redis`**（第 2 步 install_app 自动给的应用商店规范名，user=root/db=0，通用、**绝不带项目名**）——它们是全机共享设施，**不叫 `ryplus_uni`**。
> - **应用自身的东西**（app 容器名、数据库名、为本 app 建的库账号）才用 `app.id`：本项目 `ruoyi-admin/.../application.yml` `app.id: ryplus_uni`（库名 DB_NAME、redisson keyPrefix/clientName 都=`${app.id}`）→ 容器名/库名/库账号用 `ryplus_uni`。
> - 🔴 **别自造**"ryplus_uni 应用库账号 (MySQL)""Redis 7 (共享)"这类描述。引擎为本 app 建的库账号凭据会**自动用库名 `ryplus_uni` 作 label**（与共享 `MySQL` 凭据是两条，别混）。
- `name`: 部署目标名 `ryplus_uni-backend`（target 名可带端后缀，不影响凭据名）；`servers`: `["<别名>"]`。
- 🔴 **`release.deployRoot` 必须 = `/opt/opspub/stacks/ryplus_uni`**（= `/opt/opspub/stacks/<app.id>`）——compose 落这里、compose project=`ryplus_uni`（唯一）→ OpsPub「容器/编排」页认作**自己的栈**（有启停/重建/编辑按钮）。**别用** `/opt/ryplus` 这类 stacks 外的目录：会被扫成「外部栈」只读、且 project 名取目录名不唯一（之前的坑）。
- **`compose.template`：只含 app 一个服务**——🔴 **不要**在里面再起 mysql/redis（用第 2 步的共享库）。**容器名 = 应用 app.id 本身 `ryplus_uni`（🔴 不加 `-app` 等后缀）**；用 `bellsoft/liberica-openjdk-rocky:21` 挂载 jar 跑；密钥写哨兵 `__DB_PASSWORD__`/`__REDIS_PASSWORD__`/`__JWT_SECRET_KEY__`（**禁明文**）。
- 🔴 **app↔共享库接线（最易错）**：共享库绑宿主 `127.0.0.1`、**不在** app 的 compose 网络里——`DB_HOST=mysql` 那套桥接网 DNS **连不到**。正解：app 走 **host 网络**（`network_mode: host`），env `DB_HOST=127.0.0.1`、`REDIS_HOST=127.0.0.1`（不是服务名）、`DB_NAME=ryplus_uni`、`DB_USERNAME=ryplus_uni`；或加 `extra_hosts: ["host.docker.internal:host-gateway"]` 且 `DB_HOST=host.docker.internal`。
- 🔴 **库+账号默认靠 `compose.db` 让引擎建**（默认 MySQL 版；引擎也支持 PostgreSQL，见下）：`compose.db`: `{ vaultId:<共享 MySQL 的 mysql_conn(root)>, mode:"create", dbName:"ryplus_uni", dbUser:"ryplus_uni" }` → 引擎自动「建库+建独立账号+**登记成第二条独立 mysql_conn(label=ryplus_uni)**」。
  - ⚠️ **别图省事**用 `ssh_exec` / `db_execute` 跑 `CREATE DATABASE` / `CREATE USER` / `GRANT` 自己建账号——那样账号建了但**不会登记成 OpsPub 凭据**（服务凭据页只剩共享 root 一条，缺 app 专属那条，最小权限连接也没法在数据库页用）。这是已知翻车点。
  - ✅ **正确终态 = 两条 mysql_conn**：① 共享 `MySQL`(root，第 2 步 install_app 给) ② app 专属 `ryplus_uni`(本步 compose.db 自动给)。app 用 ② 连库（最小权限），① 仅供 OpsPub 管理/建库。
  - 🔴 **PostgreSQL 版**：引擎也支持。`compose.db` 的 `vaultId` 选共享 PG 的 `postgres_conn` 管理员凭据（如 postgres），其余同上（`mode:"create"`、`dbName`/`dbUser`=`ryplus_uni`）：引擎建库 + 账号（库属主与 public schema 属主都归应用账号）、登记成第二条 `postgres_conn`，并**以应用账号**导入 `initSqls`（换成 PG 版脚本）。`DB_HOST`/`DB_PORT`/`DB_NAME`/`DB_USERNAME`/`DB_PASSWORD` 哨兵照常填充；应用侧的 PG 驱动 / JDBC URL 配置不归引擎管，要在 compose 环境变量里按 PG 配。用户明确要求手工建库时的出口，见通用配方 `get_skill("opspub-app-deploy")` 第 3 步「引擎不支持时的出口」。
- `compose.redis`: `{ vaultId:<redis_conn> }`；`secrets`: `["JWT_SECRET_KEY"]`。
- `initSqls`: 按序 `["<本机>/script/sql/ry_plus_sys.sql", "<本机>/script/sql/ry_plus_app.sql"]`（系统表 + 业务表）。
- **低内存 JVM**：`-Xms256m -Xmx640m -XX:+UseG1GC`；env 关 `MONITOR_ENABLED`/`SNAIL_JOB_ENABLED`/`ROCKETMQ_ENABLED`/`MQTT_ENABLED`/`LANGCHAIN4J_ENABLED`/`OPEN_API_ENABLED`（<2G 扛不住，要哪个再单开）。
- 🔴 **后端 target 不要设 `domain`**（后端只监听 `127.0.0.1:5500`）——域名 / HTTPS / 同域 API 反代**统一由第 5 步的前端 static-openresty target 接管**。给后端设 domain 会触发**整域反代到后端**（`location /→后端`），前端 SPA 就没地方挂了（这是之前部署翻车、要手写 vhost 的根因）。
- 后端 jar：本机 `mvn clean package -DskipTests` 产出（或复用近期已构建的，省 3-5 分钟）。

### 4. 预览 → 等确认 → 执行
`deploy_dry_run` 看各阶段命令 → 讲给用户、**等确认** → `deploy_run`。之后用户在「部署」页一键重部署 / 回滚。

### 5. 前端 PC（plus-ui）= 一个 static-openresty 部署目标（域名 / HTTPS / 同域 API 反代一站搞定，**别手写 vhost**）
本机 `pnpm build:prod`（`plus-ui/.env.production` 的 `VITE_APP_BASE_API='/ryplus_uni'`，与下面 `apiProxyPrefix` 一致）。
然后 `deploy_upsert_target` 建**前端目标**（recipe=`static-openresty`，buildSource=`artifact`）：
- `name`: `ryplus_uni-web`；`servers`: `["<别名>"]`；`domain`: `ali.ruoyikj.top`；`https`: `true`。
- `artifact.localDir`: plus-ui 的 `dist`（引擎打包上传 → releases → current 软链原子切换）。
- `vars`: `{ "apiProxyPort": "5500", "apiProxyPrefix": "ryplus_uni", "sslEmail": "<邮箱>" }`
  → 引擎自动：建静态站（`/` → SPA）+ **注入 `location /ryplus_uni/ → 127.0.0.1:5500`**（含 WebSocket 头，80/443 两块都注入）+ 签 Let's Encrypt 证书。
- `deploy_dry_run` → 讲给用户、等确认 → `deploy_run`。**同域名「前端 SPA + 后端 API + HTTPS」一次完成，无需手写 vhost、无需自己调 web_*。**
> 注：早先误以为这是"已知 gap 要手补 vhost"——其实 `static-openresty` 配方的 `apiProxyPort`/`apiProxyPrefix` 原生支持同域反代，之前是**配方没暴露这俩变量 + 没用对**（已修）。

### 6. 验收（用真实接口，别用 actuator）
`GET https://<域名>/ryplus_uni/auth/imgCode` 返回 **200 + 验证码图** → 同时证明 HTTPS→反代→后端→Redis 整链路通。**别用** `/actuator/health`（关了监控会 404 误判）。浏览器再看登录页渲染 + 无控制台报错。

## 收尾自检
- 用户打开 OpsPub 工作台，能在 **数据库 / 服务凭据 / 网站 / 证书 / 部署历史** 里看到这次部署吗？能 = 成。不能则补登记。
- 🔴 **服务凭据应有两条 mysql_conn**：共享 `MySQL`(root) + app 专属 `ryplus_uni`。**只有一条** = 你手动建了账号没走 `compose.db`（漏登记）→ 用 `save_credential` 补一条 `ryplus_uni`（host/port/user=ryplus_uni、database=ryplus_uni，密码从 app 容器 `printenv DB_PASSWORD` 经脱敏 vaultRef 传 `fieldsFromVault`）。PG 版同理：应有 app 专属的 `postgres_conn`（`compose.db` 自动登记），没有就同法补。

## 铁律
- 默认 Docker；内存紧张 = swap + `mem_limit` + 调 JVM/MySQL，**仍 Docker**，不擅自切原生。
- 凭据永不进对话/日志（`[REDACTED:xxx]` 是正常脱敏，别因此重新生成密码死循环）。
- MySQL/Redis 是共享单例；app 容器唯一名；产物一律进台账。

---
