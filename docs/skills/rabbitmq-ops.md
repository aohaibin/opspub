---
name: rabbitmq-ops
description: RabbitMQ 运维 —— rabbitmqctl / management UI / queue / exchange / vhost / cluster / 监控。
触发词: rabbitmq, rabbitmqctl, amqp, queue, exchange, vhost, federation, shovel, dlx, dead letter, 死信队列, 消息队列, rabbitmq cluster, rabbitmq 4, rabbitmq 装, 装 rabbitmq, 部署 rabbitmq, 消息堆积, 消费跟不上, 消费慢, 队列积压, queue 堆积, ready 太多, ack 太慢, 集群脑裂, network partition, mirror queue, quorum queue, streams, management plugin, 15672, prefetch, 消息丢失, amqp 1.0, rabbitmq 挂了, rabbitmq 起不来, mq 连不上, 队列消费不动, 消息发不出去
dangerous_commands:
  - '(?i)\brabbitmqctl\s+(?:purge_queue|delete_queue|delete_vhost|reset|force_reset)\b'
  - '(?i)\brabbitmqctl\s+stop_app\b'
  - '(?i)\brabbitmqctl\s+forget_cluster_node\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/rabbitmq(?:\s|/|$)'
---

# rabbitmq-ops —— RabbitMQ 运维

适用：用户用 RabbitMQ 做消息队列；想"消费跟不上"/"queue 堆积"/"集群脑裂"/"加 vhost / user"/"配死信"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 RabbitMQ 优先用 `install_app(server, "rabbitmq")`**（在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 broker 服务状态 | `service_status(server, "rabbitmq-server")` | systemctl status |
| 看日志 | `tail_log(server, "/var/log/rabbitmq/rabbit@<host>.log")` | tail -n |
| 查 AMQP / 管理端口 | `port_check(server, 5672)` / `port_check(server, 15672)` | ss -tlnH |
| 改配置 | `sftp_read` 看现状 + `sftp_write(server, "/etc/rabbitmq/rabbitmq.conf", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，写完 `ssh_exec sudo systemctl restart rabbitmq-server`；后文 `rabbitmqctl` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ 几乎所有 `rabbitmqctl` 写操作（add/delete user、set_permissions、purge_queue、reset、改配置后 restart）都含 `sudo` 或属危险命令 → **触发用户审批**。执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试，改只读探查（`list_queues`/`status`）或问用户。

## 第一步：状态总览

```bash
sudo rabbitmqctl status                          # 单节点状态
sudo rabbitmqctl cluster_status                  # 集群拓扑
sudo rabbitmqctl node_health_check               # 健康检查
sudo rabbitmqctl list_users
sudo rabbitmqctl list_vhosts
sudo rabbitmqctl list_queues --vhost / name messages consumers
sudo rabbitmqctl list_exchanges
sudo rabbitmqctl list_bindings
sudo rabbitmqctl list_connections
sudo rabbitmqctl list_channels
sudo rabbitmqctl list_consumers
```

`list_queues` 高频字段：

```bash
sudo rabbitmqctl list_queues --vhost / \
    name messages messages_ready messages_unacknowledged consumers state
```

| 字段 | 含义 |
|------|------|
| `messages` | 总消息数 = ready + unacked |
| `messages_ready` | 待投递 |
| `messages_unacknowledged` | 已投递未 ack |
| `consumers` | 消费者数 |
| `state` | running / flow / idle |

## 第二步：Management UI / API

```bash
# 启用 management 插件（一次）
sudo rabbitmq-plugins enable rabbitmq_management
# 默认 http://host:15672/  (admin/admin 默认账号 — **必改**)

# REST API
curl -u admin:pass http://host:15672/api/overview | jq
curl -u admin:pass http://host:15672/api/queues | jq '.[] | {name, messages, consumers}'
curl -u admin:pass -X POST http://host:15672/api/queues/%2F/myqueue/get \
    -H 'Content-Type: application/json' \
    -d '{"count":5,"ackmode":"ack_requeue_false","encoding":"auto"}'   # 取 5 条不重新入队（**消费数据**）
```

`%2F` = URL 编码的 `/`（默认 vhost）。

## 第三步：用户 / vhost / 权限

```bash
sudo rabbitmqctl add_user appuser '<pass>'
sudo rabbitmqctl set_user_tags appuser administrator    # 或 monitoring / management
sudo rabbitmqctl add_vhost /app
sudo rabbitmqctl set_permissions -p /app appuser ".*" ".*" ".*"      # configure, write, read
sudo rabbitmqctl change_password appuser '<new>'
sudo rabbitmqctl delete_user appuser

# 列权限
sudo rabbitmqctl list_permissions -p /app
sudo rabbitmqctl list_user_permissions appuser
```

## 第四步：Queue / Exchange 操作

```bash
# Queue
sudo rabbitmqctl purge_queue -p /app myqueue              # ⚠️ 清空队列消息
sudo rabbitmqctl delete_queue -p /app myqueue             # ⚠️ 删 queue
sudo rabbitmqctl set_policy -p /app HA '^ha\.' '{"ha-mode":"all"}'     # 镜像策略
sudo rabbitmqctl list_policies -p /app
sudo rabbitmqctl clear_policy -p /app HA
```

UI 上手动操作更直观；命令行优势：批量 / CI / 备份恢复。

## 第五步：消息堆积排查

```bash
# 找堆积 top
sudo rabbitmqctl list_queues --vhost /app name messages_ready messages_unacked \
    | sort -k2 -n -r | head -20
```

常见原因：

1. **消费者挂了**：`list_consumers` 看通道是不是空的；`list_connections` 看应用断开
2. **消费速度慢**：消费者代码慢 / DB 写慢；加并发 / 优化下游
3. **prefetch 太小**：消费者一次只拿 1 条 + 网络延迟拖死吞吐；调 `basicQos(prefetch=100)` 之类
4. **死信队列堆积**：业务报错重试无限循环；看 DLX 配置
5. **flow control** 触发：`state=flow` —— 内存/磁盘到阈值，broker 主动减慢生产者

## 第六步：死信交换机（DLX）

```bash
# 给 queue 配置死信目的地
sudo rabbitmqctl set_policy -p /app DLX '^orders\.' \
    '{"dead-letter-exchange":"dlx", "dead-letter-routing-key":"failed"}'
```

或在 queue 声明时（应用层）：

```python
channel.queue_declare(queue='orders', arguments={
    'x-dead-letter-exchange': 'dlx',
    'x-dead-letter-routing-key': 'failed',
    'x-message-ttl': 60000,     # 60s 后过期进 DLX
})
```

## 第七步：集群

```bash
# 节点 1 起好后，节点 2 加入：
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset                          # ⚠️ 清本地状态
sudo rabbitmqctl join_cluster rabbit@node1
sudo rabbitmqctl start_app

# 拓扑查看
sudo rabbitmqctl cluster_status

# 移除节点
sudo rabbitmqctl stop_app
sudo rabbitmqctl reset
sudo rabbitmqctl start_app
# 在仍存活的节点上：
sudo rabbitmqctl forget_cluster_node rabbit@deadnode    # ⚠️ 走审批
```

### Quorum Queues（强烈推荐生产用）

3.8+ 起的新一代镜像队列，基于 Raft，**自动选主、不会脑裂**：

```python
channel.queue_declare(queue='orders', durable=True, arguments={'x-queue-type': 'quorum'})
```

老的 mirrored queue（policy `ha-mode`）官方推荐迁移到 quorum。

## 第八步：监控指标

Prometheus exporter 内置（3.8+）：

```bash
sudo rabbitmq-plugins enable rabbitmq_prometheus
# http://host:15692/metrics
```

关键指标：

| 指标 | 关注阈值 |
|------|---------|
| `rabbitmq_queue_messages_ready` | 持续涨 = 消费跟不上 |
| `rabbitmq_queue_messages_unacknowledged` | 持续涨 = 消费者 hang |
| `rabbitmq_node_disk_free` | < 1GB 触发 flow control |
| `rabbitmq_node_mem_used` | 接近 mem limit 触发 flow control |
| `rabbitmq_connections_opened_total` | 异常涨 = 消费者频繁重连 |
| `rabbitmq_channels` | 不应无限增长（应用 channel 泄漏） |

## 第九步：配置文件

```ini
# /etc/rabbitmq/rabbitmq.conf
listeners.tcp.default = 5672
management.tcp.port = 15672

# 资源限制（防 OOM）
vm_memory_high_watermark.relative = 0.6        # 内存 60% 触发 flow
disk_free_limit.relative = 2.0                 # 留 2x 内存的磁盘
```

```bash
sudo systemctl restart rabbitmq-server          # 改配置要 restart（reload 不够）
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 主配置 | `/etc/rabbitmq/rabbitmq.conf` |
| 环境 | `/etc/rabbitmq/rabbitmq-env.conf` |
| Erlang cookie | `/var/lib/rabbitmq/.erlang.cookie`（**集群所有节点必须一致 + chmod 400**） |
| 数据 | `/var/lib/rabbitmq/mnesia/` |
| 日志 | `/var/log/rabbitmq/` |
| Plugins | `rabbitmq-plugins list` |
| UI | `http://host:15672` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rabbitmqctl purge_queue` | 清空队列消息（**不可恢复**） |
| `rabbitmqctl delete_queue` | 删 queue（消息全部丢） |
| `rabbitmqctl delete_vhost` | 删 vhost + 下属所有 queue / exchange / 用户 binding |
| `rabbitmqctl reset` | 重置节点（**所有数据丢**） |
| `rabbitmqctl force_reset` | 同上但忽略前置检查 |
| `rabbitmqctl forget_cluster_node` 错节点 | 集群拓扑破坏 |
| `stop_app` 不 start_app | 节点暂停服务 |
| 改 erlang cookie 但其他节点没改 | 集群成员认证失败 |
| `rm -rf /var/lib/rabbitmq` | **删全部 broker 状态** |

## 教训

- **生产用 quorum queue** 不要再用 mirrored queue —— 后者出问题（split brain / 同步慢）几乎是无解的。
- erlang cookie 不一致是新手集群最常见的错；首次安装时**第一件事**就是 `scp` cookie 到所有节点 + `chmod 400`。
- management UI 默认 admin/admin 凭据**必改** —— OpsPub 敏感库会自动捕获，但用户初装时多半还没接 OpsPub。
- queue 堆积时**先看消费者**：`list_consumers` 看 channel 数 / unacked 数；多半是消费者卡死不是 broker 慢。
- `purge_queue` 是核武器：误清 = 业务数据全丢；除非用 DLX 死信再消费一遍。
- 跨数据中心：**不要用集群**（节点间要求低延迟），用 federation / shovel 单向同步。
- mem watermark 触发 flow control 后，生产者会被 throttle，**不是报错**；监控里看到 producer publish rate 突降 = 多半 flow control。

---
