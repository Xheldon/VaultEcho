# Docker 部署

这个项目的 Docker 形态包含两个服务：

```text
vaultecho
  接收 Coze/n8n/curl 请求，直接修改 /vault 里的 Markdown 文件

obsidian-headless
  在同一个 /vault 上运行 ob sync --continuous
```

写入流程是：`vaultecho` 先把文件写到本地 `/vault`，然后 `obsidian-headless` 监听同一个目录并同步到 Obsidian Sync。

## 1. 准备 VPS

要求：

- Docker 和 Docker Compose。
- 一个 Obsidian Sync 订阅。
- 一个专门给 Headless 用的远端 Vault。不要让同一台设备上的桌面 Obsidian 同时同步这个 Vault。

官方 Headless 文档强调它仍然是 open beta，并提醒不要在同一台设备上同时使用桌面端 Sync 和 Headless Sync 同步同一个设备环境，避免冲突。

## 2. 配置 API Token

```bash
cp .env.example .env
```

编辑 `.env`：

```env
API_TOKEN=replace-with-a-long-random-token
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
```

`API_TOKEN` 是外部系统调用 `/v1/api/...` 的 Bearer Token。`APP_ENCRYPTION_KEY` 用来加密 Web UI 里保存的 embedding API Key，必须稳定保存；如果丢失或更换，旧的加密 Key 无法解密。可以用下面的命令生成：

```bash
openssl rand -base64 32
```

Vault Root、Data Dir、Daily Note 时段规则、Embedding 模型等运行配置不放在 `.env`，启动后进入 Web UI 修改。

## 3. 启动写入 API

```bash
docker compose up -d --build vaultecho
```

打开：

```text
http://your-vps-ip:8787/
```

在页面中填入 `.env` 里的 `API_TOKEN`，然后检查默认配置：

```text
Vault Root: /vault
Data Dir: /data
Daily Note Path Template: Daily/{{yyyy-MM-dd}}.md
Time Zone: Asia/Shanghai
Slots:
  上午 05:00-11:59
  下午 12:00-17:59
  晚上 18:00-04:59
```

如果要启用语义搜索，在页面的 Embedding 区域配置：

```text
Enabled: on
Provider: openai-compatible
Base URL: https://api.openai.com/v1
Model: 你的 embedding 模型名
API Key: 对应服务商的 API Key
Auto Index After Write: on
Auto Scan Interval Minutes: 0 或一个大于 0 的间隔
```

第一版索引保存在 `/data/index/embeddings.json`。它使用远程 embedding API，不在 VPS 上跑本地模型，适合 1C2G/30G 的小机器。首次配置后可以在 Web UI 点击“重建索引”，或用 curl：

```bash
curl -X POST http://your-vps-ip:8787/v1/api/index/rebuild \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'
```

## 4. 初始化 Obsidian Headless

如果你使用交互式登录：

```bash
docker compose --profile sync run --rm obsidian-headless sh -lc "npm install -g obsidian-headless && ob login"
docker compose --profile sync run --rm obsidian-headless sh -lc "npm install -g obsidian-headless && ob sync-list-remote"
docker compose --profile sync run --rm obsidian-headless sh -lc "npm install -g obsidian-headless && ob sync-setup --vault \"Your Test Vault\" --path /vault"
```

如果你使用非交互 token，先在 shell 里设置：

```bash
export OBSIDIAN_AUTH_TOKEN="your-auth-token"
```

再执行：

```bash
docker compose --profile sync run --rm obsidian-headless sh -lc "npm install -g obsidian-headless && ob sync-list-remote"
docker compose --profile sync run --rm obsidian-headless sh -lc "npm install -g obsidian-headless && ob sync-setup --vault \"Your Test Vault\" --path /vault"
```

## 5. 启动连续同步

```bash
docker compose --profile sync up -d --build
```

查看日志：

```bash
docker compose logs -f vaultecho
docker compose logs -f obsidian-headless
```

## 6. 暴露到公网

生产环境至少要满足：

- HTTPS。
- 强随机 `API_TOKEN`。
- 不要直接开放 Docker daemon。
- 建议通过 Nginx/Caddy/Cloudflare Tunnel 暴露 `vaultecho`。
- 只允许 Coze 或你自己的自动化服务调用 `/v1/api/...`。

反代只需要转发到：

```text
http://127.0.0.1:8787
```

## 7. 备份和恢复

建议定期备份：

```text
./vault
./data
./obsidian-config
```

其中：

- `vault` 是本地 Obsidian Vault。
- `data/config.json` 是 Web UI 保存的运行配置。
- `data/idempotency` 是防重复写入记录。
- `data/index` 是本地 embedding 索引，可删除后重建，但会重新消耗远程 embedding API 调用。
