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

⚠️ 本技能里的清理/切割操作（`journalctl --vacuum-*` / `truncate` / `logrotate -f`）含 `sudo` 或是写/删操作 → 会触发**用户审批**。执行前先告诉用户"这步会删历史日志、需要你在 OpsPub 批准"，**被拒后不要原样重试**，改成只读排查或问用户。清理前先把要删的日志备份到 `~/.reeve/backups/`（OpsPub 统一工作区）。

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

> 清理前若需留证（排障/合规），先用 `sftp_read` 取关键日志或 `cp /var/log/xxx ~/.reeve/backups/`（OpsPub 统一工作区）再 vacuum。`--vacuum-time=0` / `--vacuum-size=0`（全删）会触发**危险审批**，需用户弹窗放行。

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
