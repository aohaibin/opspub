---
name: ai-profile-integration
description: |
  用于在本项目里接入或修改 ai-profile（AI 模型服务配置层 Rust crate）：服务商预置、「获取模型」验证、ai.profile 粘贴导入与分享、token 限额与历史裁剪、生图 / 视频 / 配音调用。

  触发场景：
  - 第一次把 ai-profile 接进项目，替换项目里自己写的服务商清单或地址拼接
  - 做或修改「模型服务」设置页：服务商下拉、获取模型、测试连接、粘贴导入
  - 对话请求前要裁历史、给 max_tokens 封顶，或处理「上下文超长」报错
  - 升级 ai-profile 版本，或想加新模型 / 新服务商

  触发词：ai-profile、模型服务、服务商预置、provider、获取模型、测试连接、ai.profile、粘贴导入、限额、上下文窗口、历史裁剪
---

# 接入 ai-profile

ai-profile 是给应用用的「AI 模型服务配置层」：服务商预置、地址拼接、零成本验证、跨应用配置互通、限额。
**它不发对话请求、不存密钥** —— 那两件事留在本项目。

- 文档：<https://ai-profile.ruoyi.plus>（给 AI 读的全文：<https://ai-profile.ruoyi.plus/llms-full.txt>）
- API：<https://docs.rs/ai-profile>
- 可运行示例：<https://github.com/bkywksj/ai-profile/tree/master/crates/ai-profile/examples>

动手前先读全文文档，不要凭印象写 —— 本库 2026-09 才发布，训练数据里没有它。

## 加依赖

```toml
ai-profile = "0.1"                                                   # 只要预置与纯函数（可编到移动端）
ai-profile = { version = "0.1", features = ["client"] }              # + 「获取模型」验证
ai-profile = { version = "0.1", features = ["client", "image", "video", "tts"] }  # + 多模态调用
```

最低 Rust 1.88。升级同一小版本用 `cargo update -p ai-profile`；升 `0.x` 小版本前先读更新日志。

## 🔴 必须遵守的规则

| 规则 | 为什么 |
|---|---|
| **不要在本项目里再写服务商清单、模型列表、协议映射、地址拼接** —— 一律用本库的 | 本库存在的全部理由就是消掉这些副本；自己再抄一份，模型 id 一变就会和本库不一致 |
| 要加模型 / 加服务商：优先向本库提 issue 或 PR；只属于本应用的私有服务商用 `PresetCatalog::new().extend(&LOCAL)` 在本项目里加 | 公共数据放公共库，私有数据留在应用 |
| OpenAI 兼容地址**原样使用**，不要替用户补 `/v1` | 各家版本段不同（智谱 `/v4`、Gemini `/v1beta/openai`），补错只会 404 |
| Anthropic 协议地址**也不要手动补 `/v1`** —— 用 `endpoint::join_chat_endpoint(base, "messages")`，本库会按约定补 | 用户从 Claude Code 等工具粘来的地址常常只填到主机名；手动补会变成 `/v1/v1` |
| `match` 本库的公开枚举（`VerifyError`、`ParseError`、`Kind`、`Protocol`…）**必须带 `_` 分支** | 它们都是 `#[non_exhaustive]`，本库加变体只算小版本，不写 `_` 升级后编译不过 |
| `ServiceConfig` 只能用 builder 构造：`ServiceConfig::new(..).with_api_key(..).with_model(..)` | 不能写结构体字面量（E0639） |
| `Verifier` **建一次、存进全局状态反复用**；要代理用 `Verifier::from_builder(ai_profile::reqwest::Client::builder().proxy(..))` | 每次现建连接池永远是空的；用本库重导出的 `reqwest` 才能保证版本一致 |
| 验证失败按 `VerifyError` 的变体给**界面动作**，不要只显示一行红字 | 404 带 `suggested_url` 可做「一键改用」，缺专有字段能在发请求前就禁用按钮 |
| 密钥由本项目存储和加密；错误信息里本库不会带密钥，可以放心写日志 | 本库不持久化任何东西 |
| 限额的「预置」来源**不要存进数据库**，每次现查；只存用户手填与端点上报的值 | 预置随本库升级而更新，存下来就冻结在旧值上 |

## 🔴 如果本项目**已经发布过**、用户手里存着配置

换成本库之前，先把存量地址修正成本库的语义：本项目原来的拼接逻辑很可能会「帮用户补 `/v1`」，
换成本库后这些地址会 404，而且用户看不出原因。做法：

1. 把旧的拼接函数原样复制进测试模块，改名 `legacy_join`，注明不要改
2. 写一个修正函数：输入旧地址，输出在本库语义下与旧规则**请求同一个地址**的新地址
3. 对照测试：对一批真实可能出现的地址、每一条会用到的路径，断言 `本库拼接(修正后) == legacy_join(原值)`
4. 修正必须幂等；只在数据库升级迁移、整库恢复、本项目旧版导出格式这些**旧来源**上跑，新建 / 编辑 / `ai.profile` 导入不修正
5. 上线前用真实用户库的**副本**跑一遍迁移，看改了哪几条

详见 <https://ai-profile.ruoyi.plus/guide/migration>。

## 常用做法速查

| 要做的 | 用什么 |
|---|---|
| 服务商下拉 | `vendors(&[Kind::Chat])`，按厂商聚合；`is_local` 区分「去申请密钥」和「先启动服务」 |
| 选中后预填 | `preset_by_key(key)` → `base_url`（`None` 表示让用户填）/ `model` / `models` / `apply_url` |
| 已存 / 导入的地址认回预置 | 对话 `preset::infer_preset_key(protocol, base_url)`；生图 / 视频 / 配音用 `preset::infer_preset_key_for(kind, protocol, base_url)`（0.1.4 起）。不要自己遍历 `match_hosts`：同一个 host 横跨多种能力 |
| 获取模型 | `Verifier::verify(cfg).await` → `VerifyOk { models, dropped, model_in_list, limits, .. }` |
| 粘贴导入 | `parse_profiles(text, 兜底模型)` → 列表；`skipped > 0` 要告诉用户 |
| 分享 | `to_profile(name, protocol, base_url, api_key, model)` |
| 对话地址 | `endpoint::join_chat_endpoint(base, "chat/completions" \| "messages")` |
| 限额 | `TokenLimits` 逐字段 `or` 叠加：用户 > 端点上报 > `preset::model_limits(..)` |
| 裁历史 | 消息结构实现 `history::HistoryMessage` → `history_budget` + `trim_history`；`dropped > 0` 要提示用户 |
| 超长重试 | `history::is_context_overflow(status, body)` → `retry_budget(&msgs)` 再裁，最多三次 |
| 翻译 / 摘要关思考 | `preset::thinking_off_params(protocol, base_url)`（0.1.7 起）→ 键并进请求体顶层、已有不覆盖；`None` 就什么都不发；请求被拒（4xx）时去掉这些字段重试一次。不要按模型名自己猜参数（OpenAI 官方遇到不认识的参数直接 400） |
| 生图 / 视频 / 配音 | `media::image::AnyImageProvider` / `media::video::AnyVideoProvider` / `media::tts::synthesize_with`，代理走 `media::MediaHttp::from_fn`。生图的 `size` 是请求值，火山方舟 / OpenAI 官方不认，记录尺寸要从返回的字节读 |

每一行在示例目录里都有能编译的完整代码，照着改比从文档片段拼更可靠。

## 完成后

- 删掉本项目里被本库取代的旧实现（不是「不再调用」，是删掉），避免以后有人又改回去
- 跑本项目的全量测试；已发布的项目再做一次真实库副本的迁移演练