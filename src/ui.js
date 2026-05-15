export function renderAdminPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VaultEcho</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f9;
      --panel: #ffffff;
      --text: #1f2937;
      --muted: #6b7280;
      --border: #d8dee8;
      --accent: #2563eb;
      --accent-dark: #1d4ed8;
      --danger: #b42318;
      --ok: #047857;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1120px, calc(100vw - 32px));
      margin: 32px auto 56px;
    }
    header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      margin-bottom: 24px;
    }
    h1 {
      margin: 0 0 6px;
      font-size: 28px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: var(--muted);
      line-height: 1.6;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-top: 16px;
    }
    details {
      margin-top: 16px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0;
    }
    summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 18px 20px;
      cursor: pointer;
      list-style: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary h2 {
      margin: 0;
    }
    summary::after {
      content: "+";
      color: var(--muted);
      font-weight: 800;
      font-size: 18px;
      line-height: 1;
    }
    details[open] summary {
      border-bottom: 1px solid var(--border);
    }
    details[open] summary::after { content: "-"; }
    .details-body {
      padding: 20px;
    }
    h2 {
      margin: 0 0 16px;
      font-size: 17px;
      letter-spacing: 0;
    }
    label {
      display: grid;
      gap: 7px;
      font-size: 13px;
      color: #374151;
      font-weight: 600;
    }
    input, textarea, select {
      width: 100%;
      min-height: 40px;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 9px 10px;
      font: inherit;
      color: var(--text);
      background: #fff;
    }
    textarea {
      min-height: 84px;
      resize: vertical;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }
    .actions {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 10px;
      margin-top: 18px;
    }
    button {
      min-height: 40px;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0 14px;
      font: inherit;
      font-weight: 700;
      background: #fff;
      color: var(--text);
      cursor: pointer;
    }
    button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: #fff;
    }
    button.primary:hover { background: var(--accent-dark); }
    button.danger {
      color: var(--danger);
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 8px 6px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    th {
      color: var(--muted);
      font-size: 12px;
      font-weight: 700;
    }
    td:last-child, th:last-child {
      width: 1%;
      white-space: nowrap;
    }
    .status {
      min-height: 24px;
      margin-top: 14px;
      font-size: 13px;
      color: var(--muted);
    }
    .status.ok { color: var(--ok); }
    .status.error { color: var(--danger); }
    .hint {
      font-size: 12px;
      color: var(--muted);
      font-weight: 500;
    }
    .checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 700;
    }
    .checkbox input {
      width: auto;
      min-height: auto;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: #eef2f7;
      border-radius: 4px;
      padding: 1px 4px;
    }
    @media (max-width: 760px) {
      main { width: min(100vw - 24px, 1120px); margin-top: 20px; }
      header { display: block; }
      .grid { grid-template-columns: 1fr; }
      table, tbody, tr, td, th { display: block; width: 100%; }
      thead { display: none; }
      tr { padding: 8px 0; border-bottom: 1px solid var(--border); }
      td { border: 0; padding: 6px 0; }
      td:last-child { width: 100%; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>VaultEcho</h1>
        <p>Capture anything. Let your vault answer back. Admin pages use Basic Auth; external API calls use Bearer tokens.</p>
      </div>
      <button id="loadButton">Load Config</button>
    </header>

    <section>
      <h2>Access</h2>
      <p>This page is protected by <code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code>. <code>API_TOKEN</code> is only for external systems such as Coze or Shortcuts calling <code>/v1/api/...</code>; it is never entered here or stored in the browser.</p>
    </section>

    <section>
      <h2>Vault</h2>
      <div class="grid">
        <label>
          Vault Root
          <input id="vaultRoot" placeholder="/vault" />
        </label>
        <label>
          Data Dir
          <input id="dataDir" placeholder="/data" />
        </label>
        <label>
          Time Zone
          <input id="timeZone" placeholder="Asia/Shanghai" />
          <span class="hint">Global user time zone. Daily timestamp insertion and review task schedules both use this value.</span>
        </label>
        <label>
          Allowed Top-Level Dirs
          <textarea id="allowedDirs" placeholder="Inbox,Notes,Ideas,Projects,Daily,Reviews,Templates,Attachments,Archive"></textarea>
          <span class="hint">Comma-separated. Every write path must stay inside one of these top-level directories.</span>
        </label>
        <label>
          Max JSON Body Bytes
          <input id="maxJsonBodyBytes" type="number" min="1024" step="1024" />
        </label>
        <label>
          Image Attachment Dir
          <input id="imageAttachmentDir" placeholder="Attachments/Images" />
          <span class="hint">Vault-relative directory. Future image attachment writes use this by default.</span>
        </label>
        <label>
          Audio Attachment Dir
          <input id="audioAttachmentDir" placeholder="Attachments/Audio" />
          <span class="hint">Vault-relative directory. Future audio attachment writes use this by default.</span>
        </label>
      </div>
    </section>

    <section>
      <h2>AI Model</h2>
      <div class="grid">
        <label>
          Provider
          <input id="aiProvider" placeholder="openai-compatible" />
        </label>
        <label>
          Base URL
          <input id="aiBaseUrl" placeholder="https://api.openai.com/v1" />
        </label>
        <label>
          Model
          <input id="aiModel" placeholder="gpt-4.1-mini" />
        </label>
        <label>
          API Key
          <input id="aiApiKey" type="password" autocomplete="off" placeholder="Leave blank to keep the saved key" />
          <span id="aiApiKeyHint" class="hint">The API key is encrypted with <code>APP_ENCRYPTION_KEY</code> before it is saved.</span>
        </label>
        <label>
          Temperature
          <input id="aiTemperature" type="number" min="0" max="2" step="0.1" />
        </label>
        <label>
          Max Output Tokens
          <input id="aiMaxOutputTokens" type="number" min="100" step="100" />
        </label>
      </div>
    </section>

    <section>
      <h2>Semantic Index</h2>
      <label class="checkbox">
        <input id="embeddingEnabled" type="checkbox" />
        Enable remote embeddings
      </label>
      <div class="grid" style="margin-top: 16px;">
        <label>
          Provider
          <input id="embeddingProvider" placeholder="openai-compatible" />
        </label>
        <label>
          Base URL
          <input id="embeddingBaseUrl" placeholder="https://api.openai.com/v1" />
        </label>
        <label>
          Model
          <input id="embeddingModel" placeholder="text-embedding-3-small" />
        </label>
        <label>
          API Key
          <input id="embeddingApiKey" type="password" autocomplete="off" placeholder="Leave blank to keep the saved key" />
          <span id="embeddingApiKeyHint" class="hint">The API key is encrypted with <code>APP_ENCRYPTION_KEY</code> before it is saved.</span>
        </label>
        <label>
          Dimensions
          <input id="embeddingDimensions" type="number" min="0" step="1" />
          <span class="hint">Optional. Keep 0 when the model does not support explicit dimensions.</span>
        </label>
        <label>
          Batch Size
          <input id="embeddingBatchSize" type="number" min="1" step="1" />
        </label>
        <label>
          Max Chunk Chars
          <input id="embeddingMaxChunkChars" type="number" min="200" step="100" />
        </label>
        <label>
          Search Limit
          <input id="embeddingSearchLimit" type="number" min="1" max="50" step="1" />
        </label>
        <label>
          Auto Scan Interval Minutes
          <input id="embeddingAutoScanIntervalMinutes" type="number" min="0" step="1" />
          <span class="hint">0 disables scanning. Use this to pick up changes pulled by your external Obsidian Headless Sync process.</span>
        </label>
        <label class="checkbox">
          <input id="embeddingAutoIndexAfterWrite" type="checkbox" />
          Index files automatically after API writes
        </label>
      </div>
      <div class="actions">
        <button id="indexStatusButton" type="button">Index Status</button>
        <button id="clearIndexErrorsButton" type="button">Clear Index Errors</button>
        <button id="rebuildIndexButton" type="button">Rebuild Index</button>
      </div>
    </section>

    <details>
      <summary>
        <h2>Daily Timestamp Insertion Rules</h2>
      </summary>
      <div class="details-body">
        <div class="grid">
          <label>
            Daily File Path
            <input id="dailyPathTemplate" placeholder="Daily/{{YYYY}}/{{YYYY}}-{{MM}}-{{DD}}.md" />
            <span class="hint">Vault-relative path template. The top-level folder must be allowed. Supports variables like <code>{{YYYY}}</code>, <code>{{MM}}</code>, <code>{{DD}}</code>, and <code>{{yyyy-MM-dd}}</code>. <code>.md</code> is added when omitted.</span>
          </label>
          <label>
            Time Zone
            <input id="dailyTimeZone" placeholder="Uses global time zone" disabled />
            <span class="hint">Daily insertion uses the global Time Zone above.</span>
          </label>
          <label>
            Heading Level
            <input id="dailyHeadingLevel" type="number" min="1" max="6" />
          </label>
          <label>
            Daily Template Path
            <input id="dailyTemplatePath" placeholder="Templates/daily.md" />
            <span class="hint">Optional Vault-relative template used only when the daily note is created.</span>
          </label>
          <label>
            Line Pattern
            <input id="dailyLinePattern" placeholder="^\\[\\d{2}:\\d{2}\\]" />
          </label>
          <label>
            Line Format
            <input id="dailyLineFormat" placeholder="[{{HH:mm}}] {{content}}" />
          </label>
          <label class="checkbox">
            <input id="dailyCreateIfMissing" type="checkbox" />
            Create the daily note when it does not exist
          </label>
          <label class="checkbox">
            <input id="dailyBlankLineBetweenEntries" type="checkbox" />
            Keep a blank line between timestamp entries
            <span class="hint">Also keeps one blank line between the heading and the first timestamp entry.</span>
          </label>
        </div>

        <div style="margin-top: 18px;">
          <p class="hint" style="margin-bottom: 10px;">Add any number of non-overlapping time slots. The request time selects the matching heading.</p>
          <table>
            <thead>
              <tr>
                <th>Heading</th>
                <th>Start</th>
                <th>End</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="slotsBody"></tbody>
          </table>
          <div class="actions">
            <button id="addSlotButton" type="button">Add Slot</button>
          </div>
        </div>
      </div>
    </details>

    <details>
      <summary>
        <h2>Review Tasks</h2>
      </summary>
      <div class="details-body">
        <label class="checkbox">
          <input id="reviewsEnabled" type="checkbox" />
          Enable scheduled review tasks
        </label>
        <div class="grid" style="margin-top: 16px;">
          <label>
            Max Source Chars
            <input id="reviewsMaxSourceChars" type="number" min="1000" step="1000" />
          </label>
          <label>
            Max Recall Chars
            <input id="reviewsMaxRecallChars" type="number" min="1000" step="1000" />
          </label>
          <label>
            Run Task ID
            <input id="reviewRunTaskId" placeholder="weekly-review" />
            <span class="hint">Run Now does not mark the scheduled run as complete.</span>
          </label>
        </div>
        <label style="margin-top: 16px;">
          Tasks JSON
          <textarea id="reviewTasksJson" style="min-height: 360px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;"></textarea>
          <span class="hint">Each task supports weekly, monthly, quarterly, or yearly periods, sourceDirs, output path template, prompt, and semanticRecall. Keep Reviews in Allowed Top-Level Dirs when using the default output paths.</span>
        </label>
        <div class="actions">
          <button id="reviewStatusButton" type="button">Review Status</button>
          <button id="runReviewTaskButton" type="button">Run Now</button>
        </div>
      </div>
    </details>

    <div class="actions">
      <button id="saveButton" class="primary">Save Config</button>
    </div>
    <div id="status" class="status"></div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    const status = $("status");
    const slotsBody = $("slotsBody");

    $("loadButton").addEventListener("click", loadConfig);
    $("saveButton").addEventListener("click", saveConfig);
    $("addSlotButton").addEventListener("click", () => addSlot({ heading: "", start: "09:00", end: "11:59" }));
    $("indexStatusButton").addEventListener("click", loadIndexStatus);
    $("clearIndexErrorsButton").addEventListener("click", clearIndexErrors);
    $("rebuildIndexButton").addEventListener("click", rebuildIndex);
    $("reviewStatusButton").addEventListener("click", loadReviewStatus);
    $("runReviewTaskButton").addEventListener("click", runReviewTask);

    async function request(path, options = {}) {
      const response = await fetch(path, {
        ...options,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Request failed");
      }
      return payload;
    }

    async function loadConfig() {
      try {
        setStatus("Loading config...");
        const config = await request("/v1/config");
        fillForm(config);
        setStatus("Config loaded", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function saveConfig() {
      try {
        setStatus("Saving config...");
        const config = readForm();
        const saved = await request("/v1/config", {
          method: "PUT",
          body: JSON.stringify(config)
        });
        fillForm(saved);
        setStatus("Config saved", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    function fillForm(config) {
      $("vaultRoot").value = config.vaultRoot || "";
      $("dataDir").value = config.dataDir || "";
      $("timeZone").value = config.timeZone || "Asia/Shanghai";
      $("allowedDirs").value = (config.allowedDirs || []).join(",");
      $("maxJsonBodyBytes").value = config.maxJsonBodyBytes || 1048576;
      $("imageAttachmentDir").value = config.attachments?.imageDir || "Attachments/Images";
      $("audioAttachmentDir").value = config.attachments?.audioDir || "Attachments/Audio";
      $("embeddingEnabled").checked = Boolean(config.embedding?.enabled);
      $("embeddingProvider").value = config.embedding?.provider || "openai-compatible";
      $("embeddingBaseUrl").value = config.embedding?.baseUrl || "https://api.openai.com/v1";
      $("embeddingModel").value = config.embedding?.model || "";
      $("embeddingApiKey").value = "";
      $("embeddingApiKeyHint").textContent = config.embedding?.apiKeySet
        ? "API key is saved; leave blank to keep it unchanged."
        : "No API key is saved. New keys are encrypted with APP_ENCRYPTION_KEY.";
      $("embeddingDimensions").value = config.embedding?.dimensions || 0;
      $("embeddingBatchSize").value = config.embedding?.batchSize || 16;
      $("embeddingMaxChunkChars").value = config.embedding?.maxChunkChars || 1600;
      $("embeddingSearchLimit").value = config.embedding?.searchLimit || 8;
      $("embeddingAutoIndexAfterWrite").checked = config.embedding?.autoIndexAfterWrite !== false;
      $("embeddingAutoScanIntervalMinutes").value = config.embedding?.autoScanIntervalMinutes || 0;
      $("aiProvider").value = config.ai?.provider || "openai-compatible";
      $("aiBaseUrl").value = config.ai?.baseUrl || "https://api.openai.com/v1";
      $("aiModel").value = config.ai?.model || "";
      $("aiApiKey").value = "";
      $("aiApiKeyHint").textContent = config.ai?.apiKeySet
        ? "API key is saved; leave blank to keep it unchanged."
        : "No API key is saved. New keys are encrypted with APP_ENCRYPTION_KEY.";
      $("aiTemperature").value = config.ai?.temperature ?? 0.2;
      $("aiMaxOutputTokens").value = config.ai?.maxOutputTokens || 1600;
      $("dailyPathTemplate").value = config.dailyNote?.pathTemplate || "";
      $("dailyTimeZone").value = config.timeZone || config.dailyNote?.timeZone || "";
      $("dailyHeadingLevel").value = config.dailyNote?.headingLevel || 2;
      $("dailyTemplatePath").value = config.dailyNote?.templatePath || "";
      $("dailyLinePattern").value = config.dailyNote?.linePattern || "";
      $("dailyLineFormat").value = config.dailyNote?.lineFormat || "";
      $("dailyCreateIfMissing").checked = config.dailyNote?.createIfMissing !== false;
      $("dailyBlankLineBetweenEntries").checked = config.dailyNote?.blankLineBetweenEntries !== false;
      slotsBody.innerHTML = "";
      for (const slot of config.dailyNote?.slots || []) {
        addSlot(slot);
      }
      $("reviewsEnabled").checked = Boolean(config.reviews?.enabled);
      $("reviewsMaxSourceChars").value = config.reviews?.maxSourceChars || 60000;
      $("reviewsMaxRecallChars").value = config.reviews?.maxRecallChars || 16000;
      $("reviewTasksJson").value = JSON.stringify(config.reviews?.tasks || [], null, 2);
      $("reviewRunTaskId").value = config.reviews?.tasks?.[0]?.id || "";
    }

    function readForm() {
      return {
        vaultRoot: $("vaultRoot").value.trim(),
        dataDir: $("dataDir").value.trim(),
        timeZone: $("timeZone").value.trim(),
        allowedDirs: $("allowedDirs").value.split(",").map((item) => item.trim()).filter(Boolean),
        maxJsonBodyBytes: Number($("maxJsonBodyBytes").value),
        attachments: {
          imageDir: $("imageAttachmentDir").value.trim(),
          audioDir: $("audioAttachmentDir").value.trim()
        },
        embedding: {
          enabled: $("embeddingEnabled").checked,
          provider: $("embeddingProvider").value.trim(),
          baseUrl: $("embeddingBaseUrl").value.trim(),
          model: $("embeddingModel").value.trim(),
          apiKey: $("embeddingApiKey").value.trim(),
          dimensions: Number($("embeddingDimensions").value),
          batchSize: Number($("embeddingBatchSize").value),
          maxChunkChars: Number($("embeddingMaxChunkChars").value),
          searchLimit: Number($("embeddingSearchLimit").value),
          autoIndexAfterWrite: $("embeddingAutoIndexAfterWrite").checked,
          autoScanIntervalMinutes: Number($("embeddingAutoScanIntervalMinutes").value)
        },
        ai: {
          provider: $("aiProvider").value.trim(),
          baseUrl: $("aiBaseUrl").value.trim(),
          model: $("aiModel").value.trim(),
          apiKey: $("aiApiKey").value.trim(),
          temperature: Number($("aiTemperature").value),
          maxOutputTokens: Number($("aiMaxOutputTokens").value)
        },
        reviews: {
          enabled: $("reviewsEnabled").checked,
          maxSourceChars: Number($("reviewsMaxSourceChars").value),
          maxRecallChars: Number($("reviewsMaxRecallChars").value),
          tasks: JSON.parse($("reviewTasksJson").value || "[]")
        },
        dailyNote: {
          pathTemplate: $("dailyPathTemplate").value.trim(),
          templatePath: $("dailyTemplatePath").value.trim(),
          createIfMissing: $("dailyCreateIfMissing").checked,
          timeZone: $("timeZone").value.trim(),
          headingLevel: Number($("dailyHeadingLevel").value),
          linePattern: $("dailyLinePattern").value,
          lineFormat: $("dailyLineFormat").value,
          blankLineBetweenEntries: $("dailyBlankLineBetweenEntries").checked,
          slots: Array.from(slotsBody.querySelectorAll("tr")).map((row) => ({
            heading: row.querySelector("[data-field=heading]").value.trim(),
            start: row.querySelector("[data-field=start]").value,
            end: row.querySelector("[data-field=end]").value
          }))
        }
      };
    }

    async function loadIndexStatus() {
      try {
        setStatus("Loading index status...");
        const payload = await request("/v1/api/index/status", { method: "POST", body: "{}" });
        setStatus(\`Index status: \${payload.result.files} files, \${payload.result.chunks} chunks, ready=\${payload.result.ready}\`, "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function rebuildIndex() {
      try {
        setStatus("Rebuilding index. This may take a while depending on the remote embedding API...");
        const payload = await request("/v1/api/index/rebuild", {
          method: "POST",
          body: JSON.stringify({ force: false })
        });
        setStatus(\`Index updated: \${payload.result.files} files, \${payload.result.chunks} chunks\`, "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function clearIndexErrors() {
      try {
        setStatus("Clearing index errors...");
        await request("/v1/api/index/errors/clear", {
          method: "POST",
          body: "{}"
        });
        setStatus("Index errors cleared", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function loadReviewStatus() {
      try {
        setStatus("Loading review status...");
        const payload = await request("/v1/api/reviews/status", { method: "POST", body: "{}" });
        const enabled = payload.result.enabled ? "enabled" : "disabled";
        const next = (payload.result.tasks || []).filter((task) => task.enabled).map((task) => \`\${task.id}: \${task.nextRunAt || "not scheduled"}\`).join("; ");
        setStatus(\`Review tasks are \${enabled}. \${next || "No enabled tasks."}\`, "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function runReviewTask() {
      try {
        const taskId = $("reviewRunTaskId").value.trim();
        if (!taskId) throw new Error("Run Task ID is required");
        setStatus(\`Running review task \${taskId}...\`);
        const payload = await request("/v1/api/reviews/run", {
          method: "POST",
          body: JSON.stringify({ taskId })
        });
        setStatus(\`Review written to \${payload.result.path}\`, "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    function addSlot(slot) {
      const row = document.createElement("tr");
      row.innerHTML = \`
        <td><input data-field="heading" value="\${escapeHtml(slot.heading || "")}" placeholder="Afternoon" /></td>
        <td><input data-field="start" type="time" value="\${escapeHtml(slot.start || "12:00")}" /></td>
        <td><input data-field="end" type="time" value="\${escapeHtml(slot.end || "17:59")}" /></td>
        <td><button class="danger" type="button">Delete</button></td>
      \`;
      row.querySelector("button").addEventListener("click", () => row.remove());
      slotsBody.appendChild(row);
    }

    function setStatus(message, type = "") {
      status.className = "status" + (type ? " " + type : "");
      status.textContent = message;
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    loadConfig();
  </script>
</body>
</html>`;
}
