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
