# VaultEcho

Capture anything. Let your vault answer back.

VaultEcho 是一个最小化的个人 Vault 写入与反馈网关：Coze、n8n、快捷指令或其他自动化平台把内容处理成结构化 JSON 后，调用这里的 API 写入本地 Obsidian Vault；VaultEcho 再负责索引、语义召回和后续 AI 反馈任务，最终由 Obsidian Headless Sync 同步到 Obsidian Sync。

## 目标链路

```text
输入端 -> Coze 工作流 -> VaultEcho API -> 本地 Vault -> Obsidian Headless Sync -> Obsidian
```

第一版刻意不做 AI 工作流编辑器。Coze 负责转写、清洗、分流和生成写入意图；本服务只负责安全、可审计地写文件。

项目边界、embedding 设计和后续 AI Task 路线见 [docs/architecture-roadmap.md](docs/architecture-roadmap.md)。

## 快速开始

```bash
cp .env.example .env
npm test
npm start
```

打开配置页：

```text
http://localhost:8787/
```

`.env` 只保留必须由部署环境提供的秘密：

```env
API_TOKEN=change-me
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
```

`API_TOKEN` 用于 Coze、快捷指令等外部系统的 Bearer 鉴权。`APP_ENCRYPTION_KEY` 用于加密 Web UI 中保存的 embedding API Key，生成后要保持稳定，不能每次重启都换。Vault Root、Data Dir、Daily Note、Embedding 模型等运行配置在 Web UI 中修改，会保存到 `data/config.json`。本机 `npm start` 会通过 Node 22 的 `--env-file=.env` 自动读取 `.env`。

如果你已有一个桌面 Obsidian 正在使用的 Vault，建议 Headless 测试使用另一个本地目录：

```text
目录 A: /Users/x/Obsidian/Xheldon
  桌面 Obsidian 使用

目录 B: /Users/x/Developer/VaultEcho/vault
  Headless Sync 和本服务使用
```

目录 B 可以对应一个全新的测试 Sync Vault。不要让桌面 Obsidian 同时打开并同步目录 B。

## Web 配置

配置页支持修改：

- `Vault Root`: 要写入的本地 Vault 目录。本机默认是项目下的 `vault/`，Docker 默认是 `/vault`。
- `Data Dir`: 幂等记录和运行配置目录。本机默认是项目下的 `data/`，Docker 默认是 `/data`。
- `Allowed Top-Level Dirs`: 路径白名单，例如 `Inbox,Notes,Ideas,Projects,Daily,Templates,Attachments,Archive`。
- `Max JSON Body Bytes`: 请求体大小限制。
- `Daily Note Path Template`: 默认 `Daily/{{yyyy-MM-dd}}.md`。
- `Daily Note Time Zone`: 默认 `Asia/Shanghai`。
- `Daily Note Slots`: 默认 `上午 05:00-11:59`、`下午 12:00-17:59`、`晚上 18:00-04:59`。
- `Line Format`: 默认 `[{{HH:mm}}] {{content}}`。
- `Line Pattern`: 默认 `^\\[\\d{2}:\\d{2}\\]`，用来找 heading 下最后一条时间行。
- `Embedding`: 可配置 OpenAI-compatible embedding API 的 Base URL、Model、API Key、切块大小、批量大小和自动扫描间隔。

Embedding 第一版使用远程 API 生成向量，并把索引保存到 `data/index/embeddings.json`。这让 1C2G VPS 可以运行，不需要本地大模型、Qdrant、Elasticsearch 或数据库扩展。写入 API 修改文件后会按配置自动更新该文件索引；Headless Sync 从远端拉下来的变化可通过“重建索引”按钮或自动扫描间隔补偿。

## Docker

详见 [docs/docker-deploy.md](docs/docker-deploy.md)。

最小启动：

```bash
cp .env.example .env
docker compose up -d --build vaultecho
```

启用 Obsidian Headless Sync：

```bash
export OBSIDIAN_AUTH_TOKEN="your-token"
docker compose --profile sync up -d --build
```

首次使用 Obsidian Headless 前，需要先完成远端 Vault 配置，例如在容器内执行 `ob sync-list-remote` 和 `ob sync-setup --vault "Your Vault" --path /vault`。官方 Headless Sync 目前是 open beta，使用前先备份 Vault，并避免在同一设备上同时使用桌面端 Sync 和 Headless Sync 同步同一个 Vault。

## API

公开接口统一收敛到一个命名空间：

```http
/v1/api/<resource>/<action>
Authorization: Bearer <API_TOKEN>
```

不再暴露单独的 `/v1/uri`、`/v1/restful`、`/v1/operations`。Obsidian URI 和 Local REST API 的能力被拆成 `/v1/api` 下的具体资源动作，避免不同路径之间能力割裂。

完整接口说明、用例和适用场景见 [docs/api.md](docs/api.md)。该文件由 [src/api-spec.js](src/api-spec.js) 生成，不要手改。修改接口时更新 `api-spec.js` 后运行：

```bash
npm run docs:api
```

测试会校验实现路由和文档路由一致，并检查生成文档是否最新。

### Files

```bash
curl -X POST http://localhost:8787/v1/api/files/create \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Ideas/api-note.md",
    "content": "Hello",
    "ifExists": "append_suffix"
  }'
```

支持：

- `files/create`: 新建 Markdown，`ifExists` 支持 `fail`、`overwrite`、`append_suffix`。
- `files/read`: 读取文件。
- `files/write`: 覆盖写入文件。
- `files/append`: 追加到文件尾部。
- `files/prepend`: 插入到文件头部。
- `files/delete`: 软删除到 `Archive/Deleted/`。
- `files/list`: 列目录。

兼容短别名仍可用，例如 `/v1/api/new`、`/v1/api/read`、`/v1/api/append`，但推荐新接入使用资源化路径。

### Headings

```bash
curl -X POST http://localhost:8787/v1/api/headings/append \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "下午",
    "content": "[16:21] 继续验证自动插入逻辑"
  }'
```

支持：

- `headings/read`
- `headings/append`
- `headings/prepend`
- `headings/replace`
- `headings/insert-after-last-matching-line`

`insert-after-last-matching-line` 适合你的日记格式：

```bash
curl -X POST http://localhost:8787/v1/api/headings/insert-after-last-matching-line \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "下午",
    "linePattern": "^\\[\\d{2}:\\d{2}\\]",
    "content": "[16:21] 在折腾 Obsidian 自动化"
  }'
```

### Daily

这是 Coze 写日记最推荐的接口。Coze 只传处理后的正文，本服务根据配置里的时区和时段决定写入哪个 heading。

```bash
curl -X POST http://localhost:8787/v1/api/daily/append-by-time \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "at": "2026-05-13T16:21:00+08:00",
    "content": "在折腾 Obsidian 的多人日记录云端处理自动化方案，嘿嘿",
    "idempotencyKey": "daily-20260513-1621"
  }'
```

如果 `16:21` 命中 `下午`，会插到 `## 下午` 下最后一条 `[HH:mm]` 行之后。

### Frontmatter

```bash
curl -X POST http://localhost:8787/v1/api/frontmatter/set \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Ideas/api-note.md",
    "key": "status",
    "value": "draft"
  }'
```

支持：

- `frontmatter/get`
- `frontmatter/set`

### Search And Tags

```bash
curl -X POST http://localhost:8787/v1/api/search/simple \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "query": "Obsidian" }'

curl http://localhost:8787/v1/api/tags/list \
  -H "Authorization: Bearer change-me"
```

语义搜索需要先在 Web UI 配置 embedding，并重建索引：

```bash
curl -X POST http://localhost:8787/v1/api/index/rebuild \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'

curl -X POST http://localhost:8787/v1/api/search/semantic \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "query": "最近我在思考的 Obsidian 自动化方案", "limit": 5 }'
```

### Batch

需要一次请求做多步操作时，用 `batch`，不要传可执行脚本。

```bash
curl -X POST http://localhost:8787/v1/api/batch \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      {
        "route": "files/write",
        "path": "Ideas/batch-demo.md",
        "content": "## Log\n"
      },
      {
        "route": "headings/append",
        "path": "Ideas/batch-demo.md",
        "heading": "Log",
        "content": "Item"
      }
    ]
  }'
```

### Post Script

`script` 参数保留为受限 JSON DSL，只能调用白名单 operation，不能执行任意 JavaScript。

```bash
SCRIPT=$(node -e 'process.stdout.write(encodeURIComponent(JSON.stringify({
  operations: [
    { op: "append", path: "Daily/2026-05-13.md", content: "- Created {{path}}\\n" }
  ]
})))')

curl -X POST "http://localhost:8787/v1/api/files/create?path=Ideas/script-demo.md&script=$SCRIPT" \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: text/plain" \
  --data "主请求正文"
```

`script=fs.rmSync(...)` 这类可执行代码会被拒绝。原因是它会变成远程代码执行，不能靠“cwd 限在 Vault”保证安全。

### URI Compatibility

需要消费 Obsidian URI 时，走统一命名空间里的 `uri/execute`：

```bash
curl -X POST http://localhost:8787/v1/api/uri/execute \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "obsidian://new?file=Ideas%2Furi-demo&content=Hello%20URI"
  }'
```

### Unsupported Desktop Features

`obsidian-local-rest-api` 可以调用桌面 Obsidian 的 `workspace`、`commands`、`metadataCache` 和插件运行时。Headless 服务没有这些对象，所以这些能力不会伪装成功：

- active file
- command palette / execute command
- open file in Obsidian UI
- Dataview DQL / JsonLogic

## 安全边界

- 路径只能是 Vault 内的相对路径，拒绝绝对路径和 `../`。
- 默认只允许写入 `Inbox`、`Notes`、`Ideas`、`Projects`、`Daily`、`Attachments`、`Archive`。
- 每个写入请求必须带 Bearer Token。
- 支持 `idempotencyKey`，避免 Coze 或 webhook 重试导致重复写入。
- 同一进程内按目标文件串行写入，避免并发修改同一篇日记。
