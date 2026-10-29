# Reeve 内置技能索引（41 项）

> 导出时间：2026-10-06
> 范围：内置技能 41 项（不含用户自建技能 `testOne`）
> 内容：技能名 / 描述 / 触发词（frontmatter 原文，未改动）

---

## 1. `1panel-ops`

**描述**：1Panel 国产 Linux 运维面板速查 —— 状态 / 服务管理 / 应用商店容器路径 / 备份 / 改端口入口密码 / 重置。

**触发词**：
`1panel`, `1panel-core`, `一面板`, `1pctl`, `国产面板`, `应用商店`, `面板登录`, `面板密码`, `改端口`, `改入口`, `改面板用户`, `改面板域名`, `装 1panel`, `1panel 安装`, `装面板`, `面板挂了`, `面板打不开`, `面板进不去`, `面板起不来`, `面板登不上`, `忘了面板密码`, `重置面板`, `面板重置`, `面板备份`, `面板恢复`, `面板卸载`, `卸载 1panel`, `fit2cloud`, `面板用户名`, `安全入口`, `面板入口`, `面板端口`

---

## 2. `borgbackup-restic`

**描述**：备份工具速查 —— borg + restic + rsnapshot 对照 / 增量加密 / 远程仓库 / 恢复演练。

**触发词**：
`borg`, `borgbackup`, `restic`, `rsnapshot`, `备份`, `backup`, `增量备份`, `加密备份`, `snapshot`, `恢复`, `恢复数据`, `恢复文件`, `还原`, `找回文件`, `误删找回`, `备份没了`, `备份失败`, `备份不了`, `恢复不了`, `备份策略`, `异地备份`, `灾备`, `3-2-1 备份`, `定时备份`, `自动备份`, `备份脚本`, `rclone`, `kopia`, `duplicati`, `restic 0.17`, `borg 1.4`, `restic check`, `borg check`, `prune 策略`, `keep-daily`, `keep-monthly`, `备份到 s3`, `备份到 minio`, `备份恢复演练`

---

## 3. `caddy-traefik`

**描述**：Caddy（自动 HTTPS）+ Traefik（容器化反代）速查 —— Caddyfile / dynamic config / docker labels。

**触发词**：
`caddy`, `caddyfile`, `traefik`, `反向代理`, `自动 https`, `dynamic configuration`, `traefik dashboard`, `docker label`, `acme.json`, `caddy api`, `caddy 起不来`, `caddy 报错`, `caddy 证书`, `traefik 起不来`, `traefik 报错`, `traefik 404`, `traefik 502`, `traefik 路由`, `traefik provider`, `docker labels`, `file provider`, `traefik 路由不到`, `caddy reverse_proxy`, `caddyfile 语法`, `配置自动 https`, `一键 https`

---

## 4. `certbot-acme`

**描述**：Let's Encrypt / ACME 证书签发与续期 —— certbot / acme.sh，含 HTTP-01 / DNS-01 / 通配符与续期排障。

**触发词**：
`certbot`, `letsencrypt`, `let's encrypt`, `acme`, `acme.sh`, `ssl 证书`, `https 证书`, `证书续期`, `certificate`, `通配符证书`, `dns-01`, `http-01`, `自动续期`, `certbot renew`, `证书过期`, `证书快过期`, `ssl 过期`, `https 过期`, `配 https`, `加 https`, `申请证书`, `签发证书`, `证书装了`, `浏览器不认`, `certificate not trusted`, `name mismatch`, `证书域名不对`, `fullchain.pem`, `privkey.pem`, `dns 验证`, `txt 记录`, `dnspod`, `alidns`, `cloudflare dns`, `zerossl`

---

## 5. `clickhouse-ops`

**描述**：ClickHouse 运维 —— clickhouse-client / system.* / parts / merges / ReplicatedMergeTree / 备份。

**触发词**：
`clickhouse`, `ck 库`, `click house`, `olap`, `mergetree`, `replicatedmergetree`, `distributed`, `materialized view`, `clickhouse 慢`, `clickhouse 备份`, `clickhouse-backup`, `clickhouse 安装`, `装 clickhouse`, `部署 clickhouse`, `clickhouse-client`, `clickhouse 连不上`, `clickhouse 起不来`, `parts 太多`, `too many parts`, `merge 太慢`, `replica 不同步`, `数据导入`, `optimize 表`, `alter table`, `ttl`, `partition`, `大数据查询`, `分析型数据库`, `列式数据库`, `system.parts`, `system.merges`, `system.replication_queue`

---

## 6. `db-tools`

**描述**：Reeve 数据库直连工具 db_query / db_execute —— 通过已登记的 DB 凭据（mysql_conn / postgres_conn / sqlite_conn / mssql_conn）跑 SQL，避免 ssh_exec + mysql/psql CLI 的密码暴露 + 输出解析坑。

**触发词**：
`数据库`, `查 db`, `查表`, `查记录`, `查询数据`, `mysql 查询`, `postgres 查询`, `sqlite 查询`, `SQL 查询`, `数据库连接`, `db_query`, `db_execute`, `数据条数`, `select 数据`, `insert 数据`, `update 数据`, `看表`, `看库`, `表结构`, `desc 表`, `show tables`, `show databases`, `跑 sql`, `执行 sql`, `count 行`, `多少条数据`, `表里有多少`, `查一下`, `数据库直连`, `不用 ssh 查库`, `给我看`, `表数据`, `explain`, `explain analyze`, `查询计划`, `sql server 查询`, `sqlserver 查询`, `mssql 查询`

---
## 7. `deepseek-harness-deploy`

**描述**：DeepSeek Harness（dsh）部署配方 —— Node 24 + npm 11 的 allow-scripts 坑、host 二值枚举、浏览器安全上下文要求，以及装完必须用 create_port_forward 把访问隧道配上。

**触发词**：
`deepseek harness`, `deepseek-harness`, `dsh`, `dsh web`, `harness 部署`, `部署 harness`, `装 harness`, `deepseek 编程助手`, `deepseek agent`, `deepseek cli`, `部署 dsh`, `装 dsh`, `dsh 部署`, `dsh 装不上`, `dsh 打不开`, `everything is a plugin`, `cordis`

---

## 8. `disk-provisioning`

**描述**：数据盘分区 / 格式化 / 挂载 / 扩容 —— AI 先用只读命令摸清盘的现状并出方案，分区写操作走危险审批，mkfs 等「极高危」步骤由 AI 发起审批、用户在 Reeve 桌面端手敲设备路径并验证身份后才执行，最后 AI 负责挂载与验证。

**触发词**：
`分区`, `磁盘分区`, `硬盘分区`, `新盘`, `新硬盘`, `数据盘`, `挂载磁盘`, `挂载数据盘`, `挂载硬盘`, `格式化`, `格式化磁盘`, `格式化数据盘`, `mkfs`, `fdisk`, `parted`, `gdisk`, `sgdisk`, `sfdisk`, `lsblk`, `blkid`, `fstab`, `开机自动挂载`, `磁盘扩容`, `扩容磁盘`, `云盘扩容`, `扩展分区`, `growpart`, `resize2fs`, `xfs_growfs`, `lvextend`, `lvm`, `逻辑卷`, `pvcreate`, `vgcreate`, `lvcreate`, `mkswap`, `交换分区`, `raid`, `mdadm`, `磁盘加密`, `luks`, `cryptsetup`, `wipefs`

---

## 9. `docker-ps`

**描述**：docker 容器排障速查 —— 状态/日志/资源/网络/磁盘清理/compose。

**触发词**：
`docker`, `容器`, `container`, `docker ps`, `容器挂了`, `docker logs`, `镜像`, `docker compose`, `dockerd`, `容器互通`, `502 容器`, `oom`, `docker 起不来`, `docker 报错`, `容器起不来`, `容器启动失败`, `container 报错`, `docker 重启`, `镜像拉不到`, `镜像下载`, `pull 镜像`, `restarting`, `一直重启`, `docker 27`, `docker 28`, `dockerhub 镜像加速`, `daemon.json`, `registry-mirrors`, `image pull backoff`, `errimagepull`, `装 docker`, `装 docker compose`, `docker compose down`, `docker compose up -d`, `磁盘满了`, `/var/lib/docker`, `docker 占空间`, `docker system df`, `docker prune`, `数据卷`, `named volume`, `匿名卷`, `bind mount`, `容器内时区`, `tz asia`, `ulimit`, `容器内存限制`, `oomkilled`, `exit 137`, `exit 1`

---

## 10. `git-server`

**描述**：自建 Git 服务器速查 —— Gitea / GitLab CE / Gogs 安装/备份/恢复/hook/SSH/迁移。

**触发词**：
`gitea`, `gitlab`, `gitlab-rake`, `gogs`, `自建 git`, `git 服务器`, `git push 失败`, `gitlab 备份`, `gitea 备份`, `ssh-key`, `ci runner`, `forgejo`, `gitea actions`, `gitea 1.22`, `gitea 1.23`, `gitlab ee`, `gitlab ce`, `gitlab omnibus`, `装 gitea`, `装 gitlab`, `部署 git 服务`, `git 仓库`, `internal git`, `git 克隆失败`, `git push 大文件`, `lfs`, `gitlab webhook`, `gitea webhook`, `gitlab 起不来`, `gitea 挂了`, `git 服务连不上`, `gitlab reconfigure`, `post-receive`, `git hook`

---

## 11. `iptables-firewalld`

**描述**：iptables / nftables / firewalld / ufw 对照速查 —— 规则增删 / NAT / 端口转发 / 持久化。

**触发词**：
`iptables`, `ip6tables`, `nftables`, `nft`, `firewalld`, `firewall-cmd`, `ufw`, `防火墙`, `端口转发`, `port forward`, `masquerade`, `snat`, `dnat`, `conntrack`, `规则持久化`, `放行端口`, `开放端口`, `开端口`, `关端口`, `封端口`, `封 ip`, `封禁 ip`, `屏蔽 ip`, `白名单 ip`, `黑名单 ip`, `端口被占`, `端口不通`, `telnet 不通`, `端口连不上`, `连不上`, `访问不了`, `nat 转发`, `ip 转发`, `防火墙规则`, `防火墙没生效`, `防火墙重启`, `把自己锁外面`, `锁外面`, `ssh 断了`, `连不进去`

---

## 12. `java-jvm-tuning`

**描述**：JVM 调优速查 —— jstack / jmap / jcmd / jstat / GC 日志 / heap dump / arthas。

**触发词**：
`java`, `jvm`, `gc 日志`, `oom`, `outofmemory`, `heap dump`, `jstack`, `jmap`, `jstat`, `jcmd`, `jconsole`, `jvisualvm`, `arthas`, `内存泄漏`, `full gc`, `cms`, `g1gc`, `zgc`, `jit`, `java 21`, `java 17`, `java 11`, `openjdk`, `eclipse temurin`, `graalvm`, `jvm 调优`, `调 jvm 参数`, `xmx`, `xms`, `metaspace`, `元空间`, `java 进程吃内存`, `java 占 cpu`, `java 卡顿`, `java 慢`, `java 爆内存`, `线程死锁`, `deadlock`, `springboot 起不来`, `springboot 挂了`, `应用 oom`, `tomcat`, `jetty`, `jar 起不来`, `java 进程没了`

---
## 13. `jenkins-runner`

**描述**：Jenkins / GitLab Runner / Gitea Actions Runner 速查 —— 安装/节点注册/流水线调试/workspace 清理。

**触发词**：
`jenkins`, `jenkins agent`, `jenkins job`, `jenkinsfile`, `pipeline`, `gitlab runner`, `gitlab-runner`, `ci/cd`, `ci 流水线`, `cd 流水线`, `持续集成`, `持续交付`, `gitea runner`, `act runner`, `jenkins runner`, `artifact`, `workspace`, `jenkins lts`, `jenkins 装`, `装 jenkins`, `部署 jenkins`, `jenkins 起不来`, `jenkins 慢`, `jenkins 重启`, `流水线失败`, `构建失败`, `build failed`, `executor`, `节点离线`, `runner 离线`, `runner 注册`, `runner 卸载`, `shared runner`, `group runner`, `project runner`, `jenkins 挂了`, `构建一直失败`, `作业卡住`, `作业卡 pending`, `runner 连不上`

---

## 14. `kafka-ops`

**描述**：Kafka 运维速查 —— topic / consumer group / lag / KRaft 模式 / partition rebalance。

**触发词**：
`kafka`, `消息队列`, `kafka topic`, `consumer group`, `lag`, `消费者组`, `kraft`, `zookeeper`, `partition`, `replication factor`, `isr`, `kafka-console`, `kafka 装`, `装 kafka`, `部署 kafka`, `kafka 3.x`, `kraft 模式`, `抛弃 zk`, `kafka-topics`, `kafka-consumer-groups`, `kafka-configs`, `消费滞后`, `lag 太大`, `消费阻塞`, `rebalance`, `partition reassignment`, `副本同步`, `isr 缩小`, `controller`, `broker 起不来`, `broker 失联`, `kafka ui`, `redpanda`, `kafka 挂了`, `kafka 连不上`, `消费堆积`, `消息消费不动`

---

## 15. `kubernetes-basics`

**描述**：Kubernetes 运维基础速查 —— kubectl 高频 / helm / 调试 / 资源 yaml / namespace / context。

**触发词**：
`kubernetes`, `k8s`, `kubectl`, `helm`, `kubelet`, `pod`, `deployment`, `namespace`, `ingress`, `service`, `configmap`, `secret`, `kube-system`, `k3s`, `k0s`, `kubeadm`, `k8s 起不来`, `pod 起不来`, `crashloopbackoff`, `imagepullbackoff`, `oomkilled`, `pending pod`, `evicted`, `node not ready`, `ingress 不通`, `svc 不通`, `dns 解析失败`, `coredns`, `kubeconfig`, `k8s 节点`, `k8s 集群`, `helm 装`, `helm 卸载`, `kubectl 描述`, `kubectl describe`, `kubectl logs`, `kubectl exec`, `pv pvc`, `storage class`, `hpa`, `daemonset`, `statefulset`

---

## 16. `linux-fundamentals`

**描述**：Linux 基础运维速查 —— 系统/进程/磁盘/网络/用户/cron/防火墙 高频命令对照。

**触发词**：
`linux`, `系统`, `磁盘满`, `进程`, `用户`, `权限`, `网络`, `防火墙`, `firewalld`, `iptables`, `ufw`, `cron`, `crontab`, `时区`, `主机名`, `内存满`, `df -h`, `du -sh`, `top`, `ss -tln`, `netstat`, `free`, `lsof`, `服务器卡`, `服务器慢`, `系统卡死`, `系统慢`, `内存占满`, `内存爆了`, `内存不够`, `磁盘不够`, `磁盘满了`, `空间不够`, `没空间`, `cpu 高`, `cpu 100`, `负载高`, `load 高`, `进程僵尸`, `zombie`, `swap`, `用户加`, `改密码`, `改 sudo`, `sudoers`, `时间不对`, `时间同步`, `ntp`, `chrony`, `timedatectl`, `hostnamectl`, `主机名改`, `主机名修改`

---

## 17. `log-investigation`

**描述**：日志排障速查 —— 路径表 / journalctl / tail+grep / strace / logrotate / 跨服务关联。

**触发词**：
`日志`, `log`, `journal`, `journalctl`, `tail`, `grep`, `日志路径`, `找日志`, `log 在哪`, `error log`, `syslog`, `dmesg`, `strace`, `ltrace`, `logrotate`, `日志切割`, `日志归档`, `查日志`, `看日志`, `看错误`, `错误信息`, `报错信息`, `日志太多`, `日志爆盘`, `日志占空间`, `var log`, `access log`, `accesslog`, `访问日志`, `错误日志`, `last 命令`, `nohup`, `应用挂了`, `应用崩了`, `应用起不来`, `挂了`, `崩了`, `起不来`, `没报错`, `找不到原因`, `panic`, `oom kill`, `oomkilled`, `翻日志`, `日志在哪`, `半夜报警`, `排查问题`

---
## 18. `loki-promtail`

**描述**：Loki + Promtail 日志聚合栈 —— 配置 / LogQL / Grafana 集成 / S3 后端 / 存储压缩。

**触发词**：
`loki`, `promtail`, `logql`, `日志聚合`, `日志查询`, `log aggregation`, `grafana 日志`, `alloy`, `vector`, `fluent-bit`, `structured logging`, `loki 3`, `grafana alloy`, `装 loki`, `部署 loki`, `收集日志`, `集中日志`, `日志接入`, `多机日志`, `日志检索`, `label`, `log stream`, `替代 elk`, `比 elk 轻`, `retention`, `日志保留`, `s3 存储日志`, `loki 没数据`, `日志查不到`, `日志收不上来`, `日志延迟`, `loki 报错`, `too many active streams`, `高基数`

---

## 19. `minio-s3`

**描述**：MinIO（S3 兼容对象存储）速查 —— mc 客户端 / bucket / policy / lifecycle / replication / 部署形态。

**触发词**：
`minio`, `s3 存储`, `对象存储`, `mc 客户端`, `object storage`, `bucket`, `multipart`, `lifecycle`, `replication`, `minio console`, `presigned`, `mc alias`, `minio 起不来`, `minio 装`, `装 minio`, `部署 minio`, `minio 备份`, `s3 api`, `aws s3`, `garage`, `seaweedfs`, `ceph rgw`, `mc cp`, `mc mirror`, `跨区域复制`, `桶策略`, `bucket policy`, `iam policy`, `presigned url`, `临时下载链接`, `mc admin`, `minio operator`, `silo`, `pgsty`, `minio fork`, `minio 控制台没了`, `minio 版本`

---

## 20. `mongodb-ops`

**描述**：MongoDB 运维速查 —— mongosh / 备份恢复 / 复制集 / 分片 / 索引 / 慢查询。

**触发词**：
`mongodb`, `mongo`, `mongosh`, `mongodump`, `mongorestore`, `replica set`, `rs.status`, `sharding`, `mongo 慢查询`, `mongo 索引`, `oplog`, `副本集`, `分片集群`, `mongodb 7`, `mongodb 8`, `mongo 安装`, `装 mongo`, `部署 mongo`, `mongo 连不上`, `mongo 起不来`, `mongo 报错`, `db.collection`, `find 慢`, `aggregate 慢`, `文档数据库`, `nosql`, `没建索引`, `mongo 备份`, `mongo 恢复`, `mongo 主从`, `scram-sha-256`, `mongo 密码`, `db.runCommand`, `server status`

---

## 21. `mssql-ops`

**描述**：SQL Server 运维速查（Linux / Docker 版）—— 装机、连不上 / 起不来、备份还原、版本与许可，含 Reeve 的 db_* 工具对 SQL Server 的边界。

**触发词**：
`sql server`, `sqlserver`, `mssql`, `sqlcmd`, `微软数据库`, `装 sql server`, `部署 sql server`, `安装 sqlserver`, `sa 密码`, `MSSQL_SA_PASSWORD`, `sqlserver 连不上`, `sqlserver 起不来`, `sqlserver 内存`, `mssql 容器`, `1433`, `bak 备份`, `sqlserver 备份`, `sqlserver 还原`, `express 版`, `developer 版`, `mssql_conn`

---

## 22. `mysql-ops`

**描述**：MySQL / MariaDB 安装与运维 —— 1Panel/Docker/原生 三路线安装 + 连接/状态/慢查询/备份/恢复/主从/binlog。

**触发词**：
`mysql`, `mariadb`, `安装 mysql`, `装 mysql`, `部署 mysql`, `mysql 安装`, `mysqldump`, `binlog`, `主从`, `复制`, `replication`, `gtid`, `slave`, `从库`, `慢查询`, `slowlog`, `mysql 备份`, `mysql 恢复`, `数据库锁`, `deadlock`, `innodb`, `processlist`, `mysql 连接数`, `max_connections`, `数据库慢`, `查询慢`, `数据库连不上`, `库连不上`, `数据库连接超时`, `数据库挂了`, `库挂了`, `表锁`, `锁表`

---
## 23. `nfs-smb-share`

**描述**：网络文件共享速查 —— NFS（exports/mount）+ SMB/CIFS（smb.conf/smbpasswd）+ autofs + 故障排查。

**触发词**：
`nfs`, `nfsv4`, `exportfs`, `showmount`, `smb`, `cifs`, `samba`, `smbpasswd`, `autofs`, `文件共享`, `网络盘`, `挂载`, `mount 远程`, `装 nfs`, `装 samba`, `部署 nfs`, `部署 samba`, `挂载远程`, `mount 失败`, `mount 挂不上`, `挂不上`, `挂载卡死`, `挂载卡住`, `共享连不上`, `访问不了共享`, `permission denied 挂载`, `stale file handle`, `smb 共享`, `windows 访问 linux`, `linux 挂 windows 共享`, `文件共享给`, `共享目录`, `exports 配置`, `/etc/exports`, `fstab`, `自动挂载`, `中文乱码 共享`

---

## 24. `nginx-status`

**描述**：Nginx 排障速查 —— 状态/语法/端口/日志/reload + 反代/upstream/证书路径。

**触发词**：
`nginx`, `502`, `503`, `504`, `bad gateway`, `gateway timeout`, `nginx 起不来`, `nginx 报错`, `nginx 重启`, `nginx -t`, `upstream`, `反向代理`, `反代`, `静态资源`, `网站打不开`, `网页打不开`, `网站访问不了`, `网站挂了`, `访问不了`, `连接被拒`, `connection refused`, `域名打不开`, `nginx 配置不生效`, `nginx reload`, `nginx -s reload`, `nginx 端口被占`, `80 端口`, `443 端口`, `ssl_certificate`, `server_name`, `location 匹配`, `try_files`, `proxy_pass`, `client_max_body_size`, `上传大文件失败`, `413`, `request entity too large`, `太大`, `413 报错`

---

## 25. `nodejs-pm2`

**描述**：Node.js 部署速查 —— nvm/fnm 版本管理 + PM2 进程守护 + ecosystem 配置 + cluster 模式 + 日志。

**触发词**：
`node`, `nodejs`, `npm`, `pnpm`, `yarn`, `pm2`, `nvm`, `fnm`, `ecosystem`, `cluster mode`, `node 进程守护`, `node 部署`, `npm install`, `pm2 logs`, `node 22`, `node lts`, `装 node`, `装 npm`, `装 pnpm`, `node 起不来`, `node 挂了`, `node 内存泄漏`, `pm2 重启`, `pm2 reload`, `pm2 起不来`, `零停机部署`, `ecosystem.config`, `package.json`, `npm 慢`, `npm 镜像`, `registry 镜像`, `taobao npm`, `npmmirror`, `corepack`, `node 服务挂了`, `node 进程没了`, `node 占内存`, `node 爆内存`

---

## 26. `ollama-vllm`

**描述**：本地 LLM 部署速查 —— Ollama（开箱即用）+ vLLM（高性能推理）+ TGI / llama.cpp。

**触发词**：
`ollama`, `vllm`, `llama.cpp`, `llama-cpp-python`, `text generation inference`, `tgi`, `lmdeploy`, `sglang`, `本地 llm`, `本地大模型`, `gguf`, `gpu 推理`, `cpu 推理`, `模型部署`, `openai api 兼容`, `llama 3.3`, `llama 3.2`, `qwen 2.5`, `qwen 3`, `deepseek v3`, `deepseek r1`, `mistral`, `phi-4`, `gemma 2`, `装 ollama`, `部署 ollama`, `ollama 跑`, `ollama pull`, `ollama serve`, `ollama list`, `自托管 llm`, `离线大模型`, `显存不够`, `vram`, `量化模型`, `q4_k_m`, `q5_k_m`, `q8_0`, `awq`, `gptq`, `tensor parallel`, `高并发推理`, `推理服务`, `openwebui`, `lobe chat`, `dify`, `ollama 挂了`, `ollama 起不来`, `vllm 挂了`, `vllm 起不来`, `模型加载失败`, `推理慢`, `显存爆了`, `显存满了`, `gpu 占满`, `模型删了`

---

## 27. `openresty-lua`

**描述**：OpenResty (Nginx + LuaJIT) 速查 —— 配置目录约定 / resty CLI / Lua 鉴权 / WAF / 动态路由 / 安全 reload。

**触发词**：
`openresty`, `resty`, `lua`, `lua_shared_dict`, `ngx_lua`, `content_by_lua`, `access_by_lua`, `waf`, `openresty 重启`, `openresty 报错`, `openresty 起不来`, `lua 脚本`, `lua 鉴权`, `ngx.shared`, `ngx.timer`, `lua-resty`, `resty.http`, `modsecurity`, `naxsi`, `动态路由`, `灰度发布`, `ab 测试`, `限流`, `接口限流`, `lua 限流`, `openresty waf`, `nginx 脚本`, `api 网关`, `网关`

---
## 28. `php-fpm-ops`

**描述**：PHP-FPM 运维速查 —— pool 配置 / opcache / 慢日志 / pm.max_children / 与 nginx 通信。

**触发词**：
`php`, `php-fpm`, `fpm`, `opcache`, `php 慢`, `php-fpm 进程数`, `502 php`, `php-fpm.conf`, `www.conf`, `pm static`, `pm dynamic`, `pm ondemand`, `fpm pool`, `php 8.4`, `php 8.3`, `php 8.2`, `装 php`, `部署 php`, `wordpress 慢`, `wordpress 502`, `laravel`, `symfony`, `mediawiki`, `nextcloud`, `fastcgi`, `sock 文件`, `unix socket php`, `opcache 命中率`, `max_children`, `max_requests`, `php 内存限制`, `memory_limit`, `post_max_size`, `upload_max_filesize`, `php 挂了`, `php-fpm 挂了`, `php 起不来`, `php 进程满`, `504 php`, `php 占内存`, `网站 502`

---

## 29. `portainer-ops`

**描述**：Portainer 容器编排面板速查 —— endpoint / stacks / templates / 团队权限 / 备份恢复。

**触发词**：
`portainer`, `容器面板`, `portainer agent`, `edge agent`, `portainer endpoint`, `portainer stack`, `portainer 备份`, `portainer 重置`, `agent token`, `portainer 起不来`, `portainer 登录不了`, `忘了 admin 密码`, `portainer 重装`, `portainer ce`, `portainer business`, `加 endpoint`, `接节点`, `远程 docker 管理`, `swarm 管理`, `portainer stack 部署`, `edge compute`

---

## 30. `postgresql-ops`

**描述**：PostgreSQL 运维速查 —— psql / pg_dump / 角色权限 / 慢查询 / vacuum / 流复制 / extension。

**触发词**：
`postgres`, `postgresql`, `psql`, `pg_dump`, `pg_restore`, `pg_basebackup`, `vacuum`, `autovacuum`, `pgsql`, `postgresql 备份`, `postgresql 主从`, `replication`, `wal`, `pg_wal`, `role`, `extension`, `slow query`, `pg_stat_statements`, `postgres 连不上`, `postgres 慢`, `pg 连接超时`, `postgres 起不来`, `数据库连不上`, `pg 安装`, `装 postgres`, `部署 postgres`, `postgres 17`, `postgres 16`, `postgresql 17`, `死锁`, `pg 锁表`, `pg 慢查询`, `pg 备份`, `pg 恢复`, `pgbouncer`, `postgis`, `表膨胀`, `vacuum full`, `pg_hba.conf`, `postgresql.conf`, `scram-sha-256`

---

## 31. `prometheus-grafana`

**描述**：Prometheus + Grafana + node_exporter + Alertmanager 速查 —— 部署 / scrape / 告警规则 / dashboard 导入 / 存储压缩。

**触发词**：
`prometheus`, `promql`, `grafana`, `alertmanager`, `node_exporter`, `exporter`, `scrape`, `监控`, `告警`, `dashboard`, `recording rule`, `alerting rule`, `tsdb`, `blackbox`, `cadvisor`, `prometheus 3`, `grafana 11`, `grafana 12`, `victoriametrics`, `mimir`, `thanos`, `装 prometheus`, `装 grafana`, `部署监控`, `配监控`, `加告警`, `加监控`, `收集指标`, `scrape failed`, `target down`, `告警发不出`, `smtp 告警`, `钉钉告警`, `飞书告警`, `企业微信告警`, `webhook 告警`, `监控面板`, `dashboard 导入`, `grafana 打不开`, `grafana 登不上`, `面板没数据`, `没数据`, `指标没了`, `监控挂了`, `prometheus 占地方`, `prometheus 磁盘满`

---

## 32. `python-venv-uwsgi`

**描述**：Python 部署速查 —— venv / pyenv / pip / uWSGI / gunicorn / systemd 集成。

**触发词**：
`python`, `pip`, `pyenv`, `venv`, `virtualenv`, `poetry`, `uv pip`, `uv venv`, `uwsgi`, `gunicorn`, `fastapi`, `django`, `flask`, `wsgi`, `asgi`, `python 部署`, `python 3.13`, `python 3.12`, `python 3.11`, `装 python`, `装 pip`, `externally-managed-environment`, `break-system-packages`, `启动 python 应用`, `守护 python`, `supervisor python`, `uvicorn`, `hypercorn`, `requirements.txt`, `pyproject.toml`, `conda`, `miniconda`, `anaconda`, `python 起不来`, `python 挂了`, `uwsgi 挂了`, `gunicorn 挂了`, `django 起不来`, `flask 起不来`, `python 占内存`, `python 502`

---
## 33. `rabbitmq-ops`

**描述**：RabbitMQ 运维 —— rabbitmqctl / management UI / queue / exchange / vhost / cluster / 监控。

**触发词**：
`rabbitmq`, `rabbitmqctl`, `amqp`, `queue`, `exchange`, `vhost`, `federation`, `shovel`, `dlx`, `dead letter`, `死信队列`, `消息队列`, `rabbitmq cluster`, `rabbitmq 4`, `rabbitmq 装`, `装 rabbitmq`, `部署 rabbitmq`, `消息堆积`, `消费跟不上`, `消费慢`, `队列积压`, `queue 堆积`, `ready 太多`, `ack 太慢`, `集群脑裂`, `network partition`, `mirror queue`, `quorum queue`, `streams`, `management plugin`, `15672`, `prefetch`, `消息丢失`, `amqp 1.0`, `rabbitmq 挂了`, `rabbitmq 起不来`, `mq 连不上`, `队列消费不动`, `消息发不出去`

---

## 34. `redis-ops`

**描述**：Redis 运维速查 —— 健康/慢查询/内存/持久化/Cluster/Sentinel，含危险命令清单。

**触发词**：
`redis`, `缓存`, `redis-cli`, `内存暴涨`, `redis 慢`, `oom`, `持久化`, `rdb`, `aof`, `cluster`, `sentinel`, `redis 主从`, `redis 备份`, `redis 连不上`, `redis 起不来`, `redis 报错`, `缓存挂了`, `缓存连不上`, `清缓存`, `刷缓存`, `key 没了`, `缓存丢了`, `redis 7`, `redis 安装`, `装 redis`, `部署 redis`, `valkey`, `keydb`, `redis stack`, `bigkey`, `hot key`, `大 key`, `热 key`, `requirepass`, `slowlog`, `dbsize`, `keys 命令`, `scan 替代 keys`, `redis 主从切换`, `replicaof`, `sentinel 切主`

---

## 35. `redis-tools`

**描述**：Reeve Redis 直连工具 redis_get / redis_set / redis_del / redis_scan / redis_exec —— 通过已登记的 redis_conn 凭据安全操作 Redis，密码加密 + 危险命令拦截（清库类进极高危审批，改配置 / 逃逸类永久拦）。

**触发词**：
`redis`, `缓存`, `redis 查询`, `redis 写入`, `redis 删除`, `KEYS`, `SCAN`, `GET`, `SET`, `HGETALL`, `LRANGE`, `ZRANGE`, `INFO`, `慢日志`, `slowlog`, `redis 密码`, `redis 连接`, `redis_get`, `redis_set`, `redis_del`, `redis_scan`, `redis_exec`, `看 redis`, `查 redis`, `取 key`, `写 key`, `删 key`, `扫 key`, `看 key`, `redis 直连`, `不用 ssh 跑 redis`, `redis ttl`, `expire`, `hash 字段`, `list 元素`, `zset 排名`

---

## 36. `reeve-app-deploy`

**描述**：通用「用 Reeve 部署任意应用」配方（框架无关）—— 共享中间件 install_app + 部署目标 deploy_upsert_target(compose 托管)，产物全进工作台台账、可一键重部署/回滚。任何项目部署没有专属框架技能时的默认剧本。

**触发词**：
`部署`, `上线`, `发布`, `deploy`, `部署到`, `部署项目`, `部署应用`, `部署后端`, `部署前端`, `docker部署`, `docker 部署`, `容器部署`, `上服务器`, `发布到服务器`, `部署到服务器`, `生产部署`, `上生产`, `全栈部署`, `反向代理部署`, `用reeve部署`, `reeve部署`

---

## 37. `ruoyi-plus-uniapp-deploy`

**描述**：RuoYi-Plus + uniapp（ruoyi-plus-uniapp）全栈部署配方 —— 走 Reeve 部署目标(Target)：共享 MySQL/Redis + deploy_upsert_target，产物进工作台、可一键重部署/回滚。

**触发词**：
`ruoyi`, `ruoyi-plus`, `ruoyi-plus-uniapp`, `ruoyi-vue-plus`, `ruoyivue`, `ryplus`, `ryplus_uni`, `ryplus-uni`, `若依`, `若依plus`, `若依部署`, `plus-ui`, `plus-uniapp`, `plus-app`, `ruoyi 部署`, `ruoyi上线`, `部署若依`, `springboot+vue 部署`, `后台管理系统部署`, `后台管理部署`

---
## 38. `selinux-apparmor`

**描述**：SELinux + AppArmor 强制访问控制速查 —— 模式 / 标签 / 策略 / audit2allow / aa-status / 调试。

**触发词**：
`selinux`, `apparmor`, `getenforce`, `setenforce`, `semanage`, `audit2allow`, `aa-status`, `aa-complain`, `权限被拒`, `denied`, `avc`, `mac`, `强制访问控制`, `permission denied`, `权限对但读不到`, `文件权限对但`, `服务起不来无报错`, `起不来没报错`, `权限够但起不来`, `关 selinux`, `禁用 selinux`, `disable selinux`, `selinux 是否开启`, `selinux 状态`, `chcon`, `restorecon`, `上下文`, `context`, `label`, `security context`, `enforcing`, `permissive`, `标签不对`, `文件标签`, `被拦了`, `莫名其妙起不来`

---

## 39. `ssh-hardening`

**描述**：SSH 服务加固清单 —— sshd_config 关键项 / 密钥登录 / fail2ban / 端口改造 / Match 限制 / authorized_keys。

**触发词**：
`ssh`, `sshd`, `sshd_config`, `ssh 加固`, `fail2ban`, `ssh 端口`, `ssh 密钥`, `authorized_keys`, `permitrootlogin`, `passwordauthentication`, `ssh 暴力破解`, `ssh login`, `ssh 连不上`, `ssh 登不进`, `ssh 登录不了`, `登录不了`, `关 root 登录`, `禁用密码登录`, `改密钥登录`, `公钥登录`, `私钥登录`, `改 ssh 端口`, `22 端口`, `ssh 被攻击`, `ssh 爆破`, `防爆破`, `双因素`, `2fa`, `google authenticator`, `ssh key`, `pubkey`, `jumpserver`, `跳板机`, `bastion`

---

## 40. `systemd-service`

**描述**：systemd 自定义服务速查 —— unit 文件 / Type / Restart / 环境变量 / timer / journalctl / 启动顺序。

**触发词**：
`systemd`, `systemctl`, `unit`, `service`, `daemon-reload`, `timer`, `定时任务`, `开机启动`, `自启`, `target`, `journalctl`, `journal`, `服务起不来`, `服务挂了`, `服务启动失败`, `守护进程`, `后台运行`, `开机自启`, `定时跑`, `跑命令一退就没了`, `systemd 服务`, `自定义服务`, `自动重启`, `自动拉起`, `restart always`, `restart on-failure`, `failed state`, `masked 状态`, `exit code`, `status=`, `signal=`, `服务异常退出`, `exitcode 非零`

---

## 41. `wireguard-vpn`

**描述**：WireGuard VPN 速查 —— 密钥 / 配置 / wg-quick / Allowed IPs / 路由 / 故障排查。

**触发词**：
`wireguard`, `wg0`, `wg-quick`, `wg 隧道`, `vpn`, `allowed ips`, `persistent keepalive`, `preshared key`, `wg server`, `wg client`, `mesh vpn`, `tailscale`, `headscale`, `wg 不通`, `wg 连不上`, `wg 慢`, `vpn 不通`, `vpn 连不上`, `vpn 断了`, `vpn 掉线`, `连不上 vpn`, `内网穿透`, `异地组网`, `跨机房`, `远程办公接入`, `搭 vpn`, `装 vpn`, `接 vpn`, `加 peer`, `加客户端`, `换密钥`, `handshake`, `握手失败`, `vpn 丢包`, `mtu`, `vpn mtu`, `nat 穿透`, `frp`, `n2n`, `zerotier`, `组网`, `局域网互通`, `vpn 配置`, `远程接入`

---

## 42. `testOne`（用户自建，非内置 · 附此备查）

> ⚠️ 观察：`list_skills` 返回 42 项，内置 41 项 + 此项。此项无 trigger 词匹配价值时不会被 `evaluate_skills` 命中。

**描述**：一句话描述本技能干什么（用户自建模板，未实际定义）

**触发词**：`关键词1`, `关键词2`（占位值）

---

# 附录：按分类速查

| 分类 | 技能 |
|---|---|
| 面板 / 容器编排 | `docker-ps` `1panel-ops` `portainer-ops` `reeve-app-deploy` |
| Web / 反代 / 证书 | `nginx-status` `openresty-lua` `caddy-traefik` `certbot-acme` |
| 数据库 | `mysql-ops` `postgresql-ops` `mongodb-ops` `mssql-ops` `clickhouse-ops` `db-tools` |
| 缓存 / 消息队列 | `redis-ops` `redis-tools` `kafka-ops` `rabbitmq-ops` |
| 对象存储 / 备份 | `minio-s3` `borgbackup-restic` |
| 运行时 / 应用 | `java-jvm-tuning` `nodejs-pm2` `python-venv-uwsgi` `php-fpm-ops` `ollama-vllm` |
| 监控 / 日志 | `prometheus-grafana` `loki-promtail` `log-investigation` |
| 系统 / 内核 / 安全 | `linux-fundamentals` `systemd-service` `disk-provisioning` `iptables-firewalld` `selinux-apparmor` `ssh-hardening` |
| CI/CD / 代码托管 | `jenkins-runner` `git-server` |
| 编排 / 网络 | `kubernetes-basics` `wireguard-vpn` `nfs-smb-share` |
| 项目部署配方 | `reeve-app-deploy` `ruoyi-plus-uniapp-deploy` `deepseek-harness-deploy` |

---

> 说明：以上「描述 + 触发词」均摘自各技能 SKILL.md 的 frontmatter 原文，未做改写；
> 每项排除项（`dangerous_commands`）与正文内容未包含在本索引内，需要时请单独调 `get_skill` 读取。
