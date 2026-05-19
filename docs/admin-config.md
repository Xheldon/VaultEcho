# Admin Configuration Guide

Chinese version: [admin-config_cn.md](admin-config_cn.md).

This page explains the Web admin UI fields. In Docker, keep the container paths as `/vault` and `/data`; mount host directories through `.env` and Docker Compose instead of entering host paths in the UI.

The admin UI is built from `admin/` with Vue, Vite, and Element Plus. The Node server only serves the compiled files from `public/admin` behind Basic Auth. Docker builds this automatically; local development should run `npm run admin:build` before `npm start` when UI files change.

The admin UI defaults to English and includes a language toggle for Chinese. The language choice is stored in browser `localStorage`; runtime config is not changed by switching languages.

## Access

- `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env` protect the Web admin UI, `/v1/config`, `/health`, and admin-style index or review actions with Basic Auth.
- `API_TOKEN` is only for external callers such as Coze, n8n, Telegram bots, or Apple Shortcuts. They send it as `Authorization: Bearer <API_TOKEN>` when calling `/v1/api/...`.
- The admin UI never asks for `API_TOKEN` and does not store it in the browser.
- Directory refresh in the admin UI uses Basic Auth through `/v1/config/vault-dirs`; it does not need the external Bearer token.

## Vault

- `Vault Root`: VaultEcho's writable Vault directory. Use `/vault` in Docker.
- `Data Dir`: runtime config, idempotency records, embedding index, and review run history. Use `/data` in Docker.
- `Time Zone`: the user's timezone. It drives daily note path resolution, `daily/append-by-time`, and scheduled review tasks.
- `Allowed Top-Level Dirs`: checkbox allowlist. New configs are initialized from existing top-level Vault folders when possible.
- `Include root Markdown files`: includes `.md` files directly under the Vault root in semantic indexing and review-task period sources.
- `Global Exclude Paths`: Vault-relative folders or files excluded from semantic indexing and all review tasks. Task-level exclude paths are merged with this global list.
- `Vault Directory Picker`: refreshes existing top-level Vault folders and renders them as checkbox choices. Use `Custom Dir` only for folders that do not exist yet but should be allowed, such as `Reviews`.
- `Max JSON Body Bytes`: request body size limit.
- `Image Attachment Dir`, `Audio Attachment Dir`, `Video Attachment Dir`, and `File Attachment Dir`: Vault-relative target folders used by `attachments/upload`. Set all four to the same path if you want every attachment type in one folder.
- `Max Attachment Upload Bytes`: maximum multipart upload size accepted by `attachments/upload`.

`Allowed Top-Level Dirs` does not support wildcards. Add the exact top-level folders you want VaultEcho to touch. Do not use `/` as a catch-all. Review Task directory fields reuse the same checkbox directory list.

## Daily Timestamp Insertion Rules

This section controls `daily/append-by-time`.

- `Daily File Path`: template for the daily note, for example `Daily/{{YYYY}}-{{MM}}-{{DD}}.md` or `Journal/{{YYYY}}/{{YYYY}}-{{MM}}-{{DD}}.md`.
- `Daily Template Path`: optional Vault-relative template file used when a daily note must be created.
- `Create the daily note when it does not exist`: if enabled, VaultEcho creates the daily note before inserting the timestamp entry.
- `Heading Level`: heading level for the time-slot headings, such as `2` for `## Afternoon`.
- `Line Pattern`: backend-owned single-line regex used to find existing timestamp lines.
- `Line Format`: format for new entries. The default is `[{{HH:mm}}] {{content}}`.
- `Keep a blank line between timestamp entries`: also keeps one blank line between the heading and the first timestamp entry.
- Time slots: add any number of non-overlapping slots. The request time is evaluated in `Time Zone`, then the matching slot decides the target heading.

External callers usually should not send `at`; if they omit it, VaultEcho uses the current server time and converts it into the configured user timezone. Send `at` only when replaying a captured event from a known historical time.

## AI Model

Review tasks can call either the OpenAI-compatible Chat Completions API or the official OpenAI Responses API:

- `Provider`: fixed to `OpenAI Compatible`. This controls the credential and gateway family; `API Mode` controls the request protocol.
- `API Mode`: use `Chat Completions` for OpenRouter, Groq, and most OpenAI-compatible gateways. Use `Responses API` for official OpenAI frontier models that require `/v1/responses`.
- `Base URL`: API base URL, for example `https://api.openai.com/v1` or another compatible gateway.
- `Model`: model name. In `Chat Completions` mode use a chat model such as `gpt-5-chat-latest`. In `Responses API` mode use a Responses-capable model such as `gpt-5.5`.
- `API Key`: saved encrypted with `APP_ENCRYPTION_KEY`. Leave blank to keep the existing key.
- `Temperature`: passed only in `Chat Completions` mode. VaultEcho omits it in `Responses API` mode for better compatibility with reasoning/frontier models.
- `Max Output Tokens`: sent as `max_tokens` for Chat Completions and `max_output_tokens` for Responses.

## Embedding

VaultEcho uses a remote OpenAI-compatible embedding API and stores vectors in `data/index/embeddings.json`.

Embedding does not use Chat Completions or Responses API. OpenAI's current embedding models, including `text-embedding-3-large` and `text-embedding-3-small`, still use `Base URL + /embeddings`. Their newer capability is the optional `dimensions` parameter, which VaultEcho already exposes.

- `Enabled`: turns embedding features on.
- `Enable remote embeddings`: global switch for semantic search, auto-indexing, and semantic recall. The model settings are shown only when this is enabled.
- `Base URL`, `Model`, `API Key`: remote embedding API settings. VaultEcho calls `Base URL + /embeddings`.
- `Dimensions`: optional expected vector dimensions. Use `0` to let VaultEcho infer it. For OpenAI `text-embedding-3-large`, the default is 3072 dimensions, but you may request a smaller dimension such as 1024 if your provider supports it.
- `Batch Size`, `Max Chunk Chars`, `Search Limit`: indexing and search controls.
- `Auto Index After Write`: update changed files after VaultEcho writes them.
- `Auto Scan Interval Minutes`: optional background scan for files changed by Obsidian Headless Sync. Use `0` to disable.

Use `Rebuild Index` after the first setup, after changing embedding model/base URL, or after a large sync from Obsidian Headless.

## Review Tasks

Review Tasks are scheduled AI jobs that read period notes, optionally add semantic recall, call the configured AI model, and append review entries to a configured Markdown review file in the Vault.

The UI now uses editable task cards. The `Advanced JSON` section is only an escape hatch for bulk import/export or fields not yet exposed by the card UI. If you edit JSON manually, click `Apply JSON To Cards` before saving.

### Global Fields

- `Enable automatic scheduling`: starts or stops background scheduling. Task cards are shown only when this is enabled.
- `Review Status`: loads each task's enabled state, next run time, and latest run record.
- `Max Source Chars`: maximum characters from current-period source notes sent to AI.
- `Max Recall Chars`: maximum characters from semantic recall results sent to AI.

Review tasks use exact timers, not a per-minute polling loop. When config changes, VaultEcho reloads the scheduler from the current task cards.

### Task Card Fields

- `Enable this task`: enables this specific card for automatic scheduling. Multiple tasks can be enabled at the same time.
- `Run Now`: saves the current admin config, then runs this specific task once. It does not mark the scheduled run as complete.
- `Task ID`: stable identifier used by manual run and run history. Keep it lowercase and stable, for example `weekly-review`.
- `Name`: display name only.
- `Period`: `weekly`, `monthly`, `quarterly`, or `yearly`.
- `Target Period`: usually `Previous completed period`. Use `Current period` for in-progress reviews.
- `Run Time`: wall-clock time in the global `Time Zone`.
- `Weekday`: weekly schedule only. `0` is Sunday and `1` is Monday.
- `Month Day`: monthly schedule day. For yearly tasks it is also the day of the selected month.
- `Quarter Day Offset`: quarterly schedule day offset. `1` means the first day of each quarter.
- `Month`: yearly schedule month, `1` to `12`.
- `Include daily notes resolved from Daily File Path`: reads every daily note path in the period using the configured Daily File Path. This works even if your daily folder is named `Journal` or `日记`.
- `Source Dirs`: other top-level Vault directories scanned by file modified time for the selected period.
- `Exclude Paths`: Vault-relative folders or subfolders excluded from both source notes and semantic recall. Use this for attachments, imports, or historical bulk folders such as `Attachments` or `Media/Movies`.
- `Use semantic recall`: searches the embedding index for historically related notes.
- `Semantic Recall Query`: optional fixed query. Leave blank to derive recall from the period notes.
- `Semantic Recall Limit`: number of recall chunks.
- `Semantic Recall Scope Dirs`: top-level directories allowed in recall results.
- `Output Path Template`: review file path. If the file already exists, each run appends a new review entry to the end.
- `Review Template Path`: optional Vault-relative Markdown template used only when the output file is first created. Use it for stable YAML/frontmatter. `.md` may be omitted.
- `Output Heading`: title used when no review template is configured.
- `Prompt`: instructions for the AI model. Keep it specific and ask the model to ground claims in supplied notes.

Each run appends a fixed callout followed by the AI review body:

```md
> [!info] VaultEcho Review
> Period: 2026-W20 (2026-05-11 to 2026-05-18)
> Generated At: 2026-05-18 14:33:21
```

`Generated At` is formatted in the global `Time Zone`.

### Output And Review Template Variables

All periods support:

- `{{period}}`
- `{{periodLabel}}`
- `{{startDate}}`
- `{{endDate}}`
- `{{generatedAt}}`
- `{{title}}`
- `{{heading}}`
- `{{taskId}}`
- `{{taskName}}`
- `{{outputPath}}`

Period-specific variables:

- Weekly: `{{YYYY}}`, `{{WW}}`
- Monthly: `{{YYYY}}`, `{{MM}}`
- Quarterly: `{{YYYY}}`, `{{Q}}`
- Yearly: `{{YYYY}}`

Examples:

- `Reviews/Weekly/{{YYYY}}-W{{WW}}.md`
- `Reviews/Monthly/{{YYYY}}-{{MM}}.md`
- `Reviews/Quarterly/{{YYYY}}-Q{{Q}}.md`
- `Reviews/Yearly/{{YYYY}}.md`

Review template example:

```md
---
type: weekly-review
period: {{periodLabel}}
created: {{generatedAt}}
tags:
  - review
---
```

VaultEcho always appends the fixed callout and AI review body after the existing file content. The template does not need a `{{content}}` placeholder.

## Common Setup Pattern

1. Add your real top-level folders to `Allowed Top-Level Dirs`.
2. Set `Daily File Path` to the same path pattern your Obsidian daily notes use.
3. Keep `Include daily notes resolved from Daily File Path` enabled in review tasks.
4. Add `Reviews` to `Allowed Top-Level Dirs`.
5. Configure AI and embedding models.
6. Rebuild the embedding index.
7. Enable one review task, run it manually, inspect the output, then enable scheduling.
