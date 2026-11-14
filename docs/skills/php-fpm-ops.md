---
name: php-fpm-ops
description: PHP-FPM 运维速查 —— pool 配置 / opcache / 慢日志 / pm.max_children / 与 nginx 通信。
触发词: php, php-fpm, fpm, opcache, php 慢, php-fpm 进程数, 502 php, php-fpm.conf, www.conf, pm static, pm dynamic, pm ondemand, fpm pool, php 8.4, php 8.3, php 8.2, 装 php, 部署 php, wordpress 慢, wordpress 502, laravel, symfony, mediawiki, nextcloud, fastcgi, sock 文件, unix socket php, opcache 命中率, max_children, max_requests, php 内存限制, memory_limit, post_max_size, upload_max_filesize, php 挂了, php-fpm 挂了, php 起不来, php 进程满, 504 php, php 占内存, 网站 502
dangerous_commands:
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+php\d?(?:\.\d+)?-fpm\b'
  - '(?:^|[\s;&|])(?:kill|killall|pkill)\s+(?:-9\s+)?php-fpm\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/php(?:\s|/|$)'
---

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
