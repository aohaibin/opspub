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
