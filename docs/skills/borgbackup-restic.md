---
name: borgbackup-restic
description: 备份工具速查 —— borg + restic + rsnapshot 对照 / 增量加密 / 远程仓库 / 恢复演练。
触发词: borg, borgbackup, restic, rsnapshot, 备份, backup, 增量备份, 加密备份, snapshot, 恢复, 恢复数据, 恢复文件, 还原, 找回文件, 误删找回, 备份没了, 备份失败, 备份不了, 恢复不了, 备份策略, 异地备份, 灾备, 3-2-1 备份, 定时备份, 自动备份, 备份脚本, rclone, kopia, duplicati, restic 0.17, borg 1.4, restic check, borg check, prune 策略, keep-daily, keep-monthly, 备份到 s3, 备份到 minio, 备份恢复演练
dangerous_commands:
  # restic forget（删快照）/ prune（回收=物理删未引用数据）—— 都会减少可恢复点
  - '(?i)\brestic\s+forget\b'
  - '(?i)\brestic\s+prune\b'
  # borg delete（删 repo/archive）/ break-lock（写入中强解锁=元数据损坏）/ prune（按策略删 archive）
  - '(?i)\bborg\s+(?:delete|break-lock|prune)\b'
  # 删本地备份仓库目录（含 ~/.reeve/backups 与各类 repo 路径），命中即审批
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+[~/\w.-]*(?:backup|repo|restic|borg)[~/\w.-]*/?(?:\s|/|$)'
---

# borgbackup-restic —— 备份工具

适用：用户想"找个增量备份工具"/"备份到远程 / S3"/"恢复演练"/"3-2-1 备份策略"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看磁盘/仓库占地** → `disk_usage(server, "<repo 路径>")`（任何档位放行）——备份吃磁盘，动手前先看还有多少空间。
- **看备份服务/定时器状态** → `service_status(server, "borg-backup.timer")` / `service_status(server, "restic-backup.timer")`。
- **看备份运行日志** → `tail_log(server, "~/.reeve/logs/<job>.log")`，或 `ssh_exec journalctl -u borg-backup`。
- **改备份脚本 / systemd unit / restic env** → 先 `sftp_read` 看现状，再 `sftp_write` 整文件写（密码占位用 `EnvironmentFile`，别把 passphrase 明文塞进命令）。
- ⚠️ `borg create` / `restic backup` / `prune` / 恢复 等写操作会触发**用户审批**——提前告知用户，被拒后不要原样重试。

### 🔴 本地仓库 / 还原产物 / 备份脚本统一落 `~/.reeve`（铁律）

OpsPub 远程服务器有一个统一工作区 `~/.reeve`。**本地（非远程 repo 服务器）的备份相关产物一律落这里**，**严禁臆造 `/mnt/backup`、`/data/backup`、`/srv/backup`、`/backup` 等可能不存在的路径**：

| 用途 | 落地路径 |
|------|---------|
| 本地 borg/restic 仓库 | `~/.reeve/backups/<repo 名>` |
| 还原产物（restore --target / borg extract 输出） | `~/.reeve/backups/restore-<时间戳>/` |
| borg mount / restic mount 临时挂载点 | `~/.reeve/tmp/borg-mount` |
| 备份/恢复脚本 | `~/.reeve/scripts/` |
| 运行日志 | `~/.reeve/logs/` |

> 下文示例为了通用性写了 `/mnt/backup/myrepo` 等占位路径——**实际给用户跑时，本地仓库一律换成 `~/.reeve/backups/...`**。远程 repo 地址（`user@host:/path` / `s3:...` / `sftp:...`）用**用户提供的真实地址**，不要臆造。

## 选型对照

| 工具 | 强项 | 弱项 | 适合 |
|------|------|------|------|
| **BorgBackup** | 去重+压缩+加密；本地或 SSH 仓库；社区稳健 | 远程仓库要 borg-server | Linux/Unix 服务器互备 |
| **restic** | 多后端（S3 / SFTP / B2 / Azure / GCS / REST）；单二进制 | append-only 模式较新 | 跨云备份 / 单机异地 |
| **rsnapshot** | rsync + hardlink；可读快照目录 | 不去重 / 不压缩 / 不加密 | 简单本机滚动 |
| **Duplicacy** | lock-free 多客户端并发 | 商业（CLI 免费） | 多主机共享 repo |
| **Kopia** | 现代 UI + GUI | 较新 | 个人桌面 |
| **bup** | 极致去重；适合 VM 镜像 | 不更新 | 已落后 |

## 3-2-1 备份原则

```
3 份副本（含 1 份生产）
2 种介质（不同存储类型）
1 份异地（off-site）
```

## 一、BorgBackup

### 装

```bash
# Debian/Ubuntu
sudo apt install -y borgbackup

# RHEL/Rocky
sudo dnf install -y borgbackup
```

### 初始化 repo

```bash
# 本地（OpsPub 统一工作区，别用 /mnt/backup 等可能不存在的路径）
borg init --encryption=repokey-blake2 ~/.reeve/backups/myrepo

# 远程（SSH，远端要装 borg；地址用用户提供的真实地址）
borg init --encryption=repokey-blake2 user@backup.example.com:/srv/backup/myrepo

# 加密方式
# none / authenticated / repokey-blake2 / keyfile-blake2
# repokey: 密钥存仓库（输入 passphrase 解密）
# keyfile: 密钥存本地 ~/.config/borg/keys/（需要单独备份这把 key！）
```

> ⚠️ **passphrase 丢了 = 数据永久失去**。OpsPub 敏感库会自动捕获 `BORG_PASSPHRASE`。

### 备份

```bash
export BORG_PASSPHRASE='xxx'                    # 或 BORG_PASSCOMMAND='pass show borg/myrepo'

borg create --stats --progress \
    ~/.reeve/backups/myrepo::'{hostname}-{now:%Y-%m-%d-%H%M%S}' \
    /etc /home /var/www \
    --exclude '*.tmp' \
    --exclude '/var/cache' \
    --exclude '/var/log' \
    --exclude-caches \                       # 跳过含 CACHEDIR.TAG 的目录
    --compression zstd,3
```

archive 名占位符：`{hostname}` `{user}` `{now}` `{utcnow}` `{fqdn}` `{pid}`。

### 列 / 查看

```bash
borg list /mnt/backup/myrepo                    # 所有 archive
borg list /mnt/backup/myrepo::myarchive         # 单 archive 文件列表
borg info /mnt/backup/myrepo                    # repo 概览
borg info /mnt/backup/myrepo::myarchive         # archive 详情
borg diff /mnt/backup/myrepo::archive1 archive2 # 两 archive 差异
```

### 恢复

```bash
# 整 archive 恢复（到当前目录或指定）
borg extract /mnt/backup/myrepo::myarchive

# 仅恢复部分（按 path）
borg extract /mnt/backup/myrepo::myarchive etc/nginx

# Mount 成 fuse 文件系统直接 cp（挂载点落 ~/.reeve/tmp）
mkdir -p ~/.reeve/tmp/borg
borg mount ~/.reeve/backups/myrepo::myarchive ~/.reeve/tmp/borg
ls ~/.reeve/tmp/borg
cp ~/.reeve/tmp/borg/etc/nginx/nginx.conf ~/.reeve/backups/
borg umount ~/.reeve/tmp/borg

# Mount 整个 repo（每个 archive 一个子目录）
borg mount ~/.reeve/backups/myrepo ~/.reeve/tmp/borg
```

### Prune（保留策略）

```bash
borg prune --list --dry-run \
    --keep-daily=7 --keep-weekly=4 --keep-monthly=12 \
    /mnt/backup/myrepo

# 真删
borg prune --list \
    --keep-daily=7 --keep-weekly=4 --keep-monthly=12 \
    /mnt/backup/myrepo

# 空间回收（**必须**跟在 prune 之后才能真正释放）
borg compact /mnt/backup/myrepo
```

### Check / 校验

```bash
borg check /mnt/backup/myrepo                   # 完整性检查（**慢，重要**）
borg check --repair /mnt/backup/myrepo          # ⚠️ 修复（极端情况，可能丢数据）
```

### Cron / systemd 定时

```bash
# /etc/systemd/system/borg-backup.service
[Service]
Type=oneshot
Environment=BORG_PASSPHRASE=xxx
ExecStart=/usr/bin/borg create --stats /mnt/backup/myrepo::{hostname}-{now} /etc /home
ExecStartPost=/usr/bin/borg prune --keep-daily=7 --keep-weekly=4 /mnt/backup/myrepo
ExecStartPost=/usr/bin/borg compact /mnt/backup/myrepo

# /etc/systemd/system/borg-backup.timer
[Timer]
OnCalendar=daily
RandomizedDelaySec=2h
Persistent=true
```

## 二、restic

### 装

```bash
# 通用：单二进制
curl -sL https://github.com/restic/restic/releases/latest/download/restic_*_linux_amd64.bz2 \
    | bunzip2 > restic && chmod +x restic && sudo mv restic /usr/local/bin/

# 或包管理器
sudo apt install -y restic
```

### 初始化（按后端）

```bash
# 本地（OpsPub 统一工作区）
restic init --repo ~/.reeve/backups/restic

# SFTP（地址用用户提供的真实地址）
restic init --repo sftp:user@backup.example.com:/srv/backup

# S3 / MinIO
export AWS_ACCESS_KEY_ID=xxx
export AWS_SECRET_ACCESS_KEY=xxx
restic init --repo s3:https://minio.example.com:9000/restic-bucket

# Backblaze B2
restic init --repo b2:bucket-name:path/

# REST server
restic init --repo rest:https://backup.example.com/myrepo
```

passphrase 用环境变量 / 文件：

```bash
export RESTIC_PASSWORD='xxx'
# 或
export RESTIC_PASSWORD_FILE=/etc/restic/password
chmod 600 /etc/restic/password
```

### 备份

```bash
restic backup /etc /home /var/www \
    --exclude '*.tmp' \
    --exclude-file /etc/restic/exclude.list \
    --exclude-caches \
    --tag prod \
    --host myhost
```

### 列 / 查看

```bash
restic snapshots                                # 所有 snapshot
restic snapshots --tag prod
restic snapshots --host myhost
restic ls <snapshot-id>                         # 列文件
restic ls <snapshot-id> /etc/nginx
restic stats                                    # 总占用
restic stats --mode raw-data
```

### 恢复

```bash
# 整 snapshot（还原产物落 ~/.reeve/backups，别用 /tmp 或臆造路径）
restic restore <snapshot-id> --target ~/.reeve/backups/restore-$(date +%Y%m%d-%H%M%S)

# 子路径
restic restore <snapshot-id> --target ~/.reeve/backups/restore-nginx --include /etc/nginx

# 最新
restic restore latest --target ~/.reeve/backups/restore-latest --host myhost

# Mount（FUSE，挂载点落 ~/.reeve/tmp）
mkdir -p ~/.reeve/tmp/restic
restic mount ~/.reeve/tmp/restic
ls ~/.reeve/tmp/restic/snapshots/               # 按 host / tag 子目录
```

### Forget + Prune

```bash
restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
# --prune 真正回收空间（**比 borg compact 更慢但一步到位**）

# 仅 forget 不 prune
restic forget --keep-daily 7
# 之后再
restic prune
```

### Check

```bash
restic check                                    # 元数据
restic check --read-data                        # 全部数据（慢但彻底）
restic check --read-data-subset 10%            # 抽 10% 检查
```

### 自动化

```bash
# /etc/systemd/system/restic-backup.service
[Service]
EnvironmentFile=/etc/restic/env
ExecStart=/usr/local/bin/restic backup /etc /home --tag daily
ExecStartPost=/usr/local/bin/restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 12 --prune
```

```ini
# /etc/restic/env
RESTIC_REPOSITORY=s3:https://minio.example.com:9000/restic-bucket
RESTIC_PASSWORD=xxx
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

## 三、rsnapshot（简单本地快照）

```bash
sudo apt install -y rsnapshot

# /etc/rsnapshot.conf（**注意：tab 分隔，不能空格**）
config_version    1.2
snapshot_root    ~/.reeve/backups/rsnapshot/
retain    daily    7
retain    weekly    4
retain    monthly    12

backup    /etc/        myhost/
backup    /home/       myhost/
backup    user@10.0.0.5:/srv/    remote-srv/    +rsync_long_args=--bwlimit=10000
```

```bash
sudo rsnapshot configtest                       # 必跑（语法检查）
sudo rsnapshot daily
sudo rsnapshot weekly
sudo rsnapshot monthly

# cron
0 */4 * * * /usr/bin/rsnapshot daily
0 3 * * 0 /usr/bin/rsnapshot weekly
0 4 1 * * /usr/bin/rsnapshot monthly
```

rsnapshot 把每个快照存为目录（hardlink 去重未变文件），可以**直接 cd / cp 出来**，恢复极简单：

```bash
ls ~/.reeve/backups/rsnapshot/daily.0/myhost/etc/nginx/
```

## 四、对比备份特定数据

### 数据库

| DB | 备份手段 |
|----|---------|
| MySQL | `mysqldump` 流式 → restic stdin / borg `--stdin-filename` |
| PostgreSQL | `pg_basebackup` 全量 + WAL 归档 |
| MongoDB | `mongodump --archive=- | restic backup --stdin` |
| Redis | RDB / AOF 文件直接 borg / restic |

```bash
# 例：mysqldump 流到 restic
mysqldump --all-databases | restic backup --stdin --stdin-filename mysql.sql
```

### 大数据

PB 级用 **clickhouse-backup** / **velero**（K8s）/ 厂商工具，不要用通用备份。

### Docker volume

```bash
# 把 volume 数据流到 borg
docker run --rm -v mydata:/data alpine tar c /data | borg create /mnt/backup/myrepo::mydata-{now} -
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| Borg keyfile 模式密钥 | `~/.config/borg/keys/`（**必须单独备份**） |
| Borg cache | `~/.cache/borg/` |
| restic 仓库结构 | `<repo>/config` + `<repo>/data/` + `<repo>/snapshots/` |
| restic cache | `~/.cache/restic/` |
| rsnapshot 快照 | `snapshot_root` 配置项（默认 `/var/cache/rsnapshot/`） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `restic forget --keep-last 0` | **清空所有 snapshot** |
| `restic forget --prune --keep-daily 0` | 同上 |
| `restic prune --max-unused 0` | 100% 紧凑（极慢 + 大量 I/O） |
| `borg delete <repo>::<archive>` | 删单 archive（不可恢复） |
| `borg break-lock` | 强解锁 repo（**有进程正在写时 = 元数据可能损坏**） |
| `borg compact` 同时另一备份在跑 | 互斥锁冲突 |
| `rm -rf <repo>` | **删整个备份**，不可恢复 |
| 改 repo passphrase 但没记新密码 | **永久失去** |
| `keyfile` 模式不备份 key | 同上 |

## 教训

- **没演练过的备份等于没备份**：每月至少一次完整恢复演练（哪怕只是 mount + 抽查 diff）。
- **3-2-1 原则**：本地 + 异地 + 云；同机房不算异地。
- borg / restic 都是**仓库私钥制**：密钥/密码**单独备份**（密码管理器 + 纸质 + 异地保险柜），repo 在但 key 没 = 数据永远拿不出来。
- `--keep-last N` 等于 `--keep-daily N`，但更脆弱（一天跑两次 = 当天的覆盖掉前一天）；推荐 `--keep-daily 7 --keep-weekly 4 --keep-monthly 12`。
- 数据库**不要**直接备份运行中的数据文件；用 mysqldump / pg_basebackup / mongodump 等**一致性快照**工具。
- 备份触发 + 完成 + 失败**都加告警**（Healthchecks.io / Uptime Kuma）；几个月没跑的 cron 你都不知道。
- restic 后端用 S3/MinIO 时**装上 lifecycle policy**自动清理 `incomplete` multipart upload；否则碎片永久占地方。
- 备份频率与保留期都不要"想到再说"：**先按业务 RPO/RTO 算清楚再选策略**，没明确目标的策略一定不合规。

---
