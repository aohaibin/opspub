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
- **导出人**：OpsPub AI 助手（经策略引擎审计）
