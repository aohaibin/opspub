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
