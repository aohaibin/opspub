---
name: deepseek-harness-deploy
description: DeepSeek Harness（dsh）部署配方 —— Node 24 + npm 11 的 allow-scripts 坑、host 二值枚举、浏览器安全上下文要求，以及装完必须用 create_port_forward 把访问隧道配上。
触发词: deepseek harness, deepseek-harness, dsh, dsh web, harness 部署, 部署 harness, 装 harness, deepseek 编程助手, deepseek agent, deepseek cli, 部署 dsh, 装 dsh, dsh 部署, dsh 装不上, dsh 打不开, everything is a plugin, cordis
dangerous_commands:
  - (?i)(cat|less|more|head|tail|strings|xxd|base64|cp|scp)\s+[^|;&]*\.credentials\.ya?ml
  - (?i)\bdsh\b[^|;&]*--profile\s+headless
  - (?i)\bdsh\s+plugin\b[^|;&]*\badd\b
---

# DeepSeek Harness（dsh）部署

适用：用户说「部署 / 装一下 DeepSeek Harness / dsh」「dsh 装不上 / 打不开」。

DeepSeek Harness = DeepSeek 2026-08 开源的 agent 框架（MIT，命令行名 `dsh`，Cordis 插件架构，「一切皆插件」）。**开发者预览阶段，官方明说会有破坏性变更** —— 下面的版本号和行为都要现场复核，别当永久事实。本配方基于 **`@deepseek-ai/dsh` 0.1.0-rc.6 实测**（2026-08）。

## 🤖 第零步：优先用 OpsPub 专用工具
- **探环境**（只读，任何档位放行）：`system_info` / `disk_usage` / `port_check`(3080)；用只读 `ssh_exec` 查 `command -v node npm docker make g++`（**编译器有没有决定走哪条路**，见下）。
- **传文件**：`sftp_write`（Dockerfile / 配置）/ `sftp_upload`（大文件）。
- **配访问隧道**：装完**必须**用 `create_port_forward`，别让用户自己去 UI 填（原因见「4. 让用户能打开」）。
- 改动型操作（装包 / sudo / 起容器）按服务器档位走**审批**——提前告知用户，被拒别原样重试。

## 🔴 先想清楚：dsh 装哪台机器，它就只能改哪台机器的文件

dsh 的 agent 读写的是**它自己所在机器**的工作区目录。装在服务器上 = 它只能碰服务器上的代码；用户 Windows 本地的项目它一个字节都看不到。**开工前先问清楚用户要改哪儿的代码**：

| 用户要改的东西 | 装哪 |
|---|---|
| 服务器上已有的项目 | 装服务器，把那个项目目录挂/指成工作区 |
| 自己电脑上的项目 | **装用户本机**（Windows 也支持：有 `win32-x64` prebuilds + 官方 Windows CI gates），`npx @deepseek-ai/dsh web` 就能先试 |
| 两边都要 | 各装一份，互不干扰 |

## 1. 硬性前提（不满足就别往下走）

| 项 | 要求 |
|---|---|
| Node | **`^22.19.0 \|\| >=24.0.0`**（package.json engines）。Ubuntu 22.04 apt 里是 12，必须自己装 |
| pnpm | 仅 `dsh plugin` 子命令要（转发给 pnpm）；`corepack enable` 即可 |
| 端口 | 默认 3080 |

装 Node 优先 **官方 tar.xz 解压到 `~/.local/node`**：不需要 sudo，卸载就是删目录。
（nvm 安装脚本在 `raw.githubusercontent.com`，该域名已被移出 OpsPub 出站白名单，会走审批。）

## 2. 装法二选一：宿主直装 vs Docker

**先探 `make` / `g++` / `cc` 和 sudo 是否免密**，再决定：

- **宿主直装**（`npm i -g @deepseek-ai/dsh`）：需要编译工具链兜底。多数情况 `node-pty` 会命中随包分发的 `prebuilds/`（20 秒装完、不编译），但预编译不匹配时会 fallback 到 node-gyp。
- **Docker**（`node:24` 官方镜像）：镜像自带完整工具链。**宿主缺编译器且 sudo 需要密码时只能走这条** —— OpsPub 的 `ssh_exec` 非交互，喂不了 sudo 密码（也不该喂）。附带好处：dsh 的 agent 有 bash 能力且 Web UI 无认证，关进容器能隔离宿主上的其它业务。

### 🔴 坑一：npm 11 默认阻止 install scripts —— 不加参数会静默装成空壳

```bash
npm i -g --allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs @deepseek-ai/dsh
```

不加 `--allow-scripts`，`node-pty` / `koffi` 的原生部分不落地、`dsh-subprocess-local` 的 spawn helper 不生成 —— **`npm i` 退出码是 0、看起来装成功了**，实际 terminal 和子进程能力全废。npm 只在日志里给一行 `warn allow-scripts`。包名清单以 npm 自己那行告警为准（版本升级可能变）。

**装完必须回读验证**，别信"没报错"：
```bash
dsh --version
node -e "const p=require('<全局node_modules>/@deepseek-ai/dsh/node_modules/node-pty');console.log(typeof p.spawn)"
```

### 🔴 坑二：`npm config set disturl` 在 npm 11 已被移除

报 `disturl is not a valid npm option` 直接中断安装。要给 node-gyp 换源用环境变量：
```bash
export NODEJS_ORG_MIRROR=https://npmmirror.com/mirrors/node
npm config set registry https://registry.npmmirror.com   # registry 这条仍有效
```

### Docker 方式要点

- 用 `node:24`；`USER node`（uid 1000，与 Ubuntu 默认用户对齐，挂载卷读写无碍）。
- 挂两个卷：`$DSH_HOME`（配置 + 密钥，容器重建不丢）、工作区目录。
- 🔴 **绝不挂 `docker.sock`** —— 挂了 dsh 的 agent 就能控制宿主上所有兄弟容器，容器隔离白做。

## 3. 🔴 坑三：绑定地址是二值枚举，只能填 127.0.0.1 或 0.0.0.0

两层限制，别只看一层：

1. CLI 层（`web-app/src/startup.ts`）**硬拒 `--host 0.0.0.0`**，报错原文：
   *"intentionally not supported yet for safety: it would expose remote code execution to the network"*。
2. 配置层 webserver 插件的 schema 是 **`"127.0.0.1" | "0.0.0.0"` 二值枚举** —— 填任何具体 IP（容器 IP、内网 IP、组网 IP）都会在启动时被 `ValidationError` 拒掉。

所以 **「绑一个内网 IP 让别人直接访问」这条路根本不通**。

容器里的正解：让 patch 写死 `0.0.0.0`（只覆盖容器网络），再由 docker 收窄到宿主环回：

`$DSH_HOME/cordis.patch.yml`：
```yaml
- id: webserver
  config:
    host: '0.0.0.0'
    port: 3080
```
```
docker run -p 127.0.0.1:3080:3080 ...
```
⚠️ patch 是**整体替换该行 config、不是深合并**，`port` 必须一并写出；写成字面值后命令行 `--host/--port` 的运行时读取会被移除。用 `dsh web --dump-config` 可以先看合成后的配置树。

## 4. 让用户能打开 —— 必须走 localhost，且由你来配隧道

### 🔴 坑四：不从 localhost 访问，前端会直接崩

浏览器只在**安全上下文**（HTTPS 或 `localhost`/`127.0.0.1`）暴露 `crypto.randomUUID` 和 `crypto.subtle`。走 `http://<内网IP>:3080` 时两者都是 `undefined`，dsh 前端在渲染「选择工作区目录」时抛 **`crypto.randomUUID is not a function`**，弹窗空白、无法选工作区（其它用到 Web Crypto 的地方也会陆续挂）。

诊断一句话搞定（浏览器控制台）：
```js
console.log(window.isSecureContext, typeof crypto.randomUUID)  // false / "undefined" 即中招
```

### 正确做法：装完主动配隧道

```
list_port_forwards            → 确认本地 3080 没被占（本地端口是唯一索引，撞了会创建失败）
create_port_forward(server=<别名>, name="dsh", localPort=3080,
                    remoteHost="127.0.0.1", remotePort=3080)
```
默认立即启动 + 开机自启，之后把返回的 `localUrl`（`http://127.0.0.1:3080`）告诉用户。
**别说「请你自己去端口转发页加一条」** —— 你有工具，自己做完。

## 5. 用户自己完成的最后两步（你不要代劳）

1. **填 API 密钥**：Web UI「设置 → 模型」→ DeepSeek 卡片。字段**只写不读**，密钥落在 `$DSH_HOME/.credentials.yaml`，页面只回脱敏描述符。
   🔴 **绝不要求用户把密钥贴进对话，也不要去读那个文件**（本技能已把读它列入危险命令）。凭据解析序：环境变量 → `$DSH_HOME/.credentials.yaml` → 调用目录 `.env` → `$DSH_HOME/.env`。
2. **选工作区**：不选的话输入框一直禁用（占位符写着「选择一个工作区开始」）。

## 6. 交付前务必告诉用户的三件事

1. **Web UI 没有登录认证**。谁能打开这个页面，谁就能在那台机器上跑命令、读工作区文件。这正是必须走隧道、不能绑内网 IP 的实际理由（不只是前端报错）。
2. **dsh 的执行完全不经 OpsPub 的策略引擎 / 审批 / 审计 / 脱敏** —— 装上它等于在那台机器上多开一个 OpsPub 管不到的 AI 执行面。用户有权知道。
3. **默认权限 `workspace-write`**：bash 与写文件限工作区 + 临时目录，但**读、网络、进程可见性不受限**（`DSH_PERMISSION_MODE` 可改进程默认值）。

另：会话遥测默认本地，但 `DSH_TELEMETRY_MODE=FULL` 会把消息正文、工具参数与结果、工作区路径经 OTLP 外传，且**官方基线没有脱敏规则**；`DSH_TELEMETRY_DISABLED` 非空是硬开关。别替用户打开。

## 7. 常见现象 → 直接结论

| 现象 | 结论 |
|---|---|
| `npm i` 成功但 `dsh` 命令不存在 | 安装中途失败（多为 node-gyp）。看日志尾部，别只看退出码 |
| `gyp ERR! stack AggregateError [ETIMEDOUT]` | 取 Node 头文件超时 + 缺编译器。设 `NODEJS_ORG_MIRROR`，或改走 Docker |
| `disturl is not a valid npm option` | npm 11 移除了该项，改用 `NODEJS_ORG_MIRROR` |
| 启动报 `$.host expected "127.0.0.1" \| "0.0.0.0" but got <IP>` | 绑定地址是二值枚举，见第 3 节 |
| `crypto.randomUUID is not a function` / 目录选择器空白 | 非安全上下文，改从 localhost 访问，见第 4 节 |
| `--host 0.0.0.0` 被拒 | CLI 有意为之的安全设计。容器场景用 patch 写 config，别跟它对着干 |
| 装完用户说打不开 | 先 `port_check` 确认服务在听，再看是不是压根没配隧道 |

---
