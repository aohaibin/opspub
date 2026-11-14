---
name: reeve-app-deploy
description: 通用「用 OpsPub 部署任意应用」配方（框架无关）—— 共享中间件 install_app + 部署目标 deploy_upsert_target(compose 托管)，产物全进工作台台账、可一键重部署/回滚。任何项目部署没有专属框架技能时的默认剧本。
触发词: 部署, 上线, 发布, deploy, 部署到, 部署项目, 部署应用, 部署后端, 部署前端, docker部署, docker 部署, 容器部署, 上服务器, 发布到服务器, 部署到服务器, 生产部署, 上生产, 全栈部署, 反向代理部署, 用reeve部署, reeve部署
---

# 用 OpsPub 部署任意应用（通用配方 · 框架无关）

适用：用户要把**任意项目**（Spring Boot / Node / Python / Go / PHP / 静态站 …）部署到远程服务器。
**先查有没有针对该框架的专属技能**（`evaluate_skills` 命中如 `ruoyi-plus-uniapp-deploy` 就优先用它，更精确）；没有就用本通用剧本。

> 🔴 **核心纪律：一切走「OpsPub 工具 + 部署目标(Target)」，绝不用 `ssh_exec` 手写 docker-compose / openssl 生成 .env；建库账号默认也交给引擎（引擎不支持的库类型除外，见第 3 步「引擎不支持时的出口」）**。
> 手搓的产物**不进任何台账**（数据库 / Redis / 服务凭据 / 网站 / 证书 / 部署历史全空）、容器命名乱、用户**不能在工作台查看、不能一键重部署 / 回滚**——这是反复踩过的坑。

## 术语：`<应用标识>`（贯穿全程的唯一名）
取应用自身配置里的唯一标识，**全程一致**用它命名（app 容器名 / 数据库名 / per-app 库账号 / 部署目标名 / 栈目录）：
- Spring Boot：`application.yml` 的 `app.id` 或 datasource 库名；
- Node：`package.json` 的 `name`；其它框架同理取项目唯一名；都没有 → 用项目目录名（小写、`[a-z0-9_]`）。
> 例：ruoyi 的 `<应用标识>` = `ryplus_uni`。下文 `<应用标识>` 处一律替换成它。

## 🤖 第零步：优先用 OpsPub 专用工具（别裸 SSH 即兴）
- **探环境**（只读；approval 档服务器上每条操作含只读都要审批）：`system_info` / `disk_usage`（内存+swap、磁盘）、`system_listen_ports`（查端口冲突）、`service_status`、`docker_list_containers`、`ssh_exec`(只读) 查域名解析。
- **装共享中间件**：`install_app(server, "mysql"|"redis"|"postgres"|"mongodb")`（应用商店同款：密码 OpsPub 生成同步进容器+凭据库**必连得上**、容器 `reeve-<app>`、绑 127.0.0.1、自动登记 `_conn` 带 SSH 隧道）。🔴 **别用 `install_with_secret` 手写脚本装这些库**（手写易致"存的密码≠容器密码"、工作台连不上）。
- **建/触发部署**：`deploy_upsert_target`（产出部署目标，只写不执行）→ `deploy_dry_run`（预览）→ `deploy_run`（执行，进部署历史、可回滚）。
- **传产物**：`sftp_upload`（jar / dist 等大文件）；`sftp_read`/`sftp_write`（小文件 / 改配置）。
- 改动型（装库 / 部署 / sudo）按服务器档位走**审批**——提前告知用户、被拒别原样重试。

## 1. 探环境 → 报告 → 等确认（严禁探完直接干）
探完把现状 + **默认 Docker 方案**讲给用户，**拿到明确「确认 / 继续」才动手**。重点报：系统 / **内存+swap**（<2G 全栈必加 swap）/ 磁盘、Docker 装没装、域名解析、80/443 安全组、本地构建链。

## 2. 共享中间件一次装好（通用设施，整机一套）
- 需要 MySQL/Redis/PostgreSQL 等 → 用 **`install_app`** 装（见第零步）。
- 🔴 **通用设施，不带项目名**：凭据 label = 应用商店规范名 `MySQL` / `Redis`（user=root / db=0），容器 `reeve-mysql`/`reeve-redis`。**已装就复用**（`list_installed_services` 查），第二个项目共用同一套、**别重复装、别套项目前缀**。
- 记下返回的 `vault_id`，下一步引用。

## 3. 建后端部署目标 `deploy_upsert_target`（recipe=`docker-compose`，开 `compose` 托管）
- `name`: `<应用标识>-backend`（target 名可带端后缀，不影响凭据 / 栈名）；`servers`: `["<别名>"]`。
- 🔴 **`release.deployRoot` 必须 = `/opt/reeve/stacks/<应用标识>`**：compose 落这里、compose project = `<应用标识>`（唯一）→ OpsPub「容器/编排」页认作**自己的栈**（有启停/重建/编辑按钮）。**别用** `/opt/<app>` 等 stacks 外目录（会被扫成「外部栈」只读、project 名取目录名易撞）。
- **`compose.template`：只含 app 一个服务**——🔴 不在里面再起 mysql/redis（用第 2 步的共享库）。**容器名 = `<应用标识>` 本身**（🔴 不加 `-app` 等后缀）；密钥写哨兵 `__DB_PASSWORD__` / `__REDIS_PASSWORD__` / `__JWT_SECRET_KEY__`（**禁明文**）。
- 🔴 **app↔共享库接线（最易错）**：共享库绑宿主 `127.0.0.1`、**不在** app 的 compose 网络里——`DB_HOST=mysql` 那套桥接网 DNS **连不到**。正解：app 走 **host 网络**（`network_mode: host`）、env `DB_HOST=127.0.0.1`/`REDIS_HOST=127.0.0.1`（不是服务名）；或 `extra_hosts: ["host.docker.internal:host-gateway"]` + `DB_HOST=host.docker.internal`。
- 🔴 **per-app 库+账号默认靠 `compose.db` 让引擎建**（目前支持 **MySQL / PostgreSQL**，按所选凭据类型分流）：`compose.db`: `{ vaultId:<共享库的管理员凭据：MySQL 的 mysql_conn(root) / PostgreSQL 的 postgres_conn(postgres)>, mode:"create", dbName:"<应用标识>", dbUser:"<应用标识>" }` → 引擎自动「建库+建独立账号+**登记成第二条独立凭据（mysql_conn / postgres_conn，label=<应用标识>）**」。
  - ⚠️ **别图省事**用 `ssh_exec`/`db_execute` 跑 `CREATE DATABASE`/`CREATE USER`/`GRANT` 自己建——账号建了但**不登记成凭据**（服务凭据页缺 app 专属那条、最小权限连接没法用）。
  - ✅ **终态 = 两条同类型凭据**（mysql_conn / postgres_conn）：① 共享管理员凭据（`MySQL` root / `PostgreSQL` postgres） ② app 专属 `<应用标识>`；app 用 ②（最小权限）连库，① 仅供 OpsPub 管理建库。
  - 🔴 **引擎不支持时的出口（别卡着）**：上面这条约束的目的是「产物进台账」，**不是安全红线**。遇到 ① 目标库**既不是 MySQL 也不是 PostgreSQL**（MongoDB / SQL Server 等，`compose.db` 会报「数据库托管目前仅支持 MySQL / PostgreSQL 凭据」），或 ② 用户**明确要求**手工建 / 授权你直接处理 → **允许手工建库账号**，不算违规，但须守：
    - **先告诉用户**「引擎暂不支持 X，我改手工建」和具体做法，再动手；
    - 密码**在服务器端生成、不进 stdout**：用 `ssh_exec_script` 在一个脚本里完成「生成 → `CREATE DATABASE`/`CREATE USER` → 写进 compose / .env」，命令里别 `echo`/`cat` 它，更别让它进对话；
    - 建完**必须 `save_credential` 补登记**（kind 按该库类型，如 `mongodb_conn`，label=`<应用标识>`，密码经脱敏 vaultRef 传 `fieldsFromVault`，做法同「收尾自检」）；
    - 没配 `compose.db` 时 `initSqls` 只会被上传到 `{deployRoot}/initdb/`，**不会**导入共享库，初始数据要手工导入；
    - 仍用 OpsPub 的工具手工做（有审计 + 脱敏），别退到本机裸 `ssh`。
- 用 Redis → `compose.redis`: `{ vaultId:<redis_conn> }`；自动生成的密钥放 `secrets`（如 `["JWT_SECRET_KEY"]`）。
- 首次要导 SQL → `initSqls`: `["<本机绝对路径>/xxx.sql", ...]`（按序）。
- 🔴 **后端 target 不要设 `domain`**（后端只监听 `127.0.0.1:<端口>`）——域名 / HTTPS / 同域 API 反代统一由第 4 步前端 target 接管。给后端设 domain 会触发**整域反代到后端**、把前端 SPA 挤掉。
- 产物：本机构建（如 jar / 镜像）由 target 的 `build_commands` / `image` / `artifact` 承载；运行时 / 内存调优按框架定（低内存：swap + `mem_limit` + 限堆，**仍 Docker**）。
- 🔴 **含本机侧操作的目标**（`build_commands` / `artifact` / `image` / `initSqls`，即在用户电脑上执行构建、上传本机文件）：`deploy_upsert_target` 返回的 `localSideEffects` 会列出这些操作，**首次 `deploy_run` 会弹审批请用户逐行确认**（同一份配置确认过就不再问）。调用前先把这几行讲给用户；被拒就停手问原因，别改写配置重试。

## 4. 预览 → 等确认 → 执行
`deploy_dry_run` 看各阶段命令 → 讲给用户、**等确认** → `deploy_run`。之后用户在「部署」页一键重部署 / 回滚。

## 5. 前端（若有 SPA / 静态站）= 一个 static-openresty 部署目标（域名 / HTTPS / 同域 API 反代一站搞定，**别手写 vhost**）
本机构建静态产物（前端 `.env` 的 API base 要与下面 `apiProxyPrefix` 一致）。然后 `deploy_upsert_target` 建前端目标（recipe=`static-openresty`，buildSource=`artifact`）：
- `name`: `<应用标识>-web`；`servers`: `["<别名>"]`；`domain`: `<域名>`；`https`: `true`；`artifact.localDir`: 前端 `dist`。
- `vars`: `{ "apiProxyPort": "<后端端口>", "apiProxyPrefix": "<API 前缀>", "sslEmail": "<邮箱>" }`
  → 引擎自动：建静态站（`/`→SPA）+ **注入 `location /<前缀>/ → 127.0.0.1:<后端端口>`**（含 WebSocket 头，80/443 都注入）+ 签 Let's Encrypt 证书。
- **同域名「前端 SPA + 后端 API + HTTPS」一次完成，无需手写 vhost、无需自己调 `web_*`。**
- 纯后端 / 无前端 SPA → 不建前端 target；要给后端单独配域名+HTTPS，用 `web_create_proxy` + `web_issue_ssl`（域名 → `127.0.0.1:<端口>`）。
- **不走部署目标、单独建站时**也用 OpsPub 原生工具（站点进「网站」页、证书进「证书」页并自动续期）：`web_status` 探 OpenResty → 未装则 `web_install_openresty`（需 Docker）→ `web_create_proxy(域名, 127.0.0.1:<端口>)` 或 `web_create_static(域名)` + `sftp_upload` 传 dist → `web_issue_ssl(域名, 邮箱)`（需域名已解析到本机、80 公网可达，提醒用户放安全组）。🔴 别自己 `apt install nginx` + 手写 vhost + `certbot`——工作台看不到、不接管续期。

## 5b. 没有域名、只给用户自己用的服务 → 配端口转发隧道（别把最后一步甩给用户）
管理面板 / Web UI / 无认证开发工具这类**故意只绑 `127.0.0.1`** 的服务，用户在自己电脑上根本打不开——部署「成功」了却进不去：
- `list_port_forwards` 确认本地端口没被占 → `create_port_forward(server, name, localPort, remoteHost="127.0.0.1", remotePort)`（默认立即启动 + 开机自启）→ 把返回的 `localUrl`（如 `http://127.0.0.1:3080`）告诉用户直接点开。
- 🔴 别改成「绑 0.0.0.0 / 内网 IP」图省事：无认证服务等于把 shell 挂到网上；且浏览器只在安全上下文（HTTPS 或 localhost）暴露 `crypto.randomUUID` / `crypto.subtle`，走 IP 的明文 HTTP 会让不少前端白屏。
- 要给别人访问的公开站点仍走第 5 步（域名 + HTTPS）。

## 6. 验收（用真实接口，别用探活端点）
请求一个**真实公开接口**（登录页会调的验证码 / 配置 / 健康业务接口），HTTPS 返回 200 + 正常内容 → 证明 HTTPS→反代→后端→DB/Redis 整链路通。**别**只依赖 `/actuator/health` 这类（很多项目关了会 404 误判）。浏览器再看页面渲染 + 无控制台报错。

## 收尾自检（缺啥补啥，确保工作台可见可管）
- 打开 OpsPub 工作台，**数据库 / 服务凭据 / 网站 / 证书 / 容器(编排) / 部署历史** 里都能看到这次部署吗？**用户现在能点开刚装的东西吗？** 不能则补登记 / 补隧道（第 5b 步）。
- 装出来的常驻服务（1Panel / Portainer / 自建后台等）→ `save_credential` 登记一条（带 access_url / host / 端口），否则「服务凭据」页是空的。需要密码的这类服务用 `install_with_secret` 装，长安装（1Panel / Jenkins / Portainer 等 5~15 分钟级）显式传 `timeoutSecs: 1800`；`list_installed_services` 查、`delete_installed_service` 删。
- 脚本 / 备份 / 上传产物放远程 `~/.reeve`（OpsPub 远程工作区），别臆造 `/data/...`、`/opt/backup` 这类不存在的路径。
- 🔴 **用了 MySQL / PostgreSQL → 服务凭据应有两条同类型凭据（mysql_conn / postgres_conn）**：共享 `MySQL`(root) + app 专属 `<应用标识>`。只有一条 = 没走 `compose.db`（漏登记）→ 用 `save_credential` 补（host/port/user/database=`<应用标识>`，密码从 app 容器 `printenv DB_PASSWORD` 经脱敏 vaultRef 传 `fieldsFromVault`）。
- 🔴 **走了手工出口的库（MongoDB 等）→ 同样要有 app 专属那条凭据**（kind 按该库类型，label=`<应用标识>`），没有就按上一条 `save_credential` 补。PostgreSQL 与 MySQL 一样由 `compose.db` 自动登记 `postgres_conn`。
- 🔴 **后端容器在「编排」页是「自己的栈」而非「外部」** → 若显示「外部」=deployRoot 没落在 `/opt/reeve/stacks/`，下次部署改对。

## 铁律
- 默认 Docker；内存紧张 = swap + `mem_limit` + 限堆 / 调 DB 缓冲，**仍 Docker**，不擅自切原生（除非用户明确要）。
- 共享 MySQL/Redis 通用名、整机一套；app 自身的东西（容器 / 库 / 库账号 / 栈目录 / target）一律用 `<应用标识>`。
- 凭据永不进对话 / 日志（`[REDACTED:xxx]` 是正常脱敏，别因此重新生成密码死循环）。
- 产物一律进台账（走 install_app / deploy_upsert_target / save_credential / web_*），别手搓绕过；引擎不支持的环节走第 3 步「引擎不支持时的出口」，手工做完照样补登记。

---
