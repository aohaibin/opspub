---
name: loki-promtail
description: Loki + Promtail 日志聚合栈 —— 配置 / LogQL / Grafana 集成 / S3 后端 / 存储压缩。
触发词: loki, promtail, logql, 日志聚合, 日志查询, log aggregation, grafana 日志, alloy, vector, fluent-bit, structured logging, loki 3, grafana alloy, 装 loki, 部署 loki, 收集日志, 集中日志, 日志接入, 多机日志, 日志检索, label, log stream, 替代 elk, 比 elk 轻, retention, 日志保留, s3 存储日志, loki 没数据, 日志查不到, 日志收不上来, 日志延迟, loki 报错, too many active streams, 高基数
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:/var/lib/loki|/data/loki|/loki)(?:\s|/|$)'
  - '(?i)\bcurl\b[^\n]*-X\s+(?:DELETE|POST)\b[^\n]*/loki/api/v1/delete\b'
---

# loki-promtail —— Loki 日志聚合

适用：用户想"加日志聚合"/"在 Grafana 里看日志"/"按服务名/级别筛"/"日志和 metrics 同时间轴联动"；不想花 ELK 那么多内存。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 loki / promtail 状态 | `service_status(server, "loki")` / `service_status(server, "promtail")`（容器走 `ssh_exec docker ps`） | systemctl status |
| 查端口（3100 Loki HTTP / 9080 Promtail / 9095 gRPC） | `port_check(server, 3100)` / `port_check(server, 9080)` | ss -tlnH |
| 看 loki/promtail 自身日志 | `tail_log(server, "<日志路径>")`，或 `ssh_exec docker logs loki` | tail -n |
| 看 loki 数据占多少磁盘 | `disk_usage(server, "<loki 数据目录>")` | df -hT |
| 改 loki.yml / promtail.yml | `sftp_read` 看现状 + `sftp_write` 整文件写 | 直接编辑 |

这些只读工具**任何策略档位都放行**。改配置走 `sftp_read`+`sftp_write`（无 shell heredoc 转义坑），写完重启容器/服务生效。后文 `curl` / `docker` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 重启服务 / `curl .../delete` 删日志 / 改 retention 等写操作会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## 选型对照

| 工具 | 用途 | 资源占用 |
|------|------|---------|
| **Loki + Promtail** | 类 Prometheus 的日志栈，按 label 索引、内容不索引 | 极低（500MB+） |
| **ELK / Elastic Stack** | 全文索引，强查询 | 高（4GB+） |
| **Vector** | 现代采集 / 转换 / 路由（替代 fluent-bit / promtail） | 低（Rust 实现） |
| **Grafana Alloy** | Grafana 新一代采集器（合并 promtail / fluent-bit / opentelemetry collector） | 低 |

OpsPub 用户大多场景：**Loki + Promtail（或 Alloy）+ Grafana**。

## 一、Loki 部署（docker compose）

```yaml
version: "3"
services:
  loki:
    image: grafana/loki:latest
    restart: unless-stopped
    command: -config.file=/etc/loki/loki.yml
    volumes:
      - ./loki.yml:/etc/loki/loki.yml:ro
      - loki-data:/loki
    ports: ["3100:3100"]

  promtail:
    image: grafana/promtail:latest
    restart: unless-stopped
    command: -config.file=/etc/promtail/promtail.yml
    volumes:
      - ./promtail.yml:/etc/promtail/promtail.yml:ro
      - /var/log:/var/log:ro              # 系统日志
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - promtail-positions:/positions

volumes:
  loki-data:
  promtail-positions:
```

### loki.yml（单实例）

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  grpc_listen_port: 9095

common:
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 720h           # 30 天
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  ingestion_rate_mb: 10
  ingestion_burst_size_mb: 20
  per_stream_rate_limit: 5MB
  max_label_value_length: 4096
  max_label_name_length: 1024
  max_label_names_per_series: 30
  max_streams_per_user: 0          # 0 = 不限

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

### S3 后端（生产推荐）

```yaml
common:
  storage:
    s3:
      endpoint: minio.example.com:9000
      bucketnames: loki-chunks
      access_key_id: xxx
      secret_access_key: xxx
      s3forcepathstyle: true
      insecure: true                 # MinIO HTTP

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: s3
      schema: v13
      index:
        prefix: index_
        period: 24h
```

## 二、Promtail 配置

### promtail.yml

```yaml
server:
  http_listen_port: 9080

positions:
  filename: /positions/positions.yaml   # 持久化"读到哪了"

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  # 1) journal（systemd 日志，**最简洁**）
  - job_name: journal
    journal:
      max_age: 12h
      labels:
        job: systemd-journal
    relabel_configs:
      - source_labels: ['__journal__systemd_unit']
        target_label: unit
      - source_labels: ['__journal__hostname']
        target_label: host

  # 2) 文件
  - job_name: nginx
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx
          host: web01
          __path__: /var/log/nginx/*.log

  # 3) Docker 容器
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: '/(.*)'
        target_label: container

  # 4) JSON 结构化日志解析
  - job_name: myapp
    static_configs:
      - targets: [localhost]
        labels:
          job: myapp
          __path__: /var/log/myapp/*.log
    pipeline_stages:
      - json:
          expressions:
            level: level
            message: message
            request_id: request_id
      - labels:
          level:
      - timestamp:
          source: time
          format: RFC3339Nano
```

## 三、LogQL 速查

类似 PromQL + grep 的混合。

```logql
# 选择器（必须）
{job="nginx"}
{job="nginx", host="web01"}
{job=~"nginx|mysql"}
{job="nginx"} != "404"                          # 排除含 404 的
{job="nginx"} |= "ERROR"                        # 包含 ERROR
{job="nginx"} |~ "5\\d{2}"                      # 正则匹配 5xx

# JSON 字段过滤
{job="myapp"} | json | level="error"
{job="myapp"} | json | duration_ms > 100

# 提取字段
{job="myapp"} | json
{job="nginx"} | regexp `(?P<status>\d{3})` | status="500"
{job="nginx"} | logfmt | level="error"

# Metric（聚合：日志条数转 metric）
sum(rate({job="myapp"} |= "ERROR"[5m]))                            # ERROR 速率
sum by (level) (rate({job="myapp"}[5m]))                            # 按 level 分组
count_over_time({job="nginx"} |~ "5\\d{2}" [1h])                    # 1h 内 5xx 总数

# Topk
topk(5, sum by (host) (rate({job="nginx"} |~ "5\\d{2}"[5m])))
```

## 四、Grafana 集成

UI 「Connections → Data sources → Add Loki」，URL 填 `http://loki:3100`。

Explore 视图直接写 LogQL：

```
{job="nginx"} |= "error"
```

切到 Logs panel 看实时日志；切到 Metrics 模式可视化频率。

### 告警（基于日志）

Grafana Alert → Query → Loki → 用 LogQL metric 表达式（如 `sum(rate(...)) > 0.1`）。

## 五、容量规划

Loki 不索引日志内容，只索引 label —— **label 基数（cardinality）是头号性能杀手**。

**坏例（每条日志一个 trace_id 当 label）**：

```yaml
labels:
  trace_id: '{{.trace_id}}'   # ⛔ 高基数：每个 trace 一个 stream
```

**好例**：

```yaml
labels:
  level: '{{.level}}'         # 低基数：5-10 种
  service: '{{.service}}'
```

`trace_id` / `request_id` / `user_id` / `pod_id` 这些都**不要当 label**，让它们留在消息正文，用 `| json | trace_id="xxx"` 查询。

### 存储估算

```
压缩后日志大小 ≈ 原始日志大小 / 10
30 天保留 + 每天 100GB 日志 ≈ 300GB 压缩 = ~30GB Loki 占用（用 chunks + S3）
```

## 六、清理 / 删除

```bash
# 通过 compactor 自动按 retention 删（推荐）
# limits_config.retention_period: 720h

# 主动删特定 label 范围
curl -X POST 'http://loki:3100/loki/api/v1/delete' \
    --data-urlencode 'query={job="testing"}' \
    --data-urlencode 'start=2024-01-01T00:00:00Z' \
    --data-urlencode 'end=2024-01-02T00:00:00Z'
# ⚠️ 走审批

# 查删除请求
curl http://loki:3100/loki/api/v1/delete
```

## 七、常见问题

### Q1: Promtail 一直 "context deadline exceeded"
- Loki ingestion rate limit 撞了 → 调 `limits_config.ingestion_rate_mb`
- 网络问题
- Loki 重启 / 不健康

### Q2: 日志延迟到 Loki 数小时
- promtail positions 文件丢了，从头读历史日志
- ingestion 限速触发，promtail 在 backoff
- chunk_idle_period 太长（默认 30m），刚写的日志要等 flush

### Q3: 查询超时 / OOM
- 时间范围太大 + label 选择器太宽
- LogQL `unwrap` / `quantile_over_time` 在大数据集上算力高
- 加 `--query-timeout=5m`

### Q4: 高基数 label 报错
- "too many active streams" / "max streams per user reached"
- 看 promtail 配置里有没有把 IP / uuid / 时间戳当 label

## 路径速查表

| 内容 | 路径 |
|------|------|
| Loki 数据 | `path_prefix: /loki`（默认）下 chunks / index / boltdb-shipper |
| Promtail positions | 配置 `positions.filename`（默认 `/var/lib/promtail/positions.yaml`） |
| 配置 | `/etc/loki/loki.yml` + `/etc/promtail/promtail.yml` |
| API | `:3100`（Loki HTTP） / `:9080`（Promtail metrics） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm -rf /loki` / loki path_prefix | 删全部日志数据（不可恢复，除非 S3 backed） |
| 改 `retention_period: 0` | 不保留任何日志 |
| `curl -X POST .../delete` | 触发删除特定 stream（生产慎用） |
| 把高基数字段（trace_id / uuid）当 label | 性能崩 + ingester OOM |
| schema 版本切换 | 老数据可能读不到（按 from 时间切，**老 chunks 永远走老 schema**，切换要谨慎） |

## 教训

- **label 不要超过 10 个**且基数 < 1000；trace_id 等永远放正文。
- Loki 不是 ELK 替代品 —— **不做全文索引**，按 label 缩小范围后再 grep；查 PB 级历史日志 Elastic 更快。
- 生产用 **S3/MinIO 后端**：本地 fs 备份难、扩展难、磁盘满会让 ingester 拒绝写入。
- promtail positions 文件**必须持久化**（不放 tmpfs），否则重启从头读历史日志，ingester 撞限速。
- Grafana 里用 Loki 做日志告警有用，但**严肃告警还是走 Prometheus + alertmanager**；日志只是侧证。
- 推荐应用日志输出 **JSON 结构化**，配 promtail `| json` stage，查询体验 10x 提升。
- "loki Forbidden" 多半是 `auth_enabled: true` 但 promtail 没传 `X-Scope-OrgID` header。

---
