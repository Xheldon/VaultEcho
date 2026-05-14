export function renderAdminPage() {
  return `<!doctype html>
<html lang="zh-CN">
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
        <p>Capture anything. Let your vault answer back. 管理页使用 Basic Auth，外部 API 继续使用 Bearer Token。</p>
      </div>
      <button id="loadButton">载入配置</button>
    </header>

    <section>
      <h2>访问</h2>
      <p>本页面由 <code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code> 保护。<code>API_TOKEN</code> 只用于 Coze、快捷指令等外部系统调用 <code>/v1/api/...</code>，不会写入或存入浏览器。</p>
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
          Allowed Top-Level Dirs
          <textarea id="allowedDirs" placeholder="Inbox,Notes,Ideas,Projects,Daily,Attachments,Archive"></textarea>
          <span class="hint">逗号分隔，所有写入路径必须落在这些顶级目录内。</span>
        </label>
        <label>
          Max JSON Body Bytes
          <input id="maxJsonBodyBytes" type="number" min="1024" step="1024" />
        </label>
        <label>
          Image Attachment Dir
          <input id="imageAttachmentDir" placeholder="Attachments/Images" />
          <span class="hint">Vault 相对目录。后续图片附件写入会默认使用这里。</span>
        </label>
        <label>
          Audio Attachment Dir
          <input id="audioAttachmentDir" placeholder="Attachments/Audio" />
          <span class="hint">Vault 相对目录。后续音频附件写入会默认使用这里。</span>
        </label>
      </div>
    </section>

    <section>
      <h2>Embedding 语义索引</h2>
      <label class="checkbox">
        <input id="embeddingEnabled" type="checkbox" />
        启用远程 embedding
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
          <input id="embeddingApiKey" type="password" autocomplete="off" placeholder="留空表示不修改已保存的 Key" />
          <span id="embeddingApiKeyHint" class="hint">API Key 会使用 <code>APP_ENCRYPTION_KEY</code> 加密后保存。</span>
        </label>
        <label>
          Dimensions
          <input id="embeddingDimensions" type="number" min="0" step="1" />
          <span class="hint">可选。模型不支持时保持 0。</span>
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
          <span class="hint">0 表示关闭。用于补偿 Headless Sync 拉下来的外部变更。</span>
        </label>
        <label class="checkbox">
          <input id="embeddingAutoIndexAfterWrite" type="checkbox" />
          API 写入后自动索引该文件
        </label>
      </div>
      <div class="actions">
        <button id="indexStatusButton" type="button">查看索引状态</button>
        <button id="clearIndexErrorsButton" type="button">清空索引错误</button>
        <button id="rebuildIndexButton" type="button">重建索引</button>
      </div>
    </section>

    <details>
      <summary>
        <h2>日记时间戳插入位置设置</h2>
      </summary>
      <div class="details-body">
        <div class="grid">
          <label>
            Path Template
            <input id="dailyPathTemplate" placeholder="Daily/{{yyyy-MM-dd}}.md" />
          </label>
          <label>
            Time Zone
            <input id="dailyTimeZone" placeholder="Asia/Shanghai" />
          </label>
          <label>
            Heading Level
            <input id="dailyHeadingLevel" type="number" min="1" max="6" />
          </label>
          <label>
            Line Pattern
            <input id="dailyLinePattern" placeholder="^\\[\\d{2}:\\d{2}\\]" />
          </label>
          <label>
            Line Format
            <input id="dailyLineFormat" placeholder="[{{HH:mm}}] {{content}}" />
          </label>
        </div>

        <div style="margin-top: 18px;">
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
            <button id="addSlotButton" type="button">新增时段</button>
          </div>
        </div>
      </div>
    </details>

    <div class="actions">
      <button id="saveButton" class="primary">保存配置</button>
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
        setStatus("正在载入配置...");
        const config = await request("/v1/config");
        fillForm(config);
        setStatus("配置已载入", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function saveConfig() {
      try {
        setStatus("正在保存配置...");
        const config = readForm();
        const saved = await request("/v1/config", {
          method: "PUT",
          body: JSON.stringify(config)
        });
        fillForm(saved);
        setStatus("配置已保存", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    function fillForm(config) {
      $("vaultRoot").value = config.vaultRoot || "";
      $("dataDir").value = config.dataDir || "";
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
        ? "已保存 API Key；留空表示不修改。"
        : "尚未保存 API Key。保存新 Key 时会使用 APP_ENCRYPTION_KEY 加密。";
      $("embeddingDimensions").value = config.embedding?.dimensions || 0;
      $("embeddingBatchSize").value = config.embedding?.batchSize || 16;
      $("embeddingMaxChunkChars").value = config.embedding?.maxChunkChars || 1600;
      $("embeddingSearchLimit").value = config.embedding?.searchLimit || 8;
      $("embeddingAutoIndexAfterWrite").checked = config.embedding?.autoIndexAfterWrite !== false;
      $("embeddingAutoScanIntervalMinutes").value = config.embedding?.autoScanIntervalMinutes || 0;
      $("dailyPathTemplate").value = config.dailyNote?.pathTemplate || "";
      $("dailyTimeZone").value = config.dailyNote?.timeZone || "";
      $("dailyHeadingLevel").value = config.dailyNote?.headingLevel || 2;
      $("dailyLinePattern").value = config.dailyNote?.linePattern || "";
      $("dailyLineFormat").value = config.dailyNote?.lineFormat || "";
      slotsBody.innerHTML = "";
      for (const slot of config.dailyNote?.slots || []) {
        addSlot(slot);
      }
    }

    function readForm() {
      return {
        vaultRoot: $("vaultRoot").value.trim(),
        dataDir: $("dataDir").value.trim(),
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
        dailyNote: {
          pathTemplate: $("dailyPathTemplate").value.trim(),
          timeZone: $("dailyTimeZone").value.trim(),
          headingLevel: Number($("dailyHeadingLevel").value),
          linePattern: $("dailyLinePattern").value,
          lineFormat: $("dailyLineFormat").value,
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
        setStatus("正在读取索引状态...");
        const payload = await request("/v1/api/index/status", { method: "POST", body: "{}" });
        setStatus(\`索引状态：\${payload.result.files} 个文件，\${payload.result.chunks} 个块，ready=\${payload.result.ready}\`, "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function rebuildIndex() {
      try {
        setStatus("正在重建索引，可能需要等待远程 embedding API...");
        const payload = await request("/v1/api/index/rebuild", {
          method: "POST",
          body: JSON.stringify({ force: false })
        });
        setStatus(\`索引已更新：\${payload.result.files} 个文件，\${payload.result.chunks} 个块\`, "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    async function clearIndexErrors() {
      try {
        setStatus("正在清空索引错误...");
        await request("/v1/api/index/errors/clear", {
          method: "POST",
          body: "{}"
        });
        setStatus("索引错误已清空", "ok");
      } catch (error) {
        setStatus(error.message, "error");
      }
    }

    function addSlot(slot) {
      const row = document.createElement("tr");
      row.innerHTML = \`
        <td><input data-field="heading" value="\${escapeHtml(slot.heading || "")}" placeholder="下午" /></td>
        <td><input data-field="start" type="time" value="\${escapeHtml(slot.start || "12:00")}" /></td>
        <td><input data-field="end" type="time" value="\${escapeHtml(slot.end || "17:59")}" /></td>
        <td><button class="danger" type="button">删除</button></td>
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
