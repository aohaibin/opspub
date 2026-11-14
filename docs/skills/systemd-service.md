---
name: systemd-service
description: systemd 自定义服务速查 —— unit 文件 / Type / Restart / 环境变量 / timer / journalctl / 启动顺序。
触发词: systemd, systemctl, unit, service, daemon-reload, timer, 定时任务, 开机启动, 自启, target, journalctl, journal, 服务起不来, 服务挂了, 服务启动失败, 守护进程, 后台运行, 开机自启, 定时跑, 跑命令一退就没了, systemd 服务, 自定义服务, 自动重启, 自动拉起, restart always, restart on-failure, failed state, masked 状态, exit code, status=, signal=, 服务异常退出, exitcode 非零
dangerous_commands:
  - '(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:sshd?|systemd-journald|systemd-resolved|systemd-networkd|NetworkManager|networking|dbus|cron|crond)\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/etc/systemd/system(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+(?:-[a-zA-Z]+\s+)?/lib/systemd/system/[\w@.-]+\.(?:service|socket|timer|target)\b'
  # 切到救援/紧急 target = 单用户模式，远程生产直接失联（正文危险清单对应项）
  - '(?:^|[\s;&|])systemctl\s+(?:set-default|isolate)\s+(?:rescue|emergency)\.target\b'
---

# systemd-service —— systemd 自定义服务

适用：用户想"开机启动自定义脚本"/"做定时任务（替代 cron）"/"服务挂了自动拉起"/"看服务为啥起不来"/"调依赖关系"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, service)`（= systemctl status --lines=20，任何档位放行）——比 `ssh_exec systemctl status` 稳，readonly 档也不会被拒。
- **写 unit 文件** → 先 `sftp_read` 看现状，再 `sftp_write(server, path, content)` 整文件写入——比 ssh_exec 里 heredoc/echo 拼接可靠（无 shell 转义坑），写完 `ssh_exec sudo systemctl daemon-reload`。
- ⚠️ `sudo systemctl daemon-reload / enable / restart` 都会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## 第一步：unit 文件结构

最小可用 service：

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My App
After=network.target
Wants=network.target

[Service]
Type=simple
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/server --config /opt/myapp/conf.toml
Restart=on-failure
RestartSec=5
Environment=ENV=prod
Environment=DB_HOST=10.0.0.1
EnvironmentFile=-/etc/myapp.env
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

启用：

```bash
sudo systemctl daemon-reload                # 改了 unit 文件**必跑**
sudo systemctl enable --now myapp           # 开机启动 + 立即启动
sudo systemctl status myapp
sudo journalctl -u myapp -f                 # 实时跟日志
```

## 第二步：常用 [Service] 字段

| 字段 | 取值 | 用途 |
|------|------|------|
| `Type` | `simple` / `forking` / `exec` / `oneshot` / `notify` / `dbus` | 见下表 |
| `ExecStart` | 完整命令（**不解析 shell**，要 `;` 或管道写 `bash -c "..."`) | 主进程 |
| `ExecStartPre` | 启动前钩子 | mkdir / chown / check |
| `ExecStartPost` | 启动后钩子 | 注册到服务发现 |
| `ExecStop` | 自定义停止命令 | 不填则 SIGTERM 主进程 |
| `ExecReload` | reload 时跑 | 给应用发 SIGHUP / nginx -s reload |
| `Restart` | `no` / `on-failure` / `on-success` / `always` / `on-abnormal` | 推荐 `on-failure` |
| `RestartSec` | 秒 | 重启间隔，默认 100ms（太频繁会触发 StartLimit） |
| `StartLimitIntervalSec` | 秒（默认 10） | 失败计数窗口 |
| `StartLimitBurst` | 次数（默认 5） | 窗口内允许失败次数；超过就放弃重启 |
| `User` / `Group` | 用户名 | **强烈推荐**不要用 root |
| `WorkingDirectory` | 路径 | 切到这里再执行 |
| `Environment` | `KEY=VALUE` | 单行一对（多行多写几行） |
| `EnvironmentFile` | `-/path` | 从文件读环境变量；`-` 前缀 = 文件缺失不报错 |
| `LimitNOFILE` | 数字 | 最大 fd 数（默认 1024 太小） |
| `LimitNPROC` | 数字 | 最大进程数 |
| `MemoryMax` | `2G` | 内存上限（超就被杀） |
| `CPUQuota` | `200%` | CPU 配额（200% = 2 核） |
| `StandardOutput` / `StandardError` | `journal` / `null` / `file:/path` | 输出去向 |

### Type 对照表

| Type | 行为 | 适用 |
|------|------|------|
| `simple` | `ExecStart` 进程就是主进程；启动即视为成功 | **默认推荐**，前台运行的应用（Go/Rust/Node 二进制） |
| `exec` | 同 simple 但等到 exec() 完成才认成功 | systemd 240+ |
| `forking` | `ExecStart` fork 后退出，子进程是主进程 | 传统守护进程（nginx -t reload 风格） |
| `oneshot` | 一次性任务，跑完退出；常配 `RemainAfterExit=yes` | 初始化脚本 / mount |
| `notify` | 应用主动调 `sd_notify(READY=1)` 通知就绪 | 支持 systemd 通知的应用（sshd / haproxy） |

## 第三步：依赖关系

```ini
[Unit]
# 顺序（启动先后）：A → B
After=postgresql.service
Before=nginx.service

# 强弱依赖：
Requires=postgresql.service     # 强：pg 失败 → 本服务也起不来 + 停掉
Wants=redis.service             # 弱：redis 失败也起本服务（推荐用 Wants）
Requisite=mount.target          # 启动前 mount.target 必须已经在跑（否则立刻失败，不会激活）
BindsTo=foo.service             # 跟随对方（对方停我也停）

# 反向影响
PartOf=group.target             # 我是 group 的一部分（group restart 时 restart 我）
```

**80% 场景用 `After=` + `Wants=` 就够**：表达"启动顺序"和"软依赖"。

## 第四步：timer（systemd 定时任务，替代 cron）

```ini
# /etc/systemd/system/myjob.service
[Unit]
Description=My Job

[Service]
Type=oneshot
ExecStart=/usr/local/bin/my-job.sh

# /etc/systemd/system/myjob.timer
[Unit]
Description=Run My Job every 5 minutes

[Timer]
OnBootSec=2min                  # 开机 2 分钟后第一次
OnUnitActiveSec=5min            # 然后每 5 分钟跑一次
# 或者 cron 风格：
# OnCalendar=*-*-* *:00,15,30,45:00     # 每 15 分钟
# OnCalendar=Mon..Fri 09:00              # 工作日 9 点
# OnCalendar=*-*-1 00:00                 # 每月 1 号 00:00
Persistent=true                 # 错过执行时间（机器关机）开机后补跑
RandomizedDelaySec=30s          # 随机错峰

[Install]
WantedBy=timers.target
```

启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myjob.timer
sudo systemctl list-timers --all | grep myjob
```

定时表达式调试：

```bash
systemd-analyze calendar "Mon..Fri 09:00"          # 解析 + 算下次触发
systemd-analyze calendar --iterations=5 "*-*-* *:00,15,30,45:00"
```

## 第五步：常用命令

```bash
systemctl list-units --type=service             # 当前跑着的所有 service
systemctl list-units --failed                   # 失败的
systemctl list-unit-files --type=service        # 全部 unit（含未启用）
systemctl list-dependencies <unit>              # 依赖树
systemctl list-dependencies --reverse <unit>    # 反向依赖（谁依赖我）
systemctl cat <unit>                            # 看 unit 完整文件（含 drop-in）
systemctl show <unit>                           # 所有属性 = 解析后的最终值
systemctl edit <unit>                           # 创建 drop-in 覆盖（不动原文件）
systemctl edit --full <unit>                    # 直接编辑原文件
systemctl daemon-reload                         # 改完 unit 文件必跑
systemctl reset-failed <unit>                   # 清失败状态（被 StartLimit 卡住时）
```

## 第六步：drop-in 覆盖（不动原文件改配置）

```bash
sudo systemctl edit nginx                       # 自动创建 /etc/systemd/system/nginx.service.d/override.conf
# 写入：
[Service]
LimitNOFILE=65536
Environment=DEBUG=1
```

`systemctl cat nginx` 会显示**合并后**的完整配置（原文件 + override.conf）。删 override：`systemctl revert nginx`。

## 第七步：journalctl 关联

```bash
journalctl -u myapp                             # 全部日志
journalctl -u myapp -n 100                      # 最近 100 行
journalctl -u myapp -f                          # 实时跟
journalctl -u myapp --since "10 min ago"
journalctl -u myapp --since today
journalctl -u myapp -p err                      # 只看 error 及以上级别（emerg/alert/crit/err/warning/notice/info/debug）
journalctl -u myapp -o cat                      # 只打日志内容（不带时间戳）
journalctl -u myapp --grep "panic"
journalctl _PID=1234                            # 按 PID 过滤
journalctl --disk-usage                         # journal 占多少
journalctl --vacuum-time=7d                     # ⚠️ 删 7 天前日志
```

## 第八步：启动慢排查

```bash
systemd-analyze                                 # 总启动耗时
systemd-analyze blame                           # 各 unit 耗时排序
systemd-analyze critical-chain                  # 启动关键路径
systemd-analyze critical-chain <unit>           # 单 unit 的依赖链耗时
systemd-analyze plot > boot.svg                 # 可视化（拖到浏览器）
```

## 路径速查表

| 内容 | 路径 |
|------|------|
| 包提供的 unit | `/lib/systemd/system/` 或 `/usr/lib/systemd/system/` |
| 自定义 unit | `/etc/systemd/system/` |
| 用户级 unit | `~/.config/systemd/user/`（用 `systemctl --user`） |
| Drop-in 覆盖 | `/etc/systemd/system/<unit>.d/*.conf` |
| journal 数据 | `/var/log/journal/` |
| target（运行级） | `multi-user.target`（无 GUI） / `graphical.target`（GUI） |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `systemctl stop sshd` | **远程失联** |
| `systemctl mask sshd` | mask = 永久禁用，连依赖也起不来；恢复要 `unmask` |
| `systemctl stop systemd-journald` | 日志全断，事后没法排查 |
| `systemctl stop NetworkManager` | 网断 |
| `systemctl stop dbus` | 多数系统服务都依赖它，**整机崩** |
| `rm /etc/systemd/system/*` | 删全部自定义 unit |
| `rm /lib/systemd/system/sshd.service` | 删包管理器装的 unit（再 update 会被覆盖回来，**但当前已损坏**） |
| `systemctl set-default rescue.target` 后重启 | 进单用户模式（生产**惨案**） |

## 教训

- 改完 unit 文件**必须 `daemon-reload`**，否则 systemctl restart 还是用旧配置（最经典踩坑）。
- 用 `systemctl edit <unit>` 写 drop-in 远好于直接改 `/lib/systemd/system/*` —— 后者会被包更新覆盖。
- `Restart=always` + 短 `RestartSec` 容易让有 bug 的进程**疯狂重启刷日志**，组合 `StartLimitBurst=5 StartLimitIntervalSec=60` 防熔断。
- `ExecStart` **不解析 shell** —— `cd /opt/app && ./run` 这种要写 `bash -c "cd /opt/app && ./run"`，或者用 `WorkingDirectory=`。
- `Type=forking` 应用退出快但子进程还在 = systemd 抓不到主进程（PID 错）；现代写法尽量改 `simple`。
- `journalctl -u xxx` 看不到东西多半是应用日志写到了文件而非 stdout/stderr → 在 systemd unit 里加 `StandardOutput=journal StandardError=journal`（多数情况下默认就是）。

---

## 42. testOne

```yaml
---
name: testOne
description: 一句话描述本技能干什么
triggers: 关键词1, 关键词2
---
```

# testOne

这里写正文（操作步骤、注意事项、教训）。

> 备注（导出者说明）：`testOne` 属**用户自定义技能**，当前内容仅为 OpsPub 新建技能时生成的模板空壳，尚未填写实际正文。

---
