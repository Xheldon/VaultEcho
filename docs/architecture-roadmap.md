# VaultEcho Project Boundary And Roadmap

Chinese version: [architecture-roadmap_cn.md](architecture-roadmap_cn.md).

VaultEcho is an Obsidian-native Vault read/write and intelligence gateway. It assumes the target Vault is a local directory managed by Obsidian Headless Sync, but it does not install, run, or log in to Obsidian Headless itself.

## One-Line Architecture

```text
Input sources -> Coze/n8n/Shortcuts -> VaultEcho API -> mounted Vault filesystem -> Obsidian Headless Sync
                                      \
                                       -> embedding index -> scheduled AI tasks -> Vault or webhook
```

## Current Boundary

VaultEcho is responsible for:

- Receiving already-processed write intents from external systems.
- Safely creating, overwriting, appending, heading-patching, frontmatter-patching, and soft-deleting Markdown files inside the Vault.
- Treating Obsidian concepts such as templates, daily notes, headings, and YAML frontmatter as first-class API surfaces.
- Maintaining a lightweight local index for future AI tasks.
- Calling a remote embedding API and storing a local semantic index.
- Running scheduled review tasks with semantic recall and appending entries to templated Markdown review files in the Vault.

VaultEcho is not responsible for:

- Replacing Coze or n8n as a drag-and-drop workflow builder.
- Installing Obsidian Headless, running `ob login`, or storing Obsidian account credentials.
- Managing Obsidian Sync conflicts or guaranteeing that Headless has synced a write.
- Running local LLMs or local embedding models on a 1C2G VPS.
- Becoming a multi-tenant SaaS.
- Calling Claude Code or Codex CLI in the background for production tasks.
- Executing arbitrary JavaScript or shell scripts supplied by requests.

## Why Remote Embeddings First

The target deployment is a small personal VPS, often around 1C2G with 30G disk. That can reasonably run:

- A Node.js API service.
- An external Obsidian Headless Sync process.
- A JSON or SQLite-sized local index.
- Scheduled AI tasks.
- Remote OpenAI-compatible API calls, including Chat Completions for compatible gateways and Responses API for official OpenAI frontier models.

It should not be expected to run:

- Local LLMs.
- Local embedding models.
- Heavy always-on services such as Qdrant or Elasticsearch.
- Multi-user concurrent agents.

The first embedding design is therefore:

- The user configures an OpenAI-compatible `/embeddings` API in the Web UI.
- The server encrypts the API key with `APP_ENCRYPTION_KEY`.
- Markdown is split into small chunks.
- Each chunk is embedded through the remote API.
- The index is saved to `/data/index/embeddings.json`.

If a Vault grows large enough, index storage can move to SQLite or a dedicated vector store later without changing the public API.

## Index Triggers

VaultEcho supports three index triggers:

- Manual rebuild: `POST /v1/api/index/rebuild`, useful after first deployment or large sync changes.
- Single-file index: `POST /v1/api/index/file`, useful for debugging or external scripts.
- Auto-index after write: when `autoIndexAfterWrite` is enabled, files changed through VaultEcho API are indexed asynchronously.

Changes pulled by the external Headless Sync process are not written through VaultEcho. They need either:

- A manual rebuild, or
- `autoScanIntervalMinutes` to periodically scan and update changed files.

## Built-In Review Tasks

VaultEcho now includes a small task runner focused on review loops, not a general drag-and-drop workflow editor:

```text
Task Schedule -> Period Source Notes -> Semantic Recall -> Prompt -> Chat Model -> Managed Markdown Output
```

The first task model supports:

- Weekly, monthly, quarterly, and yearly periods.
- Exact per-task schedules computed in the configured user time zone.
- Source folders such as Daily, Inbox, Notes, Ideas, and Projects.
- Optional semantic recall from the local embedding index.
- User-editable prompts.
- Templated review files at configured Vault paths such as `Reviews/Weekly/{{YYYY}}-W{{WW}}.md`, with each run appended as a new entry.

The scheduler does not poll every minute. It computes the next enabled task run, sleeps until that time, runs due tasks once per period, records run history in `data/review-runs.json`, and then schedules the next wake-up.

High-value next extensions:

- Suggest Inbox triage.
- Surface open loops from active project notes.
- Add webhook output sinks.
- Add source selectors for heading, tag, and saved search.
- Add lower-risk daily-note summary insertion after the review block format is stable.

## Security Principles

- External VaultEcho API calls use `Authorization: Bearer <API_TOKEN>`.
- Web UI, `/v1/config`, and `/health` use separate Basic Auth.
- AI provider API keys are encrypted at rest.
- AI-generated writes should preserve provenance fields such as `ai_generated`, `ai_task`, `model`, and `source_range`.
- Higher-risk AI outputs should first go to `AI/Drafts` or `AI/Reports`; only lower-risk outputs should write back into source notes automatically.

This roadmap keeps VaultEcho small enough for a personal VPS while moving a Vault from passive capture storage toward a system that can retrieve, summarize, and respond.
