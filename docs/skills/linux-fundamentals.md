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

- **远程改防火墙 / 改 SSH 配置前永远先准备保险绳** —— `at now + 5 minutes` 跑一条恢复命令；改完测通了再 `atrm` 取消。复杂恢复脚本放 `~/.reeve/scripts/`（OpsPub 统一工作区，别散落 /tmp）。
- `df` 显示满了但 `du` 加起来不到一半 = 多半是**被删但未关闭的文件占用**：`lsof | grep deleted` 找出来 → 重启对应进程或 truncate。
- `free` 列很小**不代表内存不够** —— Linux 把空闲内存用作 page cache，看 `available` 列才是真实可用。
- 时区不一致是日志关联失败的常见原因；服务器尽量统一 `UTC` 或公司标准时区，应用日志加时区标识。
- cron 调试先在交互 shell 用相同环境跑：`env -i HOME=/root /bin/sh -c '/path/script'`，cron 跑的环境比你 shell 干净得多。

---
