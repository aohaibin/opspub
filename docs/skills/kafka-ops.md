---
name: kafka-ops
description: Kafka 运维速查 —— topic / consumer group / lag / KRaft 模式 / partition rebalance。
触发词: kafka, 消息队列, kafka topic, consumer group, lag, 消费者组, kraft, zookeeper, partition, replication factor, isr, kafka-console, kafka 装, 装 kafka, 部署 kafka, kafka 3.x, kraft 模式, 抛弃 zk, kafka-topics, kafka-consumer-groups, kafka-configs, 消费滞后, lag 太大, 消费阻塞, rebalance, partition reassignment, 副本同步, isr 缩小, controller, broker 起不来, broker 失联, kafka ui, redpanda, kafka 挂了, kafka 连不上, 消费堆积, 消息消费不动
dangerous_commands:
  - '(?i)\bkafka-topics(?:\.sh)?\b[^\n]*--delete\b'
  - '(?i)\bkafka-consumer-groups(?:\.sh)?\b[^\n]*--reset-offsets\b[^\n]*--execute\b'
  - '(?i)\bkafka-consumer-groups(?:\.sh)?\b[^\n]*--delete\b'
  - '(?i)\bkafka-configs(?:\.sh)?\b[^\n]*--delete-config\b[^\n]*\bretention\b'
  # kafka-storage format 在已有集群上重跑 = 重格式化 KRaft 元数据日志，整个集群元数据丢失
  - '(?i)\bkafka-storage(?:\.sh)?\s+format\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:/var/lib/kafka|/data/kafka|/kafka)(?:\s|/|$)'
---

# kafka-ops —— Kafka 运维

适用：用户运维 Apache Kafka；想"消费者 lag 大"/"加 topic"/"看分区/副本/ISR"/"切到 KRaft 抛弃 ZK"/"备份/迁移"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Kafka 优先用 `install_app(server, "kafka")`**（Kafka 在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run`/`compose` 仅作教学 / 自定义场景 fallback（手装的**不进台账、工作台看不到**）。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 broker 服务状态 | `service_status(server, "kafka")` | systemctl status |
| 看 broker 日志 | `tail_log(server, "<kafka-home>/logs/server.log")` | tail -n |
| 查 broker / controller 端口 | `port_check(server, 9092)` / `port_check(server, 9093)` | ss -tlnH |
| 改 server.properties | `sftp_read` 看现状 + `sftp_write(server, "/etc/kafka/server.properties", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，写完 `ssh_exec sudo systemctl restart kafka`；后文 `kafka-*.sh` 命令仅在工具不够用时走 `ssh_exec`。

⚠️ topic / consumer-group / configs 的写操作（create/delete/alter、reset-offsets、reassign）和 restart 会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试，改只读探查（`--list`/`--describe`）或问用户。

## 第一步：环境

CLI 工具一般在 `<kafka>/bin/`，命令名以 `kafka-*.sh` 或 `kafka-*`（Confluent 包）。

```bash
# 给 bin/ 加入 PATH（按实际路径改）
export PATH=$PATH:/opt/kafka/bin
kafka-topics.sh --version
```

参数约定：

```bash
BOOTSTRAP=--bootstrap-server localhost:9092
```

## 第二步：Topic

```bash
# 列
kafka-topics.sh $BOOTSTRAP --list

# 详情（副本/ISR/分区）
kafka-topics.sh $BOOTSTRAP --describe --topic mytopic

# 创建
kafka-topics.sh $BOOTSTRAP --create --topic mytopic \
    --partitions 6 --replication-factor 3 \
    --config retention.ms=604800000 \
    --config segment.bytes=1073741824

# 改配置
kafka-configs.sh $BOOTSTRAP --alter \
    --entity-type topics --entity-name mytopic \
    --add-config retention.ms=259200000

# 加分区（**只能加不能减**）
kafka-topics.sh $BOOTSTRAP --alter --topic mytopic --partitions 12

# 删除（要 broker 配置 delete.topic.enable=true；默认 true）
kafka-topics.sh $BOOTSTRAP --delete --topic mytopic     # ⚠️ 走审批
```

### Topic 关键配置

| 配置 | 默认 | 含义 |
|------|------|------|
| `retention.ms` | 7d | 保留时长 |
| `retention.bytes` | -1 | 按大小保留（任一触发） |
| `segment.bytes` | 1GB | 单 segment 文件大小 |
| `cleanup.policy` | `delete` / `compact` | 过期删除 / key-based 压缩 |
| `min.insync.replicas` | 1 | 写入需要的最小 ISR（保证 durability） |
| `unclean.leader.election.enable` | false（推荐） | 是否允许不 in-sync 的副本选主（**生产关**） |

## 第三步：Producer / Consumer 测试

```bash
# 生产
kafka-console-producer.sh $BOOTSTRAP --topic mytopic
> 输入消息按回车

# 消费（从头）
kafka-console-consumer.sh $BOOTSTRAP --topic mytopic --from-beginning

# 消费指定 group
kafka-console-consumer.sh $BOOTSTRAP --topic mytopic --group mygroup
```

## 第四步：Consumer Group / Lag

```bash
# 列所有 group
kafka-consumer-groups.sh $BOOTSTRAP --list

# 详情：lag / offset / current consumer
kafka-consumer-groups.sh $BOOTSTRAP --describe --group mygroup
# CURRENT-OFFSET / LOG-END-OFFSET / LAG / CONSUMER-ID / HOST

# 删 group（仅当无活跃消费者）
kafka-consumer-groups.sh $BOOTSTRAP --delete --group oldgroup

# Reset offset（⚠️ 走审批；改消费位点 = 重消费 / 跳过消息）
kafka-consumer-groups.sh $BOOTSTRAP --reset-offsets \
    --group mygroup --topic mytopic \
    --to-earliest --execute             # 从头
    # 或 --to-latest / --to-datetime '2024-01-01T00:00:00.000' / --shift-by -1000
```

> Lag 持续涨 = 消费跟不上：① 加并发（增分区 + 消费者实例） ② 优化消费者代码 ③ 网络 / 反序列化 / 下游 DB 瓶颈。

## 第五步：Broker / Cluster

```bash
# 看 broker 列表（KRaft / ZK 模式都行）
kafka-metadata-shell.sh --snapshot /tmp/kraft-controller-logs/__cluster_metadata-0/00000000000000000000.log
# 或 zookeeper（ZK 模式）
zookeeper-shell.sh localhost:2181 ls /brokers/ids

# broker 配置
kafka-configs.sh $BOOTSTRAP --describe --entity-type brokers --entity-name 0
kafka-configs.sh $BOOTSTRAP --alter --entity-type brokers --entity-name 0 \
    --add-config log.cleaner.dedupe.buffer.size=536870912

# 分区状态（看 leader / ISR）
kafka-topics.sh $BOOTSTRAP --describe --topic __consumer_offsets
```

### ISR（In-Sync Replicas）

```bash
# 列 under-replicated（ISR < replica.factor）
kafka-topics.sh $BOOTSTRAP --describe --under-replicated-partitions

# 列没有 preferred leader 的（重启后偏离）
kafka-topics.sh $BOOTSTRAP --describe --under-min-isr-partitions

# 平衡 leader（让 preferred leader 重新当选）
kafka-leader-election.sh $BOOTSTRAP --election-type PREFERRED --all-topic-partitions
```

## 第六步：Partition reassignment（扩缩容）

```bash
# 1) 列出要重新分配的 topic
cat > topics.json <<EOF
{"topics":[{"topic":"mytopic"}], "version":1}
EOF

# 2) 生成 plan（给新 broker list）
kafka-reassign-partitions.sh $BOOTSTRAP --generate \
    --topics-to-move-json-file topics.json \
    --broker-list "1,2,3,4"
# 把 proposed 部分存为 reassign.json

# 3) 执行
kafka-reassign-partitions.sh $BOOTSTRAP --execute --reassignment-json-file reassign.json

# 4) 监控进度
kafka-reassign-partitions.sh $BOOTSTRAP --verify --reassignment-json-file reassign.json
```

> ⚠️ reassignment 会**复制大量数据**到新 broker，会饱和网络与磁盘 —— 用 `--throttle 50000000`（B/s）限速。
>
> 临时 plan 文件（`topics.json` / `reassign.json`）建议落 OpsPub 统一工作区 `~/.opspub/tmp/`，别散落在当前目录或 `/tmp`；执行用的脚本放 `~/.opspub/scripts/`，便于审计回溯。

## 第七步：KRaft 模式（去 ZooKeeper）

3.3+ KRaft 已 production-ready；4.0 起强制 KRaft。

```bash
# 格式化 storage（一次性）
kafka-storage.sh format -t <cluster-id> -c /etc/kafka/kraft/server.properties

# 启动（同 broker）
kafka-server-start.sh /etc/kafka/kraft/server.properties

# 拓扑查看
kafka-metadata-shell.sh --snapshot /var/lib/kafka/__cluster_metadata-0/*.log
```

`server.properties` 关键参数：

```properties
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@host1:9093,2@host2:9093,3@host3:9093
listeners=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
inter.broker.listener.name=PLAINTEXT
controller.listener.names=CONTROLLER
log.dirs=/var/lib/kafka/kraft-logs
```

## 第八步：备份 / 迁移

| 方案 | 用途 |
|------|------|
| **MirrorMaker 2** | 跨集群复制（DR / 迁移） |
| **kafka-dump-log.sh** | 导出 segment 内容（调试，不是备份） |
| **Confluent Replicator** | 企业版 |
| **文件系统快照** | 不推荐（要 broker 停） |

### MirrorMaker 2 一键

```bash
# mm2.properties
clusters = src, dst
src.bootstrap.servers = src-kafka:9092
dst.bootstrap.servers = dst-kafka:9092
src->dst.enabled = true
src->dst.topics = .*

connect-mirror-maker.sh mm2.properties
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 二进制 | `<kafka-home>/bin/` |
| 配置 | `<kafka-home>/config/server.properties` 或 `/etc/kafka/server.properties` |
| 数据 (log.dirs) | `/var/lib/kafka/` / `/data/kafka/` |
| 日志 | `<kafka-home>/logs/` |
| ZooKeeper 数据（ZK 模式） | `/var/lib/zookeeper/` |
| systemd | `kafka` / `confluent-kafka` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `kafka-topics --delete` | 删 topic + 数据（取决于 delete.topic.enable） |
| `kafka-consumer-groups --reset-offsets --execute` | **重新消费 / 跳过消息**，业务影响巨大 |
| `kafka-configs --delete-config retention.*` 然后默认 7d | 数据被加速过期清掉 |
| `rm -rf` log.dirs | 删 broker 数据（**所有数据丢**） |
| `unclean.leader.election.enable=true` 加上突发故障 | 选出 out-of-sync 副本当 leader（**数据丢**） |
| `min.insync.replicas=1` 同时 acks=all | 等于 acks=1，单点失效就丢数据 |
| 误删 `__consumer_offsets` 内置 topic | 所有 consumer group 状态丢 |
| reassignment 不限速 | 网络饱和，业务延迟飙升 |

## 教训

- **生产**：`min.insync.replicas=2` + `replication.factor=3` + `acks=all` —— durability 与可用性的甜点。
- **永远不要开** `unclean.leader.election.enable=true`，宁可暂时不可写也不丢数据。
- 分区数 = 消费者并发上限（一个 partition 只能被 group 内一个 consumer 消费）；规划期就把 partition 设足，**事后只能加不能减**。
- `reset-offsets` 是核武器，做之前**停消费者** + 在测试环境演练过 + 保留备份位点。
- KRaft 模式起来后**记住 cluster-id**（kafka-storage format 输出的）：恢复 / 加新节点都要用它。
- `__consumer_offsets` 是内置 topic，**不要删**；它存所有 consumer group 的 offset。
- MirrorMaker 2 跨集群同步**默认带 group offset 翻译**，DR 切换业务方零感知。

---
