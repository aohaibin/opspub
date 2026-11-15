---
name: openresty-lua
description: OpenResty (Nginx + LuaJIT) 速查 —— 配置目录约定 / resty CLI / Lua 鉴权 / WAF / 动态路由 / 安全 reload。
触发词: openresty, resty, lua, lua_shared_dict, ngx_lua, content_by_lua, access_by_lua, waf, openresty 重启, openresty 报错, openresty 起不来, lua 脚本, lua 鉴权, ngx.shared, ngx.timer, lua-resty, resty.http, modsecurity, naxsi, 动态路由, 灰度发布, ab 测试, 限流, 接口限流, lua 限流, openresty waf, nginx 脚本, api 网关, 网关
dangerous_commands:
  - '(?i)(?:^|[\s;&|])(?:openresty|nginx)\s+-s\s+stop(?:\s|$)'
  - '(?i)(?:^|[\s;&|])(?:kill|killall)\s+-9\s+(?:nginx|openresty)(?:\s|$)'
  # systemctl stop/disable openresty = 全站下线
  - '(?i)(?:^|[\s;&|])(?:systemctl|service)\s+(?:stop|disable|mask)\s+(?:openresty|nginx)\b'
  # 删 OpenResty 安装目录 / 配置目录 = 站点 + Lua 库全丢
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r[a-zA-Z]*f?[a-zA-Z]*\s+/usr/local/openresty(?:\s|/|$)'
---

# openresty-lua —— OpenResty / Nginx + Lua 速查

适用：用户报"resty 起不来"/"Lua 脚本不生效"/"动态路由没切过去"/"WAF 拦了正常请求"/"想用 Lua 做鉴权但不知道从哪下手"。

## 🤖 第零步：优先用 OpsPub 专用工具

- **看服务状态** → `service_status(server, "openresty")`（编译版可能注册成 `nginx` unit，两个都试；任何档位放行）。
- **看错误日志** → `tail_log(server, "/usr/local/openresty/nginx/logs/error.log")`（Lua 编译错都写这里）。
- **查 80/443 监听** → `port_check(server, 80)` / `port_check(server, 443)`。
- **改配置 / Lua 文件** → `sftp_read` 看现状 + `sftp_write` 整文件写（nginx.conf 含大量 `{}` / `$var`，shell 拼接极易转义出错，整文件写最稳）。
- ⚠️ **铁律：`sftp_write` 改完，先 `ssh_exec sudo nginx -t` 校验通过，再 reload**。OpenResty 的坑更深——`nginx -t` 过了 reload 仍可能因 **Lua 运行时错**让新 worker 全退（命中坏 worker 报 502），所以 reload 后必须 `tail_log` error.log 确认 worker 起来了。
- ⚠️ `sudo nginx -t` / `sudo nginx -s reload` / `sudo systemctl reload` 含 sudo 会触发**用户审批**——提前告知用户，被拒后不要原样重试。

> 改配置前先把现配置 `sftp_read` 出来留底（或落 `~/.opspub/backups`），reload 翻车能整文件 `sftp_write` 回滚。

## 第一步：服务和配置语法

```bash
# 状态
systemctl status openresty
# 或包名不同：systemctl status nginx（OpenResty 编译版可能注册成 nginx unit）

# 配置语法检查（**改完配置必跑**）
sudo /usr/local/openresty/nginx/sbin/nginx -t
# 或直接 nginx（PATH 已加）
sudo nginx -t

# 优雅重载（推荐）
sudo /usr/local/openresty/nginx/sbin/nginx -s reload
# 或 systemctl reload openresty
```

`syntax is ok` + `test is successful` 才算 OK。任何 `[emerg]` 必须先解。

## 第二步：路径约定

| 路径 | 内容 |
|------|------|
| `/usr/local/openresty/` | 主安装目录 |
| `/usr/local/openresty/nginx/sbin/nginx` | 二进制 |
| `/usr/local/openresty/nginx/conf/nginx.conf` | 主配置（**不是** /etc/nginx/） |
| `/usr/local/openresty/lualib/` | 系统 Lua 库（包括 `resty.*` 系列） |
| `/usr/local/openresty/site/lualib/` | 自定义 Lua 库放这里 |
| `/usr/local/openresty/nginx/logs/error.log` | 错误日志 |
| `/usr/local/openresty/nginx/logs/access.log` | 访问日志 |
| `/var/log/openresty/`（包安装可能在这） | 日志（按发行版） |

## 第三步：resty CLI（开发利器）

`resty` 让你像 `node`/`python` 一样跑 Lua 脚本（不起 nginx 也能跑）：

```bash
resty -e 'print("hello"); ngx.sleep(0.1); print("done")'
resty my-script.lua
resty -I /path/to/lua-libs my-script.lua
```

调试时**先用 resty 跑通**，再塞进 nginx.conf 的 `*_by_lua_*` 指令。

## 第四步：核心指令对照

| 阶段 | 指令 | 用途 |
|------|------|------|
| 配置初始化 | `init_by_lua_block` / `init_by_lua_file` | master 启动一次，预加载共享数据 |
| worker 初始化 | `init_worker_by_lua_block` | 每个 worker 启动一次，建定时器/连接池 |
| SSL 阶段 | `ssl_certificate_by_lua_block` | 动态加载证书（按 SNI 选证书） |
| 重写 | `rewrite_by_lua_block` | URL 改写 |
| 鉴权 | `access_by_lua_block` | 鉴权 / 限流 / 黑白名单 |
| 上游选择 | `balancer_by_lua_block` | 动态负载均衡 |
| 内容 | `content_by_lua_block` | 直接生成响应（替代 upstream） |
| 头部改写 | `header_filter_by_lua_block` | 改响应头 |
| 响应体改写 | `body_filter_by_lua_block` | 改响应体 |
| 日志 | `log_by_lua_block` | 异步上报 / 审计 |

## 第五步：Lua 鉴权骨架

```nginx
# nginx.conf
http {
    lua_shared_dict auth_cache 10m;   # worker 间共享 LRU

    server {
        listen 80;

        location /api/ {
            access_by_lua_block {
                local token = ngx.var.http_authorization
                if not token then
                    return ngx.exit(401)
                end
                -- 查 shared cache → miss 则查 redis/HTTP/数据库
                local cache = ngx.shared.auth_cache
                local uid = cache:get(token)
                if not uid then
                    -- ... 调后端验证 token，命中后 cache:set(token, uid, 300)
                end
                ngx.req.set_header("X-UID", uid)
            }
            proxy_pass http://upstream/;
        }
    }
}
```

## 第六步：WAF

主流：

- `lua-resty-waf`（已停止维护，但仍在用）
- `openresty/lua-resty-iputils`（IP 黑白名单）
- 1Panel 自带 **OpenResty + WAF 应用**（推荐：图形化管理规则）

手写 IP 黑白名单：

```nginx
access_by_lua_block {
    local iputils = require "resty.iputils"
    local blacklist = iputils.parse_cidrs({"10.0.0.0/8", "1.2.3.4/32"})
    if iputils.ip_in_cidrs(ngx.var.remote_addr, blacklist) then
        return ngx.exit(403)
    end
}
```

## 第七步：动态加载（不重启换证书 / 改路由）

证书：

```nginx
ssl_certificate_by_lua_block {
    local ssl = require "ngx.ssl"
    local server_name = ssl.server_name()
    -- 按 SNI 拉证书（从 redis/磁盘）
    ssl.clear_certs()
    ssl.set_der_cert(my_cert)
    ssl.set_der_priv_key(my_key)
}
```

路由：

```nginx
balancer_by_lua_block {
    local balancer = require "ngx.balancer"
    -- 从 lua_shared_dict 拿动态 upstream
    local backend = ngx.shared.routes:get(ngx.var.host)
    balancer.set_current_peer(backend)
}
```

## 第八步：reload 失败回滚

`nginx -s reload` **如果新配置坏了**：worker 继续用旧配置，**不会**挂；但下次 reload 还会失败。流程：

```bash
sudo nginx -t                                 # 必跑！失败别 reload
sudo nginx -s reload                          # OK
tail -n 50 /usr/local/openresty/nginx/logs/error.log  # 看 worker 启动有没有 Lua 编译错
```

如果 reload 后**新 worker 全部退出**（多见于 Lua 语法错），旧 worker 仍在跑（直到自然死掉），此时**新连接可能命中坏 worker 报 502**。回滚：

```bash
sudo cp nginx.conf.bak nginx.conf
sudo nginx -t && sudo nginx -s reload
```

## 第九步：常见问题

### Q1: Lua 代码改了不生效
- `*_by_lua_file` 引用的 `.lua` 文件改了后 **必须 reload**（OpenResty 默认 cache 编译产物）
- 开发时可加 `lua_code_cache off;`（**生产严禁** —— 每请求重编译 Lua 拖死性能）

### Q2: `lua_shared_dict` 数据"消失"了
- `lua_shared_dict` 是**单实例进程内共享**，nginx restart 后丢；要持久化用 redis
- 容量超了会 LRU 淘汰，看 `ngx.shared.<name>:get_keys(0)` 当前 key 数

### Q3: WAF 拦了正常请求
- 看 `/usr/local/openresty/nginx/logs/error.log`，命中规则会写日志
- 临时关 WAF：`location` 块里把 `access_by_lua_*` 注释 → `nginx -t && nginx -s reload`

### Q4: 出现 `attempt to yield across C-call boundary`
- 在 `init_by_lua` 阶段调了协程相关 API；`init_by_lua` 阶段不能用 `ngx.socket` / `ngx.sleep`，挪到 `init_worker_by_lua`

## 教训

- 改完 `.lua` 文件后**永远先 `resty` 跑一遍** —— 比 reload 安全得多。
- `lua_code_cache off` 是开发调试用的，**生产开了能拖慢 10 倍**，提交前必须确认是 on。
- `lua_shared_dict` 容量按业务峰值的 2x 设，被 LRU 频繁淘汰会让 cache miss 率飙升。
- WAF 规则上线前用 `ngx.log(ngx.NOTICE, ...)` **dry-run 一周**，确认没误伤再切到 `return ngx.exit(403)`。

---

## 28. opsTwo

```yaml
---
name: opsTwo
description: 一句话描述本技能干什么
triggers: 关键词1, 关键词2
---
```

# opsTwo

这里写正文（操作步骤、注意事项、教训）。

> 备注（导出者说明）：`opsTwo` 属**用户自定义技能**，当前内容仅为 OpsPub 新建技能时生成的模板空壳，尚未填写实际正文。

---
