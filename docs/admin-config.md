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
- `Vault Directory Picker`: refreshes existing top-level Vault folders and renders them as checkbox choices. Use `Custom Dir` only for folders that do not exist yet but should be allowed, such as `Reviews`.
- `Max JSON Body Bytes`: request body size limit.
- `Image Attachment Dir` and `Audio Attachment Dir`: Vault-relative defaults for future attachment write flows.

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

Review tasks use an OpenAI-compatible chat API:

- `Provider`: fixed to `OpenAI Compatible`. Other provider names do not switch protocols; VaultEcho calls `Base URL + /chat/completions` for AI and `Base URL + /embeddings` for embeddings.
- `Base URL`: chat API base URL, for example `https://api.openai.com/v1` or another compatible gateway.
- `Model`: chat model name.
- `API Key`: saved encrypted with `APP_ENCRYPTION_KEY`. Leave blank to keep the existing key.
- `Temperature` and `Max Output Tokens`: passed to the chat completion call.

## Embedding

The first version uses a remote OpenAI-compatible embedding API and stores vectors in `data/index/embeddings.json`.

- `Enabled`: turns embedding features on.
- `Enable remote embeddings`: global switch for semantic search, auto-indexing, and semantic recall. The model settings are shown only when this is enabled.
- `Base URL`, `Model`, `API Key`: remote embedding API settings. The provider is fixed to the OpenAI-compatible protocol.
- `Dimensions`: optional expected vector dimensions. Use `0` to let VaultEcho infer it.
- `Batch Size`, `Max Chunk Chars`, `Search Limit`: indexing and search controls.
- `Auto Index After Write`: update changed files after VaultEcho writes them.
- `Auto Scan Interval Minutes`: optional background scan for files changed by Obsidian Headless Sync. Use `0` to disable.

Use `Rebuild Index` after the first setup, after changing embedding model/base URL, or after a large sync from Obsidian Headless.

## Review Tasks

Review Tasks are scheduled AI jobs that read period notes, optionally add semantic recall, call the configured AI model, and write a managed Markdown block back to the Vault.

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
- `Task ID`: stable identifier used by manual run, run history, and managed output block markers. Keep it lowercase and stable, for example `weekly-review`.
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
- `Use semantic recall`: searches the embedding index for historically related notes.
- `Semantic Recall Query`: optional fixed query. Leave blank to derive recall from the period notes.
- `Semantic Recall Limit`: number of recall chunks.
- `Semantic Recall Scope Dirs`: top-level directories allowed in recall results.
- `Output Path Template`: where to write the review.
- `Output Heading`: heading containing the managed block.
- `Write Mode`: `Replace managed block` updates the same managed block on rerun; `Append` only appends when the block is missing.
- `Prompt`: instructions for the AI model. Keep it specific and ask the model to ground claims in supplied notes.

### Output Template Variables

All periods support:

- `{{period}}`
- `{{periodLabel}}`
- `{{startDate}}`
- `{{endDate}}`

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

## Common Setup Pattern

1. Add your real top-level folders to `Allowed Top-Level Dirs`.
2. Set `Daily File Path` to the same path pattern your Obsidian daily notes use.
3. Keep `Include daily notes resolved from Daily File Path` enabled in review tasks.
4. Add `Reviews` to `Allowed Top-Level Dirs`.
5. Configure AI and embedding models.
6. Rebuild the embedding index.
7. Enable one review task, run it manually, inspect the output, then enable scheduling.
