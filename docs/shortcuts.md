# Apple Shortcuts Recipes

Chinese version: [shortcuts_cn.md](shortcuts_cn.md).

These recipes use Apple Shortcuts as a lightweight capture client for VaultEcho. They are designed for manual setup first. Importable `.shortcut` generation can be added later, but manual recipes are easier to audit, adapt, and share across iOS/macOS versions.

Importable starter shortcuts are included:

- [VaultEcho Daily Text Capture.shortcut](../shortcuts/VaultEcho%20Daily%20Text%20Capture.shortcut)
- [VaultEcho Daily Voice Capture.shortcut](../shortcuts/VaultEcho%20Daily%20Voice%20Capture.shortcut)

They are signed with macOS `shortcuts sign --mode anyone` and contain placeholders:

- URL: `https://YOUR_DOMAIN/v1/api/daily/append-by-time`
- Token: `Bearer CHANGE_ME_API_TOKEN`

After importing, edit the `Get Contents of URL` action and replace those placeholders with your VaultEcho domain and API token. To regenerate the files with your own placeholders, run:

```bash
VAULTECHO_SHORTCUT_BASE_URL=https://vault.example.com \
VAULTECHO_SHORTCUT_API_TOKEN=change-me \
npm run shortcuts:generate
```

Do not commit generated files that contain a real API token.

## Setup Variables

Create these values at the top of each shortcut, or store them in a shared helper shortcut:

- `VaultEcho URL`: `https://vault.example.com`
- `API Token`: your `.env` `API_TOKEN`
- `Endpoint`: usually `/v1/api/daily/append-by-time`

Use HTTPS when accessing VaultEcho outside your local network. Do not share your API token. VaultEcho is single-user and writes to one Vault, so friends should run their own instance unless you intentionally want them writing into your Vault.

## Recommended Daily Endpoint

For timestamped journal capture, use:

```http
POST /v1/api/daily/append-by-time
Authorization: Bearer <API_TOKEN>
Content-Type: application/json
```

Body:

```json
{
  "content": "Captured text",
  "idempotencyKey": "shortcut-unique-id"
}
```

This lets VaultEcho choose the target daily note path, heading level, time-slot heading, timestamp format, template, and blank-line spacing from the Web UI configuration.

Use this endpoint when the desired behavior is "write this under the current time-slot heading". If you need a fixed heading regardless of time, use `headings/insert-after-last-matching-line` and let the shortcut compute the daily file path, or create one all-day Daily slot for that fixed heading.

## Recipe 1: Action Button Daily Text

Use case: press the Action Button, type one thought, append it to today's daily note under the current configured time slot.

Shortcut actions:

1. `Ask for Input`
   - Prompt: `Capture`
   - Input Type: `Text`
2. `Get Contents of URL`
   - URL: `VaultEcho URL` + `/v1/api/daily/append-by-time`
   - Method: `POST`
   - Headers:
     - `Authorization`: `Bearer API Token`
     - `Content-Type`: `application/json`
   - Request Body: `JSON`
     - `content`: `Provided Input`
     - `idempotencyKey`: `Current Date` formatted as `yyyyMMdd-HHmmss`
3. `Show Notification`
   - Text: `Captured to daily note`

Assign this shortcut to the iPhone Action Button from iOS Settings.

## Recipe 2: Action Button Daily Dictation

Use case: press the Action Button, speak one thought, append the transcribed text to today's daily note.

Shortcut actions:

1. `Dictate Text`
   - Language: your preferred language
   - Stop Listening: `After Pause`
2. `Get Contents of URL`
   - URL: `VaultEcho URL` + `/v1/api/daily/append-by-time`
   - Method: `POST`
   - Headers:
     - `Authorization`: `Bearer API Token`
     - `Content-Type`: `application/json`
   - Request Body: `JSON`
     - `content`: `Dictated Text`
     - `idempotencyKey`: `Current Date` formatted as `yyyyMMdd-HHmmss`
3. `Show Notification`
   - Text: `Dictation captured`

This uses Apple's built-in speech-to-text on the device side. VaultEcho receives text, not the original audio.

## Recipe 3: Share Sheet To Daily

Use case: share selected text, a URL, or a snippet from another app into today's daily note.

Shortcut settings:

- Enable `Use as Quick Action` or `Show in Share Sheet`.
- Accepted input: `Text`, `URLs`.

Shortcut actions:

1. `Get Text from Input`
2. `Text`
   - Optional format:
     ```text
     {{Shortcut Input}}
     ```
3. `Get Contents of URL`
   - URL: `VaultEcho URL` + `/v1/api/daily/append-by-time`
   - Method: `POST`
   - Headers:
     - `Authorization`: `Bearer API Token`
     - `Content-Type`: `application/json`
   - Request Body: `JSON`
     - `content`: formatted text
     - `idempotencyKey`: `Current Date` formatted as `yyyyMMdd-HHmmss`

## Recipe 4: Inbox Append

Use case: capture raw notes to a single inbox file instead of the daily note.

Endpoint:

```http
POST /v1/api/files/append
```

Body:

```json
{
  "path": "Inbox/Shortcuts.md",
  "content": "\n- Captured text"
}
```

Use this when you do not want time-slot routing. For journal-like capture, prefer `daily/append-by-time`.

## Troubleshooting

- `401 Unauthorized`: check the `Authorization` header. It must be exactly `Bearer <API_TOKEN>`.
- `Top-level directory is not allowed`: add the first folder of the target path to `Allowed Top-Level Dirs`.
- Daily note created in the wrong folder: check Daily Timestamp Insertion Rules in the Web UI.
- Entry goes under the wrong heading: check the time zone and non-overlapping time slots.
- Works on Wi-Fi but not outside: expose VaultEcho through HTTPS reverse proxy or Cloudflare Tunnel; do not expose port `8787` directly.
