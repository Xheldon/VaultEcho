# Docker Deployment

Chinese version: [docker-deploy_cn.md](docker-deploy_cn.md).

VaultEcho is Obsidian-native, but this repository only runs the VaultEcho service. Obsidian Headless Sync is a prerequisite that you set up outside this Docker Compose file.

```text
External input -> VaultEcho API -> mounted local Vault -> Obsidian Headless Sync -> Obsidian Sync
```

VaultEcho writes Markdown files under `/vault` inside the container. Docker maps `/vault` to the local Vault directory that is already managed by Obsidian Headless Sync.

## 1. Prepare An Obsidian Headless Vault

Before running VaultEcho, prepare a local Vault directory with Obsidian Headless Sync and keep continuous sync running for it.

Official docs:

- [Obsidian Headless](https://help.obsidian.md/headless)
- [Headless Sync](https://help.obsidian.md/sync/headless)

The expected result is a local directory such as:

```text
/srv/obsidian/my-vault
```

That directory should be:

- A real Obsidian Vault.
- Configured with Obsidian Headless Sync.
- Continuously synced by your own Headless process or service.
- Not simultaneously managed by desktop Obsidian Sync on the same machine.

VaultEcho does not install Headless, does not run `ob login`, and does not store Obsidian credentials. It only mounts and edits this Vault directory.

## 2. Test VaultEcho Locally

Enter the project directory:

```bash
cd /Users/x/Developer/obsidian-ai-capture-gateway
```

Prepare environment variables and the data directory:

```bash
cp .env.example .env
mkdir -p data
```

Edit `.env`:

```env
API_TOKEN=replace-with-a-long-random-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-another-long-random-password
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
BIND_HOST=127.0.0.1
OBSIDIAN_VAULT_PATH=/srv/obsidian/my-vault
```

For a local smoke test without real Headless Sync, you can temporarily use:

```env
OBSIDIAN_VAULT_PATH=./vault
```

Generate random secrets with:

```bash
openssl rand -base64 32
```

Start VaultEcho:

```bash
docker compose up -d --build vaultecho
docker compose ps
docker compose logs -f vaultecho
```

Open the admin UI:

```text
http://127.0.0.1:8787/
```

The browser prompts for Basic Auth. Use `ADMIN_USERNAME` and `ADMIN_PASSWORD` from `.env`.

Docker runtime paths should be:

```text
Vault Root: /vault
Data Dir: /data
Image Attachment Dir: Attachments/Images
Audio Attachment Dir: Attachments/Audio
Daily Note Path Template: Daily/{{yyyy-MM-dd}}.md
Time Zone: Asia/Shanghai
Allowed Dirs: Inbox, Notes, Ideas, Projects, Daily, Reviews, Templates, Attachments, Archive
```

Test a write:

```bash
curl -X POST http://127.0.0.1:8787/v1/api/daily/append-by-time \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{
    "at": "2026-05-14T16:21:00+08:00",
    "content": "Local Docker write test",
    "idempotencyKey": "local-test-20260514-1621"
  }'
```

Confirm the file in your mounted Vault path:

```bash
cat /srv/obsidian/my-vault/Daily/2026-05-14.md
```

## 3. Runtime Paths

`docker-compose.yml` uses:

```yaml
volumes:
  - ${OBSIDIAN_VAULT_PATH:-./vault}:/vault
  - ./data:/data
```

Meaning:

- `OBSIDIAN_VAULT_PATH`: host path of the Vault already managed by Obsidian Headless Sync.
- `/vault`: container path used by VaultEcho.
- `./data`: VaultEcho runtime data, config, idempotency records, and embedding index.

Docker saves runtime configuration to `data/docker-config.json`. This is separate from local `npm start` config at `data/config.json`, preventing the container from reading host-only paths such as `/Users/...`.

## 4. Prepare The VPS

The following assumes Ubuntu or Debian. A 1C2G/30G VPS can run VaultEcho because embeddings use a remote API and no local model runs on the VPS.

Install Docker, Compose, Nginx, and Certbot:

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

Check:

```bash
docker --version
docker compose version
nginx -v
```

Prepare the deploy directory:

```bash
sudo mkdir -p /opt/vaultecho
sudo chown -R "$USER:$USER" /opt/vaultecho
cd /opt/vaultecho
```

Put the project under `/opt/vaultecho`. If it is already pushed to GitHub:

```bash
git clone <your-repo-url> .
```

If there is no remote repository yet, run this from your local machine:

```bash
rsync -av --exclude node_modules --exclude .git /Users/{local-vaultecho-dir}/ user@your-vps:/opt/vaultecho/
```

## 5. Configure VaultEcho On The VPS

First ensure Obsidian Headless Sync has already prepared a local Vault directory on the VPS, for example:

```text
/srv/obsidian/my-vault
```

Then configure VaultEcho:

```bash
cp .env.example .env
mkdir -p data
sudo chown -R "$(id -u):$(id -g)" data
```

Edit `.env`:

```env
API_TOKEN=replace-with-a-long-random-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD=replace-with-another-long-random-password
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
BIND_HOST=127.0.0.1
OBSIDIAN_VAULT_PATH=/srv/obsidian/my-vault
```

Meaning:

- `API_TOKEN`: Bearer token for external systems such as Coze, Shortcuts, and curl.
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: Basic Auth for the Web admin UI, `/v1/config`, and `/health`.
- `APP_ENCRYPTION_KEY`: encrypts embedding API keys saved through the Web UI. Keep it stable.
- `OBSIDIAN_VAULT_PATH`: host path of the Vault already managed by Obsidian Headless Sync.
- `BIND_HOST`: used by direct `npm start`. Docker Compose overrides it to `0.0.0.0` inside the container, while the host port remains bound to `127.0.0.1:8787`.

Start VaultEcho:

```bash
docker compose up -d --build vaultecho
docker compose ps
docker compose logs -f vaultecho
```

Verify locally on the VPS:

```bash
curl -i http://127.0.0.1:8787/health -u admin:replace-with-another-long-random-password
```

## 6. Nginx Reverse Proxy

Prerequisites:

- `vault.example.com` points to the VPS.
- Docker Compose exposes `127.0.0.1:8787:8787`; do not expose `8787` directly to the public internet.
- If sing-box already occupies `443` on the VPS, do not let Nginx take over `443`. Use another port or Cloudflare Tunnel.

Create a site config:

```bash
sudo nano /etc/nginx/sites-available/vaultecho
```

Write:

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

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/vaultecho /etc/nginx/sites-enabled/vaultecho
sudo nginx -t
sudo systemctl reload nginx
```

Request HTTPS:

```bash
sudo certbot --nginx -d vault.example.com
```

Check again:

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -i https://vault.example.com/health -u admin:replace-with-another-long-random-password
```

If you use `ufw`, only expose reverse-proxy ports and keep origin port `8787` closed:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw deny 8787/tcp
sudo ufw enable
sudo ufw status
```

This Nginx config only adds a normal `server`. It does not set `default_server` and does not modify `stream`, so it should not affect sing-box under a normal setup.

## 7. Web UI Configuration

Open:

```text
https://vault.example.com/
```

After Basic Auth login, check:

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

If your daily-note headings are localized, change slot headings in the Web UI.

To enable semantic search, configure Embedding:

```text
Enabled: on
Provider: openai-compatible
Base URL: https://api.openai.com/v1
Model: your embedding model name
API Key: API key from the provider
Auto Index After Write: on
Auto Scan Interval Minutes: 0 or a positive interval
```

To enable Review Tasks, also configure AI Model:

```text
Provider: openai-compatible
Base URL: https://api.openai.com/v1
Model: your chat model name
API Key: API key from the provider
```

Then enable the Review Tasks section, choose the weekly/monthly/quarterly/yearly tasks you want, keep `Reviews` in Allowed Dirs for the default output paths, and click Review Status or Run Now to verify. Task schedules are computed in the global Time Zone; they do not run every minute.

After first configuration, click Rebuild Index in the Web UI or call:

```bash
curl -X POST https://vault.example.com/v1/api/index/rebuild \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'
```

## 8. External Write Test

Write a daily entry:

```bash
curl -X POST https://vault.example.com/v1/api/daily/append-by-time \
  -H "Authorization: Bearer replace-with-a-long-random-token" \
  -H "Content-Type: application/json" \
  -d '{
    "at": "2026-05-14T16:21:00+08:00",
    "content": "VPS write test",
    "idempotencyKey": "vps-test-20260514-1621"
  }'
```

Read it back:

```bash
curl "https://vault.example.com/v1/api/files/read?path=Daily/2026-05-14.md" \
  -H "Authorization: Bearer replace-with-a-long-random-token"
```

Then confirm your external Headless process syncs that file to Obsidian Sync.

## 9. Backup And Restore

Back up these paths regularly:

```text
<OBSIDIAN_VAULT_PATH>
/opt/vaultecho/data
/opt/vaultecho/.env
```

Notes:

- `OBSIDIAN_VAULT_PATH` is the local Obsidian Vault and the most important data.
- `data/docker-config.json` is the runtime config saved by the Web UI in Docker.
- `data/idempotency` stores duplicate-write prevention records. It is not critical to back up.
- `data/index` is the local embedding index. It can be deleted and rebuilt, but rebuilding consumes remote embedding API calls again.
- `.env` contains service secrets.

Before real use, keep at least one rollback option:

```text
Private Git commits for the Vault
or VPS snapshots
or periodic archives of the Vault and /opt/vaultecho/data
```

## 10. Common Maintenance Commands

Check status:

```bash
docker compose ps
```

Check logs:

```bash
docker compose logs -f vaultecho
```

Restart:

```bash
docker compose restart vaultecho
```

Rebuild after code updates:

```bash
docker compose up -d --build vaultecho
```

Stop VaultEcho without deleting data:

```bash
docker compose down
```

## 11. FAQ

### EACCES: permission denied, mkdir '/Users'

The container read host development config, for example:

```json
{
  "vaultRoot": "/Users/x/Developer/obsidian-ai-capture-gateway/vault",
  "dataDir": "/Users/x/Developer/obsidian-ai-capture-gateway/data"
}
```

Inside Docker, paths must be `/vault` and `/data`, not macOS `/Users/...` paths. Delete `data/docker-config.json` and restart to regenerate Docker defaults:

```bash
rm data/docker-config.json
docker compose up -d --build vaultecho
```

### VaultEcho writes files but Obsidian does not sync them

VaultEcho does not run Obsidian Headless. Check your external Headless process:

- Is it running continuously for the same local Vault path as `OBSIDIAN_VAULT_PATH`?
- Does it have permission to read and write that directory?
- Is desktop Obsidian also syncing the same local directory on the same machine?
- Does `ob sync` report errors in your Headless service logs?
