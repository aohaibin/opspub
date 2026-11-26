# OpsPub 技能库导出（全量正文）

- 来源： 本机技能库（`list_skills`）
- 技能总数：**43**（内建 41 + 用户自定义 2：`testOne`、`opsTwo`）
- 导出方式：逐个 `get_skill` 原样抓取，正文未做任何删改
- 说明：每个技能以「frontmatter + 正文」原格式收录；`dangerous_commands` 属技能自带安全规则，一并保留

---

## 目录

| # | 技能 | 用途 |
|---|------|------|
| 1 | 1panel-ops | 1Panel 国产面板运维（状态/改端口入口密码/应用商店容器路径/卸载） |
| 2 | borgbackup-restic | borg + restic + rsnapshot 备份/恢复/保留策略/演练 |
| 3 | caddy-traefik | Caddy（自动 HTTPS）+ Traefik（容器化反代）配置与排障 |
| 4 | certbot-acme | Let's Encrypt / ACME 证书签发、续期、通配符、排障 |
| 5 | clickhouse-ops | ClickHouse 运维（system.* / parts / merges / 副本 / 备份） |
| 6 | db-tools | OpsPub 数据库直连工具 db_query / db_execute / db_transaction |
| 7 | deepseek-harness-deploy | DeepSeek Harness（dsh）部署配方与踩坑 |
| 8 | disk-provisioning | 数据盘分区/格式化/挂载/扩容（含极高危审批流程） |
| 9 | docker-ps | Docker 容器排障（状态/日志/资源/网络/清理/compose） |
| 10 | git-server | 自建 Git（Gitea / GitLab CE / Gogs）安装/备份/迁移 |
| 11 | iptables-firewalld | iptables / nftables / firewalld / ufw 与 NAT、持久化 |
| 12 | java-jvm-tuning | JVM 调优与诊断（jstack / jmap / jcmd / jstat / arthas） |
| 13 | jenkins-runner | Jenkins / GitLab Runner / Gitea Actions Runner |
| 14 | kafka-ops | Kafka 运维（topic / lag / KRaft / reassignment） |
| 15 | kubernetes-basics | Kubernetes 基础（kubectl / helm / 调试 / yaml） |
| 16 | linux-fundamentals | Linux 基础运维速查（系统/进程/磁盘/网络/用户/cron） |
| 17 | log-investigation | 日志排障（路径表 / journalctl / strace / logrotate） |
| 18 | loki-promtail | Loki + Promtail 日志聚合栈（LogQL / Grafana / S3 后端） |
| 19 | minio-s3 | MinIO 对象存储（mc / bucket / policy / lifecycle / 镜像线） |
| 20 | mongodb-ops | MongoDB 运维（mongosh / 备份 / 副本集 / 分片 / 索引） |
| 21 | mssql-ops | SQL Server（Linux/Docker）装机、排障、备份还原 |
| 22 | mysql-ops | MySQL / MariaDB 安装与运维（含 Windows 原生路线） |
| 23 | nfs-smb-share | NFS / SMB 网络文件共享与 autofs |
| 24 | nginx-status | Nginx 排障（状态/语法/端口/日志/reload/反代） |
| 25 | nodejs-pm2 | Node.js 部署（nvm/fnm + PM2 + cluster + 日志） |
| 26 | ollama-vllm | 本地 LLM 部署（Ollama / vLLM / llama.cpp） |
| 27 | openresty-lua | OpenResty（Nginx + Lua）配置、鉴权、WAF、安全 reload |
| 28 | opsTwo | 用户自定义技能（模板空壳，待填） |
| 29 | php-fpm-ops | PHP-FPM（pool / opcache / 慢日志 / max_children） |
| 30 | portainer-ops | Portainer 面板（endpoint / stacks / 备份 / 重置密码） |
| 31 | postgresql-ops | PostgreSQL 运维（psql / pg_dump / vacuum / 流复制） |
| 32 | prometheus-grafana | Prometheus + Grafana + exporter + Alertmanager |
| 33 | python-venv-uwsgi | Python 部署（venv / pyenv / uWSGI / gunicorn / systemd） |
| 34 | rabbitmq-ops | RabbitMQ 运维（queue / vhost / 集群 / quorum queue） |
| 35 | redis-ops | Redis 服务端运维（内存/持久化/主从/哨兵/Cluster） |
| 36 | redis-tools | OpsPub Redis 直连工具 redis_get/set/del/scan/exec |
| 37 | opspub-app-deploy | 通用「用 OpsPub 部署任意应用」配方（框架无关） |
| 38 | ruoyi-plus-uniapp-deploy | RuoYi-Plus + uniapp 全栈部署配方 |
| 39 | selinux-apparmor | SELinux / AppArmor 强制访问控制排障 |
| 40 | ssh-hardening | SSH 加固（sshd_config / 密钥 / fail2ban / 2FA） |
| 41 | systemd-service | systemd 自定义服务（unit / timer / journalctl） |
| 42 | testOne | 用户自定义技能（模板空壳，待填） |
| 43 | wireguard-vpn | WireGuard VPN（密钥 / 配置 / 路由 / 排障） |

---

## 1. 1panel-ops

```yaml
---
name: 1panel-ops
description: 1Panel 国产 Linux 运维面板速查 —— 状态 / 服务管理 / 应用商店容器路径 / 备份 / 改端口入口密码 / 重置。
触发词: 1panel, 1panel-core, 一面板, 1pctl, 国产面板, 应用商店, 面板登录, 面板密码, 改端口, 改入口, 改面板用户, 改面板域名, 装 1panel, 1panel 安装, 装面板, 面板挂了, 面板打不开, 面板进不去, 面板起不来, 面板登不上, 忘了面板密码, 重置面板, 面板重置, 面板备份, 面板恢复, 面板卸载, 卸载 1panel, fit2cloud, 面板用户名, 安全入口, 面板入口, 面板端口
dangerous_commands:
  # 1pctl reset / uninstall —— 但允许 --help / -h 查询（用 [^-] 排除 --help / -h 开头）
  # 末尾必须是行尾、; & |，或一个非 - 字符（避免 --help/--force 等查询型 flag 误中）
  - '(?:^|[\s;&|])1pctl\s+(?:reset|uninstall)(?:\s*$|[\s;&|]+[^-])'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/opt/1panel(?:\s|/|$)'
---
```

# 1panel-ops —— 1Panel 国产面板运维

适用：用户报"装 1Panel"/"面板登录不上"/"应用挂了"/"忘了面板密码"/"装了 1Panel 但不熟命令"/"想知道 MySQL/Redis 容器配置文件在哪"。

## 🤖 第零步：优先用 OpsPub 专用工具（面板探测/改配置先走这些）

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看面板进程状态 | `service_status(server, "1panel-core")`（v2）或 `"1panel"`（v1） | systemctl status |
| 看面板主日志 | `tail_log(server, "/opt/1panel/log/1Panel.log")` | tail -n |
| 看面板占盘 | `disk_usage(server, "/opt/1panel")` | df -hT |
| 查面板端口 | `port_check(server, 面板端口)` | ss -tlnH |
| 改应用 compose / conf | `sftp_read` 看现状 + `sftp_write` 整文件写 | cat / 编辑器 |

这些只读工具**任何策略档位都放行**。注意：`1pctl` 是面板专属 CLI（探测真实端口/入口/用户名、改配置），**只能走 `ssh_exec`**——本技能后文的 1pctl 流程不可替代。docker 应用的 compose/.env 用 `sftp_read`+`sftp_write` 写（无 heredoc 转义坑）。

⚠️ `1pctl update *` / `reset` / `uninstall` / `docker compose down` 等都是写操作，会触发**用户审批**——提前告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## ⚠️ 版本铁律：v1 和 v2 的 systemd 服务名不一样

- **v2.x**：服务名 `1panel-core`（**当前主流，2025+ 新装基本都是 v2**）
- **v1.x**：服务名 `1panel`

**检测/操作都要兼容两种**。永远不要写死 `systemctl is-active 1panel` —— v2 上会得到 inactive 误判"未装"。最稳妥的做法：
1. 先看 `1pctl` 是否存在（不分版本）
2. 服务状态优先用 `1pctl status`（CLI 自动找当前版本的服务）
3. 一定要 systemctl 时，`systemctl is-active 1panel-core 2>/dev/null || systemctl is-active 1panel`
4. **千万别用** `A && B && echo X || echo Y` 这种链式 ——`echo X` 失败也会 fallthrough 到 echo Y，得 `if/then/else` 写清楚

## 🤖 装 1Panel：必读铁律（违反 = 给用户错误信息）

### ⛔ 六条绝对禁止

1. **绝不**用 `install_with_secret` 装 1Panel。`public` 字段是你单向输入，1Panel 脚本不会读 → 你塞的 `PANEL_USERNAME=admin` 进 vault 全是幻觉值。**必须**用纯 ssh_exec。

2. **绝不**调 `1pctl update username/entrance/port`。1Panel 装好时已经随机生成了，**保留就好** —— 你的任务是 *探测* 真实值告诉用户，不是 *改成你想要的值*。这三条命令只在用户**主动说**「我要把端口改成 X / 入口改成 Y / 用户名改成 Z」时才能调。

3. **绝不**用 v1 URL。下面 Step 2 的 URL 必须带 `/v2/`。

4. **绝不**告诉用户 `用户名: admin`。v1/v2 用户名都是随机 10 字符（`542efeec5a` 这种）。

5. **绝不**靠记忆/vault 回答凭据。用户问 "用户名/端口/入口是啥" → **每次**都先 `ssh_exec 1pctl user-info` 重读 → 再答。

6. **绝不**跳过 Step 0 的「问偏好」直接装。

### Step 0：问用户偏好（强制）

第一次决定装 1Panel 时，**必须**先发这段问用户：

> 1Panel 默认会随机生成端口、入口、用户名。你有偏好吗？
> - **A. 默认随机**（推荐，安全）—— 直接回复"继续"
> - **B. 自定义其中某些项** —— 列出来，如 "端口 38080；其它随机"
>
> 我会按你的选择装。

收到回复前**不要装**。用户说"继续"就走默认；说自定义就**只对用户明说的字段**装完跑 `1pctl update <field>`，其它一律不动。

### ✅ Step 1～5：纯 ssh_exec 流程（默认全随机）

```bash
# Step 1：检查是否已装 + 资源预检
if command -v 1pctl >/dev/null 2>&1; then
  systemctl is-active 1panel-core 2>/dev/null || systemctl is-active 1panel 2>/dev/null && { echo "已装运行中"; 1pctl version | head -3; exit 0; }
fi
free -h | grep -i mem; df -h / | tail -1

# Step 2：装（v2 主线，注意 URL 里有 /v2/）
curl -fsSL https://resource.fit2cloud.com/1panel/package/v2/quick_start.sh -o /tmp/1panel.sh
echo y | bash /tmp/1panel.sh

# Step 3：探测真实值（唯一可信源，下面 4 行结果决定告知用户的所有内容）
sleep 5
INFO=$(1pctl user-info)
echo "=== 1pctl user-info 原文 ==="
echo "$INFO"
echo "=== 解析 ==="
PANEL_URL=$(echo "$INFO" | grep -oE 'https?://[^[:space:]]+' | head -1)
echo "URL: $PANEL_URL"
echo "PORT: $(echo "$PANEL_URL" | sed -E 's#.*://[^/:]+:([0-9]+)/.*#\1#')"
echo "ENTRANCE: $(echo "$PANEL_URL" | sed -E 's#.*/([^/]+)/?$#\1#')"
echo "USERNAME: $(echo "$INFO" | grep -iE '用户名|username' | grep -oE '[A-Za-z0-9_-]+$' | head -1)"

# Step 4：仅重置密码（user-info 不显示密码 → reset 拿到明文）
#  ⚠️ 这里只 update password。**不要** update username/entrance/port —— 那会破坏 1Panel 的随机值
NEW_PWD=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)
printf '%s\ny\n' "$NEW_PWD" | 1pctl update password

# ⚠️ 必须 echo 一次让明文回到 stdout —— **不是给 AI 看的**，是触发 OpsPub redaction 引擎
# 把它捕获进敏感库，tool_result.vaultRefs 里会带回 vault_id（如 sv_xxx）。
# AI 看到的是 [REDACTED:generic_password_line] 占位符，**永远不接触明文**。
echo "PANEL_PASSWORD_NEW=$NEW_PWD"

# Step 5：默认中文 + 开防火墙
DB=$(find /opt -name 1Panel.db 2>/dev/null | head -1)
[ -n "$DB" ] && sqlite3 "$DB" "UPDATE settings SET value='zh' WHERE key IN ('Language','SystemLanguage');" && 1pctl restart
PORT=$(echo "$PANEL_URL" | sed -E 's#.*://[^/:]+:([0-9]+)/.*#\1#')
ufw allow ${PORT}/tcp 2>/dev/null || firewall-cmd --permanent --add-port=${PORT}/tcp 2>/dev/null
```

### 自定义场景（用户在 Step 0 明说要改某项时）

仅对用户明说的字段，**装完之后**追加（用 printf 喂确认；不要为图省事在装时通过 env 传，那不生效）：

```bash
# 改端口（用户说要 38080）
printf '38080\ny\n' | 1pctl update port
# 改入口（用户说要 foo）
1pctl update entrance foo
# 改用户名（用户说要 myadmin）
printf 'myadmin\ny\n' | 1pctl update username
```

**没明说要改的项不要动**。

### Step 6：把真实凭据入「服务凭据」库（**必做，且 AI 不接触密码**）

Step 4 的 stdout 里 `PANEL_PASSWORD_NEW=...` 这一行触发 OpsPub redaction 引擎 → 密码进敏感库，**ssh_exec 的 tool_result 里会返回 `vaultRefs`**，形如：

```json
{
  "stdout": "...PANEL_PASSWORD_NEW=[REDACTED:generic_password_line]\n",
  "vaultRefs": [
    { "vaultId": "sv_a1b2c3d4...", "label": "命令输出中的密码", "preview": "B4****Zh", "hint": "..." }
  ]
}
```

AI **看不到密码明文**，只看到 vault_id。然后调 save_credential 用 `fieldsFromVault` 指针把密码引到「服务凭据」库（后端 reveal vault → AES-GCM 加密入库；AI 全程只见 vault_id）：

```json
{
  "tool": "save_credential",
  "args": {
    "server": "<服务器别名>",
    "kind": "1panel",
    "label": "1Panel",
    "fields": {
      "PANEL_PORT": "<Step 3 解析的 PORT>",
      "PANEL_ENTRANCE": "<Step 3 解析的 ENTRANCE>",
      "PANEL_USERNAME": "<Step 3 解析的 USERNAME>"
    },
    "fieldsFromVault": {
      "PANEL_PASSWORD": "<上一步 vaultRefs[0].vaultId，形如 sv_xxx>"
    }
  }
}
```

工具返回 `vault_id`，用户能在「服务凭据」页 Reveal 看到完整凭据。
**这一步不做用户就找不到这套凭据**（敏感库 vault 是兜底，不是结构化凭据库）。
**严禁用 fields.PANEL_PASSWORD 传明文** —— 那是 AI 见过密码的违规路径。

### ✅ 装完告知用户

把 Step 3 解析出的 URL / PORT / ENTRANCE / USERNAME **一字不改**贴给用户。密码已通过 save_credential 加密入库 —— 告诉用户："凭据已入「服务凭据」库（vault_id=xxx），点 Reveal 查看密码"。

### ❓ 用户后续问凭据

**每次**都重跑 `ssh_exec 1pctl user-info`，再答。**别凭记忆**。

## 第一步：面板进程状态

```bash
# v2 是 1panel-core，v1 是 1panel。先用 1pctl status（与版本无关），失败再查 systemd
1pctl status
# 想看 systemd 详情：
systemctl status 1panel-core 2>/dev/null || systemctl status 1panel
```

`active (running)` 才算正常。`failed` → 第四步看日志。

## 第二步：核心命令

`1pctl` 是 1Panel 的官方 CLI：

```bash
1pctl status           # 服务状态
1pctl restart          # 重启面板
1pctl listen-ip        # 看面板监听 ipv4/ipv6
1pctl user-info        # 看登录用户名（不显示密码）
1pctl version          # 版本号 + 安装路径
1pctl reset            # 重置面板（⚠️ 危险，会清面板配置；用户数据保留）
```

### 🔥 修改面板配置 —— **必须用 `1pctl update <field> <value>`，不要自己改 sqlite db**

> ⚠️ **AI 铁律**：用户说「改端口/改入口/改密码/改用户名/改面板域名」时**只能**用下面这些命令。
> **绝不**自己 `sqlite3 /opt/1panel/db/1Panel.db UPDATE settings` —— 那是绕官方机制的脏改，可能损坏面板。
> **绝不**自己 `systemctl stop 1panel` + 手改 db —— 1pctl update 内部已经做了停服/改/启动/校验/回滚。

```bash
1pctl update port <new-port>          # 改面板端口（自动停服 → 改 db → 启服 → 校验）
1pctl update entrance <new-entrance>  # 改安全入口路径（hex 字符串，如 0d89ae1504367f03）
1pctl update username <new-name>      # 改登录用户名
1pctl update password                  # 改面板登录密码（⚠️ 走 approval；命令交互式，AI 不应跑）
1pctl update ip <ipv4>                # 改面板绑定 IP（默认监听 0.0.0.0）
1pctl update https <enable|disable>   # 启用/关闭 HTTPS
1pctl update domain <domain>          # 改面板访问域名（启用 HTTPS 后用）
```

### ⚠️ 1pctl update 是**交互式**——必须 printf 预填 + 调大 timeoutSecs

`1pctl update port/entrance/username` 即使带参数也会**强制问一次 `(y/n)?` 确认**。在 ssh_exec 这种 non-tty 通道里，命令会**等 stdin 永不返回**，触发 30s 超时。

**正确姿势**：用 `printf` 预填两行（新值 + 确认 y），命令进入交互模式后秒级完成：

```bash
# 改端口（不带参数让命令进入交互；printf 预填"新端口 + 确认"）
printf '32279\ny\n' | 1pctl update port

# 改入口
printf 'abc123def456\ny\n' | 1pctl update entrance

# 改用户名
printf 'admin2\ny\n' | 1pctl update username
```

ssh_exec 调用时 **`timeoutSecs: 60`** 起步（默认 30s 边缘场景容易超时）。

**反模式（**绝对不要**这样调）**：

```bash
# ❌ 错：会 30s 超时 —— 命令读完 port 参数后仍会问 y/n
1pctl update port 32279

# ❌ 错：echo y 喂错位置 —— 32279 吃掉 port 参数后，y 又被当成"新端口"重新问，报 "input port is not a number"
echo "y" | 1pctl update port 32279

# ❌ 错：不传参数 + 不预填 → 一样卡死等 stdin
1pctl update port
```

**踩坑历史**（写下来给 AI 自学习用）：
2026-05 用户改端口，AI 走了 5 步弯路（裸调 → echo y 喂错位置 → 才找到 printf）。直接背下 `printf '<new>\ny\n' | 1pctl update <field>` 这一句，下次 1 步搞定。

**不允许的反模式**（看到 AI 写这些请立刻拦下）：
- ❌ `sqlite3 /opt/1panel/db/1Panel.db "UPDATE settings SET value='32279' ...";`
- ❌ `systemctl stop 1panel; sed -i ... /opt/1panel/conf/app.yaml; systemctl start 1panel`
- ❌ 任何"绕过 1pctl 自己改文件"的尝试 —— 1Panel 把配置放数据库 + 内存缓存里，手改不一定生效，且面板下次写回时可能覆盖你的改动

## 第三步：应用商店容器路径约定

1Panel 通过 Docker 部署应用，**路径强约定**（卸载/迁移/备份必须知道）：

| 路径 | 内容 |
|------|------|
| `/opt/1panel/apps/<app>/<container_name>/` | 应用主目录（compose + 数据卷） |
| `/opt/1panel/apps/<app>/<container_name>/docker-compose.yml` | 编排文件 |
| `/opt/1panel/apps/<app>/<container_name>/conf/` | 配置（如 mysql/conf/my.cnf） |
| `/opt/1panel/apps/<app>/<container_name>/data/` | 持久化数据 |
| `/opt/1panel/apps/<app>/<container_name>/log/` | 日志 |
| `/opt/1panel/backup/` | 面板备份默认目录 |
| `/opt/1panel/log/1Panel.log` | 面板主日志 |

例：MySQL 配置 = `/opt/1panel/apps/mysql/mysql/conf/my.cnf`。

## 🤖 AI 自动部署应用（不依赖 1Panel 应用商店 UI）

> ⚠️ **关键认知**：1Panel 的"应用商店一键装"只能通过 Web UI 触发；`1pctl` CLI 不支持 `install <app>`。
> 所以 AI 收到「装 mysql/redis/nginx...」时**不要让用户去打开浏览器**，而是**自己写 1Panel 兼容布局的 compose 部署**——这样面板「容器 → 编排」会自动识别并能托管。

### 标准动作（AI 必须按这套来）

1. **建目录**（按 1Panel 路径约定，让面板能识别）：
   ```bash
   mkdir -p /opt/1panel/apps/<app>/<name>/{data,conf,log}
   ```

2. **生成 root 密码 + 写到敏感库**（用 `openssl rand` 即可；输出会被 OpsPub 敏感库自动捕获）：
   ```bash
   openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24
   ```

3. **`sftp_write` 写入 docker-compose.yml**（贴合 1Panel 风格的最小模板，下面给 MySQL 示例）

4. **启动**：
   ```bash
   cd /opt/1panel/apps/<app>/<name>/ && docker compose up -d
   ```

5. **验证**：`docker ps | grep <name>` + `port_check`（如果是数据库还可 `docker exec ... mysql -uroot -p`）

6. **告诉用户**：「已经按 1Panel 风格部署好；在 1Panel UI「容器」标签可以看到 `<name>` 容器，「编排」标签可以看到这个 compose 项目，**面板能正常管它**（启停/查日志/备份）」

### MySQL 8.0 1Panel 兼容 compose 模板

> ⚠️ 必须先写 `.env`，再写 `docker-compose.yml`；ports **默认仅 127.0.0.1**；不要用 `native_password`。

```yaml
# /opt/1panel/apps/mysql/mysql/docker-compose.yml
services:
  mysql:
    image: mysql:8.0
    container_name: 1panel-mysql-mysql           # 1Panel 风格命名：`1panel-<app>-<name>`
    restart: always
    ports:
      - "127.0.0.1:3306:3306"                    # ⚠️ 默认仅本机！外网访问必须先问用户 + 加白名单
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      TZ: Asia/Shanghai
    volumes:
      - ./data:/var/lib/mysql
      - ./conf/my.cnf:/etc/mysql/conf.d/my.cnf:ro
      - ./log:/var/log/mysql
    command:
      # 不要加 --default-authentication-plugin=mysql_native_password！默认 caching_sha2_password 才是 8.0 正确做法
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    healthcheck:
      # 双 $$ 是 compose 转义；容器内读 $MYSQL_ROOT_PASSWORD env 变量
      test: ["CMD-SHELL", "mysqladmin ping -h 127.0.0.1 -u root -p$$MYSQL_ROOT_PASSWORD || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 5
```

配套 `.env`（密码进环境变量，不写死在 compose 里）：

```
# /opt/1panel/apps/mysql/mysql/.env
MYSQL_ROOT_PASSWORD=<上一步 openssl rand 生成的密码>
```

调小内存版（适合 < 1G 空闲场景）`conf/my.cnf`：

```ini
[mysqld]
innodb_buffer_pool_size=128M
max_connections=50
performance_schema=OFF
```

### Redis / Nginx / Postgres 模板都是同款套路

把目录名换成 `redis` / `nginx` / `postgresql`，container_name 用 `1panel-<app>-<name>`，data/conf/log 三个子目录，密码进 .env。

### 部署前先清理同名残留容器（防止上次失败安装的）

```bash
docker rm -f 1panel-mysql-mysql 2>/dev/null || true
cd /opt/1panel/apps/mysql/mysql && docker compose up -d
```

### 部署后立刻验证（AI 必须自己跑）

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep 1panel-mysql
docker logs --tail 30 1panel-mysql-mysql
# 密码读自 .env，不在对话里贴明文
source /opt/1panel/apps/mysql/mysql/.env && docker exec 1panel-mysql-mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" -e "SELECT version();"
```

部署完告诉用户：**密码已存到 `/opt/1panel/apps/mysql/mysql/.env`，需要时用 `cat` 查看；在 1Panel「容器」可以看到这个 `1panel-mysql-mysql` 容器**。

## 第四步：看日志

```bash
journalctl -u 1panel -n 100 --no-pager
tail -n 200 /opt/1panel/log/1Panel.log
tail -n 200 /opt/1panel/log/1Panel-error.log
```

应用容器的日志直接 `docker logs <容器名>`（容器名 = 应用名，如 `1panel-mysql-***`）。

## 第五步：面板备份

面板 UI「工具箱 → 计划任务 → 备份」是最佳路径。命令行触发：

```bash
ls -lh /opt/1panel/backup/system     # 看现有备份
# 备份产物：snapshot/<时间戳>.tar.gz，含 panel data + apps 数据
```

恢复：在面板 UI「快照 → 恢复」走，**别手动解压覆盖**（涉及容器 stop/启动顺序）。

## 第六步：常见问题

### Q1: 面板登录不上
1. `1pctl status` 看进程
2. `1pctl listen-ip` 看监听地址（默认随机端口 + 安全入口路径，访问要带 `https://ip:port/<入口>`）
3. `1pctl user-info` 看用户名 / 入口路径 / 端口
4. 仍登不上 → `1pctl update password` 重置（⚠️ **走审批**）

### Q2: 应用容器一直起不来
1. UI 看「容器」状态 + 日志
2. CLI：`docker compose -f /opt/1panel/apps/<app>/<container_name>/docker-compose.yml logs --tail 100`
3. 经典原因：端口冲突（同机器跑了别的服务占了 3306/6379/80）、磁盘满（`df -h` 看 `/opt`）、数据库初始化失败（看 conf 目录权限）

### Q3: 数据库密码忘了
- 1Panel 安装应用时会在 UI 显示一次密码 + 落进 `/opt/1panel/apps/<app>/.../docker-compose.yml` 的环境变量
- `grep -i password /opt/1panel/apps/mysql/mysql/docker-compose.yml`（⚠️ 这条命令的输出会被 OpsPub 敏感库捕获脱敏；用 OpsPub 敏感库页查看明文）
- 实在拿不到 → 进容器手动改：`docker exec -it 1panel-mysql-* mysql -uroot -p<旧密码> -e "ALTER USER 'root'@'%' IDENTIFIED BY '新密码';"`

### Q4: 磁盘满了
`/opt/1panel/` 是最重的：

```bash
du -sh /opt/1panel/* 2>/dev/null | sort -h
du -sh /opt/1panel/backup/system/* 2>/dev/null | sort -h
docker system df    # 镜像和卷
```

清理顺序：① 老备份（UI 删）② 用过即弃的应用（停 + 删数据卷）③ docker 镜像 `docker image prune -a`

## 卸载后清理 OpsPub 凭据登记

`1pctl uninstall` 跑成功后（远端已经把 1Panel 真卸了），**调一次 `delete_installed_service`** 把 OpsPub 这边登记的 1Panel 凭据（initial password / panel entrance / port 等）也清掉 —— 否则"已装服务"页里残留的旧凭据没用又有泄漏面。

标准流程：

1. `list_installed_services({ server: "<别名>" })` → 找到 `kind === "1panel"` 的那一条，记下 `id`（形如 `vs_a1b2c3d4`）
2. 跑卸载（先做完，得到 exit=0）：`1pctl uninstall`（含 `[reset/uninstall]` 默认拦截，正常服务器是 approval 档；trusted 档自动放）
3. 卸载成功后：`delete_installed_service({ vaultId: "<上一步的 id>" })`
4. 工具会走 ai-policy 判定（trusted 档自动；其它档暂为 denied —— 那种情况让用户在「服务凭据」页手动删）

⚠️ **顺序很关键**：先卸再删，反过来会让 OpsPub 端没有可参考的端口/路径，万一卸载失败也找不回。

## 教训

- `1pctl reset` 会清面板配置（监听端口、安全入口、登录密码），**不会**删应用数据；但用户密码丢了再装回去要重新关联应用，强烈建议先 `1pctl user-info` 留存当前用户名 + 入口。
- 面板默认端口和入口路径是**安全防线**，不要给改成 `/panel` 之类容易被扫的；保留随机字符。
- 应用商店里的"修改配置"会**重建容器**而不是热重载，重的应用（MySQL、Redis）切勿在业务高峰随手改。
- **卸载完务必清凭据登记**：跑 `delete_installed_service` 把 OpsPub 端的 row 也删掉，避免残留旧密码。

---

## 2. borgbackup-restic

```yaml
---
name: borgbackup-restic
description: 备份工具速查 —— borg + restic + rsnapshot 对照 / 增量加密 / 远程仓库 / 恢复演练。
触发词: borg, borgbackup, restic, rsnapshot, 备份, backup, 增量备份, 加密备份, snapshot, 恢复, 恢复数据, 恢复文件, 还原, 找回文件, 误删找回, 备份没了, 备份失败, 备份不了, 恢复不了, 备份策略, 异地备份, 灾备, 3-2-1 备份, 定时备份, 自动备份, 备份脚本, rclone, kopia, duplicati, restic 0.17, borg 1.4, restic check, borg check, prune 策略, keep-daily, keep-monthly, 备份到 s3, 备份到 minio, 备份恢复演练
dangerous_commands:
  # restic forget（删快照）/ prune（回收=物理删未引用数据）—— 都会减少可恢复点
  - '(?i)\brestic\s+forget\b'
  - '(?i)\brestic\s+prune\b'
  # borg delete（删 repo/archive）/ break-lock（写入中强解锁=元数据损坏）/ prune（按策略删 archive）
  - '(?i)\bborg\s+(?:delete|break-lock|prune)\b'
  # 删本地备份仓库目录（含 ~/.opspub/backups 与各类 repo 路径），命中即审批
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+[~/\w.-]*(?:backup|repo|restic|borg)[~/\w.-]*/?(?:\s|/|$)'
---
```

# borgbackup-restic —— 备份工具

适用：用户想"找个增量备份工具"/"备份到远程 / S3"/"恢复演练"/"3-2-1 备份策略"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看磁盘/仓库占地** → `disk_usage(server, "<repo 路径>")`（任何档位放行）——备份吃磁盘，动手前先看还有多少空间。
- **看备份服务/定时器状态** → `service_status(server, "borg-backup.timer")` / `service_status(server, "restic-backup.timer")`。
- **看备份运行日志** → `tail_log(server, "~/.opspub/logs/<job>.log")`，或 `ssh_exec journalctl -u borg-backup`。
- **改备份脚本 / systemd unit / restic env** → 先 `sftp_read` 看现状，再 `sftp_write` 整文件写（密码占位用 `EnvironmentFile`，别把 passphrase 明文塞进命令）。
- ⚠️ `borg create` / `restic backup` / `prune` / 恢复 等写操作会触发**用户审批**——提前告知用户，被拒后不要原样重试。

### 🔴 本地仓库 / 还原产物 / 备份脚本统一落 `~/.opspub`（铁律）

OpsPub 远程服务器有一个统一工作区 `~/.opspub`。**本地（非远程 repo 服务器）的备份相关产物一律落这里**，**严禁臆造 `/mnt/backup`、`/data/backup`、`/srv/backup`、`/backup` 等可能不存在的路径**：

| 用途 | 落地路径 |
|------|---------|
| 本地 borg/restic 仓库 | `~/.opspub/backups/<repo 名>` |
| 还原产物（restore --target / borg extract 输出） | `~/.opspub/backups/restore-<时间戳>/` |
| borg mount / restic mount 临时挂载点 | `~/.opspub/tmp/borg-mount` |
| 备份/恢复脚本 | `~/.opspub/scripts/` |
| 运行日志 | `~/.opspub/logs/` |

> 下文示例为了通用性写了 `/mnt/backup/myrepo` 等占位路径——**实际给用户跑时，本地仓库一律换成 `~/.opspub/backups/...`**。远程 repo 地址（`user@host:/path` / `s3:...` / `sftp:...`）用**用户提供的真实地址**，不要臆造。

## 选型对照

| 工具 | 强项 | 弱项 | 适合 |
|------|------|------|------|
| **BorgBackup** | 去重+压缩+加密；本地或 SSH 仓库；社区稳健 | 远程仓库要 borg-server | Linux/Unix 服务器互备 |
| **restic** | 多后端（S3 / SFTP / B2 / Azure / GCS / REST）；单二进制 | append-only 模式较新 | 跨云备份 / 单机异地 |
| **rsnapshot** | rsync + hardlink；可读快照目录 | 不去重 / 不压缩 / 不加密 | 简单本机滚动 |
| **Duplicacy** | lock-free 多客户端并发 | 商业（CLI 免费） | 多主机共享 repo |
| **Kopia** | 现代 UI + GUI | 较新 | 个人桌面 |
| **bup** | 极致去重；适合 VM 镜像 | 不更新 | 已落后 |

## 3-2-1 备份原则

```
3 份副本（含 1 份生产）
2 种介质（不同存储类型）
1 份异地（off-site）
```

## 一、BorgBackup

### 装

```bash
# Debian/Ubuntu
sudo apt install -y borgbackup

# RHEL/Rocky
sudo dnf install -y borgbackup
```

### 初始化 repo

```bash
# 本地（OpsPub 统一工作区，别用 /mnt/backup 等可能不存在的路径）
borg init --encryption=repokey-blake2 ~/.opspub/backups/myrepo

# 远程（SSH，远端要装 borg；地址用用户提供的真实地址）
borg init --encryption=repokey-blake2 user@backup.example.com:/srv/backup/myrepo

# 加密方式
# none / authenticated / repokey-blake2 / keyfile-blake2
# repokey: 密钥存仓库（输入 passphrase 解密）
# keyfile: 密钥存本地 ~/.config/borg/keys/（需要单独备份这把 key！）
```

> ⚠️ **passphrase 丢了 = 数据永久失去**。OpsPub 敏感库会自动捕获 `BORG_PASSPHRASE`。

### 备份

```bash
export BORG_PASSPHRASE='xxx'                    # 或 BORG_PASSCOMMAND='pass show borg/myrepo'

borg create --stats --progress \
    ~/.opspub/backups/myrepo::'{hostname}-{now:%Y-%m-%d-%H%M%S}' \
    /etc /home /var/www \
    --exclude '*.tmp' \
    --exclude '/var/cache' \
    --exclude '/var/log' \
    --exclude-caches \                       # 跳过含 CACHEDIR.TAG 的目录
    --compression zstd,3
```

archive 名占位符：`{hostname}` `{user}` `{now}` `{utcnow}` `{fqdn}` `{pid}`。

### 列 / 查看

```bash
borg list /mnt/backup/myrepo                    # 所有 archive
borg list /mnt/backup/myrepo::myarchive         # 单 archive 文件列表
borg info /mnt/backup/myrepo                    # repo 概览
borg info /mnt/backup/myrepo::myarchive         # archive 详情
borg diff /mnt/backup/myrepo::archive1 archive2 # 两 archive 差异
```

### 恢复

```bash
# 整 archive 恢复（到当前目录或指定）
borg extract /mnt/backup/myrepo::myarchive

# 仅恢复部分（按 path）
borg extract /mnt/backup/myrepo::myarchive etc/nginx

# Mount 成 fuse 文件系统直接 cp（挂载点落 ~/.opspub/tmp）
mkdir -p ~/.opspub/tmp/borg
borg mount ~/.opspub/backups/myrepo::myarchive ~/.opspub/tmp/borg
ls ~/.opspub/tmp/borg
cp ~/.opspub/tmp/borg/etc/nginx/nginx.conf ~/.opspub/backups/
borg umount ~/.opspub/tmp/borg

# Mount 整个 repo（每个 archive 一个子目录）
borg mount ~/.opspub/backups/myrepo ~/.opspub/tmp/borg
```

### Prune（保留策略）

```bash
borg prune --list --dry-run \
    --keep-daily=7 --keep-weekly=4 --keep-monthly=12 \
    /mnt/backup/myrepo

# 真删
borg prune --list \
    --keep-daily=7 --keep-weekly=4 --keep-monthly=12 \
    /mnt/backup/myrepo

# 空间回收（**必须**跟在 prune 之后才能真正释放）
borg compact /mnt/backup/myrepo
```

### Check / 校验

```bash
borg check /mnt/backup/myrepo                   # 完整性检查（**慢，重要**）
borg check --repair /mnt/backup/myrepo          # ⚠️ 修复（极端情况，可能丢数据）
```

### Cron / systemd 定时

```bash
# /etc/systemd/system/borg-backup.service
[Service]
Type=oneshot
Environment=BORG_PASSPHRASE=xxx
ExecStart=/usr/bin/borg create --stats /mnt/backup/myrepo::{hostname}-{now} /etc /home
ExecStartPost=/usr/bin/borg prune --keep-daily=7 --keep-weekly=4 /mnt/backup/myrepo
ExecStartPost=/usr/bin/borg compact /mnt/backup/myrepo

# /etc/systemd/system/borg-backup.timer
[Timer]
OnCalendar=daily
RandomizedDelaySec=2h
Persistent=true
```

## 二、restic

### 装

```bash
# 通用：单二进制
curl -sL https://github.com/restic/restic/releases/latest/download/restic_*_linux_amd64.bz2 \
    | bunzip2 > restic && chmod +x restic && sudo mv restic /usr/local/bin/

# 或包管理器
sudo apt install -y restic
```

### 初始化（按后端）

```bash
# 本地（OpsPub 统一工作区）
restic init --repo ~/.opspub/backups/restic

# SFTP（地址用用户提供的真实地址）
restic init --repo sftp:user@backup.example.com:/srv/backup

# S3 / MinIO
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
restic init --repo s3:https://minio.example.com:9000/restic-bucket

# Backblaze B2
restic init --repo b2:bucket-name:path/

# REST server
restic init --repo rest:https://backup.example.com/myrepo
```

passphrase 用环境变量 / 文件：

```bash
export RESTIC_PASSWORD='xxx'
# 或
export RESTIC_PASSWORD_FILE=/etc/restic/password
chmod 600 /etc/restic/password
```

### 备份

```bash
restic backup /etc /home /var/www \
    --exclude '*.tmp' \
    --exclude-file /etc/restic/exclude.list \
    --exclude-caches \
    --tag prod \
    --host myhost
```

### 列 / 查看

```bash
restic snapshots                                # 所有 snapshot
restic snapshots --tag prod
restic snapshots --host myhost
restic ls <snapshot-id>                         # 列文件
restic ls <snapshot-id> /etc/nginx
restic stats                                    # 总占用
restic stats --mode raw-data
```

### 恢复

```bash
# 整 snapshot（还原产物落 ~/.opspub/backups，别用 /tmp 或臆造路径）
restic restore <snapshot-id> --target ~/.opspub/backups/restore-$(date +%Y%m%d-%H%M%S)

# 子路径
restic restore <snapshot-id> --target ~/.opspub/backups/restore-nginx --include /etc/nginx

# 最新
restic restore latest --target ~/.opspub/backups/restore-latest --host myhost

# Mount（FUSE，挂载点落 ~/.opspub/tmp）
mkdir -p ~/.opspub/tmp/restic
restic mount ~/.opspub/tmp/restic
ls ~/.opspub/tmp/restic/snapshots/               # 按 host / tag 子目录
```

### Forget + Prune

```bash
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
# --prune 真正回收空间（**比 borg compact 更慢但一步到位**）

# 仅 forget 不 prune
restic forget --keep-daily 7
# 之后再
restic prune
```

### Check

```bash
restic check                                    # 元数据
restic check --read-data                        # 全部数据（慢但彻底）
restic check --read-data-subset 10%            # 抽 10% 检查
```

### 自动化

```bash
# /etc/systemd/system/restic-backup.service
[Service]
EnvironmentFile=/etc/restic/env
ExecStart=/usr/local/bin/restic backup /etc /home --tag daily
ExecStartPost=/usr/local/bin/restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
```

```ini
# /etc/restic/env
RESTIC_REPOSITORY=s3:https://minio.example.com:9000/restic-bucket
RESTIC_PASSWORD=xxx
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

## 三、rsnapshot（简单本地快照）

```bash
sudo apt install -y rsnapshot

# /etc/rsnapshot.conf（**注意：tab 分隔，不能空格**）
config_version    1.2
snapshot_root    ~/.opspub/backups/rsnapshot/
retain    daily    7
retain    weekly    4
retain    monthly    12

backup    /etc/        myhost/
backup    /home/       myhost/
backup    user@10.0.0.5:/srv/    remote-srv/    +rsync_long_args=--bwlimit=10000
```

```bash
sudo rsnapshot configtest                       # 必跑（语法检查）
sudo rsnapshot daily
sudo rsnapshot weekly
sudo rsnapshot monthly

# cron
0 */4 * * * /usr/bin/rsnapshot daily
0 3 * * 0 /usr/bin/rsnapshot weekly
0 4 1 * * /usr/bin/rsnapshot monthly
```

rsnapshot 把每个快照存为目录（hardlink 去重未变文件），可以**直接 cd / cp 出来**，恢复极简单：

```bash
ls ~/.opspub/backups/rsnapshot/daily.0/myhost/etc/nginx/
```

## 四、对比备份特定数据

### 数据库

| DB | 备份手段 |
|----|---------|
| MySQL | `mysqldump` 流式 → restic stdin / borg `--stdin-filename` |
| PostgreSQL | `pg_basebackup` 全量 + WAL 归档 |
| MongoDB | `mongodump --archive=- | restic backup --stdin` |
| Redis | RDB / AOF 文件直接 borg / restic |

```bash
# 例：mysqldump 流到 restic
mysqldump --all-databases | restic backup --stdin --stdin-filename mysql.sql
```

### 大数据

PB 级用 **clickhouse-backup** / **velero**（K8s）/ 厂商工具，不要用通用备份。

### Docker volume

```bash
# 把 volume 数据流到 borg
docker run --rm -v mydata:/data alpine tar c /data | borg create /mnt/backup/myrepo::mydata-{now} -
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| Borg keyfile 模式密钥 | `~/.config/borg/keys/`（**必须单独备份**） |
| Borg cache | `~/.cache/borg/` |
| restic 仓库结构 | `<repo>/config` + `<repo>/data/` + `<repo>/snapshots/` |
| restic cache | `~/.cache/restic/` |
| rsnapshot 快照 | `snapshot_root` 配置项（默认 `/var/cache/rsnapshot/`） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `restic forget --keep-last 0` | **清空所有 snapshot** |
| `restic forget --prune --keep-daily 0` | 同上 |
| `restic prune --max-unused 0` | 100% 紧凑（极慢 + 大量 I/O） |
| `borg delete <repo>::<archive>` | 删单 archive（不可恢复） |
| `borg break-lock` | 强解锁 repo（**有进程正在写时 = 元数据可能损坏**） |
| `borg compact` 同时另一备份在跑 | 互斥锁冲突 |
| `rm -rf <repo>` | **删整个备份**，不可恢复 |
| 改 repo passphrase 但没记新密码 | **永久失去** |
| `keyfile` 模式不备份 key | 同上 |

## 教训

- **没演练过的备份等于没备份**：每月至少一次完整恢复演练（哪怕只是 mount + 抽查 diff）。
- **3-2-1 原则**：本地 + 异地 + 云；同机房不算异地。
- borg / restic 都是**仓库私钥制**：密钥/密码**单独备份**（密码管理器 + 纸质 + 异地保险柜），repo 在但 key 没 = 数据永远拿不出来。
- `--keep-last N` 等于 `--keep-daily N`，但更脆弱（一天跑两次 = 当天的覆盖掉前一天）；推荐 `--keep-daily 7 --keep-weekly 4 --keep-monthly 12`。
- 数据库**不要**直接备份运行中的数据文件；用 mysqldump / pg_basebackup / mongodump 等**一致性快照**工具。
- 备份触发 + 完成 + 失败**都加告警**（Healthchecks.io / Uptime Kuma）；几个月没跑的 cron 你都不知道。
- restic 后端用 S3/MinIO 时**装上 lifecycle policy**自动清理 `incomplete` multipart upload；否则碎片永久占地方。
- 备份频率与保留期都不要"想到再说"：**先按业务 RPO/RTO 算清楚再选策略**，没明确目标的策略一定不合规。

---

## 3. caddy-traefik

```yaml
---
name: caddy-traefik
description: Caddy（自动 HTTPS）+ Traefik（容器化反代）速查 —— Caddyfile / dynamic config / docker labels。
触发词: caddy, caddyfile, traefik, 反向代理, 自动 https, dynamic configuration, traefik dashboard, docker label, acme.json, caddy api, caddy 起不来, caddy 报错, caddy 证书, traefik 起不来, traefik 报错, traefik 404, traefik 502, traefik 路由, traefik provider, docker labels, file provider, traefik 路由不到, caddy reverse_proxy, caddyfile 语法, 配置自动 https, 一键 https
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?[~/\w.-]*acme\.json\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/caddy(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/traefik(?:\s|/|$)'
  # 删 Caddy 证书数据目录 = 全部域名证书重签（撞 Let's Encrypt 速率限制）
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/caddy(?:\s|/|$)'
  # systemctl stop/disable caddy/traefik = 全站下线
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:caddy|traefik)\b'
  - '(?:^|[\s;&|])caddy\s+stop(?:\s|$)'
---
```

# caddy-traefik —— Caddy + Traefik 速查

适用：想要"配置短小、HTTPS 自动"的场景。**Caddy** 单文件配置最简单；**Traefik** 与 Docker/K8s 标签集成最强。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 caddy/traefik 服务状态 | `service_status(server, "caddy")` / `(server, "traefik")` | systemctl status |
| 看日志 | `tail_log(server, "/var/log/caddy/...")` 或 `service_status` 取 journal 尾 | tail / journalctl |
| 查 80/443/dashboard 监听 | `port_check(server, 80)` / `(server, 443)` / `(server, 8080)` | ss -tlnH |
| 看现有配置 | `sftp_read(server, "/etc/caddy/Caddyfile")` / `(server, "/etc/traefik/traefik.yml")` | cat |
| **改配置** | `sftp_read` 看现状 + `sftp_write` 整文件写 | —— |

只读工具**任何档位都放行**。**改 Caddyfile / traefik.yml / dynamic/*.yml 优先 `sftp_write` 整文件写**（YAML 缩进 + Caddyfile `{}` 块对 shell 拼接极不友好，整文件写最稳）。

⚠️ **改完先校验再 reload**：Caddy 用 `ssh_exec caddy validate --config /etc/caddy/Caddyfile`，过了再 `systemctl reload caddy`；Traefik 动态配置（dynamic/*.yml）`watch:true` 会**自动 reload**（无需重启），但静态配置（traefik.yml）改完需 `systemctl restart traefik`。含 sudo 的 reload/restart 会触发**用户审批**——提前告知用户，被拒后不要原样重试。

> `acme.json` / Caddy 证书目录里的私钥文件 OpsPub 禁止 AI 写（SFTP 写黑名单）——涉及私钥操作交用户处理；改配置前把现配置 `sftp_read` 出来留底（或落 `~/.opspub/backups`）便于回滚。

## 一、Caddy

### 基础配置（Caddyfile）

```caddy
# /etc/caddy/Caddyfile

example.com {
    reverse_proxy 127.0.0.1:8080
}

api.example.com {
    reverse_proxy backend1:8080 backend2:8080 {
        lb_policy round_robin
        health_uri /healthz
        health_interval 10s
    }
    encode gzip zstd
    log {
        output file /var/log/caddy/api.log
    }
}

# 静态站点
files.example.com {
    root * /var/www/files
    file_server browse
    encode gzip
}

# 多域 + 通配
*.example.com {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }
    reverse_proxy {http.request.host.labels.0}.internal:8080
}
```

### 操作

```bash
caddy version
caddy validate --config /etc/caddy/Caddyfile      # 语法检查（必跑）
caddy fmt --overwrite /etc/caddy/Caddyfile        # 格式化
systemctl reload caddy                            # 平滑重载

# API 动态修改（不动文件）
curl localhost:2019/config/                       # 读当前配置
curl -X POST localhost:2019/load -H "Content-Type: application/json" -d @new.json
```

### 路径

| 内容 | 路径 |
|------|------|
| 配置 | `/etc/caddy/Caddyfile` |
| 证书 / ACME | `/var/lib/caddy/.local/share/caddy/` |
| 日志 | `/var/log/caddy/` 或 `journalctl -u caddy` |
| API（admin） | `http://localhost:2019` |

### 自动 HTTPS

Caddy **默认**给所有 site address 自动申请 Let's Encrypt 证书（如能解析、能访问 80/443）。关闭：

```caddy
{
    auto_https off
}
```

### 通配符（DNS-01）

要装 DNS provider 插件（不是默认包）：

```bash
caddy add-package github.com/caddy-dns/cloudflare
caddy add-package github.com/caddy-dns/aliyun
```

## 二、Traefik

### 静态配置（traefik.yml）

```yaml
# /etc/traefik/traefik.yml
api:
  dashboard: true
  insecure: false        # ⚠️ 生产关掉，dashboard 用 secure entrypoint

entryPoints:
  web:
    address: ":80"
  websecure:
    address: ":443"

certificatesResolvers:
  le:
    acme:
      email: you@example.com
      storage: /etc/traefik/acme/acme.json    # ⚠️ chmod 600
      httpChallenge:
        entryPoint: web

providers:
  docker:
    exposedByDefault: false
    network: web                # 必须与服务在同一 network
  file:
    directory: /etc/traefik/dynamic
    watch: true

log:
  level: INFO
accessLog: {}
```

### 动态配置（docker labels）

```yaml
# docker-compose.yml
services:
  app:
    image: nginx
    labels:
      - traefik.enable=true
      - traefik.http.routers.app.rule=Host(`app.example.com`)
      - traefik.http.routers.app.entrypoints=websecure
      - traefik.http.routers.app.tls.certresolver=le
      - traefik.http.services.app.loadbalancer.server.port=80
    networks:
      - web

networks:
  web:
    external: true
```

### 动态配置（文件，非容器后端）

```yaml
# /etc/traefik/dynamic/api.yml
http:
  routers:
    api:
      rule: "Host(`api.example.com`)"
      service: api
      entrypoints: [websecure]
      tls:
        certResolver: le

  services:
    api:
      loadBalancer:
        servers:
          - url: http://10.0.0.1:8080
          - url: http://10.0.0.2:8080
```

`watch: true` → **改完文件自动 reload**，不需要重启 Traefik。

### 路径

| 内容 | 路径 |
|------|------|
| 静态配置 | `/etc/traefik/traefik.yml` |
| 动态配置 | `/etc/traefik/dynamic/*.yml` |
| 证书 | `/etc/traefik/acme/acme.json`（⚠️ **必须 chmod 600**） |
| dashboard | `http://localhost:8080/dashboard/` |

## 三、对照

| 维度 | Caddy | Traefik | nginx |
|------|-------|---------|-------|
| 配置 | Caddyfile（简洁）+ JSON API | YAML / docker labels | nginx.conf（DSL） |
| 自动 HTTPS | ✅ 默认 | ✅ 配 resolver 即可 | ❌（需 certbot） |
| Docker 集成 | 一般 | ✅ 最强（labels 实时） | 弱（需重写配置） |
| K8s Ingress | 第三方 | ✅ 官方 ingress controller | ✅ 官方 ingress-nginx |
| 性能 | 中等 | 中等 | 最高 |
| 学习曲线 | 最低 | 中 | 高 |
| 适合场景 | 个人/小团队 / 简单反代 / 静态站 | 容器化 / K8s / 微服务 | 高性能 / 复杂改写规则 / 静态资源 |

## 四、常见问题

### Caddy

**Q1: 证书申请失败 "no challenge solver"**
- 80 端口不可达（HTTP-01）→ 配 DNS-01：`tls { dns cloudflare {env.CF_TOKEN} }`
- 装错插件 → `caddy list-modules` 看有没有 `dns.providers.cloudflare`

**Q2: reload 后旧配置仍生效**
- 用 `caddy validate` 看新配置真的有效 → `systemctl reload caddy`（不是 restart）
- 或调 API：`POST localhost:2019/load`

### Traefik

**Q1: dashboard 看不到 router**
- 容器没在与 traefik 同 network → 加入同 network
- `traefik.enable=true` label 漏了
- traefik 配置 `exposedByDefault: false` 但又没显式 enable

**Q2: 证书申请失败 acme.json 错误**
- `acme.json` 权限不是 600 → `chmod 600`
- 申请太频繁 → Let's Encrypt 速率限制（用 `staging` resolver 调试）

**Q3: 证书续期没动静**
- 看 traefik 日志（INFO 级即可看到 ACME 续期事件）
- 调试用 `staging` resolver；切回正式必须把 `acme.json` 删掉重新签（**仅 staging→prod 切换时**）

## 五、危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm acme.json` | 删 Traefik 证书数据库，**会重新申请全部域名**（可能撞速率限制） |
| `rm -rf /etc/caddy` 或 `/etc/traefik` | 删全部配置 + 自动 HTTPS 数据 |
| Caddy `insecure: true` 暴露 admin API | API 无认证可改任意配置（**生产严禁**） |
| Traefik `api.insecure: true` | dashboard 无认证 |

## 六、教训

- **`acme.json` 必须 `chmod 600`** —— traefik 启动时会拒绝读权限过宽的文件，直接报错"unable to use the ACME storage"。
- Caddy 的"自动 HTTPS"是默认行为，**站点 address 写域名就会去签证书**；测试用 `http://example.com` 或 `:80` 关掉。
- Traefik 改静态配置（traefik.yml）要 **`systemctl restart traefik`**；改动态配置（dynamic/*.yml）只需文件改动，watch 自动 reload。
- 配 DNS-01 通配符证书优先用 Caddy + DNS plugin（比 traefik 配 resolver 简单一截）；K8s 场景 cert-manager 是另一条路。
- nginx 不会自动签发证书，但**配置过的反代 + 路径** Caddy / Traefik 也支持，**不要为了"自动 HTTPS"才迁移**——已有 nginx 加 certbot 就够。

---

## 4. certbot-acme

```yaml
---
name: certbot-acme
description: Let's Encrypt / ACME 证书签发与续期 —— certbot / acme.sh，含 HTTP-01 / DNS-01 / 通配符与续期排障。
触发词: certbot, letsencrypt, let's encrypt, acme, acme.sh, ssl 证书, https 证书, 证书续期, certificate, 通配符证书, dns-01, http-01, 自动续期, certbot renew, 证书过期, 证书快过期, ssl 过期, https 过期, 配 https, 加 https, 申请证书, 签发证书, 证书装了, 浏览器不认, certificate not trusted, name mismatch, 证书域名不对, fullchain.pem, privkey.pem, dns 验证, txt 记录, dnspod, alidns, cloudflare dns, zerossl
dangerous_commands:
  - '(?:^|[\s;&|])certbot\s+(?:delete|revoke)(?:\s|$)'
  - '(?:^|[\s;&|])acme\.sh\s+--revoke(?:\s|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/etc/letsencrypt(?:\s|/|$)'
  # 删 acme.sh 账户/证书目录 = 证书私钥 + 续期配置全丢，需全量重签（撞速率限制）
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+[~/\w.-]*\.acme\.sh(?:\s|/|$)'
  # certonly --force-renewal 反复跑会撞 Let's Encrypt 速率限制（每周同组域名 5 次）
  - '(?:^|[\s;&|])acme\.sh\s+--remove(?:\s|$)'
---
```

# certbot-acme —— Let's Encrypt / ACME 证书运维

适用：用户报"证书过期"/"想给域名加 HTTPS"/"通配符证书怎么搞"/"certbot renew 失败"/"证书装了但浏览器不认"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看证书文件 / 续期配置** → `sftp_read(server, "/etc/letsencrypt/live/<域名>/cert.pem")`（公钥证书可读，看有效期）、`sftp_list(server, "/etc/letsencrypt/live/")`（看签了哪些域名）。
- **看证书续期日志** → `tail_log(server, "/var/log/letsencrypt/letsencrypt.log")`。
- **看 certbot.timer 状态** → `service_status(server, "certbot.timer")`（任何档位放行）。
- **改 nginx 的 ssl_certificate 配置** → `sftp_read` 看现状 + `sftp_write` 整文件写站点 conf（指向 fullchain.pem / privkey.pem 的那两行）。
- ⚠️ **签发 / 续期本质是改动型 shell（certbot/acme.sh）+ 多需 sudo**，会触发**用户审批**——执行前先告诉用户"申请/续期证书这步需要你在 OpsPub 批准"，被拒后不要原样重试。

> 🔴 **私钥文件 OpsPub 禁止 AI 写**：`privkey.pem` / `*.key` 在 SFTP 写黑名单里，`sftp_write` 写不进去（也不应该）。AI 能做的是：读公钥证书看有效期、改 nginx 配置指向证书路径、引导用户跑 certbot/acme.sh 命令；**真正落盘私钥的动作由 certbot/acme.sh 自己完成或交用户处理**，AI 不碰私钥内容。

## 第一步：选工具

| 工具 | 推荐场景 |
|------|---------|
| **certbot**（官方） | Ubuntu/Debian 包齐全；Nginx/Apache 有插件；适合标准场景 |
| **acme.sh**（社区） | 跨平台无依赖；DNS API 提供商最全（70+）；通配符 DNS-01 首选 |
| **lego**（Go） | 单一二进制，适合容器；运维写脚本爱用 |
| **Caddy** | 自带 ACME，写到 Caddyfile 即自动签发（如已用 Caddy 反代，零配置） |
| **1Panel 网站** | UI 一键申请 + 续期；适合非命令行用户 |

下面以 certbot + acme.sh 为主。

## 第二步：certbot 标准用法

### 装

```bash
# Debian/Ubuntu
sudo apt install -y certbot python3-certbot-nginx

# RHEL/Rocky
sudo dnf install -y certbot python3-certbot-nginx

# 推荐 snap（最新版）
sudo snap install --classic certbot
```

### HTTP-01（最常见，要求 80 端口对外开放）

```bash
# nginx 插件（自动改 nginx.conf）
sudo certbot --nginx -d example.com -d www.example.com

# webroot 模式（不动 nginx，自己放挑战文件）
sudo certbot certonly --webroot -w /var/www/html -d example.com

# standalone（certbot 自己起临时 HTTP 服务，要求 80 端口空闲，**会暂停 nginx**）
sudo certbot certonly --standalone -d example.com
```

### DNS-01（通配符 *必须* 用这个；不需要开 80 端口）

```bash
# 手动模式（适合临时一次性）
sudo certbot certonly --manual --preferred-challenges dns \
  -d '*.example.com' -d example.com

# 阿里云 DNS 插件（需先安装 certbot-dns-aliyun 等社区插件）
sudo certbot certonly --dns-aliyun --dns-aliyun-credentials ~/.aliyun.ini \
  -d '*.example.com' --server https://acme-v02.api.letsencrypt.org/directory
```

> ⚠️ certbot 的 DNS 插件不像 acme.sh 那么全，70+ 国内云厂商优先 acme.sh。

### 证书路径

```
/etc/letsencrypt/live/example.com/
├── fullchain.pem    ← Nginx 配 ssl_certificate
├── privkey.pem      ← Nginx 配 ssl_certificate_key
├── cert.pem         ← 仅证书（不含中间证书）
└── chain.pem        ← 中间证书链
```

Nginx 配：

```nginx
ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
```

## 第三步：续期

```bash
sudo certbot renew                          # 续所有快到期的（< 30 天）
sudo certbot renew --dry-run                # 演练（不真续，但跑完整流程）
sudo certbot renew --force-renewal -d example.com   # 强续单个域名（不到 30 天也续）
```

自动续期（certbot 装好自带 systemd timer，多数发行版直接生效）：

```bash
systemctl list-timers | grep certbot
systemctl status certbot.timer
```

老旧系统手动加 cron：

```bash
# /etc/cron.d/certbot
0 */12 * * * root /usr/bin/certbot renew --quiet --deploy-hook "systemctl reload nginx"
```

`--deploy-hook`：续期成功**只**在确实更新了证书时跑一次（reload nginx）。

## 第四步：acme.sh（通配符 / 国内 DNS API 首选）

### 装

```bash
curl https://get.acme.sh | sh -s email=you@example.com
# 重新登录 shell 后即可用 acme.sh
```

### 申请

```bash
# 通配符 + DNS API（以阿里云为例）
export Ali_Key="xxx"
export Ali_Secret="xxx"
acme.sh --issue --dns dns_ali -d example.com -d '*.example.com'

# 申请到的证书安装到 nginx 路径（acme.sh 不会自动改 nginx.conf，要你手动配 ssl_certificate）
acme.sh --install-cert -d example.com \
  --key-file       /etc/nginx/ssl/example.com.key  \
  --fullchain-file /etc/nginx/ssl/example.com.cer  \
  --reloadcmd      "systemctl reload nginx"
```

`--install-cert` 装完后续期成功也会自动跑 `--reloadcmd` —— **不要手动 cp 证书**，会跳过续期钩子。

### 续期

```bash
acme.sh --renew -d example.com --force      # 强续单个
acme.sh --cron                              # 模拟 cron 触发的批量续期
```

默认会装 cron：`crontab -l | grep acme`。

## 第五步：常见排障

### Q1: certbot renew 失败 "Connection refused" / "Timeout"
HTTP-01：80 端口不可达。检查：① 防火墙是否开 80 ② Nginx 是否在听 ③ `/.well-known/acme-challenge/` 路径是否被反代 / 重定向打断 ④ DNS 解析对不对。

挑战文件路径冲突常见配置：

```nginx
server {
    listen 80;
    server_name example.com;
    # 关键：让 acme 挑战不走 https 跳转
    location /.well-known/acme-challenge/ {
        root /var/www/html;   # 与 certbot --webroot -w 一致
    }
    location / {
        return 301 https://$host$request_uri;
    }
}
```

### Q2: 浏览器报"证书链不完整"
Nginx 用错了文件：用 `fullchain.pem`（含中间证书），不是 `cert.pem`。

### Q3: 速率限制（Rate Limited）
Let's Encrypt 限制：

- 同一注册域 / 周 = 50 个证书
- 失败重试 / 小时 = 5 次
- 同一组域名重复签 / 周 = 5 次

调试时用 **staging 环境**避免触发：

```bash
certbot certonly --staging -d example.com    # 不要在生产用！测完删掉
acme.sh --issue --staging ...
```

### Q4: 通配符证书无法验证
DNS-01 要求在 DNS 加 `_acme-challenge.example.com` 的 TXT 记录。手动模式时 certbot 会暂停让你加；用插件则需配置 DNS API token（且 token 要有"写解析"权限）。

### Q5: 续期后 Nginx 不知道（仍用旧证书）
没配 `--deploy-hook "systemctl reload nginx"`（certbot）/ `--reloadcmd "systemctl reload nginx"`（acme.sh）。

### Q6: 证书有效但浏览器报 NET::ERR_CERT_DATE_INVALID
1. 服务器时间不同步：`timedatectl set-ntp true`
2. 或客户端时间错

## 第六步：监控证书过期

```bash
# 查所有证书的过期时间
certbot certificates

# acme.sh
acme.sh --list

# 外部探测（脚本里跑）
echo | openssl s_client -servername example.com -connect example.com:443 2>/dev/null \
  | openssl x509 -noout -dates
```

加监控：Uptime Kuma / Blackbox Exporter / Cert-Manager 都自带过期告警。

## 路径速查表

| 内容 | certbot | acme.sh |
|------|---------|---------|
| 配置 / 状态 | `/etc/letsencrypt/` | `~/.acme.sh/` |
| 证书 | `/etc/letsencrypt/live/<domain>/` | `~/.acme.sh/<domain>/` |
| 续期日志 | `/var/log/letsencrypt/` | `~/.acme.sh/<domain>/<domain>.log` |
| 续期定时 | `systemctl status certbot.timer` | `crontab -l \| grep acme` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `certbot delete` | 删除证书与续期配置（**网站立刻无证书**） |
| `certbot revoke` | 主动吊销证书（**不可逆**，且会进 CT 日志） |
| `acme.sh --revoke` | 同上 |
| `rm -rf /etc/letsencrypt` | 删全部证书配置（重新签可能撞速率限制） |
| 手动 `cp` 证书到 nginx 路径 | 跳过 acme.sh 的续期钩子，下次续期后 nginx 仍用旧证书 |

## 教训

- **续期失败要订阅告警**：Let's Encrypt 证书 90 天，第 60 天起开始续；连续失败 30 天就过期了。
- 自动续期之后**永远配 `--deploy-hook` reload nginx**，否则证书续了但服务还用旧的（你以为续好了实际上正在过期）。
- 通配符申请用 acme.sh **比 certbot 省心**，国内云厂商 DNS API 支持最全；certbot 的 DNS 插件多数要从第三方装。
- 调试一定用 `--staging` / `--dry-run`，**别在生产环境**做重试 —— 5 次失败就被限速 1 小时。
- nginx 改完证书路径 `nginx -t` 必跑，证书文件权限错 nginx 启动会 `[emerg] cannot load certificate ... PEM_read_bio_X509_AUX()`。

---

## 5. clickhouse-ops

```yaml
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
```

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

## 6. db-tools

```yaml
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
```

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

## 7. deepseek-harness-deploy

```yaml
---
name: deepseek-harness-deploy
description: DeepSeek Harness（dsh）部署配方 —— Node 24 + npm 11 的 allow-scripts 坑、host 二值枚举、浏览器安全上下文要求，以及装完必须用 create_port_forward 把访问隧道配上。
触发词: deepseek harness, deepseek-harness, dsh, dsh web, harness 部署, 部署 harness, 装 harness, deepseek 编程助手, deepseek agent, deepseek cli, 部署 dsh, 装 dsh, dsh 部署, dsh 装不上, dsh 打不开, everything is a plugin, cordis
dangerous_commands:
  - (?i)(cat|less|more|head|tail|strings|xxd|base64|cp|scp)\s+[^|;&]*\.credentials\.ya?ml
  - (?i)\bdsh\b[^|;&]*--profile\s+headless
  - (?i)\bdsh\s+plugin\b[^|;&]*\badd\b
---
```

# DeepSeek Harness（dsh）部署

适用：用户说「部署 / 装一下 DeepSeek Harness / dsh」「dsh 装不上 / 打不开」。

DeepSeek Harness = DeepSeek 2026-08 开源的 agent 框架（MIT，命令行名 `dsh`，Cordis 插件架构，「一切皆插件」）。**开发者预览阶段，官方明说会有破坏性变更** —— 下面的版本号和行为都要现场复核，别当永久事实。本配方基于 **`@deepseek-ai/dsh` 0.1.0-rc.6 实测**（2026-08）。

## 🤖 第零步：优先用 OpsPub 专用工具
- **探环境**（只读，任何档位放行）：`system_info` / `disk_usage` / `port_check`(3080)；用只读 `ssh_exec` 查 `command -v node npm docker make g++`（**编译器有没有决定走哪条路**，见下）。
- **传文件**：`sftp_write`（Dockerfile / 配置）/ `sftp_upload`（大文件）。
- **配访问隧道**：装完**必须**用 `create_port_forward`，别让用户自己去 UI 填（原因见「4. 让用户能打开」）。
- 改动型操作（装包 / sudo / 起容器）按服务器档位走**审批**——提前告知用户，被拒别原样重试。

## 🔴 先想清楚：dsh 装哪台机器，它就只能改哪台机器的文件

dsh 的 agent 读写的是**它自己所在机器**的工作区目录。装在服务器上 = 它只能碰服务器上的代码；用户 Windows 本地的项目它一个字节都看不到。**开工前先问清楚用户要改哪儿的代码**：

| 用户要改的东西 | 装哪 |
|---|---|
| 服务器上已有的项目 | 装服务器，把那个项目目录挂/指成工作区 |
| 自己电脑上的项目 | **装用户本机**（Windows 也支持：有 `win32-x64` prebuilds + 官方 Windows CI gates），`npx @deepseek-ai/dsh web` 就能先试 |
| 两边都要 | 各装一份，互不干扰 |

## 1. 硬性前提（不满足就别往下走）

| 项 | 要求 |
|---|---|
| Node | **`^22.19.0 \|\| >=24.0.0`**（package.json engines）。Ubuntu 22.04 apt 里是 12，必须自己装 |
| pnpm | 仅 `dsh plugin` 子命令要（转发给 pnpm）；`corepack enable` 即可 |
| 端口 | 默认 3080 |

装 Node 优先 **官方 tar.xz 解压到 `~/.local/node`**：不需要 sudo，卸载就是删目录。
（nvm 安装脚本在 `raw.githubusercontent.com`，该域名已被移出 OpsPub 出站白名单，会走审批。）

## 2. 装法二选一：宿主直装 vs Docker

**先探 `make` / `g++` / `cc` 和 sudo 是否免密**，再决定：

- **宿主直装**（`npm i -g @deepseek-ai/dsh`）：需要编译工具链兜底。多数情况 `node-pty` 会命中随包分发的 `prebuilds/`（20 秒装完、不编译），但预编译不匹配时会 fallback 到 node-gyp。
- **Docker**（`node:24` 官方镜像）：镜像自带完整工具链。**宿主缺编译器且 sudo 需要密码时只能走这条** —— OpsPub 的 `ssh_exec` 非交互，喂不了 sudo 密码（也不该喂）。附带好处：dsh 的 agent 有 bash 能力且 Web UI 无认证，关进容器能隔离宿主上的其它业务。

### 🔴 坑一：npm 11 默认阻止 install scripts —— 不加参数会静默装成空壳

```bash
npm i -g --allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs @deepseek-ai/dsh
```

不加 `--allow-scripts`，`node-pty` / `koffi` 的原生部分不落地、`dsh-subprocess-local` 的 spawn helper 不生成 —— **`npm i` 退出码是 0、看起来装成功了**，实际 terminal 和子进程能力全废。npm 只在日志里给一行 `warn allow-scripts`。包名清单以 npm 自己那行告警为准（版本升级可能变）。

**装完必须回读验证**，别信"没报错"：
```bash
dsh --version
node -e "const p=require('<全局node_modules>/@deepseek-ai/dsh/node_modules/node-pty');console.log(typeof p.spawn)"
```

### 🔴 坑二：`npm config set disturl` 在 npm 11 已被移除

报 `disturl is not a valid npm option` 直接中断安装。要给 node-gyp 换源用环境变量：
```bash
export NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
npm config set registry https://registry.npmmirror.com   # registry 这条仍有效
```

### Docker 方式要点

- 用 `node:24`；`USER node`（uid 1000，与 Ubuntu 默认用户对齐，挂载卷读写无碍）。
- 挂两个卷：`$DSH_HOME`（配置 + 密钥，容器重建不丢）、工作区目录。
- 🔴 **绝不挂 `docker.sock`** —— 挂了 dsh 的 agent 就能控制宿主上所有兄弟容器，容器隔离白做。

## 3. 🔴 坑三：绑定地址是二值枚举，只能填 127.0.0.1 或 0.0.0.0

两层限制，别只看一层：

1. CLI 层（`web-app/src/startup.ts`）**硬拒 `--host 0.0.0.0`**，报错原文：
   *"intentionally not supported yet for safety: it would expose remote code execution to the network"*。
2. 配置层 webserver 插件的 schema 是 **`"127.0.0.1" | "0.0.0.0"` 二值枚举** —— 填任何具体 IP（容器 IP、内网 IP、组网 IP）都会在启动时被 `ValidationError` 拒掉。

所以 **「绑一个内网 IP 让别人直接访问」这条路根本不通**。

容器里的正解：让 patch 写死 `0.0.0.0`（只覆盖容器网络），再由 docker 收窄到宿主环回：

`$DSH_HOME/cordis.patch.yml`：
```yaml
- id: webserver
  config:
    host: '0.0.0.0'
    port: 3080
```
```
docker run -p 127.0.0.1:3080:3080 ...
```
⚠️ patch 是**整体替换该行 config、不是深合并**，`port` 必须一并写出；写成字面值后命令行 `--host/--port` 的运行时读取会被移除。用 `dsh web --dump-config` 可以先看合成后的配置树。

## 4. 让用户能打开 —— 必须走 localhost，且由你来配隧道

### 🔴 坑四：不从 localhost 访问，前端会直接崩

浏览器只在**安全上下文**（HTTPS 或 `localhost`/`127.0.0.1`）暴露 `crypto.randomUUID` 和 `crypto.subtle`。走 `http://<内网IP>:3080` 时两者都是 `undefined`，dsh 前端在渲染「选择工作区目录」时抛 **`crypto.randomUUID is not a function`**，弹窗空白、无法选工作区（其它用到 Web Crypto 的地方也会陆续挂）。

诊断一句话搞定（浏览器控制台）：
```js
console.log(window.isSecureContext, typeof crypto.randomUUID)  // false / "undefined" 即中招
```

### 正确做法：装完主动配隧道

```
list_port_forwards            → 确认本地 3080 没被占（本地端口是唯一索引，撞了会创建失败）
create_port_forward(server=<别名>, name="dsh", localPort=3080,
                    remoteHost="127.0.0.1", remotePort=3080)
```
默认立即启动 + 开机自启，之后把返回的 `localUrl`（`http://127.0.0.1:3080`）告诉用户。
**别说「请你自己去端口转发页加一条」** —— 你有工具，自己做完。

## 5. 用户自己完成的最后两步（你不要代劳）

1. **填 API 密钥**：Web UI「设置 → 模型」→ DeepSeek 卡片。字段**只写不读**，密钥落在 `$DSH_HOME/.credentials.yaml`，页面只回脱敏描述符。
   🔴 **绝不要求用户把密钥贴进对话，也不要去读那个文件**（本技能已把读它列入危险命令）。凭据解析序：环境变量 → `$DSH_HOME/.credentials.yaml` → 调用目录 `.env` → `$DSH_HOME/.env`。
2. **选工作区**：不选的话输入框一直禁用（占位符写着「选择一个工作区开始」）。

## 6. 交付前务必告诉用户的三件事

1. **Web UI 没有登录认证**。谁能打开这个页面，谁就能在那台机器上跑命令、读工作区文件。这正是必须走隧道、不能绑内网 IP 的实际理由（不只是前端报错）。
2. **dsh 的执行完全不经 OpsPub 的策略引擎 / 审批 / 审计 / 脱敏** —— 装上它等于在那台机器上多开一个 OpsPub 管不到的 AI 执行面。用户有权知道。
3. **默认权限 `workspace-write`**：bash 与写文件限工作区 + 临时目录，但**读、网络、进程可见性不受限**（`DSH_PERMISSION_MODE` 可改进程默认值）。

另：会话遥测默认本地，但 `DSH_TELEMETRY_MODE=FULL` 会把消息正文、工具参数与结果、工作区路径经 OTLP 外传，且**官方基线没有脱敏规则**；`DSH_TELEMETRY_DISABLED` 非空是硬开关。别替用户打开。

## 7. 常见现象 → 直接结论

| 现象 | 结论 |
|---|---|
| `npm i` 成功但 `dsh` 命令不存在 | 安装中途失败（多为 node-gyp）。看日志尾部，别只看退出码 |
| `gyp ERR! stack AggregateError [ETIMEDOUT]` | 取 Node 头文件超时 + 缺编译器。设 `NODEJS_ORG_MIRROR`，或改走 Docker |
| `disturl is not a valid npm option` | npm 11 移除了该项，改用 `NODEJS_ORG_MIRROR` |
| 启动报 `$.host expected "127.0.0.1" \| "0.0.0.0" but got <IP>` | 绑定地址是二值枚举，见第 3 节 |
| `crypto.randomUUID is not a function` / 目录选择器空白 | 非安全上下文，改从 localhost 访问，见第 4 节 |
| `--host 0.0.0.0` 被拒 | CLI 有意为之的安全设计。容器场景用 patch 写 config，别跟它对着干 |
| 装完用户说打不开 | 先 `port_check` 确认服务在听，再看是不是压根没配隧道 |

---

## 8. disk-provisioning

```yaml
---
name: disk-provisioning
description: 数据盘分区 / 格式化 / 挂载 / 扩容 —— AI 先用只读命令摸清盘的现状并出方案，分区写操作走危险审批，mkfs 等「极高危」步骤由 AI 发起审批、用户在 OpsPub 桌面端手敲设备路径并验证身份后才执行，最后 AI 负责挂载与验证。
触发词: 分区, 磁盘分区, 硬盘分区, 新盘, 新硬盘, 数据盘, 挂载磁盘, 挂载数据盘, 挂载硬盘, 格式化, 格式化磁盘, 格式化数据盘, mkfs, fdisk, parted, gdisk, sgdisk, sfdisk, lsblk, blkid, fstab, 开机自动挂载, 磁盘扩容, 扩容磁盘, 云盘扩容, 扩展分区, growpart, resize2fs, xfs_growfs, lvextend, lvm, 逻辑卷, pvcreate, vgcreate, lvcreate, mkswap, 交换分区, raid, mdadm, 磁盘加密, luks, cryptsetup, wipefs
---
```

# disk-provisioning —— 数据盘分区 / 格式化 / 挂载 / 扩容

适用：用户说"给新盘分区并挂载到 /data"、"云盘扩容了帮我扩到分区里"、"格式化这块盘"、"加个 swap 分区"等。

## 🔴 先分清三类命令（避免白撞墙）

| 类别 | 例子 | AI 能不能做 |
|------|------|-------------|
| 只读探测 | `lsblk -f` / `blkid -p` / `fdisk -l` / `parted -l` / `findmnt` / `pvs` / `df -h` | 能，任何档位放行 |
| 改分区表 / 卷管理 | `parted … mklabel/mkpart/rm` / `sgdisk -n/-o/-Z` / `fdisk` 喂脚本 / `lvremove` / `mkswap /dev/…`（swap 文件不受影响）/ `cryptsetup luksFormat` / `mdadm --create` | 能，但每条进**危险审批**，用户在 OpsPub 弹窗看清命令后点放行 |
| **极高危** | `mkfs.*` / `mke2fs` / `wipefs`（连 `-n` 也算）/ `dd of=/dev/…` / `> /dev/sdX` | 能**发起**，但任何档位（含 trusted）都进**极高危审批**：用户必须在 OpsPub 桌面端**手敲设备路径并验证身份**（Windows Hello / Touch ID / 主密码）才会执行，每次一验、只放行这一条 |

极高危这一类的流程：你把目标核对清楚并讲给用户 → 发起命令 → 用户在审批窗里手敲设备路径、验证身份 → 执行。被拒绝或超时就**停手**，把决定权交还用户；不要试 `mke2fs`、`busybox mkfs`、`$(echo mkfs)`、拆成多步这类变体 —— 只会再次触发审批并记入审计，还会让用户以为出了安全问题。

⚠️ 含 `sudo` 的命令会触发**用户审批**；被拒后不要原样重试，改问用户。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 |
|---------|-----------|
| 看磁盘使用 | `disk_usage(server, path?)` |
| 看系统信息 | `system_info(server)` |
| 其余磁盘细节 | `ssh_exec` 跑下面第 1 步的只读命令 |

## 标准流程：新增一块数据盘（示例 /dev/sdb → /data）

### 第 1 步：只读摸底（AI 做）

```bash
# —— 不需要 root，非 root 账号（如 ubuntu）也能直接跑，先用这些 ——
lsblk -f -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,UUID   # 全局视图；FSTYPE 已能看出有无文件系统 / LVM / RAID 成员
findmnt -n -o SOURCE /                               # 根分区落在哪块盘（别动它）
findmnt -S /dev/sdb1                                 # 目标是否已挂载
grep -n sdb /etc/fstab; cat /proc/mdstat             # 是否被 fstab / RAID 占用

# —— 需要 root：用非 root 账号必须加 sudo（别用 wipefs -n 探测，它同样会触发极高危审批）——
sudo blkid -p /dev/sdb                               # 有无文件系统 / RAID / LVM 签名（比 lsblk 的缓存更可靠）
sudo fdisk -l /dev/sdb                               # 现有分区表
sudo pvs                                             # 是否被 LVM 占用
```

⚠️ **非 root 账号不加 sudo 会静默失败**（在 `ubuntu` 账号上实测）：`blkid -p` / `fdisk -l` / `pvs` 报 `Permission denied`；**`parted -l` 退出码是 0、stdout 为空**，只在 stderr 里报错。千万别把"没输出"当成"没有这块盘"，一定要看 stderr。
每条 `sudo` 都会弹一次审批 —— 把上面三条 sudo 命令合并成一个 `ssh_exec_script`，用户只需批准一次。

**同时满足才继续**，任一不满足就停下，把情况讲给用户：

1. 目标盘**不是**根盘，也不是根盘的上层设备；
2. 没挂载、不在 fstab、不属于 RAID / LVM / swap；
3. 没有文件系统签名。若有旧数据，必须先问用户"这块盘的数据可以丢吗"，拿到明确答复；
4. 容量与用户说的一致（云盘容易认错盘）。

### 第 2 步：把方案讲给用户（AI → 用户）

一句话说清：目标设备（如 `/dev/sdb`，200G，无文件系统，未挂载）、要做的步骤、会丢什么、怎么回滚。

### 第 3 步：分区（AI 执行，需审批）

```bash
parted -s /dev/sdb mklabel gpt mkpart primary 0% 100%
partprobe /dev/sdb && lsblk /dev/sdb
```

### 第 4 步：格式化（🔴 极高危，需用户本人验证身份）

先把目标与影响讲给用户（见文末话术），再发起：

```bash
mkfs.ext4 -L data /dev/sdb1      # 或：mkfs.xfs -L data /dev/sdb1
```

这条会进**极高危审批**：OpsPub 弹出红色审批窗，窗里列出 OpsPub 自己探测到的目标情况，用户要**手敲 `/dev/sdb1`** 并验证身份才会执行。
你的调用会一直等到用户裁决（最长 5 分钟）；被拒绝或超时就停手，问用户要不要换盘 / 改方案，**别重试**。
执行完后，AI 用 `lsblk -f /dev/sdb` 确认 `FSTYPE` 已出现，再继续。

### 第 5 步：挂载 + 开机自动挂载（AI 做）

```bash
mkdir -p /data
blkid -s UUID -o value /dev/sdb1                     # 读出 UUID
cp /etc/fstab ~/.opspub/backups/fstab.bak             # 先备份：fstab 写错会导致开机失败
mount /dev/sdb1 /data
echo 'UUID=<上一步读到的值> /data ext4 defaults,nofail 0 2' | tee -a /etc/fstab
mount -a && findmnt --verify                         # 验证 fstab 无误
```

- 一律用 **UUID** 而不是 `/dev/sdb1`（云主机重启后盘符可能变）；
- 务必带 `nofail`：盘缺失时系统仍能正常开机。

### 第 6 步：验证

```bash
df -h /data && findmnt /data
touch /data/.probe && rm /data/.probe
```

## 扩容（云盘已在控制台扩大，不动现有数据）

扩容是非破坏性的，AI 可直接执行；动手前先提醒用户**做快照**。

```bash
lsblk /dev/vda                          # 确认磁盘已变大、分区还是旧尺寸
growpart /dev/vda 1                     # 分区扩到磁盘尽头
resize2fs /dev/vda1                     # ext4；xfs 用：xfs_growfs /
# LVM：lvextend -r -l +100%FREE /dev/vg0/data
```

**缩小**（`lvreduce` / `resize2fs` 缩容）风险高：先备份，`lvreduce` 会进危险审批。

## 发起极高危审批前的话术

> 下一步要格式化 `/dev/sdb1`（会清空这块盘上的全部数据，不可恢复）。目标我已核对：200G、无文件系统、未挂载、不在 fstab。
> 我现在发起命令 `mkfs.ext4 -L data /dev/sdb1`，OpsPub 会弹出**极高危审批**：请你在窗口里输入 `/dev/sdb1` 并验证身份（Windows Hello / Touch ID / 主密码）后批准。
> 完成后我继续挂载和验证；如果你不想格式化，直接点「拒绝」即可。

---

## 9. docker-ps

```yaml
---
name: docker-ps
description: docker 容器排障速查 —— 状态/日志/资源/网络/磁盘清理/compose。
触发词: docker, 容器, container, docker ps, 容器挂了, docker logs, 镜像, docker compose, dockerd, 容器互通, 502 容器, oom, docker 起不来, docker 报错, 容器起不来, 容器启动失败, container 报错, docker 重启, 镜像拉不到, 镜像下载, pull 镜像, restarting, 一直重启, docker 27, docker 28, dockerhub 镜像加速, daemon.json, registry-mirrors, image pull backoff, errimagepull, 装 docker, 装 docker compose, docker compose down, docker compose up -d, 磁盘满了, /var/lib/docker, docker 占空间, docker system df, docker prune, 数据卷, named volume, 匿名卷, bind mount, 容器内时区, tz asia, ulimit, 容器内存限制, oomkilled, exit 137, exit 1
dangerous_commands:
  - '(?i)\bdocker\s+system\s+prune\s+-a\b[^\n]*--volumes\b'
  - '(?i)\bdocker\s+rm\s+-f\s+\$\(\s*docker\s+ps\s+-aq\s*\)'
  - '(?i)\bdocker\s+(?:volume|network)\s+rm\b[^\n]*\$\(\s*docker\s+(?:volume|network)\s+ls\b'
  # compose down -v 连同 named volume 一起删 = 数据库数据直接没（正文第六步危险项）
  - '(?i)\bdocker(?:\s+compose|-compose)\s+down\b[^\n]*(?:\s-v\b|--volumes\b)'
  # volume prune 清掉所有未挂载卷（停服期间的卷也算未挂载）
  - '(?i)\bdocker\s+volume\s+prune\b[^\n]*(?:--all\b|-a\b)'
  - '(?:^|[\s;&|])(?:kill|killall)\s+-9\s+dockerd?(?:\s|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/docker(?:\s|/|$)'
---
```

# docker-ps —— docker 容器排障速查

适用：用户报"容器起不来"/"接口 502 但服务在跑"/"磁盘满了不知道谁占的"/"容器互通有问题"/"compose 起了一半"。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 docker daemon 是否在跑 | `service_status(server, "docker")` | systemctl status docker |
| 看磁盘（镜像/卷占地） | `disk_usage(server, "/var/lib/docker")` | df -hT |
| 看容器映射端口被谁占 | `port_check(server, 端口)` | ss -tlnH |
| 看容器日志文件 | `tail_log(server, "/var/lib/docker/containers/<id>/<id>-json.log")` | tail -n |
| 改 daemon.json / compose | `sftp_read` 看现状 + `sftp_write` 整文件写 | cat / 编辑器 |

这些只读工具**任何策略档位都放行**（含 readonly 档）；改 `daemon.json` / `docker-compose.yml` 走 `sftp_read`+`sftp_write`（无 shell 转义坑），写完 `ssh_exec systemctl reload docker` / `docker compose up -d`。

⚠️ `docker ps` / `docker logs` / `docker inspect` 是只读判定，但 `docker rm` / `docker stop` / `docker compose down` / `prune` 等是写操作，会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。
注：很多机器用户在 `docker` 组里，docker 命令本身不需 `sudo`；但停容器/删卷仍受策略档位约束。

## 第一步：容器状态

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

| Status | 含义 |
|--------|------|
| `Up X minutes` | 在跑 |
| `Exited (0)` | 正常退出 |
| `Exited (137)` | OOM 被 kill（看 `dmesg | grep -i killed`） |
| `Exited (1)` | 应用自杀 |
| `Exited (139)` | 段错误 |
| `Restarting (N)` | 起不来在重试 N 次 |
| `Paused` | 被 `docker pause` |

## 第二步：看日志

```bash
docker logs --tail 200 --timestamps <容器名>
docker logs --since 10m <容器名>
docker logs -f --tail 50 <容器名>           # 实时跟
docker logs <容器> 2>&1 | grep -i error    # stderr 合并 + 过滤
```

OOM 看 `dmesg | grep -i "killed process"`，会有 oom-killer 命中的 PID 和命令名。

> ⚠️ `docker logs` 看不到东西 = 应用日志写到了文件而不是 stdout/stderr → exec 进去看 `/var/log/...`

## 第三步：资源占用

```bash
docker stats --no-stream                   # 一次性快照
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
docker top <容器>                          # 容器内进程树
docker system df                           # 磁盘谁占的：images / containers / volumes / build-cache
docker system df -v                        # 详细每个 image/volume 占用
```

## 第四步：进容器排查

```bash
docker exec -it <容器名> sh                # alpine
docker exec -it <容器名> bash              # debian/ubuntu
docker exec <容器名> ps aux                # 不进交互 shell 直接看进程
docker exec <容器名> cat /etc/hostname
docker exec <容器名> netstat -tlnp        # 需要 net-tools
docker exec <容器名> ss -tlnp             # 现代发行版
```

`/proc/<pid>/limits` 看资源限制；`/etc/resolv.conf` 看 DNS。

## 第五步：网络

```bash
docker network ls
docker network inspect bridge
docker network inspect <network-name>
docker inspect <容器名> | jq '.[0].NetworkSettings'    # 容器 IP / 端口映射 / 网络名
```

容器间不通的常见原因：

1. 没在同一个 user-defined network（默认 bridge 不支持容器名互访，只有自建网络才行）
2. 用了 `network_mode: host` 但端口被宿主占了
3. iptables/firewalld 拦了 bridge
4. compose 的 `depends_on` 不会等服务真正就绪（只等容器启动），应用没重试

## 第六步：Docker Compose

```bash
cd <project-with-compose>
docker compose ps                          # 项目内容器状态
docker compose logs --tail=100 <服务>      # 看某服务日志
docker compose logs -f                     # 跟所有服务
docker compose config                      # 解析后的完整 compose（带变量展开）
docker compose up -d                       # 起所有
docker compose up -d <服务>                # 起单个
docker compose restart <服务>              # 重启某服务
docker compose down                        # 停 + 删容器/网络（**保留** volume）
docker compose down -v                     # ⚠️ 同时删 volume，数据丢
```

## 第七步：磁盘清理（注意要确认）

```bash
# 1) 先评估
docker system df

# 2) 安全的清理（按风险递增）
docker container prune              # 清停掉的容器（交互确认）
docker image prune                  # 清 dangling 镜像（无 tag 中间层）
docker image prune -a               # 清未使用的镜像（更狠）
docker network prune                # 清没用的网络
docker builder prune                # 清 buildx 构建缓存
docker volume prune                 # 清没挂载的 volume（数据可能丢！）

# 3) 核武器（**不要**手抖）
docker system prune -a --volumes    # 上面全部一锅端
```

## 第八步：镜像构建上下文

```bash
docker build -t myapp:latest .              # 当前目录为构建上下文
docker build -t myapp:latest -f /path/Dockerfile <ctx>
docker buildx build --platform=linux/amd64,linux/arm64 -t myapp:multi .

# 构建慢、context 大 → 检查 .dockerignore（不在里面的全部 tar 进 daemon）
du -sh .                            # 当前目录大小
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| daemon 配置 | `/etc/docker/daemon.json` |
| Docker 数据 | `/var/lib/docker/`（containers / volumes / image / overlay2 都在这） |
| compose 文件 | 项目内 `docker-compose.yml` / `compose.yml` |
| Dockerfile | 项目内（路径 `-f` 指定） |
| 1Panel 应用 | `/opt/1panel/apps/<app>/<container>/docker-compose.yml` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `docker system prune -a --volumes` | 清未使用镜像 + 未挂载 volume（**数据丢失风险**），先 `docker system df` 评估 |
| `docker rm -f $(docker ps -aq)` | 强删所有容器（包括正在跑的） |
| `docker volume rm $(docker volume ls -q)` | 删全部 volume，**数据库数据可能直接消失** |
| `docker network rm $(docker network ls -q)` | 删全部网络（含 bridge），容器全部断网 |
| `kill -9 dockerd` | 强杀 daemon，跑着的容器会被遗弃成 zombie |
| `rm -rf /var/lib/docker` | 删全部 docker 数据，**重启 daemon 后所有镜像/容器/volume 消失** |

## 教训

- 任何 `docker system prune -a --volumes` 前必须先 `docker system df` 评估影响 + 确认 volume 都已挂载到外部存储或备份。
- 容器 OOM 多半是没设 `--memory`/`--memory-swap` + 应用内存泄漏；先加监控再加限制。
- compose 起的服务"一直 Restarting" = 看 `docker compose logs <服务>`，多半是依赖（数据库）还没起好但应用没有重试逻辑；`depends_on` 只保证容器启动顺序，不保证应用就绪。
- 端口映射写了但访问不通 = 容器内服务监听 127.0.0.1 而不是 0.0.0.0 → 改应用配置（不是 nginx 也不是 docker 的问题）。
- 容器 healthcheck 失败导致 `(unhealthy)` 状态但应用其实在跑 = 多半是 healthcheck 命令本身错（如检查的 endpoint 路径变了）。

---

## 10. git-server

```yaml
---
name: git-server
description: 自建 Git 服务器速查 —— Gitea / GitLab CE / Gogs 安装/备份/恢复/hook/SSH/迁移。
触发词: gitea, gitlab, gitlab-rake, gogs, 自建 git, git 服务器, git push 失败, gitlab 备份, gitea 备份, ssh-key, ci runner, forgejo, gitea actions, gitea 1.22, gitea 1.23, gitlab ee, gitlab ce, gitlab omnibus, 装 gitea, 装 gitlab, 部署 git 服务, git 仓库, internal git, git 克隆失败, git push 大文件, lfs, gitlab webhook, gitea webhook, gitlab 起不来, gitea 挂了, git 服务连不上, gitlab reconfigure, post-receive, git hook
dangerous_commands:
  - '(?i)\bgitlab-rake\s+gitlab:backup:restore\b'
  - '(?i)\bgitlab-rake\s+gitlab:cleanup:'
  - '(?i)\bgitlab-rails\s+console\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/opt/gitlab(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/(?:var/lib/gitea|opt/gitea)(?:\s|/|$)'
  # 直接删服务端裸库存储目录 = 仓库 + 全部提交历史不可恢复
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+\S*/git/repositories(?:\s|/|$)'
  # 在服务端 git data 目录里写/改 hooks（post-receive 等）= 每次 push 注入任意代码
  - '(?:^|[\s;&|])(?:vi|vim|nano|tee|cp|mv)\s+\S*/hooks/(?:post-receive|pre-receive|update)\b'
---
```

# git-server —— 自建 Git 服务器

适用：自建 Gitea / GitLab CE / Gogs；想"装一个内网 git"/"备份/迁移"/"用户管理"/"配 webhook"/"配 CI runner"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Gitea 优先用 `install_app(server, "gitea")`**（Gitea 在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。GitLab CE / Gogs 目录里没有 → 仍按下面手动装。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看服务状态（包安装） | `service_status(server, "gitea")` / `service_status(server, "gitlab-runsvdir")` | systemctl status |
| 看 Web / SSH 端口 | `port_check(server, 3000)` / `port_check(server, 2222)` / `port_check(server, 80)` | ss -tlnH |
| 看日志 | `tail_log(server, "/data/gitea/log/gitea.log")` / `tail_log(server, "/var/log/gitlab/gitlab-rails/production.log")` | tail -n |
| 改配置 | `sftp_read` 看现状 + `sftp_write(server, "/data/gitea/conf/app.ini" 或 "/etc/gitlab/gitlab.rb", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，Gitea 写完 `ssh_exec sudo systemctl restart gitea`，GitLab 写完 `ssh_exec sudo gitlab-ctl reconfigure`；docker 部署看容器日志走 `ssh_exec docker logs`。

⚠️ 备份/恢复、`gitlab-ctl reconfigure/restart`、`gitlab-rake`、删数据目录、改 hooks 都会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

> 🔴 **hooks 安全**：服务端裸库的 `hooks/post-receive`（及 `pre-receive` / `update`）每次 push 都以 git 用户身份执行——能写它 = 能在每次推送时注入任意代码（挖矿 / 反弹 shell / 篡改提交）。Gitea/GitLab 自带的 hook 由应用管理，**不要手改裸库 hooks**；自定义需求走 Gitea 的「Git Hooks」管理页或 GitLab 的 server hooks 规范目录，并审查脚本来源。

## 选型对照

| 工具 | 资源占用 | 功能 | 适合 |
|------|---------|------|------|
| **Gitea**（Go） | 100MB+ 内存 | Issue / PR / Actions / Package / Wiki | **首选**：内网/小团队/树莓派都能跑 |
| **Gogs**（Go，Gitea 前身） | 100MB+ | 基础够用 | 极小资源；Gitea 已是事实标准 |
| **GitLab CE**（Ruby） | 4GB+ 内存 | 全家桶（CI / Container Registry / Wiki / Pages / Issues） | 企业；资源充足；需要 GitLab Runner |
| **GitLab Omnibus 容器** | 同上 | 同上 | 想要 GitLab 但又懒得手装组件 |
| **Forgejo**（Gitea fork） | 类 Gitea | 同 Gitea + 社区治理 | Gitea 担心商业化的可选项 |

## 一、Gitea

### 安装（推荐 docker compose）

```yaml
# docker-compose.yml
version: "3"
services:
  gitea:
    image: gitea/gitea:latest
    restart: unless-stopped
    environment:
      USER_UID: 1000
      USER_GID: 1000
      GITEA__database__DB_TYPE: postgres
      GITEA__database__HOST: db:5432
      GITEA__database__NAME: gitea
      GITEA__database__USER: gitea
      GITEA__database__PASSWD: xxx
    volumes:
      - ./data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    ports:
      - "3000:3000"        # web
      - "2222:22"          # ssh（**主机的 22 多半被 sshd 占了，外露另一个端口映射进去**）
    depends_on: [db]
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: gitea
      POSTGRES_DB: gitea
      POSTGRES_PASSWORD: xxx
    volumes:
      - ./postgres:/var/lib/postgresql/data
```

### 路径

| 内容 | 路径 |
|------|------|
| 主配置 | `/data/gitea/conf/app.ini`（容器）/ `/etc/gitea/app.ini`（包安装） |
| 仓库存储 | `/data/git/repositories/` |
| LFS | `/data/git/lfs/` |
| 数据库 | 外置 postgres 或自带 sqlite `/data/gitea/gitea.db` |
| 日志 | `/data/gitea/log/` 或容器 stdout |

### 备份 / 恢复

```bash
# 容器内
docker exec -u git gitea gitea dump -c /data/gitea/conf/app.ini -t /tmp -f /tmp/gitea-backup.zip
docker cp gitea:/tmp/gitea-backup.zip ./

# 恢复
docker exec -u git gitea unzip -d /tmp/restore /tmp/gitea-backup.zip
# 然后 cp repos、db restore、app.ini 替换；具体步骤看官方 doc
```

简单粗暴：**直接 tar 整个 data 目录** + dump postgres，恢复时换回去就行（前提：版本一致）。

### CLI 管理

```bash
docker exec -it gitea su git -c 'gitea admin user create --username admin --password xxx --email a@b.com --admin'
docker exec -it gitea su git -c 'gitea admin user change-password --username admin --password newxxx'
docker exec -it gitea su git -c 'gitea admin user list'
docker exec -it gitea su git -c 'gitea doctor'      # 一致性检查
```

### Gitea Actions（GitHub Actions 兼容）

容器化 runner：

```bash
docker run -d --name gitea-runner \
    -e GITEA_INSTANCE_URL=http://gitea:3000 \
    -e GITEA_RUNNER_REGISTRATION_TOKEN=<token> \
    -e GITEA_RUNNER_NAME=runner-1 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v ./runner-data:/data \
    gitea/act_runner:latest
```

Token 在 Gitea UI「Site Administration → Actions → Runners」生成。

## 二、GitLab CE

### 安装（Omnibus 包，主机直装）

```bash
# Debian/Ubuntu
curl -sS https://packages.gitlab.com/install/repositories/gitlab/gitlab-ce/script.deb.sh | sudo bash
sudo EXTERNAL_URL="https://gitlab.example.com" apt install gitlab-ce

# 初始化完成后 root 初始密码在
sudo cat /etc/gitlab/initial_root_password
```

### 容器化（docker compose）

```yaml
services:
  gitlab:
    image: gitlab/gitlab-ce:latest
    hostname: gitlab.example.com
    restart: unless-stopped
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://gitlab.example.com'
        gitlab_rails['gitlab_shell_ssh_port'] = 2222
    ports:
      - "80:80"
      - "443:443"
      - "2222:22"
    volumes:
      - ./config:/etc/gitlab
      - ./logs:/var/log/gitlab
      - ./data:/var/opt/gitlab
    shm_size: 256m
```

### 配置 reconfigure

```bash
sudo vim /etc/gitlab/gitlab.rb          # 改配置
sudo gitlab-ctl reconfigure             # 应用（每次都跑）
sudo gitlab-ctl restart                 # 重启所有组件
sudo gitlab-ctl status                  # 各组件状态
sudo gitlab-ctl tail nginx              # 实时日志
sudo gitlab-ctl tail puma               # 应用层
```

### 备份 / 恢复

```bash
# 备份（写到 /var/opt/gitlab/backups/）
sudo gitlab-backup create

# 配置文件不在备份里 —— **必须单独备份**（落 OpsPub 统一工作区，别散落 /backup 等臆造路径）
sudo tar czf ~/.opspub/backups/gitlab-config-$(date +%F).tar.gz /etc/gitlab

# 恢复（⚠️ 走审批）
# 1) 停 service
sudo gitlab-ctl stop unicorn      # 老版本
sudo gitlab-ctl stop puma         # 新版本
sudo gitlab-ctl stop sidekiq
# 2) 选备份文件名（不要带 _gitlab_backup.tar 后缀）
sudo gitlab-backup restore BACKUP=1701234567_2024_01_01_16.5.0
# 3) reconfigure + check
sudo gitlab-ctl reconfigure
sudo gitlab-rake gitlab:check SANITIZE=true
sudo gitlab-ctl restart
```

### 重置 root 密码

```bash
sudo gitlab-rake "gitlab:password:reset[root]"
```

### Runner 安装

```bash
# Linux
sudo curl -L --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64
sudo chmod +x /usr/local/bin/gitlab-runner
sudo useradd --comment 'GitLab Runner' --create-home gitlab-runner --shell /bin/bash
sudo gitlab-runner install --user=gitlab-runner --working-directory=/home/gitlab-runner
sudo gitlab-runner start

# 注册
sudo gitlab-runner register \
    --url https://gitlab.example.com/ \
    --token <runner_token> \
    --executor docker \
    --docker-image alpine:latest
```

## 三、SSH key 与仓库 URL

### 生成与上传

```bash
ssh-keygen -t ed25519 -C "you@host"
# 把 ~/.ssh/id_ed25519.pub 内容粘到 Gitea/GitLab UI 「SSH Keys」

# 测试
ssh -T git@gitea.example.com -p 2222     # Gitea 默认 22 改 2222
ssh -T git@gitlab.example.com -p 2222
```

### 仓库 URL

| 类型 | 格式 |
|------|------|
| HTTPS | `https://git.example.com/user/repo.git` |
| SSH（标准 22） | `git@git.example.com:user/repo.git` |
| SSH（非标端口） | `ssh://git@git.example.com:2222/user/repo.git` |

## 四、迁移

### Gitea → Gitea（不同实例）

UI 「Repository Migration」直接拉远端仓库（HTTPS / SSH / token）；含 Issues / PR / Releases / Wiki。

### GitHub → Gitea

Gitea 内置 GitHub migrator，UI 选「Migration → GitHub」+ token，能迁 issue/PR/star/watcher。

### 老 svn / hg → Git

```bash
git-svn clone <svn-url>     # svn
hg-fast-export -r <hg-repo>  # mercurial
```

## 五、常见问题

### Q1: clone 报 "Permission denied (publickey)"
- 公钥没上传 / 上传错账号
- SSH 端口不对（自建 Gitea 多半改了 2222）
- 客户端的 `~/.ssh/config` 没匹配上：
  ```
  Host gitea.example.com
      HostName gitea.example.com
      Port 2222
      User git
      IdentityFile ~/.ssh/id_ed25519_gitea
  ```

### Q2: push 大文件被拒
- 仓库限制：Gitea/GitLab 默认有单 push 大小限制（如 50MB）
- LFS：`git lfs install` + `git lfs track "*.bin"` → push

### Q3: GitLab 起不来 / reconfigure 失败
- `gitlab-ctl tail` 找具体哪个组件错（postgres / redis / unicorn-puma / sidekiq）
- 磁盘满：`df -h /var/opt/gitlab`
- 内存不够：4GB 是最低；2GB 多半起不来

### Q4: webhook 推不出去
- Gitea 默认禁止内网回环（防 SSRF）：`app.ini` 加 `[webhook] ALLOWED_HOST_LIST = *` 或具体 hostname
- 自签 HTTPS 证书：`SKIP_TLS_VERIFY = true`（**仅内网**）

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `gitlab-rake gitlab:backup:restore` 错文件 | **数据被覆盖**，老数据丢 |
| `gitlab-rake gitlab:cleanup:*` | 各种清理任务（孤儿 lfs / 旧 ci artifact） |
| `gitlab-rails console` | 直接 Ruby on Rails 控制台，可改任意数据 |
| `rm -rf /var/opt/gitlab` | 删 GitLab 数据（配置 + 仓库 + db） |
| `rm -rf /var/lib/gitea` 或 `/opt/gitea` | 同上 |
| `rm -rf .../git/repositories` | 删裸库存储 = 仓库 + 全部提交历史不可恢复 |
| 手改裸库 `hooks/post-receive` 等 | 每次 push 注入任意代码（**供应链投毒**） |
| 改 Gitea LFS 路径但没迁移老文件 | LFS 对象失踪 |
| `gitlab-ctl stop` 然后 reboot | 没启用 `enable=true` 的服务不会自动起 |

## 教训

- Gitea **数据目录就是全部**：备份 = tar 这个目录 + dump 数据库。恢复 = 反过来。简单到极致。
- GitLab 备份**不含配置文件**：必须单独备份 `/etc/gitlab/`，否则恢复后 `external_url` / 邮件配置 / runner 注册都丢。
- GitLab Omnibus 改完 `gitlab.rb` **必须 `gitlab-ctl reconfigure`**，不是 restart。
- Gitea Actions runner 与 GitLab Runner **隔离运行环境**：开 docker executor 一定限制 image 白名单，否则跑 `--privileged` 等于宿主 root。
- 改 SSH 端口时给老用户**留过渡期 + 邮件通知** —— 全公司同时 `git push` 失败是经典事故。
- 大型仓库 LFS 用对象存储（MinIO/S3）；放本地 fs 久了备份非常痛苦。

---

## 11. iptables-firewalld

```yaml
---
name: iptables-firewalld
description: iptables / nftables / firewalld / ufw 对照速查 —— 规则增删 / NAT / 端口转发 / 持久化。
触发词: iptables, ip6tables, nftables, nft, firewalld, firewall-cmd, ufw, 防火墙, 端口转发, port forward, masquerade, snat, dnat, conntrack, 规则持久化, 放行端口, 开放端口, 开端口, 关端口, 封端口, 封 ip, 封禁 ip, 屏蔽 ip, 白名单 ip, 黑名单 ip, 端口被占, 端口不通, telnet 不通, 端口连不上, 连不上, 访问不了, nat 转发, ip 转发, 防火墙规则, 防火墙没生效, 防火墙重启, 把自己锁外面, 锁外面, ssh 断了, 连不进去
dangerous_commands:
  - '(?:^|[\s;&|])nft\s+flush\s+ruleset(?:\s|$)'
  - '(?:^|[\s;&|])iptables\s+-t\s+(?:nat|mangle|filter|raw)\s+-F(?:\s|$)'
  - '(?:^|[\s;&|])iptables-restore\s+<\s*/dev/null'
  - '(?:^|[\s;&|])firewall-cmd\s+--complete-reload\b'
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:firewalld|nftables|iptables|ufw)\b'
  # 把 INPUT/FORWARD 默认策略改 DROP/REJECT 而未先放行 SSH = 远程立刻失联（正文「四」「危险清单」对应项）
  - '(?:^|[\s;&|])(?:iptables|ip6tables)\s+-P\s+(?:INPUT|FORWARD)\s+(?:DROP|REJECT)\b'
---
```

# iptables-firewalld —— 主机防火墙

> linux-fundamentals 已覆盖最常见的 firewall-cmd / ufw / iptables 三件套基础；本技能聚焦深入用法、NAT、规则持久化、跨工具迁移。

适用：用户问"怎么配端口转发 / NAT / SNAT / 限速 / 黑名单一段 IP / 切到 nftables / 规则持久化"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **查端口通不通 / 被谁监听** → `port_check(server, 端口)`（= ss -tlnH，任何档位放行）——改规则前后都先用它确认，比 `ssh_exec ss` 稳。
- **看防火墙服务状态** → `service_status(server, "firewalld")` / `service_status(server, "ufw")` / `service_status(server, "nftables")`。
- **改规则文件 / 持久化** → 先 `sftp_read` 看现状（`/etc/nftables.conf`、`/etc/iptables/rules.v4`、`/etc/ufw/before.rules`），再 `sftp_write` 整文件写入（无 shell 转义坑），写完用 `ssh_exec` reload。
- 增删规则、`-F`/`reset`/改默认策略这类**改动型**走 `ssh_exec`，必过策略档位 + 审批。

🔴 **防火墙是最容易"把自己锁在外面"的领域**。规则会经 `ssh_exec` 触发**用户审批**——执行前必须告诉用户"这步改防火墙、有断 SSH 风险、需要你在 OpsPub 批准"，**被拒后绝不原样重试**。
**铁律：远程改防火墙前永远先布保险绳**——把回滚命令落到 `~/.opspub/scripts/`（OpsPub 统一工作区），用 `at` 定时自动执行（见末尾「教训」）；改完测通了再 `atrm` 取消。

## 一、工具关系图

```
                         netfilter (内核)
                              ↕
     ┌───────────┬────────────┴────────────┬───────────┐
     │           │                         │           │
iptables    nftables                  firewalld       ufw
(legacy)    (modern)              (RHEL/Fedora)    (Ubuntu)
                                    ↳ 后端 = nftables 或 iptables
                                                     ↳ 后端 = iptables
```

新发行版（RHEL 8+ / Ubuntu 22.04+）默认 **nftables**；老版本 / 多数容器还是 **iptables-legacy**。`iptables` 命令在新系统会自动指向 `iptables-nft`（兼容层）。

```bash
update-alternatives --display iptables           # Debian 系，看用的是 legacy 还是 nft
ls -l $(which iptables)                          # 链接目标
iptables --version                               # 后面带 (nf_tables) 或 (legacy)
```

## 二、firewalld（RHEL/CentOS/Rocky/Fedora 默认）

```bash
sudo firewall-cmd --state
sudo firewall-cmd --get-default-zone           # 默认 zone
sudo firewall-cmd --list-all                    # 默认 zone 全部
sudo firewall-cmd --list-all-zones              # 所有 zone
sudo firewall-cmd --get-active-zones            # 实际在用的（接口 → zone 映射）

# 加端口（runtime，重启丢）
sudo firewall-cmd --add-port=8080/tcp
# 持久化（**注意：runtime 与 permanent 是两套**）
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload                      # 应用 permanent 改动

# 加 service（名字预定义）
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --get-services                # 看支持哪些 service

# 限制来源 IP（rich rule）
sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="10.0.0.0/24" port port="3306" protocol="tcp" accept'

# 删除（要与 add 命令对称）
sudo firewall-cmd --permanent --remove-port=8080/tcp
sudo firewall-cmd --reload

# 端口转发
sudo firewall-cmd --permanent --add-forward-port=port=8080:proto=tcp:toaddr=10.0.0.5:toport=80

# 接口绑定 zone
sudo firewall-cmd --permanent --zone=trusted --change-interface=eth1
```

## 三、ufw（Ubuntu/Debian 默认）

```bash
sudo ufw status numbered
sudo ufw status verbose

# 开关
sudo ufw enable
sudo ufw disable
sudo ufw reset                                  # ⚠️ 清全部规则

# 加规则（自动持久化）
sudo ufw allow 22/tcp
sudo ufw allow from 10.0.0.0/24
sudo ufw allow from 10.0.0.0/24 to any port 22
sudo ufw deny from 1.2.3.4
sudo ufw limit 22/tcp                           # 内置 SYN 速率限制

# 应用 profile（预定义）
sudo ufw app list
sudo ufw allow "Nginx Full"

# 按编号删
sudo ufw delete 3

# 端口转发：ufw 自己不支持，要走 /etc/ufw/before.rules 改 NAT
```

## 四、iptables（底层，跨发行版）

```bash
# 看
sudo iptables -L -n -v --line-numbers            # 默认 filter 表
sudo iptables -t nat -L -n -v --line-numbers     # nat 表
sudo iptables -t mangle -L -n -v
sudo iptables -S                                  # 序列化（导出/diff 用）

# 加规则
sudo iptables -A INPUT -p tcp --dport 8080 -j ACCEPT
sudo iptables -I INPUT 1 -s 10.0.0.0/24 -j ACCEPT     # -I 插到第 1 条
sudo iptables -A INPUT -p tcp --dport 22 -m conntrack --ctstate NEW -m limit --limit 5/min --limit-burst 10 -j ACCEPT

# 删
sudo iptables -D INPUT 3                          # 按行号
sudo iptables -D INPUT -p tcp --dport 8080 -j ACCEPT     # 同 -A 命令

# 默认策略（**改成 DROP 前先 ACCEPT SSH，否则锁外**）
sudo iptables -P INPUT DROP

# 完全清空（⚠️ 先准备保险绳）
sudo iptables -F                                  # 清规则
sudo iptables -X                                  # 删自定义链
sudo iptables -Z                                  # 计数清零
```

## 五、NAT / 端口转发

### 场景 1：把外网 80 转到内网 10.0.0.5:8080

```bash
# 启用 IP 转发
sudo sysctl -w net.ipv4.ip_forward=1
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-forward.conf

# DNAT：到本机 80 的转给 10.0.0.5:8080
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j DNAT --to-destination 10.0.0.5:8080

# 配套 SNAT/MASQUERADE：回包走本机出（否则客户端直连 10.0.0.5 收回包）
sudo iptables -t nat -A POSTROUTING -p tcp -d 10.0.0.5 --dport 8080 -j MASQUERADE

# 允许转发
sudo iptables -A FORWARD -p tcp -d 10.0.0.5 --dport 8080 -j ACCEPT
```

### 场景 2：SNAT（让内网机器通过本机出公网）

```bash
sudo sysctl -w net.ipv4.ip_forward=1
sudo iptables -t nat -A POSTROUTING -s 10.0.0.0/24 -o eth0 -j MASQUERADE
sudo iptables -A FORWARD -s 10.0.0.0/24 -j ACCEPT
sudo iptables -A FORWARD -d 10.0.0.0/24 -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
```

## 六、nftables（现代）

```bash
sudo nft list ruleset                            # 看全部
sudo nft list table inet filter
sudo nft list chain inet filter input

# 加规则
sudo nft add rule inet filter input tcp dport 22 accept
sudo nft add rule inet filter input ip saddr 10.0.0.0/24 accept
sudo nft insert rule inet filter input position 0 tcp dport 80 accept     # 插到开头

# 计数器 + 命名集合
sudo nft add set inet filter ssh_allow '{ type ipv4_addr; }'
sudo nft add element inet filter ssh_allow '{ 10.0.0.1, 10.0.0.2 }'
sudo nft add rule inet filter input tcp dport 22 ip saddr @ssh_allow accept

# 删除
sudo nft delete rule inet filter input handle 5      # 用 `nft -a list` 看 handle

# 完全清空
sudo nft flush ruleset                                # ⚠️ 慎用
```

## 七、规则持久化

| 工具 | 持久化方法 |
|------|------------|
| **firewalld** | `--permanent` + reload；规则在 `/etc/firewalld/zones/*.xml` |
| **ufw** | 自动持久化；规则在 `/etc/ufw/user.rules` 等 |
| **iptables** | 安装 `iptables-persistent`（Debian）/ `iptables-services`（RHEL）：`sudo netfilter-persistent save` |
| **nftables** | `sudo nft list ruleset > /etc/nftables.conf` + `systemctl enable nftables` |

```bash
# iptables 一次性导入导出
sudo iptables-save > /etc/iptables/rules.v4
sudo iptables-restore < /etc/iptables/rules.v4

# Debian
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
sudo netfilter-persistent reload

# RHEL（先 mask firewalld 才能用 iptables-services）
sudo systemctl mask firewalld
sudo systemctl enable --now iptables
sudo iptables-save > /etc/sysconfig/iptables
```

## 八、conntrack 与高并发

```bash
# 看当前连接
sudo conntrack -L
sudo conntrack -L -p tcp --dport 80 | wc -l

# 容量
cat /proc/sys/net/netfilter/nf_conntrack_max
cat /proc/sys/net/netfilter/nf_conntrack_count

# 调大（连接数高 + 容器多场景容易满）
sudo sysctl -w net.netfilter.nf_conntrack_max=1048576
echo "net.netfilter.nf_conntrack_max=1048576" | sudo tee /etc/sysctl.d/99-conntrack.conf
```

> `nf_conntrack table full` 错误 → 应用层不断 5xx + 内核 kernel: nf_conntrack: table full, dropping packet。

## 九、防火墙调试套路

```bash
# 给某条规则加 LOG（写到 /var/log/syslog 或 dmesg）
sudo iptables -I INPUT -p tcp --dport 8080 -j LOG --log-prefix "FW-8080: " --log-level 4

# 看包计数（counters 涨没涨就知道命没命中规则）
sudo iptables -L -n -v --line-numbers

# 看是否能到本机
sudo tcpdump -i any -nn 'tcp port 8080'

# 跨段连通问题：从本机出 + 从目标回 全跑一遍
mtr 10.0.0.5
traceroute 10.0.0.5
```

## 十、Docker 与 iptables 的关系

Docker 会**自动改 iptables** 加 DOCKER / DOCKER-USER 等链。

```bash
sudo iptables -L DOCKER -n -v
sudo iptables -L DOCKER-USER -n -v       # 用户自定义规则放这里（不会被 docker 重置）

# 限制只允许 10.0.0.0/24 访问 docker 容器
sudo iptables -I DOCKER-USER -s 10.0.0.0/24 -j RETURN
sudo iptables -A DOCKER-USER -j DROP
```

> `firewall-cmd --zone=...` **不会**保护 Docker 端口映射；必须用 `DOCKER-USER` 链或 `iptables=false` 让 docker 不动 iptables（同时失去网络隔离）。

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `iptables -F` / `iptables -t nat -F` | 清规则；若 `INPUT` 默认策略是 DROP → **SSH 立刻断** |
| `nft flush ruleset` | 同上，nftables 风格 |
| `ufw reset` | 同上 |
| `firewall-cmd --complete-reload` | 重新加载 firewalld 包括内核模块（瞬间所有连接可能断） |
| `systemctl stop firewalld/ufw/nftables` | 关防火墙（**安全暴露**） |
| 改默认策略为 DROP 但未先 ACCEPT SSH | **远程立刻失联** |
| 误删 DOCKER 链 | 容器网络断 |

## 教训

- **远程改防火墙永远先布保险绳**：把当前规则备份到 `~/.opspub/backups/`（`iptables-save > ~/.opspub/backups/rules-$(date +%s).v4`），回滚脚本写 `~/.opspub/scripts/fw-rollback.sh`，再 `echo "bash ~/.opspub/scripts/fw-rollback.sh" | at now + 5 minutes`。改完测通了 → `atrm` 取消；改坏了 5 分钟后自动回滚。**别把脚本散落 /tmp**，用 OpsPub 统一工作区便于复盘。
- firewalld 的 `--permanent` 和 runtime 是**两套**；改完一定要 `--reload`，否则下次重启没了；或同时改两份 `firewall-cmd --runtime-to-permanent`。
- Docker 与防火墙的"双轨"是经典坑：`ufw allow` 看似没开但容器**仍然能被公网访问**（因为 docker 走 DOCKER-USER 链先）。
- nftables 的 `inet` 表同时管 IPv4 + IPv6，**不要忘加 v6 也禁掉**（一些场景 v6 默认开放比 v4 还危险）。
- 跨工具切换前**先 iptables-save 备份**：从 iptables 切 nftables、从 firewalld 切 nftables，规则迁移很容易漏。
- conntrack table full 是高并发服务器的常见隐患，**前期就调大** + 监控（node_exporter 有 `node_nf_conntrack_entries` 指标）。

---

## 12. java-jvm-tuning

```yaml
---
name: java-jvm-tuning
description: JVM 调优速查 —— jstack / jmap / jcmd / jstat / GC 日志 / heap dump / arthas。
触发词: java, jvm, gc 日志, oom, outofmemory, heap dump, jstack, jmap, jstat, jcmd, jconsole, jvisualvm, arthas, 内存泄漏, full gc, cms, g1gc, zgc, jit, java 21, java 17, java 11, openjdk, eclipse temurin, graalvm, jvm 调优, 调 jvm 参数, xmx, xms, metaspace, 元空间, java 进程吃内存, java 占 cpu, java 卡顿, java 慢, java 爆内存, 线程死锁, deadlock, springboot 起不来, springboot 挂了, 应用 oom, tomcat, jetty, jar 起不来, java 进程没了
dangerous_commands:
  - '(?i)\bjmap\s+-dump\b[^\n]*-F\b'
  - '(?:^|[\s;&|])(?:kill|killall)\s+-9\s+java\b'
  - '(?:^|[\s;&|])(?:pkill|killall)\s+(?:-9\s+)?java\b'
---
```

# java-jvm-tuning —— JVM 调优与诊断

适用：用户报"Java 进程内存爆 / CPU 飙 / Full GC 频繁 / OOM"；想"看线程栈"/"dump 堆"/"在线诊断"/"看 GC 日志"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 Java 服务状态** → `service_status(server, "<app>")`（systemd 托管的 Spring Boot/Tomcat，任何档位放行，比 `ssh_exec systemctl status` 稳）。
- **看 GC 日志 / 应用日志** → `tail_log(server, "/var/log/<app>/gc.log")` / `tail_log(server, "<app>.log")`（任何档位放行；OOM 自动 dump 的 hprof 路径也先用 `sftp_list` 确认大小再决定要不要拉）。
- **看进程占用内存** → `system_info(server)`（含负载/内存概览）+ `disk_usage(server)`（heap dump 几个 G 很容易撑爆磁盘，dump 前先看剩余空间）。
- **查端口** → `port_check(server, 8080)`（Java 应用端口在不在监听）。
- **改 JVM 启动参数（启动脚本 / systemd unit / `JAVA_OPTS` 环境文件）** → `sftp_read` 看现状 + `sftp_write` 整文件写，写完 `ssh_exec sudo systemctl daemon-reload` + 重启。
- ⚠️ `jstack`/`jmap`/`jstat`/`jcmd` 这些诊断命令本身是**只读探测**（不改服务），但仍走 `ssh_exec`（过策略档位）；`jmap -dump`/`jcmd GC.run` 会让 JVM 短暂 STW，含 `sudo` 的重启会触发**用户审批**——提前告知用户"这步会让 JVM 暂停几百毫秒/弹审批"，被拒后不要原样重试。

## 第一步：找到 Java 进程

```bash
jps -lv                                          # 列 Java 进程 + 主类 + JVM args
ps aux --sort=-%cpu | grep java | head           # 按 CPU
ps -o pid,rss,vsz,cmd --sort=-rss -C java        # 按内存
```

## 第二步：jstack（线程栈）

```bash
jstack <pid>                                     # 输出全部线程栈
jstack -l <pid>                                  # 含锁信息
jstack <pid> > stack.txt                          # 保存
```

CPU 高的排查套路：

```bash
# 1) 找 CPU 高的线程 native id
top -H -p <pid>                                  # 看 %CPU 高的子线程 PID（top 显示的是 native TID）
# 2) 转 hex
printf "%x\n" <tid>
# 3) 在 jstack 输出里搜对应 nid=0x<hex>
jstack <pid> | grep -A 30 'nid=0x<hex>'
```

死锁：

```bash
jstack <pid> | grep -A 5 deadlock
# 或
jcmd <pid> Thread.print | grep -A 5 deadlock
```

## 第三步：jmap（堆相关）

```bash
# 堆概览
jmap -heap <pid>                                 # 堆参数 + 各区使用率
jmap -histo:live <pid> | head -30                # 类实例数 + 字节（:live 触发一次 Full GC 看存活对象）
jmap -histo <pid> > histo.txt

# Heap dump（**业务停顿，慎用**）
jmap -dump:format=b,live,file=/tmp/heap.hprof <pid>
# 不带 :live 不触发 GC，但 dump 大且含死对象

# 替代（推荐）：jcmd 风格
jcmd <pid> GC.heap_dump /tmp/heap.hprof
```

分析 hprof：

- **Eclipse MAT**（最佳）：本地 GUI，找泄漏
- **VisualVM**：JDK 自带
- **jhat**（已弃用）

## 第四步：jcmd（现代统一工具，推荐）

```bash
jcmd <pid> help                                  # 所有可用命令

# GC
jcmd <pid> GC.run                                # System.gc() 触发
jcmd <pid> GC.heap_info
jcmd <pid> GC.class_histogram

# Thread
jcmd <pid> Thread.print

# Heap dump
jcmd <pid> GC.heap_dump /tmp/heap.hprof

# JFR（Java Flight Recorder，性能 profiling）
jcmd <pid> JFR.start duration=60s filename=/tmp/recording.jfr
jcmd <pid> JFR.dump filename=/tmp/dump.jfr name=<recording-name>
jcmd <pid> JFR.stop name=<recording-name>

# Native memory tracking（先用 -XX:NativeMemoryTracking=summary 启动）
jcmd <pid> VM.native_memory summary
jcmd <pid> VM.native_memory baseline
jcmd <pid> VM.native_memory summary.diff

# JVM 参数（运行中）
jcmd <pid> VM.flags
jcmd <pid> VM.system_properties
jcmd <pid> VM.command_line
```

## 第五步：jstat（GC 实时）

```bash
# 每 1s 一次，共 10 次
jstat -gc <pid> 1000 10
jstat -gcutil <pid> 1000                         # 百分比版本（**推荐**）

# 关键列（gcutil）：
# S0  S1   E    O    M    CCS  YGC  YGCT FGC  FGCT  GCT
# (Survivor0/1)(Eden)(Old)(Metaspace)(...)
# YGC = young GC 次数；YGCT = young GC 总耗时（秒）
# FGC = full GC 次数；FGCT = full GC 总耗时（秒）

# 持续 Full GC + Old 区接近 100% = 内存泄漏，要 dump
```

## 第六步：GC 日志

启动参数（**生产强烈推荐**开 GC 日志）：

```bash
# Java 8
-XX:+PrintGCDetails -XX:+PrintGCDateStamps -XX:+UseGCLogFileRotation \
    -XX:NumberOfGCLogFiles=5 -XX:GCLogFileSize=100M -Xloggc:/var/log/myapp/gc.log

# Java 9+（unified logging）
-Xlog:gc*:file=/var/log/myapp/gc.log:time,uptime,level,tags:filecount=5,filesize=100M
```

分析工具：

- **GCEasy**（在线 https://gceasy.io，上传 gc.log）
- **GCViewer**（开源 GUI）

## 第七步：常用 JVM 参数

```bash
# 堆大小（生产显式设，别让 JVM 猜）
-Xms4g -Xmx4g                # 初始 = 最大（避免动态扩容停顿）

# 元空间（Java 8+）
-XX:MetaspaceSize=256m -XX:MaxMetaspaceSize=512m

# 直接内存（NIO / Netty）
-XX:MaxDirectMemorySize=1g

# 选 GC（按 JDK 版本和场景）
-XX:+UseG1GC                  # Java 8+ 推荐（balanced）
-XX:+UseZGC                   # Java 17+ 大堆低停顿
-XX:+UseShenandoahGC          # 同上替代
-XX:+UseParallelGC            # 批处理高吞吐

# G1 调优
-XX:MaxGCPauseMillis=200      # 目标停顿
-XX:G1HeapRegionSize=16m

# OOM 时自动 dump
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/log/myapp/

# OOM 后执行命令（重启 / 通知）
-XX:OnOutOfMemoryError="kill -9 %p"
```

## 第八步：Arthas（在线诊断神器）

阿里开源，运行时无侵入，适合**线上不能停**的排查。

```bash
# 装
curl -O https://arthas.aliyun.com/arthas-boot.jar
java -jar arthas-boot.jar
# 选要 attach 的 Java 进程编号

# 进入 arthas shell 后：
dashboard                       # 实时 dashboard（CPU / 线程 / 内存）
thread -n 5                     # 最忙 5 个线程
thread <tid>                    # 单线程栈
sc -d com.example.MyClass       # class 详情
sm com.example.MyClass          # 方法列表
jad com.example.MyClass         # 反编译
watch com.example.MyService myMethod '{params, returnObj, throwExp}' -x 3
trace com.example.MyService myMethod    # 方法内调用链耗时
monitor -c 5 com.example.MyService myMethod    # 监控调用统计
profiler start --duration 30                   # async-profiler 集成
profiler stop --file /tmp/profile.html
```

## 第九步：故障速查

### OOM: Java heap space
- Old 区满，存活对象 > 堆
- 行动：heap dump → MAT 找 dominator → 定位泄漏 reference
- 临时缓解：调大 `-Xmx`

### OOM: Metaspace
- 类加载过多（动态生成类、热部署）
- 行动：`-XX:MaxMetaspaceSize=` 调大；查 ClassLoader 泄漏

### OOM: Direct buffer memory
- NIO / Netty 用 DirectBuffer 不释放
- 行动：`-XX:MaxDirectMemorySize=` 调大；查 Netty `ByteBuf` 没 release

### OOM: unable to create new native thread
- 线程数超 ulimit / 内核限制
- 行动：`ulimit -u` + `/proc/sys/kernel/threads-max`；查线程池 leak

### Full GC 频繁
- `jstat -gcutil` 看 Old 区涨速 + Eden / Survivor 流入老年代速度
- 多半是大对象直接进 Old / 业务量涨没扩容 / **内存泄漏**

### CPU 100%
- `top -H` 找线程 → printf %x → `jstack` 搜 nid
- 多半是死循环 / JIT 编译 / 极频繁 GC

## 路径速查表

| 内容 | 路径 |
|------|------|
| GC 日志 | 启动参数指定，常见 `/var/log/<app>/gc.log` |
| Heap dump | OOM 时 `-XX:HeapDumpPath=` 指定（推荐应用日志目录） |
| JFR recording | `jcmd ... JFR.start filename=` 指定 |
| arthas | `~/.arthas/` |
| OpenJDK 二进制 | `/usr/lib/jvm/<jdk-name>/bin/`（Debian） / `/usr/lib/jvm/jre/bin/`（RHEL） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `kill -9 <java-pid>` | 不写 graceful shutdown 钩子 → 内存中数据丢；连接强断 |
| `jmap -dump -F` | force 模式，**完全 STW（stop-the-world）阻塞进程**；只在崩溃前不得已用 |
| `jcmd <pid> GC.run` 生产高峰 | 触发 Full GC，多核心 STW（可能数百毫秒） |
| arthas `redefine` 在线 patch class | 替换类字节码，**生产改完忘了同步代码** = 重启即丢 |
| arthas `watch` 用 `-x 5` 深层渲染 + 高 QPS | 拷贝大量对象拖死 JVM |

## 教训

- **生产 JVM 必开 GC 日志 + OOM 自动 dump** —— 出事故没有 hprof 等于盲人摸象。
- `-Xms = -Xmx` 避免动态扩容停顿（容器内更要这样）。
- 容器里 Java 默认**只看到宿主 CPU/内存数**（Java 10+ 已修复 cgroup 感知）；用 `+UnlockExperimentalVMOptions +UseCGroupMemoryLimitForHeap` 或升 JDK11+。
- `jmap -dump:live` 会**触发 Full GC**，生产高峰慎用；用 `jcmd ... GC.heap_dump` 行为相同。
- `XX:OnOutOfMemoryError="kill -9 %p"` 配合 systemd `Restart=on-failure` = 自动重启策略（OOM 不试图恢复，直接重启）。
- `jstack` 输出**对人不友好**，复制到 `https://fastthread.io` 上传分析。
- Java 8 的 CMS GC 已被 G1 取代；新部署优先 G1 / ZGC（Java 15+ 默认参数）。

---

## 13. jenkins-runner

```yaml
---
name: jenkins-runner
description: Jenkins / GitLab Runner / Gitea Actions Runner 速查 —— 安装/节点注册/流水线调试/workspace 清理。
触发词: jenkins, jenkins agent, jenkins job, jenkinsfile, pipeline, gitlab runner, gitlab-runner, ci/cd, ci 流水线, cd 流水线, 持续集成, 持续交付, gitea runner, act runner, jenkins runner, artifact, workspace, jenkins lts, jenkins 装, 装 jenkins, 部署 jenkins, jenkins 起不来, jenkins 慢, jenkins 重启, 流水线失败, 构建失败, build failed, executor, 节点离线, runner 离线, runner 注册, runner 卸载, shared runner, group runner, project runner, jenkins 挂了, 构建一直失败, 作业卡住, 作业卡 pending, runner 连不上
# 注：去掉了 ci / cd 两字短词 —— evaluate_skills 是 substring 匹配，
# 用户消息里随便一段 `cd43c3dd` / `:32279/cd1234` 都会误命中
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/jenkins(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/jenkins_home(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/gitlab-runner(?:\s|/|$)'
  - '(?i)\bgitlab-runner\s+(?:unregister|uninstall)\b'
---
```

# jenkins-runner —— CI/CD 运行器运维

适用：用户自建 Jenkins / GitLab Runner / Gitea Actions Runner；想"装 runner"/"作业卡 pending"/"workspace 占地方"/"agent 离线"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Jenkins 优先用 `install_app(server, "jenkins")`**（在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。Runner（gitlab-runner / gitea actions runner）目录里没有 → 仍按下面手动装。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 Jenkins / Runner 服务状态 | `service_status(server, "jenkins")` / `service_status(server, "gitlab-runner")` | systemctl status |
| 看 Web / agent 端口 | `port_check(server, 8080)` / `port_check(server, 50000)` | ss -tlnH |
| 看 Runner 日志 | `tail_log(server, "/var/log/jenkins/jenkins.log")`（docker 部署用 `ssh_exec docker logs jenkins`） | tail -n / journalctl |
| 改 Runner 配置 | `sftp_read` 看现状 + `sftp_write(server, "/etc/gitlab-runner/config.toml", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，写完 `ssh_exec sudo gitlab-runner restart` / `sudo systemctl restart jenkins`；docker 部署的 Jenkins 看日志走 `ssh_exec docker logs jenkins`。

⚠️ runner 注册/注销、restart、删数据目录、清 workspace 都会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## 选型

| 工具 | 配置方式 | 适合 |
|------|---------|------|
| **Jenkins** | Web UI + Jenkinsfile + Plugin 生态 | 老牌、插件多、流水线灵活；初次配置略重 |
| **GitLab Runner** | toml + GitLab CI yaml | GitLab 一体化；执行器选项多 |
| **Gitea Actions Runner** (act_runner) | yaml（GitHub Actions 兼容） | Gitea 内置；轻量 |
| **Drone** | yaml | 容器化简洁；社区版功能够 |
| **GitHub Actions self-hosted runner** | yaml | GitHub 用户首选 |

## 一、Jenkins

### 安装（推荐 Docker LTS）

```bash
docker volume create jenkins_home
docker run -d \
    --name jenkins \
    --restart=unless-stopped \
    -p 8080:8080 -p 50000:50000 \
    -v jenkins_home:/var/jenkins_home \
    -v /var/run/docker.sock:/var/run/docker.sock \
    jenkins/jenkins:lts
```

> 把 `docker.sock` 挂进去 = Jenkins job 可以跑 `docker` 命令（要装 docker CLI 插件 / 用 docker workflow plugin）。**安全风险**：任何 Jenkins job 都能拿宿主 root。

### 初始密码 & 路径

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

| 内容 | 路径 |
|------|------|
| 数据 / 配置 | `/var/jenkins_home/`（容器内） |
| Job 配置 | `/var/jenkins_home/jobs/<job>/config.xml` |
| 构建历史 | `/var/jenkins_home/jobs/<job>/builds/<n>/` |
| Workspace | `/var/jenkins_home/workspace/<job>/` |
| 用户 | `/var/jenkins_home/users/` |
| 凭据 | `/var/jenkins_home/credentials.xml` |
| 日志 | `docker logs jenkins` 或 `/var/jenkins_home/logs/` |

### 备份

```bash
# 简单：tar 整个 volume（落 OpsPub 统一工作区 ~/.opspub/backups，别散落随机目录）
docker run --rm -v jenkins_home:/src -v ~/.opspub/backups:/dst alpine \
    tar czf /dst/jenkins-$(date +%F).tgz -C /src .

# 推荐：装 ThinBackup / Configuration as Code (JCasC) 插件，定期跑 + 走 git
```

### 流水线（Jenkinsfile 声明式）

```groovy
pipeline {
    agent any
    environment {
        REGISTRY_CRED = credentials('docker-registry')   // 从凭据库取
    }
    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }
    stages {
        stage('Build') {
            steps {
                sh 'mvn clean package -DskipTests'
                archiveArtifacts artifacts: 'target/*.jar'
            }
        }
        stage('Test') {
            steps {
                sh 'mvn test'
            }
            post {
                always { junit 'target/surefire-reports/*.xml' }
            }
        }
        stage('Deploy') {
            when { branch 'main' }
            steps {
                sh '''
                    docker login -u $REGISTRY_CRED_USR -p $REGISTRY_CRED_PSW
                    docker build -t myrepo/app:$BUILD_NUMBER .
                    docker push myrepo/app:$BUILD_NUMBER
                '''
            }
        }
    }
    post {
        failure {
            mail to: 'oncall@example.com', subject: "Build ${env.BUILD_NUMBER} failed"
        }
    }
}
```

### Agent 节点

```bash
# 远端机器装 agent.jar + java（先在 Master UI 创建节点拿 secret）
curl -sO http://jenkins:8080/jnlpJars/agent.jar
java -jar agent.jar -url http://jenkins:8080/ -secret <secret> -name slave-1 -workDir /home/jenkins
```

或在 Docker 里跑 `jenkins/inbound-agent`（jnlp 模式）。

### CLI

```bash
JENKINS_URL=http://jenkins:8080
curl -sLO $JENKINS_URL/jnlpJars/jenkins-cli.jar
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> who-am-i
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> list-jobs
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> build <job> -p PARAM=value
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> safe-restart
```

## 二、GitLab Runner

### 安装

```bash
# Debian/Ubuntu
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt install gitlab-runner

# 启动 / 状态
sudo systemctl status gitlab-runner
sudo gitlab-runner --version
```

### 注册

```bash
sudo gitlab-runner register \
    --non-interactive \
    --url "https://gitlab.example.com/" \
    --token "<runner_token>" \
    --executor "docker" \
    --docker-image "alpine:latest" \
    --description "my-runner" \
    --tag-list "docker,linux" \
    --run-untagged="false" \
    --locked="false"

# 也可以 shell / kubernetes / docker-autoscaler 等 executor
```

### 配置

```toml
# /etc/gitlab-runner/config.toml
concurrent = 5                              # 全 runner 并发上限
check_interval = 0
log_level = "info"

[[runners]]
  name = "my-runner"
  url = "https://gitlab.example.com/"
  token = "..."
  executor = "docker"
  [runners.docker]
    tls_verify = false
    image = "alpine:latest"
    privileged = false                      # ⚠️ 开了 = 容器内可拿宿主 root
    pull_policy = ["if-not-present"]
    volumes = ["/cache", "/var/run/docker.sock:/var/run/docker.sock"]
    shm_size = 0
  [runners.cache]
    Type = "s3"
    [runners.cache.s3]
      ServerAddress = "minio.example.com:9000"
      AccessKey = "xxx"
      SecretKey = "xxx"
      BucketName = "gitlab-runner-cache"
```

### 操作

```bash
sudo gitlab-runner list
sudo gitlab-runner verify                   # 验证所有 runner 与 GitLab 的连接
sudo gitlab-runner restart
sudo gitlab-runner unregister --name "my-runner"
sudo gitlab-runner --debug run              # 前台调试启动
```

### 路径

| 内容 | 路径 |
|------|------|
| 配置 | `/etc/gitlab-runner/config.toml` |
| 数据 | `/home/gitlab-runner/`（默认 user） |
| Build dir | `/builds/<group>/<repo>/<job>/` |
| 日志 | `journalctl -u gitlab-runner` |
| Cache | 按 cache 配置（local / s3） |

### `.gitlab-ci.yml`（最小）

```yaml
stages: [build, test, deploy]

variables:
  DOCKER_DRIVER: overlay2

build:
  stage: build
  tags: [docker]
  image: golang:1.22
  script:
    - go build -o app
  artifacts:
    paths: [app]
    expire_in: 1 week

test:
  stage: test
  tags: [docker]
  image: golang:1.22
  script:
    - go test ./...

deploy:
  stage: deploy
  tags: [docker]
  only: [main]
  script:
    - echo "deploy here"
```

## 三、Gitea Actions Runner（act_runner）

```bash
docker run -d --name gitea-runner \
    --restart=unless-stopped \
    -e GITEA_INSTANCE_URL=https://git.example.com \
    -e GITEA_RUNNER_REGISTRATION_TOKEN=<token> \
    -e GITEA_RUNNER_NAME=runner-1 \
    -e GITEA_RUNNER_LABELS=ubuntu-latest:docker://ubuntu:22.04,self-hosted \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v ./runner-data:/data \
    gitea/act_runner:latest
```

Workflow yaml 与 GitHub Actions 兼容（90%）：

```yaml
# .gitea/workflows/build.yml
name: Build
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "hello $GITEA_ACTOR"
```

## 四、Workspace 清理

CI 系统 workspace 是占地方大头：

```bash
# Jenkins
docker exec jenkins du -sh /var/jenkins_home/workspace/*

# GitLab Runner
du -sh /home/gitlab-runner/builds/

# 清理（按需）
docker exec jenkins find /var/jenkins_home/workspace -mindepth 1 -maxdepth 1 -mtime +30 -exec rm -rf {} \;
```

Jenkins 推荐：每个 job 设置 `cleanWs()` post-step；保留构建数限制（Discard old builds）。

## 五、常见问题

### Q1: Jenkins agent 一直 offline
- master 与 agent 网络不通（50000 端口或 jnlp 端口）
- agent 节点 java 版本不匹配（11+ 推荐）
- agent.jar 版本与 master 不一致

### Q2: GitLab runner 作业卡 pending
- runner 没注册到这个项目（或注册了但 lock 了/tag 不匹配）
- `sudo gitlab-runner verify` 查
- 作业指定了 `tags: [docker]` 但 runner 没这个 tag

### Q3: Docker executor 报 "no space left on device"
- 宿主盘满 → `docker system df`
- 加大 runner cache 清理：`docker system prune -af` 加进 cron

### Q4: 构建很慢，每次都拉镜像
- `pull_policy = ["if-not-present"]` 让 runner 不重复拉
- 私有 registry pull-through proxy（如 Harbor）

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm -rf /var/jenkins_home` / `/var/lib/jenkins` | **删 Jenkins 全部 jobs / users / credentials / builds** |
| `rm -rf /etc/gitlab-runner` | 删 runner 配置（token / cache 配置丢） |
| `gitlab-runner unregister --all-runners` | 从 GitLab 取消所有 runner 注册 |
| Jenkins **凭据导出** | 含明文密码 / token / SSH key |
| docker executor `privileged = true` | 容器内 = 宿主 root（**慎开**，除非要构建容器内的容器） |
| 直接清空 workspace 而 job 还在跑 | 当前构建挂掉 |
| Jenkins Script Console | Groovy 控制台 = 直接进程内代码执行（**任何东西都能改**） |

## 教训

- Jenkins 备份**包含 secret**（含解密的私钥 / API token），保存策略 = 备份与 Jenkins 数据**同等级**保管。
- Jenkinsfile **走 git** 才有审计；Web UI 直接改的 freestyle job 出事故没法追溯。
- GitLab Runner `concurrent` 设太高 + 都是 docker executor = 一次性能把宿主磁盘 / 内存吃满。
- `privileged = true` 是**最后手段**；多数"构建容器内容器"场景可以用 BuildKit / kaniko / buildah 替代。
- Self-hosted runner 给 public repo 用是**安全炸弹**：任何 PR 都能跑你的脚本；用 `if: github.repository_owner == 'me'` 限制或干脆只用于 private repo。
- CI cache 用对象存储（S3/MinIO）后**别忘了配 lifecycle 自动清理**，否则 cache bucket 半年能炸 TB 级。

---

## 14. kafka-ops

```yaml
---
name: kafka-ops
description: Kafka 运维速查 —— topic / consumer group / lag / KRaft 模式 / partition rebalance。
触发词: kafka, 消息队列, kafka topic, consumer group, lag, 消费者组, kraft, zookeeper, partition, replication factor, isr, kafka-console, kafka 装, 装 kafka, 部署 kafka, kafka 3.x, kraft 模式, 抛弃 zk, kafka-topics, kafka-consumer-groups, kafka-configs, 消费滞后, lag 太大, 消费阻塞, rebalance, partition reassignment, 副本同步, isr 缩小, controller, broker 起不来, broker 失联, kafka ui, redpanda, kafka 挂了, kafka 连不上, 消费堆积, 消息消费不动
dangerous_commands:
  - '(?i)\bkafka-topics(?:\.sh)?\b[^\n]*--delete\b'
  - '(?i)\bkafka-consumer-groups(?:\.sh)?\b[^\n]*--reset-offsets\b[^\n]*--execute\b'
  - '(?i)\bkafka-consumer-groups(?:\.sh)?\b[^\n]*--delete\b'
  - '(?i)\bkafka-configs(?:\.sh)?\b[^\n]*--delete-config\b[^\n]*\bretention\b'
  # kafka-storage format 在已有集群上重跑 = 重格式化 KRaft 元数据日志，整个集群元数据丢失
  - '(?i)\bkafka-storage(?:\.sh)?\s+format\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:/var/lib/kafka|/data/kafka|/kafka)(?:\s|/|$)'
---
```

# kafka-ops —— Kafka 运维

适用：用户运维 Apache Kafka；想"消费者 lag 大"/"加 topic"/"看分区/副本/ISR"/"切到 KRaft 抛弃 ZK"/"备份/迁移"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Kafka 优先用 `install_app(server, "kafka")`**（Kafka 在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义场景 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 broker 服务状态 | `service_status(server, "kafka")` | systemctl status |
| 看 broker 日志 | `tail_log(server, "<kafka-home>/logs/server.log")` | tail -n |
| 查 broker / controller 端口 | `port_check(server, 9092)` / `port_check(server, 9093)` | ss -tlnH |
| 改 server.properties | `sftp_read` 看现状 + `sftp_write(server, "/etc/kafka/server.properties", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，写完 `ssh_exec sudo systemctl restart kafka`；后文 `kafka-*.sh` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ topic / consumer-group / configs 的写操作（create/delete/alter、reset-offsets、reassign）和 restart 会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试，改只读探查（`--list`/`--describe`）或问用户。

## 第一步：环境

CLI 工具一般在 `<kafka>/bin/`，命令名以 `kafka-*.sh` 或 `kafka-*`（Confluent 包）。

```bash
# 给 bin/ 加入 PATH（按实际路径改）
export PATH=$PATH:/opt/kafka/bin
kafka-topics.sh --version
```

参数约定：

```bash
BOOTSTRAP=--bootstrap-server localhost:9092
```

## 第二步：Topic

```bash
# 列
kafka-topics.sh $BOOTSTRAP --list

# 详情（副本/ISR/分区）
kafka-topics.sh $BOOTSTRAP --describe --topic mytopic

# 创建
kafka-topics.sh $BOOTSTRAP --create --topic mytopic \
    --partitions 6 --replication-factor 3 \
    --config retention.ms=604800000 \
    --config segment.bytes=1073741824

# 改配置
kafka-configs.sh $BOOTSTRAP --alter \
    --entity-type topics --entity-name mytopic \
    --add-config retention.ms=259200000

# 加分区（**只能加不能减**）
kafka-topics.sh $BOOTSTRAP --alter --topic mytopic --partitions 12

# 删除（要 broker 配置 delete.topic.enable=true；默认 true）
kafka-topics.sh $BOOTSTRAP --delete --topic mytopic     # ⚠️ 走审批
```

### Topic 关键配置

| 配置 | 默认 | 含义 |
|------|------|------|
| `retention.ms` | 7d | 保留时长 |
| `retention.bytes` | -1 | 按大小保留（任一触发） |
| `segment.bytes` | 1GB | 单 segment 文件大小 |
| `cleanup.policy` | `delete` / `compact` | 过期删除 / key-based 压缩 |
| `min.insync.replicas` | 1 | 写入需要的最小 ISR（保证 durability） |
| `unclean.leader.election.enable` | false（推荐） | 是否允许不 in-sync 的副本选主（**生产关**） |

## 第三步：Producer / Consumer 测试

```bash
# 生产
kafka-console-producer.sh $BOOTSTRAP --topic mytopic
> 输入消息按回车

# 消费（从头）
kafka-console-consumer.sh $BOOTSTRAP --topic mytopic --from-beginning

# 消费指定 group
kafka-console-consumer.sh $BOOTSTRAP --topic mytopic --group mygroup
```

## 第四步：Consumer Group / Lag

```bash
# 列所有 group
kafka-consumer-groups.sh $BOOTSTRAP --list

# 详情：lag / offset / current consumer
kafka-consumer-groups.sh $BOOTSTRAP --describe --group mygroup
# CURRENT-OFFSET / LOG-END-OFFSET / LAG / CONSUMER-ID / HOST

# 删 group（仅当无活跃消费者）
kafka-consumer-groups.sh $BOOTSTRAP --delete --group oldgroup

# Reset offset（⚠️ 走审批；改消费位点 = 重消费 / 跳过消息）
kafka-consumer-groups.sh $BOOTSTRAP --reset-offsets \
    --group mygroup --topic mytopic \
    --to-earliest --execute             # 从头
    # 或 --to-latest / --to-datetime '2024-01-01T00:00:00.000' / --shift-by -1000
```

> Lag 持续涨 = 消费跟不上：① 加并发（增分区 + 消费者实例） ② 优化消费者代码 ③ 网络 / 反序列化 / 下游 DB 瓶颈。

## 第五步：Broker / Cluster

```bash
# 看 broker 列表（KRaft / ZK 模式都行）
kafka-metadata-shell.sh --snapshot /tmp/kraft-controller-logs/__cluster_metadata-0/00000000000000000000.log
# 或 zookeeper（ZK 模式）
zookeeper-shell.sh localhost:2181 ls /brokers/ids

# broker 配置
kafka-configs.sh $BOOTSTRAP --describe --entity-type brokers --entity-name 0
kafka-configs.sh $BOOTSTRAP --alter --entity-type brokers --entity-name 0 \
    --add-config log.cleaner.dedupe.buffer.size=536870912

# 分区状态（看 leader / ISR）
kafka-topics.sh $BOOTSTRAP --describe --topic __consumer_offsets
```

### ISR（In-Sync Replicas）

```bash
# 列 under-replicated（ISR < replica.factor）
kafka-topics.sh $BOOTSTRAP --describe --under-replicated-partitions

# 列没有 preferred leader 的（重启后偏离）
kafka-topics.sh $BOOTSTRAP --describe --under-min-isr-partitions

# 平衡 leader（让 preferred leader 重新当选）
kafka-leader-election.sh $BOOTSTRAP --election-type PREFERRED --all-topic-partitions
```

## 第六步：Partition reassignment（扩缩容）

```bash
# 1) 列出要重新分配的 topic
cat > topics.json <<EOF
{"topics":[{"topic":"mytopic"}], "version":1}
EOF

# 2) 生成 plan（给新 broker list）
kafka-reassign-partitions.sh $BOOTSTRAP --generate \
    --topics-to-move-json-file topics.json \
    --broker-list "1,2,3,4"
# 把 proposed 部分存为 reassign.json

# 3) 执行
kafka-reassign-partitions.sh $BOOTSTRAP --execute --reassignment-json-file reassign.json

# 4) 监控进度
kafka-reassign-partitions.sh $BOOTSTRAP --verify --reassignment-json-file reassign.json
```

> ⚠️ reassignment 会**复制大量数据**到新 broker，会饱和网络与磁盘 —— 用 `--throttle 50000000`（B/s）限速。
>
> 临时 plan 文件（`topics.json` / `reassign.json`）建议落 OpsPub 统一工作区 `~/.opspub/tmp/`，别散落在当前目录或 `/tmp`；执行用的脚本放 `~/.opspub/scripts/`，便于审计回溯。

## 第七步：KRaft 模式（去 ZooKeeper）

3.3+ KRaft 已 production-ready；4.0 起强制 KRaft。

```bash
# 格式化 storage（一次性）
kafka-storage.sh format -t <cluster-id> -c /etc/kafka/kraft/server.properties

# 启动（同 broker）
kafka-server-start.sh /etc/kafka/kraft/server.properties

# 拓扑查看
kafka-metadata-shell.sh --snapshot /var/lib/kafka/__cluster_metadata-0/*.log
```

`server.properties` 关键参数：

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
listeners=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
inter.broker.listener.name=PLAINTEXT
controller.listener.names=CONTROLLER
log.dirs=/var/lib/kafka/kraft-logs
```

## 第八步：备份 / 迁移

| 方案 | 用途 |
|------|------|
| **MirrorMaker 2** | 跨集群复制（DR / 迁移） |
| **kafka-dump-log.sh** | 导出 segment 内容（调试，不是备份） |
| **Confluent Replicator** | 企业版 |
| **文件系统快照** | 不推荐（要 broker 停） |

### MirrorMaker 2 一键

```bash
# mm2.properties
clusters = src, dst
src.bootstrap.servers = src-kafka:9092
dst.bootstrap.servers = dst-kafka:9092
src->dst.enabled = true
src->dst.topics = .*

connect-mirror-maker.sh mm2.properties
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 二进制 | `<kafka-home>/bin/` |
| 配置 | `<kafka-home>/config/server.properties` 或 `/etc/kafka/server.properties` |
| 数据 (log.dirs) | `/var/lib/kafka/` / `/data/kafka/` |
| 日志 | `<kafka-home>/logs/` |
| ZooKeeper 数据（ZK 模式） | `/var/lib/zookeeper/` |
| systemd | `kafka` / `confluent-kafka` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `kafka-topics --delete` | 删 topic + 数据（取决于 delete.topic.enable） |
| `kafka-consumer-groups --reset-offsets --execute` | **重新消费 / 跳过消息**，业务影响巨大 |
| `kafka-configs --delete-config retention.*` 然后默认 7d | 数据被加速过期清掉 |
| `rm -rf` log.dirs | 删 broker 数据（**所有数据丢**） |
| `unclean.leader.election.enable=true` 加上突发故障 | 选出 out-of-sync 副本当 leader（**数据丢**） |
| `min.insync.replicas=1` 同时 acks=all | 等于 acks=1，单点失效就丢数据 |
| 误删 `__consumer_offsets` 内置 topic | 所有 consumer group 状态丢 |
| reassignment 不限速 | 网络饱和，业务延迟飙升 |

## 教训

- **生产**：`min.insync.replicas=2` + `replication.factor=3` + `acks=all` —— durability 与可用性的甜点。
- **永远不要开** `unclean.leader.election.enable=true`，宁可暂时不可写也不丢数据。
- 分区数 = 消费者并发上限（一个 partition 只能被 group 内一个 consumer 消费）；规划期就把 partition 设足，**事后只能加不能减**。
- `reset-offsets` 是核武器，做之前**停消费者** + 在测试环境演练过 + 保留备份位点。
- KRaft 模式起来后**记住 cluster-id**（kafka-storage format 输出的）：恢复 / 加新节点都要用它。
- `__consumer_offsets` 是内置 topic，**不要删**；它存所有 consumer group 的 offset。
- MirrorMaker 2 跨集群同步**默认带 group offset 翻译**，DR 切换业务方零感知。

---

## 15. kubernetes-basics

```yaml
---
name: kubernetes-basics
description: Kubernetes 运维基础速查 —— kubectl 高频 / helm / 调试 / 资源 yaml / namespace / context。
触发词: kubernetes, k8s, kubectl, helm, kubelet, pod, deployment, namespace, ingress, service, configmap, secret, kube-system, k3s, k0s, kubeadm, k8s 起不来, pod 起不来, crashloopbackoff, imagepullbackoff, oomkilled, pending pod, evicted, node not ready, ingress 不通, svc 不通, dns 解析失败, coredns, kubeconfig, k8s 节点, k8s 集群, helm 装, helm 卸载, kubectl 描述, kubectl describe, kubectl logs, kubectl exec, pv pvc, storage class, hpa, daemonset, statefulset
dangerous_commands:
  - '(?i)\bkubectl\s+delete\s+(?:namespace|ns)\b[^\n]*(?:kube-system|kube-public|default|production|prod)\b'
  - '(?i)\bkubectl\s+delete\s+(?:--all-namespaces|-A)\s+(?:--all|--force)\b'
  - '(?i)\bkubectl\s+delete\s+(?:pod|po)\b[^\n]*--grace-period\s*=\s*0\b[^\n]*--force\b'
  - '(?i)\bkubectl\s+drain\b[^\n]*--delete-emptydir-data\b[^\n]*--force\b'
  - '(?i)\bhelm\s+uninstall\b[^\n]*(?:--namespace\s+(?:production|prod|kube-system)|-n\s+(?:production|prod|kube-system))'
  - '(?:^|[\s;&|])kubeadm\s+reset\b'
  # 删 etcd 数据目录 = 整集群状态丢失，无快照不可恢复（正文路径表 + 危险清单对应项）
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/etcd(?:\s|/|$)'
---
```

# kubernetes-basics —— K8s 运维基础

适用：用户报"pod 起不来"/"deployment 不滚动"/"service 访问不到"/"helm 装的 chart 怎么改"/"k3s 节点没注册上"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 kubelet/containerd/k3s 是否在跑** → `service_status(server, "kubelet")` / `service_status(server, "k3s")`（任何档位放行，比 `ssh_exec systemctl status` 稳）。
- **看 NodePort 是否被监听** → `port_check(server, 30080)`。
- **看节点磁盘**（kubelet 因磁盘压力 evict pod 很常见）→ `disk_usage(server, "/var/lib")`。
- **编辑 manifest / kubeconfig** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell heredoc 转义坑），写完 `ssh_exec kubectl apply -f`。
- ⚠️ `kubectl get/describe/logs` 是只读判定；但 `kubectl delete` / `drain` / `apply` / `rollout` / `helm install|uninstall` 是写操作，会触发**用户审批**——提前告知用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试，改只读探查或询问用户。
- 注：kubectl 命令本身一般不需 `sudo`（凭 kubeconfig 鉴权），但删 namespace/pod、drain 节点等仍受策略档位约束。

## 第一步：kubectl context

```bash
kubectl config view                                # 看所有 context
kubectl config get-contexts
kubectl config current-context
kubectl config use-context <name>                  # 切 context
kubectl config set-context --current --namespace=mynamespace   # 当前 ctx 默认 ns

# kubeconfig 文件位置
echo $KUBECONFIG                                   # 多个用 ":" 分隔
ls ~/.kube/config
```

> ⚠️ **生产/预发/测试不同 cluster 用不同 KUBECONFIG**；混在一个 config 容易切错。

## 第二步：常用查询

```bash
kubectl get pod                                    # 当前 ns
kubectl get pod -A                                 # 所有 ns
kubectl get pod -o wide                            # 含节点 IP
kubectl get pod -l app=myapp                       # label selector
kubectl get pod --field-selector status.phase=Running
kubectl get pod -w                                 # watch

# 多资源类型
kubectl get all                                    # pod + svc + deploy + rs (当前 ns)
kubectl get all,ingress,configmap,secret -A

# yaml / json
kubectl get pod mypod -o yaml
kubectl get pod mypod -o jsonpath='{.status.podIP}'

# 排序
kubectl get pod --sort-by=.metadata.creationTimestamp
kubectl get pod --sort-by=.status.containerStatuses[0].restartCount
```

## 第三步：调试

```bash
kubectl describe pod mypod                         # 事件 + 状态详细
kubectl logs mypod                                 # 主容器
kubectl logs mypod -c sidecar                      # 多容器
kubectl logs mypod --previous                      # 上一次容器（OOMKilled 后看这）
kubectl logs -f --tail=200 mypod
kubectl logs -l app=myapp --max-log-requests=10    # label 选

kubectl exec -it mypod -- sh                       # 进容器
kubectl exec -it mypod -c sidecar -- sh
kubectl exec mypod -- ls /app

kubectl port-forward pod/mypod 8080:8080           # 本地访问 pod 端口
kubectl port-forward svc/mysvc 8080:80             # 通过 service
kubectl port-forward -n monitoring svc/grafana 3000

kubectl cp mypod:/path/file ./file                 # 文件拷出
kubectl cp ./file mypod:/path/

kubectl top pod                                    # 资源用量（需 metrics-server）
kubectl top node
```

`kubectl describe` **是排障最重要的命令** —— 底部 Events 段会列出近期所有调度 / 拉镜像 / 启动事件。

## 第四步：事件 + 节点

```bash
kubectl get events --sort-by='.lastTimestamp' -A | tail -50
kubectl get events --field-selector type=Warning

kubectl get node
kubectl describe node <node>                       # 节点详情：容量 / 已分配 / 条件
kubectl get node -o wide                           # IP / 内核版本
```

## 第五步：常见 pod 故障

| 状态 | 原因 | 排查 |
|------|------|------|
| `Pending` | 没节点能调度 / 资源不足 / PVC 没就绪 | `describe pod` 看 Events |
| `ContainerCreating` | 拉镜像中 / volume 挂载中 | 等；超 5 分钟看 `describe` |
| `ImagePullBackOff` | 镜像拉不下来 | 私库认证 / 网络 / 镜像名错 |
| `CrashLoopBackOff` | 容器启动后立刻挂 | `logs --previous` |
| `Running` 但 `0/1 Ready` | readinessProbe 失败 | `describe` 看 probe 配置 |
| `Terminating` 卡住 | finalizer / volume 卸载失败 | `kubectl patch pod xxx -p '{"metadata":{"finalizers":null}}'`（**最后手段**） |
| `OOMKilled` | 容器内存超 limits | 调大 limits / 修内存泄漏 |
| `Error` (137) | OOM | 同上 |
| `Error` (143) | SIGTERM 优雅退出失败 | 应用 graceful shutdown 加超时 |

## 第六步：deployment / rollout

```bash
kubectl get deploy
kubectl rollout status deploy/myapp
kubectl rollout history deploy/myapp
kubectl rollout undo deploy/myapp                  # 回滚到上一版
kubectl rollout undo deploy/myapp --to-revision=3  # 回到特定版本
kubectl rollout restart deploy/myapp               # 强制滚动（image 没变也能）

# 改 image
kubectl set image deploy/myapp app=myrepo/myapp:v2

# 扩缩
kubectl scale deploy/myapp --replicas=5
kubectl autoscale deploy/myapp --min=2 --max=10 --cpu-percent=80
```

## 第七步：service / ingress

```bash
kubectl get svc
kubectl get ingress

# 测连通
kubectl run debug --rm -it --image=nicolaka/netshoot -- bash
# 进 debug pod 后
curl mysvc.default.svc.cluster.local
curl mysvc.default.svc.cluster.local:80/health
nslookup mysvc.default.svc.cluster.local
```

service 类型：

| Type | 用途 |
|------|------|
| `ClusterIP` | 集群内访问（默认） |
| `NodePort` | 在每节点开 30000-32767 端口对外 |
| `LoadBalancer` | 云厂商 LB / metallb（裸金属） |
| `ExternalName` | DNS CNAME 别名 |

## 第八步：yaml 编辑套路

```bash
kubectl edit deploy/myapp                          # 直接改（变更立即生效）
kubectl apply -f myapp.yaml                        # 声明式更新
kubectl apply -f https://raw.githubusercontent.com/.../manifests/install.yaml
kubectl delete -f myapp.yaml
kubectl diff -f myapp.yaml                         # 看会改什么（不执行）

# 导出现有资源为模板
kubectl get deploy myapp -o yaml > myapp.yaml
# 干净版本（去掉 status / metadata 噪声）
kubectl get deploy myapp -o yaml --show-managed-fields=false \
    | yq 'del(.status, .metadata.uid, .metadata.resourceVersion, .metadata.creationTimestamp)' > myapp.yaml
```

## 第九步：helm

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo bitnami/redis
helm show values bitnami/redis > values.yaml          # 看可调参数

helm install myredis bitnami/redis -f values.yaml --namespace data --create-namespace
helm upgrade myredis bitnami/redis -f values.yaml
helm rollback myredis 1                                # 回滚到 release rev 1
helm uninstall myredis -n data                         # ⚠️ 删，含 PVC（按 chart 设计）
helm list -A
helm history myredis -n data
helm get values myredis -n data                        # 当前 release 的 values
helm get manifest myredis -n data                      # 渲染后的 yaml
```

**注意**：`helm uninstall` 默认**不删 PVC**（Bitnami 等 chart 设了 `persistence.existingClaim` 或 `keep` 注解保护）；删 PVC 要单独 `kubectl delete pvc -n data -l app.kubernetes.io/instance=myredis`。

## 第十步：常用资源 yaml 速查

### Pod（最小）

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mypod
spec:
  containers:
    - name: app
      image: nginx:1.25
      resources:
        requests: { cpu: 100m, memory: 128Mi }
        limits:   { cpu: 500m, memory: 512Mi }
      ports:
        - containerPort: 80
```

### Deployment + Service

```yaml
apiVersion: apps/v1
kind: Deployment
metadata: { name: myapp }
spec:
  replicas: 3
  selector: { matchLabels: { app: myapp } }
  template:
    metadata: { labels: { app: myapp } }
    spec:
      containers:
        - name: app
          image: myrepo/myapp:v1
          ports: [{ containerPort: 8080 }]
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            initialDelaySeconds: 10
          readinessProbe:
            httpGet: { path: /ready, port: 8080 }
---
apiVersion: v1
kind: Service
metadata: { name: myapp }
spec:
  selector: { app: myapp }
  ports: [{ port: 80, targetPort: 8080 }]
```

### Secret / ConfigMap

```bash
kubectl create configmap myconfig --from-file=config.yaml --from-literal=key1=value1
kubectl create secret generic mysecret --from-literal=DB_PASS=xxx
# 用 stringData 写明文（yaml）
```

## 第十一步：节点维护

```bash
kubectl cordon node1                               # 标记不可调度（已有 pod 不动）
kubectl drain node1 --ignore-daemonsets --delete-emptydir-data   # 驱逐 pod ⚠️
kubectl uncordon node1                             # 恢复
kubectl delete node node1                          # 从 cluster 移除
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| kubeconfig | `~/.kube/config` 或 `$KUBECONFIG` |
| kubelet 配置 | `/var/lib/kubelet/config.yaml` |
| kubelet 日志 | `journalctl -u kubelet` |
| containerd（默认运行时） | `/etc/containerd/config.toml` |
| k3s 配置 | `/etc/rancher/k3s/config.yaml` |
| k3s 数据 | `/var/lib/rancher/k3s/` |
| etcd 数据 | `/var/lib/etcd/`（kubeadm）/ k3s 内嵌 sqlite |
| 镜像缓存（containerd） | `/var/lib/containerd/` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `kubectl delete ns kube-system` | **集群崩溃**，恢复极难 |
| `kubectl delete ns production` 等业务 ns | 全部业务消失 |
| `kubectl delete pod --grace-period=0 --force` | 不发 SIGTERM 直接强杀（**数据可能丢**） |
| `kubectl drain node --force --delete-emptydir-data` | 强逐 + 删本地数据 |
| `helm uninstall` 生产 release | 删 release + 默认会删大部分资源 |
| `kubeadm reset` | **重置整个节点** kubernetes 配置（master 跑这条 = 集群崩） |
| `kubectl delete pv xxx` (Retain 策略) | PV 删除前如果 reclaimPolicy 是 Delete，会**触发存储后端删数据** |
| `rm -rf /var/lib/etcd` | etcd 数据丢，所有 cluster 状态消失 |

## 教训

- **`describe` 是 80% 排障第一站** —— 比看 logs 更快定位"为什么 pod 起不来"。
- 改 deployment **不要直接 `kubectl edit`**，改 git 里的 yaml + `apply`（GitOps）才能审计追踪。
- `rollout restart` 比 `kubectl delete pod` 优雅得多（按 maxSurge/maxUnavailable 控制）。
- 资源 yaml 缺 `requests/limits` 是事故源：节点 OOM 会按 QoS 优先杀掉 BestEffort 的 pod。
- `helm upgrade --install` 比分别 install/upgrade 省心（幂等）。
- `kubectl port-forward` 长时间放着会被 idle timeout 断；高频用建议起 socat/nc proxy 容器。
- 生产 cluster 一定有备份策略：**etcd 定期快照** + 关键资源 yaml 进 git；没备份 = 没救。

---

## 16. linux-fundamentals

```yaml
---
name: linux-fundamentals
description: Linux 基础运维速查 —— 系统/进程/磁盘/网络/用户/cron/防火墙 高频命令对照。
触发词: linux, 系统, 磁盘满, 进程, 用户, 权限, 网络, 防火墙, firewalld, iptables, ufw, cron, crontab, 时区, 主机名, 内存满, df -h, du -sh, top, ss -tln, netstat, free, lsof, 服务器卡, 服务器慢, 系统卡死, 系统慢, 内存占满, 内存爆了, 内存不够, 磁盘不够, 磁盘满了, 空间不够, 没空间, cpu 高, cpu 100, 负载高, load 高, 进程僵尸, zombie, swap, 用户加, 改密码, 改 sudo, sudoers, 时间不对, 时间同步, ntp, chrony, timedatectl, hostnamectl, 主机名改, 主机名修改
dangerous_commands:
  - '(?:^|[\s;&|])chmod\s+-R\s+0*777\s+/(?:\s|$)'
  - '(?:^|[\s;&|])chown\s+-R\s+\w+(?::\w+)?\s+/(?:\s|$)'
  - '(?:^|[\s;&|])userdel\s+(?:-r\s+)?root(?:\s|$)'
  - '(?:^|[\s;&|])(?:iptables|ip6tables)\s+-F(?:\s|$)'
  - '(?:^|[\s;&|])ufw\s+reset(?:\s|$)'
  - '(?:^|[\s;&|])systemctl\s+(?:stop|disable|mask)\s+(?:sshd|networking|NetworkManager|systemd-journald)\b'
---
```

# linux-fundamentals —— Linux 基础运维速查

适用：用户没说具体哪个组件，只是说"服务器卡了 / 磁盘满了 / 网不通 / 谁占的端口 / cron 没跑"等系统层问题。

## 🤖 第零步：优先用 OpsPub 专用工具（比 ssh_exec 更稳）

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看系统信息（内核/发行版/负载） | `system_info(server)` | uname + hostnamectl + uptime |
| 看磁盘使用 | `disk_usage(server, path?)` | df -hT |
| 看某服务状态 | `service_status(server, service)` | systemctl status --lines=20 |
| 看日志尾部 | `tail_log(server, path, lines?)` | tail -n（默认 200，上限 5000） |
| 查端口被谁监听 | `port_check(server, port)` | ss -tlnH |

这五个只读工具**任何策略档位都放行**（含 readonly 档），不会被拒；本技能后文的对应 shell 命令仅在工具不够用时（要加 grep/排序等）才走 `ssh_exec`。

⚠️ 含 `sudo` 的命令会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试，改用只读方式或询问用户。

## 第一步：基础识别（先确认是什么发行版/版本）

```bash
cat /etc/os-release       # ID=ubuntu/debian/rhel/centos/rocky/alma/openeuler
hostnamectl               # 内核 + 发行版 + virt 类型一锅出
uname -r                  # 内核版本
arch                      # x86_64 / aarch64
```

包管理对照（不同发行版命令不同）：

| 操作 | Debian/Ubuntu | RHEL/CentOS/Rocky | openSUSE |
|------|---------------|-------------------|----------|
| 更新源 | `apt update` | `dnf check-update` | `zypper refresh` |
| 装包 | `apt install <pkg>` | `dnf install <pkg>` | `zypper in <pkg>` |
| 查包归属 | `dpkg -S <file>` | `rpm -qf <file>` | `rpm -qf <file>` |
| 列已装 | `dpkg -l` | `rpm -qa` | `rpm -qa` |

## 第二步：进程 / CPU / 内存

```bash
ps aux --sort=-%cpu | head           # CPU TOP
ps aux --sort=-%mem | head           # 内存 TOP
top                                  # 实时（按 P/M/T 排序）
htop                                 # 友好版（如装了）
pgrep -af nginx                      # 按名字找进程
pidof nginx                          # 简版
free -h                              # 内存（**别只看 free 列，看 available**）
vmstat 1 5                           # 上下文切换 / IO 等待
uptime                               # load average
```

判断真实"是否够内存"看 `available`（已减掉 cache 可回收部分），不是 `free`。

## 第三步：磁盘

```bash
df -h                                # 各分区使用率
df -hi                               # inode 用量（满了照样写不进去）
du -sh /var/log/* | sort -h          # 找哪个目录占地方
du -sh /* 2>/dev/null | sort -h      # 从根开始扫
ncdu /var                            # 交互式（如装了，最好用）
ls -lh /tmp | head                   # 大文件
find / -size +500M -type f 2>/dev/null   # 找大文件
lsblk                                # 块设备 / 挂载点
mount | column -t                    # 当前挂载
```

满了之后清理顺序：① `/var/log/*`（看 logrotate） ② `/tmp` ③ 包缓存 `apt clean` / `dnf clean all` ④ docker `docker system df`

## 第四步：网络

```bash
ip a                                 # 接口 + IP（替代 ifconfig）
ip route                             # 路由表
ss -tlnp                             # TCP 监听 + 占用进程（替代 netstat -tlnp）
ss -tunap                            # 全部连接
ss -s                                # 统计概览
lsof -i :8080                        # 谁占了 8080
ping -c 4 <host>
traceroute <host>                    # tracepath（无 root 时）
curl -v <url>
dig <domain>                         # 优于 nslookup
mtr <host>                           # 持续 ping + tracert
```

DNS 顺序：`/etc/nsswitch.conf` → `/etc/hosts` → `/etc/resolv.conf`。

## 第五步：用户和权限

```bash
id <user>                            # uid / gid / groups
who                                  # 当前登录用户
last -n 20                           # 历史登录
sudo -l                              # 当前用户能 sudo 什么
getent passwd <user>                 # 兼容 nsswitch 的查询
groups <user>

# 修改
useradd -m -s /bin/bash <user>
passwd <user>
usermod -aG sudo <user>              # 加 sudo 组（Debian 系；RHEL 系是 wheel）
userdel <user>                       # 不删 home
userdel -r <user>                    # 连 home 一起删

# 文件权限
chmod 644 file        # rw-r--r--
chmod u+x script.sh   # 给 owner 加 x
chown user:group file
stat <file>                          # 详细元信息
```

## 第六步：systemd（详见 systemd-service 技能）

```bash
systemctl status <unit>
systemctl restart <unit>
systemctl enable --now <unit>        # 开机启动 + 立即启动
systemctl list-units --failed        # 失败的服务
journalctl -u <unit> -n 100 --no-pager
journalctl -u <unit> -f              # 实时
journalctl --since "1 hour ago"
journalctl --disk-usage              # 日志占多少
```

## 第七步：cron / 定时任务

```bash
crontab -l                           # 当前用户
sudo crontab -l -u <user>            # 指定用户
crontab -e                           # 编辑（用 VISUAL/EDITOR 环境变量）

# 系统级
ls /etc/cron.{hourly,daily,weekly,monthly}/
cat /etc/crontab
ls /etc/cron.d/

# 看 cron 跑了没
journalctl -u cron -n 50               # Debian/Ubuntu
journalctl -u crond -n 50              # RHEL/CentOS

# 现代替代：systemd timer
systemctl list-timers --all
```

cron 不跑的最常见原因：① `PATH` 太短（cron 不带 shell rc，要在脚本里 source 或写完整路径）② 用户没权限 ③ 脚本无 +x ④ cron 守护进程没起。

## 第八步：防火墙

不同工具：

```bash
# firewalld (RHEL/CentOS/Rocky 默认)
firewall-cmd --state
firewall-cmd --list-all
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload

# ufw (Ubuntu/Debian 默认)
ufw status verbose
ufw allow 8080/tcp
ufw allow from 10.0.0.0/24 to any port 22

# iptables (底层)
iptables -L -n -v --line-numbers
iptables -t nat -L -n -v
```

> ⚠️ 修改防火墙前**确认你的 SSH 端口不会被锁外面**。建议先开 5 分钟 timeout 的恢复任务：`echo "iptables -F" | at now + 5 minutes`（保险绳）。

## 第九步：时区 / 时间同步

```bash
timedatectl                          # 当前时区 + NTP 状态
timedatectl set-timezone Asia/Shanghai
timedatectl set-ntp true
chronyc tracking                     # NTP 偏差（chrony，推荐）
ntpq -p                              # ntpd 旧工具
date -u                              # UTC
date '+%Y-%m-%d %H:%M:%S %z'
```

## 第十步：环境变量 / shell

```bash
env | sort
echo $PATH
which <cmd>
type <cmd>                           # alias / function / builtin / file
command -v <cmd>                     # POSIX 标准

# 持久化（用户级）
~/.bashrc / ~/.bash_profile / ~/.zshrc / ~/.profile

# 系统级
/etc/environment / /etc/profile.d/*.sh

# systemd 服务的环境变量在 unit 的 [Service] 段配 Environment=
```

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `chmod -R 777 /` | 全系统权限灾难 |
| `chown -R user /` | 全系统所有权迁移，root 服务可能直接挂 |
| `userdel root` | 删 root 账户，多半连 sudo 都没了 |
| `iptables -F` / `ip6tables -F` | 清防火墙所有规则（**SSH 可能被锁外**） |
| `ufw reset` | 重置 ufw（**SSH 可能被锁外**） |
| `systemctl stop/disable/mask sshd` | **远程直接失联**，唯一恢复路径是带外/控制台 |
| `systemctl stop NetworkManager` | 网络断（如配置不当 SSH 也断） |
| `systemctl stop systemd-journald` | 日志全部丢失，无法事后排查 |
| `> /var/log/...`（清日志） | 应保留可用 logrotate；直接清会让正在写的进程 fd 失效 |

## 教训

- **远程改防火墙 / 改 SSH 配置前永远先准备保险绳** —— `at now + 5 minutes` 跑一条恢复命令；改完测通了再 `atrm` 取消。复杂恢复脚本放 `~/.opspub/scripts/`（OpsPub 统一工作区，别散落 /tmp）。
- `df` 显示满了但 `du` 加起来不到一半 = 多半是**被删但未关闭的文件占用**：`lsof | grep deleted` 找出来 → 重启对应进程或 truncate。
- `free` 列很小**不代表内存不够** —— Linux 把空闲内存用作 page cache，看 `available` 列才是真实可用。
- 时区不一致是日志关联失败的常见原因；服务器尽量统一 `UTC` 或公司标准时区，应用日志加时区标识。
- cron 调试先在交互 shell 用相同环境跑：`env -i HOME=/root /bin/sh -c '/path/script'`，cron 跑的环境比你 shell 干净得多。

---

## 17. log-investigation

```yaml
---
name: log-investigation
description: 日志排障速查 —— 路径表 / journalctl / tail+grep / strace / logrotate / 跨服务关联。
触发词: 日志, log, journal, journalctl, tail, grep, 日志路径, 找日志, log 在哪, error log, syslog, dmesg, strace, ltrace, logrotate, 日志切割, 日志归档, 查日志, 看日志, 看错误, 错误信息, 报错信息, 日志太多, 日志爆盘, 日志占空间, var log, access log, accesslog, 访问日志, 错误日志, last 命令, nohup, 应用挂了, 应用崩了, 应用起不来, 挂了, 崩了, 起不来, 没报错, 找不到原因, panic, oom kill, oomkilled, 翻日志, 日志在哪, 半夜报警, 排查问题
dangerous_commands:
  - '(?:^|[\s;&|])journalctl\s+--vacuum-(?:time|size|files)=0(?:\s|$)'
  - '(?:^|[\s;&|])(?:truncate\s+-s\s+0|>\s*)\s*/var/log/(?:wtmp|btmp|lastlog|audit)\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/log(?:\s|/|$)'
  - '(?:^|[\s;&|])logrotate\s+-f\s+/etc/logrotate\.conf\s+--force\b'
---
```

# log-investigation —— 日志排障速查

适用：用户说"应用挂了不知道为啥"/"找不到日志在哪"/"日志太多翻不完"/"想关联多个服务的日志"/"系统盘满了多半是日志"/"想配 logrotate"。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看日志尾部（**本技能主力**） | `tail_log(server, path, lines?)` | tail -n（默认 200，上限 5000） |
| 看某服务状态（连带最近 20 行日志） | `service_status(server, service)` | systemctl status --lines=20 |
| 看磁盘是不是日志撑满了 | `disk_usage(server, path?)` | df -hT |
| 直接读整个日志文件 | `sftp_read(server, path)` | cat（不执行 shell） |
| 列日志目录看哪个文件大 | `sftp_list(server, "/var/log")` | ls -la |

这些只读工具**任何策略档位都放行**（含 readonly 档），不会被拒——**先用 `tail_log` 看尾部，别上来就 `ssh_exec tail -f`**（流式跟随用工具更稳）。`journalctl`/`grep`/`awk` 这类要管道/过滤的，工具不够用时才走 `ssh_exec`。

⚠️ 本技能里的清理/切割操作（`journalctl --vacuum-*` / `truncate` / `logrotate -f`）含 `sudo` 或是写/删操作 → 会触发**用户审批**。执行前先告诉用户"这步会删历史日志、需要你在 OpsPub 批准"，**被拒后不要原样重试**，改成只读排查或问用户。清理前先把要删的日志备份到 `~/.opspub/backups/`（OpsPub 统一工作区）。

## 第一步：日志路径速查表

按"我要找谁的日志"反查：

| 组件 | 默认日志路径 | 备注 |
|------|-------------|------|
| systemd 服务 | `journalctl -u <unit>` | 现代发行版首选；同时也能写到 `/var/log/` |
| 系统通用 | `/var/log/syslog`（Debian） / `/var/log/messages`（RHEL） | 内核 + cron + 其它 |
| 内核 | `/var/log/kern.log` 或 `dmesg` / `journalctl -k` | OOM / 硬件错误 |
| 认证 / 登录 | `/var/log/auth.log`（Debian） / `/var/log/secure`（RHEL） | sshd / sudo / fail2ban 看这 |
| 启动 | `/var/log/boot.log` / `journalctl -b` | 当前启动；`-b -1` 上次 |
| dmesg | `/var/log/dmesg` 或 `dmesg -T` | 内核环形缓冲（带时间） |
| 包管理（dpkg） | `/var/log/dpkg.log` / `/var/log/apt/history.log` | 谁装/删了什么包 |
| 包管理（dnf） | `/var/log/dnf.log` / `/var/log/dnf.rpm.log` | 同上 |
| cron | `journalctl -u cron`（Debian） / `-u crond`（RHEL） | 任务有没有跑、stderr 进了哪 |
| nginx | `/var/log/nginx/{access,error}.log` | OpenResty `/usr/local/openresty/nginx/logs/` |
| Apache HTTPD | `/var/log/apache2/`（Debian） / `/var/log/httpd/`（RHEL） | |
| MySQL | `SHOW VARIABLES LIKE 'log_error'`（默认 `/var/log/mysql/error.log`） | |
| MariaDB | `/var/log/mariadb/mariadb.log` 或 journal | |
| PostgreSQL | `/var/log/postgresql/postgresql-*.log` | |
| Redis | `/var/log/redis/redis-server.log` 或 journal | |
| Docker daemon | `journalctl -u docker` | |
| Docker 容器 | `docker logs <name>` 或 `/var/lib/docker/containers/*/...-json.log` | 别直接读 json 文件，用 docker logs |
| PHP-FPM | `/var/log/php<ver>-fpm.log` + 站点配置里的 access/slow log | |
| Tomcat | `<CATALINA_HOME>/logs/catalina.out` | |
| 1Panel 主日志 | `/opt/1panel/log/1Panel.log` + `1Panel-error.log` | |
| 邮件 | `/var/log/mail.log`（Postfix） | |

找不到时：

```bash
# 看进程实际打开了什么文件
sudo lsof -p $(pidof <进程>) | grep -E '\.log|/log/'

# 按时间排序最近变化的日志（多半是嫌疑犯）
sudo find /var/log -type f -mmin -10 2>/dev/null | xargs ls -lhS
```

## 第二步：journalctl 高频用法

```bash
journalctl -u <unit>                            # 单服务
journalctl -u <unit> -f                         # 实时跟
journalctl -u <unit> -n 200 --no-pager
journalctl -u <unit> --since "1 hour ago"
journalctl -u <unit> --since today
journalctl -u <unit> --since "2024-01-01" --until "2024-01-02"
journalctl -u <unit> -p err                     # 只看 error 及以上
journalctl -u <unit> --grep "panic|error"       # 正则过滤
journalctl -u <unit> -o cat                     # 只内容（去时间戳）
journalctl -u <unit> -o json-pretty             # 结构化（带 _PID / _UID 等）
journalctl _PID=1234                            # 按 PID
journalctl _UID=1000                            # 按 UID
journalctl _COMM=nginx                          # 按进程名
journalctl -k                                   # 仅内核（= dmesg）
journalctl -b                                   # 本次启动
journalctl -b -1                                # 上次启动
journalctl --list-boots                         # 启动历史
journalctl --disk-usage                         # 占用磁盘
journalctl -u a.service -u b.service            # 多服务关联
journalctl --since "10 min ago" | grep -E "nginx|mysql"  # 跨服务关联
```

## 第三步：tail / grep / awk 组合

```bash
# 实时跟多文件
tail -f /var/log/nginx/error.log /var/log/mysql/error.log

# 历史回看 + 实时
tail -n 100 -f /var/log/nginx/access.log

# 多文件 grep
grep -r 'ERROR' /var/log/myapp/

# 按时间窗口（access.log 经典格式）
awk '$4 >= "[01/Jan/2024:10:00:00" && $4 < "[01/Jan/2024:11:00:00"' /var/log/nginx/access.log

# 状态码 5xx 统计
awk '$9 ~ /^5/ {print $7}' /var/log/nginx/access.log | sort | uniq -c | sort -rn | head

# 慢请求 TOP（假设 $upstream_response_time 是倒数第二列）
awk '{print $(NF-1), $7}' /var/log/nginx/access.log | sort -rn | head

# 找某 IP 的所有请求
grep '1.2.3.4' /var/log/nginx/access.log | awk '{print $7}' | sort | uniq -c | sort -rn

# 滚动 sample（日志太多时）
shuf -n 100 /var/log/big.log

# 二进制日志 / 不一定 utf-8（如 java stack trace）
less /var/log/foo.log
zcat /var/log/foo.log.1.gz                      # 压缩归档
zgrep ERROR /var/log/foo.log.*.gz               # 批量翻压缩归档
```

## 第四步：跨服务关联

经典场景："API 报 500 → 后端 → DB"。

```bash
# 在一台机器上同时跟三层
sudo journalctl -u nginx -u myapp -u mysql -f

# 多服务关键词关联（按时间排序）
sudo journalctl --since "5 min ago" \
    | grep -E "nginx|myapp|mysql" \
    | grep -iE "error|warn|timeout"

# 用 trace_id 串起（最佳实践）
sudo journalctl --since today --grep "trace_id=abc123"
```

## 第五步：strace / ltrace（追问"它到底在干嘛"）

```bash
# 看进程实时系统调用（CPU 占满但不知道做什么）
sudo strace -p <pid> -f -e trace=network,read,write 2>&1 | head -100

# 启动时追踪
sudo strace -f -o /tmp/myapp.strace /opt/myapp/bin/server

# 看库函数调用
sudo ltrace -p <pid> -f 2>&1 | head

# 文件 IO 慢？看具体在 read 哪个文件
sudo strace -p <pid> -e trace=openat,read 2>&1 | grep -v ENOENT
```

> ⚠️ strace 会**显著拖慢被追的进程**（10x+ 系统调用密集型）；生产慎用。

## 第六步：dmesg（内核环形缓冲）

```bash
dmesg -T                                        # 带时间戳（推荐）
dmesg -T | tail -50
dmesg -T --level=err,crit,alert,emerg           # 只看错误
dmesg -w                                        # 持续输出（类似 tail -f）
dmesg | grep -i 'killed process'                # OOM
dmesg | grep -i 'segfault'                      # 段错误
dmesg | grep -i 'usb\|sata\|scsi'               # 硬件
```

## 第七步：logrotate

配置：`/etc/logrotate.conf` + `/etc/logrotate.d/*`。

典型规则：

```
/var/log/myapp/*.log {
    daily                       # 每天切
    rotate 14                   # 保留 14 份
    size 100M                   # 或按大小切
    missingok                   # 文件没有不报错
    notifempty                  # 空文件不切
    compress                    # gzip 压缩老文件
    delaycompress               # 上次的不压（仍有应用追加）
    create 0640 myapp myapp     # 创建新文件 + 权限
    sharedscripts
    postrotate
        systemctl reload myapp > /dev/null 2>&1 || true
    endscript
}
```

操作：

```bash
sudo logrotate -d /etc/logrotate.d/myapp        # debug 不真执行
sudo logrotate -f /etc/logrotate.d/myapp        # 强制立刻切一次
cat /var/lib/logrotate/status                   # 历次切割状态
```

> ⚠️ 切完日志应用还在写老 fd → **应用要么 reopen 日志，要么 logrotate 用 `copytruncate`**（拷+清空老文件，应用 fd 不变）；nginx 用 `nginx -s reopen`，开源应用一般用 SIGUSR1。

## 第八步：磁盘满了多半是日志

```bash
# 看日志占多少
sudo journalctl --disk-usage
sudo du -sh /var/log/* 2>/dev/null | sort -h | tail
sudo du -sh /var/log/journal/

# journal 限大小（推荐配置）
sudo systemctl edit systemd-journald
# [Journal]
# SystemMaxUse=2G
# SystemKeepFree=10G
sudo systemctl restart systemd-journald

# 应急清理（**走审批 / 注意数据丢失**）
sudo journalctl --vacuum-size=500M               # 留 500M
sudo journalctl --vacuum-time=7d                  # 留 7 天
```

> 清理前若需留证（排障/合规），先用 `sftp_read` 取关键日志或 `cp /var/log/xxx ~/.opspub/backups/`（OpsPub 统一工作区）再 vacuum。`--vacuum-time=0` / `--vacuum-size=0`（全删）会触发**危险审批**，需用户弹窗放行。

## 路径速查表（重要！）

| 类型 | 路径 |
|------|------|
| systemd journal | `/var/log/journal/`（持久化）/ `/run/log/journal/`（临时） |
| 系统日志 | `/var/log/syslog`（Debian）/ `/var/log/messages`（RHEL） |
| auth | `/var/log/auth.log` / `/var/log/secure` |
| 内核 | `/var/log/kern.log` + `dmesg` |
| logrotate 配置 | `/etc/logrotate.conf` + `/etc/logrotate.d/*` |
| logrotate 状态 | `/var/lib/logrotate/status` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `journalctl --vacuum-time=0` / `--vacuum-size=0` | **删全部 journal 历史**，事后没法排查 |
| `> /var/log/wtmp` / `btmp` / `lastlog` | 删登录/失败登录历史，**入侵痕迹消失** |
| `> /var/log/audit/audit.log` | 删审计日志（合规事故） |
| `rm -rf /var/log` | 删全部日志（logrotate 配置 + 文件） |
| `truncate -s 0 /var/log/nginx/error.log` 但 nginx 还在写 | 不安全（应用 fd 不变继续追加） |
| 错配置的 `logrotate -f` | 一次性把所有匹配文件切了 + 触发 postrotate（可能 reload 一堆服务） |

## 教训

- **第一反应应该是 `journalctl -u <unit> --since "X min ago"`** 而不是 `cat /var/log/*` —— 现代应用日志多半进了 journal。
- 日志找不到时，`sudo lsof -p $(pidof xxx) | grep log` 几乎万能。
- `strace` 是侦探工具不是常规工具，生产慎用；高级替代：`bpftrace` / `perf trace`（开销小）。
- 切日志后应用不写新文件 = 多半是 logrotate 没配 reload 钩子 + 应用没监听 SIGHUP；改 `copytruncate` 是最省心的兜底（代价：切的瞬间日志丢一点）。
- `journalctl --grep` 不支持完整 PCRE，复杂正则建议管道给 `grep -P`。
- 大日志文件用 `less` 别 `cat`（cat 会一口气全打到终端，前面的看不到）。
- 跨机器关联日志靠的是**统一时区 + 统一格式 + trace_id**；缺一个事后基本拼不起来。

---

## 18. loki-promtail

```yaml
---
name: loki-promtail
description: Loki + Promtail 日志聚合栈 —— 配置 / LogQL / Grafana 集成 / S3 后端 / 存储压缩。
触发词: loki, promtail, logql, 日志聚合, 日志查询, log aggregation, grafana 日志, alloy, vector, fluent-bit, structured logging, loki 3, grafana alloy, 装 loki, 部署 loki, 收集日志, 集中日志, 日志接入, 多机日志, 日志检索, label, log stream, 替代 elk, 比 elk 轻, retention, 日志保留, s3 存储日志, loki 没数据, 日志查不到, 日志收不上来, 日志延迟, loki 报错, too many active streams, 高基数
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:/var/lib/loki|/data/loki|/loki)(?:\s|/|$)'
  - '(?i)\bcurl\b[^\n]*-X\s+(?:DELETE|POST)\b[^\n]*/loki/api/v1/delete\b'
---
```

# loki-promtail —— Loki 日志聚合

适用：用户想"加日志聚合"/"在 Grafana 里看日志"/"按服务名/级别筛"/"日志和 metrics 同时间轴联动"；不想花 ELK 那么多内存。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 loki / promtail 状态 | `service_status(server, "loki")` / `service_status(server, "promtail")`（容器走 `ssh_exec docker ps`） | systemctl status |
| 查端口（3100 Loki HTTP / 9080 Promtail / 9095 gRPC） | `port_check(server, 3100)` / `port_check(server, 9080)` | ss -tlnH |
| 看 loki/promtail 自身日志 | `tail_log(server, "<日志路径>")`，或 `ssh_exec docker logs loki` | tail -n |
| 看 loki 数据占多少磁盘 | `disk_usage(server, "<loki 数据目录>")` | df -hT |
| 改 loki.yml / promtail.yml | `sftp_read` 看现状 + `sftp_write` 整文件写 | 直接编辑 |

这些只读工具**任何策略档位都放行**。改配置走 `sftp_read`+`sftp_write`（无 shell heredoc 转义坑），写完重启容器/服务生效。后文 `curl` / `docker` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 重启服务 / `curl .../delete` 删日志 / 改 retention 等写操作会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## 选型对照

| 工具 | 用途 | 资源占用 |
|------|------|---------|
| **Loki + Promtail** | 类 Prometheus 的日志栈，按 label 索引、内容不索引 | 极低（500MB+） |
| **ELK / Elastic Stack** | 全文索引，强查询 | 高（4GB+） |
| **Vector** | 现代采集 / 转换 / 路由（替代 fluent-bit / promtail） | 低（Rust 实现） |
| **Grafana Alloy** | Grafana 新一代采集器（合并 promtail / fluent-bit / opentelemetry collector） | 低 |

OpsPub 用户大多场景：**Loki + Promtail（或 Alloy）+ Grafana**。

## 一、Loki 部署（docker compose）

```yaml
version: "3"
services:
  loki:
    image: grafana/loki:latest
    restart: unless-stopped
    command: -config.file=/etc/loki/loki.yml
    volumes:
      - ./loki.yml:/etc/loki/loki.yml:ro
      - loki-data:/loki
    ports: ["3100:3100"]

  promtail:
    image: grafana/promtail:latest
    restart: unless-stopped
    command: -config.file=/etc/promtail/promtail.yml
    volumes:
      - ./promtail.yml:/etc/promtail/promtail.yml:ro
      - /var/log:/var/log:ro              # 系统日志
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - promtail-positions:/positions

volumes:
  loki-data:
  promtail-positions:
```

### loki.yml（单实例）

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9095

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 720h           # 30 天
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20
  per_stream_rate_limit: 5MB
  max_label_value_length: 4096
  max_label_name_length: 1024
  max_label_names_per_series: 30
  max_streams_per_user: 0          # 0 = 不限

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

### S3 后端（生产推荐）

```yaml
common:
  storage:
    s3:
      endpoint: minio.example.com:9000
      bucketnames: loki-chunks
      access_key_id: xxx
      secret_access_key: xxx
      s3forcepathstyle: true
      insecure: true                 # MinIO HTTP

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: s3
      schema: v13
      index:
        prefix: index_
        period: 24h
```

## 二、Promtail 配置

### promtail.yml

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /positions/positions.yaml   # 持久化"读到哪了"

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # 1) journal（systemd 日志，**最简洁**）
  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: unit
      - source_labels: ['__journal__hostname']
        target_label: host

  # 2) 文件
  - job_name: nginx
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx
          host: web01
          __path__: /var/log/nginx/*.log

  # 3) Docker 容器
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: container

  # 4) JSON 结构化日志解析
  - job_name: myapp
    static_configs:
      - targets: [localhost]
        labels:
          job: myapp
          __path__: /var/log/myapp/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: message
            request_id: request_id
      - labels:
          level:
      - timestamp:
          source: time
          format: RFC3339Nano
```

## 三、LogQL 速查

类似 PromQL + grep 的混合。

```logql
# 选择器（必须）
{job="nginx"}
{job="nginx", host="web01"}
{job=~"nginx|mysql"}
{job="nginx"} != "404"                          # 排除含 404 的
{job="nginx"} |= "ERROR"                        # 包含 ERROR
{job="nginx"} |~ "5\\d{2}"                      # 正则匹配 5xx

# JSON 字段过滤
{job="myapp"} | json | level="error"
{job="myapp"} | json | duration_ms > 100

# 提取字段
{job="myapp"} | json
{job="nginx"} | regexp `(?P<status>\d{3})` | status="500"
{job="nginx"} | logfmt | level="error"

# Metric（聚合：日志条数转 metric）
sum(rate({job="myapp"} |= "ERROR"[5m]))                            # ERROR 速率
sum by (level) (rate({job="myapp"}[5m]))                            # 按 level 分组
count_over_time({job="nginx"} |~ "5\\d{2}" [1h])                    # 1h 内 5xx 总数

# Topk
topk(5, sum by (host) (rate({job="nginx"} |~ "5\\d{2}"[5m])))
```

## 四、Grafana 集成

UI 「Connections → Data sources → Add Loki」，URL 填 `http://loki:3100`。

Explore 视图直接写 LogQL：

```
{job="nginx"} |= "error"
```

切到 Logs panel 看实时日志；切到 Metrics 模式可视化频率。

### 告警（基于日志）

Grafana Alert → Query → Loki → 用 LogQL metric 表达式（如 `sum(rate(...)) > 0.1`）。

## 五、容量规划

Loki 不索引日志内容，只索引 label —— **label 基数（cardinality）是头号性能杀手**。

**坏例（每条日志一个 trace_id 当 label）**：

```yaml
labels:
  trace_id: '{{.trace_id}}'   # ⛔ 高基数：每个 trace 一个 stream
```

**好例**：

```yaml
labels:
  level: '{{.level}}'         # 低基数：5-10 种
  service: '{{.service}}'
```

`trace_id` / `request_id` / `user_id` / `pod_id` 这些都**不要当 label**，让它们留在消息正文，用 `| json | trace_id="xxx"` 查询。

### 存储估算

```
压缩后日志大小 ≈ 原始日志大小 / 10
30 天保留 + 每天 100GB 日志 ≈ 300GB 压缩 = ~30GB Loki 占用（用 chunks + S3）
```

## 六、清理 / 删除

```bash
# 通过 compactor 自动按 retention 删（推荐）
# limits_config.retention_period: 720h

# 主动删特定 label 范围
curl -X POST 'http://loki:3100/loki/api/v1/delete' \
    --data-urlencode 'query={job="testing"}' \
    --data-urlencode 'start=2024-01-01T00:00:00Z' \
    --data-urlencode 'end=2024-01-02T00:00:00Z'
# ⚠️ 走审批

# 查删除请求
curl http://loki:3100/loki/api/v1/delete
```

## 七、常见问题

### Q1: Promtail 一直 "context deadline exceeded"
- Loki ingestion rate limit 撞了 → 调 `limits_config.ingestion_rate_mb`
- 网络问题
- Loki 重启 / 不健康

### Q2: 日志延迟到 Loki 数小时
- promtail positions 文件丢了，从头读历史日志
- ingestion 限速触发，promtail 在 backoff
- chunk_idle_period 太长（默认 30m），刚写的日志要等 flush

### Q3: 查询超时 / OOM
- 时间范围太大 + label 选择器太宽
- LogQL `unwrap` / `quantile_over_time` 在大数据集上算力高
- 加 `--query-timeout=5m`

### Q4: 高基数 label 报错
- "too many active streams" / "max streams per user reached"
- 看 promtail 配置里有没有把 IP / uuid / 时间戳当 label

## 路径速查表

| 内容 | 路径 |
|------|------|
| Loki 数据 | `path_prefix: /loki`（默认）下 chunks / index / boltdb-shipper |
| Promtail positions | 配置 `positions.filename`（默认 `/var/lib/promtail/positions.yaml`） |
| 配置 | `/etc/loki/loki.yml` + `/etc/promtail/promtail.yml` |
| API | `:3100`（Loki HTTP） / `:9080`（Promtail metrics） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm -rf /loki` / loki path_prefix | 删全部日志数据（不可恢复，除非 S3 backed） |
| 改 `retention_period: 0` | 不保留任何日志 |
| `curl -X POST .../delete` | 触发删除特定 stream（生产慎用） |
| 把高基数字段（trace_id / uuid）当 label | 性能崩 + ingester OOM |
| schema 版本切换 | 老数据可能读不到（按 from 时间切，**老 chunks 永远走老 schema**，切换要谨慎） |

## 教训

- **label 不要超过 10 个**且基数 < 1000；trace_id 等永远放正文。
- Loki 不是 ELK 替代品 —— **不做全文索引**，按 label 缩小范围后再 grep；查 PB 级历史日志 Elastic 更快。
- 生产用 **S3/MinIO 后端**：本地 fs 备份难、扩展难、磁盘满会让 ingester 拒绝写入。
- promtail positions 文件**必须持久化**（不放 tmpfs），否则重启从头读历史日志，ingester 撞限速。
- Grafana 里用 Loki 做日志告警有用，但**严肃告警还是走 Prometheus + alertmanager**；日志只是侧证。
- 推荐应用日志输出 **JSON 结构化**，配 promtail `| json` stage，查询体验 10x 提升。
- "loki Forbidden" 多半是 `auth_enabled: true` 但 promtail 没传 `X-Scope-OrgID` header。

---

## 19. minio-s3

```yaml
---
name: minio-s3
description: MinIO（S3 兼容对象存储）速查 —— mc 客户端 / bucket / policy / lifecycle / replication / 部署形态。
触发词: minio, s3 存储, 对象存储, mc 客户端, object storage, bucket, multipart, lifecycle, replication, minio console, presigned, mc alias, minio 起不来, minio 装, 装 minio, 部署 minio, minio 备份, s3 api, aws s3, garage, seaweedfs, ceph rgw, mc cp, mc mirror, 跨区域复制, 桶策略, bucket policy, iam policy, presigned url, 临时下载链接, mc admin, minio operator, silo, pgsty, minio fork, minio 控制台没了, minio 版本
dangerous_commands:
  - '(?i)\bmc\s+rb\b[^\n]*--force\b'
  - '(?i)\bmc\s+rm\b[^\n]*--recursive\b[^\n]*--force\b'
  - '(?i)\bmc\s+admin\s+config\s+set\b[^\n]*\bidentity_openid\b'
  # 删 minio 数据目录（含 1Panel/docker 默认布局），命中即触发审批
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+[~/\w.-]*minio[~/\w.-]*/?(?:\s|/|$)'
  # 用户/服务账号删除，删错会让应用瞬间断连
  - '(?i)\bmc\s+admin\s+user\s+(?:remove|svcacct\s+(?:rm|remove))\b'
---
```

# minio-s3 —— MinIO 对象存储

适用：自建对象存储替代 S3；想"装 minio"/"装 mc 客户端"/"用 minio 给 GitLab/Loki/备份做存储"/"配置 lifecycle / replication"/"权限管理"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 MinIO 优先用 `install_app(server, "minio")`**（MinIO 在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码（AccessKey/SecretKey）托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 minio 服务/容器状态 | `service_status(server, "minio")` | systemctl status |
| 看 S3 API / Console 端口 | `port_check(server, 9000)` / `port_check(server, 9001)` | ss -tlnH |
| 看数据盘用量（对象存储吃磁盘） | `disk_usage(server, "<数据目录>")` | df -hT |
| 看 minio 日志 | `tail_log(server, "<容器/服务日志>")` | tail -n |
| 改 compose / env（端口、密码占位） | `sftp_read` 看现状 + `sftp_write` 整文件写 | 直接编辑 |

这些只读工具**任何策略档位都放行**；改 `docker-compose.yml` / env 走 `sftp_read`+`sftp_write`（无 shell 转义坑），写完 `ssh_exec docker compose up -d`。后文 `mc` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 含 `sudo` / `mc rb` / `mc rm --recursive` 等写操作会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。
> 本地导出/备份对象（`mc cp` 拉到本机临时盘、`mc mirror` 落地、restic/borg 还原产物）统一落 **`~/.opspub/backups`** 或 **`~/.opspub/tmp`**（OpsPub 远程统一工作区），**不要臆造 `/data/backup`、`/mnt/backup` 等可能不存在的路径**。

## 第一步：部署形态

| 形态 | 容量 | 高可用 |
|------|------|--------|
| **Standalone** | 单盘 | 无 HA |
| **Distributed (Erasure Coding)** | 4-32 节点，每节点 1+ 盘 | EC 自动冗余（默认 N/2 可读、N/2 可写） |
| **MinIO Operator (K8s)** | 多集群多租户 | K8s 原生 |

中小团队选 standalone + 定期备份 + 1Panel/docker 部署足够。

### 🔴 先选对镜像线（官方已停更，别再用 `minio/minio:latest`）

官方社区版 **2025-05 砍掉管理控制台 → 2025-10 停发镜像 → 2026-02 仓库归档**，`minio/minio:latest` 现在既没控制台也不会再有 CVE 修复。接盘的是 Pigsty 社区 fork（2026-08-06 由 `pgsty/minio` 改名 `pgsty/silo`）：恢复控制台、持续修 CVE，**S3 API / `MINIO_*` 环境变量 / `x-minio-*` 头 / 磁盘 `.minio.sys` 格式全部保持兼容**，换镜像即可、数据不用动。

| 线 | 镜像 | 说明 |
|---|---|---|
| **维护线（默认推荐）** | `pgsty/silo:RELEASE.2026-09-03T13-18-01Z` | 仍在发版；OpsPub 应用商店装的就是这条 |
| 保守线 | `pgsty/minio:RELEASE.2026-04-17T00-00-00Z` | 改名前最后一批，已封板（RuoYi-Vue-Plus 等框架锁的就是这条） |
| 官方末代 | `minio/minio:RELEASE.2025-04-22T22-12-26Z` | 最后一个带完整控制台的官方版，此后无任何更新 |

⚠️ 换线注意：① 分布式集群**所有节点必须一起换**，silo 与 minio 混跑组不成集群；
② 单节点原地换 image 即可，命名卷/数据目录不动；③ 生产别用 `latest`，钉具体 RELEASE（最好连 digest 一起钉）。
④ 客户端侧：AWS SDK **v2 ≥ 2.30** 默认给上传加 CRC32 校验和 trailer，老 MinIO/兼容实现会报 `XAmzContentSHA256Mismatch` / `XAmzContentChecksumMismatch` —— 报这个错先查 SDK 版本，不是服务端坏了（解法：`requestChecksumCalculation=WHEN_REQUIRED`，或钉 SDK < 2.30）。

### Docker compose（standalone）

```yaml
services:
  minio:
    image: pgsty/silo:RELEASE.2026-09-03T13-18-01Z   # 见上表；别用 minio/minio:latest（已停更无控制台）
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: <强密码>           # ⚠️ 必改 + 进敏感库
      MINIO_BROWSER_REDIRECT_URL: https://minio-console.example.com
      MINIO_SERVER_URL: https://minio.example.com
    ports:
      - "9000:9000"      # S3 API
      - "9001:9001"      # Web console
    volumes:
      - /data/minio:/data
```

> ⚠️ `MINIO_ROOT_PASSWORD` **8 位以上**且改默认；首次启动 1Panel 类面板会显示一次密码，**OpsPub 敏感库**会自动捕获。

### Distributed 部署示例（4 节点，每节点 4 盘）

```bash
# 在每个节点跑
minio server --console-address ":9001" \
    http://node{1...4}.local:9000/data{1...4}
```

EC：4 节点 × 4 盘 = 16 块；默认 N/2 = 8 块奇偶，可容忍 8 块（最多 2 节点）失效。

## 第二步：mc 客户端

```bash
# 装 mc
curl -sLO https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc && sudo mv mc /usr/local/bin/

# 加 alias
mc alias set myminio https://minio.example.com minioadmin <password>
mc alias list
mc admin info myminio                       # 集群状态
```

### 桶操作

```bash
mc mb myminio/mybucket                      # 建桶
mc ls myminio                               # 列桶
mc ls myminio/mybucket                      # 列对象
mc ls --recursive myminio/mybucket/
mc du myminio/mybucket                      # 桶用量
mc stat myminio/mybucket/myfile             # 对象元信息

mc cp ./localfile myminio/mybucket/
mc cp myminio/mybucket/file ./
mc mirror ./localdir myminio/mybucket/      # 同步目录
mc mirror --watch ./localdir myminio/mybucket/   # 实时同步（inotify）

mc rm myminio/mybucket/file                 # 删单对象
mc rm --recursive --dangerous myminio/mybucket/prefix/      # ⚠️ 递归删
mc rb --force myminio/mybucket              # ⚠️ 删桶（含全部对象）
```

### 跨存储复制（mc 是通用 S3 客户端）

```bash
mc alias set aws https://s3.amazonaws.com <ak> <sk>
mc mirror myminio/mybucket aws/mybucket-replica       # MinIO → AWS S3
mc mirror aws/srcbucket myminio/dstbucket             # 反向也行
```

## 第三步：权限模型

### Policy（IAM-like JSON）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::mybucket", "arn:aws:s3:::mybucket/*"]
    }
  ]
}
```

操作：

```bash
mc admin policy create myminio readonly-mybucket policy.json
mc admin policy list myminio
mc admin policy info myminio readonly-mybucket
mc admin policy attach myminio readonly-mybucket --user appuser

# 用户管理
mc admin user add myminio appuser <appuser-secret>
mc admin user list myminio
mc admin user disable myminio appuser
mc admin user remove myminio appuser

# 服务账号（应用直连用 access/secret）
mc admin user svcacct add myminio appuser --access-key AKIA... --secret-key xxx
mc admin user svcacct ls myminio appuser
mc admin user svcacct edit myminio AKIA... --policy custom.json
```

### Bucket Policy（匿名访问，public 桶）

```bash
mc anonymous set download myminio/public          # 任何人 GET
mc anonymous set upload myminio/uploads           # 任何人 PUT（⚠️ 慎用）
mc anonymous set public myminio/public            # 全开
mc anonymous get myminio/mybucket                 # 看当前
mc anonymous remove myminio/mybucket              # 取消
```

## 第四步：Lifecycle（自动过期 / 转层）

```json
// lifecycle.json
{
  "Rules": [
    {
      "ID": "expire-logs-90d",
      "Filter": { "Prefix": "logs/" },
      "Status": "Enabled",
      "Expiration": { "Days": 90 }
    },
    {
      "ID": "abort-multipart-7d",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
mc ilm import myminio/mybucket < lifecycle.json
mc ilm ls myminio/mybucket
mc ilm rm --id expire-logs-90d myminio/mybucket
```

> 推荐**所有桶**都加 `AbortIncompleteMultipartUpload`，否则上传中断的分片永久占地方（mc ls 看不到）。

## 第五步：Bucket Replication（站点级复制）

```bash
# 1) 给 source/target 双向加 alias
mc alias set src https://src-minio.example.com <ak> <sk>
mc alias set dst https://dst-minio.example.com <ak> <sk>

# 2) 在 dst 建好同名 bucket
mc mb dst/mybucket

# 3) 配置 replication
mc replicate add src/mybucket \
    --remote-bucket "arn:minio:replication::xxx:mybucket" \
    --priority 1
mc replicate ls src/mybucket
```

## 第六步：versioning + 对象锁

```bash
mc version enable myminio/mybucket
mc version info myminio/mybucket
mc ls --versions myminio/mybucket/file

# 对象锁定（合规：写入后不可删 N 天）
mc retention set --default GOVERNANCE 30d myminio/mybucket
```

> **桶要在 `mc mb --with-lock` 创建时**才能开对象锁；存量桶**不能**事后加。

## 第七步：诊断 / 健康

```bash
mc admin info myminio                       # 集群版本 + 节点 + 状态
mc admin heal myminio                       # 修复（distributed）
mc admin trace myminio                      # 实时请求 trace
mc admin trace -e error myminio             # 只看错误
mc admin trace --status-code 500 myminio    # 只看 500
mc admin logs myminio                       # 服务端日志
mc admin profile start myminio --type cpu,goroutines      # 性能 profile
```

## 第八步：搭配常见用法

| 用途 | 配置 |
|------|------|
| Loki / Tempo 后端 | 单桶 + s3 endpoint 配 MinIO |
| GitLab artifact / LFS | runner.toml 配 s3 cache + GitLab admin → object storage |
| Velero K8s 备份 | bucket + IAM user |
| 文件备份（restic / borg） | `restic init -r s3:https://minio:9000/restic-bucket` |
| Mastodon / Nextcloud 静态资源 | endpoint + access key |
| 大数据（hudi / iceberg） | minio 当 HDFS 替代 |

## 路径速查表

| 内容 | 路径 |
|------|------|
| 数据 | server 启动指定（如 `/data` / `/data{1..4}`） |
| mc 配置 | `~/.mc/config.json`（alias + 密钥保存这） |
| MinIO console | `:9001` |
| MinIO S3 API | `:9000` |
| 1Panel 部署 | `/opt/1panel/apps/minio/minio/data/` + `docker-compose.yml` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `mc rb --force` | 删桶 + **桶内全部对象**，不可恢复（除非有 versioning + 没过 retention） |
| `mc rm --recursive --force` | 递归删 prefix 下所有对象 |
| 改 `MINIO_ROOT_PASSWORD` 但不通知应用 | 所有用 root 凭据的应用瞬间断 |
| `mc admin config set identity_openid` 配错 | SSO 配错可能锁死管理员 |
| `rm -rf /data/minio` 或挂载源 | **删全部数据** |
| 对生产桶开 `mc anonymous set public` | 任何人都能列/下载/上传 |
| Distributed 节点掉超过 EC 容忍数 | 部分对象不可读（再掉一台就丢） |

## 教训

- **`MINIO_ROOT_PASSWORD` 必须强且改默认**，否则 9001 console 任何人都能登（曾出过厂商默认密码爆 PB 级数据的事故）。
- 生产桶**永远开 versioning + lifecycle**，误删能 `mc undo` 恢复；纯 prod 桶配 GOVERNANCE 对象锁。
- 用 `mc mirror --watch` 当实时同步**有 inode 上限**（inotify）；超大目录用 rclone / 定时全量。
- 客户端应用**不要用 root 凭据**，必须创 user + 最小权限 policy + service account。
- multipart 上传中断会留**碎片占地方**（mc ls 看不到）：**所有桶**都加 `AbortIncompleteMultipartUpload` 规则。
- distributed 模式扩容节点必须**整组**（如原 4 节点 → 加 4 个），不能加单节点；扩前先 mc admin info 看 EC 配置。
- mc 的 `--dangerous` flag 是有意设计的"再问一次"，**别想着写 alias 绕过去**。

---

## 20. mongodb-ops

```yaml
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
```

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

## 21. mssql-ops

```yaml
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
```

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

## 22. mysql-ops

```yaml
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
```

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

🔴 **装 MySQL 一律用 `install_app`**——MySQL 在 OpsPub 应用商店目录里，`install_app` = 应用商店 UI 同款：密码 OpsPub 生成并**同步进容器+凭据库（两边一致、必连得上）**、容器规范命名 `opspub-mysql`、绑 `127.0.0.1`、compose 落 `/opt/opspub/stacks/mysql`、**自动登记 `mysql_conn` 凭据并带 SSH 隧道**（「数据库」页即装即连）。

```json
{ "tool": "install_app", "args": { "server": "<别名>", "app": "mysql" } }
```
可选 `version`（如 `"8.4"`）/ `port`（默认 3306，绑 127.0.0.1）。MySQL 是**全机共享设施**：一台机装一套、label 通用名 `MySQL`、第二个项目复用同一套（在它上面建独立库账号，见 opspub-app-deploy 的 `compose.db`）。

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

> 💾 **备份产物统一落 `~/.opspub/backups/`**（OpsPub 远程工作区，便于统一管理 + 后续 SFTP 取回），别散落 `/tmp` 或臆造 `/data/backup`。先 `ssh_exec mkdir -p ~/.opspub/backups`。

```bash
# 单库
mysqldump -u root -p --single-transaction --routines --triggers --events <db> > ~/.opspub/backups/<db>-$(date +%F).sql

# 多库
mysqldump -u root -p --single-transaction --databases db1 db2 > ~/.opspub/backups/multi-$(date +%F).sql

# 全库（含 mysql 系统库）
mysqldump -u root -p --all-databases --single-transaction --master-data=2 > ~/.opspub/backups/all-$(date +%F).sql

# 只导结构
mysqldump -u root -p --no-data <db> > ~/.opspub/backups/<db>-schema.sql

# 只导数据
mysqldump -u root -p --no-create-info <db> > ~/.opspub/backups/<db>-data.sql
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

## 23. nfs-smb-share

```yaml
---
name: nfs-smb-share
description: 网络文件共享速查 —— NFS（exports/mount）+ SMB/CIFS（smb.conf/smbpasswd）+ autofs + 故障排查。
触发词: nfs, nfsv4, exportfs, showmount, smb, cifs, samba, smbpasswd, autofs, 文件共享, 网络盘, 挂载, mount 远程, 装 nfs, 装 samba, 部署 nfs, 部署 samba, 挂载远程, mount 失败, mount 挂不上, 挂不上, 挂载卡死, 挂载卡住, 共享连不上, 访问不了共享, permission denied 挂载, stale file handle, smb 共享, windows 访问 linux, linux 挂 windows 共享, 文件共享给, 共享目录, exports 配置, /etc/exports, fstab, 自动挂载, 中文乱码 共享
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?/etc/exports\b'
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?/etc/samba/smb\.conf\b'
  # exportfs -u(取消单个) / -ua(取消全部) / -uf(强制) —— 客户端瞬间失败
  - '(?:^|[\s;&|])exportfs\s+-[afu]*u[afu]*\b'
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:nfs-server|smbd|nmbd|nfs-kernel-server|rpcbind)\b'
---
```

# nfs-smb-share —— NFS / SMB 网络共享

适用：用户想"装 NFS 共享给多台 Linux"/"装 Samba 给 Windows 用户访问"/"挂载远程文件"/"挂了不通"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, "nfs-server")` / `service_status(server, "smbd")`（任何档位放行，比 ssh_exec 稳）。
- **查端口** → `port_check(server, 2049)`（NFSv4）/ `port_check(server, 445)`（SMB）；NFSv3 还会用到 111。
- **看日志** → `tail_log(server, "/var/log/samba/log.smbd")`；NFS 走 `service_status` 自带的 systemctl 尾部，或 `ssh_exec journalctl -u nfs-server`。
- **改配置** → 先 `sftp_read` 看 `/etc/exports` / `/etc/samba/smb.conf` 现状，再 `sftp_write` 整文件写（无 shell heredoc 转义坑），写完 `ssh_exec sudo exportfs -ra` / `ssh_exec sudo systemctl reload smbd`。
- ⚠️ `sudo mount` / `exportfs -ra` / `systemctl restart` 等写操作会触发**用户审批**——提前告知用户，被拒后不要原样重试。
> 临时挂载点（SSHFS / 验证用的 `mount` 目标）建议落 **`~/.opspub/tmp`**（OpsPub 远程统一工作区），别散落 `/mnt/xxx` 等可能不存在的目录。

## 对照

| 协议 | 适用 |
|------|------|
| **NFS** | Linux ↔ Linux 共享；性能好；权限映射略复杂 |
| **SMB/CIFS** (Samba) | Windows / macOS / Linux 通吃；权限模型直观；性能略低 |
| **SSHFS** | 临时挂载远程目录走 SSH；零配置；性能差 |
| **WebDAV** | HTTP over fs；穿透防火墙简单 |
| **iSCSI** | 块设备共享（不是文件层；像本地硬盘） |

## 一、NFS

### 服务端

```bash
# 装
sudo apt install -y nfs-kernel-server          # Debian/Ubuntu
sudo dnf install -y nfs-utils                  # RHEL/Rocky

# 创建共享目录
sudo mkdir -p /srv/nfs/shared
sudo chown nobody:nogroup /srv/nfs/shared      # 匿名访问；或具体 user

# 配 /etc/exports
sudo tee -a /etc/exports <<EOF
/srv/nfs/shared    10.0.0.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/readonly  *(ro,sync,no_subtree_check)
/srv/nfs/users     10.0.0.0/24(rw,sync,no_subtree_check,no_root_squash,fsid=42)
EOF

# 应用
sudo exportfs -ra                              # 重新读 /etc/exports
sudo exportfs -v                               # 看当前导出

# 启动
sudo systemctl enable --now nfs-server         # RHEL
sudo systemctl enable --now nfs-kernel-server  # Debian
```

### exports 参数

| 参数 | 含义 |
|------|------|
| `rw` / `ro` | 读写 / 只读 |
| `sync` | 同步写（**推荐**；async 性能高但崩溃丢数据） |
| `no_subtree_check` | 跳过子目录检查（默认且推荐） |
| `root_squash` | **默认**：客户端 root 映射为 nobody（**安全**） |
| `no_root_squash` | 关闭压制（容器卷 / 必须 root 写入时用，**谨慎**） |
| `all_squash` | 任何用户都映射为 nobody |
| `anonuid=N` / `anongid=N` | 指定匿名 uid/gid |
| `fsid=N` | NFSv4 必需（每个 export 唯一） |
| `crossmnt` | 跨挂载点也跟随 |

### 客户端挂载

```bash
sudo apt install -y nfs-common                 # Debian
sudo dnf install -y nfs-utils                  # RHEL

# 临时挂
sudo mount -t nfs -o vers=4 nfs-server:/srv/nfs/shared /mnt/shared
# 或更详细
sudo mount -t nfs4 -o rw,hard,intr,timeo=600,retrans=2,vers=4.2 \
    10.0.0.1:/srv/nfs/shared /mnt/shared

# 持久化（/etc/fstab）
10.0.0.1:/srv/nfs/shared  /mnt/shared  nfs4  rw,hard,intr,_netdev,nofail  0  0
```

### NFS 关键挂载参数

| 参数 | 推荐值 / 说明 |
|------|--------------|
| `vers=4.2` | 选版本（4.x 推荐；3 是老协议） |
| `hard` | 服务端不通**永远阻塞**（与 `soft` 互斥；生产推荐 hard + intr） |
| `intr` | hard 模式下允许 ctrl-c 中断 |
| `soft,timeo=30` | 服务端不通 N 秒后报错（数据丢失风险） |
| `_netdev` | 等网络起来再挂（fstab 必加） |
| `nofail` | 挂载失败不阻止开机 |
| `rsize=131072,wsize=131072` | 读写块大小（NFSv4.1+ 默认已大） |
| `noac` | 不缓存元数据（**性能差**但一致性好；高并发写时偶尔需要） |

### 调试

```bash
# 服务端
sudo exportfs -v
sudo systemctl status nfs-server
sudo journalctl -u nfs-server -n 50
ss -tlnp | grep -E ':2049|:111'

# 客户端
showmount -e <nfs-server>                      # 看远端导出列表
sudo nfsstat -m                                # 看已挂的 NFS
sudo rpcinfo -p <nfs-server>                   # NFSv3 才看；v4 不需要 portmap

# 实时性能
nfsiostat 1                                    # nfs-common 提供
```

### 端口（防火墙）

NFSv4 只用 **TCP 2049**（单端口，友好）。NFSv3 还要 `rpc.statd` / `rpc.mountd` 等动态端口。

```bash
# 防火墙开 2049
sudo firewall-cmd --permanent --add-service=nfs && sudo firewall-cmd --reload
sudo ufw allow nfs
```

## 二、Samba (SMB/CIFS)

### 服务端

```bash
sudo apt install -y samba samba-common-bin     # Debian/Ubuntu
sudo dnf install -y samba samba-client         # RHEL/Rocky

sudo mkdir -p /srv/samba/shared
sudo chown -R nobody:nogroup /srv/samba/shared
sudo chmod -R 0775 /srv/samba/shared
```

### /etc/samba/smb.conf

```ini
[global]
workgroup = WORKGROUP
server string = File Server
security = user
map to guest = bad user
log file = /var/log/samba/log.%m
max log size = 50
disable netbios = yes                       # 关 NetBIOS（只用 SMB 现代协议）
client min protocol = SMB2_10
server min protocol = SMB2_10

[shared]
path = /srv/samba/shared
browseable = yes
writable = yes
guest ok = yes                              # 匿名可读写（**仅内网**）
create mask = 0664
directory mask = 0775
force user = nobody

[private]
path = /srv/samba/private
browseable = yes
writable = yes
valid users = @smbusers                     # 系统组 smbusers
create mask = 0660
directory mask = 0770

[homes]                                     # 每个用户自动有 \\server\username
comment = Home Directories
browseable = no
writable = yes
```

### 用户管理

```bash
# Samba 用户必须先是系统用户
sudo useradd -M -s /sbin/nologin samba_alice
sudo smbpasswd -a samba_alice               # 加 samba 密码（独立于系统密码）
sudo smbpasswd -e samba_alice               # 启用
sudo smbpasswd -d samba_alice               # 禁用
sudo smbpasswd -x samba_alice               # 删除
sudo pdbedit -L                             # 列 samba 用户
```

### 操作

```bash
sudo testparm                               # 检查 smb.conf 语法
sudo systemctl restart smbd nmbd
sudo systemctl status smbd

# 列谁连进来
sudo smbstatus
sudo smbstatus -L                           # 锁
sudo smbstatus -p                           # 进程
```

### Linux 客户端挂载

```bash
sudo apt install -y cifs-utils

sudo mount -t cifs //smb-server/shared /mnt/smb \
    -o username=alice,password=xxx,uid=1000,gid=1000,vers=3.0,iocharset=utf8

# 凭据写文件（**chmod 600**）
echo 'username=alice
password=xxx' | sudo tee /etc/samba/credentials.alice
sudo chmod 600 /etc/samba/credentials.alice

# fstab
//smb-server/shared  /mnt/smb  cifs  credentials=/etc/samba/credentials.alice,uid=1000,gid=1000,vers=3.0,_netdev,nofail  0  0
```

### Windows 客户端

```
文件资源管理器 → 输入 \\smb-server\shared
```

### 端口（防火墙）

SMB 默认 **445**（不要开 137/138/139 老 NetBIOS）。

```bash
sudo firewall-cmd --permanent --add-service=samba && sudo firewall-cmd --reload
sudo ufw allow samba
```

## 三、autofs（自动挂载）

按需挂载，不用 fstab 永久挂；适合"几十个共享、按需访问"：

```bash
sudo apt install -y autofs

# /etc/auto.master
/mnt/auto  /etc/auto.shares  --timeout=600

# /etc/auto.shares
data     -fstype=nfs4,rw,hard,intr     10.0.0.1:/srv/nfs/data
backup   -fstype=cifs,vers=3.0,credentials=/etc/samba/cred  ://smb-server/backup
```

```bash
sudo systemctl restart autofs
cd /mnt/auto/data                          # 第一次 cd 时触发挂载；timeout 后自动卸载
```

## 四、常见故障

### NFS

**Q: `mount.nfs: Connection refused`**
- 服务端没启动 `nfs-server`
- 防火墙没开 2049
- 服务端 `bindIp` 类配置限制了

**Q: `mount.nfs: access denied by server`**
- 客户端 IP 不在 `/etc/exports` 网段
- 服务端忘了 `exportfs -ra`

**Q: 客户端能挂但写入"Permission denied"**
- `root_squash` 把 root 压成 nobody，但目录没给 nobody 写权限
- 服务端 SELinux：`setsebool -P nfs_export_all_rw 1`

**Q: 客户端断网后命令永远卡死**
- 用了 `hard` 没加 `intr`；现代 kernel 用 `soft,timeo=30` 替代

### Samba

**Q: Windows 看不到共享**
- workgroup 不匹配
- SMB1 已禁用但 Windows 老版本只懂 SMB1（升 SMB2/3）
- 防火墙 445 没开

**Q: 挂载报 `mount error(13): Permission denied`**
- 用户名 / 密码错（`smbpasswd -a` 加过了吗）
- `valid users` 限制

**Q: 中文文件名乱码**
- 挂载加 `iocharset=utf8`
- smb.conf 加 `unix charset = UTF-8`

## 路径速查表

| 内容 | 路径 |
|------|------|
| NFS exports | `/etc/exports` |
| NFS 服务端配置 | `/etc/nfs.conf`（或 `/etc/default/nfs-kernel-server` Debian） |
| Samba 主配置 | `/etc/samba/smb.conf` |
| Samba 用户库 | `/var/lib/samba/`（tdb 文件） |
| autofs | `/etc/auto.master` + `/etc/auto.*` |
| 默认 NFS 端口 | 2049 (TCP)；NFSv3 还有 portmap 111 + 动态 |
| 默认 SMB 端口 | 445 (TCP)；老 NetBIOS 137/138/139 应关 |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm /etc/exports` / `rm /etc/samba/smb.conf` | 删配置文件 |
| `exportfs -uf` (`-u` 取消导出 + `-f` 强制) | 移除全部 export，客户端瞬间失败 |
| `systemctl stop nfs-server / smbd nmbd` | 所有客户端断开 |
| Samba 共享 `path = /` + `guest ok = yes` | **公开 root 文件系统**（每年都有事故） |
| NFS export `no_root_squash` 给公网 | 客户端 root 可写服务端任意文件 |
| 改 SMB `min protocol = SMB1` | 历史漏洞协议（永恒之蓝家族） |
| 客户端 `mount -o vers=1.0` | 同上 |

## 教训

- **NFS / SMB 都是内网协议**：不要直接暴露公网；想跨外网用 VPN（WireGuard）封装。
- NFS 服务端的 UID/GID **与客户端要一致**（或开 idmapd 做 NFSv4 name 映射），否则文件 owner 都是 nobody。
- `hard` + `intr` 是 NFS 客户端最稳的组合；用 `soft` 数据写一半服务端断 = 文件损坏。
- Samba **默认开 SMB1 协议**老版本设备能连但有漏洞；新部署强制 `client/server min protocol = SMB2_10` 起步。
- `exportfs -v` 一定要做：改 `/etc/exports` 不 `exportfs -ra` = 没生效。
- `_netdev,nofail` 在 fstab 是经典经验：网络挂载失败不会卡开机。
- 大量小文件性能 NFS > SMB；流式视频 / 大文件性能差不多；Windows 客户端必须 SMB。
- autofs 太适合"开发者 home 自动挂"或"backup 间歇性访问"——避免开机挂一堆没用的 share 拖慢启动。

---

## 24. nginx-status

```yaml
---
name: nginx-status
description: Nginx 排障速查 —— 状态/语法/端口/日志/reload + 反代/upstream/证书路径。
触发词: nginx, 502, 503, 504, bad gateway, gateway timeout, nginx 起不来, nginx 报错, nginx 重启, nginx -t, upstream, 反向代理, 反代, 静态资源, 网站打不开, 网页打不开, 网站访问不了, 网站挂了, 访问不了, 连接被拒, connection refused, 域名打不开, nginx 配置不生效, nginx reload, nginx -s reload, nginx 端口被占, 80 端口, 443 端口, ssl_certificate, server_name, location 匹配, try_files, proxy_pass, client_max_body_size, 上传大文件失败, 413, request entity too large, 太大, 413 报错
dangerous_commands:
  - '(?:^|[\s;&|])nginx\s+-s\s+stop(?:\s|$)'
  - '(?:^|[\s;&|])(?:kill|killall)\s+-9\s+nginx(?:\s|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/etc/nginx(?:\s|/|$)'
  # 删 Let's Encrypt 证书目录 / 站点配置目录 = 站点直接挂 + 证书丢失
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/etc/letsencrypt(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/etc/nginx/(?:conf\.d|sites-enabled|sites-available)(?:\s|/|$)'
  # systemctl stop/disable nginx = 全站下线
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+nginx\b'
---
```

# nginx-status —— nginx 排障速查

适用：用户报 nginx 起不来 / 502 / 504 / 反向代理失败 / 改完配置不生效 / 想看 upstream 命中哪台后端 / 证书路径。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 nginx 服务状态 | `service_status(server, "nginx")` | systemctl status |
| 看错误日志 | `tail_log(server, "/var/log/nginx/error.log")` | tail -n |
| 看访问日志 | `tail_log(server, "/var/log/nginx/access.log")` | tail -n |
| 查 80/443 谁在监听 | `port_check(server, 80)` / `port_check(server, 443)` | ss -tlnH |
| 看现有配置 | `sftp_read(server, "/etc/nginx/conf.d/xxx.conf")` | cat |
| **改/加站点配置** | `sftp_read` 看现状 + `sftp_write` 整文件写 | —— |

这些只读工具**任何策略档位都放行**（含 readonly 档）。**改 nginx 配置优先 `sftp_read`+`sftp_write` 整文件写**（无 shell 转义坑），别用 `echo >>` / `sed -i` 拼 conf——一处引号/分号错就能把整站搞挂。写完再走第五步 reload。

⚠️ **铁律：`sftp_write` 改完配置，先 `ssh_exec sudo nginx -t` 校验，通过了再 reload**——配置语法坏的 reload 虽不挂旧进程，但你以为生效了其实没生效，更隐蔽。`sudo nginx -t` / `sudo systemctl reload nginx` 含 sudo 会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

> 证书私钥（`*.key` / `privkey.pem`）在 SFTP 写黑名单里，**OpsPub 禁止 AI 写私钥文件**——涉及私钥的步骤交给用户自己处理，AI 只读不写。

## 第一步：服务状态

```bash
systemctl status nginx
```

看「active (running)」还是「failed」。`failed` 跳到第四步看日志。

## 第二步：配置语法（**改配置必跑**）

```bash
sudo nginx -t
```

输出 `syntax is ok` + `test is successful` 才算 OK。任何 `[emerg]` 或 `error` 都要先解决。

定位实际加载的 conf 路径：

```bash
nginx -V 2>&1 | tr ' ' '\n' | grep --color=never conf-path
```

## 第三步：监听端口

```bash
ss -tlnp | grep -E ':80|:443'
```

确认 nginx 占着预期端口。被别的进程占（如 apache、node）→ 先 kill 它或换端口。

## 第四步：错误日志

```bash
sudo tail -n 50 /var/log/nginx/error.log
journalctl -u nginx -n 50 --no-pager
```

常见错误：

| 日志特征 | 原因 | 解决 |
|---------|------|------|
| `bind() to 0.0.0.0:80 failed (98: Address already in use)` | 端口被占 | `ss -tlnp \| grep :80` 找占用 |
| `[emerg] open() ".../..." failed (13: Permission denied)` | SELinux / 文件权限 | `sealert -a /var/log/audit/audit.log` 或改权限 |
| `upstream timed out (110: Connection timed out)` | 后端服务挂了 / 防火墙拦 | 进后端服务器 `curl -v 127.0.0.1:<端口>` |
| `connect() to unix:/.../*.sock failed (2: No such file or directory)` | upstream socket 缺失 | 启动后端（如 php-fpm） |
| `SSL_do_handshake() failed ... unknown protocol` | 后端不是 https 但配了 `proxy_pass https://` | 改 http |
| `worker_connections are not enough` | 连接数超 worker_connections | 调大或减少 keepalive |

## 第五步：reload / restart

```bash
sudo nginx -t && sudo systemctl reload nginx   # 推荐：reload 不断连接
```

`reload` 优于 `restart` —— 不断现有连接。配置语法坏的 reload 会**保留旧配置不挂**，但 restart 会直接挂掉服务。

## 第六步：反向代理 / upstream 排障

定位某条请求命中哪个 upstream：

```bash
# 加日志变量到 access_log
log_format upstream_log '$remote_addr $request $upstream_addr $upstream_response_time $upstream_status';
```

实时观察：

```bash
tail -f /var/log/nginx/access.log | awk '{print $NF, $0}'   # 后端响应时间一目了然
```

upstream 节点健康：

```nginx
upstream backend {
    server 10.0.0.1:8080 max_fails=3 fail_timeout=30s;
    server 10.0.0.2:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}
```

`max_fails=3 fail_timeout=30s` = 30 秒内 3 次失败就摘掉 30 秒。

## 第七步：路径速查表

| 内容 | 默认路径（按发行版可能变化） |
|------|-----------------------------|
| 二进制 | `/usr/sbin/nginx`、`/usr/local/nginx/sbin/nginx`、`/usr/local/openresty/nginx/sbin/nginx` |
| 主配置 | `/etc/nginx/nginx.conf` 或 OpenResty `/usr/local/openresty/nginx/conf/nginx.conf` |
| 站点配置 | `/etc/nginx/conf.d/*.conf` 或 `/etc/nginx/sites-enabled/*` |
| 错误日志 | `/var/log/nginx/error.log` |
| 访问日志 | `/var/log/nginx/access.log` |
| 临时文件 | `/var/cache/nginx/`（client_body / proxy / fastcgi） |
| pid | `/run/nginx.pid` 或 `/var/run/nginx.pid` |
| 证书（Let's Encrypt） | `/etc/letsencrypt/live/<domain>/{fullchain,privkey}.pem` |

定位实际的：`nginx -V 2>&1 \| tr ' ' '\n' \| grep --color=never -E 'path|prefix'`

## 第八步：reopen 日志（logrotate 配套）

```bash
# logrotate 切日志后需要 reopen，否则 nginx 仍写旧 fd
sudo nginx -s reopen
# 或
sudo kill -USR1 $(cat /run/nginx.pid)
```

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `nginx -s stop` | **强停**，立刻断所有连接（生产建议用 systemctl stop 至少给优雅退出） |
| `kill -9 nginx` | 同上更暴力，且 pid 文件不会清，下次启动可能失败 |
| `rm -rf /etc/nginx` | 删全部配置，**不可恢复** |
| `chmod -R 777 /etc/nginx` | 让 nginx 配置被任何人改 |

## 教训

- 任何「重启 nginx」前**必须先 `nginx -t`**。配置坏的 reload 会保留旧配置不挂；但 restart 会直接挂掉。
- SELinux/AppArmor 引起的 13 错误，用 `sealert` / `aa-status` 看具体规则，不要盲目 `chmod 777`。
- 改 conf 后 `nginx -s reload` 不生效，多半是改错了 conf（不是 `nginx -V` 报告的路径）或者改的是 `include` 但 include 路径不对。
- 502 = 后端有响应但出错（upstream 返回了非 2xx/3xx，常见后端挂了/超时）；504 = 后端完全没响应。两者排障路径不同。

---

## 25. nodejs-pm2

```yaml
---
name: nodejs-pm2
description: Node.js 部署速查 —— nvm/fnm 版本管理 + PM2 进程守护 + ecosystem 配置 + cluster 模式 + 日志。
触发词: node, nodejs, npm, pnpm, yarn, pm2, nvm, fnm, ecosystem, cluster mode, node 进程守护, node 部署, npm install, pm2 logs, node 22, node lts, 装 node, 装 npm, 装 pnpm, node 起不来, node 挂了, node 内存泄漏, pm2 重启, pm2 reload, pm2 起不来, 零停机部署, ecosystem.config, package.json, npm 慢, npm 镜像, registry 镜像, taobao npm, npmmirror, corepack, node 服务挂了, node 进程没了, node 占内存, node 爆内存
dangerous_commands:
  - '(?i)\bpm2\s+(?:delete|del)\s+all\b'
  - '(?i)\bpm2\s+(?:kill|reset)\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.pm2|/root/\.pm2)(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.nvm|node_modules)(?:\s|/|$)'
  - '(?i)\bpm2\s+(?:stop|delete|del)\s+all\b'
---
```

# nodejs-pm2 —— Node.js 部署运维

适用：用户部署 Node 应用；想"装 node"/"切版本"/"用 pm2 守护进程"/"日志在哪"/"内存泄漏"/"零停机部署"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 pm2 进程列表 / 应用状态** → 不需要 sudo（pm2 在用户态）：`ssh_exec(server, "pm2 jlist")`（JSON 输出，比 `pm2 list` 表格好解析）或 `ssh_exec(server, "pm2 status")`。若用 systemd 托管则 `service_status(server, "<app>")`（任何档位放行）。
- **看应用日志** → `tail_log(server, "~/.pm2/logs/<app>-error.log")` / `tail_log(server, "~/.pm2/logs/<app>-out.log")`（任何档位放行，比 `pm2 logs` 实时流稳）；ecosystem 自定义了 `error_file`/`out_file` 就读那个路径。
- **查端口被谁占** → `port_check(server, 3000)`（看 Node 端口监听）。
- **看内存/磁盘**（pm2 日志撑爆磁盘很常见）→ `system_info(server)` + `disk_usage(server, "~/.pm2/logs")`。
- **改 ecosystem.config.js / systemd unit** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell 转义坑），写完再 `ssh_exec ... pm2 reload` / `sudo systemctl daemon-reload`。
- ⚠️ pm2 在用户态的 `restart`/`reload`/`logs` 多数**不需要 sudo**，能直接点出；但 `pm2 startup`、`systemctl daemon-reload/restart`、装全局包 `npm install -g` 含 `sudo` 的会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## 第一步：Node 版本管理

不要用包管理器装 Node（apt/dnf 版本太老）；用 nvm / fnm / Volta：

### nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# 重新登录或 source ~/.bashrc

nvm install --lts                                # 装最新 LTS
nvm install 20                                   # 装 v20.x 最新
nvm install 18.19.0                              # 精确版本
nvm use 20
nvm alias default 20
nvm ls                                           # 已装版本
nvm ls-remote --lts                              # 可装版本
```

### fnm（Rust 实现，比 nvm 快得多）

```bash
curl -fsSL https://fnm.vercel.app/install | bash
fnm install --lts
fnm use 20
fnm default 20
```

### corepack（管理 pnpm / yarn 版本）

```bash
corepack enable                                  # Node 16.10+ 内置
corepack prepare pnpm@9.0.0 --activate
corepack prepare yarn@4.0.0 --activate
```

## 第二步：包管理

```bash
npm install                                      # 按 package-lock.json
npm ci                                           # **生产推荐**：严格按 lock + 不修改
npm install --omit=dev                           # 仅 production deps
npm install --save-exact <pkg>                   # 精确版本（不带 ^）
npm prune --production                           # 删 dev deps
npm outdated
npm audit
npm audit fix

# pnpm（推荐：磁盘省 + 速度快）
pnpm install --frozen-lockfile                   # 等同 npm ci
pnpm install --prod
pnpm store prune                                 # 清 store

# yarn 4
yarn install --immutable
```

## 第三步：PM2 基础

### 装

```bash
npm install -g pm2
# 或 pnpm
pnpm add -g pm2
```

### 常用命令

```bash
pm2 start app.js --name myapp
pm2 start app.js --name myapp -i max             # cluster 模式（按 CPU 核数）
pm2 start app.js --name myapp -i 4               # 4 个 worker
pm2 list                                          # 进程列表
pm2 status
pm2 logs myapp                                   # 实时日志
pm2 logs myapp --lines 200
pm2 logs --err                                   # 仅错误
pm2 monit                                        # 交互式监控

pm2 restart myapp
pm2 reload myapp                                  # 零停机（cluster 模式才有意义）
pm2 stop myapp
pm2 delete myapp
pm2 describe myapp                                # 详情（pid / args / cwd / env）

pm2 save                                         # 保存当前进程列表
pm2 startup                                      # 生成开机启动脚本（**重启后进程自动恢复**）
pm2 unstartup
pm2 resurrect                                    # 手工恢复上次 save 的进程列表
```

### Ecosystem 文件（推荐生产用）

```js
// ecosystem.config.js
module.exports = {
    apps: [
        {
            name: 'myapp',
            script: './dist/main.js',
            cwd: '/opt/myapp',
            instances: 'max',                  // 'max' / 整数 / 1
            exec_mode: 'cluster',              // 'cluster' / 'fork'
            watch: false,                       // 生产关
            max_memory_restart: '1G',           // 超 1G 自动重启
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            env_production: {
                NODE_ENV: 'production',
            },
            error_file: '/var/log/myapp/error.log',
            out_file: '/var/log/myapp/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            time: true,
            merge_logs: true,
            kill_timeout: 5000,                 // SIGTERM 后等 5s 再 SIGKILL
            wait_ready: true,                   // 等 process.send('ready')
            listen_timeout: 10000,
        }
    ]
};
```

```bash
pm2 start ecosystem.config.js --env production
pm2 reload ecosystem.config.js --env production    # 零停机更新
```

## 第四步：Cluster 模式

`exec_mode: cluster` + `instances: N` = pm2 拉起 N 个 worker（Node cluster 模块），共享端口，按 round-robin 负载。

```js
// app.js 不需要改 —— PM2 自动用 cluster 模块
// 但要支持 graceful shutdown：
process.on('SIGTERM', async () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);   // 兜底
});

// 配合 wait_ready: true
process.send && process.send('ready');
```

## 第五步：零停机部署

```bash
# 用 reload（cluster 模式有效）—— 逐个重启 worker，保持端口被监听
pm2 reload myapp

# 应用：把代码 cp / git pull 到部署目录 → npm ci/pnpm install --prod → reload
cd /opt/myapp
git pull --ff-only
pnpm install --frozen-lockfile --prod
pm2 reload ecosystem.config.js --env production
```

> ⚠️ `pm2 restart` 是先 stop 再 start（**有停机时间**），不是 reload。

## 第六步：日志管理

```bash
pm2 logs --lines 500
pm2 logs myapp --raw                             # 不带 PM2 前缀
pm2 flush                                        # 清所有日志（⚠️ 走审批）
pm2 reloadLogs                                   # 给应用发 SIGUSR2 让它重开 log fd（配 logrotate）

# 让 pm2 配合 logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD
```

日志路径：

| 类型 | 默认位置 |
|------|---------|
| stdout | `~/.pm2/logs/<app>-out.log` |
| stderr | `~/.pm2/logs/<app>-error.log` |
| PM2 自己 | `~/.pm2/pm2.log` |

ecosystem 里指定的 `out_file` / `error_file` 覆盖默认。

## 第七步：内存泄漏 / 性能诊断

```bash
# 实时
pm2 monit

# Heap snapshot
node --inspect=0.0.0.0:9229 app.js               # 然后 chrome://inspect 接入
# 远端：先 ssh 隧道
ssh -L 9229:127.0.0.1:9229 user@host

# 触发 GC（V8 暴露）
node --expose-gc app.js                          # 应用里 global.gc()

# Clinic.js（套件）
npm install -g clinic
clinic doctor -- node app.js                     # 诊断
clinic flame -- node app.js                      # 火焰图
clinic bubbleprof -- node app.js                 # 异步分析
```

## 第八步：systemd 替代 / 配合

PM2 自带 `pm2 startup` 生成 systemd unit；也可以**完全用 systemd**（不用 pm2）：

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node App
After=network.target

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/opt/myapp
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/myapp/dist/main.js
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

systemd 优点：与系统 logging / cgroups 一体；缺点：没 cluster 自动负载，多 worker 要自己 nginx 反代。

## 路径速查表

| 内容 | 路径 |
|------|------|
| PM2 全局数据 | `~/.pm2/`（含 logs / pids / dump.pm2） |
| PM2 进程列表（用于 resurrect） | `~/.pm2/dump.pm2` |
| nvm | `~/.nvm/` |
| fnm | `~/.local/share/fnm/` |
| node 二进制（nvm） | `~/.nvm/versions/node/v20.x.x/bin/node` |
| npm 全局包 | `~/.nvm/versions/node/v20.x.x/lib/node_modules/` 或 `~/.npm-global/` |
| pnpm store | `~/.local/share/pnpm/store/` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `pm2 delete all` / `pm2 kill` | 删所有 pm2 管理的应用 / 杀 pm2 主进程 |
| `pm2 reset` | 重置 pm2（计数 / metadata） |
| `rm -rf ~/.pm2` | 删 pm2 状态 + 日志 + dump |
| `rm -rf node_modules` 然后无 lock 文件 | 重装拿到新版本，**可能引入 breaking change** |
| `npm install <pkg>@latest` 生产 | 不锁版本，CI 一次绿不代表下次还绿 |
| `pm2 flush` 生产高峰 | 删日志（事后排查没材料） |
| `pm2 startup` 配错用户 | 开机用 root 跑应用（**安全风险**） |

## 教训

- 用 `npm ci` / `pnpm install --frozen-lockfile` 而**不是** `npm install`，确保 CI 与生产装的是**一字不差**的 lock 内容。
- PM2 cluster 模式 reload 是**逐个 worker 重启 + 等新 worker ready**；这要求应用支持优雅 shutdown（处理 SIGTERM）+ readiness 通知（process.send('ready')）。
- `instances: 'max'` 在容器里**会算错**（默认拿宿主 CPU 数），用整数显式指定。
- 日志默认在 `~/.pm2/logs/` —— **磁盘满了多半是这里**；装 `pm2-logrotate` 自动切。
- `max_memory_restart: '1G'` 是兜底，不是替代 leak 排查；持续被重启 = 应该查 heap snapshot。
- 不要在容器里同时跑 PM2 + cluster —— **容器一个进程一个应用**，扩展靠 K8s replica / docker compose scale。
- nvm 在 zsh / bash 里启动慢（每次 source 都跑很多东西），切 fnm 启动快 10x。

---

## 26. ollama-vllm

```yaml
---
name: ollama-vllm
description: 本地 LLM 部署速查 —— Ollama（开箱即用）+ vLLM（高性能推理）+ TGI / llama.cpp。
触发词: ollama, vllm, llama.cpp, llama-cpp-python, text generation inference, tgi, lmdeploy, sglang, 本地 llm, 本地大模型, gguf, gpu 推理, cpu 推理, 模型部署, openai api 兼容, llama 3.3, llama 3.2, qwen 2.5, qwen 3, deepseek v3, deepseek r1, mistral, phi-4, gemma 2, 装 ollama, 部署 ollama, ollama 跑, ollama pull, ollama serve, ollama list, 自托管 llm, 离线大模型, 显存不够, vram, 量化模型, q4_k_m, q5_k_m, q8_0, awq, gptq, tensor parallel, 高并发推理, 推理服务, openwebui, lobe chat, dify, ollama 挂了, ollama 起不来, vllm 挂了, vllm 起不来, 模型加载失败, 推理慢, 显存爆了, 显存满了, gpu 占满, 模型删了
dangerous_commands:
  - '(?:^|[\s;&|])ollama\s+rm\s+'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.ollama|/usr/share/ollama)(?:\s|/|$)'
  - '(?:^|[\s;&|])OLLAMA_HOST\s*=\s*0\.0\.0\.0\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.cache/huggingface|~/\.ollama/models)(?:\s|/|$)'
---
```

# ollama-vllm —— 本地 LLM 部署

适用：用户想"自托管开源 LLM"/"接 OpsPub 内置对话页"/"装 ollama 跑 llama / qwen / deepseek"/"vLLM 高性能服务"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Ollama 优先用 `install_app(server, "ollama")`**（Ollama 在 OpsPub 应用商店目录里，另有 `open-webui`）——应用商店同款：进「容器/编排」台账、容器规范命名、绑 127.0.0.1。下面的手动 `docker run` 仅作教学 / 自定义（如 GPU/vLLM，目录里没有）fallback（手装的**不进台账、工作台看不到**）。

- **看推理服务状态** → Ollama 用 `service_status(server, "ollama")`；vLLM 多为 docker 容器，用 `ssh_exec(server, "docker ps --filter name=vllm")`（任何档位放行的 `service_status` 不覆盖容器）。
- **看推理日志** → systemd Ollama：`ssh_exec(server, "journalctl -u ollama -n 200 --no-pager")`；vLLM 容器：`ssh_exec(server, "docker logs --tail 200 vllm")`；落了文件就 `tail_log(server, "<path>")`（任何档位放行）。
- **查 API 端口** → `port_check(server, 11434)`（Ollama）/ `port_check(server, 8000)`（vLLM/llama.cpp）确认服务在监听。
- **看显存 / 磁盘**（模型几十 GB，最容易爆磁盘 / 显存）→ 显存 `ssh_exec(server, "nvidia-smi")`；磁盘 `disk_usage(server, "~/.ollama")` / `disk_usage(server, "~/.cache/huggingface")`（任何档位放行）。
- **改 Ollama systemd unit（设 `OLLAMA_HOST`/`OLLAMA_MODELS` 等）/ vLLM 启动脚本** → `sftp_read` 看现状 + `sftp_write` 整文件写，写完 `ssh_exec sudo systemctl daemon-reload`。
- ⚠️ `ollama pull <大模型>` 会下载几十 GB（先 `disk_usage` 确认空间，且可能超 30s `ssh_exec` 超时——建议 nohup 后台拉 + `tail_log` 看进度）；`ollama rm` / `systemctl restart`（含 sudo）会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## 选型对照

| 工具 | 强项 | 弱项 | 适合 |
|------|------|------|------|
| **Ollama** | 一键开箱、CLI 简洁、模型管理像 docker pull | 性能中等、batch 弱 | 个人 / 小团队 / 演示 |
| **vLLM** | 极高吞吐 + Continuous Batching | 配置复杂 / 显存占用大 | 生产 OpenAI 兼容服务 |
| **TGI (HuggingFace)** | 商业支持 + 多平台 | 闭源限速；Apache 2.0 旧版 OK | HF Ecosystem 用户 |
| **llama.cpp** | 纯 CPU / 小内存可跑 | 速度慢；GPU 加速能力一般 | 边缘 / 树莓派 / Mac M 系列 |
| **LMDeploy** / **SGLang** | 中文社区活跃；Triton / FastTransformer 优化 | 文档较少 | 国内 NLP 团队 |

## 一、Ollama

### 装

```bash
# Linux 一键
curl -fsSL https://ollama.com/install.sh | sh

# Docker
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama \
    --gpus=all \                          # 有 NVIDIA GPU 加上
    ollama/ollama
```

### 拉模型 / 运行

```bash
ollama list                                # 已下载
ollama pull qwen2.5:7b                     # 拉模型（默认 q4_K_M 量化）
ollama pull qwen2.5:7b-instruct-q5_K_M     # 显式量化
ollama pull llama3.2
ollama pull deepseek-coder-v2
ollama pull bge-m3                         # embedding 模型
ollama show qwen2.5:7b                     # 看 modelfile / 参数

# 跑（交互）
ollama run qwen2.5:7b
ollama run qwen2.5:7b "你好"

# 删模型
ollama rm qwen2.5:7b                       # ⚠️ 走审批
```

### HTTP API（OpenAI 兼容）

Ollama 监听 `:11434`：

```bash
# Chat
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:7b",
  "messages": [{"role": "user", "content": "你好"}],
  "stream": false
}'

# OpenAI 兼容路径
curl http://localhost:11434/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{
      "model": "qwen2.5:7b",
      "messages": [{"role": "user", "content": "你好"}]
    }'
```

> 在 OpsPub「LLM Profile」里配 endpoint = `http://<host>:11434/v1`，base = openai-compatible，key 随便填即可。

### 自定义模型（Modelfile）

```dockerfile
# Modelfile
FROM qwen2.5:7b
PARAMETER temperature 0.3
PARAMETER num_ctx 16384
SYSTEM """
你是 Linux 运维助手；回答时优先给具体命令。
"""
```

```bash
ollama create my-ops -f Modelfile
ollama run my-ops
```

### 远程访问

```bash
# 默认 127.0.0.1，要远程访问改：
OLLAMA_HOST=0.0.0.0 ollama serve          # ⚠️ 公网暴露 = 任何人能用你的 GPU；**必加防火墙白名单**
# 或 systemd unit：Environment=OLLAMA_HOST=0.0.0.0
```

### 路径

| 内容 | 路径 |
|------|------|
| 模型 / blob | `~/.ollama/models/`（用户安装） / `/usr/share/ollama/.ollama/models/`（系统级） |
| 配置 | 环境变量为主：`OLLAMA_HOST`, `OLLAMA_MODELS`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_PARALLEL` |
| API | `:11434` |
| systemd | `ollama` |

## 二、vLLM

### 装

```bash
# Python 3.10-3.12
pip install vllm                          # 需要 CUDA 12.1+ / 兼容 GPU

# 或 Docker（推荐生产）
docker pull vllm/vllm-openai:latest
```

### 跑（OpenAI 兼容服务）

```bash
# 单 GPU
docker run -d --runtime nvidia --gpus all \
    -v ~/.cache/huggingface:/root/.cache/huggingface \
    -p 8000:8000 \
    --name vllm \
    vllm/vllm-openai:latest \
    --model Qwen/Qwen2.5-7B-Instruct \
    --tensor-parallel-size 1 \
    --gpu-memory-utilization 0.9

# 多 GPU（tensor parallel）
docker run ... \
    vllm/vllm-openai:latest \
    --model Qwen/Qwen2.5-72B-Instruct-AWQ \
    --tensor-parallel-size 4 \
    --quantization awq

# 国内 HF 镜像
docker run -e HF_ENDPOINT=https://hf-mirror.com ...
```

### 关键参数

| 参数 | 用途 |
|------|------|
| `--model` | HF model id 或本地路径 |
| `--tensor-parallel-size N` | 张量并行（按 GPU 数；70B 模型至少 2） |
| `--gpu-memory-utilization 0.9` | 占多少显存（默认 0.9） |
| `--max-model-len 32768` | 最大上下文（受显存限制） |
| `--quantization awq` / `gptq` / `fp8` | 量化（省显存） |
| `--enforce-eager` | 不用 CUDA graph（调试） |
| `--api-key sk-xxx` | 鉴权 |
| `--served-model-name foo` | 别名 |
| `--dtype bfloat16` / `float16` | 精度 |
| `--max-num-seqs 256` | 并发请求数 |

### 调用

```bash
curl http://localhost:8000/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer <API-KEY>' \
    -d '{
      "model": "Qwen/Qwen2.5-7B-Instruct",
      "messages": [{"role": "user", "content": "你好"}]
    }'

curl http://localhost:8000/v1/models       # 列出 served model
curl http://localhost:8000/health
```

### 路径

| 内容 | 路径 |
|------|------|
| HF 模型缓存 | `~/.cache/huggingface/hub/` |
| vLLM 日志 | docker logs / stdout |
| Prometheus metrics | `:8000/metrics` |

## 三、llama.cpp（纯 CPU / 边缘）

```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp && make -j

# 下载 GGUF 模型
huggingface-cli download Qwen/Qwen2.5-7B-Instruct-GGUF qwen2.5-7b-instruct-q4_k_m.gguf --local-dir ./models

# 启动 OpenAI 兼容服务
./build/bin/llama-server -m ./models/qwen2.5-7b-instruct-q4_k_m.gguf \
    --host 0.0.0.0 --port 8080 \
    -c 4096 \
    -ngl 99                              # 全部 layer offload 到 GPU
```

Apple Silicon / Mac M 系列 / 老 PC 上**只能用 llama.cpp**（CPU + Metal）。

## 四、监控

### vLLM Prometheus 指标

`:8000/metrics` 提供：

| 指标 | 含义 |
|------|------|
| `vllm:num_requests_running` | 在跑请求数 |
| `vllm:num_requests_waiting` | 排队数（高 = 满载） |
| `vllm:gpu_cache_usage_perc` | KV cache 利用率 |
| `vllm:time_to_first_token_seconds` | TTFT |
| `vllm:time_per_output_token_seconds` | 单 token 耗时 |

### Ollama 监控

Ollama 没原生 metrics endpoint；用 nvidia-smi / DCGM exporter 看 GPU。

## 五、性能调优要点

| 场景 | 推荐 |
|------|------|
| 单用户聊天 | Ollama 够 |
| 内部 API（10 用户以下） | Ollama 或 vLLM 单卡 |
| 生产 API（高 QPS） | vLLM + AWQ/GPTQ 量化 |
| 翻译 / RAG 长文档 | vLLM `--max-model-len 32768+` |
| 代码补全 | DeepSeek-Coder / Qwen2.5-Coder 系列 |
| Embedding | bge-m3 / bge-large（Ollama 也支持 embedding 模型） |
| Mac M 系列 | llama.cpp（Metal）/ LM Studio / Ollama 也行 |

## 六、危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `ollama rm <model>` | 删模型本地副本（大模型重新下载几十 GB） |
| `OLLAMA_HOST=0.0.0.0` + 无防火墙 | 公网任何人可用你的 GPU（**算力被白嫖** + 隐私数据外泄风险） |
| `rm -rf ~/.ollama` | 删全部本地模型 |
| vLLM `--api-key=""` + 公网暴露 | 同上 |
| `--gpu-memory-utilization 1.0` | 显存吃满，OS / 其他进程被 OOM |
| 多个 vLLM 实例共享 GPU 但都占满 | 互相 OOM |

## 教训

- **本地 LLM 服务永远绑 127.0.0.1**（或私有网卡），公网暴露要加 API key + WAF。
- Ollama 适合**单用户低 QPS**；并发请求会排队，**不是为多用户高并发设计**。
- vLLM **HuggingFace 模型下载慢**用 `HF_ENDPOINT=https://hf-mirror.com`；国内可达。
- `--gpu-memory-utilization` 设 0.85-0.9 留余地，**1.0 是 OOM 邀请函**。
- 量化首选顺序：`AWQ ≈ GPTQ > GGUF q4_K_M > FP16`；4-bit 量化质量损失通常 < 5%。
- Ollama 模型版本约定：`<name>:<size>[-<quant>]`；同名版本 `pull` 会覆盖；想固定版本用 digest。
- 大于 70B 模型**单卡跑不动**，至少 2×80GB（A100/H100）+ tensor parallel；预算有限优先量化（72B → AWQ 4bit ≈ 40GB）。
- OpsPub 的「LLM Profile」可以同时配多个 endpoint —— 调试用 Ollama，生产切 vLLM 不用动代码。

---

## 27. openresty-lua

```yaml
---
name: openresty-lua
description: OpenResty (Nginx + LuaJIT) 速查 —— 配置目录约定 / resty CLI / Lua 鉴权 / WAF / 动态路由 / 安全 reload。
触发词: openresty, resty, lua, lua_shared_dict, ngx_lua, content_by_lua, access_by_lua, waf, openresty 重启, openresty 报错, openresty 起不来, lua 脚本, lua 鉴权, ngx.shared, ngx.timer, lua-resty, resty.http, modsecurity, naxsi, 动态路由, 灰度发布, ab 测试, 限流, 接口限流, lua 限流, openresty waf, nginx 脚本, api 网关, 网关
dangerous_commands:
  - '(?i)(?:^|[\s;&|])(?:openresty|nginx)\s+-s\s+stop(?:\s|$)'
  - '(?i)(?:^|[\s;&|])(?:kill|killall)\s+-9\s+(?:nginx|openresty)(?:\s|$)'
  # systemctl stop/disable openresty = 全站下线
  - '(?i)(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:openresty|nginx)\b'
  # 删 OpenResty 安装目录 / 配置目录 = 站点 + Lua 库全丢
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/usr/local/openresty(?:\s|/|$)'
---
```

# openresty-lua —— OpenResty / Nginx + Lua 速查

适用：用户报"resty 起不来"/"Lua 脚本不生效"/"动态路由没切过去"/"WAF 拦了正常请求"/"想用 Lua 做鉴权但不知道从哪下手"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, "openresty")`（编译版可能注册成 `nginx` unit，两个都试；任何档位放行）。
- **看错误日志** → `tail_log(server, "/usr/local/openresty/nginx/logs/error.log")`（Lua 编译错都写这里）。
- **查 80/443 监听** → `port_check(server, 80)` / `port_check(server, 443)`。
- **改配置 / Lua 文件** → `sftp_read` 看现状 + `sftp_write` 整文件写（nginx.conf 含大量 `{}` / `$var`，shell 拼接极易转义出错，整文件写最稳）。
- ⚠️ **铁律：`sftp_write` 改完，先 `ssh_exec sudo nginx -t` 校验通过，再 reload**。OpenResty 的坑更深——`nginx -t` 过了 reload 仍可能因 **Lua 运行时错**让新 worker 全退（命中坏 worker 报 502），所以 reload 后必须 `tail_log` error.log 确认 worker 起来了。
- ⚠️ `sudo nginx -t` / `sudo nginx -s reload` / `sudo systemctl reload` 含 sudo 会触发**用户审批**——提前告知用户，被拒后不要原样重试。

> 改配置前先把现配置 `sftp_read` 出来留底（或落 `~/.opspub/backups`），reload 翻车能整文件 `sftp_write` 回滚。

## 第一步：服务和配置语法

```bash
# 状态
systemctl status openresty
# 或包名不同：systemctl status nginx（OpenResty 编译版可能注册成 nginx unit）

# 配置语法检查（**改完配置必跑**）
sudo /usr/local/openresty/nginx/sbin/nginx -t
# 或直接 nginx（PATH 已加）
sudo nginx -t

# 优雅重载（推荐）
sudo /usr/local/openresty/nginx/sbin/nginx -s reload
# 或 systemctl reload openresty
```

`syntax is ok` + `test is successful` 才算 OK。任何 `[emerg]` 必须先解。

## 第二步：路径约定

| 路径 | 内容 |
|------|------|
| `/usr/local/openresty/` | 主安装目录 |
| `/usr/local/openresty/nginx/sbin/nginx` | 二进制 |
| `/usr/local/openresty/nginx/conf/nginx.conf` | 主配置（**不是** /etc/nginx/） |
| `/usr/local/openresty/lualib/` | 系统 Lua 库（包括 `resty.*` 系列） |
| `/usr/local/openresty/site/lualib/` | 自定义 Lua 库放这里 |
| `/usr/local/openresty/nginx/logs/error.log` | 错误日志 |
| `/usr/local/openresty/nginx/logs/access.log` | 访问日志 |
| `/var/log/openresty/`（包安装可能在这） | 日志（按发行版） |

## 第三步：resty CLI（开发利器）

`resty` 让你像 `node`/`python` 一样跑 Lua 脚本（不起 nginx 也能跑）：

```bash
resty -e 'print("hello"); ngx.sleep(0.1); print("done")'
resty my-script.lua
resty -I /path/to/lua-libs my-script.lua
```

调试时**先用 resty 跑通**，再塞进 nginx.conf 的 `*_by_lua_*` 指令。

## 第四步：核心指令对照

| 阶段 | 指令 | 用途 |
|------|------|------|
| 配置初始化 | `init_by_lua_block` / `init_by_lua_file` | master 启动一次，预加载共享数据 |
| worker 初始化 | `init_worker_by_lua_block` | 每个 worker 启动一次，建定时器/连接池 |
| SSL 阶段 | `ssl_certificate_by_lua_block` | 动态加载证书（按 SNI 选证书） |
| 重写 | `rewrite_by_lua_block` | URL 改写 |
| 鉴权 | `access_by_lua_block` | 鉴权 / 限流 / 黑白名单 |
| 上游选择 | `balancer_by_lua_block` | 动态负载均衡 |
| 内容 | `content_by_lua_block` | 直接生成响应（替代 upstream） |
| 头部改写 | `header_filter_by_lua_block` | 改响应头 |
| 响应体改写 | `body_filter_by_lua_block` | 改响应体 |
| 日志 | `log_by_lua_block` | 异步上报 / 审计 |

## 第五步：Lua 鉴权骨架

```nginx
# nginx.conf
http {
    lua_shared_dict auth_cache 10m;   # worker 间共享 LRU

    server {
        listen 80;

        location /api/ {
            access_by_lua_block {
                local token = ngx.var.http_authorization
                if not token then
                    return ngx.exit(401)
                end
                -- 查 shared cache → miss 则查 redis/HTTP/数据库
                local cache = ngx.shared.auth_cache
                local uid = cache:get(token)
                if not uid then
                    -- ... 调后端验证 token，命中后 cache:set(token, uid, 300)
                end
                ngx.req.set_header("X-UID", uid)
            }
            proxy_pass http://upstream/;
        }
    }
}
```

## 第六步：WAF

主流：

- `lua-resty-waf`（已停止维护，但仍在用）
- `openresty/lua-resty-iputils`（IP 黑白名单）
- 1Panel 自带 **OpenResty + WAF 应用**（推荐：图形化管理规则）

手写 IP 黑白名单：

```nginx
access_by_lua_block {
    local iputils = require "resty.iputils"
    local blacklist = iputils.parse_cidrs({"10.0.0.0/8", "1.2.3.4/32"})
    if iputils.ip_in_cidrs(ngx.var.remote_addr, blacklist) then
        return ngx.exit(403)
    end
}
```

## 第七步：动态加载（不重启换证书 / 改路由）

证书：

```nginx
ssl_certificate_by_lua_block {
    local ssl = require "ngx.ssl"
    local server_name = ssl.server_name()
    -- 按 SNI 拉证书（从 redis/磁盘）
    ssl.clear_certs()
    ssl.set_der_cert(my_cert)
    ssl.set_der_priv_key(my_key)
}
```

路由：

```nginx
balancer_by_lua_block {
    local balancer = require "ngx.balancer"
    -- 从 lua_shared_dict 拿动态 upstream
    local backend = ngx.shared.routes:get(ngx.var.host)
    balancer.set_current_peer(backend)
}
```

## 第八步：reload 失败回滚

`nginx -s reload` **如果新配置坏了**：worker 继续用旧配置，**不会**挂；但下次 reload 还会失败。流程：

```bash
sudo nginx -t                                 # 必跑！失败别 reload
sudo nginx -s reload                          # OK
tail -n 50 /usr/local/openresty/nginx/logs/error.log  # 看 worker 启动有没有 Lua 编译错
```

如果 reload 后**新 worker 全部退出**（多见于 Lua 语法错），旧 worker 仍在跑（直到自然死掉），此时**新连接可能命中坏 worker 报 502**。回滚：

```bash
sudo cp nginx.conf.bak nginx.conf
sudo nginx -t && sudo nginx -s reload
```

## 第九步：常见问题

### Q1: Lua 代码改了不生效
- `*_by_lua_file` 引用的 `.lua` 文件改了后 **必须 reload**（OpenResty 默认 cache 编译产物）
- 开发时可加 `lua_code_cache off;`（**生产严禁** —— 每请求重编译 Lua 拖死性能）

### Q2: `lua_shared_dict` 数据"消失"了
- `lua_shared_dict` 是**单实例进程内共享**，nginx restart 后丢；要持久化用 redis
- 容量超了会 LRU 淘汰，看 `ngx.shared.<name>:get_keys(0)` 当前 key 数

### Q3: WAF 拦了正常请求
- 看 `/usr/local/openresty/nginx/logs/error.log`，命中规则会写日志
- 临时关 WAF：`location` 块里把 `access_by_lua_*` 注释 → `nginx -t && nginx -s reload`

### Q4: 出现 `attempt to yield across C-call boundary`
- 在 `init_by_lua` 阶段调了协程相关 API；`init_by_lua` 阶段不能用 `ngx.socket` / `ngx.sleep`，挪到 `init_worker_by_lua`

## 教训

- 改完 `.lua` 文件后**永远先 `resty` 跑一遍** —— 比 reload 安全得多。
- `lua_code_cache off` 是开发调试用的，**生产开了能拖慢 10 倍**，提交前必须确认是 on。
- `lua_shared_dict` 容量按业务峰值的 2x 设，被 LRU 频繁淘汰会让 cache miss 率飙升。
- WAF 规则上线前用 `ngx.log(ngx.NOTICE, ...)` **dry-run 一周**，确认没误伤再切到 `return ngx.exit(403)`。

---

## 28. opsTwo

```yaml
---
name: opsTwo
description: 一句话描述本技能干什么
triggers: 关键词1, 关键词2
---
```

# opsTwo

这里写正文（操作步骤、注意事项、教训）。

> 备注（导出者说明）：`opsTwo` 属**用户自定义技能**，当前内容仅为 OpsPub 新建技能时生成的模板空壳，尚未填写实际正文。

---

## 29. php-fpm-ops

```yaml
---
name: php-fpm-ops
description: PHP-FPM 运维速查 —— pool 配置 / opcache / 慢日志 / pm.max_children / 与 nginx 通信。
触发词: php, php-fpm, fpm, opcache, php 慢, php-fpm 进程数, 502 php, php-fpm.conf, www.conf, pm static, pm dynamic, pm ondemand, fpm pool, php 8.4, php 8.3, php 8.2, 装 php, 部署 php, wordpress 慢, wordpress 502, laravel, symfony, mediawiki, nextcloud, fastcgi, sock 文件, unix socket php, opcache 命中率, max_children, max_requests, php 内存限制, memory_limit, post_max_size, upload_max_filesize, php 挂了, php-fpm 挂了, php 起不来, php 进程满, 504 php, php 占内存, 网站 502
dangerous_commands:
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+php\d?(?:\.\d+)?-fpm\b'
  - '(?:^|[\s;&|])(?:kill|killall|pkill)\s+(?:-9\s+)?php-fpm\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/php(?:\s|/|$)'
---
```

# php-fpm-ops —— PHP-FPM 运维

适用：用户跑 WordPress / Laravel / Symfony / MediaWiki / Nextcloud 等 PHP 应用；想"502 怎么排"/"接口慢"/"php-fpm 进程数怎么配"/"opcache 命中"/"加 pool"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 php-fpm 服务状态** → `service_status(server, "php8.2-fpm")`（包名按发行版可能是 `php-fpm`/`php7.4-fpm`，任何档位放行，比 `ssh_exec systemctl status` 稳）。
- **看错误日志 / 慢日志** → `tail_log(server, "/var/log/php8.2-fpm.log")` / `tail_log(server, "/var/log/php8.2-fpm.slow.log")`（任何档位放行）；502 还要看 `tail_log(server, "/var/log/nginx/error.log")`。
- **查 socket / 端口** → unix socket 用 `sftp_list(server, "/run/php")` 看 sock 文件存在且权限对（nginx user 要能读写）；TCP 模式用 `port_check(server, 9000)`。
- **改 pool 配置（www.conf）/ opcache.ini / php.ini** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell 转义坑），写完 `ssh_exec sudo systemctl reload php8.2-fpm`（reload 是 graceful，不丢正在处理的请求）。
- ⚠️ `systemctl stop/restart/reload php-fpm`（含 sudo）会触发**用户审批**——`stop` 会让所有 PHP 站点立刻 502，执行前务必告知用户；`reload`（重载配置不断连接）相对安全但仍需放行。被拒后不要原样重试。

## 第一步：状态总览

```bash
systemctl status php8.2-fpm                       # 包名按发行版可能是 php-fpm / php7.4-fpm
ps auxf | grep -E '[p]hp-fpm'                     # 看 master + worker 数

# 监听端口 / socket
ss -tlnp | grep php-fpm                           # tcp（少见）
ls -l /run/php/*.sock                             # unix socket（常见）
```

## 第二步：状态页 + 慢日志（必开）

### 启用 status 页

```ini
# /etc/php/8.2/fpm/pool.d/www.conf
pm.status_path = /status
ping.path = /ping
slowlog = /var/log/php8.2-fpm.slow.log
request_slowlog_timeout = 5s
```

Nginx 暴露：

```nginx
location ~ ^/(status|ping)$ {
    access_log off;
    allow 127.0.0.1;
    allow 10.0.0.0/24;
    deny all;
    fastcgi_pass unix:/run/php/php8.2-fpm.sock;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $fastcgi_script_name;
}
```

```bash
curl http://localhost/status                      # 总状态
curl http://localhost/status?full                 # 含每个 worker 的当前请求
curl http://localhost/status?json                 # JSON
curl http://localhost/status?json&full

# 关键字段：
# accepted conn        累计接受连接数
# listen queue         backlog（持续 > 0 = 进程不够）
# idle processes       空闲 worker（持续 0 = 全忙）
# active processes
# total processes
# max children reached （**> 0 = pm.max_children 不够，必须调大**）
# slow requests        累计慢请求数
```

### 慢日志

```
slowlog = /var/log/php8.2-fpm.slow.log
request_slowlog_timeout = 5s     # 单请求超过 5s 写一份 PHP backtrace 到这
```

```bash
tail -f /var/log/php8.2-fpm.slow.log
# 形如：
# [02-Jan-2024 10:00:00]  [pool www] pid 12345
# script_filename = /var/www/index.php
# [0x...] mysql_query() /var/www/.../db.php:42
# [0x...] User::find() /var/www/.../user.php:10
```

## 第三步：进程管理（pm.*）

```ini
# /etc/php/8.2/fpm/pool.d/www.conf
pm = dynamic                     # static / dynamic / ondemand
pm.max_children = 50             # **最重要参数**
pm.start_servers = 10
pm.min_spare_servers = 5
pm.max_spare_servers = 15
pm.max_requests = 1000           # worker 处理 1000 请求后重启（防 leak）
```

### 模式选择

| 模式 | 说明 | 适合 |
|------|------|------|
| `static` | 固定 N 个 worker | 大流量、稳定负载（**推荐生产**） |
| `dynamic` | 区间内伸缩 | 中等流量、有峰谷 |
| `ondemand` | 按需起，闲了死掉 | 低流量 / 多 pool 共享一台机器 |

### pm.max_children 估算

```
pm.max_children ≈ (可用内存 - 系统占用) / 平均单 worker 内存
```

测算：

```bash
# 看 worker 平均 RSS
ps --no-headers -o "rss,cmd" -C php-fpm | awk 'NR>1 {sum+=$1; count++} END {print sum/count " KB / worker"}'

# 一般 40-100MB / worker；Laravel ~ 80MB
# 16GB 机器，留 4GB OS + 4GB MySQL + 8GB PHP = 8000MB / 80MB = 100 children
```

> `max children reached` > 0 = **进程不够**，502 / 504 多半就是这；不是上来就**疯狂调大**：先看是不是有慢请求把 worker 卡死了（看慢日志）。

## 第四步：opcache

```bash
php -i | grep -E 'opcache.(enable|memory_consumption|max_accelerated_files|validate_timestamps|revalidate_freq)'
```

```ini
; /etc/php/8.2/fpm/conf.d/10-opcache.ini
opcache.enable=1
opcache.enable_cli=0
opcache.memory_consumption=256             ; MB，**够装下全部 .php 文件**
opcache.interned_strings_buffer=16
opcache.max_accelerated_files=20000        ; 至少略大于项目 .php 文件数
opcache.validate_timestamps=0              ; ⚠️ 生产强烈推荐 0（**改完代码必须 reload php-fpm**）
opcache.revalidate_freq=0                  ; validate_timestamps=1 时才生效
opcache.fast_shutdown=1
opcache.preload=/var/www/preload.php       ; PHP 7.4+ 预加载
opcache.preload_user=www-data
```

`validate_timestamps=0` 模式部署流程：

```bash
# 1) 部署新代码
rsync -a ./build/ /var/www/myapp/

# 2) 必须让 PHP 重读
sudo systemctl reload php8.2-fpm
# 或更轻量（只清 opcache 不断连接）
curl http://localhost/opcache-reset.php       # 自己写个文件调 opcache_reset()
```

### opcache stats

写一个 `/var/www/opcache-status.php`（仅内网访问）：

```php
<?php print_r(opcache_get_status(false)); ?>
```

```bash
curl localhost/opcache-status.php | grep -E 'memory_usage|hit_rate|num_cached_scripts|miss'
# hit_rate < 95% 多半是配置有问题（memory 太小被淘汰 / max_accelerated_files 太小）
```

## 第五步：与 Nginx 通信

### Unix socket（推荐，本机时更快）

```nginx
location ~ \.php$ {
    fastcgi_pass unix:/run/php/php8.2-fpm.sock;
    fastcgi_index index.php;
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_read_timeout 60s;
}
```

Pool 配置：

```ini
listen = /run/php/php8.2-fpm.sock
listen.owner = www-data
listen.group = www-data
listen.mode = 0660
```

### TCP（跨机器）

```ini
listen = 127.0.0.1:9000
listen.allowed_clients = 127.0.0.1
```

```nginx
fastcgi_pass 127.0.0.1:9000;
```

## 第六步：多 pool（隔离）

不同站点跑不同 user / 不同资源限制：

```bash
ls /etc/php/8.2/fpm/pool.d/
# www.conf  shopapp.conf  cmsapp.conf
```

```ini
; /etc/php/8.2/fpm/pool.d/shopapp.conf
[shopapp]
user = shopuser
group = shopuser
listen = /run/php/shopapp.sock
pm = dynamic
pm.max_children = 30
php_admin_value[memory_limit] = 256M
php_admin_value[upload_max_filesize] = 20M
```

每个 pool 独立 master/worker、独立 unix socket、独立资源限制。

## 第七步：常见故障

### Q1: 502 Bad Gateway
顺序排查：
1. `systemctl status php8.2-fpm` — 服务在跑吗
2. `ls -l /run/php/*.sock` — socket 文件存在且权限对吗（nginx user 要能读写）
3. `curl http://localhost/status` — 看 `listen queue` 和 `max children reached`
4. `tail -f /var/log/nginx/error.log` — 看具体 fastcgi 错误
5. 慢请求把 worker 全卡死 → 看慢日志

### Q2: 504 Gateway Timeout
- PHP 慢；`fastcgi_read_timeout` 太短
- 应用层超时（DB / 第三方 API）
- 看慢日志找元凶

### Q3: 改了代码但不生效
- `opcache.validate_timestamps=0`（生产推荐）→ 必须 reload php-fpm 或调用 `opcache_reset()`
- 用 `tag-based deploy` 配 `opcache.preload` 时同理

### Q4: pm.max_children 配多大都满
- 几乎一定是**慢请求**把 worker 卡死了（DB 锁 / 外部 API timeout）
- **不要无脑调大**：50 → 200 只是把崩溃点延后；先找慢请求

## 路径速查表

| 内容 | 路径 |
|------|------|
| 主配置 | `/etc/php/<ver>/fpm/php-fpm.conf` |
| Pool 配置 | `/etc/php/<ver>/fpm/pool.d/*.conf` |
| PHP ini | `/etc/php/<ver>/fpm/php.ini`（FPM 专用） |
| CLI ini | `/etc/php/<ver>/cli/php.ini`（CLI 独立） |
| 模块开关 | `/etc/php/<ver>/fpm/conf.d/*.ini` |
| 错误日志 | `/var/log/php<ver>-fpm.log` 或 journalctl |
| 慢日志 | pool 配置 `slowlog =` 指定 |
| socket | `/run/php/php<ver>-fpm.sock`（Debian）/ `/var/run/php-fpm/www.sock`（RHEL） |
| systemd | `php8.2-fpm` / `php-fpm`（RHEL） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `systemctl stop php-fpm` | 所有 PHP 站点立刻 502 |
| `kill -9 php-fpm-master` | 同上，且未优雅退出的 worker 数据写一半丢 |
| `rm -rf /etc/php` | 全部配置丢；下次 systemctl restart 用包默认配置（应用多半启不动） |
| `opcache.validate_timestamps=1` 高 QPS 站点 | 每次请求 stat 文件，IO 飙 |
| 把多个站点用**同一 user** 跑 | 一个站点被打穿能读其他站点代码 / 配置 |
| `pm = static, max_children = 500` 不算内存 | 系统 swap 飙 / OOM |

## 教训

- 生产 **opcache 必开**，`validate_timestamps=0` + 部署时 reload php-fpm；不开 opcache 性能差 5-10x。
- 慢日志（`request_slowlog_timeout = 5s`）是 PHP 排障神器，**所有生产 pool 都该开**。
- `pm.max_children` 调参根据**测量**不是**猜测**：观察内存 + status 页 listen queue。
- 多站点共用一台机器时**强烈推荐多 pool 多 user**，安全隔离 + 资源隔离。
- PHP-FPM unix socket 比 TCP loopback 快 ~20%；本机优先 socket。
- `opcache.preload`（PHP 7.4+）能再提速 5-15%，但代码改动后需 systemctl reload（不是 opcache_reset）。
- Composer `--no-dev` `--optimize-autoloader` 加 opcache 是生产 Laravel / Symfony 标配。

---

## 30. portainer-ops

```yaml
---
name: portainer-ops
description: Portainer 容器编排面板速查 —— endpoint / stacks / templates / 团队权限 / 备份恢复。
触发词: portainer, 容器面板, portainer agent, edge agent, portainer endpoint, portainer stack, portainer 备份, portainer 重置, agent token, portainer 起不来, portainer 登录不了, 忘了 admin 密码, portainer 重装, portainer ce, portainer business, 加 endpoint, 接节点, 远程 docker 管理, swarm 管理, portainer stack 部署, edge compute
dangerous_commands:
  - '(?:^|[\s;&|])docker\s+volume\s+rm\b[^\n]*portainer_data\b'
  - '(?:^|[\s;&|])docker\s+rm\s+-[fv]+\s+portainer\b'
  # flag 分开写（docker rm -f -v portainer）也要拦 —— -v 删卷 = portainer.db 全没
  - '(?:^|[\s;&|])docker\s+rm\b[^\n]*\s-v\b[^\n]*\bportainer\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/data/portainer(?:\s|/|$)'
---
```

# portainer-ops —— Portainer 面板运维

适用：用户用 Portainer 管理多 Docker 节点 / Swarm / K8s；想"装 portainer"/"忘了 admin 密码"/"加新 endpoint"/"备份"/"装 agent"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 docker 是否在跑**（portainer 是容器，daemon 挂了它也起不来）→ `service_status(server, "docker")`（任何档位放行）。
- **查面板/agent 端口** → `port_check(server, 9443)`（Web UI）/ `port_check(server, 9001)`（agent）。
- **看 portainer 容器日志** → `tail_log(server, "/var/lib/docker/containers/<id>/<id>-json.log")`，或 `ssh_exec docker logs --tail 200 portainer`（只读判定）。
- ⚠️ 装 portainer 的 `docker run`、`docker rm`、备份恢复、重置密码这些都是写操作，会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## ⛔ 装机：**禁止用 `install_with_secret`**（后端硬拒）

OpsPub 后端 `KIND_BLOCKLIST` 把 `portainer` 列在禁止列表（同 1panel/baota/aapanel）—— **理由**：Portainer **首次访问 https://<host>:9443 时由用户在浏览器创建 admin**，不接受外部传入的 username/password，你在 `public` 里塞的账号不会被识别，会原封不动写进 vault 误导用户。

**正确做法**：

1. 用 `ssh_exec` 跑下面第一步的 docker run 命令装 portainer
2. 告诉用户「打开 https://<host>:9443，**5 分钟内**创建第一个 admin 账号」（错过窗口要 `docker restart portainer` 重新打开）
3. 用户创建完账号后，**他自己**通过 OpsPub「服务凭据」页手动新增一条 portainer 凭据（kind 用通用的 `"web_admin"` 或 `"portainer"`，**不带 `_conn` 后缀**）—— 不要让 AI 替用户填密码

> 同理：用户问"装个 portainer" → AI 应该装 + 提示首次访问步骤，**绝不**自己生成密码塞过去；问"重置 admin 密码" → 见下方"忘密码"章节。

## 第一步：安装

### 单机（容器方式，最常见）

```bash
docker volume create portainer_data
docker run -d \
    --name portainer \
    --restart=unless-stopped \
    -p 9000:9000 -p 9443:9443 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v portainer_data:/data \
    portainer/portainer-ce:latest

# 访问 https://<host>:9443，**5 分钟内**创建第一个 admin 账号
# 错过 5 分钟需要重启容器再来：docker restart portainer
```

### 高可用 / Business（CE 也能扛中小规模）

- Swarm 模式部署在 manager 节点
- K8s 用 Helm chart：`helm install portainer portainer/portainer`

## 第二步：Endpoint（被管节点）

### 类型

| Endpoint type | 用途 | 接入方式 |
|---------------|------|---------|
| **Local Docker** | 安装 portainer 的本机 docker | 挂 `/var/run/docker.sock` 即可 |
| **Remote Docker (TCP)** | 远端 docker（要开 TCP 2375/2376） | 直接给 IP + 证书；**生产必开 TLS** |
| **Docker Agent** | 远端装 agent 容器 | 推荐（不需开 docker TCP 端口） |
| **Edge Agent** | 反向连接（远端主动连 portainer） | 适合公网穿透 / NAT 后节点 |
| **Kubernetes** | k8s cluster | kubeconfig / cluster role |

### Agent 安装（被管节点跑）

```bash
docker run -d \
    --name portainer_agent \
    --restart=always \
    -p 9001:9001 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /var/lib/docker/volumes:/var/lib/docker/volumes \
    portainer/agent:latest
```

然后在 Portainer UI 「Environments → Add environment → Docker Standalone → Agent」填 `<节点IP>:9001`。

### Edge Agent（节点主动连）

在 UI 创建 Edge environment 拿到 install 命令，到节点跑：

```bash
docker run -d \
    --name portainer_edge_agent \
    --restart=always \
    -e EDGE_ID=xxx \
    -e EDGE_KEY=xxx \
    portainer/agent:latest
```

## 第三步：Stack（compose 项目）

UI「Stacks → Add stack」，三种编辑方式：

1. **Web editor** — 粘贴 compose yaml
2. **Upload** — 上传 compose file
3. **Git repository** — 关联 git repo，**支持 webhook 自动重建**（GitOps）

```yaml
# 示例 stack
version: "3"
services:
  app:
    image: nginx:latest
    ports: ["8080:80"]
    environment:
      MY_VAR: ${MY_VAR}     # UI 里可填环境变量
```

Stack 操作：

- **Update** 不会停容器，按 compose 差异滚动
- **Stop / Start** 等同 `docker compose stop / start`
- **Delete** 删除 stack + **容器**；卷按 compose 设计保留或删

## 第四步：常用 admin 操作

### 备份

UI 「Settings → General → Backup」直接下载 tar.gz（含数据库 + 加密的所有节点凭据）。

CLI（容器跑）—— 备份产物统一落 OpsPub 工作区 `~/.opspub/backups`（别散落当前目录/`/tmp`）：

```bash
mkdir -p ~/.opspub/backups
docker run --rm -v portainer_data:/data alpine \
    tar czf - -C /data . > ~/.opspub/backups/portainer-backup-$(date +%F).tgz
```

### 恢复

```bash
docker stop portainer
docker run --rm -v portainer_data:/data -v $(pwd):/backup alpine \
    sh -c 'cd /data && rm -rf ./* && tar xzf /backup/portainer-backup.tgz'
docker start portainer
```

### 重置 admin 密码（忘了）

```bash
# 1) 停 portainer
docker stop portainer

# 2) 用临时 helper 容器删 admin 用户（portainer 重启会重新进入"创建第一个 admin"流程）
docker run --rm -v portainer_data:/data portainer/helper-reset-password

# 3) 启动并 5 分钟内访问 https://host:9443 重建 admin
docker start portainer
```

### 内置数据查看

```bash
docker exec -it portainer ls /data
# portainer.db = boltDB
# tls/ = 证书
# compose/ = stack git 缓存
```

## 第五步：团队 / 权限

Portainer 的 RBAC：

- **Users**：内置 / OAuth / LDAP
- **Teams**：用户组
- **Environments (endpoints)**：每个被管节点
- **Endpoint Access**：给 team 授权某 endpoint 的 Read-Only / Standard User / Operator / Endpoint Admin

非 admin 用户**默认看不到任何 endpoint**；要在 endpoint 设置里加 team / user。

## 第六步：常见问题

### Q1: agent 连不上 portainer
- agent 端口（9001）防火墙没开
- agent 启动了但 `docker logs portainer_agent` 报 "no tunnel"：网络不通 / Edge ID/KEY 错
- 重启 agent 容器后 portainer UI 仍显示 down → portainer 端口（9443/9000）反向连不到 agent

### Q2: stack update 失败 "image not found"
- compose 里 image 用了 latest 但 registry 没那个 tag
- 私有 registry：在 Portainer UI「Registries」加凭据再 update

### Q3: portainer 升级后 endpoint 状态都是 down
- agent 版本与 portainer 不匹配（major 版本要对齐）
- 升级 agent：`docker pull portainer/agent:latest && docker stop portainer_agent && docker rm portainer_agent && <重跑 run 命令>`

### Q4: 5 分钟创建 admin 错过了
- `docker restart portainer` 再次进入 5 分钟窗口
- 或 `--admin-password-file` 启动参数预设密码

## 路径速查表

| 内容 | 路径 |
|------|------|
| Portainer 数据 | volume `portainer_data` → `/var/lib/docker/volumes/portainer_data/_data/` |
| 主数据库 | `portainer.db`（BoltDB） |
| TLS | `tls/` 下 |
| Stack 缓存 | `compose/` |
| Web UI | `https://<host>:9443`（HTTPS） / `http://<host>:9000`（HTTP） |
| Agent 端口 | TCP 9001 |
| Edge agent 反向通道 | portainer 监听的端口（默认 8000） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `docker volume rm portainer_data` | **删 portainer 数据库**，所有 endpoint / user / stack 配置丢失 |
| `docker rm -fv portainer` | 同上（`-v` 带卷一起删） |
| `rm -rf /data/portainer` 或 volume 挂载源 | 同上 |
| 改 portainer 端口（9000/9443） + 防火墙不同步 | **管理员被锁外** |
| Stack Delete 含 volume 的 stack | 数据卷可能一起被删（按 compose 设计） |

## 卸载后清理 OpsPub 凭据登记

跑完真正的卸载（`docker rm -fv portainer && docker volume rm portainer_data`）后，**调一次 `delete_installed_service`** 把 OpsPub 这边登记的 portainer 凭据登记也清掉。

```
1. list_installed_services({ server: "<别名>" }) → 找 kind === "portainer" 的 id
2. （卸载远端）→ exit 0
3. delete_installed_service({ vaultId: "<上一步 id>" })
```

⚠️ 顺序：先卸再删；trusted 档 AI 自治，其他档暂为 denied → 让用户在「服务凭据」页手动删。

## 教训

- Portainer 的所有 endpoint **凭据/证书**都在 `portainer_data` volume 里加密存储，**这个卷必须备份**。
- 升级 portainer 前**先备份 volume**；升级后偶尔有 schema migration 失败的情况，回滚就靠备份。
- Edge agent **比 Docker TCP + TLS** 更安全（反向连接，不需要在节点开公网端口）。
- 不要给 standard user 直接看 docker.sock 级别的 endpoint —— UI 上能跑 `docker run --privileged` 就是宿主 root。
- Stack 用 Git repo 模式 + webhook 是最佳实践（更新就是 git push，自带审计）。
- 5 分钟 admin 创建窗口是**安全特性**，不是 bug；让别人偷跑了第一个 admin 等于服务器丢了。

---

## 31. postgresql-ops

```yaml
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
```

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

🔴 **装 PostgreSQL 一律用 `install_app`**——postgres 在 OpsPub 应用商店目录里，`install_app` = 应用商店 UI 同款：密码 OpsPub 生成并**同步进容器+凭据库（两边一致、必连得上）**、容器 `opspub-postgres`、绑 `127.0.0.1`、compose 落 `/opt/opspub/stacks/postgres`、**自动登记 `postgres_conn` 凭据带 SSH 隧道**（「数据库」页即装即连）。

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

> 💾 **备份产物统一落 `~/.opspub/backups/`**（OpsPub 远程工作区），别臆造 `/backup`、`/data/backup`。先 `ssh_exec mkdir -p ~/.opspub/backups`；文件名带日期避免覆盖旧备份。

```bash
# 单库
pg_dump -h host -U postgres -F c -f ~/.opspub/backups/mydb-$(date +%F).dump mydb    # custom format（推荐）
pg_dump -h host -U postgres -F p -f ~/.opspub/backups/mydb-$(date +%F).sql mydb     # plain SQL

# 全库（集群级，含角色）
pg_dumpall -h host -U postgres > ~/.opspub/backups/all-$(date +%F).sql
pg_dumpall -h host -U postgres -g > ~/.opspub/backups/globals.sql       # 只角色 + tablespace

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
pg_basebackup -h primary -U replicator -D ~/.opspub/backups/base -Ft -z -P -X stream
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

## 32. prometheus-grafana

```yaml
---
name: prometheus-grafana
description: Prometheus + Grafana + node_exporter + Alertmanager 速查 —— 部署 / scrape / 告警规则 / dashboard 导入 / 存储压缩。
触发词: prometheus, promql, grafana, alertmanager, node_exporter, exporter, scrape, 监控, 告警, dashboard, recording rule, alerting rule, tsdb, blackbox, cadvisor, prometheus 3, grafana 11, grafana 12, victoriametrics, mimir, thanos, 装 prometheus, 装 grafana, 部署监控, 配监控, 加告警, 加监控, 收集指标, scrape failed, target down, 告警发不出, smtp 告警, 钉钉告警, 飞书告警, 企业微信告警, webhook 告警, 监控面板, dashboard 导入, grafana 打不开, grafana 登不上, 面板没数据, 没数据, 指标没了, 监控挂了, prometheus 占地方, prometheus 磁盘满
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:/var/lib/prometheus|/data/prometheus|/prometheus)(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?[~/\w.-]*grafana\.db\b'
  - '(?i)\bcurl\b[^\n]*-X\s+POST\s+[^\n]*/-/quit\b'
  - '(?i)\bcurl\b[^\n]*-X\s+POST\s+[^\n]*/api/v1/admin/tsdb/delete_series\b'
---
```

# prometheus-grafana —— 监控体系

适用：用户报"想加监控"/"机器卡了不知道为啥（缺指标）"/"配 grafana dashboard"/"写告警规则"/"prometheus 占地方"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装监控栈优先用 `install_app(server, "grafana-stack")`**（OpsPub 应用商店里有 Prometheus+Grafana 栈）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 prometheus / grafana 状态 | `service_status(server, "prometheus")` / `service_status(server, "grafana-server")` | systemctl status |
| 查端口（9090 Prom / 3000 Grafana / 9093 AM / 9100 node_exporter / 9115 blackbox） | `port_check(server, 9090)` 等 | ss -tlnH |
| 看 tsdb 占多少磁盘（最常见"占地方"诉求） | `disk_usage(server, "<tsdb 数据目录>")` | df -hT |
| 看 prometheus / grafana 日志 | `tail_log(server, "<日志路径>")`，或容器走 `ssh_exec docker logs` | tail -n |
| 改 prometheus.yml / rules / alertmanager.yml / grafana.ini | `sftp_read` 看现状 + `sftp_write` 整文件写 | 直接编辑 |

这些只读工具**任何策略档位都放行**。改配置走 `sftp_read`+`sftp_write`（无 shell heredoc 转义坑），写完用 `ssh_exec curl -X POST .../-/reload`（需 `--web.enable-lifecycle`）或重启容器生效。后文 `curl` / `amtool` / `docker` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 重启服务 / 删 series / 改 retention 等写操作会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## 一、Prometheus 部署

### Docker compose（最小可用监控栈）

```yaml
version: "3"
services:
  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--storage.tsdb.retention.size=20GB'
      - '--web.enable-lifecycle'           # 让 reload API 可用
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./rules:/etc/prometheus/rules:ro
      - prom-data:/prometheus
    ports: ["9090:9090"]

  alertmanager:
    image: prom/alertmanager:latest
    restart: unless-stopped
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    ports: ["9093:9093"]

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: <强密码>
      GF_SECURITY_ADMIN_USER: admin
    volumes:
      - grafana-data:/var/lib/grafana
    ports: ["3000:3000"]

  node-exporter:
    image: prom/node-exporter:latest
    restart: unless-stopped
    pid: host
    network_mode: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'

volumes:
  prom-data:
  grafana-data:
```

### prometheus.yml（最小）

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: prod
    region: cn-beijing

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']

  - job_name: node
    static_configs:
      - targets: ['10.0.0.1:9100', '10.0.0.2:9100', '10.0.0.3:9100']

  - job_name: mysql
    static_configs:
      - targets: ['10.0.0.10:9104']      # mysqld_exporter

  # 服务发现示例（Docker）
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
    relabel_configs:
      - source_labels: [__meta_docker_container_label_prom_port]
        target_label: __port__
```

### reload / 健康

```bash
# 改了 prometheus.yml / rules
curl -X POST http://localhost:9090/-/reload         # 需要 --web.enable-lifecycle

# 健康
curl http://localhost:9090/-/healthy                # 200 OK
curl http://localhost:9090/-/ready                  # 200 = ready 接收查询

# 配置查看
curl http://localhost:9090/api/v1/status/config
```

## 二、常用 Exporter

| 监控对象 | Exporter | 端口 |
|---------|---------|------|
| Linux 系统 | **node_exporter** | 9100 |
| Windows | windows_exporter | 9182 |
| Docker | cadvisor | 8080 |
| MySQL/MariaDB | mysqld_exporter | 9104 |
| PostgreSQL | postgres_exporter | 9187 |
| Redis | redis_exporter | 9121 |
| MongoDB | mongodb_exporter | 9216 |
| Nginx | nginx-prometheus-exporter | 9113 |
| RabbitMQ | rabbitmq_exporter | 9419 |
| JMX (Java) | jmx_exporter（agent 注入） | 自选 |
| 黑盒（HTTP/ICMP 探测） | blackbox_exporter | 9115 |

### blackbox（HTTP/Ping 探活）

```yaml
- job_name: blackbox_http
  metrics_path: /probe
  params:
    module: [http_2xx]
  static_configs:
    - targets:
        - https://example.com
        - https://api.example.com/health
  relabel_configs:
    - source_labels: [__address__]
      target_label: __param_target
    - source_labels: [__param_target]
      target_label: instance
    - target_label: __address__
      replacement: blackbox:9115
```

## 三、PromQL 速查

```promql
# 基础
up                                       # 各 target 是否存活（1/0）
up == 0                                  # 挂掉的
node_load1                               # 1 分钟 load

# Rate / 速率（counter 转 per-second）
rate(http_requests_total[5m])
sum(rate(http_requests_total[5m])) by (status_code)

# QPS / 错误率
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# Histogram p99
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# CPU 使用率（node_exporter）
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# 内存使用率
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# 磁盘使用率
(1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes) * 100

# Top N
topk(10, container_memory_usage_bytes)

# 同比 / 环比
rate(http_requests_total[5m]) / rate(http_requests_total[5m] offset 1h)
```

## 四、告警规则

```yaml
# rules/node.yml
groups:
  - name: node
    interval: 30s
    rules:
      - alert: NodeDown
        expr: up{job="node"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Node {{ $labels.instance }} is down"
          description: "{{ $labels.instance }} unreachable for 2 min"

      - alert: HighCPU
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "{{ $labels.instance }} CPU > 85%"

      - alert: DiskAlmostFull
        expr: (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes) * 100 < 10
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "{{ $labels.instance }} {{ $labels.mountpoint }} < 10% free"
```

### Recording Rule（预算化重查询）

```yaml
groups:
  - name: recordings
    interval: 30s
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))
```

## 五、Alertmanager

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: default
  group_by: [alertname, cluster]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: [severity=critical]
      receiver: oncall

receivers:
  - name: default
    webhook_configs:
      - url: http://feishu-webhook.example.com/

  - name: oncall
    webhook_configs:
      - url: http://feishu-webhook.example.com/oncall
    # 或邮件
    email_configs:
      - to: oncall@example.com
        from: alert@example.com
        smarthost: smtp.example.com:587
        auth_username: alert@example.com
        auth_password: xxx
```

```bash
amtool check-config alertmanager.yml         # 语法
amtool alert query --alertmanager.url=http://localhost:9093
amtool silence add alertname=NodeDown -d 1h -a "alice" -c "维护中"
```

## 六、Grafana

```bash
# 重置 admin 密码（容器停时跑）
docker exec -it grafana grafana-cli admin reset-admin-password <new>

# 导入 dashboard
# UI：+ → Import → 输入 dashboard ID（如 1860 = Node Exporter Full）
# 或上传 JSON
```

### 数据源

UI 「Configuration → Data sources → Add data source → Prometheus」，URL 填 `http://prometheus:9090`，Access 选 Server (default)。

### 路径

| 内容 | 路径（容器内） |
|------|---------------|
| 配置 | `/etc/grafana/grafana.ini` |
| 数据库 | `/var/lib/grafana/grafana.db`（默认 SQLite） |
| Plugins | `/var/lib/grafana/plugins/` |
| Provisioning | `/etc/grafana/provisioning/`（datasource / dashboard yaml） |

### Provisioning（dashboard as code）

```yaml
# /etc/grafana/provisioning/dashboards/default.yml
apiVersion: 1
providers:
  - name: 'file'
    folder: ''
    type: file
    options:
      path: /var/lib/grafana/dashboards

# 把 dashboard.json 放进 /var/lib/grafana/dashboards/
```

## 七、存储压缩 / 磁盘控制

```bash
du -sh /var/lib/docker/volumes/prom-data/_data/
```

参数控制：

```
--storage.tsdb.retention.time=30d        # 时间
--storage.tsdb.retention.size=20GB       # 大小（任一触发就清）
--storage.tsdb.min-block-duration=2h
--storage.tsdb.max-block-duration=2h     # 与 min 相等 = 禁压缩（推荐配 Thanos 时）
```

删除特定 series（**不可恢复**）：

```bash
# 需要 --web.enable-admin-api
curl -X POST -g 'http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]=expensive_metric{job="dev"}'
curl -X POST http://localhost:9090/api/v1/admin/tsdb/clean_tombstones
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| Prometheus 配置 | `/etc/prometheus/prometheus.yml` |
| 规则 | `/etc/prometheus/rules/*.yml` |
| 数据 | `--storage.tsdb.path`（默认 `/prometheus` 或 `/var/lib/prometheus`） |
| Alertmanager 配置 | `/etc/alertmanager/alertmanager.yml` |
| Grafana 数据库 | `/var/lib/grafana/grafana.db` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm -rf /var/lib/prometheus` / `/prometheus` data | **删全部历史指标**，事后没法回看 |
| `rm grafana.db` | 删 grafana dashboard / users / api keys / data sources |
| `curl -X POST .../-/quit` | 优雅停 prometheus；生产应该用 systemctl / docker |
| `curl -X POST .../api/v1/admin/tsdb/delete_series` | 删特定指标 series（**不可恢复**） |
| `--storage.tsdb.retention.size=1MB` 误改 | 历史指标几乎全清 |
| 大量改 `external_labels` | 与 federation/Thanos 集成时会**完全失配**告警和查询 |

## 教训

- 第一天就**配 alertmanager + 至少一条 NodeDown 告警** —— 没有告警的监控等于摆设。
- `for: <duration>` 字段必加（5m+ 推荐），否则**抖动告警**会刷屏 oncall。
- node_exporter 用 `network_mode: host` 比挂 /proc /sys 干净（部分 metrics 才能拿到）。
- 告警规则 yaml **走 git**：人工 UI 改完出事故没法追溯。
- 高基数 label（每条 metric 上 trace_id / uuid）会让 prometheus 内存爆炸；**label cardinality 是头号性能杀手**。
- Grafana dashboard ID 1860 (Node Exporter Full) / 7362 (MySQL) / 11835 (Redis) 几乎是标配，**别从零画**。
- 长期保留（数月/年）用 Thanos / VictoriaMetrics / Mimir 后端，**别让 prometheus 自己存**。

---

## 33. python-venv-uwsgi

```yaml
---
name: python-venv-uwsgi
description: Python 部署速查 —— venv / pyenv / pip / uWSGI / gunicorn / systemd 集成。
触发词: python, pip, pyenv, venv, virtualenv, poetry, uv pip, uv venv, uwsgi, gunicorn, fastapi, django, flask, wsgi, asgi, python 部署, python 3.13, python 3.12, python 3.11, 装 python, 装 pip, externally-managed-environment, break-system-packages, 启动 python 应用, 守护 python, supervisor python, uvicorn, hypercorn, requirements.txt, pyproject.toml, conda, miniconda, anaconda, python 起不来, python 挂了, uwsgi 挂了, gunicorn 挂了, django 起不来, flask 起不来, python 占内存, python 502
dangerous_commands:
  - '(?:^|[\s;&|])sudo\s+pip\d?\s+(?:install|uninstall)\b'
  - '(?i)\bpip\s+install\b[^\n]*\b--break-system-packages\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:venv|\.venv|env)(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/usr/lib/python[\d.]+(?:\s|/|$)'
  - '(?:^|[\s;&|])(?:pkill|killall)\s+(?:-9\s+)?(?:uwsgi|gunicorn)\b'
---
```

# python-venv-uwsgi —— Python 部署运维

适用：用户部署 Django / Flask / FastAPI；想"装 python 多版本 / 创建虚拟环境 / 用 uWSGI 或 gunicorn 跑 / 装到 systemd"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, "uwsgi")` / `service_status(server, "<app>")`（systemd 托管的 gunicorn/uvicorn，任何档位放行）。
- **看应用日志** → `tail_log(server, "/var/log/uwsgi/myapp.log")` / `tail_log(server, "/var/log/gunicorn/error.log")`（任何档位放行）；systemd 直管的看 `journalctl`（仍走 `ssh_exec journalctl -u <app>`）。
- **查 socket / 端口** → unix socket 用 `sftp_list(server, "/run/uwsgi")` 看 sock 文件在不在 + 权限；TCP 端口用 `port_check(server, 8000)`。
- **改 uwsgi.ini / gunicorn.conf.py / systemd unit / requirements.txt** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell 转义坑），写完 `ssh_exec ... systemctl reload` 或 `touch <touch-reload 文件>`。
- ⚠️ `sudo pip` / `--break-system-packages` / `systemctl restart/reload`（含 sudo）会触发**用户审批**——提前告知用户，被拒后不要原样重试。venv 内的 `.venv/bin/pip install` 多数不需要 sudo，能直接点出。

## 第一步：Python 版本管理

> ⚠️ **不要碰系统 Python**（`/usr/bin/python3`）—— 它是 OS 工具链依赖；改坏了 apt/dnf 都跑不了。

### pyenv（推荐）

```bash
# 装
curl https://pyenv.run | bash
# 加到 .bashrc / .zshrc：
# export PYENV_ROOT="$HOME/.pyenv"
# command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"
# eval "$(pyenv init -)"

pyenv install --list                              # 可装版本
pyenv install 3.12.3
pyenv versions                                    # 已装
pyenv global 3.12.3                               # 全局默认
pyenv local 3.11.9                                # 当前目录使用
pyenv shell 3.12.3                                # 当前 shell
```

### uv（Rust 实现，最新最快）

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.12
uv venv .venv --python 3.12
uv pip install -r requirements.txt                # 比 pip 快 10-100x
```

## 第二步：虚拟环境

### venv（标准库自带）

```bash
python3 -m venv .venv
source .venv/bin/activate                         # Linux/macOS
# .venv\Scripts\activate.bat                     # Windows
which python                                      # 应在 .venv/bin/python
pip install -r requirements.txt
deactivate
```

### virtualenv（更老更兼容）

```bash
pip install virtualenv
virtualenv -p python3.12 .venv
```

### Poetry / PDM（依赖管理 + venv 一体）

```bash
# Poetry
curl -sSL https://install.python-poetry.org | python3 -
poetry new myapp
poetry add fastapi uvicorn
poetry install
poetry run python -m myapp                        # 不激活直接跑
poetry shell                                      # 激活

# PDM（PEP 582 / 锁文件更现代）
pip install --user pdm
pdm init
pdm add fastapi
pdm install
pdm run python -m myapp
```

## 第三步：pip 与依赖

```bash
pip install <pkg>
pip install --upgrade <pkg>
pip uninstall <pkg>
pip install -r requirements.txt
pip install -r requirements.txt --no-deps         # 不装传递依赖（精确控制时）
pip install -e .                                  # 当前项目开发模式安装
pip install --index-url https://pypi.tuna.tsinghua.edu.cn/simple/ <pkg>     # 国内镜像

pip list                                          # 已装
pip list --outdated
pip show <pkg>                                    # 详情 + 安装位置
pip freeze > requirements.txt                     # 导出当前环境
pip check                                         # 检查依赖一致性
pip cache purge                                   # 清缓存
```

### 镜像源

```bash
# 全局
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple/

# 或 ~/.pip/pip.conf
[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple/
extra-index-url = https://pypi.org/simple/
```

## 第四步：uWSGI

```ini
# /etc/uwsgi/apps-available/myapp.ini
[uwsgi]
chdir           = /opt/myapp
module          = myapp.wsgi:application
home            = /opt/myapp/.venv
master          = true
processes       = 4
threads         = 2
socket          = /run/uwsgi/myapp.sock
chmod-socket    = 660
chown-socket    = www-data:www-data
vacuum          = true                            # 退出清理 socket / pid
die-on-term     = true                            # SIGTERM 真退出（不重启）
buffer-size     = 32768
post-buffering  = 8192
harakiri        = 30                              # 单请求 30s 强杀
max-requests    = 1000                            # 每个 worker 处理 1000 请求后重启（防内存泄漏）
max-requests-delta = 100
logto           = /var/log/uwsgi/myapp.log
log-date        = true
disable-logging = false
log-4xx         = true
log-5xx         = true
log-slow        = 1000                            # 慢请求阈值 ms

# 优雅 reload（不丢请求）
lazy-apps       = true
touch-reload    = /opt/myapp/.reload              # touch 这个文件即 reload
```

操作：

```bash
sudo systemctl restart uwsgi               # 全部 apps
sudo systemctl status uwsgi

# 单个 app reload（touch 法）
sudo touch /opt/myapp/.reload

# 状态（启动加 --stats）
uwsgi --connect-and-read /run/uwsgi/myapp.stats
```

## 第五步：gunicorn（更现代、配置更简单）

```bash
.venv/bin/pip install gunicorn

# Flask / Django (WSGI)
gunicorn myapp.wsgi:application \
    --bind unix:/run/gunicorn/myapp.sock \
    --workers 4 \
    --threads 2 \
    --worker-class gthread \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --timeout 30 \
    --graceful-timeout 30 \
    --log-level info \
    --access-logfile /var/log/gunicorn/access.log \
    --error-logfile /var/log/gunicorn/error.log

# FastAPI / Starlette (ASGI) —— 用 uvicorn workers
gunicorn myapp.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 4 \
    --bind 0.0.0.0:8000
```

### 配置文件方式

```python
# gunicorn.conf.py
bind = "unix:/run/gunicorn/myapp.sock"
workers = 4
threads = 2
worker_class = "gthread"
timeout = 30
max_requests = 1000
max_requests_jitter = 100
preload_app = True                            # 主进程加载一次，fork worker 共享内存（省内存）
accesslog = "/var/log/gunicorn/access.log"
errorlog = "/var/log/gunicorn/error.log"
```

```bash
gunicorn -c gunicorn.conf.py myapp.wsgi:application
```

## 第六步：systemd unit（gunicorn / uvicorn 独立部署）

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Python App
After=network.target

[Service]
Type=notify
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
Environment=PATH=/opt/myapp/.venv/bin
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=-/etc/myapp.env
ExecStart=/opt/myapp/.venv/bin/gunicorn -c gunicorn.conf.py myapp.wsgi:application
ExecReload=/bin/kill -s HUP $MAINPID
Restart=on-failure
RestartSec=5
KillMode=mixed                              # SIGTERM 主进程 + SIGKILL 残余
TimeoutStopSec=30
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
sudo systemctl reload myapp                  # 触发 gunicorn graceful reload
sudo journalctl -u myapp -f
```

## 第七步：Nginx 反代

### uWSGI socket

```nginx
upstream myapp {
    server unix:/run/uwsgi/myapp.sock;
}
server {
    location / {
        include uwsgi_params;
        uwsgi_pass myapp;
    }
}
```

### gunicorn socket（HTTP 反代）

```nginx
upstream myapp {
    server unix:/run/gunicorn/myapp.sock;
}
server {
    location / {
        proxy_pass http://myapp;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 第八步：性能调优要点

| 参数 | 说明 |
|------|------|
| `workers` | 通常 `(2 * CPU) + 1` —— I/O 密集；CPU 密集 `= CPU` |
| `threads`（gthread worker） | 单 worker 内线程；IO 等待用得上 |
| `max_requests` + `jitter` | 周期性重启 worker 防 leak |
| `preload_app=True` | 主进程加载 → fork worker 共享内存；**有副作用**：DB 连接、SSL ctx 在 fork 后要重建 |
| `timeout` | 单请求超时（worker 被主进程杀） |
| `graceful_timeout` | 滚动时旧 worker 等几秒 |

## 路径速查表

| 内容 | 路径 |
|------|------|
| 系统 Python | `/usr/bin/python3`（**不要碰**） |
| pyenv | `~/.pyenv/versions/<ver>/` |
| uv | `~/.local/share/uv/` |
| venv | 项目目录下 `.venv/` |
| pip 缓存 | `~/.cache/pip/`（XDG） |
| uWSGI 配置 | `/etc/uwsgi/apps-available/*.ini` + `apps-enabled/` |
| gunicorn 配置 | 项目内 `gunicorn.conf.py` 或 systemd ExecStart 行内参数 |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `sudo pip install` 不在 venv | **污染系统 Python**；可能与 apt/dnf 包冲突 |
| `pip install --break-system-packages` | PEP 668 保护被绕过（生产慎用，应用应该用 venv） |
| `rm -rf .venv` 没准备重建 | 应用立刻起不来 |
| `rm -rf /usr/lib/python3` | **系统工具链崩溃**，apt/dnf 都不能用 |
| 改 `requirements.txt` 但不锁版本 | 下次部署可能拿到 breaking change |
| uWSGI 配置 `lazy-apps=false` + DB 连接池 | 主进程 fork 出多个 worker 共享 socket，连接错乱 |
| systemd `Type=notify` 但应用没 `sd_notify` | systemd 等就绪超时杀进程 |

## 教训

- **生产部署用 venv**（不要装到系统 Python），即使是单一应用机器：升级 Python 主版本时不需要重装系统。
- `gunicorn` 比 `uWSGI` 更简单 + 配置短，新项目首选；老项目沿用 uWSGI 也行。
- `pip install` **永远在 venv 激活后**或带绝对路径 `.venv/bin/pip`；`sudo pip` = 灾难源。
- **锁版本**：用 `pip freeze > requirements.txt` / `poetry.lock` / `pdm.lock` / `uv.lock`；CI 装的与生产一字不差。
- worker 数公式 `(2 * CPU) + 1` 只是起点；实际看 CPU 利用率 / response time 调；I/O bound 应用可以拉更高。
- `preload_app=True` 是 gunicorn 经典坑：**fork 后**才建立 DB 连接 / Redis 连接，否则 worker 共享一个连接出大事。
- uvicorn 直接跑（不经 gunicorn）也行，但**没有 graceful reload**；生产 ASGI 推荐 gunicorn + UvicornWorker。

---

## 34. rabbitmq-ops

```yaml
---
name: rabbitmq-ops
description: RabbitMQ 运维 —— rabbitmqctl / management UI / queue / exchange / vhost / cluster / 监控。
触发词: rabbitmq, rabbitmqctl, amqp, queue, exchange, vhost, federation, shovel, dlx, dead letter, 死信队列, 消息队列, rabbitmq cluster, rabbitmq 4, rabbitmq 装, 装 rabbitmq, 部署 rabbitmq, 消息堆积, 消费跟不上, 消费慢, 队列积压, queue 堆积, ready 太多, ack 太慢, 集群脑裂, network partition, mirror queue, quorum queue, streams, management plugin, 15672, prefetch, 消息丢失, amqp 1.0, rabbitmq 挂了, rabbitmq 起不来, mq 连不上, 队列消费不动, 消息发不出去
dangerous_commands:
  - '(?i)\brabbitmqctl\s+(?:purge_queue|delete_queue|delete_vhost|reset|force_reset)\b'
  - '(?i)\brabbitmqctl\s+stop_app\b'
  - '(?i)\brabbitmqctl\s+forget_cluster_node\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/rabbitmq(?:\s|/|$)'
---
```

# rabbitmq-ops —— RabbitMQ 运维

适用：用户用 RabbitMQ 做消息队列；想"消费跟不上"/"queue 堆积"/"集群脑裂"/"加 vhost / user"/"配死信"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 RabbitMQ 优先用 `install_app(server, "rabbitmq")`**（在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 broker 服务状态 | `service_status(server, "rabbitmq-server")` | systemctl status |
| 看日志 | `tail_log(server, "/var/log/rabbitmq/rabbit@<host>.log")` | tail -n |
| 查 AMQP / 管理端口 | `port_check(server, 5672)` / `port_check(server, 15672)` | ss -tlnH |
| 改配置 | `sftp_read` 看现状 + `sftp_write(server, "/etc/rabbitmq/rabbitmq.conf", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，写完 `ssh_exec sudo systemctl restart rabbitmq-server`；后文 `rabbitmqctl` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 几乎所有 `rabbitmqctl` 写操作（add/delete user、set_permissions、purge_queue、reset、改配置后 restart）都含 `sudo` 或属危险命令 → **触发用户审批**。执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试，改只读探查（`list_queues`/`status`）或问用户。

## 第一步：状态总览

```bash
sudo rabbitmqctl status                          # 单节点状态
sudo rabbitmqctl cluster_status                  # 集群拓扑
sudo rabbitmqctl node_health_check               # 健康检查
sudo rabbitmqctl list_users
sudo rabbitmqctl list_vhosts
sudo rabbitmqctl list_queues --vhost / name messages consumers
sudo rabbitmqctl list_exchanges
sudo rabbitmqctl list_bindings
sudo rabbitmqctl list_connections
sudo rabbitmqctl list_channels
sudo rabbitmqctl list_consumers
```

`list_queues` 高频字段：

```bash
sudo rabbitmqctl list_queues --vhost / \
    name messages messages_ready messages_unacknowledged consumers state
```

| 字段 | 含义 |
|------|------|
| `messages` | 总消息数 = ready + unacked |
| `messages_ready` | 待投递 |
| `messages_unacknowledged` | 已投递未 ack |
| `consumers` | 消费者数 |
| `state` | running / flow / idle |

## 第二步：Management UI / API

```bash
# 启用 management 插件（一次）
sudo rabbitmq-plugins enable rabbitmq_management
# 默认 http://host:15672/  (admin/admin 默认账号 — **必改**)

# REST API
curl -u admin:pass http://host:15672/api/overview | jq
curl -u admin:pass http://host:15672/api/queues | jq '.[] | {name, messages, consumers}'
curl -u admin:pass -X POST http://host:15672/api/queues/%2F/myqueue/get \
    -H 'Content-Type: application/json' \
    -d '{"count":5,"ackmode":"ack_requeue_false","encoding":"auto"}'   # 取 5 条不重新入队（**消费数据**）
```

`%2F` = URL 编码的 `/`（默认 vhost）。

## 第三步：用户 / vhost / 权限

```bash
sudo rabbitmqctl add_user appuser '<pass>'
sudo rabbitmqctl set_user_tags appuser administrator    # 或 monitoring / management
sudo rabbitmqctl add_vhost /app
sudo rabbitmqctl set_permissions -p /app appuser ".*" ".*" ".*"      # configure, write, read
sudo rabbitmqctl change_password appuser '<new>'
sudo rabbitmqctl delete_user appuser

# 列权限
sudo rabbitmqctl list_permissions -p /app
sudo rabbitmqctl list_user_permissions appuser
```

## 第四步：Queue / Exchange 操作

```bash
# Queue
sudo rabbitmqctl purge_queue -p /app myqueue              # ⚠️ 清空队列消息
sudo rabbitmqctl delete_queue -p /app myqueue             # ⚠️ 删 queue
sudo rabbitmqctl set_policy -p /app HA '^ha\.' '{"ha-mode":"all"}'     # 镜像策略
sudo rabbitmqctl list_policies -p /app
sudo rabbitmqctl clear_policy -p /app HA
```

UI 上手动操作更直观；命令行优势：批量 / CI / 备份恢复。

## 第五步：消息堆积排查

```bash
# 找堆积 top
sudo rabbitmqctl list_queues --vhost /app name messages_ready messages_unacked \
    | sort -k2 -n -r | head -20
```

常见原因：

1. **消费者挂了**：`list_consumers` 看通道是不是空的；`list_connections` 看应用断开
2. **消费速度慢**：消费者代码慢 / DB 写慢；加并发 / 优化下游
3. **prefetch 太小**：消费者一次只拿 1 条 + 网络延迟拖死吞吐；调 `basicQos(prefetch=100)` 之类
4. **死信队列堆积**：业务报错重试无限循环；看 DLX 配置
5. **flow control** 触发：`state=flow` —— 内存/磁盘到阈值，broker 主动减慢生产者

## 第六步：死信交换机（DLX）

```bash
# 给 queue 配置死信目的地
sudo rabbitmqctl set_policy -p /app DLX '^orders\.' \
    '{"dead-letter-exchange":"dlx", "dead-letter-routing-key":"failed"}'
```

或在 queue 声明时（应用层）：

```python
channel.queue_declare(queue='orders', arguments={
    'x-dead-letter-exchange': 'dlx',
    'x-dead-letter-routing-key': 'failed',
    'x-message-ttl': 60000,     # 60s 后过期进 DLX
})
```

## 第七步：集群

```bash
# 节点 1 起好后，节点 2 加入：
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset                          # ⚠️ 清本地状态
sudo rabbitmqctl join_cluster rabbit@node1
sudo rabbitmqctl start_app

# 拓扑查看
sudo rabbitmqctl cluster_status

# 移除节点
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset
sudo rabbitmqctl start_app
# 在仍存活的节点上：
sudo rabbitmqctl forget_cluster_node rabbit@deadnode    # ⚠️ 走审批
```

### Quorum Queues（强烈推荐生产用）

3.8+ 起的新一代镜像队列，基于 Raft，**自动选主、不会脑裂**：

```python
channel.queue_declare(queue='orders', durable=True, arguments={'x-queue-type': 'quorum'})
```

老的 mirrored queue（policy `ha-mode`）官方推荐迁移到 quorum。

## 第八步：监控指标

Prometheus exporter 内置（3.8+）：

```bash
sudo rabbitmq-plugins enable rabbitmq_prometheus
# http://host:15692/metrics
```

关键指标：

| 指标 | 关注阈值 |
|------|---------|
| `rabbitmq_queue_messages_ready` | 持续涨 = 消费跟不上 |
| `rabbitmq_queue_messages_unacknowledged` | 持续涨 = 消费者 hang |
| `rabbitmq_node_disk_free` | < 1GB 触发 flow control |
| `rabbitmq_node_mem_used` | 接近 mem limit 触发 flow control |
| `rabbitmq_connections_opened_total` | 异常涨 = 消费者频繁重连 |
| `rabbitmq_channels` | 不应无限增长（应用 channel 泄漏） |

## 第九步：配置文件

```ini
# /etc/rabbitmq/rabbitmq.conf
listeners.tcp.default = 5672
management.tcp.port = 15672

# 资源限制（防 OOM）
vm_memory_high_watermark.relative = 0.6        # 内存 60% 触发 flow
disk_free_limit.relative = 2.0                 # 留 2x 内存的磁盘
```

```bash
sudo systemctl restart rabbitmq-server          # 改配置要 restart（reload 不够）
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 主配置 | `/etc/rabbitmq/rabbitmq.conf` |
| 环境 | `/etc/rabbitmq/rabbitmq-env.conf` |
| Erlang cookie | `/var/lib/rabbitmq/.erlang.cookie`（**集群所有节点必须一致 + chmod 400**） |
| 数据 | `/var/lib/rabbitmq/mnesia/` |
| 日志 | `/var/log/rabbitmq/` |
| Plugins | `rabbitmq-plugins list` |
| UI | `http://host:15672` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rabbitmqctl purge_queue` | 清空队列消息（**不可恢复**） |
| `rabbitmqctl delete_queue` | 删 queue（消息全部丢） |
| `rabbitmqctl delete_vhost` | 删 vhost + 下属所有 queue / exchange / 用户 binding |
| `rabbitmqctl reset` | 重置节点（**所有数据丢**） |
| `rabbitmqctl force_reset` | 同上但忽略前置检查 |
| `rabbitmqctl forget_cluster_node` 错节点 | 集群拓扑破坏 |
| `stop_app` 不 start_app | 节点暂停服务 |
| 改 erlang cookie 但其他节点没改 | 集群成员认证失败 |
| `rm -rf /var/lib/rabbitmq` | **删全部 broker 状态** |

## 教训

- **生产用 quorum queue** 不要再用 mirrored queue —— 后者出问题（split brain / 同步慢）几乎是无解的。
- erlang cookie 不一致是新手集群最常见的错；首次安装时**第一件事**就是 `scp` cookie 到所有节点 + `chmod 400`。
- management UI 默认 admin/admin 凭据**必改** —— OpsPub 敏感库会自动捕获，但用户初装时多半还没接 OpsPub。
- queue 堆积时**先看消费者**：`list_consumers` 看 channel 数 / unacked 数；多半是消费者卡死不是 broker 慢。
- `purge_queue` 是核武器：误清 = 业务数据全丢；除非用 DLX 死信再消费一遍。
- 跨数据中心：**不要用集群**（节点间要求低延迟），用 federation / shovel 单向同步。
- mem watermark 触发 flow control 后，生产者会被 throttle，**不是报错**；监控里看到 producer publish rate 突降 = 多半 flow control。

---

## 35. redis-ops

```yaml
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
```

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

🔴 **装 Redis 一律用 `install_app`**——Redis 在 OpsPub 应用商店目录里，`install_app` = 应用商店 UI 同款：密码 OpsPub 生成并**同步进容器+凭据库（两边一致、必连得上）**、容器 `opspub-redis`、绑 `127.0.0.1`、compose 落 `/opt/opspub/stacks/redis`、**自动登记 `redis_conn` 凭据带 SSH 隧道**（「数据库→Redis」页即装即连）。

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

## 36. redis-tools

```yaml
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
```

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

## 37. opspub-app-deploy

```yaml
---
name: opspub-app-deploy
description: 通用「用 OpsPub 部署任意应用」配方（框架无关）—— 共享中间件 install_app + 部署目标 deploy_upsert_target(compose 托管)，产物全进工作台台账、可一键重部署/回滚。任何项目部署没有专属框架技能时的默认剧本。
触发词: 部署, 上线, 发布, deploy, 部署到, 部署项目, 部署应用, 部署后端, 部署前端, docker部署, docker 部署, 容器部署, 上服务器, 发布到服务器, 部署到服务器, 生产部署, 上生产, 全栈部署, 反向代理部署, 用opspub部署, opspub部署
---
```

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
- **装共享中间件**：`install_app(server, "mysql"|"redis"|"postgres"|"mongodb")`（应用商店同款：密码 OpsPub 生成同步进容器+凭据库**必连得上**、容器 `opspub-<app>`、绑 127.0.0.1、自动登记 `_conn` 带 SSH 隧道）。🔴 **别用 `install_with_secret` 手写脚本装这些库**（手写易致"存的密码≠容器密码"、工作台连不上）。
- **建/触发部署**：`deploy_upsert_target`（产出部署目标，只写不执行）→ `deploy_dry_run`（预览）→ `deploy_run`（执行，进部署历史、可回滚）。
- **传产物**：`sftp_upload`（jar / dist 等大文件）；`sftp_read`/`sftp_write`（小文件 / 改配置）。
- 改动型（装库 / 部署 / sudo）按服务器档位走**审批**——提前告知用户、被拒别原样重试。

## 1. 探环境 → 报告 → 等确认（严禁探完直接干）
探完把现状 + **默认 Docker 方案**讲给用户，**拿到明确「确认 / 继续」才动手**。重点报：系统 / **内存+swap**（<2G 全栈必加 swap）/ 磁盘、Docker 装没装、域名解析、80/443 安全组、本地构建链。

## 2. 共享中间件一次装好（通用设施，整机一套）
- 需要 MySQL/Redis/PostgreSQL 等 → 用 **`install_app`** 装（见第零步）。
- 🔴 **通用设施，不带项目名**：凭据 label = 应用商店规范名 `MySQL` / `Redis`（user=root / db=0），容器 `opspub-mysql`/`opspub-redis`。**已装就复用**（`list_installed_services` 查），第二个项目共用同一套、**别重复装、别套项目前缀**。
- 记下返回的 `vault_id`，下一步引用。

## 3. 建后端部署目标 `deploy_upsert_target`（recipe=`docker-compose`，开 `compose` 托管）
- `name`: `<应用标识>-backend`（target 名可带端后缀，不影响凭据 / 栈名）；`servers`: `["<别名>"]`。
- 🔴 **`release.deployRoot` 必须 = `/opt/opspub/stacks/<应用标识>`**：compose 落这里、compose project = `<应用标识>`（唯一）→ OpsPub「容器/编排」页认作**自己的栈**（有启停/重建/编辑按钮）。**别用** `/opt/<app>` 等 stacks 外目录（会被扫成「外部栈」只读、project 名取目录名易撞）。
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
- 脚本 / 备份 / 上传产物放远程 `~/.opspub`（OpsPub 远程工作区），别臆造 `/data/...`、`/opt/backup` 这类不存在的路径。
- 🔴 **用了 MySQL / PostgreSQL → 服务凭据应有两条同类型凭据（mysql_conn / postgres_conn）**：共享 `MySQL`(root) + app 专属 `<应用标识>`。只有一条 = 没走 `compose.db`（漏登记）→ 用 `save_credential` 补（host/port/user/database=`<应用标识>`，密码从 app 容器 `printenv DB_PASSWORD` 经脱敏 vaultRef 传 `fieldsFromVault`）。
- 🔴 **走了手工出口的库（MongoDB 等）→ 同样要有 app 专属那条凭据**（kind 按该库类型，label=`<应用标识>`），没有就按上一条 `save_credential` 补。PostgreSQL 与 MySQL 一样由 `compose.db` 自动登记 `postgres_conn`。
- 🔴 **后端容器在「编排」页是「自己的栈」而非「外部」** → 若显示「外部」=deployRoot 没落在 `/opt/opspub/stacks/`，下次部署改对。

## 铁律
- 默认 Docker；内存紧张 = swap + `mem_limit` + 限堆 / 调 DB 缓冲，**仍 Docker**，不擅自切原生（除非用户明确要）。
- 共享 MySQL/Redis 通用名、整机一套；app 自身的东西（容器 / 库 / 库账号 / 栈目录 / target）一律用 `<应用标识>`。
- 凭据永不进对话 / 日志（`[REDACTED:xxx]` 是正常脱敏，别因此重新生成密码死循环）。
- 产物一律进台账（走 install_app / deploy_upsert_target / save_credential / web_*），别手搓绕过；引擎不支持的环节走第 3 步「引擎不支持时的出口」，手工做完照样补登记。

---

## 38. ruoyi-plus-uniapp-deploy

```yaml
---
name: ruoyi-plus-uniapp-deploy
description: RuoYi-Plus + uniapp（ruoyi-plus-uniapp）全栈部署配方 —— 走 OpsPub 部署目标(Target)：共享 MySQL/Redis + deploy_upsert_target，产物进工作台、可一键重部署/回滚。
触发词: ruoyi, ruoyi-plus, ruoyi-plus-uniapp, ruoyi-vue-plus, ruoyivue, ryplus, ryplus_uni, ryplus-uni, 若依, 若依plus, 若依部署, plus-ui, plus-uniapp, plus-app, ruoyi 部署, ruoyi上线, 部署若依, springboot+vue 部署, 后台管理系统部署, 后台管理部署
---
```

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

## 39. selinux-apparmor

```yaml
---
name: selinux-apparmor
description: SELinux + AppArmor 强制访问控制速查 —— 模式 / 标签 / 策略 / audit2allow / aa-status / 调试。
触发词: selinux, apparmor, getenforce, setenforce, semanage, audit2allow, aa-status, aa-complain, 权限被拒, denied, avc, mac, 强制访问控制, permission denied, 权限对但读不到, 文件权限对但, 服务起不来无报错, 起不来没报错, 权限够但起不来, 关 selinux, 禁用 selinux, disable selinux, selinux 是否开启, selinux 状态, chcon, restorecon, 上下文, context, label, security context, enforcing, permissive, 标签不对, 文件标签, 被拦了, 莫名其妙起不来
dangerous_commands:
  - '(?:^|[\s;&|])setenforce\s+0(?:\s|$)'
  - '(?:^|[\s;&|])sed\s+-i\b[^\n]*SELINUX=disabled\b[^\n]*/etc/selinux/config\b'
  - '(?:^|[\s;&|])aa-disable\s+(?:/etc/apparmor\.d/)?usr\.sbin\.(?:sshd|nginx|apache)\b'
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:apparmor|selinux)\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/(?:selinux|apparmor\.d)(?:\s|/|$)'
---
```

# selinux-apparmor —— 强制访问控制

适用：用户报"操作权限明明对但还是 denied"/"文件权限对但程序读不到"/"systemd 服务起不来无明显报错"。多半是 MAC（强制访问控制）层拦截。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看出问题的服务状态** → `service_status(server, "<svc>")`（任何档位放行）——MAC 拦截常表现为"服务起不来但 systemctl 无明显原因"，先看状态。
- **读 audit 日志找 denied** → `tail_log(server, "/var/log/audit/audit.log", lines?)`（= tail -n，只读放行）；要 `grep denied/AVC` 过滤时再走 `ssh_exec`。
- **看文件标签 / 状态** → `getenforce` / `sestatus` / `ls -lZ` / `aa-status` 是只读探测，可直接 `ssh_exec`（只读判定一般放行；带 `sudo` 的 `ausearch`/`sealert` 会触发审批）。
- **改策略**（`semanage` / `setsebool -P` / `restorecon` / `audit2allow` / `aa-enforce`）属**改动型**，走 `ssh_exec` 过策略档位 + 审批。

⚠️ `setenforce 0`（临时关 SELinux）/ 改 `/etc/selinux/config` / `aa-disable` 关键服务 profile 会触发**用户审批**——执行前告诉用户"这步会降级安全防护、需要你批准"，**被拒后不要原样重试**。
🔴 **关 SELinux 重启有"再也起不来"风险**：标签一旦失效，重新开 enforcing 时服务可能全拒。生成的自定义 module（`.pp`）、收集的 audit 片段放 `~/.opspub/scripts/` 或 `~/.opspub/tmp/`（OpsPub 统一工作区），别散落 /tmp。

## 对照

| 维度 | SELinux | AppArmor |
|------|---------|----------|
| 模型 | Type Enforcement + 标签 | Path-based + profile 文件 |
| 默认发行版 | RHEL / Rocky / Fedora / CentOS | Ubuntu / Debian / SUSE |
| 配置复杂度 | 高（策略 + 标签 + bool） | 中（profile 即 path 列表） |
| 调试工具 | `audit2allow` / `sealert` / `semanage` | `aa-logprof` / `aa-status` |

## 一、SELinux

### 模式

```bash
getenforce                                # 当前模式
# Enforcing  = 严格执行（生产）
# Permissive = 只记录不拦截（**调试推荐**）
# Disabled   = 完全关闭（**生产不推荐**）

sudo setenforce 0                         # **临时**切到 Permissive（重启失效）
sudo setenforce 1                         # 切回 Enforcing
```

> ⚠️ 把 `/etc/selinux/config` 改成 `SELINUX=disabled` **持久关 SELinux** 是常见绕过；但很多商业软件 / 合规要求必开，**远程关 SELinux 重启 = 一旦标签失效再开就起不来**。

### 状态详查

```bash
sestatus                                  # 当前 + 持久配置
seinfo                                    # 策略统计（policycoreutils-python-utils）
```

### 看上下文（标签）

```bash
ls -lZ                                    # 文件标签
ls -Z /var/www/html
ps -eZ                                    # 进程标签
id -Z                                     # 当前用户标签
ss -Ztlnp                                 # socket 标签
```

输出如：

```
system_u:object_r:httpd_sys_content_t:s0  index.html
   user      role           type           level
```

**Type** 是 SELinux 最关键的属性（如 `httpd_sys_content_t` = nginx/apache 可读的网页内容）。

### 改标签

```bash
# 临时
sudo chcon -t httpd_sys_content_t /var/www/html/file.html

# 持久（重启 / restorecon 仍保留；**推荐**）
sudo semanage fcontext -a -t httpd_sys_content_t '/srv/web(/.*)?'
sudo restorecon -Rv /srv/web

# 看正则
sudo semanage fcontext -l | grep srv
```

### Boolean（policy 开关）

很多通用策略以 bool 形式存在，比改 type 简单：

```bash
sudo getsebool -a | grep httpd            # 所有 httpd 相关 bool
sudo setsebool -P httpd_can_network_connect on    # -P 持久
sudo setsebool -P httpd_can_sendmail on
sudo setsebool -P nfs_export_all_rw on
```

常用 bool：

| Bool | 用途 |
|------|------|
| `httpd_can_network_connect` | nginx/apache 能连后端（如 unicorn / php-fpm 不同机） |
| `httpd_enable_homedirs` | nginx 能读用户 home |
| `samba_enable_home_dirs` | samba 共享 home |
| `nis_enabled` | 启用 NIS 相关访问 |
| `ssh_sysadm_login` | sysadm 角色能 SSH 登录 |

### 端口标签

```bash
sudo semanage port -l | grep ssh
sudo semanage port -a -t ssh_port_t -p tcp 2222      # 加非标 SSH 端口
sudo semanage port -m -t http_port_t -p tcp 8080     # 改 8080 为 http 类型
sudo semanage port -d -t ssh_port_t -p tcp 2222      # 删
```

### 排查"为啥被拦"

```bash
# 1) 看 audit log
sudo ausearch -m AVC,USER_AVC -ts recent
# 或
sudo grep -i "denied\|AVC" /var/log/audit/audit.log | tail

# 2) 让 sealert 给"人话"建议（setroubleshoot 包）
sudo sealert -a /var/log/audit/audit.log

# 3) audit2allow 直接生成"允许这个动作的 module"
sudo grep nginx /var/log/audit/audit.log | audit2allow -M nginx-custom
sudo semodule -i nginx-custom.pp
```

### 排障流程（推荐）

```
出现"denied" / 服务起不来
   ↓
临时 setenforce 0   --   验证：是否就是 SELinux 的事
   ↓
是 → setenforce 1 重回 enforcing
   ↓
ausearch / sealert 找具体规则
   ↓
首选：boolean 调整（setsebool -P）
次选：标签修正（chcon / semanage fcontext + restorecon）
最后：audit2allow 生成自定义 module
   ↓
**不要永久 SELINUX=disabled**
```

## 二、AppArmor

### 状态

```bash
sudo aa-status
# 输出：
# X profiles are loaded
# X profiles are in enforce mode
# Y profiles are in complain mode
# Z processes have profiles defined

sudo apparmor_status                      # 同上
```

模式：

| 模式 | 含义 |
|------|------|
| `enforce` | 严格执行（默认） |
| `complain` | 只记录违规不拦截（**调试用**） |
| `disable` | 关闭该 profile（保留文件） |
| 没 profile | 不受限 |

### 切模式（单 profile）

```bash
sudo aa-complain /etc/apparmor.d/usr.sbin.nginx     # nginx 进入 complain 模式
sudo aa-enforce /etc/apparmor.d/usr.sbin.nginx      # 切回 enforce
sudo aa-disable /etc/apparmor.d/usr.sbin.nginx      # ⚠️ 关闭
sudo aa-enforce /etc/apparmor.d/usr.sbin.nginx      # 重新启用

# 全部 enforce 模式
sudo aa-enforce /etc/apparmor.d/*

# 重载所有
sudo systemctl reload apparmor
```

### Profile 文件结构

```
# /etc/apparmor.d/usr.sbin.nginx
#include <tunables/global>

/usr/sbin/nginx {
    #include <abstractions/base>
    #include <abstractions/nis>

    capability dac_override,
    capability net_bind_service,
    capability setgid,
    capability setuid,

    /etc/nginx/** r,
    /etc/ssl/private/** r,
    /var/log/nginx/* w,
    /var/www/** r,
    /run/nginx.pid w,
    /run/nginx/* w,

    network inet stream,
    network inet6 stream,
}
```

权限标志：

| 标志 | 含义 |
|------|------|
| `r` | 读 |
| `w` | 写 |
| `a` | 追加 |
| `x` | 执行（要配子 profile） |
| `m` | 内存映射可执行（mmap） |
| `k` | 加锁 |
| `l` | link |

### 排查被拦

```bash
# 日志
sudo dmesg | grep DENIED                  # 内核 AVC
sudo journalctl -k | grep apparmor

# 实时
sudo tail -f /var/log/syslog | grep apparmor          # Debian

# 交互式补 profile
sudo aa-logprof                           # 走最近的 DENIED 让你选 allow / deny / ignore，自动写进 profile
```

### 生成新 profile

```bash
sudo aa-genprof /usr/bin/myapp            # 跑一遍应用、aa-genprof 监听 + 学习
# 跑完按 'F' 完成
```

## 三、容器与 MAC

### Docker / Podman

Docker 自带 AppArmor profile（默认 `docker-default`）+ 默认 SELinux 标签处理（`container_t`）。

```bash
# 给容器自定义 AppArmor profile
docker run --security-opt apparmor=my-profile ...

# 关闭（不推荐）
docker run --security-opt apparmor=unconfined ...

# SELinux 标签（启用了 SELinux 的宿主）
docker run --security-opt label=type:container_t ...
docker run --security-opt label=disable ...      # 关
```

### K8s

PodSecurityContext / SecurityContext 可以指定 SELinux 标签和 AppArmor profile：

```yaml
spec:
  securityContext:
    seLinuxOptions:
      type: container_t
  containers:
    - name: app
      image: nginx
      securityContext:
        appArmorProfile:
          type: Localhost
          localhostProfile: my-nginx-profile
```

## 四、常见场景

### 场景 1：Nginx 起不来（SELinux）

`/var/log/audit/audit.log` 看到：

```
denied  { read } for pid=12345 comm="nginx" path="/data/www/index.html" scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:default_t:s0
```

= nginx 想读 /data/www 但目录标签是 `default_t`（不是 nginx 能读的 `httpd_sys_content_t`）。

修：

```bash
sudo semanage fcontext -a -t httpd_sys_content_t '/data/www(/.*)?'
sudo restorecon -Rv /data/www
```

### 场景 2：nginx 反代后端 502（SELinux）

audit log: `denied { name_connect } for pid=... comm="nginx" dest=8080 ... tcontext=...:http_port_t:...` → nginx 不能 connect 出去。

```bash
sudo setsebool -P httpd_can_network_connect on
```

### 场景 3：SSH 改端口起不来（SELinux）

```
sshd: error: Bind to port 2222 on 0.0.0.0 failed: Permission denied
```

```bash
sudo semanage port -a -t ssh_port_t -p tcp 2222
```

### 场景 4：MySQL 自定义 datadir 起不来（SELinux）

```bash
sudo semanage fcontext -a -t mysqld_db_t '/data/mysql(/.*)?'
sudo restorecon -Rv /data/mysql
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| SELinux 配置 | `/etc/selinux/config` |
| SELinux 策略 | `/etc/selinux/targeted/policy/` |
| SELinux audit | `/var/log/audit/audit.log` |
| AppArmor profiles | `/etc/apparmor.d/` |
| AppArmor 已禁用 link | `/etc/apparmor.d/disable/` |
| AppArmor 缓存 | `/var/cache/apparmor/` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `setenforce 0` | **安全降级**（运行时） |
| 改 `/etc/selinux/config` SELINUX=disabled + 重启 | 完全关 SELinux；标签可能丢失（再开要 `touch /.autorelabel` 全盘重打标，启动耗时） |
| `aa-disable` 关键服务 profile | 服务失去 AppArmor 保护 |
| `systemctl stop apparmor / selinux` | 失去 MAC 防护 |
| `rm -rf /etc/selinux` / `/etc/apparmor.d` | 删全部策略 |
| `setenforce 0` 后疏忽未恢复 | 长期 Permissive = 等同关闭，合规失格 |

## 教训

- **永远不要 `SELINUX=disabled` 永久关**；切到 `Permissive` 至少留审计日志。
- 排障第一步 `sudo setenforce 0` 验证是不是 SELinux 的事，**验证完立即** `setenforce 1` —— 留着不改是常见漏洞源。
- 用 `semanage fcontext` + `restorecon` 而**不是** `chcon`：后者一次性，前者写到策略 db 里持久。
- `audit2allow` 生成的 module 只允许"当前观察到"的违规；**未来新行为还是会被拦**，要么继续生成补丁，要么用 boolean。
- AppArmor profile 修改后必须 `systemctl reload apparmor` 或 `apparmor_parser -r /etc/apparmor.d/...`。
- Docker 默认 AppArmor profile **会拦一些容器内的 ptrace**；调试 `strace` 等需要 `--security-opt apparmor=unconfined`（仅调试容器）。
- 大变更前先 `setenforce 0` 跑一遍业务流量收集 audit log，再用 audit2allow 生成精确 module，**比直接关 SELinux 安全得多**。

---

## 40. ssh-hardening

```yaml
---
name: ssh-hardening
description: SSH 服务加固清单 —— sshd_config 关键项 / 密钥登录 / fail2ban / 端口改造 / Match 限制 / authorized_keys。
触发词: ssh, sshd, sshd_config, ssh 加固, fail2ban, ssh 端口, ssh 密钥, authorized_keys, permitrootlogin, passwordauthentication, ssh 暴力破解, ssh login, ssh 连不上, ssh 登不进, ssh 登录不了, 登录不了, 关 root 登录, 禁用密码登录, 改密钥登录, 公钥登录, 私钥登录, 改 ssh 端口, 22 端口, ssh 被攻击, ssh 爆破, 防爆破, 双因素, 2fa, google authenticator, ssh key, pubkey, jumpserver, 跳板机, bastion
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?[~/\w.-]*authorized_keys\b'
  - '(?:^|[\s;&|])(?:>|truncate\s+-s\s+0)\s*[~/\w.-]*authorized_keys\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/ssh(?:\s|/|$)'
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+sshd?\b'
  - '(?:^|[\s;&|])(?:kill|killall)\s+(?:-9\s+)?sshd?\b'
  # 手动封禁：封错来源 = 把管理员自己挡在 SSH 外，而封完就连不上去解封了
  - '(?i)\bfail2ban-client\s+set\s+\S+\s+banip\b'
  # 停掉 fail2ban / 整体解封 = 防爆破直接失效（合法运维有此场景，故走审批而非永久拦截）
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+fail2ban\b'
  - '(?i)\bfail2ban-client\s+(?:stop|unban\s+--all)\b'
---
```

# ssh-hardening —— SSH 服务加固

适用：用户报"SSH 被爆破"/"想关密码登录改密钥"/"换端口"/"加 fail2ban"/"配 authorized_keys"/"加双因素"。

## 🤖 OpsPub 衔接（先读）

- **改 sshd_config / authorized_keys** → `sftp_read` 看现状 + `sftp_write` 整文件写（注：`/etc/ssh/sshd_config` 本身不在 SFTP 敏感路径黑名单，可写；但务必先备份，见下）。改完 `service_status(server, "sshd")` 看状态。
- ⚠️ **这是最容易把自己锁外面的技能**：所有 sudo 改配置都会触发审批；且 OpsPub 走的是同一条 SSH——改完若把自己锁了，下次工具调用就连不上。**保险绳是硬要求**，见下节。
- OpsPub 主连接由连接池维持（SessionPool），但改 sshd 配置 + reload 后**新建连接**会走新规则——若新规则锁了 OpsPub 的登录方式（如关了密码但 OpsPub 用的是密码凭据），池子重连即失败。改 auth 方式前先确认 OpsPub 该服务器用的是密钥还是密码凭据。

## ⚠️ 远程加固前的保险绳（**必读**）

> 任何修改 `sshd_config` 或防火墙的操作都可能把你自己锁外面。**永远在第二条 ssh 会话验证生效前，保留第一条会话**，并准备好 5 分钟回滚定时：

```bash
# 在改 sshd_config / 防火墙前，先布保险绳
cp /etc/ssh/sshd_config ~/.opspub/backups/sshd_config.$(date +%s).bak   # 备份落 OpsPub 工作区
echo "cp ~/.opspub/backups/sshd_config.<ts>.bak /etc/ssh/sshd_config && systemctl reload sshd && iptables -F" | at now + 5 minutes
atq                                          # 看看保险绳排队了
# 改完测通了 → atrm <job-id>
```

或更稳：起 tmux/screen + `sleep 300 && reboot`，开机会回到改前。

## 第一步：sshd_config 基础加固清单

文件：`/etc/ssh/sshd_config`（含 `/etc/ssh/sshd_config.d/*.conf` 子目录）。

| 配置 | 推荐值 | 说明 |
|------|--------|------|
| `Port` | 改默认 22 → 自定义高位（如 60022） | **可选**；改完通知所有人。22 端口被扫得最猛 |
| `PermitRootLogin` | `no`（或 `prohibit-password`） | 禁 root 直接登；改用普通用户 + sudo |
| `PasswordAuthentication` | `no` | 关密码登录，强制密钥 |
| `PubkeyAuthentication` | `yes` | 启用密钥（默认就是） |
| `PermitEmptyPasswords` | `no` | 默认就是；不变 |
| `ChallengeResponseAuthentication` | `no` | 关交互式（避免 keyboard-interactive 绕过） |
| `KbdInteractiveAuthentication` | `no` | OpenSSH 8.7+ 替代上面那个 |
| `UsePAM` | `yes` | 保留 PAM（fail2ban / 2FA 走它） |
| `X11Forwarding` | `no` | 一般用不上 |
| `AllowTcpForwarding` | `yes`（按需）/ `no` | 关掉会断 ssh 隧道 |
| `ClientAliveInterval` | `300` | 5 分钟无操作发心跳 |
| `ClientAliveCountMax` | `2` | 心跳失败 2 次断开 |
| `MaxAuthTries` | `3` | 单次连接最多 3 次密码尝试 |
| `LoginGraceTime` | `30` | 30 秒未登录就断开 |
| `MaxStartups` | `10:30:60` | 防 DDoS 连接耗尽 |
| `AllowUsers` / `AllowGroups` | `AllowGroups ssh-users` | 白名单用户/组 |
| `DenyUsers` / `DenyGroups` | 按需 | 黑名单（少用） |
| `Banner` | `/etc/issue.net` | 登录前显示警告（合规要求） |

改完**必跑**：

```bash
sudo sshd -t                                # 语法检查（**别忘**）
sudo systemctl reload sshd                  # reload 不断现有会话
```

⚠️ `systemctl restart sshd` **会断现有会话**；`reload` 不会。

## 第二步：密钥登录配置

### 客户端生成

```bash
ssh-keygen -t ed25519 -C "you@laptop"       # ed25519 最佳（短、快、安全）
ssh-keygen -t rsa -b 4096 -C "you@laptop"   # 兼容老服务器用 RSA 4096
```

私钥默认 `~/.ssh/id_ed25519`，公钥 `~/.ssh/id_ed25519.pub`。私钥**必须** `chmod 600`。

### 服务器装公钥

```bash
# 简单粗暴
ssh-copy-id -i ~/.ssh/id_ed25519.pub user@host

# 或手动
ssh user@host 'mkdir -p ~/.ssh && chmod 700 ~/.ssh'
cat ~/.ssh/id_ed25519.pub | ssh user@host 'cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys'
```

### authorized_keys 高级用法

每行一把公钥，前面可加选项限制：

```
# 限制能跑的命令
command="rsync --server -vlogDtprze.iLsfxC . /backup/",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... backup@laptop

# 限制来源 IP
from="10.0.0.0/24,192.168.1.5" ssh-ed25519 AAAA... ops@laptop

# 限制有效期（OpenSSH 8.2+）
expiry-time="20251231235959" ssh-ed25519 AAAA... contractor@laptop
```

## 第三步：Match 块（按用户/组/IP 差异化）

```
# 默认全局禁密码
PasswordAuthentication no

# 但某个内网管理员组允许密码（应急）
Match Group ops-emergency Address 10.0.0.0/8
    PasswordAuthentication yes
    PubkeyAuthentication yes

# rsync-only 用户限制只能跑 rsync
Match User backup
    ForceCommand /usr/bin/rrsync /backup
    AllowTcpForwarding no
    X11Forwarding no
```

> `Match` 块**必须放在文件最后**（其后所有配置都属于这个块直到下一个 Match）。

## 第四步：fail2ban（暴力破解防护）

> 🔴 **优先用 `install_app(server, "fail2ban")`**（fail2ban 在 OpsPub 应用商店目录里）——
> 它自动做掉下面四件手装最容易漏的事：① 把**本次 SSH 的来源 IP** 写进 `ignoreip`（防自锁）；
> ② Debian 12+ 无 `/var/log/auth.log` 时切 `backend=systemd` 并装 `python3-systemd`；
> ③ RHEL 系自动启 EPEL 并装 `fail2ban-firewalld`；④ banaction 跟随机器实际防火墙
> （firewalld / nftables / iptables）。装完进「已安装」台账。下面是手装/排查用的原理说明。

手装：

```bash
sudo apt install -y fail2ban python3-systemd    # Debian/Ubuntu
sudo dnf install -y epel-release                 # RHEL/Rocky：fail2ban 在 EPEL
sudo dnf install -y fail2ban fail2ban-firewalld  # 不装 -firewalld 会与 firewalld 抢规则
```

🔴 **三个「装了却不生效」的真实坑**（静默失效，不报错，最难查）：

| 现象 | 根因 | 解 |
|---|---|---|
| jail 起了但从不封人 | Debian 12 起 rsyslog 是可选包，没它就没 `/var/log/auth.log`，`backend=auto` 读了个空 | `backend = systemd`（需 `python3-systemd`） |
| fail2ban 起不来 | 同上，sshd jail 指向不存在的 logpath | 同上 |
| 状态显示封了，但对方照连 | banaction 与实机防火墙不匹配（规则写进没人看的表） | firewalld 跑着 → `firewallcmd-rich-rules`；只有 nft 没 iptables → `nftables-multiport` |

配置：

```ini
# /etc/fail2ban/jail.d/sshd.local
[sshd]
enabled = true
port    = 22                # 改了 SSH 端口就改这里
filter  = sshd
logpath = /var/log/auth.log     # Debian
# logpath = /var/log/secure    # RHEL
backend = systemd               # 推荐：直接读 journal
maxretry = 5                # 5 次失败
findtime = 10m              # 10 分钟内
bantime  = 1h               # 封 1 小时
```

操作：

```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status                 # 启用的 jail 列表
sudo fail2ban-client status sshd            # sshd jail 详情 + 已封 IP
sudo fail2ban-client set sshd unbanip 1.2.3.4   # 解封
sudo fail2ban-client set sshd banip 1.2.3.4     # 手动封
```

> ⚠️ **白名单自己的管理 IP**：`ignoreip = 127.0.0.1/8 10.0.0.0/8 你的公网IP`，**否则你自己就会被封**。

## 第五步：双因素认证（2FA / TOTP）

```bash
sudo apt install -y libpam-google-authenticator
google-authenticator                        # 当前用户跑一次，扫码绑定
# 编辑 /etc/pam.d/sshd 顶部加：
# auth required pam_google_authenticator.so
# 编辑 /etc/ssh/sshd_config：
# ChallengeResponseAuthentication yes   （注意：与上面"加固清单"建议矛盾，按需取舍）
# AuthenticationMethods publickey,keyboard-interactive   # 密钥 + 2FA 双重
sudo systemctl reload sshd
```

`AuthenticationMethods publickey,keyboard-interactive` = **必须** 先验密钥，再验 TOTP。

## 第六步：端口改造（如果决定改）

1. 防火墙先开新端口
   ```bash
   sudo firewall-cmd --permanent --add-port=60022/tcp && sudo firewall-cmd --reload
   # 或 ufw
   sudo ufw allow 60022/tcp
   ```
2. SELinux 给 sshd 加新端口（RHEL/CentOS）
   ```bash
   sudo semanage port -a -t ssh_port_t -p tcp 60022
   ```
3. 改 `sshd_config` 加 `Port 60022`（**保留 `Port 22` 一段时间作为回滚通道**，待全部人切换完再删）
4. `sudo sshd -t && sudo systemctl reload sshd`
5. **新会话**测试 `ssh -p 60022 user@host`
6. 全员切换完，删 22 端口配置 + 防火墙关 22

## 第七步：known_hosts 与中间人

```bash
# 提前固定 host key（避免首次连接时 TOFU 被劫持）
ssh-keyscan -t ed25519,rsa example.com >> ~/.ssh/known_hosts

# host key 变了
ssh-keygen -R example.com                   # 删旧记录
```

> OpsPub 自己实现了 TOFU + HostKeyMismatch 检测，外部 ssh 客户端要手动维护 known_hosts。

## 路径速查表

| 内容 | 路径 |
|------|------|
| 服务端配置 | `/etc/ssh/sshd_config`（+ `/etc/ssh/sshd_config.d/*.conf`） |
| 客户端配置 | `~/.ssh/config`（用户）/ `/etc/ssh/ssh_config`（系统） |
| 用户公钥 | `~/.ssh/authorized_keys` |
| 主机密钥 | `/etc/ssh/ssh_host_*_key`（私）/ `*.pub`（公） |
| 登录日志 | `/var/log/auth.log`（Debian）/ `/var/log/secure`（RHEL） |
| fail2ban 配置 | `/etc/fail2ban/jail.d/*.local`（**不要改 jail.conf**） |
| fail2ban 状态 | `/var/lib/fail2ban/fail2ban.sqlite3` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm ~/.ssh/authorized_keys` / `> authorized_keys` | 删/清空公钥，**远程立刻失联** |
| `rm -rf /etc/ssh` | 删 ssh 全部配置 + host key |
| `systemctl stop/disable/mask sshd` | **远程立刻失联**，恢复只能带外/控制台 |
| `kill -9 sshd` | 同上；现有会话也会断 |
| 同时关 `PasswordAuthentication` + `PubkeyAuthentication` | 双重锁死，**没办法登录** |
| `iptables -F` / `ufw reset`（不带保险绳） | 防火墙规则全清，SSH 可能瞬间断（默认允许 + 大多数发行版安全） |

## 教训

- **保留旧端口/旧 auth 方式作为回滚通道**：改 sshd_config 永远先并存两套（如旧 22 + 新 60022 / 密钥 + 临时允许密码），全员切完再清。
- `sudo sshd -t` 是免死金牌：**任何 reload 前必跑**，配置坏了 reload 失败但旧进程仍在跑（保住命）。
- fail2ban 白名单务必加自己的管理 IP；**远程办公网络是动态 IP** 的话，先用 VPN 固定再加白名单。
- 用 Match 块时记得加 `Match all` 或新建段，否则后续配置都被认为属于上一个 Match。
- `authorized_keys` 权限错（不是 600 / 700）→ ssh **静默拒绝登录**，不会有明显报错，要看服务端 `/var/log/auth.log`。
- 改 SELinux 端口（`semanage port`）忘了 → sshd 起不来报 "Could not load host key" 或绑定失败；`audit2allow` 看具体规则。

---

## 41. systemd-service

```yaml
---
name: systemd-service
description: systemd 自定义服务速查 —— unit 文件 / Type / Restart / 环境变量 / timer / journalctl / 启动顺序。
触发词: systemd, systemctl, unit, service, daemon-reload, timer, 定时任务, 开机启动, 自启, target, journalctl, journal, 服务起不来, 服务挂了, 服务启动失败, 守护进程, 后台运行, 开机自启, 定时跑, 跑命令一退就没了, systemd 服务, 自定义服务, 自动重启, 自动拉起, restart always, restart on-failure, failed state, masked 状态, exit code, status=, signal=, 服务异常退出, exitcode 非零
dangerous_commands:
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:sshd?|systemd-journald|systemd-resolved|systemd-networkd|NetworkManager|networking|dbus|cron|crond)\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/systemd/system(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?/lib/systemd/system/[\w@.-]+\.(?:service|socket|timer|target)\b'
  # 切到救援/紧急 target = 单用户模式，远程生产直接失联（正文危险清单对应项）
  - '(?:^|[\s;&|])systemctl\s+(?:set-default|isolate)\s+(?:rescue|emergency)\.target\b'
---
```

# systemd-service —— systemd 自定义服务

适用：用户想"开机启动自定义脚本"/"做定时任务（替代 cron）"/"服务挂了自动拉起"/"看服务为啥起不来"/"调依赖关系"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, service)`（= systemctl status --lines=20，任何档位放行）——比 `ssh_exec systemctl status` 稳，readonly 档也不会被拒。
- **写 unit 文件** → 先 `sftp_read` 看现状，再 `sftp_write(server, path, content)` 整文件写入——比 ssh_exec 里 heredoc/echo 拼接可靠（无 shell 转义坑），写完 `ssh_exec sudo systemctl daemon-reload`。
- ⚠️ `sudo systemctl daemon-reload / enable / restart` 都会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## 第一步：unit 文件结构

最小可用 service：

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My App
After=network.target
Wants=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/server --config /opt/myapp/conf.toml
Restart=on-failure
RestartSec=5
Environment=ENV=prod
Environment=DB_HOST=10.0.0.1
EnvironmentFile=-/etc/myapp.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload                # 改了 unit 文件**必跑**
sudo systemctl enable --now myapp           # 开机启动 + 立即启动
sudo systemctl status myapp
sudo journalctl -u myapp -f                 # 实时跟日志
```

## 第二步：常用 [Service] 字段

| 字段 | 取值 | 用途 |
|------|------|------|
| `Type` | `simple` / `forking` / `exec` / `oneshot` / `notify` / `dbus` | 见下表 |
| `ExecStart` | 完整命令（**不解析 shell**，要 `;` 或管道写 `bash -c "..."`) | 主进程 |
| `ExecStartPre` | 启动前钩子 | mkdir / chown / check |
| `ExecStartPost` | 启动后钩子 | 注册到服务发现 |
| `ExecStop` | 自定义停止命令 | 不填则 SIGTERM 主进程 |
| `ExecReload` | reload 时跑 | 给应用发 SIGHUP / nginx -s reload |
| `Restart` | `no` / `on-failure` / `on-success` / `always` / `on-abnormal` | 推荐 `on-failure` |
| `RestartSec` | 秒 | 重启间隔，默认 100ms（太频繁会触发 StartLimit） |
| `StartLimitIntervalSec` | 秒（默认 10） | 失败计数窗口 |
| `StartLimitBurst` | 次数（默认 5） | 窗口内允许失败次数；超过就放弃重启 |
| `User` / `Group` | 用户名 | **强烈推荐**不要用 root |
| `WorkingDirectory` | 路径 | 切到这里再执行 |
| `Environment` | `KEY=VALUE` | 单行一对（多行多写几行） |
| `EnvironmentFile` | `-/path` | 从文件读环境变量；`-` 前缀 = 文件缺失不报错 |
| `LimitNOFILE` | 数字 | 最大 fd 数（默认 1024 太小） |
| `LimitNPROC` | 数字 | 最大进程数 |
| `MemoryMax` | `2G` | 内存上限（超就被杀） |
| `CPUQuota` | `200%` | CPU 配额（200% = 2 核） |
| `StandardOutput` / `StandardError` | `journal` / `null` / `file:/path` | 输出去向 |

### Type 对照表

| Type | 行为 | 适用 |
|------|------|------|
| `simple` | `ExecStart` 进程就是主进程；启动即视为成功 | **默认推荐**，前台运行的应用（Go/Rust/Node 二进制） |
| `exec` | 同 simple 但等到 exec() 完成才认成功 | systemd 240+ |
| `forking` | `ExecStart` fork 后退出，子进程是主进程 | 传统守护进程（nginx -t reload 风格） |
| `oneshot` | 一次性任务，跑完退出；常配 `RemainAfterExit=yes` | 初始化脚本 / mount |
| `notify` | 应用主动调 `sd_notify(READY=1)` 通知就绪 | 支持 systemd 通知的应用（sshd / haproxy） |

## 第三步：依赖关系

```ini
[Unit]
# 顺序（启动先后）：A → B
After=postgresql.service
Before=nginx.service

# 强弱依赖：
Requires=postgresql.service     # 强：pg 失败 → 本服务也起不来 + 停掉
Wants=redis.service             # 弱：redis 失败也起本服务（推荐用 Wants）
Requisite=mount.target          # 启动前 mount.target 必须已经在跑（否则立刻失败，不会激活）
BindsTo=foo.service             # 跟随对方（对方停我也停）

# 反向影响
PartOf=group.target             # 我是 group 的一部分（group restart 时 restart 我）
```

**80% 场景用 `After=` + `Wants=` 就够**：表达"启动顺序"和"软依赖"。

## 第四步：timer（systemd 定时任务，替代 cron）

```ini
# /etc/systemd/system/myjob.service
[Unit]
Description=My Job

[Service]
Type=oneshot
ExecStart=/usr/local/bin/my-job.sh

# /etc/systemd/system/myjob.timer
[Unit]
Description=Run My Job every 5 minutes

[Timer]
OnBootSec=2min                  # 开机 2 分钟后第一次
OnUnitActiveSec=5min            # 然后每 5 分钟跑一次
# 或者 cron 风格：
# OnCalendar=*-*-* *:00,15,30,45:00     # 每 15 分钟
# OnCalendar=Mon..Fri 09:00              # 工作日 9 点
# OnCalendar=*-*-1 00:00                 # 每月 1 号 00:00
Persistent=true                 # 错过执行时间（机器关机）开机后补跑
RandomizedDelaySec=30s          # 随机错峰

[Install]
WantedBy=timers.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myjob.timer
sudo systemctl list-timers --all | grep myjob
```

定时表达式调试：

```bash
systemd-analyze calendar "Mon..Fri 09:00"          # 解析 + 算下次触发
systemd-analyze calendar --iterations=5 "*-*-* *:00,15,30,45:00"
```

## 第五步：常用命令

```bash
systemctl list-units --type=service             # 当前跑着的所有 service
systemctl list-units --failed                   # 失败的
systemctl list-unit-files --type=service        # 全部 unit（含未启用）
systemctl list-dependencies <unit>              # 依赖树
systemctl list-dependencies --reverse <unit>    # 反向依赖（谁依赖我）
systemctl cat <unit>                            # 看 unit 完整文件（含 drop-in）
systemctl show <unit>                           # 所有属性 = 解析后的最终值
systemctl edit <unit>                           # 创建 drop-in 覆盖（不动原文件）
systemctl edit --full <unit>                    # 直接编辑原文件
systemctl daemon-reload                         # 改完 unit 文件必跑
systemctl reset-failed <unit>                   # 清失败状态（被 StartLimit 卡住时）
```

## 第六步：drop-in 覆盖（不动原文件改配置）

```bash
sudo systemctl edit nginx                       # 自动创建 /etc/systemd/system/nginx.service.d/override.conf
# 写入：
[Service]
LimitNOFILE=65536
Environment=DEBUG=1
```

`systemctl cat nginx` 会显示**合并后**的完整配置（原文件 + override.conf）。删 override：`systemctl revert nginx`。

## 第七步：journalctl 关联

```bash
journalctl -u myapp                             # 全部日志
journalctl -u myapp -n 100                      # 最近 100 行
journalctl -u myapp -f                          # 实时跟
journalctl -u myapp --since "10 min ago"
journalctl -u myapp --since today
journalctl -u myapp -p err                      # 只看 error 及以上级别（emerg/alert/crit/err/warning/notice/info/debug）
journalctl -u myapp -o cat                      # 只打日志内容（不带时间戳）
journalctl -u myapp --grep "panic"
journalctl _PID=1234                            # 按 PID 过滤
journalctl --disk-usage                         # journal 占多少
journalctl --vacuum-time=7d                     # ⚠️ 删 7 天前日志
```

## 第八步：启动慢排查

```bash
systemd-analyze                                 # 总启动耗时
systemd-analyze blame                           # 各 unit 耗时排序
systemd-analyze critical-chain                  # 启动关键路径
systemd-analyze critical-chain <unit>           # 单 unit 的依赖链耗时
systemd-analyze plot > boot.svg                 # 可视化（拖到浏览器）
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 包提供的 unit | `/lib/systemd/system/` 或 `/usr/lib/systemd/system/` |
| 自定义 unit | `/etc/systemd/system/` |
| 用户级 unit | `~/.config/systemd/user/`（用 `systemctl --user`） |
| Drop-in 覆盖 | `/etc/systemd/system/<unit>.d/*.conf` |
| journal 数据 | `/var/log/journal/` |
| target（运行级） | `multi-user.target`（无 GUI） / `graphical.target`（GUI） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `systemctl stop sshd` | **远程失联** |
| `systemctl mask sshd` | mask = 永久禁用，连依赖也起不来；恢复要 `unmask` |
| `systemctl stop systemd-journald` | 日志全断，事后没法排查 |
| `systemctl stop NetworkManager` | 网断 |
| `systemctl stop dbus` | 多数系统服务都依赖它，**整机崩** |
| `rm /etc/systemd/system/*` | 删全部自定义 unit |
| `rm /lib/systemd/system/sshd.service` | 删包管理器装的 unit（再 update 会被覆盖回来，**但当前已损坏**） |
| `systemctl set-default rescue.target` 后重启 | 进单用户模式（生产**惨案**） |

## 教训

- 改完 unit 文件**必须 `daemon-reload`**，否则 systemctl restart 还是用旧配置（最经典踩坑）。
- 用 `systemctl edit <unit>` 写 drop-in 远好于直接改 `/lib/systemd/system/*` —— 后者会被包更新覆盖。
- `Restart=always` + 短 `RestartSec` 容易让有 bug 的进程**疯狂重启刷日志**，组合 `StartLimitBurst=5 StartLimitIntervalSec=60` 防熔断。
- `ExecStart` **不解析 shell** —— `cd /opt/app && ./run` 这种要写 `bash -c "cd /opt/app && ./run"`，或者用 `WorkingDirectory=`。
- `Type=forking` 应用退出快但子进程还在 = systemd 抓不到主进程（PID 错）；现代写法尽量改 `simple`。
- `journalctl -u xxx` 看不到东西多半是应用日志写到了文件而非 stdout/stderr → 在 systemd unit 里加 `StandardOutput=journal StandardError=journal`（多数情况下默认就是）。

---

## 42. testOne

```yaml
---
name: testOne
description: 一句话描述本技能干什么
triggers: 关键词1, 关键词2
---
```

# testOne

这里写正文（操作步骤、注意事项、教训）。

> 备注（导出者说明）：`testOne` 属**用户自定义技能**，当前内容仅为 OpsPub 新建技能时生成的模板空壳，尚未填写实际正文。

---

## 43. wireguard-vpn

```yaml
---
name: wireguard-vpn
description: WireGuard VPN 速查 —— 密钥 / 配置 / wg-quick / Allowed IPs / 路由 / 故障排查。
触发词: wireguard, wg0, wg-quick, wg 隧道, vpn, allowed ips, persistent keepalive, preshared key, wg server, wg client, mesh vpn, tailscale, headscale, wg 不通, wg 连不上, wg 慢, vpn 不通, vpn 连不上, vpn 断了, vpn 掉线, 连不上 vpn, 内网穿透, 异地组网, 跨机房, 远程办公接入, 搭 vpn, 装 vpn, 接 vpn, 加 peer, 加客户端, 换密钥, handshake, 握手失败, vpn 丢包, mtu, vpn mtu, nat 穿透, frp, n2n, zerotier, 组网, 局域网互通, vpn 配置, 远程接入
dangerous_commands:
  - '(?:^|[\s;&|])wg-quick\s+down\s+\w+'
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+wg-quick@'
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?(?:/etc/wireguard/[\w-]+\.conf|[~/\w.-]*privatekey)\b'
  - '(?:^|[\s;&|])sysctl\s+-w\s+net\.ipv4\.ip_forward=0\b'
---
```

# wireguard-vpn —— WireGuard VPN

适用：用户搭企业 VPN / 跨机房 mesh / 远程办公接入；想"装 wg"/"加 peer"/"换密钥"/"看为啥不通"/"做内网穿透"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 wg 服务状态** → `service_status(server, "wg-quick@wg0")`（任何档位放行）。
- **查 51820/udp 是否监听** → `port_check(server, 51820)`（= ss -tlnH，比 `ssh_exec ss` 稳）。
- **看接口/握手状态** → `wg` / `wg show` 是只读但要 root，走 `ssh_exec sudo wg show`（会触发审批）；纯看监听端口用 `port_check` 即可。
- **写/改 wg 配置** → 先 `sftp_read(server, "/etc/wireguard/wg0.conf")` 看现状，再 `sftp_write` 整文件写入——但 **`.conf`/含 privatekey 的文件属 SFTP 敏感路径，`sftp_write` 会被拦**（`*.key`/`.pem`/含密钥行）；改密钥相关内容时改用 `ssh_exec`（过审批），且**私钥永不进对话**（OpsPub 敏感库会自动捕获）。
- `wg-quick up/down`、`wg set`、改 `ip_forward`、装 wg 这类**改动型**走 `ssh_exec`，过策略档位 + 审批。

🔴 **VPN 改动极易"断自己"**：若你**正通过这条 VPN 连进来**，`wg-quick down` 就是断自己。`wg-quick down` / 停 wg-quick 服务 / `ip_forward=0` 会触发**用户审批**——执行前告诉用户风险，**被拒后不要原样重试**。改服务端配置前先把现配置备份到 `~/.opspub/backups/`，回滚脚本放 `~/.opspub/scripts/`。

## 第一步：安装

```bash
# Debian/Ubuntu
sudo apt install -y wireguard wireguard-tools

# RHEL/Rocky 8+
sudo dnf install -y wireguard-tools

# 内核模块（5.6+ 内置；老内核 backport）
modprobe wireguard
lsmod | grep wireguard
```

## 第二步：密钥生成

```bash
cd /etc/wireguard/
umask 077                                         # 关键：默认权限 600

wg genkey | tee privatekey | wg pubkey > publickey
cat privatekey publickey

# 预共享密钥（PSK，额外抗量子层）
wg genpsk > preshared
```

> ⚠️ **私钥（privatekey）严格 chmod 600** + 不离机；OpsPub 敏感库会自动捕获放入凭据库。

## 第三步：服务端配置

```ini
# /etc/wireguard/wg0.conf
[Interface]
Address    = 10.10.0.1/24                          # VPN 网段
ListenPort = 51820
PrivateKey = <server-private-key>
SaveConfig = false                                  # 用 wg set 时是否回写文件
# NAT（让 VPN 客户端通过本机出外网）
PostUp   = iptables -A FORWARD -i %i -j ACCEPT; iptables -A FORWARD -o %i -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i %i -j ACCEPT; iptables -D FORWARD -o %i -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Client #1（laptop）
PublicKey    = <client1-public-key>
PresharedKey = <psk>
AllowedIPs   = 10.10.0.2/32                        # 服务端视角：从这个客户端只允许这些 src IP

[Peer]
# Client #2
PublicKey    = <client2-public-key>
PresharedKey = <psk>
AllowedIPs   = 10.10.0.3/32
```

### 启用 IP 转发

```bash
sudo sysctl -w net.ipv4.ip_forward=1
echo 'net.ipv4.ip_forward = 1' | sudo tee /etc/sysctl.d/99-wg.conf
sudo sysctl --system

# IPv6
sudo sysctl -w net.ipv6.conf.all.forwarding=1
```

### 启动

```bash
sudo wg-quick up wg0                              # 一次性
sudo systemctl enable --now wg-quick@wg0          # 开机启动

sudo wg                                            # 看接口状态 + peer + handshake 时间
sudo wg show wg0
sudo wg-quick down wg0                            # 停
```

## 第四步：客户端配置

```ini
# /etc/wireguard/wg0.conf  (Linux 客户端)
[Interface]
Address    = 10.10.0.2/24
PrivateKey = <client-private-key>
DNS        = 10.10.0.1                             # 走 VPN 后用这个 DNS（可选）

[Peer]
# 服务端
PublicKey    = <server-public-key>
PresharedKey = <psk>
Endpoint     = vpn.example.com:51820               # 服务端公网地址:端口
AllowedIPs   = 0.0.0.0/0, ::/0                     # **全流量走 VPN**（路由表会改）
# 或仅内网走 VPN：AllowedIPs = 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
PersistentKeepalive = 25                            # 25s 心跳保活（NAT 后客户端必加）
```

```bash
sudo wg-quick up wg0
# Windows / macOS / 手机：装官方 WireGuard 客户端，扫 QR 或导入 .conf
```

### 二维码（手机扫码导入）

```bash
qrencode -t ansiutf8 < /etc/wireguard/client.conf
# Android / iOS 的 WireGuard app → 加配置 → 扫描
```

## 第五步：动态加 peer（不重启）

```bash
# 加单 peer（运行时；SaveConfig=false 时不会落盘）
sudo wg set wg0 peer <client-pub> allowed-ips 10.10.0.5/32 preshared-key <(echo "$PSK")

# 删
sudo wg set wg0 peer <client-pub> remove

# 落盘（SaveConfig=true 时 wg-quick down 会自动写回）
sudo wg syncconf wg0 <(wg-quick strip wg0)

# 更优雅：直接编辑 /etc/wireguard/wg0.conf 然后
sudo systemctl reload wg-quick@wg0     # 部分发行版支持；不支持就 down/up
```

## 第六步：故障排查

### 不通的检查清单

```bash
# 1) 接口起来了吗
ip a show wg0
sudo wg                                            # latest handshake 字段不应是 "Never"

# 2) 路由对吗
ip route get 10.10.0.1                             # 应该 dev wg0
ip route show

# 3) 防火墙（服务端 51820/udp 必开）
sudo ss -ulnp | grep 51820
sudo iptables -L -n -v | grep 51820

# 4) ip_forward 开了吗（服务端）
sysctl net.ipv4.ip_forward

# 5) NAT 规则（服务端，让 VPN 客户端能上外网）
sudo iptables -t nat -L POSTROUTING -n -v | grep MASQUERADE

# 6) MTU 问题（**最常见的"通但慢"**）
# WireGuard 默认 1420；如果走 PPPoE 等还要更小（1280 试试）
sudo ip link set wg0 mtu 1280

# 7) UDP 被运营商干掉？
# 部分省市运营商 QoS 限速/中断 UDP；用 udp2raw / wstunnel 包到 TCP 443 绕过
```

### 看实时流量

```bash
sudo wg show wg0 transfer                          # 各 peer 上下行字节
sudo tcpdump -i wg0 -n -X
```

### Handshake 调试

```bash
# 服务端
sudo journalctl -kf | grep -i wireguard

# 启用 wg 内核 debug log（**生产慎用**，日志量大）
echo 'module wireguard +p' | sudo tee /sys/kernel/debug/dynamic_debug/control
sudo dmesg -w | grep wireguard
```

`Handshake did not complete` 几乎一定是：
1. 服务端公钥 / 客户端公钥配错位
2. 端口被防火墙拦
3. PSK 不一致

## 第七步：常见拓扑

### Hub-Spoke（最常见）

```
client-A ────┐
client-B ────┼─── wg server (VPN 网关) ─── 内网 10.0.0.0/8
client-C ────┘
```

服务端配置如上；客户端 AllowedIPs 写要走 VPN 的网段（如 `10.10.0.0/24, 10.0.0.0/8`）。

### Mesh（点对点全连接）

每对节点都建立直连。手动配复杂；推荐：

- **WireGuard + 路由控制平面**：FRR / BIRD 跑 OSPF
- **Tailscale**（商业）/ **Headscale**（开源自建）：自动 mesh + NAT 穿透
- **Innernet**（Rust）/ **Netmaker**：自建 mesh 控制平面

### Site-to-Site

两个内网通过 wg0 链接，互通整个网段：

```ini
# 站点 A
[Interface]
Address = 10.10.0.1/24
# ...
[Peer]
PublicKey = <site-B-pub>
AllowedIPs = 10.10.0.2/32, 192.168.20.0/24      # 加上 B 站点的内网
Endpoint = b.example.com:51820

# 站点 B
[Interface]
Address = 10.10.0.2/24
[Peer]
PublicKey = <site-A-pub>
AllowedIPs = 10.10.0.1/32, 192.168.10.0/24
Endpoint = a.example.com:51820
PersistentKeepalive = 25
```

记得双方都开 `ip_forward` + 加路由 / NAT。

## 路径速查表

| 内容 | 路径 |
|------|------|
| 配置 | `/etc/wireguard/<iface>.conf`（**chmod 600**） |
| 私钥 / 公钥 / PSK | 通常存 `/etc/wireguard/` 下，权限 600 |
| systemd unit | `wg-quick@<iface>`（如 `wg-quick@wg0`） |
| 接口数据 | `ip link show wg0` / `wg show wg0` |
| 内核 debug | `/sys/kernel/debug/dynamic_debug/control` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `wg-quick down <iface>` | **服务端跑这个** → 所有 VPN 客户端瞬间断 |
| `systemctl stop wg-quick@wg0` | 同上 |
| 删服务端 privatekey | 公钥重新生成 → 所有客户端配置失效，必须重发新配置 |
| `sysctl -w net.ipv4.ip_forward=0` | VPN 转发功能瞬间挂 |
| 改 ListenPort 但防火墙没同步 | 客户端连不上 |
| AllowedIPs 配 `0.0.0.0/0` 但服务端没 NAT | 客户端流量黑洞 |
| 同一公钥配多个 peer | 路由表错乱，时通时不通 |
| 远程跑 wg-quick down wg0 但你**自己**正通过它连进来 | **断自己** |

## 教训

- 服务端**远程**配 wg 时**永远先用 ssh 连进来**（不走 VPN），改完测通了再切。否则 `wg-quick down wg0` 是经典自杀。改 `wg0.conf` 前先 `cp /etc/wireguard/wg0.conf ~/.opspub/backups/`（OpsPub 统一工作区），改坏了好回滚。
- `PersistentKeepalive` 在 NAT 后的客户端**必加**（25 秒经验值），否则 NAT 表项过期 = 反向数据回不来。
- 客户端 `AllowedIPs = 0.0.0.0/0`（全流量）要确认服务端有 NAT（MASQUERADE）+ ip_forward。
- MTU 问题是"通但慢/掉包"的头号原因；优先试 `mtu 1280`。
- PSK（PresharedKey）不是必需的，但**加上几乎无成本**且提供量子计算安全余地，推荐生产开。
- 大量客户端管理（>20）手工 .conf 不可行 → 自建 **WireGuard UI** / **wg-easy** / **Headscale** 做 GUI / API 控制。
- WireGuard **不做** NAT 穿透；双方都在 NAT 后需要**至少一端有公网**或用 Tailscale/Headscale 控制平面。

---

## 附：导出说明

- **技能来源**：OpsPub 本机全局技能库（`list_skills` 返回 43 项：内建 41 + 用户自定义 2）
- **正文来源**：逐个 `get_skill(<name>)` 原样抓取，未做删改
- **Runbook 库**：本机为空（0 条），无可导出内容
- **Agent / Loop 配置**：OpsPub 的 AI Agent 定义与定时 Loop 配置不在助手可读工具范围内，未纳入本文件
- **导出时间**：本次会话
- **导出人**：OpsPub 助手（经策略引擎审计）
