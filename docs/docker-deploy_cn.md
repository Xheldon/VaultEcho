# Docker 部署

VaultEcho 的 Docker 形态包含两个服务：

```text
vaultecho
  接收 Coze/n8n/curl 请求，直接修改 /vault 里的 Markdown 文件

obsidian-headless
  在同一个 /vault 上运行 ob sync --path /vault --continuous
```

写入流程是：

```text
外部输入 -> VaultEcho API -> /vault Markdown 文件 -> Obsidian Headless Sync -> Obsidian Sync
```

`obsidian-headless` 是 npm 上的社区包，不是 Obsidian 官方 CLI。项目固定安装 `.env` 里的 `OBSIDIAN_HEADLESS_VERSION`，避免容器重启时自动安装 latest，但这不能替代 Vault 备份。

## 1. 本地先试 VaultEcho API

进入项目目录：

```bash
cd path-to-this-repo-root-dir
```

准备环境变量和本地挂载目录：

```bash
cp .env.example .env
mkdir -p vault data obsidian-config
```

编辑 `.env`，至少改掉这些值：

```env
API_TOKEN=replace-with-a-long-random-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-another-long-random-password
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
OBSIDIAN_HEADLESS_VERSION=0.0.8
BIND_HOST=127.0.0.1
```

可以用下面命令生成随机值：

```bash
openssl rand -base64 32
```

启动 API 服务：

```bash
docker compose up -d --build vaultecho
docker compose ps
docker compose logs -f vaultecho
```

打开管理页：

```text
http://127.0.0.1:8787/
```

浏览器会弹出 Basic Auth 登录框，使用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。本地 Docker 默认配置应该是：

```text
Vault Root: /vault
Data Dir: /data
Image Attachment Dir: Attachments/Images
Audio Attachment Dir: Attachments/Audio
Daily Note Path Template: Daily/{{yyyy-MM-dd}}.md
Time Zone: Asia/Shanghai
Allowed Dirs: Inbox, Notes, Ideas, Projects, Daily, Templates, Attachments, Archive
```

Docker 会把运行配置保存到本地 `data/docker-config.json`。这个文件和本机 `npm start` 使用的 `data/config.json` 分开，避免容器读到 macOS 的 `/Users/...` 路径。

本地测试写入：

```bash
curl -X POST http://127.0.0.1:8787/v1/api/daily/append-by-time \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{
    "at": "2026-05-14T16:21:00+08:00",
    "content": "本地 Docker 写入测试",
    "idempotencyKey": "local-test-20260514-1621"
  }'
```

确认文件：

```bash
cat vault/Daily/2026-05-14.md
```

停止本地 API：

```bash
docker compose down
```

## 2. 本地可选试 Obsidian Headless

如果只是验证 API 写文件，第 1 步足够。要验证 Obsidian Sync，再继续本节。

建议用一个专门的测试 Sync Vault，不要让桌面 Obsidian 同时打开并同步这个 Headless 使用的本地目录。可以是：

```text
目录 A: 你的私人桌面 Vault
  桌面 Obsidian 使用

目录 B: path-to-this-repo-root-dir/vault
  VaultEcho + Obsidian Headless 使用
```

构建 Headless 镜像：

```bash
docker compose --profile sync build obsidian-headless
```

交互式登录 Obsidian：

```bash
docker compose --profile sync run --rm obsidian-headless ob login
```

登录状态会保存在本地 `./obsidian-config`，对应容器里的 `/home/node/.config`。

列出远端 Sync Vault：

```bash
docker compose --profile sync run --rm obsidian-headless ob sync-list-remote
```

把远端测试 Vault 绑定到容器内 `/vault`：

```bash
docker compose --profile sync run --rm obsidian-headless ob sync-setup --vault "Your Test Vault" --path /vault
```

启动 API + 连续同步：

```bash
docker compose --profile sync up -d --build
docker compose --profile sync logs -f obsidian-headless
```

之后调用 VaultEcho 写入 `/vault`，Headless 会通过 `ob sync --path /vault --continuous` 同步。

## 3. VPS 准备

下面默认 VPS 是 Ubuntu 或 Debian。1C2G/30G 可以跑本项目，因为 embedding 使用远程 API，不在 VPS 上跑本地模型。

安装 Docker、Compose、Nginx 和 Certbot：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
. /etc/os-release
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/${ID} ${VERSION_CODENAME} stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
newgrp docker
```

检查：

```bash
docker --version
docker compose version
nginx -v
```

准备部署目录：

```bash
sudo mkdir -p /opt/vaultecho
sudo chown -R "$USER:$USER" /opt/vaultecho
cd /opt/vaultecho
```

把项目放到 `/opt/vaultecho`。如果已经推到 GitHub：

```bash
git clone <your-repo-url> .
```

如果还没有远端仓库，可以先在本机执行下面的命令，把目录同步到 VPS：

```bash
rsync -av --exclude node_modules --exclude .git /Users/{local-valutecho-dir}/ user@your-vps:/opt/vaultecho/
```

## 4. VPS 配置 VaultEcho

在 VPS 的 `/opt/vaultecho`：

```bash
cp .env.example .env
mkdir -p vault data obsidian-config
sudo chown -R "$(id -u):$(id -g)" vault data obsidian-config
```

编辑 `.env`：

```env
API_TOKEN=replace-with-a-long-random-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-another-long-random-password
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
OBSIDIAN_HEADLESS_VERSION=0.0.8
BIND_HOST=127.0.0.1
```

说明：

- `API_TOKEN`：Coze、快捷指令、curl 等外部系统调用 `/v1/api/...` 的 Bearer Token。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：Web 管理页、`/v1/config`、`/health` 的 Basic Auth。
- `APP_ENCRYPTION_KEY`：用于加密 Web UI 中保存的 embedding API Key。生成后保持稳定，换掉后旧 key 无法解密。
- `BIND_HOST`：直接 `npm start` 时生效。Docker Compose 会在容器内覆盖为 `0.0.0.0`，但宿主机端口仍只绑定到 `127.0.0.1:8787`。

启动 VaultEcho API：

```bash
docker compose up -d --build vaultecho
docker compose ps
docker compose logs -f vaultecho
```

在 VPS 本机验证：

```bash
curl -i http://127.0.0.1:8787/health -u admin:replace-with-another-long-random-password
```

## 5. VPS 初始化 Obsidian Headless

构建镜像：

```bash
docker compose --profile sync build obsidian-headless
```

交互式登录：

```bash
docker compose --profile sync run --rm obsidian-headless ob login
```

列出远端 Vault：

```bash
docker compose --profile sync run --rm obsidian-headless ob sync-list-remote
```

绑定你的测试 Sync Vault：

```bash
docker compose --profile sync run --rm obsidian-headless ob sync-setup --vault "Your Test Vault" --path /vault
```

启动 API + Headless 连续同步：

```bash
docker compose --profile sync up -d --build
docker compose --profile sync logs -f obsidian-headless
```

如果 `ob` 命令和文档不一致，先看当前固定版本的帮助：

```bash
docker compose --profile sync run --rm obsidian-headless ob --help
```

## 6. Nginx 反代

前提：

- 域名 `vault.example.com` 已解析到 VPS。
- Docker Compose 暴露的是 `127.0.0.1:8787:8787`，不要把 `8787` 直接开放到公网。
- 如果 VPS 上的 sing-box 已经占用 `443`，不要让 Nginx 抢 `443`。改用其他端口或 Cloudflare Tunnel。

先建一个站点配置：

```bash
sudo nano /etc/nginx/sites-available/vaultecho
```

写入：

```nginx
limit_req_zone $binary_remote_addr zone=vaultecho_api:10m rate=5r/s;
limit_req_zone $binary_remote_addr zone=vaultecho_admin:10m rate=1r/s;

server {
    listen 80;
    server_name vault.example.com;

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

启用站点：

```bash
sudo ln -s /etc/nginx/sites-available/vaultecho /etc/nginx/sites-enabled/vaultecho
sudo nginx -t
sudo systemctl reload nginx
```

申请 HTTPS 证书：

```bash
sudo certbot --nginx -d vault.example.com
```

Certbot 会把站点升级到 HTTPS。完成后再检查：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -i https://vault.example.com/health -u admin:replace-with-another-long-random-password
```

如果使用 `ufw`，建议只开放反代需要的端口，不开放源站 `8787`：

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw deny 8787/tcp
sudo ufw enable
sudo ufw status
```

这套 Nginx 配置只新增一个普通 `server`，不设置 `default_server`，不修改 `stream`，正常不会影响 sing-box。

## 7. Web UI 配置

打开：

```text
https://vault.example.com/
```

登录 Basic Auth 后检查：

```text
Vault Root: /vault
Data Dir: /data
Image Attachment Dir: Attachments/Images
Audio Attachment Dir: Attachments/Audio
Daily Note Path Template: Daily/{{yyyy-MM-dd}}.md
Time Zone: Asia/Shanghai
Slots:
  Morning 05:00-11:59
  Afternoon 12:00-17:59
  Evening 18:00-04:59
```

如果你的日记 heading 是中文，可以在 Web UI 里把 slot heading 改成 `上午` / `下午` / `晚上`。

如果要启用语义搜索，在 Embedding 区域配置：

```text
Enabled: on
Provider: openai-compatible
Base URL: https://api.openai.com/v1
Model: 你的 embedding 模型名
API Key: 对应服务商的 API Key
Auto Index After Write: on
Auto Scan Interval Minutes: 0 或一个大于 0 的间隔
```

首次配置后可以在 Web UI 点击“重建索引”，或用 curl：

```bash
curl -X POST https://vault.example.com/v1/api/index/rebuild \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'
```

## 8. 外部写入测试

Daily 写入：

```bash
curl -X POST https://vault.example.com/v1/api/daily/append-by-time \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{
    "at": "2026-05-14T16:21:00+08:00",
    "content": "VPS 写入测试",
    "idempotencyKey": "vps-test-20260514-1621"
  }'
```

读取：

```bash
curl "https://vault.example.com/v1/api/files/read?path=Daily/2026-05-14.md" \
  -H "Authorization: Bearer replace-with-a-long-random-token"
```

查看同步日志：

```bash
docker compose --profile sync logs -f obsidian-headless
```

## 9. 备份和恢复

建议定期备份：

```text
/opt/vaultecho/vault
/opt/vaultecho/data
/opt/vaultecho/obsidian-config
/opt/vaultecho/.env
```

说明：

- `vault` 是本地 Obsidian Vault。
- `data/config.json` 是 Web UI 保存的运行配置。
- `data/idempotency` 是防重复写入记录，会清理 30 天前的记录；它不需要重点备份，丢失的影响主要是旧请求可能无法继续去重。
- `data/index` 是本地 embedding 索引，可删除后重建，但会重新消耗远程 embedding API 调用。
- `.env` 是服务密钥。它和 `data/config.json` 同机保存时，`APP_ENCRYPTION_KEY` 的主要作用是防止 API Key 被配置文件或日志意外明文泄露，不是防主机入侵。

正式使用前建议至少做一种可回滚方案：

```text
私有 Git 定期提交 /opt/vaultecho/vault
或 VPS 快照
或定期打包备份 vault/data/obsidian-config
```

## 10. 常用维护命令

查看状态：

```bash
docker compose --profile sync ps
```

查看日志：

```bash
docker compose logs -f vaultecho
docker compose --profile sync logs -f obsidian-headless
```

重启：

```bash
docker compose --profile sync restart
```

更新代码后重建：

```bash
docker compose --profile sync up -d --build
```

只停服务，不删除数据：

```bash
docker compose --profile sync down
```

## 11. 常见问题

### EACCES: permission denied, mkdir '/Users'

这是容器读到了宿主机开发配置，例如 `data/config.json` 里的：

```json
{
  "vaultRoot": "path-to-this-repo-root-dir/vault",
  "dataDir": "path-to-this-repo-root-dir/data"
}
```

容器内应该使用 `/vault` 和 `/data`，不能使用 macOS 的 `/Users/...` 路径。当前 Docker Compose 已固定使用 `/data/docker-config.json`，执行：

```bash
docker compose down
docker compose up -d --build vaultecho
docker compose logs -f vaultecho
```

如果你手动在 Web UI 里把 Docker 配置改成了 `/Users/...`，删除 `data/docker-config.json` 后重启即可让 Docker 重新生成默认配置：

```bash
rm data/docker-config.json
docker compose up -d --build vaultecho
```
