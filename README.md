# VaultEcho

Capture anything. Let your vault answer back.

Chinese version: [README_cn.md](README_cn.md).

VaultEcho is an Obsidian-native capture and feedback gateway. Coze, n8n, Shortcuts, or other automation platforms process arbitrary input into structured JSON, call VaultEcho's API, and write the result into a local Vault that is already managed by Obsidian Headless Sync. VaultEcho also provides indexing, semantic recall, and scheduled AI review tasks.

## Target Flow

```text
Input sources (any of http request client like iPhone Shortcuts) -> VaultEcho API -> local Vault -> Obsidian Headless Sync -> Obsidian Sync
```

The first version intentionally does not build an AI workflow editor. Coze handles transcription, cleanup, routing, and write-intent generation. VaultEcho focuses on safe, auditable file writes.

For project boundaries, embedding design, and the review-task roadmap, see [docs/architecture-roadmap.md](docs/architecture-roadmap.md).

For Web admin configuration fields, see [docs/admin-config.md](docs/admin-config.md).

For Apple Shortcuts capture recipes, see [docs/shortcuts.md](docs/shortcuts.md).

## Obsidian Headless Prerequisite

VaultEcho is intentionally bound to Obsidian. Before running VaultEcho, prepare a local Vault directory with Obsidian Headless Sync and keep `ob sync --continuous` running for that directory.

Follow the official docs:

- [Obsidian Headless](https://help.obsidian.md/headless)
- [Headless Sync](https://help.obsidian.md/sync/headless)

The only contract VaultEcho needs is a writable local Vault path:

```text
/path/to/headless-vault
  Managed by Obsidian Headless Sync
  Mounted into VaultEcho Docker as /vault
```

VaultEcho does not install Headless, log in to Obsidian, or manage Obsidian credentials. It reads and writes Markdown files in the mounted Vault; Headless handles sync.

## Quick Start

```bash
cp .env.example .env
mkdir -p data
docker compose up -d --build vaultecho
```

Before starting Docker for real use, set `OBSIDIAN_VAULT_PATH` in `.env` to the local Vault directory managed by Obsidian Headless Sync. Then open the config UI:

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
OBSIDIAN_VAULT_PATH=/path/to/headless-vault
```

`API_TOKEN` is used as the Bearer token for external systems such as Coze and Shortcuts. `ADMIN_USERNAME` and `ADMIN_PASSWORD` protect the Web admin UI, `/v1/config`, and `/health` with Basic Auth. `APP_ENCRYPTION_KEY` encrypts embedding API keys saved through the Web UI. Generate it once and keep it stable; do not change it on every restart.

Runtime settings such as Vault Root, Data Dir, Daily Note rules, and embedding model settings are edited in the Web UI. Docker saves them to `data/docker-config.json`; local `npm start` saves them to `data/config.json`.

`BIND_HOST` defaults to `127.0.0.1`, so direct `npm start` on a VPS does not expose the service publicly. Docker Compose overrides it to `0.0.0.0` inside the container, but the host port is still bound only to `127.0.0.1:8787`.

If you already have a desktop Obsidian Vault, use a separate local directory for Headless:

```text
Directory A: /Users/x/Obsidian/Xheldon
  Used by desktop Obsidian

Directory B: /path/to/headless-vault
  Used by Headless Sync and VaultEcho
```

Directory B can be a brand-new test Sync Vault. Do not let desktop Obsidian and Headless Sync manage the same local directory on the same machine.

## Web Configuration

The admin UI is a Vue/Vite + Element Plus build served from `public/admin`. During Docker image builds it is generated automatically; for local `npm start`, run `npm run admin:build` after changing files under `admin/`.

The config UI supports:

- Language toggle: English by default, with a Chinese UI option stored in browser localStorage.
- Admin access: browser Basic Auth from `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`.
- `Vault Root`: local Vault directory to write. Local default: `vault/` under the project. Docker default: `/vault`.
- `Data Dir`: idempotency records and runtime config. Local default: `data/` under the project. Docker default: `/data`.
- `Time Zone`: the user's time zone. It drives daily-note path resolution, time-slot insertion, and scheduled review tasks.
- `Allowed Top-Level Dirs`: path allowlist selected from refreshed Vault top-level directories, with a custom-dir fallback.
- `Include Root Markdown Files`: optionally indexes and reviews `.md` files directly under the Vault root.
- `Global Exclude Paths`: Vault-relative folders or files excluded from semantic indexing and all review tasks.
- `Max JSON Body Bytes`: request body size limit.
- `Image Attachment Dir`, `Audio Attachment Dir`, `Video Attachment Dir`, and `File Attachment Dir`: target folders for `attachments/upload`. They can all point to the same Vault folder.
- `Max Attachment Upload Bytes`: multipart upload size limit for attachments.
- `Daily Timestamp Insertion Rules`: folded by default. Includes the daily file path template, optional daily template file, create-if-missing behavior, heading level, non-overlapping time slots, line format, line pattern, blank-line spacing, and chronological ordering of timestamp entries for endpoints such as `daily/append-by-time`.
- `Embedding`: OpenAI-compatible `/embeddings` API base URL, model, API key, dimensions, chunk size, batch size, and auto-scan interval.
- `AI Model`: Chat Completions mode for OpenAI-compatible gateways, or Responses API mode for official OpenAI frontier models used by built-in review tasks.
- `Apple Health`: folded by default. Enables the receive-only `health/ingest` endpoint and configures, for sleep and workouts independently, the target heading (or time-slot insertion) and a placeholder write-template (with conditional sections that drop absent metrics) for device-pushed Apple Health data.
- `Review Tasks`: folded by default. Configures weekly, monthly, quarterly, and yearly AI reviews with source folders, semantic recall, prompt, schedule, and output path.

Embedding uses a remote `/embeddings` API to generate vectors and stores the index at `data/index/embeddings.json`. OpenAI `text-embedding-3` models also use this endpoint; their newer capability is exposed through options such as `dimensions`. This lets a 1C2G VPS run VaultEcho without a local model, Qdrant, Elasticsearch, or database extension. After API writes change a file, VaultEcho can automatically update that file's index. Changes pulled by Headless Sync can be compensated by the Rebuild Index button or by an auto-scan interval.

Review tasks use exact task schedules, not per-minute polling. The scheduler computes the next enabled task time in the configured user time zone, sleeps until then, gathers period source notes, optionally pulls semantic recall from the embedding index, calls the configured AI model, and writes a managed Markdown block to the configured output path.

## Docker

See [docs/docker-deploy.md](docs/docker-deploy.md).

Minimal start:

```bash
cp .env.example .env
mkdir -p vault data
docker compose up -d --build vaultecho
```

For real use, set `OBSIDIAN_VAULT_PATH` in `.env` to the Vault directory already managed by Obsidian Headless Sync:

```env
OBSIDIAN_VAULT_PATH=/srv/obsidian/my-vault
```

Docker Compose mounts that path into the VaultEcho container as `/vault`. Docker Compose binds VaultEcho only to `127.0.0.1:8787` on the host. Public access should go through Nginx, Caddy, or Cloudflare Tunnel. Do not expose `8787` directly to the public internet.

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

If `16:21` matches `Afternoon`, the entry is inserted below the final `[HH:mm]` line under `## Afternoon`. The Web UI controls the daily path template, heading level, missing-note template, and whether a blank line is kept between timestamp entries.

If `at` is omitted, VaultEcho uses the server's current clock and interprets it through the configured user time zone. Passing `at` is still useful for backfill, testing, or upstream systems that captured an event earlier than the request time.

### Apple Health

`health/ingest` is a receive-only endpoint for a companion device that pushes raw Apple Health data. VaultEcho aggregates and formats it server-side so the iOS client does not have to. Each sleep session becomes one entry (total/in-bed time, deep/core/REM/awake stages, average heart rate, HRV) attributed to the wake day; a night plus a nap are two entries merged and time-sorted under the heading. `HKWorkout` sessions are formatted like the Strava activity entry. Both reuse the same daily-note block layout, and target headings (or time-slot insertion) are configured in the Web UI.

```bash
curl -X POST http://localhost:8787/v1/api/health/ingest \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "sleep": {
      "samples": [
        { "value": "asleepDeep", "startDate": "2026-06-16T23:30:00+08:00", "endDate": "2026-06-17T00:42:00+08:00" },
        { "value": "asleepCore", "startDate": "2026-06-17T00:42:00+08:00", "endDate": "2026-06-17T07:15:00+08:00" }
      ],
      "heartRate": 52,
      "hrv": 48
    },
    "workouts": [
      { "uuid": "A1B2", "type": "Running", "startDate": "2026-06-17T18:05:00+08:00", "duration": 1800, "distanceMeters": 5200 }
    ]
  }'
```

Multiple sleep sessions can also be sent in one request via `"sleep": { "sessions": [ ... ] }`. Each sleep session is de-duplicated per session `id` (or fall-asleep time) and each workout by its UUID, so re-pushes do not duplicate.

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
- `frontmatter/append` (appends to an inline-array field; defaults to the daily note and creates it when missing)
- `geo/convert` (explicit GCJ-02 <-> WGS-84 coordinate conversion)

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

### Review Tasks

Review tasks turn the Vault from passive storage into a feedback loop. A task selects a period, reads relevant notes, optionally recalls older semantically related notes, calls the configured AI model, then writes a managed block to the configured output file. Each task can also exclude Vault-relative folders or subfolders, such as `Attachments` or `Media/Movies`, from both source notes and semantic recall.

```bash
curl http://localhost:8787/v1/api/reviews/status \
  -H "Authorization: Bearer change-me"

curl -X POST http://localhost:8787/v1/api/reviews/run \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "taskId": "weekly-review" }'
```

The default tasks are disabled until you configure the AI model, embedding model, and review prompts in the Web UI. If semantic recall is unavailable, the task still runs with period notes and records a warning in the result.

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
- Writes are only allowed under the configured top-level directory allowlist. New configs initialize that allowlist from existing Vault folders when possible.
- Every write request must include a Bearer token.
- `idempotencyKey` is supported to avoid duplicate writes when Coze or webhooks retry.
- Writes to the same target file are serialized within one process, reducing concurrent daily-note conflicts.
