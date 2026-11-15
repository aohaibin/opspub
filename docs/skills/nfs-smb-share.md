---
name: nfs-smb-share
description: 网络文件共享速查 —— NFS（exports/mount）+ SMB/CIFS（smb.conf/smbpasswd）+ autofs + 故障排查。
触发词: nfs, nfsv4, exportfs, showmount, smb, cifs, samba, smbpasswd, autofs, 文件共享, 网络盘, 挂载, mount 远程, 装 nfs, 装 samba, 部署 nfs, 部署 samba, 挂载远程, mount 失败, mount 挂不上, 挂不上, 挂载卡死, 挂载卡住, 共享连不上, 访问不了共享, permission denied 挂载, stale file handle, smb 共享, windows 访问 linux, linux 挂 windows 共享, 文件共享给, 共享目录, exports 配置, /etc/exports, fstab, 自动挂载, 中文乱码 共享
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?/etc/exports\b'
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?/etc/samba/smb\.conf\b'
  # exportfs -u(取消单个) / -ua(取消全部) / -uf(强制) —— 客户端瞬间失败
  - '(?:^|[\s;&|])exportfs\s+-[afu]*u[afu]*\b'
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:nfs-server|smbd|nmbd|nfs-kernel-server|rpcbind)\b'
---

# nfs-smb-share —— NFS / SMB 网络共享

适用：用户想"装 NFS 共享给多台 Linux"/"装 Samba 给 Windows 用户访问"/"挂载远程文件"/"挂了不通"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, "nfs-server")` / `service_status(server, "smbd")`（任何档位放行，比 ssh_exec 稳）。
- **查端口** → `port_check(server, 2049)`（NFSv4）/ `port_check(server, 445)`（SMB）；NFSv3 还会用到 111。
- **看日志** → `tail_log(server, "/var/log/samba/log.smbd")`；NFS 走 `service_status` 自带的 systemctl 尾部，或 `ssh_exec journalctl -u nfs-server`。
- **改配置** → 先 `sftp_read` 看 `/etc/exports` / `/etc/samba/smb.conf` 现状，再 `sftp_write` 整文件写（无 shell heredoc 转义坑），写完 `ssh_exec sudo exportfs -ra` / `ssh_exec sudo systemctl reload smbd`。
- ⚠️ `sudo mount` / `exportfs -ra` / `systemctl restart` 等写操作会触发**用户审批**——提前告知用户，被拒后不要原样重试。
> 临时挂载点（SSHFS / 验证用的 `mount` 目标）建议落 **`~/.opspub/tmp`**（OpsPub 远程统一工作区），别散落 `/mnt/xxx` 等可能不存在的目录。

## 对照

| 协议 | 适用 |
|------|------|
| **NFS** | Linux ↔ Linux 共享；性能好；权限映射略复杂 |
| **SMB/CIFS** (Samba) | Windows / macOS / Linux 通吃；权限模型直观；性能略低 |
| **SSHFS** | 临时挂载远程目录走 SSH；零配置；性能差 |
| **WebDAV** | HTTP over fs；穿透防火墙简单 |
| **iSCSI** | 块设备共享（不是文件层；像本地硬盘） |

## 一、NFS

### 服务端

```bash
# 装
sudo apt install -y nfs-kernel-server          # Debian/Ubuntu
sudo dnf install -y nfs-utils                  # RHEL/Rocky

# 创建共享目录
sudo mkdir -p /srv/nfs/shared
sudo chown nobody:nogroup /srv/nfs/shared      # 匿名访问；或具体 user

# 配 /etc/exports
sudo tee -a /etc/exports <<EOF
/srv/nfs/shared    10.0.0.0/24(rw,sync,no_subtree_check,no_root_squash)
/srv/nfs/readonly  *(ro,sync,no_subtree_check)
/srv/nfs/users     10.0.0.0/24(rw,sync,no_subtree_check,no_root_squash,fsid=42)
EOF

# 应用
sudo exportfs -ra                              # 重新读 /etc/exports
sudo exportfs -v                               # 看当前导出

# 启动
sudo systemctl enable --now nfs-server         # RHEL
sudo systemctl enable --now nfs-kernel-server  # Debian
```

### exports 参数

| 参数 | 含义 |
|------|------|
| `rw` / `ro` | 读写 / 只读 |
| `sync` | 同步写（**推荐**；async 性能高但崩溃丢数据） |
| `no_subtree_check` | 跳过子目录检查（默认且推荐） |
| `root_squash` | **默认**：客户端 root 映射为 nobody（**安全**） |
| `no_root_squash` | 关闭压制（容器卷 / 必须 root 写入时用，**谨慎**） |
| `all_squash` | 任何用户都映射为 nobody |
| `anonuid=N` / `anongid=N` | 指定匿名 uid/gid |
| `fsid=N` | NFSv4 必需（每个 export 唯一） |
| `crossmnt` | 跨挂载点也跟随 |

### 客户端挂载

```bash
sudo apt install -y nfs-common                 # Debian
sudo dnf install -y nfs-utils                  # RHEL

# 临时挂
sudo mount -t nfs -o vers=4 nfs-server:/srv/nfs/shared /mnt/shared
# 或更详细
sudo mount -t nfs4 -o rw,hard,intr,timeo=600,retrans=2,vers=4.2 \
    10.0.0.1:/srv/nfs/shared /mnt/shared

# 持久化（/etc/fstab）
10.0.0.1:/srv/nfs/shared  /mnt/shared  nfs4  rw,hard,intr,_netdev,nofail  0  0
```

### NFS 关键挂载参数

| 参数 | 推荐值 / 说明 |
|------|--------------|
| `vers=4.2` | 选版本（4.x 推荐；3 是老协议） |
| `hard` | 服务端不通**永远阻塞**（与 `soft` 互斥；生产推荐 hard + intr） |
| `intr` | hard 模式下允许 ctrl-c 中断 |
| `soft,timeo=30` | 服务端不通 N 秒后报错（数据丢失风险） |
| `_netdev` | 等网络起来再挂（fstab 必加） |
| `nofail` | 挂载失败不阻止开机 |
| `rsize=131072,wsize=131072` | 读写块大小（NFSv4.1+ 默认已大） |
| `noac` | 不缓存元数据（**性能差**但一致性好；高并发写时偶尔需要） |

### 调试

```bash
# 服务端
sudo exportfs -v
sudo systemctl status nfs-server
sudo journalctl -u nfs-server -n 50
ss -tlnp | grep -E ':2049|:111'

# 客户端
showmount -e <nfs-server>                      # 看远端导出列表
sudo nfsstat -m                                # 看已挂的 NFS
sudo rpcinfo -p <nfs-server>                   # NFSv3 才看；v4 不需要 portmap

# 实时性能
nfsiostat 1                                    # nfs-common 提供
```

### 端口（防火墙）

NFSv4 只用 **TCP 2049**（单端口，友好）。NFSv3 还要 `rpc.statd` / `rpc.mountd` 等动态端口。

```bash
# 防火墙开 2049
sudo firewall-cmd --permanent --add-service=nfs && sudo firewall-cmd --reload
sudo ufw allow nfs
```

## 二、Samba (SMB/CIFS)

### 服务端

```bash
sudo apt install -y samba samba-common-bin     # Debian/Ubuntu
sudo dnf install -y samba samba-client         # RHEL/Rocky

sudo mkdir -p /srv/samba/shared
sudo chown -R nobody:nogroup /srv/samba/shared
sudo chmod -R 0775 /srv/samba/shared
```

### /etc/samba/smb.conf

```ini
[global]
workgroup = WORKGROUP
server string = File Server
security = user
map to guest = bad user
log file = /var/log/samba/log.%m
max log size = 50
disable netbios = yes                       # 关 NetBIOS（只用 SMB 现代协议）
client min protocol = SMB2_10
server min protocol = SMB2_10

[shared]
path = /srv/samba/shared
browseable = yes
writable = yes
guest ok = yes                              # 匿名可读写（**仅内网**）
create mask = 0664
directory mask = 0775
force user = nobody

[private]
path = /srv/samba/private
browseable = yes
writable = yes
valid users = @smbusers                     # 系统组 smbusers
create mask = 0660
directory mask = 0770

[homes]                                     # 每个用户自动有 \\server\username
comment = Home Directories
browseable = no
writable = yes
```

### 用户管理

```bash
# Samba 用户必须先是系统用户
sudo useradd -M -s /sbin/nologin samba_alice
sudo smbpasswd -a samba_alice               # 加 samba 密码（独立于系统密码）
sudo smbpasswd -e samba_alice               # 启用
sudo smbpasswd -d samba_alice               # 禁用
sudo smbpasswd -x samba_alice               # 删除
sudo pdbedit -L                             # 列 samba 用户
```

### 操作

```bash
sudo testparm                               # 检查 smb.conf 语法
sudo systemctl restart smbd nmbd
sudo systemctl status smbd

# 列谁连进来
sudo smbstatus
sudo smbstatus -L                           # 锁
sudo smbstatus -p                           # 进程
```

### Linux 客户端挂载

```bash
sudo apt install -y cifs-utils

sudo mount -t cifs //smb-server/shared /mnt/smb \
    -o username=alice,password=xxx,uid=1000,gid=1000,vers=3.0,iocharset=utf8

# 凭据写文件（**chmod 600**）
echo 'username=alice
password=xxx' | sudo tee /etc/samba/credentials.alice
sudo chmod 600 /etc/samba/credentials.alice

# fstab
//smb-server/shared  /mnt/smb  cifs  credentials=/etc/samba/credentials.alice,uid=1000,gid=1000,vers=3.0,_netdev,nofail  0  0
```

### Windows 客户端

```
文件资源管理器 → 输入 \\smb-server\shared
```

### 端口（防火墙）

SMB 默认 **445**（不要开 137/138/139 老 NetBIOS）。

```bash
sudo firewall-cmd --permanent --add-service=samba && sudo firewall-cmd --reload
sudo ufw allow samba
```

## 三、autofs（自动挂载）

按需挂载，不用 fstab 永久挂；适合"几十个共享、按需访问"：

```bash
sudo apt install -y autofs

# /etc/auto.master
/mnt/auto  /etc/auto.shares  --timeout=600

# /etc/auto.shares
data     -fstype=nfs4,rw,hard,intr     10.0.0.1:/srv/nfs/data
backup   -fstype=cifs,vers=3.0,credentials=/etc/samba/cred  ://smb-server/backup
```

```bash
sudo systemctl restart autofs
cd /mnt/auto/data                          # 第一次 cd 时触发挂载；timeout 后自动卸载
```

## 四、常见故障

### NFS

**Q: `mount.nfs: Connection refused`**
- 服务端没启动 `nfs-server`
- 防火墙没开 2049
- 服务端 `bindIp` 类配置限制了

**Q: `mount.nfs: access denied by server`**
- 客户端 IP 不在 `/etc/exports` 网段
- 服务端忘了 `exportfs -ra`

**Q: 客户端能挂但写入"Permission denied"**
- `root_squash` 把 root 压成 nobody，但目录没给 nobody 写权限
- 服务端 SELinux：`setsebool -P nfs_export_all_rw 1`

**Q: 客户端断网后命令永远卡死**
- 用了 `hard` 没加 `intr`；现代 kernel 用 `soft,timeo=30` 替代

### Samba

**Q: Windows 看不到共享**
- workgroup 不匹配
- SMB1 已禁用但 Windows 老版本只懂 SMB1（升 SMB2/3）
- 防火墙 445 没开

**Q: 挂载报 `mount error(13): Permission denied`**
- 用户名 / 密码错（`smbpasswd -a` 加过了吗）
- `valid users` 限制

**Q: 中文文件名乱码**
- 挂载加 `iocharset=utf8`
- smb.conf 加 `unix charset = UTF-8`

## 路径速查表

| 内容 | 路径 |
|------|------|
| NFS exports | `/etc/exports` |
| NFS 服务端配置 | `/etc/nfs.conf`（或 `/etc/default/nfs-kernel-server` Debian） |
| Samba 主配置 | `/etc/samba/smb.conf` |
| Samba 用户库 | `/var/lib/samba/`（tdb 文件） |
| autofs | `/etc/auto.master` + `/etc/auto.*` |
| 默认 NFS 端口 | 2049 (TCP)；NFSv3 还有 portmap 111 + 动态 |
| 默认 SMB 端口 | 445 (TCP)；老 NetBIOS 137/138/139 应关 |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm /etc/exports` / `rm /etc/samba/smb.conf` | 删配置文件 |
| `exportfs -uf` (`-u` 取消导出 + `-f` 强制) | 移除全部 export，客户端瞬间失败 |
| `systemctl stop nfs-server / smbd nmbd` | 所有客户端断开 |
| Samba 共享 `path = /` + `guest ok = yes` | **公开 root 文件系统**（每年都有事故） |
| NFS export `no_root_squash` 给公网 | 客户端 root 可写服务端任意文件 |
| 改 SMB `min protocol = SMB1` | 历史漏洞协议（永恒之蓝家族） |
| 客户端 `mount -o vers=1.0` | 同上 |

## 教训

- **NFS / SMB 都是内网协议**：不要直接暴露公网；想跨外网用 VPN（WireGuard）封装。
- NFS 服务端的 UID/GID **与客户端要一致**（或开 idmapd 做 NFSv4 name 映射），否则文件 owner 都是 nobody。
- `hard` + `intr` 是 NFS 客户端最稳的组合；用 `soft` 数据写一半服务端断 = 文件损坏。
- Samba **默认开 SMB1 协议**老版本设备能连但有漏洞；新部署强制 `client/server min protocol = SMB2_10` 起步。
- `exportfs -v` 一定要做：改 `/etc/exports` 不 `exportfs -ra` = 没生效。
- `_netdev,nofail` 在 fstab 是经典经验：网络挂载失败不会卡开机。
- 大量小文件性能 NFS > SMB；流式视频 / 大文件性能差不多；Windows 客户端必须 SMB。
- autofs 太适合"开发者 home 自动挂"或"backup 间歇性访问"——避免开机挂一堆没用的 share 拖慢启动。

---
