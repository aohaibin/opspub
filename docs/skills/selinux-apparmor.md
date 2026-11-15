---
name: selinux-apparmor
description: SELinux + AppArmor 强制访问控制速查 —— 模式 / 标签 / 策略 / audit2allow / aa-status / 调试。
触发词: selinux, apparmor, getenforce, setenforce, semanage, audit2allow, aa-status, aa-complain, 权限被拒, denied, avc, mac, 强制访问控制, permission denied, 权限对但读不到, 文件权限对但, 服务起不来无报错, 起不来没报错, 权限够但起不来, 关 selinux, 禁用 selinux, disable selinux, selinux 是否开启, selinux 状态, chcon, restorecon, 上下文, context, label, security context, enforcing, permissive, 标签不对, 文件标签, 被拦了, 莫名其妙起不来
dangerous_commands:
  - '(?:^|[\s;&|])setenforce\s+0(?:\s|$)'
  - '(?:^|[\s;&|])sed\s+-i\b[^\n]*SELINUX=disabled\b[^\n]*/etc/selinux/config\b'
  - '(?:^|[\s;&|])aa-disable\s+(?:/etc/apparmor\.d/)?usr\.sbin\.(?:sshd|nginx|apache)\b'
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:apparmor|selinux)\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/(?:selinux|apparmor\.d)(?:\s|/|$)'
---

# selinux-apparmor —— 强制访问控制

适用：用户报"操作权限明明对但还是 denied"/"文件权限对但程序读不到"/"systemd 服务起不来无明显报错"。多半是 MAC（强制访问控制）层拦截。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看出问题的服务状态** → `service_status(server, "<svc>")`（任何档位放行）——MAC 拦截常表现为"服务起不来但 systemctl 无明显原因"，先看状态。
- **读 audit 日志找 denied** → `tail_log(server, "/var/log/audit/audit.log", lines?)`（= tail -n，只读放行）；要 `grep denied/AVC` 过滤时再走 `ssh_exec`。
- **看文件标签 / 状态** → `getenforce` / `sestatus` / `ls -lZ` / `aa-status` 是只读探测，可直接 `ssh_exec`（只读判定一般放行；带 `sudo` 的 `ausearch`/`sealert` 会触发审批）。
- **改策略**（`semanage` / `setsebool -P` / `restorecon` / `audit2allow` / `aa-enforce`）属**改动型**，走 `ssh_exec` 过策略档位 + 审批。

⚠️ `setenforce 0`（临时关 SELinux）/ 改 `/etc/selinux/config` / `aa-disable` 关键服务 profile 会触发**用户审批**——执行前告诉用户"这步会降级安全防护、需要你批准"，**被拒后不要原样重试**。
🔴 **关 SELinux 重启有"再也起不来"风险**：标签一旦失效，重新开 enforcing 时服务可能全拒。生成的自定义 module（`.pp`）、收集的 audit 片段放 `~/.opspub/scripts/` 或 `~/.opspub/tmp/`（OpsPub 统一工作区），别散落 /tmp。

## 对照

| 维度 | SELinux | AppArmor |
|------|---------|----------|
| 模型 | Type Enforcement + 标签 | Path-based + profile 文件 |
| 默认发行版 | RHEL / Rocky / Fedora / CentOS | Ubuntu / Debian / SUSE |
| 配置复杂度 | 高（策略 + 标签 + bool） | 中（profile 即 path 列表） |
| 调试工具 | `audit2allow` / `sealert` / `semanage` | `aa-logprof` / `aa-status` |

## 一、SELinux

### 模式

```bash
getenforce                                # 当前模式
# Enforcing  = 严格执行（生产）
# Permissive = 只记录不拦截（**调试推荐**）
# Disabled   = 完全关闭（**生产不推荐**）

sudo setenforce 0                         # **临时**切到 Permissive（重启失效）
sudo setenforce 1                         # 切回 Enforcing
```

> ⚠️ 把 `/etc/selinux/config` 改成 `SELINUX=disabled` **持久关 SELinux** 是常见绕过；但很多商业软件 / 合规要求必开，**远程关 SELinux 重启 = 一旦标签失效再开就起不来**。

### 状态详查

```bash
sestatus                                  # 当前 + 持久配置
seinfo                                    # 策略统计（policycoreutils-python-utils）
```

### 看上下文（标签）

```bash
ls -lZ                                    # 文件标签
ls -Z /var/www/html
ps -eZ                                    # 进程标签
id -Z                                     # 当前用户标签
ss -Ztlnp                                 # socket 标签
```

输出如：

```
system_u:object_r:httpd_sys_content_t:s0  index.html
   user      role           type           level
```

**Type** 是 SELinux 最关键的属性（如 `httpd_sys_content_t` = nginx/apache 可读的网页内容）。

### 改标签

```bash
# 临时
sudo chcon -t httpd_sys_content_t /var/www/html/file.html

# 持久（重启 / restorecon 仍保留；**推荐**）
sudo semanage fcontext -a -t httpd_sys_content_t '/srv/web(/.*)?'
sudo restorecon -Rv /srv/web

# 看正则
sudo semanage fcontext -l | grep srv
```

### Boolean（policy 开关）

很多通用策略以 bool 形式存在，比改 type 简单：

```bash
sudo getsebool -a | grep httpd            # 所有 httpd 相关 bool
sudo setsebool -P httpd_can_network_connect on    # -P 持久
sudo setsebool -P httpd_can_sendmail on
sudo setsebool -P nfs_export_all_rw on
```

常用 bool：

| Bool | 用途 |
|------|------|
| `httpd_can_network_connect` | nginx/apache 能连后端（如 unicorn / php-fpm 不同机） |
| `httpd_enable_homedirs` | nginx 能读用户 home |
| `samba_enable_home_dirs` | samba 共享 home |
| `nis_enabled` | 启用 NIS 相关访问 |
| `ssh_sysadm_login` | sysadm 角色能 SSH 登录 |

### 端口标签

```bash
sudo semanage port -l | grep ssh
sudo semanage port -a -t ssh_port_t -p tcp 2222      # 加非标 SSH 端口
sudo semanage port -m -t http_port_t -p tcp 8080     # 改 8080 为 http 类型
sudo semanage port -d -t ssh_port_t -p tcp 2222      # 删
```

### 排查"为啥被拦"

```bash
# 1) 看 audit log
sudo ausearch -m AVC,USER_AVC -ts recent
# 或
sudo grep -i "denied\|AVC" /var/log/audit/audit.log | tail

# 2) 让 sealert 给"人话"建议（setroubleshoot 包）
sudo sealert -a /var/log/audit/audit.log

# 3) audit2allow 直接生成"允许这个动作的 module"
sudo grep nginx /var/log/audit/audit.log | audit2allow -M nginx-custom
sudo semodule -i nginx-custom.pp
```

### 排障流程（推荐）

```
出现"denied" / 服务起不来
   ↓
临时 setenforce 0   --   验证：是否就是 SELinux 的事
   ↓
是 → setenforce 1 重回 enforcing
   ↓
ausearch / sealert 找具体规则
   ↓
首选：boolean 调整（setsebool -P）
次选：标签修正（chcon / semanage fcontext + restorecon）
最后：audit2allow 生成自定义 module
   ↓
**不要永久 SELINUX=disabled**
```

## 二、AppArmor

### 状态

```bash
sudo aa-status
# 输出：
# X profiles are loaded
# X profiles are in enforce mode
# Y profiles are in complain mode
# Z processes have profiles defined

sudo apparmor_status                      # 同上
```

模式：

| 模式 | 含义 |
|------|------|
| `enforce` | 严格执行（默认） |
| `complain` | 只记录违规不拦截（**调试用**） |
| `disable` | 关闭该 profile（保留文件） |
| 没 profile | 不受限 |

### 切模式（单 profile）

```bash
sudo aa-complain /etc/apparmor.d/usr.sbin.nginx     # nginx 进入 complain 模式
sudo aa-enforce /etc/apparmor.d/usr.sbin.nginx      # 切回 enforce
sudo aa-disable /etc/apparmor.d/usr.sbin.nginx      # ⚠️ 关闭
sudo aa-enforce /etc/apparmor.d/usr.sbin.nginx      # 重新启用

# 全部 enforce 模式
sudo aa-enforce /etc/apparmor.d/*

# 重载所有
sudo systemctl reload apparmor
```

### Profile 文件结构

```
# /etc/apparmor.d/usr.sbin.nginx
#include <tunables/global>

/usr/sbin/nginx {
    #include <abstractions/base>
    #include <abstractions/nis>

    capability dac_override,
    capability net_bind_service,
    capability setgid,
    capability setuid,

    /etc/nginx/** r,
    /etc/ssl/private/** r,
    /var/log/nginx/* w,
    /var/www/** r,
    /run/nginx.pid w,
    /run/nginx/* w,

    network inet stream,
    network inet6 stream,
}
```

权限标志：

| 标志 | 含义 |
|------|------|
| `r` | 读 |
| `w` | 写 |
| `a` | 追加 |
| `x` | 执行（要配子 profile） |
| `m` | 内存映射可执行（mmap） |
| `k` | 加锁 |
| `l` | link |

### 排查被拦

```bash
# 日志
sudo dmesg | grep DENIED                  # 内核 AVC
sudo journalctl -k | grep apparmor

# 实时
sudo tail -f /var/log/syslog | grep apparmor          # Debian

# 交互式补 profile
sudo aa-logprof                           # 走最近的 DENIED 让你选 allow / deny / ignore，自动写进 profile
```

### 生成新 profile

```bash
sudo aa-genprof /usr/bin/myapp            # 跑一遍应用、aa-genprof 监听 + 学习
# 跑完按 'F' 完成
```

## 三、容器与 MAC

### Docker / Podman

Docker 自带 AppArmor profile（默认 `docker-default`）+ 默认 SELinux 标签处理（`container_t`）。

```bash
# 给容器自定义 AppArmor profile
docker run --security-opt apparmor=my-profile ...

# 关闭（不推荐）
docker run --security-opt apparmor=unconfined ...

# SELinux 标签（启用了 SELinux 的宿主）
docker run --security-opt label=type:container_t ...
docker run --security-opt label=disable ...      # 关
```

### K8s

PodSecurityContext / SecurityContext 可以指定 SELinux 标签和 AppArmor profile：

```yaml
spec:
  securityContext:
    seLinuxOptions:
      type: container_t
  containers:
    - name: app
      image: nginx
      securityContext:
        appArmorProfile:
          type: Localhost
          localhostProfile: my-nginx-profile
```

## 四、常见场景

### 场景 1：Nginx 起不来（SELinux）

`/var/log/audit/audit.log` 看到：

```
denied  { read } for pid=12345 comm="nginx" path="/data/www/index.html" scontext=system_u:system_r:httpd_t:s0 tcontext=unconfined_u:object_r:default_t:s0
```

= nginx 想读 /data/www 但目录标签是 `default_t`（不是 nginx 能读的 `httpd_sys_content_t`）。

修：

```bash
sudo semanage fcontext -a -t httpd_sys_content_t '/data/www(/.*)?'
sudo restorecon -Rv /data/www
```

### 场景 2：nginx 反代后端 502（SELinux）

audit log: `denied { name_connect } for pid=... comm="nginx" dest=8080 ... tcontext=...:http_port_t:...` → nginx 不能 connect 出去。

```bash
sudo setsebool -P httpd_can_network_connect on
```

### 场景 3：SSH 改端口起不来（SELinux）

```
sshd: error: Bind to port 2222 on 0.0.0.0 failed: Permission denied
```

```bash
sudo semanage port -a -t ssh_port_t -p tcp 2222
```

### 场景 4：MySQL 自定义 datadir 起不来（SELinux）

```bash
sudo semanage fcontext -a -t mysqld_db_t '/data/mysql(/.*)?'
sudo restorecon -Rv /data/mysql
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| SELinux 配置 | `/etc/selinux/config` |
| SELinux 策略 | `/etc/selinux/targeted/policy/` |
| SELinux audit | `/var/log/audit/audit.log` |
| AppArmor profiles | `/etc/apparmor.d/` |
| AppArmor 已禁用 link | `/etc/apparmor.d/disable/` |
| AppArmor 缓存 | `/var/cache/apparmor/` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `setenforce 0` | **安全降级**（运行时） |
| 改 `/etc/selinux/config` SELINUX=disabled + 重启 | 完全关 SELinux；标签可能丢失（再开要 `touch /.autorelabel` 全盘重打标，启动耗时） |
| `aa-disable` 关键服务 profile | 服务失去 AppArmor 保护 |
| `systemctl stop apparmor / selinux` | 失去 MAC 防护 |
| `rm -rf /etc/selinux` / `/etc/apparmor.d` | 删全部策略 |
| `setenforce 0` 后疏忽未恢复 | 长期 Permissive = 等同关闭，合规失格 |

## 教训

- **永远不要 `SELINUX=disabled` 永久关**；切到 `Permissive` 至少留审计日志。
- 排障第一步 `sudo setenforce 0` 验证是不是 SELinux 的事，**验证完立即** `setenforce 1` —— 留着不改是常见漏洞源。
- 用 `semanage fcontext` + `restorecon` 而**不是** `chcon`：后者一次性，前者写到策略 db 里持久。
- `audit2allow` 生成的 module 只允许"当前观察到"的违规；**未来新行为还是会被拦**，要么继续生成补丁，要么用 boolean。
- AppArmor profile 修改后必须 `systemctl reload apparmor` 或 `apparmor_parser -r /etc/apparmor.d/...`。
- Docker 默认 AppArmor profile **会拦一些容器内的 ptrace**；调试 `strace` 等需要 `--security-opt apparmor=unconfined`（仅调试容器）。
- 大变更前先 `setenforce 0` 跑一遍业务流量收集 audit log，再用 audit2allow 生成精确 module，**比直接关 SELinux 安全得多**。

---
