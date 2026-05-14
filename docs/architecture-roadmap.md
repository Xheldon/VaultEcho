# VaultEcho Project Boundary And Roadmap

Chinese version: [architecture-roadmap_cn.md](architecture-roadmap_cn.md).

VaultEcho is a personal Obsidian Vault read/write and intelligence gateway. It is not a replacement for Coze, n8n, Claude Code, or Codex.

## One-Line Architecture

```text
Input sources -> Coze/n8n/Shortcuts -> VaultEcho API -> Vault filesystem -> Obsidian Headless Sync
                                      \
                                       -> embedding index -> scheduled AI tasks -> Vault or webhook
```

## Current Boundary

VaultEcho is responsible for:

- Receiving already-processed write intents from external systems.
- Safely creating, overwriting, appending, heading-patching, frontmatter-patching, and soft-deleting Markdown files inside the Vault.
- Maintaining a lightweight local index for future AI tasks.
- Calling a remote embedding API and storing a local semantic index.
- Writing AI task outputs back to the Vault or sending them to webhooks in later versions.

VaultEcho is not responsible for:

- Replacing Coze or n8n as a drag-and-drop workflow builder.
- Running local LLMs or local embedding models on a 1C2G VPS.
- Becoming a multi-tenant SaaS.
- Calling Claude Code or Codex CLI in the background for production tasks.
- Executing arbitrary JavaScript or shell scripts supplied by requests.

## Why Remote Embeddings First

The target deployment is a small personal VPS, often around 1C2G with 30G disk. That can reasonably run:

- A Node.js API service.
- Obsidian Headless Sync.
- A JSON or SQLite-sized local index.
- Scheduled AI tasks.
- Remote Claude/OpenAI-compatible API calls.

It should not be expected to run:

- Local LLMs.
- Local embedding models.
- Heavy always-on services such as Qdrant or Elasticsearch.
- Multi-user concurrent agents.

The first embedding design is therefore:

- The user configures an OpenAI-compatible embedding API in the Web UI.
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

Changes pulled by Headless Sync are not written through VaultEcho. They need either:

- A manual rebuild, or
- `autoScanIntervalMinutes` to periodically scan and update changed files.

## Next AI Task Shape

Do not build a general workflow editor first. The next practical step is a small AI Task Runner:

```text
Trigger -> Context Selector -> Prompt Profile -> Model Provider -> Output Sink
```

Minimum task model:

- `Context Selector`: select content from the index or filesystem by recent N days, folder, daily note, heading, or tag.
- `Prompt Profile`: user-editable prompts plus a few built-in tasks.
- `Model Provider`: remote Claude/OpenAI-compatible chat API.
- `Output Sink`: write to a file, heading, daily-note summary block, or webhook.

High-value built-in tasks:

- Summarize yesterday's new content.
- Summarize yesterday's journal mood and write it below a configured summary heading.
- Detect themes from the last 7 days.
- Suggest Inbox triage.
- Surface open loops from active project notes.

## Security Principles

- External VaultEcho API calls use `Authorization: Bearer <API_TOKEN>`.
- Web UI, `/v1/config`, and `/health` use separate Basic Auth.
- AI provider API keys are encrypted at rest.
- AI-generated writes should preserve provenance fields such as `ai_generated`, `ai_task`, `model`, and `source_range`.
- Higher-risk AI outputs should first go to `AI/Drafts` or `AI/Reports`; only lower-risk outputs should write back into source notes automatically.

This roadmap keeps VaultEcho small enough for a personal VPS while moving a Vault from passive capture storage toward a system that can retrieve, summarize, and respond.
