# VaultEcho 项目边界和路线

VaultEcho 的核心定位是个人 Obsidian Vault 的读写与智能反馈网关，不是 Coze、n8n 或 Claude Code 的替代品。

## 一句话架构

```text
输入端 -> Coze/n8n/快捷指令 -> VaultEcho API -> Vault 文件系统 -> Obsidian Headless Sync
                                      |
                                      v
                              Index / AI Task / Webhook
```

## 当前边界

本服务负责：

- 接收外部系统已经处理好的写入意图。
- 对 Vault 内 Markdown 做安全的新建、覆盖、追加、heading 写入、frontmatter 修改和软删除。
- 对 Vault 做轻量索引，支持后续 AI 任务读取上下文。
- 调用远程 embedding API，保存本地语义索引。
- 把 AI 任务结果写回 Vault 或发送到 webhook。

本服务不负责：

- 替代 Coze/n8n 的复杂拖拽工作流。
- 在 1C2G VPS 上跑本地大模型或本地 embedding 模型。
- 作为多租户 SaaS。
- 在后台调用 Claude Code/Codex CLI 做生产任务。
- 执行用户传入的任意 JavaScript 或 shell 脚本。

## 为什么先用远程 embedding

目标部署环境是个人 VPS，典型规格可能只有 1C2G/30G。这个规格可以稳定运行：

- Node.js API 服务。
- Obsidian Headless Sync。
- JSON/SQLite 级别的本地索引。
- 定时 AI 任务。
- 远程 Claude/OpenAI-compatible API 调用。

这个规格不适合稳定运行：

- 本地大模型。
- 本地 embedding 大模型。
- Qdrant、Elasticsearch 这类常驻重服务。
- 多用户并发 agent。

因此第一版 embedding 设计是：

- 用户在 Web UI 配置 OpenAI-compatible embedding API。
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

Headless Sync 从远端拉下来的变更不是通过本服务写入的，因此需要：

- 手动重建索引，或
- 配置 `autoScanIntervalMinutes` 定期扫描并增量补偿。

## AI Task 的下一步形态

不要先做通用工作流编辑器。下一阶段建议只做一个轻量 AI Task Runner：

```text
Context Selector -> Prompt Profile -> Model Provider -> Output Sink
```

最小任务模型：

- `Context Selector`: 从索引或文件系统选择最近 N 天、某目录、某 daily note、某 heading、某 tag 的内容。
- `Prompt Profile`: 用户可编辑提示词，内置少量默认任务。
- `Model Provider`: 远程 Claude/OpenAI-compatible Chat API。
- `Output Sink`: 写回指定文件、指定 heading、daily note 总结块，或发送 webhook。

优先内置的任务：

- 昨日新增内容总结。
- 昨日日记情绪总结，并写入那天的 `## 总结`。
- 最近 7 天思考主题雷达。
- Inbox 自动分拣建议。
- 项目 open loops 提醒。

## 安全原则

- 外部 VaultEcho API 使用 `Authorization: Bearer <API_TOKEN>`。
- Web UI 后续应升级为登录页 + HttpOnly session cookie，不和外部 API 调用复用 Bearer Token。
- AI Provider API Key 必须加密保存。
- AI 自动写回应保留来源信息，例如 `ai_generated`、`ai_task`、`model`、`source_range`。
- 高风险输出先写入 `AI/Drafts` 或 `AI/Reports`，低风险输出才自动写回原笔记。

这条路线可以把 Vault 从“只会接收内容的容器”推进到“会主动召回、总结和反馈的个人知识代理”，同时不把项目做成无法在小 VPS 上维护的通用平台。
