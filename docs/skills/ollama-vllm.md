---
name: ollama-vllm
description: 本地 LLM 部署速查 —— Ollama（开箱即用）+ vLLM（高性能推理）+ TGI / llama.cpp。
触发词: ollama, vllm, llama.cpp, llama-cpp-python, text generation inference, tgi, lmdeploy, sglang, 本地 llm, 本地大模型, gguf, gpu 推理, cpu 推理, 模型部署, openai api 兼容, llama 3.3, llama 3.2, qwen 2.5, qwen 3, deepseek v3, deepseek r1, mistral, phi-4, gemma 2, 装 ollama, 部署 ollama, ollama 跑, ollama pull, ollama serve, ollama list, 自托管 llm, 离线大模型, 显存不够, vram, 量化模型, q4_k_m, q5_k_m, q8_0, awq, gptq, tensor parallel, 高并发推理, 推理服务, openwebui, lobe chat, dify, ollama 挂了, ollama 起不来, vllm 挂了, vllm 起不来, 模型加载失败, 推理慢, 显存爆了, 显存满了, gpu 占满, 模型删了
dangerous_commands:
  - '(?:^|[\s;&|])ollama\s+rm\s+'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.ollama|/usr/share/ollama)(?:\s|/|$)'
  - '(?:^|[\s;&|])OLLAMA_HOST\s*=\s*0\.0\.0\.0\b'
  - '(?:^|[\s;&|])rm\s+-[a-zA-Z]*r?[a-zA-Z]*f?[a-zA-Z]*\s+(?:~/\.cache/huggingface|~/\.ollama/models)(?:\s|/|$)'
---

# ollama-vllm —— 本地 LLM 部署

适用：用户想"自托管开源 LLM"/"接 OpsPub 内置对话页"/"装 ollama 跑 llama / qwen / deepseek"/"vLLM 高性能服务"。

## 🤖 第零步：优先用 OpsPub 专用工具

> 🔴 **装 Ollama 优先用 `install_app(server, "ollama")`**（Ollama 在 OpsPub 应用商店目录里，另有 `open-webui`）——应用商店同款：进「容器/编排」台账、容器规范命名、绑 127.0.0.1。下面的手动 `docker run` 仅作教学 / 自定义（如 GPU/vLLM，目录里没有）fallback（手装的**不进台账、工作台看不到**）。

- **看推理服务状态** → Ollama 用 `service_status(server, "ollama")`；vLLM 多为 docker 容器，用 `ssh_exec(server, "docker ps --filter name=vllm")`（任何档位放行的 `service_status` 不覆盖容器）。
- **看推理日志** → systemd Ollama：`ssh_exec(server, "journalctl -u ollama -n 200 --no-pager")`；vLLM 容器：`ssh_exec(server, "docker logs --tail 200 vllm")`；落了文件就 `tail_log(server, "<path>")`（任何档位放行）。
- **查 API 端口** → `port_check(server, 11434)`（Ollama）/ `port_check(server, 8000)`（vLLM/llama.cpp）确认服务在监听。
- **看显存 / 磁盘**（模型几十 GB，最容易爆磁盘 / 显存）→ 显存 `ssh_exec(server, "nvidia-smi")`；磁盘 `disk_usage(server, "~/.ollama")` / `disk_usage(server, "~/.cache/huggingface")`（任何档位放行）。
- **改 Ollama systemd unit（设 `OLLAMA_HOST`/`OLLAMA_MODELS` 等）/ vLLM 启动脚本** → `sftp_read` 看现状 + `sftp_write` 整文件写，写完 `ssh_exec sudo systemctl daemon-reload`。
- ⚠️ `ollama pull <大模型>` 会下载几十 GB（先 `disk_usage` 确认空间，且可能超 30s `ssh_exec` 超时——建议 nohup 后台拉 + `tail_log` 看进度）；`ollama rm` / `systemctl restart`（含 sudo）会触发**用户审批**——提前告知用户，被拒后不要原样重试。

## 选型对照

| 工具 | 强项 | 弱项 | 适合 |
|------|------|------|------|
| **Ollama** | 一键开箱、CLI 简洁、模型管理像 docker pull | 性能中等、batch 弱 | 个人 / 小团队 / 演示 |
| **vLLM** | 极高吞吐 + Continuous Batching | 配置复杂 / 显存占用大 | 生产 OpenAI 兼容服务 |
| **TGI (HuggingFace)** | 商业支持 + 多平台 | 闭源限速；Apache 2.0 旧版 OK | HF Ecosystem 用户 |
| **llama.cpp** | 纯 CPU / 小内存可跑 | 速度慢；GPU 加速能力一般 | 边缘 / 树莓派 / Mac M 系列 |
| **LMDeploy** / **SGLang** | 中文社区活跃；Triton / FastTransformer 优化 | 文档较少 | 国内 NLP 团队 |

## 一、Ollama

### 装

```bash
# Linux 一键
curl -fsSL https://ollama.com/install.sh | sh

# Docker
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama \
    --gpus=all \                          # 有 NVIDIA GPU 加上
    ollama/ollama
```

### 拉模型 / 运行

```bash
ollama list                                # 已下载
ollama pull qwen2.5:7b                     # 拉模型（默认 q4_K_M 量化）
ollama pull qwen2.5:7b-instruct-q5_K_M     # 显式量化
ollama pull llama3.2
ollama pull deepseek-coder-v2
ollama pull bge-m3                         # embedding 模型
ollama show qwen2.5:7b                     # 看 modelfile / 参数

# 跑（交互）
ollama run qwen2.5:7b
ollama run qwen2.5:7b "你好"

# 删模型
ollama rm qwen2.5:7b                       # ⚠️ 走审批
```

### HTTP API（OpenAI 兼容）

Ollama 监听 `:11434`：

```bash
# Chat
curl http://localhost:11434/api/chat -d '{
  "model": "qwen2.5:7b",
  "messages": [{"role": "user", "content": "你好"}],
  "stream": false
}'

# OpenAI 兼容路径
curl http://localhost:11434/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -d '{
      "model": "qwen2.5:7b",
      "messages": [{"role": "user", "content": "你好"}]
    }'
```

> 在 OpsPub「LLM Profile」里配 endpoint = `http://<host>:11434/v1`，base = openai-compatible，key 随便填即可。

### 自定义模型（Modelfile）

```dockerfile
# Modelfile
FROM qwen2.5:7b
PARAMETER temperature 0.3
PARAMETER num_ctx 16384
SYSTEM """
你是 Linux 运维助手；回答时优先给具体命令。
"""
```

```bash
ollama create my-ops -f Modelfile
ollama run my-ops
```

### 远程访问

```bash
# 默认 127.0.0.1，要远程访问改：
OLLAMA_HOST=0.0.0.0 ollama serve          # ⚠️ 公网暴露 = 任何人能用你的 GPU；**必加防火墙白名单**
# 或 systemd unit：Environment=OLLAMA_HOST=0.0.0.0
```

### 路径

| 内容 | 路径 |
|------|------|
| 模型 / blob | `~/.ollama/models/`（用户安装） / `/usr/share/ollama/.ollama/models/`（系统级） |
| 配置 | 环境变量为主：`OLLAMA_HOST`, `OLLAMA_MODELS`, `OLLAMA_KEEP_ALIVE`, `OLLAMA_NUM_PARALLEL` |
| API | `:11434` |
| systemd | `ollama` |

## 二、vLLM

### 装

```bash
# Python 3.10-3.12
pip install vllm                          # 需要 CUDA 12.1+ / 兼容 GPU

# 或 Docker（推荐生产）
docker pull vllm/vllm-openai:latest
```

### 跑（OpenAI 兼容服务）

```bash
# 单 GPU
docker run -d --runtime nvidia --gpus all \
    -v ~/.cache/huggingface:/root/.cache/huggingface \
    -p 8000:8000 \
    --name vllm \
    vllm/vllm-openai:latest \
    --model Qwen/Qwen2.5-7B-Instruct \
    --tensor-parallel-size 1 \
    --gpu-memory-utilization 0.9

# 多 GPU（tensor parallel）
docker run ... \
    vllm/vllm-openai:latest \
    --model Qwen/Qwen2.5-72B-Instruct-AWQ \
    --tensor-parallel-size 4 \
    --quantization awq

# 国内 HF 镜像
docker run -e HF_ENDPOINT=https://hf-mirror.com ...
```

### 关键参数

| 参数 | 用途 |
|------|------|
| `--model` | HF model id 或本地路径 |
| `--tensor-parallel-size N` | 张量并行（按 GPU 数；70B 模型至少 2） |
| `--gpu-memory-utilization 0.9` | 占多少显存（默认 0.9） |
| `--max-model-len 32768` | 最大上下文（受显存限制） |
| `--quantization awq` / `gptq` / `fp8` | 量化（省显存） |
| `--enforce-eager` | 不用 CUDA graph（调试） |
| `--api-key sk-xxx` | 鉴权 |
| `--served-model-name foo` | 别名 |
| `--dtype bfloat16` / `float16` | 精度 |
| `--max-num-seqs 256` | 并发请求数 |

### 调用

```bash
curl http://localhost:8000/v1/chat/completions \
    -H 'Content-Type: application/json' \
    -H 'Authorization: Bearer <API-KEY>' \
    -d '{
      "model": "Qwen/Qwen2.5-7B-Instruct",
      "messages": [{"role": "user", "content": "你好"}]
    }'

curl http://localhost:8000/v1/models       # 列出 served model
curl http://localhost:8000/health
```

### 路径

| 内容 | 路径 |
|------|------|
| HF 模型缓存 | `~/.cache/huggingface/hub/` |
| vLLM 日志 | docker logs / stdout |
| Prometheus metrics | `:8000/metrics` |

## 三、llama.cpp（纯 CPU / 边缘）

```bash
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp && make -j

# 下载 GGUF 模型
huggingface-cli download Qwen/Qwen2.5-7B-Instruct-GGUF qwen2.5-7b-instruct-q4_k_m.gguf --local-dir ./models

# 启动 OpenAI 兼容服务
./build/bin/llama-server -m ./models/qwen2.5-7b-instruct-q4_k_m.gguf \
    --host 0.0.0.0 --port 8080 \
    -c 4096 \
    -ngl 99                              # 全部 layer offload 到 GPU
```

Apple Silicon / Mac M 系列 / 老 PC 上**只能用 llama.cpp**（CPU + Metal）。

## 四、监控

### vLLM Prometheus 指标

`:8000/metrics` 提供：

| 指标 | 含义 |
|------|------|
| `vllm:num_requests_running` | 在跑请求数 |
| `vllm:num_requests_waiting` | 排队数（高 = 满载） |
| `vllm:gpu_cache_usage_perc` | KV cache 利用率 |
| `vllm:time_to_first_token_seconds` | TTFT |
| `vllm:time_per_output_token_seconds` | 单 token 耗时 |

### Ollama 监控

Ollama 没原生 metrics endpoint；用 nvidia-smi / DCGM exporter 看 GPU。

## 五、性能调优要点

| 场景 | 推荐 |
|------|------|
| 单用户聊天 | Ollama 够 |
| 内部 API（10 用户以下） | Ollama 或 vLLM 单卡 |
| 生产 API（高 QPS） | vLLM + AWQ/GPTQ 量化 |
| 翻译 / RAG 长文档 | vLLM `--max-model-len 32768+` |
| 代码补全 | DeepSeek-Coder / Qwen2.5-Coder 系列 |
| Embedding | bge-m3 / bge-large（Ollama 也支持 embedding 模型） |
| Mac M 系列 | llama.cpp（Metal）/ LM Studio / Ollama 也行 |

## 六、危险操作清单（务必经审批）

| 命令 | 后果 |
|------|------|
| `ollama rm <model>` | 删模型本地副本（大模型重新下载几十 GB） |
| `OLLAMA_HOST=0.0.0.0` + 无防火墙 | 公网任何人可用你的 GPU（**算力被白嫖** + 隐私数据外泄风险） |
| `rm -rf ~/.ollama` | 删全部本地模型 |
| vLLM `--api-key=""` + 公网暴露 | 同上 |
| `--gpu-memory-utilization 1.0` | 显存吃满，OS / 其他进程被 OOM |
| 多个 vLLM 实例共享 GPU 但都占满 | 互相 OOM |

## 教训

- **本地 LLM 服务永远绑 127.0.0.1**（或私有网卡），公网暴露要加 API key + WAF。
- Ollama 适合**单用户低 QPS**；并发请求会排队，**不是为多用户高并发设计**。
- vLLM **HuggingFace 模型下载慢**用 `HF_ENDPOINT=https://hf-mirror.com`；国内可达。
- `--gpu-memory-utilization` 设 0.85-0.9 留余地，**1.0 是 OOM 邀请函**。
- 量化首选顺序：`AWQ ≈ GPTQ > GGUF q4_K_M > FP16`；4-bit 量化质量损失通常 < 5%。
- Ollama 模型版本约定：`<name>:<size>[-<quant>]`；同名版本 `pull` 会覆盖；想固定版本用 digest。
- 大于 70B 模型**单卡跑不动**，至少 2×80GB（A100/H100）+ tensor parallel；预算有限优先量化（72B → AWQ 4bit ≈ 40GB）。
- OpsPub 的「LLM Profile」可以同时配多个 endpoint —— 调试用 Ollama，生产切 vLLM 不用动代码。

---
