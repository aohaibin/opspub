---
name: git-server
description: 自建 Git 服务器速查 —— Gitea / GitLab CE / Gogs 安装/备份/恢复/hook/SSH/迁移。
触发词: gitea, gitlab, gitlab-rake, gogs, 自建 git, git 服务器, git push 失败, gitlab 备份, gitea 备份, ssh-key, ci runner, forgejo, gitea actions, gitea 1.22, gitea 1.23, gitlab ee, gitlab ce, gitlab omnibus, 装 gitea, 装 gitlab, 部署 git 服务, git 仓库, internal git, git 克隆失败, git push 大文件, lfs, gitlab webhook, gitea webhook, gitlab 起不来, gitea 挂了, git 服务连不上, gitlab reconfigure, post-receive, git hook
dangerous_commands:
  - '(?i)\bgitlab-rake\s+gitlab:backup:restore\b'
  - '(?i)\bgitlab-rake\s+gitlab:cleanup:'
  - '(?i)\bgitlab-rails\s+console\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/opt/gitlab(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/(?:var/lib/gitea|opt/gitea)(?:\s|/|$)'
  # 直接删服务端裸库存储目录 = 仓库 + 全部提交历史不可恢复
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+\S*/git/repositories(?:\s|/|$)'
  # 在服务端 git data 目录里写/改 hooks（post-receive 等）= 每次 push 注入任意代码
  - '(?:^|[\s;&|])(?:vi|vim|nano|tee|cp|mv)\s+\S*/hooks/(?:post-receive|pre-receive|update)\b'
---

# git-server —— 自建 Git 服务器

适用：自建 Gitea / GitLab CE / Gogs；想"装一个内网 git"/"备份/迁移"/"用户管理"/"配 webhook"/"配 CI runner"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Gitea 优先用 `install_app(server, "gitea")`**（Gitea 在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker compose` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。GitLab CE / Gogs 目录里没有 → 仍按下面手动装。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看服务状态（包安装） | `service_status(server, "gitea")` / `service_status(server, "gitlab-runsvdir")` | systemctl status |
| 看 Web / SSH 端口 | `port_check(server, 3000)` / `port_check(server, 2222)` / `port_check(server, 80)` | ss -tlnH |
| 看日志 | `tail_log(server, "/data/gitea/log/gitea.log")` / `tail_log(server, "/var/log/gitlab/gitlab-rails/production.log")` | tail -n |
| 改配置 | `sftp_read` 看现状 + `sftp_write(server, "/data/gitea/conf/app.ini" 或 "/etc/gitlab/gitlab.rb", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，Gitea 写完 `ssh_exec sudo systemctl restart gitea`，GitLab 写完 `ssh_exec sudo gitlab-ctl reconfigure`；docker 部署看容器日志走 `ssh_exec docker logs`。

⚠️ 备份/恢复、`gitlab-ctl reconfigure/restart`、`gitlab-rake`、删数据目录、改 hooks 都会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

> 🔴 **hooks 安全**：服务端裸库的 `hooks/post-receive`（及 `pre-receive` / `update`）每次 push 都以 git 用户身份执行——能写它 = 能在每次推送时注入任意代码（挖矿 / 反弹 shell / 篡改提交）。Gitea/GitLab 自带的 hook 由应用管理，**不要手改裸库 hooks**；自定义需求走 Gitea 的「Git Hooks」管理页或 GitLab 的 server hooks 规范目录，并审查脚本来源。

## 选型对照

| 工具 | 资源占用 | 功能 | 适合 |
|------|---------|------|------|
| **Gitea**（Go） | 100MB+ 内存 | Issue / PR / Actions / Package / Wiki | **首选**：内网/小团队/树莓派都能跑 |
| **Gogs**（Go，Gitea 前身） | 100MB+ | 基础够用 | 极小资源；Gitea 已是事实标准 |
| **GitLab CE**（Ruby） | 4GB+ 内存 | 全家桶（CI / Container Registry / Wiki / Pages / Issues） | 企业；资源充足；需要 GitLab Runner |
| **GitLab Omnibus 容器** | 同上 | 同上 | 想要 GitLab 但又懒得手装组件 |
| **Forgejo**（Gitea fork） | 类 Gitea | 同 Gitea + 社区治理 | Gitea 担心商业化的可选项 |

## 一、Gitea

### 安装（推荐 docker compose）

```yaml
# docker-compose.yml
version: "3"
services:
  gitea:
    image: gitea/gitea:latest
    restart: unless-stopped
    environment:
      USER_UID: 1000
      USER_GID: 1000
      GITEA__database__DB_TYPE: postgres
      GITEA__database__HOST: db:5432
      GITEA__database__NAME: gitea
      GITEA__database__USER: gitea
      GITEA__database__PASSWD: xxx
    volumes:
      - ./data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    ports:
      - "3000:3000"        # web
      - "2222:22"          # ssh（**主机的 22 多半被 sshd 占了，外露另一个端口映射进去**）
    depends_on: [db]
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: gitea
      POSTGRES_DB: gitea
      POSTGRES_PASSWORD: xxx
    volumes:
      - ./postgres:/var/lib/postgresql/data
```

### 路径

| 内容 | 路径 |
|------|------|
| 主配置 | `/data/gitea/conf/app.ini`（容器）/ `/etc/gitea/app.ini`（包安装） |
| 仓库存储 | `/data/git/repositories/` |
| LFS | `/data/git/lfs/` |
| 数据库 | 外置 postgres 或自带 sqlite `/data/gitea/gitea.db` |
| 日志 | `/data/gitea/log/` 或容器 stdout |

### 备份 / 恢复

```bash
# 容器内
docker exec -u git gitea gitea dump -c /data/gitea/conf/app.ini -t /tmp -f /tmp/gitea-backup.zip
docker cp gitea:/tmp/gitea-backup.zip ./

# 恢复
docker exec -u git gitea unzip -d /tmp/restore /tmp/gitea-backup.zip
# 然后 cp repos、db restore、app.ini 替换；具体步骤看官方 doc
```

简单粗暴：**直接 tar 整个 data 目录** + dump postgres，恢复时换回去就行（前提：版本一致）。

### CLI 管理

```bash
docker exec -it gitea su git -c 'gitea admin user create --username admin --password xxx --email a@b.com --admin'
docker exec -it gitea su git -c 'gitea admin user change-password --username admin --password newxxx'
docker exec -it gitea su git -c 'gitea admin user list'
docker exec -it gitea su git -c 'gitea doctor'      # 一致性检查
```

### Gitea Actions（GitHub Actions 兼容）

容器化 runner：

```bash
docker run -d --name gitea-runner \
    -e GITEA_INSTANCE_URL=http://gitea:3000 \
    -e GITEA_RUNNER_REGISTRATION_TOKEN=<token> \
    -e GITEA_RUNNER_NAME=runner-1 \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v ./runner-data:/data \
    gitea/act_runner:latest
```

Token 在 Gitea UI「Site Administration → Actions → Runners」生成。

## 二、GitLab CE

### 安装（Omnibus 包，主机直装）

```bash
# Debian/Ubuntu
curl -sS https://packages.gitlab.com/install/repositories/gitlab/gitlab-ce/script.deb.sh | sudo bash
sudo EXTERNAL_URL="https://gitlab.example.com" apt install gitlab-ce

# 初始化完成后 root 初始密码在
sudo cat /etc/gitlab/initial_root_password
```

### 容器化（docker compose）

```yaml
services:
  gitlab:
    image: gitlab/gitlab-ce:latest
    hostname: gitlab.example.com
    restart: unless-stopped
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://gitlab.example.com'
        gitlab_rails['gitlab_shell_ssh_port'] = 2222
    ports:
      - "80:80"
      - "443:443"
      - "2222:22"
    volumes:
      - ./config:/etc/gitlab
      - ./logs:/var/log/gitlab
      - ./data:/var/opt/gitlab
    shm_size: 256m
```

### 配置 reconfigure

```bash
sudo vim /etc/gitlab/gitlab.rb          # 改配置
sudo gitlab-ctl reconfigure             # 应用（每次都跑）
sudo gitlab-ctl restart                 # 重启所有组件
sudo gitlab-ctl status                  # 各组件状态
sudo gitlab-ctl tail nginx              # 实时日志
sudo gitlab-ctl tail puma               # 应用层
```

### 备份 / 恢复

```bash
# 备份（写到 /var/opt/gitlab/backups/）
sudo gitlab-backup create

# 配置文件不在备份里 —— **必须单独备份**（落 OpsPub 统一工作区，别散落 /backup 等臆造路径）
sudo tar czf ~/.reeve/backups/gitlab-config-$(date +%F).tar.gz /etc/gitlab

# 恢复（⚠️ 走审批）
# 1) 停 service
sudo gitlab-ctl stop unicorn      # 老版本
sudo gitlab-ctl stop puma         # 新版本
sudo gitlab-ctl stop sidekiq
# 2) 选备份文件名（不要带 _gitlab_backup.tar 后缀）
sudo gitlab-backup restore BACKUP=1701234567_2024_01_01_16.5.0
# 3) reconfigure + check
sudo gitlab-ctl reconfigure
sudo gitlab-rake gitlab:check SANITIZE=true
sudo gitlab-ctl restart
```

### 重置 root 密码

```bash
sudo gitlab-rake "gitlab:password:reset[root]"
```

### Runner 安装

```bash
# Linux
sudo curl -L --output /usr/local/bin/gitlab-runner https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64
sudo chmod +x /usr/local/bin/gitlab-runner
sudo useradd --comment 'GitLab Runner' --create-home gitlab-runner --shell /bin/bash
sudo gitlab-runner install --user=gitlab-runner --working-directory=/home/gitlab-runner
sudo gitlab-runner start

# 注册
sudo gitlab-runner register \
    --url https://gitlab.example.com/ \
    --token <runner_token> \
    --executor docker \
    --docker-image alpine:latest
```

## 三、SSH key 与仓库 URL

### 生成与上传

```bash
ssh-keygen -t ed25519 -C "you@host"
# 把 ~/.ssh/id_ed25519.pub 内容粘到 Gitea/GitLab UI 「SSH Keys」

# 测试
ssh -T git@gitea.example.com -p 2222     # Gitea 默认 22 改 2222
ssh -T git@gitlab.example.com -p 2222
```

### 仓库 URL

| 类型 | 格式 |
|------|------|
| HTTPS | `https://git.example.com/user/repo.git` |
| SSH（标准 22） | `git@git.example.com:user/repo.git` |
| SSH（非标端口） | `ssh://git@git.example.com:2222/user/repo.git` |

## 四、迁移

### Gitea → Gitea（不同实例）

UI 「Repository Migration」直接拉远端仓库（HTTPS / SSH / token）；含 Issues / PR / Releases / Wiki。

### GitHub → Gitea

Gitea 内置 GitHub migrator，UI 选「Migration → GitHub」+ token，能迁 issue/PR/star/watcher。

### 老 svn / hg → Git

```bash
git-svn clone <svn-url>     # svn
hg-fast-export -r <hg-repo>  # mercurial
```

## 五、常见问题

### Q1: clone 报 "Permission denied (publickey)"
- 公钥没上传 / 上传错账号
- SSH 端口不对（自建 Gitea 多半改了 2222）
- 客户端的 `~/.ssh/config` 没匹配上：
  ```
  Host gitea.example.com
      HostName gitea.example.com
      Port 2222
      User git
      IdentityFile ~/.ssh/id_ed25519_gitea
  ```

### Q2: push 大文件被拒
- 仓库限制：Gitea/GitLab 默认有单 push 大小限制（如 50MB）
- LFS：`git lfs install` + `git lfs track "*.bin"` → push

### Q3: GitLab 起不来 / reconfigure 失败
- `gitlab-ctl tail` 找具体哪个组件错（postgres / redis / unicorn-puma / sidekiq）
- 磁盘满：`df -h /var/opt/gitlab`
- 内存不够：4GB 是最低；2GB 多半起不来

### Q4: webhook 推不出去
- Gitea 默认禁止内网回环（防 SSRF）：`app.ini` 加 `[webhook] ALLOWED_HOST_LIST = *` 或具体 hostname
- 自签 HTTPS 证书：`SKIP_TLS_VERIFY = true`（**仅内网**）

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `gitlab-rake gitlab:backup:restore` 错文件 | **数据被覆盖**，老数据丢 |
| `gitlab-rake gitlab:cleanup:*` | 各种清理任务（孤儿 lfs / 旧 ci artifact） |
| `gitlab-rails console` | 直接 Ruby on Rails 控制台，可改任意数据 |
| `rm -rf /var/opt/gitlab` | 删 GitLab 数据（配置 + 仓库 + db） |
| `rm -rf /var/lib/gitea` 或 `/opt/gitea` | 同上 |
| `rm -rf .../git/repositories` | 删裸库存储 = 仓库 + 全部提交历史不可恢复 |
| 手改裸库 `hooks/post-receive` 等 | 每次 push 注入任意代码（**供应链投毒**） |
| 改 Gitea LFS 路径但没迁移老文件 | LFS 对象失踪 |
| `gitlab-ctl stop` 然后 reboot | 没启用 `enable=true` 的服务不会自动起 |

## 教训

- Gitea **数据目录就是全部**：备份 = tar 这个目录 + dump 数据库。恢复 = 反过来。简单到极致。
- GitLab 备份**不含配置文件**：必须单独备份 `/etc/gitlab/`，否则恢复后 `external_url` / 邮件配置 / runner 注册都丢。
- GitLab Omnibus 改完 `gitlab.rb` **必须 `gitlab-ctl reconfigure`**，不是 restart。
- Gitea Actions runner 与 GitLab Runner **隔离运行环境**：开 docker executor 一定限制 image 白名单，否则跑 `--privileged` 等于宿主 root。
- 改 SSH 端口时给老用户**留过渡期 + 邮件通知** —— 全公司同时 `git push` 失败是经典事故。
- 大型仓库 LFS 用对象存储（MinIO/S3）；放本地 fs 久了备份非常痛苦。

---
