---
name: nodejs-pm2
description: Node.js 部署速查 —— nvm/fnm 版本管理 + PM2 进程守护 + ecosystem 配置 + cluster 模式 + 日志。
触发词: node, nodejs, npm, pnpm, yarn, pm2, nvm, fnm, ecosystem, cluster mode, node 进程守护, node 部署, npm install, pm2 logs, node 22, node lts, 装 node, 装 npm, 装 pnpm, node 起不来, node 挂了, node 内存泄漏, pm2 重启, pm2 reload, pm2 起不来, 零停机部署, ecosystem.config, package.json, npm 慢, npm 镜像, registry 镜像, taobao npm, npmmirror, corepack, node 服务挂了, node 进程没了, node 占内存, node 爆内存
dangerous_commands:
  - '(?i)\bpm2\s+(?:delete|del)\s+all\b'
  - '(?i)\bpm2\s+(?:kill|reset)\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.pm2|/root/\.pm2)(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.nvm|node_modules)(?:\s|/|$)'
  - '(?i)\bpm2\s+(?:stop|delete|del)\s+all\b'
---

# nodejs-pm2 —— Node.js 部署运维

适用：用户部署 Node 应用；想"装 node"/"切版本"/"用 pm2 守护进程"/"日志在哪"/"内存泄漏"/"零停机部署"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看 pm2 进程列表 / 应用状态** → 不需要 sudo（pm2 在用户态）：`ssh_exec(server, "pm2 jlist")`（JSON 输出，比 `pm2 list` 表格好解析）或 `ssh_exec(server, "pm2 status")`。若用 systemd 托管则 `service_status(server, "<app>")`（任何档位放行）。
- **看应用日志** → `tail_log(server, "~/.pm2/logs/<app>-error.log")` / `tail_log(server, "~/.pm2/logs/<app>-out.log")`（任何档位放行，比 `pm2 logs` 实时流稳）；ecosystem 自定义了 `error_file`/`out_file` 就读那个路径。
- **查端口被谁占** → `port_check(server, 3000)`（看 Node 端口监听）。
- **看内存/磁盘**（pm2 日志撑爆磁盘很常见）→ `system_info(server)` + `disk_usage(server, "~/.pm2/logs")`。
- **改 ecosystem.config.js / systemd unit** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell 转义坑），写完再 `ssh_exec ... pm2 reload` / `sudo systemctl daemon-reload`。
- ⚠️ pm2 在用户态的 `restart`/`reload`/`logs` 多数**不需要 sudo**，能直接点出；但 `pm2 startup`、`systemctl daemon-reload/restart`、装全局包 `npm install -g` 含 `sudo` 的会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## 第一步：Node 版本管理

不要用包管理器装 Node（apt/dnf 版本太老）；用 nvm / fnm / Volta：

### nvm

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
# 重新登录或 source ~/.bashrc

nvm install --lts                                # 装最新 LTS
nvm install 20                                   # 装 v20.x 最新
nvm install 18.19.0                              # 精确版本
nvm use 20
nvm alias default 20
nvm ls                                           # 已装版本
nvm ls-remote --lts                              # 可装版本
```

### fnm（Rust 实现，比 nvm 快得多）

```bash
curl -fsSL https://fnm.vercel.app/install | bash
fnm install --lts
fnm use 20
fnm default 20
```

### corepack（管理 pnpm / yarn 版本）

```bash
corepack enable                                  # Node 16.10+ 内置
corepack prepare pnpm@9.0.0 --activate
corepack prepare yarn@4.0.0 --activate
```

## 第二步：包管理

```bash
npm install                                      # 按 package-lock.json
npm ci                                           # **生产推荐**：严格按 lock + 不修改
npm install --omit=dev                           # 仅 production deps
npm install --save-exact <pkg>                   # 精确版本（不带 ^）
npm prune --production                           # 删 dev deps
npm outdated
npm audit
npm audit fix

# pnpm（推荐：磁盘省 + 速度快）
pnpm install --frozen-lockfile                   # 等同 npm ci
pnpm install --prod
pnpm store prune                                 # 清 store

# yarn 4
yarn install --immutable
```

## 第三步：PM2 基础

### 装

```bash
npm install -g pm2
# 或 pnpm
pnpm add -g pm2
```

### 常用命令

```bash
pm2 start app.js --name myapp
pm2 start app.js --name myapp -i max             # cluster 模式（按 CPU 核数）
pm2 start app.js --name myapp -i 4               # 4 个 worker
pm2 list                                          # 进程列表
pm2 status
pm2 logs myapp                                   # 实时日志
pm2 logs myapp --lines 200
pm2 logs --err                                   # 仅错误
pm2 monit                                        # 交互式监控

pm2 restart myapp
pm2 reload myapp                                  # 零停机（cluster 模式才有意义）
pm2 stop myapp
pm2 delete myapp
pm2 describe myapp                                # 详情（pid / args / cwd / env）

pm2 save                                         # 保存当前进程列表
pm2 startup                                      # 生成开机启动脚本（**重启后进程自动恢复**）
pm2 unstartup
pm2 resurrect                                    # 手工恢复上次 save 的进程列表
```

### Ecosystem 文件（推荐生产用）

```js
// ecosystem.config.js
module.exports = {
    apps: [
        {
            name: 'myapp',
            script: './dist/main.js',
            cwd: '/opt/myapp',
            instances: 'max',                  // 'max' / 整数 / 1
            exec_mode: 'cluster',              // 'cluster' / 'fork'
            watch: false,                       // 生产关
            max_memory_restart: '1G',           // 超 1G 自动重启
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
            env_production: {
                NODE_ENV: 'production',
            },
            error_file: '/var/log/myapp/error.log',
            out_file: '/var/log/myapp/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            time: true,
            merge_logs: true,
            kill_timeout: 5000,                 // SIGTERM 后等 5s 再 SIGKILL
            wait_ready: true,                   // 等 process.send('ready')
            listen_timeout: 10000,
        }
    ]
};
```

```bash
pm2 start ecosystem.config.js --env production
pm2 reload ecosystem.config.js --env production    # 零停机更新
```

## 第四步：Cluster 模式

`exec_mode: cluster` + `instances: N` = pm2 拉起 N 个 worker（Node cluster 模块），共享端口，按 round-robin 负载。

```js
// app.js 不需要改 —— PM2 自动用 cluster 模块
// 但要支持 graceful shutdown：
process.on('SIGTERM', async () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000);   // 兜底
});

// 配合 wait_ready: true
process.send && process.send('ready');
```

## 第五步：零停机部署

```bash
# 用 reload（cluster 模式有效）—— 逐个重启 worker，保持端口被监听
pm2 reload myapp

# 应用：把代码 cp / git pull 到部署目录 → npm ci/pnpm install --prod → reload
cd /opt/myapp
git pull --ff-only
pnpm install --frozen-lockfile --prod
pm2 reload ecosystem.config.js --env production
```

> ⚠️ `pm2 restart` 是先 stop 再 start（**有停机时间**），不是 reload。

## 第六步：日志管理

```bash
pm2 logs --lines 500
pm2 logs myapp --raw                             # 不带 PM2 前缀
pm2 flush                                        # 清所有日志（⚠️ 走审批）
pm2 reloadLogs                                   # 给应用发 SIGUSR2 让它重开 log fd（配 logrotate）

# 让 pm2 配合 logrotate
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 100M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD
```

日志路径：

| 类型 | 默认位置 |
|------|---------|
| stdout | `~/.pm2/logs/<app>-out.log` |
| stderr | `~/.pm2/logs/<app>-error.log` |
| PM2 自己 | `~/.pm2/pm2.log` |

ecosystem 里指定的 `out_file` / `error_file` 覆盖默认。

## 第七步：内存泄漏 / 性能诊断

```bash
# 实时
pm2 monit

# Heap snapshot
node --inspect=0.0.0.0:9229 app.js               # 然后 chrome://inspect 接入
# 远端：先 ssh 隧道
ssh -L 9229:127.0.0.1:9229 user@host

# 触发 GC（V8 暴露）
node --expose-gc app.js                          # 应用里 global.gc()

# Clinic.js（套件）
npm install -g clinic
clinic doctor -- node app.js                     # 诊断
clinic flame -- node app.js                      # 火焰图
clinic bubbleprof -- node app.js                 # 异步分析
```

## 第八步：systemd 替代 / 配合

PM2 自带 `pm2 startup` 生成 systemd unit；也可以**完全用 systemd**（不用 pm2）：

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Node App
After=network.target

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/opt/myapp
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/myapp/dist/main.js
Restart=on-failure
RestartSec=5
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

systemd 优点：与系统 logging / cgroups 一体；缺点：没 cluster 自动负载，多 worker 要自己 nginx 反代。

## 路径速查表

| 内容 | 路径 |
|------|------|
| PM2 全局数据 | `~/.pm2/`（含 logs / pids / dump.pm2） |
| PM2 进程列表（用于 resurrect） | `~/.pm2/dump.pm2` |
| nvm | `~/.nvm/` |
| fnm | `~/.local/share/fnm/` |
| node 二进制（nvm） | `~/.nvm/versions/node/v20.x.x/bin/node` |
| npm 全局包 | `~/.nvm/versions/node/v20.x.x/lib/node_modules/` 或 `~/.npm-global/` |
| pnpm store | `~/.local/share/pnpm/store/` |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `pm2 delete all` / `pm2 kill` | 删所有 pm2 管理的应用 / 杀 pm2 主进程 |
| `pm2 reset` | 重置 pm2（计数 / metadata） |
| `rm -rf ~/.pm2` | 删 pm2 状态 + 日志 + dump |
| `rm -rf node_modules` 然后无 lock 文件 | 重装拿到新版本，**可能引入 breaking change** |
| `npm install <pkg>@latest` 生产 | 不锁版本，CI 一次绿不代表下次还绿 |
| `pm2 flush` 生产高峰 | 删日志（事后排查没材料） |
| `pm2 startup` 配错用户 | 开机用 root 跑应用（**安全风险**） |

## 教训

- 用 `npm ci` / `pnpm install --frozen-lockfile` 而**不是** `npm install`，确保 CI 与生产装的是**一字不差**的 lock 内容。
- PM2 cluster 模式 reload 是**逐个 worker 重启 + 等新 worker ready**；这要求应用支持优雅 shutdown（处理 SIGTERM）+ readiness 通知（process.send('ready')）。
- `instances: 'max'` 在容器里**会算错**（默认拿宿主 CPU 数），用整数显式指定。
- 日志默认在 `~/.pm2/logs/` —— **磁盘满了多半是这里**；装 `pm2-logrotate` 自动切。
- `max_memory_restart: '1G'` 是兜底，不是替代 leak 排查；持续被重启 = 应该查 heap snapshot。
- 不要在容器里同时跑 PM2 + cluster —— **容器一个进程一个应用**，扩展靠 K8s replica / docker compose scale。
- nvm 在 zsh / bash 里启动慢（每次 source 都跑很多东西），切 fnm 启动快 10x。

---
