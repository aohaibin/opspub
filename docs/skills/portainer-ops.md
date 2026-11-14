---
name: portainer-ops
description: Portainer 容器编排面板速查 —— endpoint / stacks / templates / 团队权限 / 备份恢复。
触发词: portainer, 容器面板, portainer agent, edge agent, portainer endpoint, portainer stack, portainer 备份, portainer 重置, agent token, portainer 起不来, portainer 登录不了, 忘了 admin 密码, portainer 重装, portainer ce, portainer business, 加 endpoint, 接节点, 远程 docker 管理, swarm 管理, portainer stack 部署, edge compute
dangerous_commands:
  - '(?:^|[\s;&|])docker\s+volume\s+rm\b[^\n]*portainer_data\b'
  - '(?:^|[\s;&|])docker\s+rm\s+-[fv]+\s+portainer\b'
  # flag 分开写（docker rm -f -v portainer）也要拦 —— -v 删卷 = portainer.db 全没
  - '(?:^|[\s;&|])docker\s+rm\b[^\n]*\s-v\b[^\n]*\bportainer\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/data/portainer(?:\s|/|$)'
---

# portainer-ops —— Portainer 面板运维

适用：用户用 Portainer 管理多 Docker 节点 / Swarm / K8s；想"装 portainer"/"忘了 admin 密码"/"加新 endpoint"/"备份"/"装 agent"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 docker 是否在跑**（portainer 是容器，daemon 挂了它也起不来）→ `service_status(server, "docker")`（任何档位放行）。
- **查面板/agent 端口** → `port_check(server, 9443)`（Web UI）/ `port_check(server, 9001)`（agent）。
- **看 portainer 容器日志** → `tail_log(server, "/var/lib/docker/containers/<id>/<id>-json.log")`，或 `ssh_exec docker logs --tail 200 portainer`（只读判定）。
- ⚠️ 装 portainer 的 `docker run`、`docker rm`、备份恢复、重置密码这些都是写操作，会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## ⛔ 装机：**禁止用 `install_with_secret`**（后端硬拒）

OpsPub 后端 `KIND_BLOCKLIST` 把 `portainer` 列在禁止列表（同 1panel/baota/aapanel）—— **理由**：Portainer **首次访问 https://<host>:9443 时由用户在浏览器创建 admin**，不接受外部传入的 username/password，你在 `public` 里塞的账号不会被识别，会原封不动写进 vault 误导用户。

**正确做法**：

1. 用 `ssh_exec` 跑下面第一步的 docker run 命令装 portainer
2. 告诉用户「打开 https://<host>:9443，**5 分钟内**创建第一个 admin 账号」（错过窗口要 `docker restart portainer` 重新打开）
3. 用户创建完账号后，**他自己**通过 OpsPub「服务凭据」页手动新增一条 portainer 凭据（kind 用通用的 `"web_admin"` 或 `"portainer"`，**不带 `_conn` 后缀**）—— 不要让 AI 替用户填密码

> 同理：用户问"装个 portainer" → AI 应该装 + 提示首次访问步骤，**绝不**自己生成密码塞过去；问"重置 admin 密码" → 见下方"忘密码"章节。

## 第一步：安装

### 单机（容器方式，最常见）

```bash
docker volume create portainer_data
docker run -d \
    --name portainer \
    --restart=unless-stopped \
    -p 9000:9000 -p 9443:9443 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v portainer_data:/data \
    portainer/portainer-ce:latest

# 访问 https://<host>:9443，**5 分钟内**创建第一个 admin 账号
# 错过 5 分钟需要重启容器再来：docker restart portainer
```

### 高可用 / Business（CE 也能扛中小规模）

- Swarm 模式部署在 manager 节点
- K8s 用 Helm chart：`helm install portainer portainer/portainer`

## 第二步：Endpoint（被管节点）

### 类型

| Endpoint type | 用途 | 接入方式 |
|---------------|------|---------|
| **Local Docker** | 安装 portainer 的本机 docker | 挂 `/var/run/docker.sock` 即可 |
| **Remote Docker (TCP)** | 远端 docker（要开 TCP 2375/2376） | 直接给 IP + 证书；**生产必开 TLS** |
| **Docker Agent** | 远端装 agent 容器 | 推荐（不需开 docker TCP 端口） |
| **Edge Agent** | 反向连接（远端主动连 portainer） | 适合公网穿透 / NAT 后节点 |
| **Kubernetes** | k8s cluster | kubeconfig / cluster role |

### Agent 安装（被管节点跑）

```bash
docker run -d \
    --name portainer_agent \
    --restart=always \
    -p 9001:9001 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /var/lib/docker/volumes:/var/lib/docker/volumes \
    portainer/agent:latest
```

然后在 Portainer UI 「Environments → Add environment → Docker Standalone → Agent」填 `<节点IP>:9001`。

### Edge Agent（节点主动连）

在 UI 创建 Edge environment 拿到 install 命令，到节点跑：

```bash
docker run -d \
    --name portainer_edge_agent \
    --restart=always \
    -e EDGE_ID=xxx \
    -e EDGE_KEY=xxx \
    portainer/agent:latest
```

## 第三步：Stack（compose 项目）

UI「Stacks → Add stack」，三种编辑方式：

1. **Web editor** — 粘贴 compose yaml
2. **Upload** — 上传 compose file
3. **Git repository** — 关联 git repo，**支持 webhook 自动重建**（GitOps）

```yaml
# 示例 stack
version: "3"
services:
  app:
    image: nginx:latest
    ports: ["8080:80"]
    environment:
      MY_VAR: ${MY_VAR}     # UI 里可填环境变量
```

Stack 操作：

- **Update** 不会停容器，按 compose 差异滚动
- **Stop / Start** 等同 `docker compose stop / start`
- **Delete** 删除 stack + **容器**；卷按 compose 设计保留或删

## 第四步：常用 admin 操作

### 备份

UI 「Settings → General → Backup」直接下载 tar.gz（含数据库 + 加密的所有节点凭据）。

CLI（容器跑）—— 备份产物统一落 OpsPub 工作区 `~/.reeve/backups`（别散落当前目录/`/tmp`）：

```bash
mkdir -p ~/.reeve/backups
docker run --rm -v portainer_data:/data alpine \
    tar czf - -C /data . > ~/.reeve/backups/portainer-backup-$(date +%F).tgz
```

### 恢复

```bash
docker stop portainer
docker run --rm -v portainer_data:/data -v $(pwd):/backup alpine \
    sh -c 'cd /data && rm -rf ./* && tar xzf /backup/portainer-backup.tgz'
docker start portainer
```

### 重置 admin 密码（忘了）

```bash
# 1) 停 portainer
docker stop portainer

# 2) 用临时 helper 容器删 admin 用户（portainer 重启会重新进入"创建第一个 admin"流程）
docker run --rm -v portainer_data:/data portainer/helper-reset-password

# 3) 启动并 5 分钟内访问 https://host:9443 重建 admin
docker start portainer
```

### 内置数据查看

```bash
docker exec -it portainer ls /data
# portainer.db = boltDB
# tls/ = 证书
# compose/ = stack git 缓存
```

## 第五步：团队 / 权限

Portainer 的 RBAC：

- **Users**：内置 / OAuth / LDAP
- **Teams**：用户组
- **Environments (endpoints)**：每个被管节点
- **Endpoint Access**：给 team 授权某 endpoint 的 Read-Only / Standard User / Operator / Endpoint Admin

非 admin 用户**默认看不到任何 endpoint**；要在 endpoint 设置里加 team / user。

## 第六步：常见问题

### Q1: agent 连不上 portainer
- agent 端口（9001）防火墙没开
- agent 启动了但 `docker logs portainer_agent` 报 "no tunnel"：网络不通 / Edge ID/KEY 错
- 重启 agent 容器后 portainer UI 仍显示 down → portainer 端口（9443/9000）反向连不到 agent

### Q2: stack update 失败 "image not found"
- compose 里 image 用了 latest 但 registry 没那个 tag
- 私有 registry：在 Portainer UI「Registries」加凭据再 update

### Q3: portainer 升级后 endpoint 状态都是 down
- agent 版本与 portainer 不匹配（major 版本要对齐）
- 升级 agent：`docker pull portainer/agent:latest && docker stop portainer_agent && docker rm portainer_agent && <重跑 run 命令>`

### Q4: 5 分钟创建 admin 错过了
- `docker restart portainer` 再次进入 5 分钟窗口
- 或 `--admin-password-file` 启动参数预设密码

## 路径速查表

| 内容 | 路径 |
|------|------|
| Portainer 数据 | volume `portainer_data` → `/var/lib/docker/volumes/portainer_data/_data/` |
| 主数据库 | `portainer.db`（BoltDB） |
| TLS | `tls/` 下 |
| Stack 缓存 | `compose/` |
| Web UI | `https://<host>:9443`（HTTPS） / `http://<host>:9000`（HTTP） |
| Agent 端口 | TCP 9001 |
| Edge agent 反向通道 | portainer 监听的端口（默认 8000） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `docker volume rm portainer_data` | **删 portainer 数据库**，所有 endpoint / user / stack 配置丢失 |
| `docker rm -fv portainer` | 同上（`-v` 带卷一起删） |
| `rm -rf /data/portainer` 或 volume 挂载源 | 同上 |
| 改 portainer 端口（9000/9443） + 防火墙不同步 | **管理员被锁外** |
| Stack Delete 含 volume 的 stack | 数据卷可能一起被删（按 compose 设计） |

## 卸载后清理 OpsPub 凭据登记

跑完真正的卸载（`docker rm -fv portainer && docker volume rm portainer_data`）后，**调一次 `delete_installed_service`** 把 OpsPub 这边登记的 portainer 凭据登记也清掉。

```
1. list_installed_services({ server: "<别名>" }) → 找 kind === "portainer" 的 id
2. （卸载远端）→ exit 0
3. delete_installed_service({ vaultId: "<上一步 id>" })
```

⚠️ 顺序：先卸再删；trusted 档 AI 自治，其他档暂为 denied → 让用户在「服务凭据」页手动删。

## 教训

- Portainer 的所有 endpoint **凭据/证书**都在 `portainer_data` volume 里加密存储，**这个卷必须备份**。
- 升级 portainer 前**先备份 volume**；升级后偶尔有 schema migration 失败的情况，回滚就靠备份。
- Edge agent **比 Docker TCP + TLS** 更安全（反向连接，不需要在节点开公网端口）。
- 不要给 standard user 直接看 docker.sock 级别的 endpoint —— UI 上能跑 `docker run --privileged` 就是宿主 root。
- Stack 用 Git repo 模式 + webhook 是最佳实践（更新就是 git push，自带审计）。
- 5 分钟 admin 创建窗口是**安全特性**，不是 bug；让别人偷跑了第一个 admin 等于服务器丢了。

---
