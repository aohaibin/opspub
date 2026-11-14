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
