---
name: docker-ps
description: docker 容器排障速查 —— 状态/日志/资源/网络/磁盘清理/compose。
触发词: docker, 容器, container, docker ps, 容器挂了, docker logs, 镜像, docker compose, dockerd, 容器互通, 502 容器, oom, docker 起不来, docker 报错, 容器起不来, 容器启动失败, container 报错, docker 重启, 镜像拉不到, 镜像下载, pull 镜像, restarting, 一直重启, docker 27, docker 28, dockerhub 镜像加速, daemon.json, registry-mirrors, image pull backoff, errimagepull, 装 docker, 装 docker compose, docker compose down, docker compose up -d, 磁盘满了, /var/lib/docker, docker 占空间, docker system df, docker prune, 数据卷, named volume, 匿名卷, bind mount, 容器内时区, tz asia, ulimit, 容器内存限制, oomkilled, exit 137, exit 1
dangerous_commands:
  - '(?i)\bdocker\s+system\s+prune\s+-a\b[^\n]*--volumes\b'
  - '(?i)\bdocker\s+rm\s+-f\s+\$\(\s*docker\s+ps\s+-aq\s*\)'
  - '(?i)\bdocker\s+(?:volume|network)\s+rm\b[^\n]*\$\(\s*docker\s+(?:volume|network)\s+ls\b'
  # compose down -v 连同 named volume 一起删 = 数据库数据直接没（正文第六步危险项）
  - '(?i)\bdocker(?:\s+compose|-compose)\s+down\b[^\n]*(?:\s-v\b|--volumes\b)'
  # volume prune 清掉所有未挂载卷（停服期间的卷也算未挂载）
  - '(?i)\bdocker\s+volume\s+prune\b[^\n]*(?:--all\b|-a\b)'
  - '(?:^|[\s;&|])(?:kill|killall)\s+-9\s+dockerd?(?:\s|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/docker(?:\s|/|$)'
---

# docker-ps —— docker 容器排障速查

适用：用户报"容器起不来"/"接口 502 但服务在跑"/"磁盘满了不知道谁占的"/"容器互通有问题"/"compose 起了一半"。

## 🤖 第零步：优先用 OpsPub 专用工具

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 docker daemon 是否在跑 | `service_status(server, "docker")` | systemctl status docker |
| 看磁盘（镜像/卷占地） | `disk_usage(server, "/var/lib/docker")` | df -hT |
| 看容器映射端口被谁占 | `port_check(server, 端口)` | ss -tlnH |
| 看容器日志文件 | `tail_log(server, "/var/lib/docker/containers/<id>/<id>-json.log")` | tail -n |
| 改 daemon.json / compose | `sftp_read` 看现状 + `sftp_write` 整文件写 | cat / 编辑器 |

这些只读工具**任何策略档位都放行**（含 readonly 档）；改 `daemon.json` / `docker-compose.yml` 走 `sftp_read`+`sftp_write`（无 shell 转义坑），写完 `ssh_exec systemctl reload docker` / `docker compose up -d`。

⚠️ `docker ps` / `docker logs` / `docker inspect` 是只读判定，但 `docker rm` / `docker stop` / `docker compose down` / `prune` 等是写操作，会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。
注：很多机器用户在 `docker` 组里，docker 命令本身不需 `sudo`；但停容器/删卷仍受策略档位约束。

## 第一步：容器状态

```bash
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

| Status | 含义 |
|--------|------|
| `Up X minutes` | 在跑 |
| `Exited (0)` | 正常退出 |
| `Exited (137)` | OOM 被 kill（看 `dmesg | grep -i killed`） |
| `Exited (1)` | 应用自杀 |
| `Exited (139)` | 段错误 |
| `Restarting (N)` | 起不来在重试 N 次 |
| `Paused` | 被 `docker pause` |

## 第二步：看日志

```bash
docker logs --tail 200 --timestamps <容器名>
docker logs --since 10m <容器名>
docker logs -f --tail 50 <容器名>           # 实时跟
docker logs <容器> 2>&1 | grep -i error    # stderr 合并 + 过滤
```

OOM 看 `dmesg | grep -i "killed process"`，会有 oom-killer 命中的 PID 和命令名。

> ⚠️ `docker logs` 看不到东西 = 应用日志写到了文件而不是 stdout/stderr → exec 进去看 `/var/log/...`

## 第三步：资源占用

```bash
docker stats --no-stream                   # 一次性快照
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
docker top <容器>                          # 容器内进程树
docker system df                           # 磁盘谁占的：images / containers / volumes / build-cache
docker system df -v                        # 详细每个 image/volume 占用
```

## 第四步：进容器排查

```bash
docker exec -it <容器名> sh                # alpine
docker exec -it <容器名> bash              # debian/ubuntu
docker exec <容器名> ps aux                # 不进交互 shell 直接看进程
docker exec <容器名> cat /etc/hostname
docker exec <容器名> netstat -tlnp        # 需要 net-tools
docker exec <容器名> ss -tlnp             # 现代发行版
```

`/proc/<pid>/limits` 看资源限制；`/etc/resolv.conf` 看 DNS。

## 第五步：网络

```bash
docker network ls
docker network inspect bridge
docker network inspect <network-name>
docker inspect <容器名> | jq '.[0].NetworkSettings'    # 容器 IP / 端口映射 / 网络名
```

容器间不通的常见原因：

1. 没在同一个 user-defined network（默认 bridge 不支持容器名互访，只有自建网络才行）
2. 用了 `network_mode: host` 但端口被宿主占了
3. iptables/firewalld 拦了 bridge
4. compose 的 `depends_on` 不会等服务真正就绪（只等容器启动），应用没重试

## 第六步：Docker Compose

```bash
cd <project-with-compose>
docker compose ps                          # 项目内容器状态
docker compose logs --tail=100 <服务>      # 看某服务日志
docker compose logs -f                     # 跟所有服务
docker compose config                      # 解析后的完整 compose（带变量展开）
docker compose up -d                       # 起所有
docker compose up -d <服务>                # 起单个
docker compose restart <服务>              # 重启某服务
docker compose down                        # 停 + 删容器/网络（**保留** volume）
docker compose down -v                     # ⚠️ 同时删 volume，数据丢
```

## 第七步：磁盘清理（注意要确认）

```bash
# 1) 先评估
docker system df

# 2) 安全的清理（按风险递增）
docker container prune              # 清停掉的容器（交互确认）
docker image prune                  # 清 dangling 镜像（无 tag 中间层）
docker image prune -a               # 清未使用的镜像（更狠）
docker network prune                # 清没用的网络
docker builder prune                # 清 buildx 构建缓存
docker volume prune                 # 清没挂载的 volume（数据可能丢！）

# 3) 核武器（**不要**手抖）
docker system prune -a --volumes    # 上面全部一锅端
```

## 第八步：镜像构建上下文

```bash
docker build -t myapp:latest .              # 当前目录为构建上下文
docker build -t myapp:latest -f /path/Dockerfile <ctx>
docker buildx build --platform=linux/amd64,linux/arm64 -t myapp:multi .

# 构建慢、context 大 → 检查 .dockerignore（不在里面的全部 tar 进 daemon）
du -sh .                            # 当前目录大小
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| daemon 配置 | `/etc/docker/daemon.json` |
| Docker 数据 | `/var/lib/docker/`（containers / volumes / image / overlay2 都在这） |
| compose 文件 | 项目内 `docker-compose.yml` / `compose.yml` |
| Dockerfile | 项目内（路径 `-f` 指定） |
| 1Panel 应用 | `/opt/1panel/apps/<app>/<container>/docker-compose.yml` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `docker system prune -a --volumes` | 清未使用镜像 + 未挂载 volume（**数据丢失风险**），先 `docker system df` 评估 |
| `docker rm -f $(docker ps -aq)` | 强删所有容器（包括正在跑的） |
| `docker volume rm $(docker volume ls -q)` | 删全部 volume，**数据库数据可能直接消失** |
| `docker network rm $(docker network ls -q)` | 删全部网络（含 bridge），容器全部断网 |
| `kill -9 dockerd` | 强杀 daemon，跑着的容器会被遗弃成 zombie |
| `rm -rf /var/lib/docker` | 删全部 docker 数据，**重启 daemon 后所有镜像/容器/volume 消失** |

## 教训

- 任何 `docker system prune -a --volumes` 前必须先 `docker system df` 评估影响 + 确认 volume 都已挂载到外部存储或备份。
- 容器 OOM 多半是没设 `--memory`/`--memory-swap` + 应用内存泄漏；先加监控再加限制。
- compose 起的服务"一直 Restarting" = 看 `docker compose logs <服务>`，多半是依赖（数据库）还没起好但应用没有重试逻辑；`depends_on` 只保证容器启动顺序，不保证应用就绪。
- 端口映射写了但访问不通 = 容器内服务监听 127.0.0.1 而不是 0.0.0.0 → 改应用配置（不是 nginx 也不是 docker 的问题）。
- 容器 healthcheck 失败导致 `(unhealthy)` 状态但应用其实在跑 = 多半是 healthcheck 命令本身错（如检查的 endpoint 路径变了）。

---
