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
