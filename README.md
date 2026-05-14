# VaultEcho

Capture anything. Let your vault answer back.

Chinese version: [README_cn.md](README_cn.md).

VaultEcho is a minimal personal Vault write and feedback gateway. Coze, n8n, Shortcuts, or other automation platforms process arbitrary input into structured JSON, call VaultEcho's API, and write the result into a local Obsidian Vault. VaultEcho also provides indexing, semantic recall, and the foundation for later AI feedback tasks. Obsidian Headless Sync can then sync the local Vault to Obsidian Sync.

## Target Flow

```text
Input sources -> Coze workflow -> VaultEcho API -> local Vault -> Obsidian Headless Sync -> Obsidian
```

The first version intentionally does not build an AI workflow editor. Coze handles transcription, cleanup, routing, and write-intent generation. VaultEcho focuses on safe, auditable file writes.

For project boundaries, embedding design, and the AI task roadmap, see [docs/architecture-roadmap.md](docs/architecture-roadmap.md).

## Quick Start

```bash
cp .env.example .env
npm test
npm start
```

Open the config UI:

```text
http://localhost:8787/
```

`.env` only stores secrets that must come from the deployment environment:

```env
API_TOKEN=change-me
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me-admin
APP_ENCRYPTION_KEY=replace-with-a-stable-random-secret
BIND_HOST=127.0.0.1
```

`API_TOKEN` is used as the Bearer token for external systems such as Coze and Shortcuts. `ADMIN_USERNAME` and `ADMIN_PASSWORD` protect the Web admin UI, `/v1/config`, and `/health` with Basic Auth. `APP_ENCRYPTION_KEY` encrypts embedding API keys saved through the Web UI. Generate it once and keep it stable; do not change it on every restart.

Runtime settings such as Vault Root, Data Dir, Daily Note rules, and embedding model settings are edited in the Web UI and saved to `data/config.json`. Local `npm start` reads `.env` through Node 22's `--env-file=.env`.

`BIND_HOST` defaults to `127.0.0.1`, so direct `npm start` on a VPS does not expose the service publicly. Docker Compose overrides it to `0.0.0.0` inside the container, but the host port is still bound only to `127.0.0.1:8787`.

If you already have a desktop Obsidian Vault, use a separate local directory for Headless testing:

```text
Directory A: /Users/x/Obsidian/Xheldon
  Used by desktop Obsidian

Directory B: /Users/x/Developer/VaultEcho/vault
  Used by Headless Sync and VaultEcho
```

Directory B can be a brand-new test Sync Vault. Do not let desktop Obsidian open and sync directory B at the same time.

## Web Configuration

The config UI supports:

- Admin access: browser Basic Auth from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`.
- `Vault Root`: local Vault directory to write. Local default: `vault/` under the project. Docker default: `/vault`.
- `Data Dir`: idempotency records and runtime config. Local default: `data/` under the project. Docker default: `/data`.
- `Allowed Top-Level Dirs`: path allowlist, for example `Inbox,Notes,Ideas,Projects,Daily,Templates,Attachments,Archive`.
- `Max JSON Body Bytes`: request body size limit.
- `Image Attachment Dir`: default image attachment directory, default `Attachments/Images`.
- `Audio Attachment Dir`: default audio attachment directory, default `Attachments/Audio`.
- `Daily Timestamp Insertion Rules`: folded by default. Includes Daily Path Template, Time Zone, Slots, Line Format, and Line Pattern for endpoints such as `daily/append-by-time`.
- `Embedding`: OpenAI-compatible embedding API base URL, model, API key, chunk size, batch size, and auto-scan interval.

The first embedding version uses a remote API to generate vectors and stores the index at `data/index/embeddings.json`. This lets a 1C2G VPS run VaultEcho without a local model, Qdrant, Elasticsearch, or database extension. After API writes change a file, VaultEcho can automatically update that file's index. Changes pulled by Headless Sync can be compensated by the Rebuild Index button or by an auto-scan interval.

## Docker

See [docs/docker-deploy.md](docs/docker-deploy.md).

Minimal start:

```bash
cp .env.example .env
mkdir -p vault data obsidian-config
docker compose up -d --build vaultecho
```

Docker Compose binds VaultEcho only to `127.0.0.1:8787` on the host. Public access should go through Nginx, Caddy, or Cloudflare Tunnel. Do not expose `8787` directly to the public internet.

Enable Obsidian Headless Sync:

```bash
export OBSIDIAN_AUTH_TOKEN="your-token"
docker compose --profile sync up -d --build
```

Before first use, complete remote Vault setup for Obsidian Headless, for example by running `ob sync-list-remote` and `ob sync-setup --vault "Your Vault" --path /vault` inside the container. Headless Sync is currently an open beta. Back up your Vault before using it, and avoid using desktop Sync and Headless Sync for the same local Vault directory on the same device.

## API

All public endpoints are under one namespace:

```http
/v1/api/<resource>/<action>
Authorization: Bearer <API_TOKEN>
```

VaultEcho no longer exposes separate `/v1/uri`, `/v1/restful`, or `/v1/operations` namespaces. Obsidian URI and Local REST API capabilities are decomposed into concrete resource actions under `/v1/api`, avoiding fragmented capability across multiple paths.

The full API reference, examples, and use cases are in [docs/api.md](docs/api.md). That file is generated from [src/api-spec.js](src/api-spec.js); do not edit it by hand. After changing API docs in `api-spec.js`, run:

```bash
npm run docs:api
```

The Postman collection is at [docs/postman/VaultEcho.postman_collection.json](docs/postman/VaultEcho.postman_collection.json). After changing collection generation logic, run:

```bash
npm run docs:postman
```

Tests verify that implementation routes and documented routes match, and that generated docs are up to date.

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

Supported:

- `files/create`: create Markdown. `ifExists` supports `fail`, `overwrite`, and `append_suffix`.
- `files/read`: read a file.
- `files/write`: overwrite a file.
- `files/append`: append to the end of a file.
- `files/prepend`: insert at the beginning of a file.
- `files/delete`: soft-delete to `Archive/Deleted/`.
- `files/list`: list a directory.

Compatibility short aliases remain available, such as `/v1/api/new`, `/v1/api/read`, and `/v1/api/append`, but new integrations should use resource-style paths.

### Headings

```bash
curl -X POST http://localhost:8787/v1/api/headings/append \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "Afternoon",
    "content": "[16:21] Continue testing automatic insertion"
  }'
```

Supported:

- `headings/read`
- `headings/append`
- `headings/prepend`
- `headings/replace`
- `headings/insert-after-last-matching-line`

`insert-after-last-matching-line` uses the Daily Note `Line Pattern` from Web configuration and does not accept request-body overrides:

```bash
curl -X POST http://localhost:8787/v1/api/headings/insert-after-last-matching-line \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "Afternoon",
    "content": "[16:21] Working on Obsidian automation"
  }'
```

### Daily

This is the recommended endpoint for Coze journal writes. Coze only sends processed text; VaultEcho chooses the target heading from the configured timezone and slots.

```bash
curl -X POST http://localhost:8787/v1/api/daily/append-by-time \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "at": "2026-05-13T16:21:00+08:00",
    "content": "Working on Obsidian automation",
    "idempotencyKey": "daily-20260513-1621"
  }'
```

If `16:21` matches `Afternoon`, the entry is inserted below the final `[HH:mm]` line under `## Afternoon`.

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

Supported:

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

Semantic search requires embedding configuration in the Web UI and a rebuilt index:

```bash
curl -X POST http://localhost:8787/v1/api/index/rebuild \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'

curl -X POST http://localhost:8787/v1/api/search/semantic \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "query": "Obsidian automation ideas I have been exploring recently", "limit": 5 }'
```

### Batch

Use `batch` when one request needs multiple operations. Do not pass executable scripts.

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

The `script` parameter is a restricted JSON DSL. It can only call allowlisted operations and cannot execute arbitrary JavaScript.

```bash
SCRIPT=$(node -e 'process.stdout.write(encodeURIComponent(JSON.stringify({
  operations: [
    { op: "append", path: "Daily/2026-05-13.md", content: "- Created {{path}}\\n" }
  ]
})))')

curl -X POST "http://localhost:8787/v1/api/files/create?path=Ideas/script-demo.md&script=$SCRIPT" \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: text/plain" \
  --data "Primary request body"
```

Executable payloads such as `script=fs.rmSync(...)` are rejected. Allowing them would create remote code execution, and restricting `cwd` to the Vault would not make that safe.

### URI Compatibility

To consume Obsidian URI input, use `uri/execute` under the unified namespace:

```bash
curl -X POST http://localhost:8787/v1/api/uri/execute \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "obsidian://new?file=Ideas%2Furi-demo&content=Hello%20URI"
  }'
```

### Unsupported Desktop Features

`obsidian-local-rest-api` can call desktop Obsidian's `workspace`, `commands`, `metadataCache`, and plugin runtime. A Headless filesystem service does not have those objects, so these features are not faked as successful:

- active file
- command palette / execute command
- open file in Obsidian UI
- Dataview DQL / JsonLogic

## Security Boundary

- Paths must be Vault-relative. Absolute paths and `../` are rejected.
- By default, writes are only allowed under `Inbox`, `Notes`, `Ideas`, `Projects`, `Daily`, `Attachments`, and `Archive`.
- Every write request must include a Bearer token.
- `idempotencyKey` is supported to avoid duplicate writes when Coze or webhooks retry.
- Writes to the same target file are serialized within one process, reducing concurrent daily-note conflicts.
