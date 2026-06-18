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
- Multiline entries are supported. When inserting the next entry, VaultEcho treats the previous timestamp line and its following consecutive non-empty, non-timestamp lines as one entry block. A blank line terminates that block.
- `Keep a blank line between timestamp entries`: also keeps one blank line between the heading and the first timestamp entry.
- `Insert timestamp entries in chronological order`: enabled by default. When on, a new entry is placed in time order among the existing `[HH:mm]` lines under the target heading instead of always being appended below the last one. This keeps entries sorted even when sources such as the X connector backfill earlier timestamps. Turn it off to keep pure insertion order.
- Time slots: add any number of non-overlapping slots. The request time is evaluated in `Time Zone`, then the matching slot decides the target heading.
- `Connector Data`: internal daily-note sources. Supported platforms are X and Strava, and you can add multiple sources for different accounts or output rules.
- `Poll Interval`: global fixed interval for automatic polling. Available values are 15 minutes, 30 minutes, 1 hour, 2 hours, 6 hours, 12 hours, and 24 hours. Failed scheduled polls are retried after 15 minutes.
- Each source has its own name, enable switch, platform credentials, read options, and output settings. `Run Now` on a source saves the current config, then reads that source's recent sliding lookback window.
- X auth uses a Bearer or User Access Token from the X developer platform. The token is encrypted with `APP_ENCRYPTION_KEY`; leave the field blank to keep the existing token for that source.
- `X User ID` is preferred. If only `X Username` is set, VaultEcho does one extra user lookup before reading posts.
- Strava auth uses `Client ID`, `Client Secret`, and `Refresh Token`; secrets are encrypted with `APP_ENCRYPTION_KEY`. `Redirect URI` defaults to the current Admin UI URL, such as `https://your-vps.example/admin`; set the Strava app Authorization Callback Domain to the same VPS domain. VaultEcho refreshes the access token and stores the refreshed token state under `/data`. If you see `activity:read_permission missing`, the current authorization is missing the activity-read scope. Reauthorize from the Strava authorization link in Admin with `read,activity:read_all`; when Strava redirects back to Admin UI, the authorization code is filled automatically. You can also provide the new refresh token manually.
- Strava sources default to at most 10 activities per run and a 1000 ms delay between activity-detail requests. Keep these values conservative; historical backfills should use the local import script rather than frequent connector polling.
- Strava records all activity types. The only filter is `Min Moving Time` (default 5 minutes): activities shorter than that are skipped. Metrics an activity does not provide — for example speed and distance for indoor sports such as badminton or table tennis — are omitted from the entry rather than causing the whole activity to be dropped.
- Each scheduled poll uses a sliding lookback window based on the poll interval: 15 minutes -> 30 minutes, 30 minutes -> 1 hour, 1 hour -> 2 hours, 2 hours -> 6 hours, 6 hours -> 12 hours, 12 hours -> 24 hours, and 24 hours -> 48 hours. A daily 23:59 local catchup also reads the current local day from `00:00` to the catchup run time. Writes are idempotent by source plus post/activity ID. The default migrated X source keeps the previous `x-post-<id>` key format for compatibility.
- `Insertion Target`: choose `Separate Heading` or `Daily Time Slot`. `Separate Heading` writes into a fixed heading and creates it at the bottom of the daily note if missing. `Daily Time Slot` matches each post's `created_at` against the time slots above, so a 12:20 post goes into the configured afternoon heading.
- `Target Heading Markdown`: full Markdown heading such as `## Twitter`. This is used only when `Insertion Target` is `Separate Heading`.
- `Post Content Template`: controls the body before it is wrapped by the timestamp line format. Supported variables are `{{text}}`, `{{url}}`, `{{id}}`, `{{username}}`, and `{{created_at}}`.
- Strava writes into a configurable activity heading such as `## 今日运动` or `# 运动`. If the heading is missing, VaultEcho creates a separated block using `---` before and after the activity section. By default the block is inserted after the last configured Daily Time Slot heading; fill `Create After Heading` only when you want to override that default. Existing activity entries are merged and sorted by `[HH:mm]`.

Connector run history, connector temporary state files, and write idempotency records are pruned after one week. This keeps `/data` bounded while still protecting retries and repeated same-day polls.

### Strava Authorization Flow

Configure Strava first, then configure the VaultEcho connector:

1. Open [Strava API settings](https://www.strava.com/settings/api) and edit `My API Application`. Do not use the `My Apps` page for this; that page is for revoking apps you have authorized, not for developer app settings.
2. In Strava, set `Authorization Callback Domain` to the Admin UI domain only, for example `b.bojiapp.com`. Enter only the bare domain. Do not include `https://`, a port, or `/admin`. Invalid examples: `https://b.bojiapp.com`, `b.bojiapp.com:58702`, and `https://b.bojiapp.com/admin`.
3. If VaultEcho is currently exposed on a non-standard public port, such as `https://b.bojiapp.com:58702`, put it behind a reverse proxy on standard HTTPS 443 first, for example `https://b.bojiapp.com/admin`. Strava is strict about public `redirect_uri` port matching; `localhost` and `127.0.0.1` are special local-test exceptions.
4. Back in VaultEcho Admin, fill `Client ID` and `Client Secret` on the Strava source, then set `Strava Redirect URI` to the Admin UI URL, for example `https://b.bojiapp.com/admin`. This URL must be under the callback domain configured in Strava.
5. Click `Open Strava authorization URL`. On the Strava authorization page, keep activity read permission enabled, especially `activity:read_all`. After authorization, Strava redirects back to VaultEcho Admin and the page captures the authorization code automatically.
6. Click `Run Now` on that Strava source. VaultEcho saves the current config, exchanges the authorization code for a refresh token, and uses that refresh token to renew short-lived access tokens during scheduled polling.

If the authorization URL immediately returns `{"message":"Bad Request","errors":[{"resource":"Application","field":"redirect_uri","code":"invalid"}]}`, first check that Strava's `Authorization Callback Domain` is only the bare domain and that VaultEcho's `Redirect URI` is not using a non-standard public port.

VaultEcho does not cache Strava activity details. `/data` only stores necessary token state, run history, and idempotency records; run history, temporary state files, and idempotency records are retained for at most one week.

External callers usually should not send `at`; if they omit it, VaultEcho uses the current server time and converts it into the configured user timezone. Send `at` only when replaying a captured event from a known historical time.

## Apple Health

This section configures the Apple Health endpoints. Unlike connectors, Apple Health is receive-only: a companion device pushes raw HealthKit / WeatherKit data and VaultEcho aggregates and formats it server-side, then writes it into the daily note. VaultEcho never pulls from a device. Four endpoints are available (all Bearer auth): `POST /v1/api/health/sleep`, `POST /v1/api/health/workouts`, and `POST /v1/api/health/weather` take the raw object directly (recommended — no wrapper needed), and `POST /v1/api/health/ingest` takes a combined `{ "sleep": {...}, "workouts": [...], "weather": {...} }` (or a single bare object detected by shape).

- `Enable Apple Health ingest endpoint`: master switch. When off, `health/ingest` returns an error.
- Sleep, Workouts, and Weather are three independent sub-sections; you can enable any of them.
- `Sleep`: VaultEcho aggregates the raw `HKCategoryValueSleepAnalysis` samples of a session into one summary line — total asleep time, in-bed time, per-stage durations (deep / core / REM / awake), and optional average heart rate and HRV. A session is attributed to the wake day (a night that starts before midnight on the 16th and ends on the morning of the 17th lands in the 17th daily note). A day can hold several sessions: a night and an afternoon nap become two `[HH:mm]` entries merged and time-sorted under the sleep heading, exactly like the workout block. Each session is de-duplicated by its `id` (or, lacking one, the fall-asleep time), so re-pushing the same session never duplicates. Send one session per request, or several at once with `{ "sleep": { "sessions": [ ... ] } }`.
- `Workouts`: each `HKWorkout` is formatted with the same entry format as the Strava activity connector (type, duration, average/max heart rate, distance, calories, device link). Each workout is de-duplicated by its UUID, so re-pushing the same workout never duplicates. `Minimum duration (minutes)` skips workouts shorter than the threshold.
- `Weather`: each Apple WeatherKit reading becomes one single-line entry — a condition icon, temperature, localized condition, then feels-like, humidity, wind, and UV index. Post a single reading directly, the full WeatherKit response (its `currentWeather` is used), or `{ "weather": [ ... ] }` for several; humidity is accepted as a 0–1 fraction or a 0–100 percentage, and temperature defaults to °C. The condition accepts a WeatherKit code (e.g. `MostlyCloudy`) or an already-localized string. Each reading is de-duplicated by its `id` (or, lacking one, the reading's minute), so a later reading is a new line while a re-push of the same moment is not.
- `Insertion Target` (per sub-section): choose `Separate Heading` or `Daily Time Slot`. `Separate Heading` writes into a fixed heading such as `## 今日睡眠` or `## 今日运动`, creating a separated `---` block if missing; `Daily Time Slot` routes the entry into the matching time-slot heading by timestamp (workout start time, or sleep wake time).
- `Target Heading Markdown`: full Markdown heading, used only when `Insertion Target` is `Separate Heading`.
- `Create After Heading`: optional. Leave blank to insert the block after the last configured Daily Time Slot heading; fill it only to override that default insertion point.
- `Write Template`: the line format for each entry, written with placeholders and text. Conditional sections `{{#field}}...{{/field}}` render only when that metric is present, so absent metrics (an indoor workout without distance, an older watch without wrist temperature) drop their label and separator instead of leaving a dangling blank. Start the template with `[{{time}}]` (workouts) or `[{{wakeTime}}]` (sleep) so entries sort by time. Leave it empty to restore the default. Hover the info icon for the full placeholder list. Sleep placeholders include `wakeTime`, `bedTime`, `asleep`, `inBed`, `deep`/`core`/`rem`/`awake`, `latency`, `awakenings`, `avgHeartRate`/`minHeartRate`/`maxHeartRate`, `hrv`, `respiratoryRate`, `wristTemperature`, `spo2`, plus convenience groups `stages` and `vitals`. Workout placeholders include `time`, `type`, `name`, `duration`, `totalDuration`, `distance`, `avgPace`, `avgSpeed`/`maxSpeed`, `avgHeartRate`/`maxHeartRate`, `calories`, `elevationGain`, `flightsClimbed`, `steps`, `device`. A placeholder only renders when the iOS app actually sent that field — VaultEcho cannot read HealthKit itself. Workout type has three placeholders: `{{type}}` is a localized label (Chinese by default, e.g. `骑行`), `{{typeEn}}` is the humanized English name (e.g. `Cycling`), and `{{typeRaw}}` is the original token (e.g. `cycling`); non-Chinese users can switch the workout template's `{{type}}` to `{{typeEn}}`. Weather placeholders include `time`, `icon` (a condition emoji, e.g. ☁️; the moon is used for clear nights when `daylight` is sent), `condition`/`conditionEn`/`conditionRaw` (same localized/English/raw split as workout type), `temp`, `feelsLike`, `dewPoint`, `humidity`, `windSpeed`, `uvIndex`, `pressure`, and `visibility`.

Apple Health writes share the daily-note path, heading level, line pattern, blank-line spacing, and template settings from `Daily Timestamp Insertion Rules`, and reuse the same one-week idempotency-record retention. The `Daily` top-level directory must be in `Allowed Top-Level Dirs`.

The `health/*` endpoints accept request bodies up to 16 MB (regardless of `Max JSON Body Bytes`, which still governs the other endpoints), so a long workout's GPS `route` array does not hit the limit. VaultEcho ignores `route` entirely, so the app can also simply omit it to keep payloads small.

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
