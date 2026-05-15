# VaultEcho

Capture anything. Let your vault answer back.

VaultEcho 是一个强绑定 Obsidian 的采集与反馈网关：Coze、n8n、快捷指令或其他自动化平台把内容处理成结构化 JSON 后，调用这里的 API 写入一个已经由 Obsidian Headless Sync 管理的本地 Vault；VaultEcho 再负责索引、语义召回和定时 AI 回顾任务。

## 目标链路

```text
输入端（任意请求发送工具如 iPhone 快捷指令） -> VaultEcho API -> 远端 Vault -> Obsidian Headless Sync -> Obsidian Sync
```

第一版刻意不做 AI 工作流编辑器。Coze 负责转写、清洗、分流和生成写入意图；本服务只负责安全、可审计地写文件。

项目边界、embedding 设计和 Review Task 路线见 [docs/architecture-roadmap_cn.md](docs/architecture-roadmap_cn.md)。

Web 管理页配置项说明见 [docs/admin-config_cn.md](docs/admin-config_cn.md)。

Apple 快捷指令采集方案见 [docs/shortcuts_cn.md](docs/shortcuts_cn.md)。

## Obsidian Headless 前置条件

VaultEcho 有意强绑定 Obsidian。运行 VaultEcho 前，先用 Obsidian Headless Sync 准备好一个本地 Vault 目录，并让 `ob sync --continuous` 持续同步这个目录。

参考官方文档：

- [Obsidian Headless](https://help.obsidian.md/headless)
- [Headless Sync](https://help.obsidian.md/sync/headless)

VaultEcho 只需要一个可读写的本地 Vault 路径：

```text
/path/to/headless-vault
  由 Obsidian Headless Sync 管理
  在 VaultEcho Docker 中挂载为 /vault
```

VaultEcho 不负责安装 Headless、不登录 Obsidian、不管理 Obsidian 凭据。它只读写挂载进来的 Vault 文件；同步交给 Headless。

## 快速开始

```bash
cp .env.example .env
mkdir -p data
docker compose up -d --build vaultecho
```

正式启动 Docker 前，在 `.env` 中把 `OBSIDIAN_VAULT_PATH` 指向由 Obsidian Headless Sync 管理的本地 Vault 目录。然后打开配置页：

```text
http://localhost:8787/
```

`.env` 只保留必须由部署环境提供的秘密：

```env
API_TOKEN=change-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-admin
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
BIND_HOST=127.0.0.1
OBSIDIAN_VAULT_PATH=/path/to/headless-vault
```

`API_TOKEN` 用于 Coze、快捷指令等外部系统的 Bearer 鉴权。`ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 用于 Web 管理页、`/v1/config` 和 `/health` 的 Basic Auth。`APP_ENCRYPTION_KEY` 用于加密 Web UI 中保存的 embedding API Key，生成后要保持稳定，不能每次重启都换。Vault Root、Data Dir、Daily Note、Embedding 模型等运行配置在 Web UI 中修改。Docker 会保存到 `data/docker-config.json`；本机 `npm start` 会保存到 `data/config.json`。

`BIND_HOST` 默认是 `127.0.0.1`，直接在 VPS 上 `npm start` 时不会裸露到公网。Docker Compose 会在容器内覆盖为 `0.0.0.0`，但宿主机端口仍只绑定到 `127.0.0.1:8787`。

如果你已有一个桌面 Obsidian 正在使用的 Vault，建议 Headless 使用另一个本地目录：

```text
目录 A: /Users/x/Obsidian/Xheldon
  桌面 Obsidian 使用

目录 B: /path/to/headless-vault
  Headless Sync 和本服务使用
```

目录 B 可以对应一个全新的测试 Sync Vault。不要让桌面 Obsidian 和 Headless Sync 在同一台机器上管理同一个本地目录。

## Web 配置

管理页使用 Vue/Vite + Element Plus 构建，构建产物由服务端从 `public/admin` 输出。Docker 镜像构建时会自动生成；本机 `npm start` 前，如果改过 `admin/` 下的文件，先运行 `npm run admin:build`。

配置页支持修改：

- 语言切换：默认英文，也可以切到中文，选择保存在浏览器 localStorage。
- 管理页访问：浏览器 Basic Auth，来自 `.env` 中的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。
- `Vault Root`: 要写入的本地 Vault 目录。本机默认是项目下的 `vault/`，Docker 默认是 `/vault`。
- `Data Dir`: 幂等记录和运行配置目录。本机默认是项目下的 `data/`，Docker 默认是 `/data`。
- `Time Zone`: 用户时区。它会同时影响日记路径解析、按时间段插入，以及定时回顾任务。
- `Allowed Top-Level Dirs`: 路径白名单，可从刷新到的 Vault 顶层目录中选择，也保留自定义目录入口。
- `Max JSON Body Bytes`: 请求体大小限制。
- `Image Attachment Dir`: 图片附件默认目录，默认 `Attachments/Images`。
- `Audio Attachment Dir`: 音频附件默认目录，默认 `Attachments/Audio`。
- `日记时间戳插入位置设置`: 默认折叠。包含日记文件路径模板、日记模板文件、缺失时自动新建、heading 层级、互不重叠的时间段、Line Format、Line Pattern，以及时间戳条目之间是否保留空行，用于 `daily/append-by-time` 这类按时间戳写入日记 heading 的接口。
- `Embedding`: 可配置 OpenAI-compatible embedding API 的 Base URL、Model、API Key、切块大小、批量大小和自动扫描间隔。
- `AI Model`: 可配置 OpenAI-compatible Chat API，供内置回顾任务调用。
- `Review Tasks`: 默认折叠。配置周、月、季、年 AI 回顾任务，包括来源目录、语义召回、提示词、运行时间和输出路径。

Embedding 第一版使用远程 API 生成向量，并把索引保存到 `data/index/embeddings.json`。这让 1C2G VPS 可以运行，不需要本地大模型、Qdrant、Elasticsearch 或数据库扩展。写入 API 修改文件后会按配置自动更新该文件索引；Headless Sync 从远端拉下来的变化可通过“重建索引”按钮或自动扫描间隔补偿。

Review Tasks 使用任务自己的精确调度时间，不是每分钟轮询。调度器会按配置的用户时区计算下一个启用任务的运行时间，睡到该时间后读取周期内的笔记，按需从 embedding 索引做语义召回，调用配置的 AI 模型，再把结果写入配置的输出文件中的受管理 Markdown 块。

## Docker

详见 [docs/docker-deploy_cn.md](docs/docker-deploy_cn.md)。

最小启动：

```bash
cp .env.example .env
mkdir -p vault data
docker compose up -d --build vaultecho
```

正式使用时，在 `.env` 中把 `OBSIDIAN_VAULT_PATH` 指向已经由 Obsidian Headless Sync 管理的 Vault 目录：

```env
OBSIDIAN_VAULT_PATH=/srv/obsidian/my-vault
```

Docker Compose 会把该路径挂载到 VaultEcho 容器内的 `/vault`。Docker Compose 默认只把 VaultEcho 绑定到 `127.0.0.1:8787`。公网访问应通过 Nginx/Caddy/Cloudflare Tunnel 反代进来，不要直接开放 `8787` 到公网。

## API

公开接口统一收敛到一个命名空间：

```http
/v1/api/<resource>/<action>
Authorization: Bearer <API_TOKEN>
```

不再暴露单独的 `/v1/uri`、`/v1/restful`、`/v1/operations`。Obsidian URI 和 Local REST API 的能力被拆成 `/v1/api` 下的具体资源动作，避免不同路径之间能力割裂。

完整接口说明、用例和适用场景见 [docs/api_cn.md](docs/api_cn.md)。该文件由 [src/api-spec.js](src/api-spec.js) 生成，不要手改。修改接口时更新 `api-spec.js` 后运行：

```bash
npm run docs:api
```

Postman 集合见 [docs/postman/VaultEcho_cn.postman_collection.json](docs/postman/VaultEcho_cn.postman_collection.json)。修改集合生成逻辑后运行：

```bash
npm run docs:postman
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

`insert-after-last-matching-line` 使用 Web 配置里的 Daily Note `Line Pattern`，不接受请求体覆盖：

```bash
curl -X POST http://localhost:8787/v1/api/headings/insert-after-last-matching-line \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "下午",
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

如果 `16:21` 命中 `下午`，会插到 `## 下午` 下最后一条 `[HH:mm]` 行之后。Web UI 可以控制日记路径模板、heading 层级、缺失日记使用的模板，以及时间戳条目之间是否保留空行。

如果不传 `at`，VaultEcho 使用服务器当前时间，并按配置的用户时区来决定当天日记和命中的时间段。`at` 仍适合补写、测试，或上游系统采集时间早于请求时间的场景。

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

### Review Tasks

Review Tasks 把 Vault 从被动存储推进到主动反馈。任务会选定一个周期，读取相关笔记，按需召回历史上语义相关的内容，调用配置的 AI 模型，然后把结果写入配置输出文件中的受管理块。

```bash
curl http://localhost:8787/v1/api/reviews/status \
  -H "Authorization: Bearer change-me"

curl -X POST http://localhost:8787/v1/api/reviews/run \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "taskId": "weekly-review" }'
```

默认任务在你配置 AI 模型、embedding 模型和回顾提示词前都是关闭状态。如果语义召回暂时不可用，任务仍会用周期内笔记运行，并在结果里返回 warning。

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
- 只允许写入已配置的顶层目录白名单。新配置会尽量从当前 Vault 已有顶层目录初始化该白名单。
- 每个写入请求必须带 Bearer Token。
- 支持 `idempotencyKey`，避免 Coze 或 webhook 重试导致重复写入。
- 同一进程内按目标文件串行写入，避免并发修改同一篇日记。
