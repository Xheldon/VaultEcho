export const API_ALIASES = {
  new: "files/create",
  create: "files/create",
  open: "files/read",
  read: "files/read",
  write: "files/write",
  append: "files/append",
  prepend: "files/prepend",
  delete: "files/delete",
  list: "files/list",
  daily: "daily/append-by-time",
  search: "search/simple",
  semantic: "search/semantic",
  tags: "tags/list",
  reindex: "index/rebuild",
  index: "index/status",
  review: "reviews/run",
  reviews: "reviews/status",
  script: "batch",
  uri: "uri/execute",
  active: "unsupported/active",
  commands: "unsupported/commands"
};

export const API_ENDPOINTS = [
  {
    route: "index/errors/clear",
    method: "POST",
    title: "Clear Embedding Error Records",
    summary: "Clears the most recent local error records saved by automatic indexing.",
    scenarios: [
      "Remove stale Web UI error messages after fixing the embedding API key or base URL.",
      "Reset index error state after confirming automatic indexing has recovered."
    ],
    params: [],
    curl: `curl -X POST http://localhost:8787/v1/api/index/errors/clear \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "files/create",
    method: "POST",
    title: "Create Markdown File",
    summary: "Creates a new Markdown file inside the Vault.",
    scenarios: [
      "Coze has turned an idea into a note and needs to write it into Ideas.",
      "A capture pipeline has cleaned external material and needs to write it into Notes.",
      "A workflow needs to create a note from a Vault template and override template YAML fields from the request.",
      "A workflow needs to append a suffix on filename collisions instead of overwriting existing notes."
    ],
    params: [
      ["path | filename | file | name", "Vault-relative path. `files/create` only creates Markdown files; `.md` is added when no extension is present. Paths without an allowed top-level directory are placed under Inbox/."],
      ["content | text", "Markdown body."],
      ["templatePath | template", "Optional Vault-relative template path. The template is applied first, then content is merged. Templates support variables such as `{{content}}`, `{{title}}`, `{{yyyy-MM-dd}}`, and `{{HH:mm}}`."],
      ["yaml | frontmatter", "Optional object. Applied last to frontmatter, so request fields override YAML fields from the template."],
      ["ifExists", "Collision strategy when the file already exists: fail, overwrite, or append_suffix. Default: fail."],
      ["idempotencyKey", "Optional key that prevents duplicate writes during upstream retries."],
      ["script", "Optional URL-encoded JSON Vault Script executed after the primary operation."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/create \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "Ideas/api-note.md",
    "templatePath": "Templates/idea.md",
    "content": "Hello",
    "yaml": {
      "status": "done",
      "source": "coze"
    },
    "ifExists": "append_suffix"
  }'`
  },
  {
    route: "files/read",
    method: "GET or POST",
    title: "Read File",
    summary: "Reads a Markdown file from the Vault. Very large files are rejected to protect small VPS deployments.",
    scenarios: [
      "A workflow needs to read an existing note before deciding how to update it.",
      "You need to verify what the gateway actually wrote during debugging."
    ],
    params: [
      ["path | filename | file | name", "Target Vault-relative path."]
    ],
    curl: `curl "http://localhost:8787/v1/api/files/read?path=Ideas/api-note.md" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "attachments/upload",
    method: "POST multipart/form-data",
    title: "Upload Attachment",
    summary: "Uploads one binary attachment into the configured Vault attachment folder and returns flat insertable link text fields.",
    scenarios: [
      "Apple Shortcuts uploads a photo or voice memo, then inserts the returned wiki link into a daily note.",
      "Coze uploads a processed attachment separately from Markdown creation to keep note-writing APIs simple.",
      "A workflow needs to store arbitrary files such as images, audio, video, PDFs, RAW files, or archives in the Vault."
    ],
    params: [
      ["file", "Required multipart file field."],
      ["type", "Optional attachment type: image, audio, video, or file. If omitted, VaultEcho infers it from MIME type and falls back to file."],
      ["filename | name", "Optional filename override. Filename collisions automatically append a numeric suffix."],
      ["alt", "Optional alt text used in the returned Markdown image-style link."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/attachments/upload \\
  -H "Authorization: Bearer change-me" \\
  -F "type=image" \\
  -F "file=@/path/to/photo.png"`
  },
  {
    route: "files/write",
    method: "POST",
    title: "Overwrite File",
    summary: "Replaces a Markdown file with new content.",
    scenarios: [
      "Regenerate a note from an upstream source of truth.",
      "Replace a temporary Inbox note with a cleaned AI result."
    ],
    params: [
      ["path | filename | file | name", "Target Vault-relative path."],
      ["content | text", "Full file content."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/write \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md", "content": "Full replacement" }'`
  },
  {
    route: "files/append",
    method: "POST",
    title: "Append To File",
    summary: "Appends content to the end of a file. The write is rejected when the final file would exceed the server limit.",
    scenarios: [
      "Append raw captures to an Inbox log.",
      "Append generated references to an existing note."
    ],
    params: [
      ["path | filename | file | name", "Target Vault-relative path."],
      ["content | text", "Content to append."],
      ["idempotencyKey", "Optional key that prevents duplicate writes during upstream retries."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/append \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Inbox/2026-05-13.md", "content": "\\n- New capture" }'`
  },
  {
    route: "files/prepend",
    method: "POST",
    title: "Prepend To File",
    summary: "Inserts content at the beginning of a file.",
    scenarios: [
      "Add a summary block at the top of an imported note.",
      "Insert a warning or processing status at the beginning of a note."
    ],
    params: [
      ["path | filename | file | name", "Target Vault-relative path."],
      ["content | text", "Content to insert."],
      ["idempotencyKey", "Optional key that prevents duplicate writes during upstream retries."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/files/prepend \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md", "content": "> AI summary\\n\\n" }'`
  },
  {
    route: "files/delete",
    method: "DELETE or POST",
    title: "Soft Delete File",
    summary: "Moves a file into Archive/Deleted instead of deleting it permanently.",
    scenarios: [
      "Clean up an incorrect capture while keeping a recovery path.",
      "Safely archive outdated generated notes."
    ],
    params: [
      ["path | filename | file | name", "Target Vault-relative path."],
      ["idempotencyKey", "Optional key that prevents duplicate writes during upstream retries."]
    ],
    curl: `curl -X DELETE "http://localhost:8787/v1/api/files/delete?path=Inbox/old.md" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "files/list",
    method: "GET or POST",
    title: "List Files",
    summary: "Lists files and subdirectories inside a Vault directory.",
    scenarios: [
      "Inspect what has already been written under Inbox or Ideas.",
      "Let an automation choose candidate files from a directory."
    ],
    params: [
      ["path", "Optional directory path. When omitted, existing configured top-level directories are listed."]
    ],
    curl: `curl "http://localhost:8787/v1/api/files/list?path=Ideas" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "headings/read",
    method: "GET or POST",
    title: "Read Heading Block",
    summary: "Reads the content under a specific Markdown heading.",
    scenarios: [
      "Read today's Afternoon daily-note section before generating a summary.",
      "Read the Decisions section from a project note."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."],
      ["heading", "Heading text without leading # characters."],
      ["headingLevel", "Optional heading level. Default: 2."]
    ],
    curl: `curl "http://localhost:8787/v1/api/headings/read?path=Daily/2026-05-13.md&heading=Afternoon" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "headings/append",
    method: "POST",
    title: "Append To Heading Block",
    summary: "Appends content to the end of a heading block.",
    scenarios: [
      "Append one line to a project log section.",
      "Append a processed capture to a specific section of a note."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."],
      ["heading", "Heading text without leading # characters."],
      ["headingLevel", "Optional heading level. Default: 2."],
      ["content | text", "Content to append."],
      ["ifHeadingMissing", "Behavior when the heading does not exist: create or error. Default: create."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/append \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Daily/2026-05-13.md", "heading": "Afternoon", "content": "[16:21] New item" }'`
  },
  {
    route: "headings/prepend",
    method: "POST",
    title: "Prepend To Heading Block",
    summary: "Inserts content directly below a heading.",
    scenarios: [
      "Place a summary at the start of a section.",
      "Put a new high-priority action item before older items."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."],
      ["heading", "Heading text without leading # characters."],
      ["content | text", "Content to insert."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/prepend \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Projects/demo.md", "heading": "Next", "content": "- First priority" }'`
  },
  {
    route: "headings/replace",
    method: "POST",
    title: "Replace Heading Block",
    summary: "Keeps the heading itself and replaces all content below it.",
    scenarios: [
      "Regenerate a status section from the latest project data.",
      "Replace an AI summary without touching the rest of the note."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."],
      ["heading", "Heading text without leading # characters."],
      ["content | text", "Replacement content."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/replace \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Projects/demo.md", "heading": "Status", "content": "Green" }'`
  },
  {
    route: "headings/insert-after-last-matching-line",
    method: "POST",
    title: "Insert After Last Matching Line",
    summary: "Finds the final line matching the configured pattern inside a heading block and inserts content below it.",
    scenarios: [
      "Insert `[HH:mm]` daily entries below the last timestamp line in Morning, Afternoon, or Evening.",
      "Insert new content below the last checklist item with a specific prefix."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."],
      ["heading", "Heading text without leading # characters."],
      ["content | text", "Content to insert."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/headings/insert-after-last-matching-line \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "path": "Daily/2026-05-13.md",
    "heading": "Afternoon",
    "content": "[16:21] Working on Obsidian automation"
  }'`
  },
  {
    route: "frontmatter/get",
    method: "GET or POST",
    title: "Read Frontmatter Field",
    summary: "Reads a YAML frontmatter field.",
    scenarios: [
      "Check whether a note has already been processed.",
      "Read type or status before choosing a workflow."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."],
      ["key | field", "Frontmatter field name."]
    ],
    curl: `curl "http://localhost:8787/v1/api/frontmatter/get?path=Ideas/api-note.md&key=status" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "frontmatter/set",
    method: "POST",
    title: "Set Frontmatter Field",
    summary: "Sets or creates a YAML frontmatter field.",
    scenarios: [
      "Mark an AI-processed note with status: done.",
      "Write source or type metadata onto a capture."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."],
      ["key | field", "Frontmatter field name."],
      ["value | content | text", "Value to save. String values that look like JSON are parsed."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/frontmatter/set \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md", "key": "status", "value": "draft" }'`
  },
  {
    route: "daily/append-by-time",
    method: "POST",
    title: "Append Daily Entry By Time",
    summary: "Chooses a daily-note heading from configured timezone slots and inserts the entry below the last timestamp line.",
    scenarios: [
      "Coze only sends the processed journal text; the gateway decides whether it belongs under Morning, Afternoon, or Evening.",
      "Shortcuts sends a quick note and the gateway applies the configured `[HH:mm]` line format."
    ],
    params: [
      ["content | text", "Entry body without the `[HH:mm]` prefix."],
      ["at", "Optional ISO timestamp. Defaults to the current time."],
      ["createIfMissing", "Optional boolean override. Defaults to the Daily Note setting."],
      ["templatePath | template", "Optional Vault-relative template path override used when creating a missing daily note."],
      ["idempotencyKey", "Optional key that prevents duplicate writes during upstream retries."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/daily/append-by-time \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "at": "2026-05-13T16:21:00+08:00",
    "content": "Working on Obsidian automation",
    "idempotencyKey": "daily-20260513-1621"
  }'`
  },
  {
    route: "daily/read",
    method: "GET or POST",
    title: "Read Daily Note",
    summary: "Resolves the daily-note path from configuration and reads that note.",
    scenarios: [
      "Read today's journal before generating an AI review.",
      "Read a specific date before writing a summary block."
    ],
    params: [
      ["at", "Optional ISO timestamp used to resolve the daily-note path."]
    ],
    curl: `curl "http://localhost:8787/v1/api/daily/read?at=2026-05-13T00:00:00%2B08:00" \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "search/simple",
    method: "GET or POST",
    title: "Simple Search",
    summary: "Searches Markdown files with simple substring matching.",
    scenarios: [
      "Find notes mentioning a keyword before creating links or updates.",
      "Debug whether a capture already exists."
    ],
    params: [
      ["query | content | text", "String to search for."],
      ["limit", "Maximum number of results. Default: 100. Maximum: 500."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/search/simple \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "Obsidian" }'`
  },
  {
    route: "search/semantic",
    method: "POST",
    title: "Semantic Search",
    summary: "Performs semantic similarity search using the built remote embedding index.",
    scenarios: [
      "An AI task needs older notes related to the current input.",
      "Search by meaning, such as 'what have I been worried about recently', without exact keywords.",
      "Coze has generated a query and needs VaultEcho to retrieve relevant context from the Vault."
    ],
    params: [
      ["query | content | text", "Query text. The server calls the configured embedding model to create the query vector."],
      ["limit", "Maximum number of results. Defaults to the configured searchLimit. Hard maximum: 50."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/search/semantic \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "query": "Obsidian automation ideas I have been exploring recently", "limit": 5 }'`
  },
  {
    route: "index/status",
    method: "GET or POST",
    title: "Get Index Status",
    summary: "Shows whether embedding configuration is ready and how many files and chunks are indexed.",
    scenarios: [
      "Confirm the API key, base URL, and model name after deployment.",
      "Check whether the index is empty or needs rebuilding before debugging semantic search."
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/index/status \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "index/rebuild",
    method: "POST",
    title: "Rebuild Embedding Index",
    summary: "Scans Markdown files under allowed directories, calls the remote embedding API, and updates the local index.",
    scenarios: [
      "Build the semantic index for a Vault after first deployment.",
      "Regenerate embeddings after changing the embedding model, base URL, or chunk size.",
      "Compensate after an external Obsidian Headless Sync process pulls a large batch of historical notes."
    ],
    params: [
      ["force", "Optional boolean. When true, ignores hash cache and regenerates embeddings for all files."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/index/rebuild \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "force": false }'`
  },
  {
    route: "index/file",
    method: "POST",
    title: "Index One File",
    summary: "Rebuilds the embedding index for one Markdown file; removes it from the index when the file no longer exists.",
    scenarios: [
      "An external sync or script just changed one note and only that note needs updating.",
      "Debug chunking and retrieval behavior for a specific file."
    ],
    params: [
      ["path | filename | file | name", "Target Markdown file."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/index/file \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "path": "Ideas/api-note.md" }'`
  },
  {
    route: "reviews/status",
    method: "GET or POST",
    title: "Get Review Task Status",
    summary: "Shows configured review tasks, whether scheduling is enabled, next run times, and last run records.",
    scenarios: [
      "Confirm weekly, monthly, quarterly, and yearly review schedules after changing Web UI config.",
      "Check whether a scheduled review already ran for a period."
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/reviews/status \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "reviews/run",
    method: "POST",
    title: "Run Review Task Now",
    summary: "Runs one configured review task immediately, using period sources, semantic recall, the configured AI model, and the task output path.",
    scenarios: [
      "Test a review prompt before enabling the scheduled task.",
      "Manually regenerate a weekly, monthly, quarterly, or yearly reflection."
    ],
    params: [
      ["taskId | id | task", "Review task id, for example weekly-review."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/reviews/run \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "taskId": "weekly-review" }'`
  },
  {
    route: "tags/list",
    method: "GET",
    title: "List Tags",
    summary: "Counts Markdown hashtags under allowed directories.",
    scenarios: [
      "Inspect tag distribution in captured notes.",
      "Let an AI task choose from existing topic tags."
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/tags/list \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "batch",
    method: "POST",
    title: "Batch Operations",
    summary: "Executes multiple API operations in one request.",
    scenarios: [
      "Create a note and then set frontmatter.",
      "Write a project log and append a reference to the daily note in the same request."
    ],
    params: [
      ["operations", "Operation array. Each item uses route/action/op to select an API endpoint and includes that endpoint's parameters."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/batch \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{
    "operations": [
      { "route": "files/write", "path": "Ideas/batch-demo.md", "content": "## Log\\n" },
      { "route": "headings/append", "path": "Ideas/batch-demo.md", "heading": "Log", "content": "Item" }
    ]
  }'`
  },
  {
    route: "uri/execute",
    method: "POST",
    title: "Execute Obsidian URI Compatible Request",
    summary: "Parses an Obsidian URI and executes the parts that can be mapped to Vault filesystem operations.",
    scenarios: [
      "Receive an obsidian://new URI generated by an existing automation.",
      "Bridge URI-style actions into VaultEcho's unified API namespace."
    ],
    params: [
      ["uri", "obsidian:// URI string. Action-style fields are also accepted."]
    ],
    curl: `curl -X POST http://localhost:8787/v1/api/uri/execute \\
  -H "Authorization: Bearer change-me" \\
  -H "Content-Type: application/json" \\
  -d '{ "uri": "obsidian://new?file=Ideas%2Furi-demo&content=Hello%20URI" }'`
  },
  {
    route: "unsupported/active",
    method: "GET or POST",
    title: "Unsupported: Active File",
    summary: "Returns an explicit unsupported response for desktop-only active-file behavior.",
    scenarios: [
      "Compatibility probing when a client expects a Local REST API active-file route to exist."
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/active \\
  -H "Authorization: Bearer change-me"`
  },
  {
    route: "unsupported/commands",
    method: "GET or POST",
    title: "Unsupported: Commands",
    summary: "Returns an explicit unsupported response for desktop Obsidian command execution.",
    scenarios: [
      "Compatibility probing when a client expects a Local REST API command route to exist."
    ],
    params: [],
    curl: `curl http://localhost:8787/v1/api/commands \\
  -H "Authorization: Bearer change-me"`
  }
];

export function normalizeApiRoute(route) {
  const normalized = route.replace(/^\/+|\/+$/g, "");
  return API_ALIASES[normalized] || normalized;
}

export function apiRouteNames() {
  return API_ENDPOINTS.map((endpoint) => endpoint.route);
}

export function renderApiDocs() {
  const lines = [
    "# API Reference",
    "",
    "This file is generated from `src/api-spec.js`. Do not edit it by hand.",
    "",
    "All operation endpoints use:",
    "",
    "```http",
    "/v1/api/<resource>/<action>",
    "Authorization: Bearer <API_TOKEN>",
    "```",
    "",
    "## Route Overview",
    "",
    "| Route | Method | Purpose |",
    "|---|---|---|"
  ];

  for (const endpoint of API_ENDPOINTS) {
    lines.push(`| \`${endpoint.route}\` | ${endpoint.method} | ${endpoint.summary} |`);
  }

  lines.push("", "## Short Aliases", "");
  lines.push("| Alias | Standard Route |", "|---|---|");
  for (const [alias, route] of Object.entries(API_ALIASES)) {
    lines.push(`| \`${alias}\` | \`${route}\` |`);
  }

  for (const endpoint of API_ENDPOINTS) {
    lines.push("", `## ${endpoint.route}`, "");
    lines.push(`**${endpoint.title}**`, "");
    lines.push(endpoint.summary, "");
    lines.push(`Method: \`${endpoint.method}\``, "");

    if (endpoint.scenarios.length > 0) {
      lines.push("Use cases:", "");
      for (const scenario of endpoint.scenarios) {
        lines.push(`- ${scenario}`);
      }
      lines.push("");
    }

    if (endpoint.params.length > 0) {
      lines.push("Parameters:", "");
      lines.push("| Parameter | Description |", "|---|---|");
      for (const [name, description] of endpoint.params) {
        lines.push(`| \`${name}\` | ${description} |`);
      }
      lines.push("");
    }

    lines.push("Example:", "");
    lines.push("```bash", endpoint.curl, "```");
  }

  lines.push("");
  return `${lines.join("\n")}`;
}
