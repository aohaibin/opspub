---
name: jenkins-runner
description: Jenkins / GitLab Runner / Gitea Actions Runner 速查 —— 安装/节点注册/流水线调试/workspace 清理。
触发词: jenkins, jenkins agent, jenkins job, jenkinsfile, pipeline, gitlab runner, gitlab-runner, ci/cd, ci 流水线, cd 流水线, 持续集成, 持续交付, gitea runner, act runner, jenkins runner, artifact, workspace, jenkins lts, jenkins 装, 装 jenkins, 部署 jenkins, jenkins 起不来, jenkins 慢, jenkins 重启, 流水线失败, 构建失败, build failed, executor, 节点离线, runner 离线, runner 注册, runner 卸载, shared runner, group runner, project runner, jenkins 挂了, 构建一直失败, 作业卡住, 作业卡 pending, runner 连不上
# 注：去掉了 ci / cd 两字短词 —— evaluate_skills 是 substring 匹配，
# 用户消息里随便一段 `cd43c3dd` / `:32279/cd1234` 都会误命中
dangerous_commands:
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/lib/jenkins(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/var/jenkins_home(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/gitlab-runner(?:\s|/|$)'
  - '(?i)\bgitlab-runner\s+(?:unregister|uninstall)\b'
---

# jenkins-runner —— CI/CD 运行器运维

适用：用户自建 Jenkins / GitLab Runner / Gitea Actions Runner；想"装 runner"/"作业卡 pending"/"workspace 占地方"/"agent 离线"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Jenkins 优先用 `install_app(server, "jenkins")`**（在 OpsPub 应用商店目录里）——应用商店同款：进「容器/编排」台账、密码托管、容器规范命名、绑 127.0.0.1。下面的手动 `docker run` 仅作教学 / 自定义 fallback（手装的**不进台账、工作台看不到**）。Runner（gitlab-runner / gitea actions runner）目录里没有 → 仍按下面手动装。

| 要做什么 | 用这个工具 | 等价命令 |
|---------|-----------|---------|
| 看 Jenkins / Runner 服务状态 | `service_status(server, "jenkins")` / `service_status(server, "gitlab-runner")` | systemctl status |
| 看 Web / agent 端口 | `port_check(server, 8080)` / `port_check(server, 50000)` | ss -tlnH |
| 看 Runner 日志 | `tail_log(server, "/var/log/jenkins/jenkins.log")`（docker 部署用 `ssh_exec docker logs jenkins`） | tail -n / journalctl |
| 改 Runner 配置 | `sftp_read` 看现状 + `sftp_write(server, "/etc/gitlab-runner/config.toml", ...)` | 整文件写，无 shell 转义坑 |

这些只读工具**任何策略档位都放行**；改配置走 `sftp_read`+`sftp_write`，写完 `ssh_exec sudo gitlab-runner restart` / `sudo systemctl restart jenkins`；docker 部署的 Jenkins 看日志走 `ssh_exec docker logs jenkins`。

⚠️ runner 注册/注销、restart、删数据目录、清 workspace 都会触发**用户审批**——执行前先告诉用户"这步需要你在 OpsPub 批准"，被拒后不要原样重试。

## 选型

| 工具 | 配置方式 | 适合 |
|------|---------|------|
| **Jenkins** | Web UI + Jenkinsfile + Plugin 生态 | 老牌、插件多、流水线灵活；初次配置略重 |
| **GitLab Runner** | toml + GitLab CI yaml | GitLab 一体化；执行器选项多 |
| **Gitea Actions Runner** (act_runner) | yaml（GitHub Actions 兼容） | Gitea 内置；轻量 |
| **Drone** | yaml | 容器化简洁；社区版功能够 |
| **GitHub Actions self-hosted runner** | yaml | GitHub 用户首选 |

## 一、Jenkins

### 安装（推荐 Docker LTS）

```bash
docker volume create jenkins_home
docker run -d \
    --name jenkins \
    --restart=unless-stopped \
    -p 8080:8080 -p 50000:50000 \
    -v jenkins_home:/var/jenkins_home \
    -v /var/run/docker.sock:/var/run/docker.sock \
    jenkins/jenkins:lts
```

> 把 `docker.sock` 挂进去 = Jenkins job 可以跑 `docker` 命令（要装 docker CLI 插件 / 用 docker workflow plugin）。**安全风险**：任何 Jenkins job 都能拿宿主 root。

### 初始密码 & 路径

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

| 内容 | 路径 |
|------|------|
| 数据 / 配置 | `/var/jenkins_home/`（容器内） |
| Job 配置 | `/var/jenkins_home/jobs/<job>/config.xml` |
| 构建历史 | `/var/jenkins_home/jobs/<job>/builds/<n>/` |
| Workspace | `/var/jenkins_home/workspace/<job>/` |
| 用户 | `/var/jenkins_home/users/` |
| 凭据 | `/var/jenkins_home/credentials.xml` |
| 日志 | `docker logs jenkins` 或 `/var/jenkins_home/logs/` |

### 备份

```bash
# 简单：tar 整个 volume（落 OpsPub 统一工作区 ~/.reeve/backups，别散落随机目录）
docker run --rm -v jenkins_home:/src -v ~/.reeve/backups:/dst alpine \
    tar czf /dst/jenkins-$(date +%F).tgz -C /src .

# 推荐：装 ThinBackup / Configuration as Code (JCasC) 插件，定期跑 + 走 git
```

### 流水线（Jenkinsfile 声明式）

```groovy
pipeline {
    agent any
    environment {
        REGISTRY_CRED = credentials('docker-registry')   // 从凭据库取
    }
    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }
    stages {
        stage('Build') {
            steps {
                sh 'mvn clean package -DskipTests'
                archiveArtifacts artifacts: 'target/*.jar'
            }
        }
        stage('Test') {
            steps {
                sh 'mvn test'
            }
            post {
                always { junit 'target/surefire-reports/*.xml' }
            }
        }
        stage('Deploy') {
            when { branch 'main' }
            steps {
                sh '''
                    docker login -u $REGISTRY_CRED_USR -p $REGISTRY_CRED_PSW
                    docker build -t myrepo/app:$BUILD_NUMBER .
                    docker push myrepo/app:$BUILD_NUMBER
                '''
            }
        }
    }
    post {
        failure {
            mail to: 'oncall@example.com', subject: "Build ${env.BUILD_NUMBER} failed"
        }
    }
}
```

### Agent 节点

```bash
# 远端机器装 agent.jar + java（先在 Master UI 创建节点拿 secret）
curl -sO http://jenkins:8080/jnlpJars/agent.jar
java -jar agent.jar -url http://jenkins:8080/ -secret <secret> -name slave-1 -workDir /home/jenkins
```

或在 Docker 里跑 `jenkins/inbound-agent`（jnlp 模式）。

### CLI

```bash
JENKINS_URL=http://jenkins:8080
curl -sLO $JENKINS_URL/jnlpJars/jenkins-cli.jar
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> who-am-i
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> list-jobs
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> build <job> -p PARAM=value
java -jar jenkins-cli.jar -s $JENKINS_URL -auth admin:<api-token> safe-restart
```

## 二、GitLab Runner

### 安装

```bash
# Debian/Ubuntu
curl -L "https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh" | sudo bash
sudo apt install gitlab-runner

# 启动 / 状态
sudo systemctl status gitlab-runner
sudo gitlab-runner --version
```

### 注册

```bash
sudo gitlab-runner register \
    --non-interactive \
    --url "https://gitlab.example.com/" \
    --token "<runner_token>" \
    --executor "docker" \
    --docker-image "alpine:latest" \
    --description "my-runner" \
    --tag-list "docker,linux" \
    --run-untagged="false" \
    --locked="false"

# 也可以 shell / kubernetes / docker-autoscaler 等 executor
```

### 配置

```toml
# /etc/gitlab-runner/config.toml
concurrent = 5                              # 全 runner 并发上限
check_interval = 0
log_level = "info"

[[runners]]
  name = "my-runner"
  url = "https://gitlab.example.com/"
  token = "..."
  executor = "docker"
  [runners.docker]
    tls_verify = false
    image = "alpine:latest"
    privileged = false                      # ⚠️ 开了 = 容器内可拿宿主 root
    pull_policy = ["if-not-present"]
    volumes = ["/cache", "/var/run/docker.sock:/var/run/docker.sock"]
    shm_size = 0
  [runners.cache]
    Type = "s3"
    [runners.cache.s3]
      ServerAddress = "minio.example.com:9000"
      AccessKey = "xxx"
      SecretKey = "xxx"
      BucketName = "gitlab-runner-cache"
```

### 操作

```bash
sudo gitlab-runner list
sudo gitlab-runner verify                   # 验证所有 runner 与 GitLab 的连接
sudo gitlab-runner restart
sudo gitlab-runner unregister --name "my-runner"
sudo gitlab-runner --debug run              # 前台调试启动
```

### 路径

| 内容 | 路径 |
|------|------|
| 配置 | `/etc/gitlab-runner/config.toml` |
| 数据 | `/home/gitlab-runner/`（默认 user） |
| Build dir | `/builds/<group>/<repo>/<job>/` |
| 日志 | `journalctl -u gitlab-runner` |
| Cache | 按 cache 配置（local / s3） |

### `.gitlab-ci.yml`（最小）

```yaml
stages: [build, test, deploy]

variables:
  DOCKER_DRIVER: overlay2

build:
  stage: build
  tags: [docker]
  image: golang:1.22
  script:
    - go build -o app
  artifacts:
    paths: [app]
    expire_in: 1 week

test:
  stage: test
  tags: [docker]
  image: golang:1.22
  script:
    - go test ./...

deploy:
  stage: deploy
  tags: [docker]
  only: [main]
  script:
    - echo "deploy here"
```

## 三、Gitea Actions Runner（act_runner）

```bash
docker run -d --name gitea-runner \
    --restart=unless-stopped \
    -e GITEA_INSTANCE_URL=https://git.example.com \
    -e GITEA_RUNNER_REGISTRATION_TOKEN=<token> \
    -e GITEA_RUNNER_NAME=runner-1 \
    -e GITEA_RUNNER_LABELS=ubuntu-latest:docker://ubuntu:22.04,self-hosted \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v ./runner-data:/data \
    gitea/act_runner:latest
```

Workflow yaml 与 GitHub Actions 兼容（90%）：

```yaml
# .gitea/workflows/build.yml
name: Build
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: echo "hello $GITEA_ACTOR"
```

## 四、Workspace 清理

CI 系统 workspace 是占地方大头：

```bash
# Jenkins
docker exec jenkins du -sh /var/jenkins_home/workspace/*

# GitLab Runner
du -sh /home/gitlab-runner/builds/

# 清理（按需）
docker exec jenkins find /var/jenkins_home/workspace -mindepth 1 -maxdepth 1 -mtime +30 -exec rm -rf {} \;
```

Jenkins 推荐：每个 job 设置 `cleanWs()` post-step；保留构建数限制（Discard old builds）。

## 五、常见问题

### Q1: Jenkins agent 一直 offline
- master 与 agent 网络不通（50000 端口或 jnlp 端口）
- agent 节点 java 版本不匹配（11+ 推荐）
- agent.jar 版本与 master 不一致

### Q2: GitLab runner 作业卡 pending
- runner 没注册到这个项目（或注册了但 lock 了/tag 不匹配）
- `sudo gitlab-runner verify` 查
- 作业指定了 `tags: [docker]` 但 runner 没这个 tag

### Q3: Docker executor 报 "no space left on device"
- 宿主盘满 → `docker system df`
- 加大 runner cache 清理：`docker system prune -af` 加进 cron

### Q4: 构建很慢，每次都拉镜像
- `pull_policy = ["if-not-present"]` 让 runner 不重复拉
- 私有 registry pull-through proxy（如 Harbor）

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `rm -rf /var/jenkins_home` / `/var/lib/jenkins` | **删 Jenkins 全部 jobs / users / credentials / builds** |
| `rm -rf /etc/gitlab-runner` | 删 runner 配置（token / cache 配置丢） |
| `gitlab-runner unregister --all-runners` | 从 GitLab 取消所有 runner 注册 |
| Jenkins **凭据导出** | 含明文密码 / token / SSH key |
| docker executor `privileged = true` | 容器内 = 宿主 root（**慎开**，除非要构建容器内的容器） |
| 直接清空 workspace 而 job 还在跑 | 当前构建挂掉 |
| Jenkins Script Console | Groovy 控制台 = 直接进程内代码执行（**任何东西都能改**） |

## 教训

- Jenkins 备份**包含 secret**（含解密的私钥 / API token），保存策略 = 备份与 Jenkins 数据**同等级**保管。
- Jenkinsfile **走 git** 才有审计；Web UI 直接改的 freestyle job 出事故没法追溯。
- GitLab Runner `concurrent` 设太高 + 都是 docker executor = 一次性能把宿主磁盘 / 内存吃满。
- `privileged = true` 是**最后手段**；多数"构建容器内容器"场景可以用 BuildKit / kaniko / buildah 替代。
- Self-hosted runner 给 public repo 用是**安全炸弹**：任何 PR 都能跑你的脚本；用 `if: github.repository_owner == 'me'` 限制或干脆只用于 private repo。
- CI cache 用对象存储（S3/MinIO）后**别忘了配 lifecycle 自动清理**，否则 cache bucket 半年能炸 TB 级。

---
