# API Reference

This file is generated from `src/api-spec.js`. Do not edit it by hand.

All operation endpoints use:

```http
/v1/api/<resource>/<action>
Authorization: Bearer <API_TOKEN>
```

## Route Overview

| Route | Method | Purpose |
|---|---|---|
| `index/errors/clear` | POST | Clears the most recent local error records saved by automatic indexing. |
| `files/create` | POST | Creates a new Markdown file inside the Vault. |
| `files/read` | GET or POST | Reads a Markdown file from the Vault. Very large files are rejected to protect small VPS deployments. |
| `attachments/upload` | POST multipart/form-data | Uploads one binary attachment into the configured Vault attachment folder and returns flat insertable link text fields. |
| `files/write` | POST | Replaces a Markdown file with new content. |
| `files/append` | POST | Appends content to the end of a file. The write is rejected when the final file would exceed the server limit. |
| `files/prepend` | POST | Inserts content at the beginning of a file. |
| `files/delete` | DELETE or POST | Moves a file into Archive/Deleted instead of deleting it permanently. |
| `files/list` | GET or POST | Lists files and subdirectories inside a Vault directory. |
| `headings/read` | GET or POST | Reads the content under a specific Markdown heading. |
| `headings/append` | POST | Appends content to the end of a heading block. |
| `headings/prepend` | POST | Inserts content directly below a heading. |
| `headings/replace` | POST | Keeps the heading itself and replaces all content below it. |
| `headings/insert-after-last-matching-line` | POST | Finds the final line matching the configured pattern inside a heading block and inserts content below it. |
| `frontmatter/get` | GET or POST | Reads a YAML frontmatter field. |
| `frontmatter/set` | POST | Sets or creates a YAML frontmatter field. |
| `daily/append-by-time` | POST | Chooses a daily-note heading from configured timezone slots and inserts the entry in chronological order among the existing timestamp lines. |
| `daily/read` | GET or POST | Resolves the daily-note path from configuration and reads that note. |
| `search/simple` | GET or POST | Searches Markdown files with simple substring matching. |
| `search/semantic` | POST | Performs semantic similarity search using the built remote embedding index. |
| `index/status` | GET or POST | Shows whether embedding configuration is ready and how many files and chunks are indexed. |
| `index/rebuild` | POST | Scans Markdown files under allowed directories, calls the remote embedding API, and updates the local index. |
| `index/file` | POST | Rebuilds the embedding index for one Markdown file; removes it from the index when the file no longer exists. |
| `reviews/status` | GET or POST | Shows configured review tasks, whether scheduling is enabled, next run times, and last run records. |
| `reviews/run` | POST | Runs one configured review task immediately, using period sources, semantic recall, the configured AI model, and the task output path. |
| `connectors/status` | GET or POST | Shows configured connector source scheduling state, next run time, and the last connector run record for each source. |
| `connectors/run` | POST | Runs one configured connector source immediately; supports X posts and Strava activities in the source's sliding lookback window. |
| `tags/list` | GET | Counts Markdown hashtags under allowed directories. |
| `batch` | POST | Executes multiple API operations in one request. |
| `uri/execute` | POST | Parses an Obsidian URI and executes the parts that can be mapped to Vault filesystem operations. |
| `unsupported/active` | GET or POST | Returns an explicit unsupported response for desktop-only active-file behavior. |
| `unsupported/commands` | GET or POST | Returns an explicit unsupported response for desktop Obsidian command execution. |

## Short Aliases

| Alias | Standard Route |
|---|---|
| `new` | `files/create` |
| `create` | `files/create` |
| `open` | `files/read` |
| `read` | `files/read` |
| `write` | `files/write` |
| `append` | `files/append` |
| `prepend` | `files/prepend` |
| `delete` | `files/delete` |
| `list` | `files/list` |
| `daily` | `daily/append-by-time` |
| `search` | `search/simple` |
| `semantic` | `search/semantic` |
| `tags` | `tags/list` |
| `reindex` | `index/rebuild` |
| `index` | `index/status` |
| `review` | `reviews/run` |
| `reviews` | `reviews/status` |
| `connector` | `connectors/run` |
| `connectors` | `connectors/status` |
| `script` | `batch` |
| `uri` | `uri/execute` |
| `active` | `unsupported/active` |
| `commands` | `unsupported/commands` |

## index/errors/clear

**Clear Embedding Error Records**

Clears the most recent local error records saved by automatic indexing.

Method: `POST`

Use cases:

- Remove stale Web UI error messages after fixing the embedding API key or base URL.
- Reset index error state after confirming automatic indexing has recovered.

Example:

```bash
curl -X POST http://localhost:8787/v1/api/index/errors/clear \
  -H "Authorization: Bearer change-me"
```

## files/create

**Create Markdown File**

Creates a new Markdown file inside the Vault.

Method: `POST`

Use cases:

- Coze has turned an idea into a note and needs to write it into Ideas.
- A capture pipeline has cleaned external material and needs to write it into Notes.
- A workflow needs to create a note from a Vault template and override template YAML fields from the request.
- A workflow needs to append a suffix on filename collisions instead of overwriting existing notes.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Vault-relative path. `files/create` only creates Markdown files; `.md` is added when no extension is present. Paths without an allowed top-level directory are placed under Inbox/. |
| `content | text` | Markdown body. |
| `templatePath | template` | Optional Vault-relative template path. The template is applied first, then content is merged. Templates support variables such as `{{content}}`, `{{title}}`, `{{yyyy-MM-dd}}`, and `{{HH:mm}}`. |
| `yaml | frontmatter` | Optional object. Applied last to frontmatter, so request fields override YAML fields from the template. |
| `ifExists` | Collision strategy when the file already exists: fail, overwrite, or append_suffix. Default: fail. |
| `idempotencyKey` | Optional key that prevents duplicate writes during upstream retries. |
| `script` | Optional URL-encoded JSON Vault Script executed after the primary operation. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/files/create \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "path": "Ideas/api-note.md",
    "templatePath": "Templates/idea.md",
    "content": "Hello",
    "yaml": {
      "status": "done",
      "source": "coze"
    },
    "ifExists": "append_suffix"
  }'
```

## files/read

**Read File**

Reads a Markdown file from the Vault. Very large files are rejected to protect small VPS deployments.

Method: `GET or POST`

Use cases:

- A workflow needs to read an existing note before deciding how to update it.
- You need to verify what the gateway actually wrote during debugging.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Vault-relative path. |

Example:

```bash
curl "http://localhost:8787/v1/api/files/read?path=Ideas/api-note.md" \
  -H "Authorization: Bearer change-me"
```

## attachments/upload

**Upload Attachment**

Uploads one binary attachment into the configured Vault attachment folder and returns flat insertable link text fields.

Method: `POST multipart/form-data`

Use cases:

- Apple Shortcuts uploads a photo or voice memo, then inserts the returned wiki link into a daily note.
- Coze uploads a processed attachment separately from Markdown creation to keep note-writing APIs simple.
- A workflow needs to store arbitrary files such as images, audio, video, PDFs, RAW files, or archives in the Vault.

Parameters:

| Parameter | Description |
|---|---|
| `file` | Required multipart file field. |
| `type` | Optional attachment type: image, audio, video, or file. If omitted, VaultEcho infers it from MIME type and falls back to file. |
| `filename | name` | Optional filename override. Filename collisions automatically append a numeric suffix. |
| `alt` | Optional alt text used in the returned Markdown image-style link. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/attachments/upload \
  -H "Authorization: Bearer change-me" \
  -F "type=image" \
  -F "file=@/path/to/photo.png"
```

## files/write

**Overwrite File**

Replaces a Markdown file with new content.

Method: `POST`

Use cases:

- Regenerate a note from an upstream source of truth.
- Replace a temporary Inbox note with a cleaned AI result.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Vault-relative path. |
| `content | text` | Full file content. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/files/write \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md", "content": "Full replacement" }'
```

## files/append

**Append To File**

Appends content to the end of a file. The write is rejected when the final file would exceed the server limit.

Method: `POST`

Use cases:

- Append raw captures to an Inbox log.
- Append generated references to an existing note.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Vault-relative path. |
| `content | text` | Content to append. |
| `idempotencyKey` | Optional key that prevents duplicate writes during upstream retries. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/files/append \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Inbox/2026-05-13.md", "content": "\n- New capture" }'
```

## files/prepend

**Prepend To File**

Inserts content at the beginning of a file.

Method: `POST`

Use cases:

- Add a summary block at the top of an imported note.
- Insert a warning or processing status at the beginning of a note.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Vault-relative path. |
| `content | text` | Content to insert. |
| `idempotencyKey` | Optional key that prevents duplicate writes during upstream retries. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/files/prepend \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md", "content": "> AI summary\n\n" }'
```

## files/delete

**Soft Delete File**

Moves a file into Archive/Deleted instead of deleting it permanently.

Method: `DELETE or POST`

Use cases:

- Clean up an incorrect capture while keeping a recovery path.
- Safely archive outdated generated notes.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Vault-relative path. |
| `idempotencyKey` | Optional key that prevents duplicate writes during upstream retries. |

Example:

```bash
curl -X DELETE "http://localhost:8787/v1/api/files/delete?path=Inbox/old.md" \
  -H "Authorization: Bearer change-me"
```

## files/list

**List Files**

Lists files and subdirectories inside a Vault directory.

Method: `GET or POST`

Use cases:

- Inspect what has already been written under Inbox or Ideas.
- Let an automation choose candidate files from a directory.

Parameters:

| Parameter | Description |
|---|---|
| `path` | Optional directory path. When omitted, existing configured top-level directories are listed. |

Example:

```bash
curl "http://localhost:8787/v1/api/files/list?path=Ideas" \
  -H "Authorization: Bearer change-me"
```

## headings/read

**Read Heading Block**

Reads the content under a specific Markdown heading.

Method: `GET or POST`

Use cases:

- Read today's Afternoon daily-note section before generating a summary.
- Read the Decisions section from a project note.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |
| `heading` | Heading text without leading # characters. |
| `headingLevel` | Optional heading level. Default: 2. |

Example:

```bash
curl "http://localhost:8787/v1/api/headings/read?path=Daily/2026-05-13.md&heading=Afternoon" \
  -H "Authorization: Bearer change-me"
```

## headings/append

**Append To Heading Block**

Appends content to the end of a heading block.

Method: `POST`

Use cases:

- Append one line to a project log section.
- Append a processed capture to a specific section of a note.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |
| `heading` | Heading text without leading # characters. |
| `headingLevel` | Optional heading level. Default: 2. |
| `content | text` | Content to append. |
| `ifHeadingMissing` | Behavior when the heading does not exist: create or error. Default: create. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/headings/append \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Daily/2026-05-13.md", "heading": "Afternoon", "content": "[16:21] New item" }'
```

## headings/prepend

**Prepend To Heading Block**

Inserts content directly below a heading.

Method: `POST`

Use cases:

- Place a summary at the start of a section.
- Put a new high-priority action item before older items.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |
| `heading` | Heading text without leading # characters. |
| `content | text` | Content to insert. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/headings/prepend \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Projects/demo.md", "heading": "Next", "content": "- First priority" }'
```

## headings/replace

**Replace Heading Block**

Keeps the heading itself and replaces all content below it.

Method: `POST`

Use cases:

- Regenerate a status section from the latest project data.
- Replace an AI summary without touching the rest of the note.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |
| `heading` | Heading text without leading # characters. |
| `content | text` | Replacement content. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/headings/replace \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Projects/demo.md", "heading": "Status", "content": "Green" }'
```

## headings/insert-after-last-matching-line

**Insert After Last Matching Line**

Finds the final line matching the configured pattern inside a heading block and inserts content below it.

Method: `POST`

Use cases:

- Insert `[HH:mm]` daily entries below the last timestamp line in Morning, Afternoon, or Evening.
- Insert new content below the last checklist item with a specific prefix.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |
| `heading` | Heading text without leading # characters. |
| `content | text` | Content to insert. |

Example:

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

## frontmatter/get

**Read Frontmatter Field**

Reads a YAML frontmatter field.

Method: `GET or POST`

Use cases:

- Check whether a note has already been processed.
- Read type or status before choosing a workflow.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |
| `key | field` | Frontmatter field name. |

Example:

```bash
curl "http://localhost:8787/v1/api/frontmatter/get?path=Ideas/api-note.md&key=status" \
  -H "Authorization: Bearer change-me"
```

## frontmatter/set

**Set Frontmatter Field**

Sets or creates a YAML frontmatter field.

Method: `POST`

Use cases:

- Mark an AI-processed note with status: done.
- Write source or type metadata onto a capture.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |
| `key | field` | Frontmatter field name. |
| `value | content | text` | Value to save. String values that look like JSON are parsed. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/frontmatter/set \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md", "key": "status", "value": "draft" }'
```

## daily/append-by-time

**Append Daily Entry By Time**

Chooses a daily-note heading from configured timezone slots and inserts the entry in chronological order among the existing timestamp lines.

Method: `POST`

Use cases:

- Coze only sends the processed journal text; the gateway decides whether it belongs under Morning, Afternoon, or Evening.
- Shortcuts sends a quick note and the gateway applies the configured `[HH:mm]` line format.

Parameters:

| Parameter | Description |
|---|---|
| `content | text` | Entry body without the `[HH:mm]` prefix. |
| `at` | Optional ISO timestamp. Defaults to the current time. |
| `createIfMissing` | Optional boolean override. Defaults to the Daily Note setting. |
| `templatePath | template` | Optional Vault-relative template path override used when creating a missing daily note. |
| `idempotencyKey` | Optional key that prevents duplicate writes during upstream retries. |

Example:

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

## daily/read

**Read Daily Note**

Resolves the daily-note path from configuration and reads that note.

Method: `GET or POST`

Use cases:

- Read today's journal before generating an AI review.
- Read a specific date before writing a summary block.

Parameters:

| Parameter | Description |
|---|---|
| `at` | Optional ISO timestamp used to resolve the daily-note path. |

Example:

```bash
curl "http://localhost:8787/v1/api/daily/read?at=2026-05-13T00:00:00%2B08:00" \
  -H "Authorization: Bearer change-me"
```

## search/simple

**Simple Search**

Searches Markdown files with simple substring matching.

Method: `GET or POST`

Use cases:

- Find notes mentioning a keyword before creating links or updates.
- Debug whether a capture already exists.

Parameters:

| Parameter | Description |
|---|---|
| `query | content | text` | String to search for. |
| `limit` | Maximum number of results. Default: 100. Maximum: 500. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/search/simple \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "query": "Obsidian" }'
```

## search/semantic

**Semantic Search**

Performs semantic similarity search using the built remote embedding index.

Method: `POST`

Use cases:

- An AI task needs older notes related to the current input.
- Search by meaning, such as 'what have I been worried about recently', without exact keywords.
- Coze has generated a query and needs VaultEcho to retrieve relevant context from the Vault.

Parameters:

| Parameter | Description |
|---|---|
| `query | content | text` | Query text. The server calls the configured embedding model to create the query vector. |
| `limit` | Maximum number of results. Defaults to the configured searchLimit. Hard maximum: 50. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/search/semantic \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "query": "Obsidian automation ideas I have been exploring recently", "limit": 5 }'
```

## index/status

**Get Index Status**

Shows whether embedding configuration is ready and how many files and chunks are indexed.

Method: `GET or POST`

Use cases:

- Confirm the API key, base URL, and model name after deployment.
- Check whether the index is empty or needs rebuilding before debugging semantic search.

Example:

```bash
curl http://localhost:8787/v1/api/index/status \
  -H "Authorization: Bearer change-me"
```

## index/rebuild

**Rebuild Embedding Index**

Scans Markdown files under allowed directories, calls the remote embedding API, and updates the local index.

Method: `POST`

Use cases:

- Build the semantic index for a Vault after first deployment.
- Regenerate embeddings after changing the embedding model, base URL, or chunk size.
- Compensate after an external Obsidian Headless Sync process pulls a large batch of historical notes.

Parameters:

| Parameter | Description |
|---|---|
| `force` | Optional boolean. When true, ignores hash cache and regenerates embeddings for all files. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/index/rebuild \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "force": false }'
```

## index/file

**Index One File**

Rebuilds the embedding index for one Markdown file; removes it from the index when the file no longer exists.

Method: `POST`

Use cases:

- An external sync or script just changed one note and only that note needs updating.
- Debug chunking and retrieval behavior for a specific file.

Parameters:

| Parameter | Description |
|---|---|
| `path | filename | file | name` | Target Markdown file. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/index/file \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "path": "Ideas/api-note.md" }'
```

## reviews/status

**Get Review Task Status**

Shows configured review tasks, whether scheduling is enabled, next run times, and last run records.

Method: `GET or POST`

Use cases:

- Confirm weekly, monthly, quarterly, and yearly review schedules after changing Web UI config.
- Check whether a scheduled review already ran for a period.

Example:

```bash
curl http://localhost:8787/v1/api/reviews/status \
  -H "Authorization: Bearer change-me"
```

## reviews/run

**Run Review Task Now**

Runs one configured review task immediately, using period sources, semantic recall, the configured AI model, and the task output path.

Method: `POST`

Use cases:

- Test a review prompt before enabling the scheduled task.
- Manually regenerate a weekly, monthly, quarterly, or yearly reflection.

Parameters:

| Parameter | Description |
|---|---|
| `taskId | id | task` | Review task id, for example weekly-review. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/reviews/run \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "taskId": "weekly-review" }'
```

## connectors/status

**Get Connector Status**

Shows configured connector source scheduling state, next run time, and the last connector run record for each source.

Method: `GET or POST`

Use cases:

- Confirm which X sources are enabled and scheduled after changing Web UI config.
- Check the last manual or scheduled X sync result for each source.

Example:

```bash
curl http://localhost:8787/v1/api/connectors/status \
  -H "Authorization: Bearer change-me"
```

## connectors/run

**Run Connector Now**

Runs one configured connector source immediately; supports X posts and Strava activities in the source's sliding lookback window.

Method: `POST`

Use cases:

- Manually sync recent X posts from one configured X source.
- Manually sync recent Strava activities into a configured daily-note activity heading.
- Test one source's API credentials and Markdown insertion before enabling polling.

Parameters:

| Parameter | Description |
|---|---|
| `connectorId | id | platform` | Connector source id. The migrated default source is `x`; Strava sources commonly use `strava` or their generated ids. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/connectors/run \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "connectorId": "x" }'
```

## tags/list

**List Tags**

Counts Markdown hashtags under allowed directories.

Method: `GET`

Use cases:

- Inspect tag distribution in captured notes.
- Let an AI task choose from existing topic tags.

Example:

```bash
curl http://localhost:8787/v1/api/tags/list \
  -H "Authorization: Bearer change-me"
```

## batch

**Batch Operations**

Executes multiple API operations in one request.

Method: `POST`

Use cases:

- Create a note and then set frontmatter.
- Write a project log and append a reference to the daily note in the same request.

Parameters:

| Parameter | Description |
|---|---|
| `operations` | Operation array. Each item uses route/action/op to select an API endpoint and includes that endpoint's parameters. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/batch \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "operations": [
      { "route": "files/write", "path": "Ideas/batch-demo.md", "content": "## Log\n" },
      { "route": "headings/append", "path": "Ideas/batch-demo.md", "heading": "Log", "content": "Item" }
    ]
  }'
```

## uri/execute

**Execute Obsidian URI Compatible Request**

Parses an Obsidian URI and executes the parts that can be mapped to Vault filesystem operations.

Method: `POST`

Use cases:

- Receive an obsidian://new URI generated by an existing automation.
- Bridge URI-style actions into VaultEcho's unified API namespace.

Parameters:

| Parameter | Description |
|---|---|
| `uri` | obsidian:// URI string. Action-style fields are also accepted. |

Example:

```bash
curl -X POST http://localhost:8787/v1/api/uri/execute \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{ "uri": "obsidian://new?file=Ideas%2Furi-demo&content=Hello%20URI" }'
```

## unsupported/active

**Unsupported: Active File**

Returns an explicit unsupported response for desktop-only active-file behavior.

Method: `GET or POST`

Use cases:

- Compatibility probing when a client expects a Local REST API active-file route to exist.

Example:

```bash
curl http://localhost:8787/v1/api/active \
  -H "Authorization: Bearer change-me"
```

## unsupported/commands

**Unsupported: Commands**

Returns an explicit unsupported response for desktop Obsidian command execution.

Method: `GET or POST`

Use cases:

- Compatibility probing when a client expects a Local REST API command route to exist.

Example:

```bash
curl http://localhost:8787/v1/api/commands \
  -H "Authorization: Bearer change-me"
```
