---
name: prometheus-grafana
description: Prometheus + Grafana + node_exporter + Alertmanager 速查 —— 部署 / scrape / 告警规则 / dashboard 导入 / 存储压缩。
触发词: prometheus, promql, grafana, alertmanager, node_exporter, exporter, scrape, 监控, 告警, dashboard, recording rule, alerting rule, tsdb, blackbox, cadvisor, prometheus 3, grafana 11, grafana 12, victoriametrics, mimir, thanos, 装 prometheus, 装 grafana, 部署监控, 配监控, 加告警, 加监控, 收集指标, scrape failed, target down, 告警发不出, smtp 告警, 钉钉告警, 飞书告警, 企业微信告警, webhook 告警, 监控面板, dashboard 导入, grafana 打不开, grafana 登不上, 面板没数据, 没数据, 指标没了, 监控挂了, prometheus 占地方, prometheus 磁盘满
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:/var/lib/prometheus|/data/prometheus|/prometheus)(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?[~/\w.-]*grafana\.db\b'
  - '(?i)\bcurl\b[^\n]*-X\s+POST\s+[^\n]*/-/quit\b'
  - '(?i)\bcurl\b[^\n]*-X\s+POST\s+[^\n]*/api/v1/admin/tsdb/delete_series\b'
---

# prometheus-grafana —— 监控体系

适用：用户报"想加监控"/"机器卡了不知道为啥（缺指标）"/"配 grafana dashboard"/"写告警规则"/"prometheus 占地方"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装监控栈优先用 `install_app(server, "grafana-stack")`**（OpsPub 应用商店里有 Prometheus+Grafana 栈）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 prometheus / grafana 状态 | `service_status(server, "prometheus")` / `service_status(server, "grafana-server")` | systemctl status |
| 查端口（9090 Prom / 3000 Grafana / 9093 AM / 9100 node_exporter / 9115 blackbox） | `port_check(server, 9090)` 等 | ss -tlnH |
| 看 tsdb 占多少磁盘（最常见"占地方"诉求） | `disk_usage(server, "<tsdb 数据目录>")` | df -hT |
| 看 prometheus / grafana 日志 | `tail_log(server, "<日志路径>")`，或容器走 `ssh_exec docker logs` | tail -n |
| 改 prometheus.yml / rules / alertmanager.yml / grafana.ini | `sftp_read` 看现状 + `sftp_write` 整文件写 | 直接编辑 |

这些只读工具**任何策略档位都放行**。改配置走 `sftp_read`+`sftp_write`（无 shell heredoc 转义坑），写完用 `ssh_exec curl -X POST .../-/reload`（需 `--web.enable-lifecycle`）或重启容器生效。后文 `curl` / `amtool` / `docker` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 重启服务 / 删 series / 改 retention 等写操作会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## 一、Prometheus 部署

### Docker compose（最小可用监控栈）

```yaml
version: "3"
services:
  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--storage.tsdb.retention.time=30d'
      - '--storage.tsdb.retention.size=20GB'
      - '--web.enable-lifecycle'           # 让 reload API 可用
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./rules:/etc/prometheus/rules:ro
      - prom-data:/prometheus
    ports: ["9090:9090"]

  alertmanager:
    image: prom/alertmanager:latest
    restart: unless-stopped
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
    ports: ["9093:9093"]

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: <强密码>
      GF_SECURITY_ADMIN_USER: admin
    volumes:
      - grafana-data:/var/lib/grafana
    ports: ["3000:3000"]

  node-exporter:
    image: prom/node-exporter:latest
    restart: unless-stopped
    pid: host
    network_mode: host
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'

volumes:
  prom-data:
  grafana-data:
```

### prometheus.yml（最小）

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: prod
    region: cn-beijing

rule_files:
  - /etc/prometheus/rules/*.yml

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

scrape_configs:
  - job_name: prometheus
    static_configs:
      - targets: ['localhost:9090']

  - job_name: node
    static_configs:
      - targets: ['10.0.0.1:9100', '10.0.0.2:9100', '10.0.0.3:9100']

  - job_name: mysql
    static_configs:
      - targets: ['10.0.0.10:9104']      # mysqld_exporter

  # 服务发现示例（Docker）
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
    relabel_configs:
      - source_labels: [__meta_docker_container_label_prom_port]
        target_label: __port__
```

### reload / 健康

```bash
# 改了 prometheus.yml / rules
curl -X POST http://localhost:9090/-/reload         # 需要 --web.enable-lifecycle

# 健康
curl http://localhost:9090/-/healthy                # 200 OK
curl http://localhost:9090/-/ready                  # 200 = ready 接收查询

# 配置查看
curl http://localhost:9090/api/v1/status/config
```

## 二、常用 Exporter

| 监控对象 | Exporter | 端口 |
|---------|---------|------|
| Linux 系统 | **node_exporter** | 9100 |
| Windows | windows_exporter | 9182 |
| Docker | cadvisor | 8080 |
| MySQL/MariaDB | mysqld_exporter | 9104 |
| PostgreSQL | postgres_exporter | 9187 |
| Redis | redis_exporter | 9121 |
| MongoDB | mongodb_exporter | 9216 |
| Nginx | nginx-prometheus-exporter | 9113 |
| RabbitMQ | rabbitmq_exporter | 9419 |
| JMX (Java) | jmx_exporter（agent 注入） | 自选 |
| 黑盒（HTTP/ICMP 探测） | blackbox_exporter | 9115 |

### blackbox（HTTP/Ping 探活）

```yaml
- job_name: blackbox_http
  metrics_path: /probe
  params:
    module: [http_2xx]
  static_configs:
    - targets:
        - https://example.com
        - https://api.example.com/health
  relabel_configs:
    - source_labels: [__address__]
      target_label: __param_target
    - source_labels: [__param_target]
      target_label: instance
    - target_label: __address__
      replacement: blackbox:9115
```

## 三、PromQL 速查

```promql
# 基础
up                                       # 各 target 是否存活（1/0）
up == 0                                  # 挂掉的
node_load1                               # 1 分钟 load

# Rate / 速率（counter 转 per-second）
rate(http_requests_total[5m])
sum(rate(http_requests_total[5m])) by (status_code)

# QPS / 错误率
sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))

# Histogram p99
histogram_quantile(0.99, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))

# CPU 使用率（node_exporter）
100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100)

# 内存使用率
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100

# 磁盘使用率
(1 - node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes) * 100

# Top N
topk(10, container_memory_usage_bytes)

# 同比 / 环比
rate(http_requests_total[5m]) / rate(http_requests_total[5m] offset 1h)
```

## 四、告警规则

```yaml
# rules/node.yml
groups:
  - name: node
    interval: 30s
    rules:
      - alert: NodeDown
        expr: up{job="node"} == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Node {{ $labels.instance }} is down"
          description: "{{ $labels.instance }} unreachable for 2 min"

      - alert: HighCPU
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 85
        for: 10m
        labels: { severity: warning }
        annotations:
          summary: "{{ $labels.instance }} CPU > 85%"

      - alert: DiskAlmostFull
        expr: (node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes) * 100 < 10
        for: 5m
        labels: { severity: critical }
        annotations:
          summary: "{{ $labels.instance }} {{ $labels.mountpoint }} < 10% free"
```

### Recording Rule（预算化重查询）

```yaml
groups:
  - name: recordings
    interval: 30s
    rules:
      - record: job:http_requests:rate5m
        expr: sum by (job) (rate(http_requests_total[5m]))
```

## 五、Alertmanager

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: default
  group_by: [alertname, cluster]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: [severity=critical]
      receiver: oncall

receivers:
  - name: default
    webhook_configs:
      - url: http://feishu-webhook.example.com/

  - name: oncall
    webhook_configs:
      - url: http://feishu-webhook.example.com/oncall
    # 或邮件
    email_configs:
      - to: oncall@example.com
        from: alert@example.com
        smarthost: smtp.example.com:587
        auth_username: alert@example.com
        auth_password: xxx
```

```bash
amtool check-config alertmanager.yml         # 语法
amtool alert query --alertmanager.url=http://localhost:9093
amtool silence add alertname=NodeDown -d 1h -a "alice" -c "维护中"
```

## 六、Grafana

```bash
# 重置 admin 密码（容器停时跑）
docker exec -it grafana grafana-cli admin reset-admin-password <new>

# 导入 dashboard
# UI：+ → Import → 输入 dashboard ID（如 1860 = Node Exporter Full）
# 或上传 JSON
```

### 数据源

UI 「Configuration → Data sources → Add data source → Prometheus」，URL 填 `http://prometheus:9090`，Access 选 Server (default)。

### 路径

| 内容 | 路径（容器内） |
|------|---------------|
| 配置 | `/etc/grafana/grafana.ini` |
| 数据库 | `/var/lib/grafana/grafana.db`（默认 SQLite） |
| Plugins | `/var/lib/grafana/plugins/` |
| Provisioning | `/etc/grafana/provisioning/`（datasource / dashboard yaml） |

### Provisioning（dashboard as code）

```yaml
# /etc/grafana/provisioning/dashboards/default.yml
apiVersion: 1
providers:
  - name: 'file'
    folder: ''
    type: file
    options:
      path: /var/lib/grafana/dashboards

# 把 dashboard.json 放进 /var/lib/grafana/dashboards/
```

## 七、存储压缩 / 磁盘控制

```bash
du -sh /var/lib/docker/volumes/prom-data/_data/
```

参数控制：

```
--storage.tsdb.retention.time=30d        # 时间
--storage.tsdb.retention.size=20GB       # 大小（任一触发就清）
--storage.tsdb.min-block-duration=2h
--storage.tsdb.max-block-duration=2h     # 与 min 相等 = 禁压缩（推荐配 Thanos 时）
```

删除特定 series（**不可恢复**）：

```bash
# 需要 --web.enable-admin-api
curl -X POST -g 'http://localhost:9090/api/v1/admin/tsdb/delete_series?match[]=expensive_metric{job="dev"}'
curl -X POST http://localhost:9090/api/v1/admin/tsdb/clean_tombstones
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| Prometheus 配置 | `/etc/prometheus/prometheus.yml` |
| 规则 | `/etc/prometheus/rules/*.yml` |
| 数据 | `--storage.tsdb.path`（默认 `/prometheus` 或 `/var/lib/prometheus`） |
| Alertmanager 配置 | `/etc/alertmanager/alertmanager.yml` |
| Grafana 数据库 | `/var/lib/grafana/grafana.db` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm -rf /var/lib/prometheus` / `/prometheus` data | **删全部历史指标**，事后没法回看 |
| `rm grafana.db` | 删 grafana dashboard / users / api keys / data sources |
| `curl -X POST .../-/quit` | 优雅停 prometheus；生产应该用 systemctl / docker |
| `curl -X POST .../api/v1/admin/tsdb/delete_series` | 删特定指标 series（**不可恢复**） |
| `--storage.tsdb.retention.size=1MB` 误改 | 历史指标几乎全清 |
| 大量改 `external_labels` | 与 federation/Thanos 集成时会**完全失配**告警和查询 |

## 教训

- 第一天就**配 alertmanager + 至少一条 NodeDown 告警** —— 没有告警的监控等于摆设。
- `for: <duration>` 字段必加（5m+ 推荐），否则**抖动告警**会刷屏 oncall。
- node_exporter 用 `network_mode: host` 比挂 /proc /sys 干净（部分 metrics 才能拿到）。
- 告警规则 yaml **走 git**：人工 UI 改完出事故没法追溯。
- 高基数 label（每条 metric 上 trace_id / uuid）会让 prometheus 内存爆炸；**label cardinality 是头号性能杀手**。
- Grafana dashboard ID 1860 (Node Exporter Full) / 7362 (MySQL) / 11835 (Redis) 几乎是标配，**别从零画**。
- 长期保留（数月/年）用 Thanos / VictoriaMetrics / Mimir 后端，**别让 prometheus 自己存**。

---
