---
name: python-venv-uwsgi
description: Python 部署速查 —— venv / pyenv / pip / uWSGI / gunicorn / systemd 集成。
触发词: python, pip, pyenv, venv, virtualenv, poetry, uv pip, uv venv, uwsgi, gunicorn, fastapi, django, flask, wsgi, asgi, python 部署, python 3.13, python 3.12, python 3.11, 装 python, 装 pip, externally-managed-environment, break-system-packages, 启动 python 应用, 守护 python, supervisor python, uvicorn, hypercorn, requirements.txt, pyproject.toml, conda, miniconda, anaconda, python 起不来, python 挂了, uwsgi 挂了, gunicorn 挂了, django 起不来, flask 起不来, python 占内存, python 502
dangerous_commands:
  - '(?:^|[\s;&|])sudo\s+pip\d?\s+(?:install|uninstall)\b'
  - '(?i)\bpip\s+install\b[^\n]*\b--break-system-packages\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:venv|\.venv|env)(?:\s|/|$)'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+/usr/lib/python[\d.]+(?:\s|/|$)'
  - '(?:^|[\s;&|])(?:pkill|killall)\s+(?:-9\s+)?(?:uwsgi|gunicorn)\b'
---

# python-venv-uwsgi —— Python 部署运维

适用：用户部署 Django / Flask / FastAPI；想"装 python 多版本 / 创建虚拟环境 / 用 uWSGI 或 gunicorn 跑 / 装到 systemd"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, "uwsgi")` / `service_status(server, "<app>")`（systemd 托管的 gunicorn/uvicorn，任何档位放行）。
- **看应用日志** → `tail_log(server, "/var/log/uwsgi/myapp.log")` / `tail_log(server, "/var/log/gunicorn/error.log")`（任何档位放行）；systemd 直管的看 `journalctl`（仍走 `ssh_exec journalctl -u <app>`）。
- **查 socket / 端口** → unix socket 用 `sftp_list(server, "/run/uwsgi")` 看 sock 文件在不在 + 权限；TCP 端口用 `port_check(server, 8000)`。
- **改 uwsgi.ini / gunicorn.conf.py / systemd unit / requirements.txt** → `sftp_read` 看现状 + `sftp_write` 整文件写（无 shell 转义坑），写完 `ssh_exec ... systemctl reload` 或 `touch <touch-reload 文件>`。
- ⚠️ `sudo pip` / `--break-system-packages` / `systemctl restart/reload`（含 sudo）会触发**用户审批**——提前告知用户，被拒后不要原样重试。venv 内的 `.venv/bin/pip install` 多数不需要 sudo，能直接点出。

## 第一步：Python 版本管理

> ⚠️ **不要碰系统 Python**（`/usr/bin/python3`）—— 它是 OS 工具链依赖；改坏了 apt/dnf 都跑不了。

### pyenv（推荐）

```bash
# 装
curl https://pyenv.run | bash
# 加到 .bashrc / .zshrc：
# export PYENV_ROOT="$HOME/.pyenv"
# command -v pyenv >/dev/null || export PATH="$PYENV_ROOT/bin:$PATH"
# eval "$(pyenv init -)"

pyenv install --list                              # 可装版本
pyenv install 3.12.3
pyenv versions                                    # 已装
pyenv global 3.12.3                               # 全局默认
pyenv local 3.11.9                                # 当前目录使用
pyenv shell 3.12.3                                # 当前 shell
```

### uv（Rust 实现，最新最快）

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv python install 3.12
uv venv .venv --python 3.12
uv pip install -r requirements.txt                # 比 pip 快 10-100x
```

## 第二步：虚拟环境

### venv（标准库自带）

```bash
python3 -m venv .venv
source .venv/bin/activate                         # Linux/macOS
# .venv\Scripts\activate.bat                     # Windows
which python                                      # 应在 .venv/bin/python
pip install -r requirements.txt
deactivate
```

### virtualenv（更老更兼容）

```bash
pip install virtualenv
virtualenv -p python3.12 .venv
```

### Poetry / PDM（依赖管理 + venv 一体）

```bash
# Poetry
curl -sSL https://install.python-poetry.org | python3 -
poetry new myapp
poetry add fastapi uvicorn
poetry install
poetry run python -m myapp                        # 不激活直接跑
poetry shell                                      # 激活

# PDM（PEP 582 / 锁文件更现代）
pip install --user pdm
pdm init
pdm add fastapi
pdm install
pdm run python -m myapp
```

## 第三步：pip 与依赖

```bash
pip install <pkg>
pip install --upgrade <pkg>
pip uninstall <pkg>
pip install -r requirements.txt
pip install -r requirements.txt --no-deps         # 不装传递依赖（精确控制时）
pip install -e .                                  # 当前项目开发模式安装
pip install --index-url https://pypi.tuna.tsinghua.edu.cn/simple/ <pkg>     # 国内镜像

pip list                                          # 已装
pip list --outdated
pip show <pkg>                                    # 详情 + 安装位置
pip freeze > requirements.txt                     # 导出当前环境
pip check                                         # 检查依赖一致性
pip cache purge                                   # 清缓存
```

### 镜像源

```bash
# 全局
pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple/

# 或 ~/.pip/pip.conf
[global]
index-url = https://pypi.tuna.tsinghua.edu.cn/simple/
extra-index-url = https://pypi.org/simple/
```

## 第四步：uWSGI

```ini
# /etc/uwsgi/apps-available/myapp.ini
[uwsgi]
chdir           = /opt/myapp
module          = myapp.wsgi:application
home            = /opt/myapp/.venv
master          = true
processes       = 4
threads         = 2
socket          = /run/uwsgi/myapp.sock
chmod-socket    = 660
chown-socket    = www-data:www-data
vacuum          = true                            # 退出清理 socket / pid
die-on-term     = true                            # SIGTERM 真退出（不重启）
buffer-size     = 32768
post-buffering  = 8192
harakiri        = 30                              # 单请求 30s 强杀
max-requests    = 1000                            # 每个 worker 处理 1000 请求后重启（防内存泄漏）
max-requests-delta = 100
logto           = /var/log/uwsgi/myapp.log
log-date        = true
disable-logging = false
log-4xx         = true
log-5xx         = true
log-slow        = 1000                            # 慢请求阈值 ms

# 优雅 reload（不丢请求）
lazy-apps       = true
touch-reload    = /opt/myapp/.reload              # touch 这个文件即 reload
```

操作：

```bash
sudo systemctl restart uwsgi               # 全部 apps
sudo systemctl status uwsgi

# 单个 app reload（touch 法）
sudo touch /opt/myapp/.reload

# 状态（启动加 --stats）
uwsgi --connect-and-read /run/uwsgi/myapp.stats
```

## 第五步：gunicorn（更现代、配置更简单）

```bash
.venv/bin/pip install gunicorn

# Flask / Django (WSGI)
gunicorn myapp.wsgi:application \
    --bind unix:/run/gunicorn/myapp.sock \
    --workers 4 \
    --threads 2 \
    --worker-class gthread \
    --max-requests 1000 \
    --max-requests-jitter 100 \
    --timeout 30 \
    --graceful-timeout 30 \
    --log-level info \
    --access-logfile /var/log/gunicorn/access.log \
    --error-logfile /var/log/gunicorn/error.log

# FastAPI / Starlette (ASGI) —— 用 uvicorn workers
gunicorn myapp.main:app \
    --worker-class uvicorn.workers.UvicornWorker \
    --workers 4 \
    --bind 0.0.0.0:8000
```

### 配置文件方式

```python
# gunicorn.conf.py
bind = "unix:/run/gunicorn/myapp.sock"
workers = 4
threads = 2
worker_class = "gthread"
timeout = 30
max_requests = 1000
max_requests_jitter = 100
preload_app = True                            # 主进程加载一次，fork worker 共享内存（省内存）
accesslog = "/var/log/gunicorn/access.log"
errorlog = "/var/log/gunicorn/error.log"
```

```bash
gunicorn -c gunicorn.conf.py myapp.wsgi:application
```

## 第六步：systemd unit（gunicorn / uvicorn 独立部署）

```ini
# /etc/systemd/system/myapp.service
[Unit]
Description=My Python App
After=network.target

[Service]
Type=notify
User=myapp
Group=myapp
WorkingDirectory=/opt/myapp
Environment=PATH=/opt/myapp/.venv/bin
Environment=PYTHONUNBUFFERED=1
EnvironmentFile=-/etc/myapp.env
ExecStart=/opt/myapp/.venv/bin/gunicorn -c gunicorn.conf.py myapp.wsgi:application
ExecReload=/bin/kill -s HUP $MAINPID
Restart=on-failure
RestartSec=5
KillMode=mixed                              # SIGTERM 主进程 + SIGKILL 残余
TimeoutStopSec=30
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now myapp
sudo systemctl reload myapp                  # 触发 gunicorn graceful reload
sudo journalctl -u myapp -f
```

## 第七步：Nginx 反代

### uWSGI socket

```nginx
upstream myapp {
    server unix:/run/uwsgi/myapp.sock;
}
server {
    location / {
        include uwsgi_params;
        uwsgi_pass myapp;
    }
}
```

### gunicorn socket（HTTP 反代）

```nginx
upstream myapp {
    server unix:/run/gunicorn/myapp.sock;
}
server {
    location / {
        proxy_pass http://myapp;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 第八步：性能调优要点

| 参数 | 说明 |
|------|------|
| `workers` | 通常 `(2 * CPU) + 1` —— I/O 密集；CPU 密集 `= CPU` |
| `threads`（gthread worker） | 单 worker 内线程；IO 等待用得上 |
| `max_requests` + `jitter` | 周期性重启 worker 防 leak |
| `preload_app=True` | 主进程加载 → fork worker 共享内存；**有副作用**：DB 连接、SSL ctx 在 fork 后要重建 |
| `timeout` | 单请求超时（worker 被主进程杀） |
| `graceful_timeout` | 滚动时旧 worker 等几秒 |

## 路径速查表

| 内容 | 路径 |
|------|------|
| 系统 Python | `/usr/bin/python3`（**不要碰**） |
| pyenv | `~/.pyenv/versions/<ver>/` |
| uv | `~/.local/share/uv/` |
| venv | 项目目录下 `.venv/` |
| pip 缓存 | `~/.cache/pip/`（XDG） |
| uWSGI 配置 | `/etc/uwsgi/apps-available/*.ini` + `apps-enabled/` |
| gunicorn 配置 | 项目内 `gunicorn.conf.py` 或 systemd ExecStart 行内参数 |

## 危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `sudo pip install` 不在 venv | **污染系统 Python**；可能与 apt/dnf 包冲突 |
| `pip install --break-system-packages` | PEP 668 保护被绕过（生产慎用，应用应该用 venv） |
| `rm -rf .venv` 没准备重建 | 应用立刻起不来 |
| `rm -rf /usr/lib/python3` | **系统工具链崩溃**，apt/dnf 都不能用 |
| 改 `requirements.txt` 但不锁版本 | 下次部署可能拿到 breaking change |
| uWSGI 配置 `lazy-apps=false` + DB 连接池 | 主进程 fork 出多个 worker 共享 socket，连接错乱 |
| systemd `Type=notify` 但应用没 `sd_notify` | systemd 等就绪超时杀进程 |

## 教训

- **生产部署用 venv**（不要装到系统 Python），即使是单一应用机器：升级 Python 主版本时不需要重装系统。
- `gunicorn` 比 `uWSGI` 更简单 + 配置短，新项目首选；老项目沿用 uWSGI 也行。
- `pip install` **永远在 venv 激活后**或带绝对路径 `.venv/bin/pip`；`sudo pip` = 灾难源。
- **锁版本**：用 `pip freeze > requirements.txt` / `poetry.lock` / `pdm.lock` / `uv.lock`；CI 装的与生产一字不差。
- worker 数公式 `(2 * CPU) + 1` 只是起点；实际看 CPU 利用率 / response time 调；I/O bound 应用可以拉更高。
- `preload_app=True` 是 gunicorn 经典坑：**fork 后**才建立 DB 连接 / Redis 连接，否则 worker 共享一个连接出大事。
- uvicorn 直接跑（不经 gunicorn）也行，但**没有 graceful reload**；生产 ASGI 推荐 gunicorn + UvicornWorker。

---
