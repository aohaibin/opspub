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

# iptables-firewalld —— 主机防火墙

> linux-fundamentals 已覆盖最常见的 firewall-cmd / ufw / iptables 三件套基础；本技能聚焦深入用法、NAT、规则持久化、跨工具迁移。

适用：用户问"怎么配端口转发 / NAT / SNAT / 限速 / 黑名单一段 IP / 切到 nftables / 规则持久化"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **查端口通不通 / 被谁监听** → `port_check(server, 端口)`（= ss -tlnH，任何档位放行）——改规则前后都先用它确认，比 `ssh_exec ss` 稳。
- **看防火墙服务状态** → `service_status(server, "firewalld")` / `service_status(server, "ufw")` / `service_status(server, "nftables")`。
- **改规则文件 / 持久化** → 先 `sftp_read` 看现状（`/etc/nftables.conf`、`/etc/iptables/rules.v4`、`/etc/ufw/before.rules`），再 `sftp_write` 整文件写入（无 shell 转义坑），写完用 `ssh_exec` reload。
- 增删规则、`-F`/`reset`/改默认策略这类**改动型**走 `ssh_exec`，必过策略档位 + 审批。

🔴 **防火墙是最容易"把自己锁在外面"的领域**。规则会经 `ssh_exec` 触发**用户审批**——执行前必须告诉用户"这步改防火墙、有断 SSH 风险、需要你在 OpsPub 批准"，**被拒后绝不原样重试**。
**铁律：远程改防火墙前永远先布保险绳**——把回滚命令落到 `~/.reeve/scripts/`（OpsPub 统一工作区），用 `at` 定时自动执行（见末尾「教训」）；改完测通了再 `atrm` 取消。

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

- **远程改防火墙永远先布保险绳**：把当前规则备份到 `~/.reeve/backups/`（`iptables-save > ~/.reeve/backups/rules-$(date +%s).v4`），回滚脚本写 `~/.reeve/scripts/fw-rollback.sh`，再 `echo "bash ~/.reeve/scripts/fw-rollback.sh" | at now + 5 minutes`。改完测通了 → `atrm` 取消；改坏了 5 分钟后自动回滚。**别把脚本散落 /tmp**，用 OpsPub 统一工作区便于复盘。
- firewalld 的 `--permanent` 和 runtime 是**两套**；改完一定要 `--reload`，否则下次重启没了；或同时改两份 `firewall-cmd --runtime-to-permanent`。
- Docker 与防火墙的"双轨"是经典坑：`ufw allow` 看似没开但容器**仍然能被公网访问**（因为 docker 走 DOCKER-USER 链先）。
- nftables 的 `inet` 表同时管 IPv4 + IPv6，**不要忘加 v6 也禁掉**（一些场景 v6 默认开放比 v4 还危险）。
- 跨工具切换前**先 iptables-save 备份**：从 iptables 切 nftables、从 firewalld 切 nftables，规则迁移很容易漏。
- conntrack table full 是高并发服务器的常见隐患，**前期就调大** + 监控（node_exporter 有 `node_nf_conntrack_entries` 指标）。

---
