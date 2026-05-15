# Docker 部署

English version: [docker-deploy.md](docker-deploy.md)。

VaultEcho 强绑定 Obsidian，但本仓库的 Docker Compose 只运行 VaultEcho 服务。Obsidian Headless Sync 是你在本 Docker 之外先准备好的前置条件。

```text
外部输入 -> VaultEcho API -> 挂载的本地 Vault -> Obsidian Headless Sync -> Obsidian Sync
```

VaultEcho 在容器内写 `/vault` 下的 Markdown 文件。Docker 会把 `/vault` 映射到已经由 Obsidian Headless Sync 管理的本地 Vault 目录。

## 1. 准备 Obsidian Headless Vault

运行 VaultEcho 前，先用 Obsidian Headless Sync 准备好一个本地 Vault 目录，并让 Headless 对这个目录持续同步。

官方文档：

- [Obsidian Headless](https://help.obsidian.md/headless)
- [Headless Sync](https://help.obsidian.md/sync/headless)

最终你应该得到一个本地目录，例如：

```text
/srv/obsidian/my-vault
```

这个目录应该是：

- 一个真实的 Obsidian Vault。
- 已经配置好 Obsidian Headless Sync。
- 由你自己的 Headless 进程或服务持续同步。
- 不要在同一台机器上同时由桌面 Obsidian Sync 管理。

VaultEcho 不负责安装 Headless、不执行 `ob login`，也不保存 Obsidian 凭据。它只挂载并修改这个 Vault 目录。

## 2. 本地测试 VaultEcho

进入项目目录：

```bash
cd /Users/x/Developer/obsidian-ai-capture-gateway
```

准备环境变量和数据目录：

```bash
cp .env.example .env
mkdir -p data
```

编辑 `.env`：

```env
API_TOKEN=replace-with-a-long-random-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-another-long-random-password
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
BIND_HOST=127.0.0.1
OBSIDIAN_VAULT_PATH=/srv/obsidian/my-vault
```

如果只是本地冒烟测试、暂时没有真实 Headless Sync，可以临时使用：

```env
OBSIDIAN_VAULT_PATH=./vault
```

可以用下面命令生成随机值：

```bash
openssl rand -base64 32
```

启动 VaultEcho：

```bash
docker compose up -d --build vaultecho
docker compose ps
docker compose logs -f vaultecho
```

打开管理页：

```text
http://127.0.0.1:8787/
```

浏览器会弹出 Basic Auth 登录框，使用 `.env` 里的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`。

Docker 运行配置应该是：

```text
Vault Root: /vault
Data Dir: /data
Image Attachment Dir: Attachments/Images
Audio Attachment Dir: Attachments/Audio
Daily Note Path Template: Daily/{{yyyy-MM-dd}}.md
Time Zone: Asia/Shanghai
Allowed Dirs: Inbox, Notes, Ideas, Projects, Daily, Reviews, Templates, Attachments, Archive
```

测试写入：

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

在挂载的 Vault 路径中确认文件：

```bash
cat /srv/obsidian/my-vault/Daily/2026-05-14.md
```

## 3. 运行路径

`docker-compose.yml` 使用：

```yaml
volumes:
  - ${OBSIDIAN_VAULT_PATH:-./vault}:/vault
  - ./data:/data
```

含义：

- `OBSIDIAN_VAULT_PATH`: 宿主机上已经由 Obsidian Headless Sync 管理的 Vault 路径。
- `/vault`: VaultEcho 容器内使用的 Vault 路径。
- `./data`: VaultEcho 的运行数据、配置、幂等记录和 embedding 索引。

Docker 会把运行配置保存到 `data/docker-config.json`。这个文件和本机 `npm start` 使用的 `data/config.json` 分开，避免容器读到 `/Users/...` 这类宿主机开发路径。

## 4. VPS 准备

下面默认 VPS 是 Ubuntu 或 Debian。1C2G/30G 可以跑 VaultEcho，因为 embedding 使用远程 API，不在 VPS 上跑本地模型。

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
rsync -av --exclude node_modules --exclude .git /Users/{local-vaultecho-dir}/ user@your-vps:/opt/vaultecho/
```

## 5. VPS 配置 VaultEcho

先确认 Obsidian Headless Sync 已经在 VPS 上准备好一个本地 Vault 目录，例如：

```text
/srv/obsidian/my-vault
```

然后配置 VaultEcho：

```bash
cp .env.example .env
mkdir -p data
sudo chown -R "$(id -u):$(id -g)" data
```

编辑 `.env`：

```env
API_TOKEN=replace-with-a-long-random-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-another-long-random-password
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
BIND_HOST=127.0.0.1
OBSIDIAN_VAULT_PATH=/srv/obsidian/my-vault
```

说明：

- `API_TOKEN`：Coze、快捷指令、curl 等外部系统调用 `/v1/api/...` 的 Bearer Token。
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`：Web 管理页、`/v1/config`、`/health` 的 Basic Auth。
- `APP_ENCRYPTION_KEY`：用于加密 Web UI 中保存的 embedding API Key。生成后保持稳定。
- `OBSIDIAN_VAULT_PATH`：宿主机上已经由 Obsidian Headless Sync 管理的 Vault 路径。
- `BIND_HOST`：直接 `npm start` 时生效。Docker Compose 会在容器内覆盖为 `0.0.0.0`，但宿主机端口仍只绑定到 `127.0.0.1:8787`。

启动 VaultEcho：

```bash
docker compose up -d --build vaultecho
docker compose ps
docker compose logs -f vaultecho
```

在 VPS 本机验证：

```bash
curl -i http://127.0.0.1:8787/health -u admin:replace-with-another-long-random-password
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

再次检查：

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
Allowed Dirs: Inbox, Notes, Ideas, Projects, Daily, Reviews, Templates, Attachments, Archive
Slots:
  Morning 05:00-11:59
  Afternoon 12:00-17:59
  Evening 18:00-04:59
```

如果你的日记 heading 是中文，可以在 Web UI 里修改 slot heading。

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

如果要启用 Review Tasks，还需要在 AI Model 区域配置：

```text
Provider: openai-compatible
Base URL: https://api.openai.com/v1
Model: 你的 chat 模型名
API Key: 对应服务商的 API Key
```

然后启用 Review Tasks 区域，选择需要开启的周、月、季、年任务。默认输出路径会写入 `Reviews`，所以需要把 `Reviews` 保留在 Allowed Dirs 中。可以用 Review Status 或 Run Now 验证。任务运行时间按全局 Time Zone 计算，不会每分钟轮询。

首次配置后可以在 Web UI 点击“重建索引”，或用 curl：

```bash
curl -X POST https://vault.example.com/v1/api/index/rebuild \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'
```

## 8. 外部写入测试

写入 Daily：

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

然后确认你外部运行的 Headless 进程能把该文件同步到 Obsidian Sync。

## 9. 备份和恢复

建议定期备份：

```text
<OBSIDIAN_VAULT_PATH>
/opt/vaultecho/data
/opt/vaultecho/.env
```

说明：

- `OBSIDIAN_VAULT_PATH` 是本地 Obsidian Vault，是最重要的数据。
- `data/docker-config.json` 是 Docker 下 Web UI 保存的运行配置。
- `data/idempotency` 是防重复写入记录，不需要重点备份。
- `data/index` 是本地 embedding 索引，可删除后重建，但会重新消耗远程 embedding API 调用。
- `.env` 是服务密钥。

正式使用前建议至少做一种可回滚方案：

```text
私有 Git 定期提交 Vault
或 VPS 快照
或定期打包备份 Vault 和 /opt/vaultecho/data
```

## 10. 常用维护命令

查看状态：

```bash
docker compose ps
```

查看日志：

```bash
docker compose logs -f vaultecho
```

重启：

```bash
docker compose restart vaultecho
```

更新代码后重建：

```bash
docker compose up -d --build vaultecho
```

只停 VaultEcho，不删除数据：

```bash
docker compose down
```

## 11. 常见问题

### EACCES: permission denied, mkdir '/Users'

这是容器读到了宿主机开发配置，例如：

```json
{
  "vaultRoot": "/Users/x/Developer/obsidian-ai-capture-gateway/vault",
  "dataDir": "/Users/x/Developer/obsidian-ai-capture-gateway/data"
}
```

容器内应该使用 `/vault` 和 `/data`，不能使用 macOS 的 `/Users/...` 路径。删除 `data/docker-config.json` 后重启即可让 Docker 重新生成默认配置：

```bash
rm data/docker-config.json
docker compose up -d --build vaultecho
```

### VaultEcho 已经写入文件，但 Obsidian 没同步

VaultEcho 不运行 Obsidian Headless。检查你外部运行的 Headless 进程：

- 是否正在持续同步 `OBSIDIAN_VAULT_PATH` 指向的同一个本地 Vault？
- 是否有权限读写该目录？
- 是否在同一台机器上让桌面 Obsidian 也同步同一个本地目录？
- `ob sync` 在你的 Headless 服务日志里是否报错？
