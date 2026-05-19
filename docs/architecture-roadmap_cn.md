# VaultEcho 项目边界和路线

VaultEcho 的核心定位是强绑定 Obsidian 的 Vault 读写与智能反馈网关。它假设目标 Vault 是一个已经由 Obsidian Headless Sync 管理的本地目录，但它自己不安装、不运行、也不登录 Obsidian Headless。

## 一句话架构

```text
输入端 -> Coze/n8n/快捷指令 -> VaultEcho API -> 挂载的 Vault 文件系统 -> Obsidian Headless Sync
                                      \
                                       -> embedding index -> scheduled AI tasks -> Vault or webhook
```

## 当前边界

本服务负责：

- 接收外部系统已经处理好的写入意图。
- 对 Vault 内 Markdown 做安全的新建、覆盖、追加、heading 写入、frontmatter 修改和软删除。
- 把 Obsidian 的模板、Daily Note、heading、YAML frontmatter 等概念作为一等 API 能力。
- 对 Vault 做轻量索引，支持后续 AI 任务读取上下文。
- 调用远程 embedding API，保存本地语义索引。
- 运行带语义召回的定时回顾任务，并向 Vault 中的模板化 Markdown 回顾文件追加记录。

本服务不负责：

- 替代 Coze/n8n 的复杂拖拽工作流。
- 安装 Obsidian Headless、执行 `ob login`、保存 Obsidian 账号凭据。
- 管理 Obsidian Sync 冲突，或保证某次写入已经被 Headless 同步。
- 在 1C2G VPS 上跑本地大模型或本地 embedding 模型。
- 作为多租户 SaaS。
- 在后台调用 Claude Code/Codex CLI 做生产任务。
- 执行用户传入的任意 JavaScript 或 shell 脚本。

## 为什么先用远程 embedding

目标部署环境是个人 VPS，典型规格可能只有 1C2G/30G。这个规格可以稳定运行：

- Node.js API 服务。
- 外部运行的 Obsidian Headless Sync 进程。
- JSON/SQLite 级别的本地索引。
- 定时 AI 任务。
- 远程 OpenAI-compatible API 调用，包括给兼容网关使用的 Chat Completions，以及给 OpenAI 官方前沿模型使用的 Responses API。

这个规格不适合稳定运行：

- 本地大模型。
- 本地 embedding 大模型。
- Qdrant、Elasticsearch 这类常驻重服务。
- 多用户并发 agent。

因此第一版 embedding 设计是：

- 用户在 Web UI 配置 OpenAI-compatible `/embeddings` API。
- 服务端把 API Key 用 `APP_ENCRYPTION_KEY` 加密后保存。
- Markdown 被切成小块。
- 每个块调用远程 embedding API。
- 索引写到 `/data/index/embeddings.json`。

后续如果 Vault 明显变大，可以把索引存储替换成 SQLite 或专用向量库，但公开 API 不需要改变。

## 索引触发策略

当前支持三种触发：

- 手动重建：`POST /v1/api/index/rebuild`，适合首次部署和大规模补偿。
- 单文件索引：`POST /v1/api/index/file`，适合调试或外部脚本更新单篇笔记。
- 写入后自动索引：开启 `autoIndexAfterWrite` 后，VaultEcho API 修改某个 Markdown 文件时会异步更新该文件索引。

外部 Headless Sync 从远端拉下来的变更不是通过本服务写入的，因此需要：

- 手动重建索引，或
- 配置 `autoScanIntervalMinutes` 定期扫描并增量补偿。

## 内置 Review Tasks

VaultEcho 当前内置的是面向回顾闭环的小型任务运行器，不是通用拖拽工作流编辑器：

```text
Task Schedule -> Period Source Notes -> Semantic Recall -> Prompt -> Chat Model -> Managed Markdown Output
```

第一版任务模型支持：

- 周、月、季、年周期。
- 按配置的用户时区计算每个任务自己的精确运行时间。
- 从 Daily、Inbox、Notes、Ideas、Projects 等来源目录读取周期内容。
- 按需从本地 embedding 索引做语义召回。
- 用户可编辑提示词。
- 在配置的 Vault 路径维护模板化回顾文件，例如 `Reviews/Weekly/{{YYYY}}-W{{WW}}.md`，每次运行追加一段新记录。

调度器不会每分钟轮询。它会计算下一个启用任务的运行时间，睡到该时间后对到期任务按周期只运行一次，把运行记录写入 `data/review-runs.json`，然后再计算下一次唤醒。

后续高价值扩展：

- Inbox 自动分拣建议。
- 项目 open loops 提醒。
- 增加 webhook 输出。
- 增加 heading、tag、saved search 等来源选择器。
- 在回顾输出块格式稳定后，再增加低风险的 daily note 总结块自动写入。

## 安全原则

- 外部 VaultEcho API 使用 `Authorization: Bearer <API_TOKEN>`。
- Web UI、`/v1/config` 和 `/health` 使用独立 Basic Auth，不和外部 API 调用复用 Bearer Token。
- AI Provider API Key 必须加密保存。
- AI 自动写回应保留来源信息，例如 `ai_generated`、`ai_task`、`model`、`source_range`。
- 高风险输出先写入 `AI/Drafts` 或 `AI/Reports`，低风险输出才自动写回原笔记。

这条路线可以把 Vault 从“只会接收内容的容器”推进到“会主动召回、总结和反馈的个人知识代理”，同时不把项目做成无法在小 VPS 上维护的通用平台。
