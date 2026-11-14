---
name: minio-s3
description: MinIO（S3 兼容对象存储）速查 —— mc 客户端 / bucket / policy / lifecycle / replication / 部署形态。
触发词: minio, s3 存储, 对象存储, mc 客户端, object storage, bucket, multipart, lifecycle, replication, minio console, presigned, mc alias, minio 起不来, minio 装, 装 minio, 部署 minio, minio 备份, s3 api, aws s3, garage, seaweedfs, ceph rgw, mc cp, mc mirror, 跨区域复制, 桶策略, bucket policy, iam policy, presigned url, 临时下载链接, mc admin, minio operator, silo, pgsty, minio fork, minio 控制台没了, minio 版本
dangerous_commands:
  - '(?i)\bmc\s+rb\b[^\n]*--force\b'
  - '(?i)\bmc\s+rm\b[^\n]*--recursive\b[^\n]*--force\b'
  - '(?i)\bmc\s+admin\s+config\s+set\b[^\n]*\bidentity_openid\b'
  # 删 minio 数据目录（含 1Panel/docker 默认布局），命中即触发审批
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+[~/\w.-]*minio[~/\w.-]*/?(?:\s|/|$)'
  # 用户/服务账号删除，删错会让应用瞬间断连
  - '(?i)\bmc\s+admin\s+user\s+(?:remove|svcacct\s+(?:rm|remove))\b'
---

# minio-s3 —— MinIO 对象存储

适用：自建对象存储替代 S3；想"装 minio"/"装 mc 客户端"/"用 minio 给 GitLab/Loki/备份做存储"/"配置 lifecycle / replication"/"权限管理"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 MinIO 优先用 `install_app(server, "minio")`**（MinIO 在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码（AccessKey/SecretKey）托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 minio 服务/容器状态 | `service_status(server, "minio")` | systemctl status |
| 看 S3 API / Console 端口 | `port_check(server, 9000)` / `port_check(server, 9001)` | ss -tlnH |
| 看数据盘用量（对象存储吃磁盘） | `disk_usage(server, "<数据目录>")` | df -hT |
| 看 minio 日志 | `tail_log(server, "<容器/服务日志>")` | tail -n |
| 改 compose / env（端口、密码占位） | `sftp_read` 看现状 + `sftp_write` 整文件写 | 直接编辑 |

这些只读工具**任何策略档位都放行**；改 `docker-compose.yml` / env 走 `sftp_read`+`sftp_write`（无 shell 转义坑），写完 `ssh_exec docker compose up -d`。后文 `mc` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 含 `sudo` / `mc rb` / `mc rm --recursive` 等写操作会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。
> 本地导出/备份对象（`mc cp` 拉到本机临时盘、`mc mirror` 落地、restic/borg 还原产物）统一落 **`~/.reeve/backups`** 或 **`~/.reeve/tmp`**（OpsPub 远程统一工作区），**不要臆造 `/data/backup`、`/mnt/backup` 等可能不存在的路径**。

## 第一步：部署形态

| 形态 | 容量 | 高可用 |
|------|------|--------|
| **Standalone** | 单盘 | 无 HA |
| **Distributed (Erasure Coding)** | 4-32 节点，每节点 1+ 盘 | EC 自动冗余（默认 N/2 可读、N/2 可写） |
| **MinIO Operator (K8s)** | 多集群多租户 | K8s 原生 |

中小团队选 standalone + 定期备份 + 1Panel/docker 部署足够。

### 🔴 先选对镜像线（官方已停更，别再用 `minio/minio:latest`）

官方社区版 **2025-05 砍掉管理控制台 → 2025-10 停发镜像 → 2026-02 仓库归档**，`minio/minio:latest` 现在既没控制台也不会再有 CVE 修复。接盘的是 Pigsty 社区 fork（2026-08-06 由 `pgsty/minio` 改名 `pgsty/silo`）：恢复控制台、持续修 CVE，**S3 API / `MINIO_*` 环境变量 / `x-minio-*` 头 / 磁盘 `.minio.sys` 格式全部保持兼容**，换镜像即可、数据不用动。

| 线 | 镜像 | 说明 |
|---|---|---|
| **维护线（默认推荐）** | `pgsty/silo:RELEASE.2026-09-03T13-18-01Z` | 仍在发版；OpsPub 应用商店装的就是这条 |
| 保守线 | `pgsty/minio:RELEASE.2026-04-17T00-00-00Z` | 改名前最后一批，已封板（RuoYi-Vue-Plus 等框架锁的就是这条） |
| 官方末代 | `minio/minio:RELEASE.2025-04-22T22-12-26Z` | 最后一个带完整控制台的官方版，此后无任何更新 |

⚠️ 换线注意：① 分布式集群**所有节点必须一起换**，silo 与 minio 混跑组不成集群；
② 单节点原地换 image 即可，命名卷/数据目录不动；③ 生产别用 `latest`，钉具体 RELEASE（最好连 digest 一起钉）。
④ 客户端侧：AWS SDK **v2 ≥ 2.30** 默认给上传加 CRC32 校验和 trailer，老 MinIO/兼容实现会报 `XAmzContentSHA256Mismatch` / `XAmzContentChecksumMismatch` —— 报这个错先查 SDK 版本，不是服务端坏了（解法：`requestChecksumCalculation=WHEN_REQUIRED`，或钉 SDK < 2.30）。

### Docker compose（standalone）

```yaml
services:
  minio:
    image: pgsty/silo:RELEASE.2026-09-03T13-18-01Z   # 见上表；别用 minio/minio:latest（已停更无控制台）
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: <强密码>           # ⚠️ 必改 + 进敏感库
      MINIO_BROWSER_REDIRECT_URL: https://minio-console.example.com
      MINIO_SERVER_URL: https://minio.example.com
    ports:
      - "9000:9000"      # S3 API
      - "9001:9001"      # Web console
    volumes:
      - /data/minio:/data
```

> ⚠️ `MINIO_ROOT_PASSWORD` **8 位以上**且改默认；首次启动 1Panel 类面板会显示一次密码，**OpsPub 敏感库**会自动捕获。

### Distributed 部署示例（4 节点，每节点 4 盘）

```bash
# 在每个节点跑
minio server --console-address ":9001" \
    http://node{1...4}.local:9000/data{1...4}
```

EC：4 节点 × 4 盘 = 16 块；默认 N/2 = 8 块奇偶，可容忍 8 块（最多 2 节点）失效。

## 第二步：mc 客户端

```bash
# 装 mc
curl -sLO https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc && sudo mv mc /usr/local/bin/

# 加 alias
mc alias set myminio https://minio.example.com minioadmin <password>
mc alias list
mc admin info myminio                       # 集群状态
```

### 桶操作

```bash
mc mb myminio/mybucket                      # 建桶
mc ls myminio                               # 列桶
mc ls myminio/mybucket                      # 列对象
mc ls --recursive myminio/mybucket/
mc du myminio/mybucket                      # 桶用量
mc stat myminio/mybucket/myfile             # 对象元信息

mc cp ./localfile myminio/mybucket/
mc cp myminio/mybucket/file ./
mc mirror ./localdir myminio/mybucket/      # 同步目录
mc mirror --watch ./localdir myminio/mybucket/   # 实时同步（inotify）

mc rm myminio/mybucket/file                 # 删单对象
mc rm --recursive --dangerous myminio/mybucket/prefix/      # ⚠️ 递归删
mc rb --force myminio/mybucket              # ⚠️ 删桶（含全部对象）
```

### 跨存储复制（mc 是通用 S3 客户端）

```bash
mc alias set aws https://s3.amazonaws.com <ak> <sk>
mc mirror myminio/mybucket aws/mybucket-replica       # MinIO → AWS S3
mc mirror aws/srcbucket myminio/dstbucket             # 反向也行
```

## 第三步：权限模型

### Policy（IAM-like JSON）

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:ListBucket"],
      "Resource": ["arn:aws:s3:::mybucket", "arn:aws:s3:::mybucket/*"]
    }
  ]
}
```

操作：

```bash
mc admin policy create myminio readonly-mybucket policy.json
mc admin policy list myminio
mc admin policy info myminio readonly-mybucket
mc admin policy attach myminio readonly-mybucket --user appuser

# 用户管理
mc admin user add myminio appuser <appuser-secret>
mc admin user list myminio
mc admin user disable myminio appuser
mc admin user remove myminio appuser

# 服务账号（应用直连用 access/secret）
mc admin user svcacct add myminio appuser --access-key AKIA... --secret-key xxx
mc admin user svcacct ls myminio appuser
mc admin user svcacct edit myminio AKIA... --policy custom.json
```

### Bucket Policy（匿名访问，public 桶）

```bash
mc anonymous set download myminio/public          # 任何人 GET
mc anonymous set upload myminio/uploads           # 任何人 PUT（⚠️ 慎用）
mc anonymous set public myminio/public            # 全开
mc anonymous get myminio/mybucket                 # 看当前
mc anonymous remove myminio/mybucket              # 取消
```

## 第四步：Lifecycle（自动过期 / 转层）

```json
// lifecycle.json
{
  "Rules": [
    {
      "ID": "expire-logs-90d",
      "Filter": { "Prefix": "logs/" },
      "Status": "Enabled",
      "Expiration": { "Days": 90 }
    },
    {
      "ID": "abort-multipart-7d",
      "Status": "Enabled",
      "AbortIncompleteMultipartUpload": { "DaysAfterInitiation": 7 }
    }
  ]
}
```

```bash
mc ilm import myminio/mybucket < lifecycle.json
mc ilm ls myminio/mybucket
mc ilm rm --id expire-logs-90d myminio/mybucket
```

> 推荐**所有桶**都加 `AbortIncompleteMultipartUpload`，否则上传中断的分片永久占地方（mc ls 看不到）。

## 第五步：Bucket Replication（站点级复制）

```bash
# 1) 给 source/target 双向加 alias
mc alias set src https://src-minio.example.com <ak> <sk>
mc alias set dst https://dst-minio.example.com <ak> <sk>

# 2) 在 dst 建好同名 bucket
mc mb dst/mybucket

# 3) 配置 replication
mc replicate add src/mybucket \
    --remote-bucket "arn:minio:replication::xxx:mybucket" \
    --priority 1
mc replicate ls src/mybucket
```

## 第六步：versioning + 对象锁

```bash
mc version enable myminio/mybucket
mc version info myminio/mybucket
mc ls --versions myminio/mybucket/file

# 对象锁定（合规：写入后不可删 N 天）
mc retention set --default GOVERNANCE 30d myminio/mybucket
```

> **桶要在 `mc mb --with-lock` 创建时**才能开对象锁；存量桶**不能**事后加。

## 第七步：诊断 / 健康

```bash
mc admin info myminio                       # 集群版本 + 节点 + 状态
mc admin heal myminio                       # 修复（distributed）
mc admin trace myminio                      # 实时请求 trace
mc admin trace -e error myminio             # 只看错误
mc admin trace --status-code 500 myminio    # 只看 500
mc admin logs myminio                       # 服务端日志
mc admin profile start myminio --type cpu,goroutines      # 性能 profile
```

## 第八步：搭配常见用法

| 用途 | 配置 |
|------|------|
| Loki / Tempo 后端 | 单桶 + s3 endpoint 配 MinIO |
| GitLab artifact / LFS | runner.toml 配 s3 cache + GitLab admin → object storage |
| Velero K8s 备份 | bucket + IAM user |
| 文件备份（restic / borg） | `restic init -r s3:https://minio:9000/restic-bucket` |
| Mastodon / Nextcloud 静态资源 | endpoint + access key |
| 大数据（hudi / iceberg） | minio 当 HDFS 替代 |

## 路径速查表

| 内容 | 路径 |
|------|------|
| 数据 | server 启动指定（如 `/data` / `/data{1..4}`） |
| mc 配置 | `~/.mc/config.json`（alias + 密钥保存这） |
| MinIO console | `:9001` |
| MinIO S3 API | `:9000` |
| 1Panel 部署 | `/opt/1panel/apps/minio/minio/data/` + `docker-compose.yml` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `mc rb --force` | 删桶 + **桶内全部对象**，不可恢复（除非有 versioning + 没过 retention） |
| `mc rm --recursive --force` | 递归删 prefix 下所有对象 |
| 改 `MINIO_ROOT_PASSWORD` 但不通知应用 | 所有用 root 凭据的应用瞬间断 |
| `mc admin config set identity_openid` 配错 | SSO 配错可能锁死管理员 |
| `rm -rf /data/minio` 或挂载源 | **删全部数据** |
| 对生产桶开 `mc anonymous set public` | 任何人都能列/下载/上传 |
| Distributed 节点掉超过 EC 容忍数 | 部分对象不可读（再掉一台就丢） |

## 教训

- **`MINIO_ROOT_PASSWORD` 必须强且改默认**，否则 9001 console 任何人都能登（曾出过厂商默认密码爆 PB 级数据的事故）。
- 生产桶**永远开 versioning + lifecycle**，误删能 `mc undo` 恢复；纯 prod 桶配 GOVERNANCE 对象锁。
- 用 `mc mirror --watch` 当实时同步**有 inode 上限**（inotify）；超大目录用 rclone / 定时全量。
- 客户端应用**不要用 root 凭据**，必须创 user + 最小权限 policy + service account。
- multipart 上传中断会留**碎片占地方**（mc ls 看不到）：**所有桶**都加 `AbortIncompleteMultipartUpload` 规则。
- distributed 模式扩容节点必须**整组**（如原 4 节点 → 加 4 个），不能加单节点；扩前先 mc admin info 看 EC 配置。
- mc 的 `--dangerous` flag 是有意设计的"再问一次"，**别想着写 alias 绕过去**。

---
