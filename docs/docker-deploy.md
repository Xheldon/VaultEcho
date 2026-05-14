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
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-another-long-random-password
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
OBSIDIAN_HEADLESS_VERSION=0.0.8
```

`API_TOKEN` 是外部系统调用 `/v1/api/...` 的 Bearer Token。`ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 用于 Web 管理页、`/v1/config` 和 `/health` 的 Basic Auth。`APP_ENCRYPTION_KEY` 用来加密 Web UI 里保存的 embedding API Key，必须稳定保存；如果丢失或更换，旧的加密 Key 无法解密。可以用下面的命令生成：

```bash
openssl rand -base64 32
```

Vault Root、Data Dir、Daily Note 时段规则、Embedding 模型等运行配置不放在 `.env`，启动后进入 Web UI 修改。

在 Linux VPS 上先创建挂载目录；因为容器不再以 root 运行，建议让当前部署用户拥有这些目录：

```bash
mkdir -p vault data obsidian-config
sudo chown -R "$(id -u):$(id -g)" vault data obsidian-config
```

## 3. 启动写入 API

```bash
docker compose up -d --build vaultecho
```

打开：

```text
http://your-vps-ip:8787/
```

浏览器会弹出 Basic Auth 登录框，使用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。登录后检查默认配置：

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
curl -X POST https://vault.example.com/v1/api/index/rebuild \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'
```

## 4. 初始化 Obsidian Headless

这里使用的是 npm 上的社区包 `obsidian-headless`，不是 Obsidian 官方 CLI。固定版本只能避免重启时自动升级到未知 latest，不能替代 Vault 备份。正式使用前建议让 Vault 处在可回滚状态，例如定期把 `./vault` 提交到私有 Git 仓库，或至少保留 VPS 快照/目录备份。

如果你使用交互式登录：

```bash
docker compose --profile sync build obsidian-headless
docker compose --profile sync run --rm obsidian-headless ob login
docker compose --profile sync run --rm obsidian-headless ob sync-list-remote
docker compose --profile sync run --rm obsidian-headless ob sync-setup --vault "Your Test Vault" --path /vault
```

如果你使用非交互 token，先在 shell 里设置：

```bash
export OBSIDIAN_AUTH_TOKEN="your-auth-token"
```

再执行：

```bash
docker compose --profile sync build obsidian-headless
docker compose --profile sync run --rm obsidian-headless ob sync-list-remote
docker compose --profile sync run --rm obsidian-headless ob sync-setup --vault "Your Test Vault" --path /vault
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

`obsidian-headless` 不再在容器启动时执行 `npm install -g obsidian-headless`，而是在镜像构建阶段按 `.env` 里的 `OBSIDIAN_HEADLESS_VERSION` 固定安装。升级时先改版本号，再重新 build。

## 6. 暴露到公网

生产环境至少要满足：

- HTTPS。
- 强随机 `API_TOKEN`。
- 不要直接开放 Docker daemon。
- 不要把 `8787` 直接暴露到公网。
- 建议通过 Nginx/Caddy/Cloudflare Tunnel 暴露 `vaultecho`。
- 只允许 Coze 或你自己的自动化服务调用 `/v1/api/...`。

`docker-compose.yml` 已经把端口绑定到本机：

```text
http://127.0.0.1:8787
```

Nginx 保持最小配置即可，使用独立域名，不设置 `default_server`，也不要改 `stream` 配置，这样不会影响 VPS 上的 sing-box：

```nginx
limit_req_zone $binary_remote_addr zone=vaultecho_api:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=vaultecho_admin:10m rate=1r/s;

server {
    listen 443 ssl http2;
    server_name vault.example.com;

    ssl_certificate /etc/letsencrypt/live/vault.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/vault.example.com/privkey.pem;

    client_max_body_size 10m;

    location /v1/api/ {
        limit_req zone=vaultecho_api burst=20 nodelay;
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        limit_req zone=vaultecho_admin burst=5 nodelay;
        proxy_pass http://127.0.0.1:8787;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果 sing-box 已经占用 `443`，不要让 Nginx 抢端口。可以让 Nginx 监听另一个端口，或用 Cloudflare Tunnel 指向 `http://127.0.0.1:8787`。无论哪种方式，安全边界都保持为：公网只进反代或 Tunnel，源站 `8787` 只允许本机访问。

如果你用 `ufw`，可以额外明确拒绝公网访问源站端口：

```bash
sudo ufw deny 8787/tcp
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
- `data/idempotency` 是防重复写入记录，服务会清理 30 天前的记录；它不需要重点备份，丢失的影响主要是旧请求可能无法继续去重。
- `data/index` 是本地 embedding 索引，可删除后重建，但会重新消耗远程 embedding API 调用。
- `.env` 是服务密钥。它和 `data/config.json` 同机保存时，`APP_ENCRYPTION_KEY` 的主要作用是防止 API Key 被配置文件或日志意外明文泄露，不是防主机入侵。生产上不要把 `.env` 提交到 Git。
