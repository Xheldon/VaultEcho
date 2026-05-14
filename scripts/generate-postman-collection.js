import fs from "node:fs/promises";
import path from "node:path";

const outputPath = path.resolve("docs/postman/VaultEcho.postman_collection.json");

const collection = {
  info: {
    name: "VaultEcho API",
    description: [
      "VaultEcho Postman collection.",
      "",
      "Import this file into Postman, then update collection variables:",
      "- baseUrl: http://127.0.0.1:8787 or https://vault.example.com",
      "- apiToken: API_TOKEN from .env",
      "- adminUsername/adminPassword: Basic Auth credentials for the admin UI",
      "",
      "Most API requests use Bearer auth inherited from the collection. Admin requests override auth with Basic auth.",
      "Bodies containing strings such as {{title}}, {{content}}, or {{HH:mm}} are VaultEcho template variables. Leave them unresolved in Postman."
    ].join("\n"),
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  auth: bearerAuth("{{apiToken}}"),
  event: [
    {
      listen: "test",
      script: {
        type: "text/javascript",
        exec: [
          "pm.test('response has a status code', function () {",
          "  pm.expect(pm.response.code).to.be.a('number');",
          "});"
        ]
      }
    }
  ],
  variable: [
    { key: "baseUrl", value: "http://127.0.0.1:8787", type: "string" },
    { key: "apiToken", value: "change-me", type: "string" },
    { key: "adminUsername", value: "admin", type: "string" },
    { key: "adminPassword", value: "change-me-admin", type: "string" },
    { key: "dailyAt", value: "2026-05-14T16:21:00+08:00", type: "string" },
    { key: "dailyDate", value: "2026-05-14", type: "string" },
    { key: "testNote", value: "Ideas/postman-demo.md", type: "string" },
    { key: "projectNote", value: "Projects/postman-project.md", type: "string" },
    { key: "dailyNote", value: "Daily/2026-05-14.md", type: "string" },
    { key: "templatePath", value: "Templates/postman-template.md", type: "string" }
  ],
  item: [
    folder("00 Admin And Config", [
      adminRequest("Health", "GET", "/health", {
        description: "Basic Auth protected health check. Shows config path, vault root, and allowed dirs."
      }),
      adminRequest("Get Runtime Config", "GET", "/v1/config", {
        description: "Read public runtime config. Secrets are not returned."
      }),
      adminRequest("Save Runtime Config - Basic Example", "PUT", "/v1/config", {
        description: "Save runtime config. Keep vaultRoot/dataDir as /vault and /data in Docker.",
        body: {
          vaultRoot: "/vault",
          dataDir: "/data",
          allowedDirs: ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Templates", "Attachments", "Archive"],
          maxJsonBodyBytes: 1048576,
          attachments: {
            imageDir: "Attachments/Images",
            audioDir: "Attachments/Audio"
          },
          embedding: {
            enabled: false,
            provider: "openai-compatible",
            baseUrl: "https://api.openai.com/v1",
            model: "",
            dimensions: 0,
            batchSize: 16,
            maxChunkChars: 1600,
            searchLimit: 8,
            autoIndexAfterWrite: true,
            autoScanIntervalMinutes: 0
          },
          dailyNote: {
            pathTemplate: "Daily/{{yyyy-MM-dd}}.md",
            headingLevel: 2,
            linePattern: "^\\[\\d{2}:\\d{2}\\]",
            lineFormat: "[{{HH:mm}}] {{content}}",
            timeZone: "Asia/Shanghai",
            slots: [
              { heading: "Morning", start: "05:00", end: "11:59" },
              { heading: "Afternoon", start: "12:00", end: "17:59" },
              { heading: "Evening", start: "18:00", end: "04:59" }
            ]
          }
        }
      })
    ]),

    folder("01 Setup Fixtures", [
      apiRequest("Create Template File", "POST", "/v1/api/files/write", {
        description: "Creates a template used by files/create template examples.",
        body: {
          path: "{{templatePath}}",
          content: "---\nstatus: template\nsource: postman\n---\n\n# {{title}}\n\n{{content}}\n"
        }
      }),
      apiRequest("Create Demo Note", "POST", "/v1/api/files/write", {
        description: "Creates a reusable demo note for heading/frontmatter examples.",
        body: {
          path: "{{testNote}}",
          content: "## Log\nInitial item\n\n## Status\nPending\n"
        }
      }),
      apiRequest("Create Daily Note Skeleton", "POST", "/v1/api/files/write", {
        description: "Creates a daily note skeleton with morning/afternoon/evening headings.",
        body: {
          path: "{{dailyNote}}",
          content: "## Morning\n\n## Afternoon\n[16:18] Existing line\n\n## Evening\n"
        }
      })
    ]),

    folder("02 Files", [
      apiRequest("Create - Simple Markdown", "POST", "/v1/api/files/create", {
        description: "Creates a Markdown note. If the path has no extension, .md is added.",
        body: {
          path: "Ideas/postman-created",
          content: "Hello from Postman.",
          ifExists: "append_suffix",
          idempotencyKey: "postman-create-simple-{{$timestamp}}"
        }
      }),
      apiRequest("Create - With Template And YAML", "POST", "/v1/api/files/create", {
        description: "Applies template first, then request yaml/frontmatter overrides template fields.",
        body: {
          path: "Ideas/postman-from-template.md",
          title: "Postman Template Demo",
          templatePath: "{{templatePath}}",
          content: "Body generated by Postman.",
          yaml: {
            status: "done",
            tags: ["postman", "vaultecho"]
          },
          ifExists: "overwrite"
        }
      }),
      apiRequest("Read - GET Query", "GET", "/v1/api/files/read?path={{testNote}}", {
        description: "Reads a Markdown file using query params."
      }),
      apiRequest("Read - POST JSON", "POST", "/v1/api/files/read", {
        description: "Reads a Markdown file using JSON body.",
        body: { path: "{{testNote}}" }
      }),
      apiRequest("Write - Replace Full File", "POST", "/v1/api/files/write", {
        description: "Replaces the full file content.",
        body: {
          path: "{{projectNote}}",
          content: "## Log\nCreated by files/write\n\n## Next\n"
        }
      }),
      apiRequest("Append - File End", "POST", "/v1/api/files/append", {
        description: "Appends content to the end of a Markdown file.",
        body: {
          path: "{{projectNote}}",
          content: "\n- Appended at {{$isoTimestamp}}",
          idempotencyKey: "postman-append-{{$timestamp}}"
        }
      }),
      apiRequest("Prepend - File Start", "POST", "/v1/api/files/prepend", {
        description: "Prepends content to the beginning of a Markdown file.",
        body: {
          path: "{{projectNote}}",
          content: "> Prepended summary from Postman\n\n",
          idempotencyKey: "postman-prepend-{{$timestamp}}"
        }
      }),
      apiRequest("Delete - Soft Delete", "DELETE", "/v1/api/files/delete?path=Inbox/postman-delete-me.md", {
        description: "Moves a file to Archive/Deleted. Safe to call even if the file does not exist."
      }),
      apiRequest("List - Top Level Allowed Dirs", "GET", "/v1/api/files/list", {
        description: "Lists existing configured top-level directories."
      }),
      apiRequest("List - Directory", "GET", "/v1/api/files/list?path=Ideas", {
        description: "Lists files under a specific Vault directory."
      })
    ]),

    folder("03 Headings", [
      apiRequest("Heading Read - GET", "GET", "/v1/api/headings/read?path={{testNote}}&heading=Log", {
        description: "Reads content under a heading."
      }),
      apiRequest("Heading Append", "POST", "/v1/api/headings/append", {
        description: "Appends content to the end of a heading block.",
        body: {
          path: "{{testNote}}",
          heading: "Log",
          headingLevel: 2,
          content: "- Appended heading item {{$isoTimestamp}}",
          ifHeadingMissing: "create"
        }
      }),
      apiRequest("Heading Prepend", "POST", "/v1/api/headings/prepend", {
        description: "Inserts content directly below the heading.",
        body: {
          path: "{{testNote}}",
          heading: "Log",
          content: "- Prepended heading item"
        }
      }),
      apiRequest("Heading Replace", "POST", "/v1/api/headings/replace", {
        description: "Replaces the whole heading block content while keeping the heading.",
        body: {
          path: "{{testNote}}",
          heading: "Status",
          content: "Updated by Postman"
        }
      }),
      apiRequest("Heading Insert After Last Timestamp", "POST", "/v1/api/headings/insert-after-last-matching-line", {
        description: "Uses configured dailyNote.linePattern. Request-level linePattern is intentionally ignored.",
        body: {
          path: "{{dailyNote}}",
          heading: "Afternoon",
          content: "[16:21] Inserted after the final timestamp line"
        }
      })
    ]),

    folder("04 Frontmatter", [
      apiRequest("Frontmatter Set - String", "POST", "/v1/api/frontmatter/set", {
        description: "Sets a single frontmatter field.",
        body: {
          path: "{{testNote}}",
          key: "status",
          value: "draft"
        }
      }),
      apiRequest("Frontmatter Set - JSON Array", "POST", "/v1/api/frontmatter/set", {
        description: "String values that look like JSON are parsed before writing.",
        body: {
          path: "{{testNote}}",
          key: "tags",
          value: "[\"postman\",\"capture\"]"
        }
      }),
      apiRequest("Frontmatter Get - GET", "GET", "/v1/api/frontmatter/get?path={{testNote}}&key=status", {
        description: "Reads a frontmatter field using query params."
      })
    ]),

    folder("05 Daily", [
      apiRequest("Daily Append By Time - Body Content", "POST", "/v1/api/daily/append-by-time", {
        description: "Chooses heading by configured time slots and formats line using configured lineFormat.",
        body: {
          at: "{{dailyAt}}",
          content: "Postman daily capture",
          idempotencyKey: "postman-daily-{{$timestamp}}"
        }
      }),
      apiRequest("Daily Append By Time - Text Alias", "POST", "/v1/api/daily/append-by-time", {
        description: "Uses text as an alias for content.",
        body: {
          at: "{{dailyAt}}",
          text: "Postman daily capture via text alias"
        }
      }),
      apiRequest("Daily Read - Specific Date", "GET", "/v1/api/daily/read?at={{dailyAt}}", {
        description: "Reads the daily note resolved from dailyNote.pathTemplate and the provided at time."
      })
    ]),

    folder("06 Search Tags And Index", [
      apiRequest("Search Simple - Query", "POST", "/v1/api/search/simple", {
        description: "Simple substring search over allowed Markdown files.",
        body: {
          query: "Postman",
          limit: 20
        }
      }),
      apiRequest("Search Simple - List Markdown Files", "POST", "/v1/api/search/simple", {
        description: "Omit query to list Markdown files up to limit.",
        body: {
          limit: 50
        }
      }),
      apiRequest("Search Semantic", "POST", "/v1/api/search/semantic", {
        description: "Requires embedding config to be enabled and index to be built.",
        body: {
          query: "Obsidian automation ideas I have been exploring recently",
          limit: 5
        }
      }),
      apiRequest("Tags List", "GET", "/v1/api/tags/list", {
        description: "Lists hashtag counts under allowed dirs."
      }),
      apiRequest("Index Status", "GET", "/v1/api/index/status", {
        description: "Shows embedding readiness and index stats."
      }),
      apiRequest("Index Rebuild - Incremental", "POST", "/v1/api/index/rebuild", {
        description: "Rebuilds or updates the embedding index. Requires embedding config.",
        body: { force: false }
      }),
      apiRequest("Index Rebuild - Force", "POST", "/v1/api/index/rebuild", {
        description: "Forces all files to be embedded again. Use carefully because it consumes remote embedding quota.",
        body: { force: true }
      }),
      apiRequest("Index File", "POST", "/v1/api/index/file", {
        description: "Indexes one Markdown file or removes it from the index if it no longer exists.",
        body: { path: "{{testNote}}" }
      }),
      apiRequest("Index Errors Clear", "POST", "/v1/api/index/errors/clear", {
        description: "Clears recently saved embedding indexing errors.",
        body: {}
      })
    ]),

    folder("07 Batch And Script", [
      apiRequest("Batch - Write Then Append Heading", "POST", "/v1/api/batch", {
        description: "Executes multiple API operations in one request.",
        body: {
          operations: [
            {
              route: "files/write",
              path: "Ideas/postman-batch.md",
              content: "## Log\n"
            },
            {
              route: "headings/append",
              path: "Ideas/postman-batch.md",
              heading: "Log",
              content: "- Batch item"
            }
          ]
        }
      }),
      apiRequest("Create With Vault Script", "POST", "/v1/api/files/create", {
        description: "Runs safe JSON Vault Script after the primary create operation.",
        body: {
          path: "Ideas/postman-script-note.md",
          content: "Created with script.",
          ifExists: "overwrite",
          script: {
            operations: [
              {
                op: "append",
                path: "{{dailyNote}}",
                content: "\n- Created postman-script-note.md from Postman script\n"
              }
            ]
          }
        }
      })
    ]),

    folder("08 Obsidian URI Compatibility", [
      apiRequest("URI New", "POST", "/v1/api/uri/execute", {
        description: "Executes a supported obsidian://new URI.",
        body: {
          uri: "obsidian://new?file=Ideas%2Fpostman-uri-demo&content=Hello%20from%20URI"
        }
      }),
      apiRequest("URI Daily Append By Time Extension", "POST", "/v1/api/uri/execute", {
        description: "VaultEcho extension for daily append-by-time through URI compatibility layer.",
        body: {
          action: "daily",
          appendByTime: true,
          at: "{{dailyAt}}",
          content: "Daily entry from URI compatibility layer"
        }
      }),
      apiRequest("URI Search", "POST", "/v1/api/uri/execute", {
        description: "Executes supported search action through URI compatibility layer.",
        body: {
          action: "search",
          query: "Postman",
          limit: 10
        }
      })
    ]),

    folder("09 Aliases And Unsupported", [
      apiRequest("Alias - new", "POST", "/v1/api/new", {
        description: "Short alias for files/create.",
        body: {
          path: "Ideas/postman-alias-new.md",
          content: "Created through /v1/api/new",
          ifExists: "overwrite"
        }
      }),
      apiRequest("Alias - daily", "POST", "/v1/api/daily", {
        description: "Short alias for daily/append-by-time.",
        body: {
          at: "{{dailyAt}}",
          content: "Created through /v1/api/daily alias"
        }
      }),
      apiRequest("Unsupported - Active File", "GET", "/v1/api/active", {
        description: "Expected to return unsupported because active file is a desktop Obsidian concept."
      }),
      apiRequest("Unsupported - Commands", "GET", "/v1/api/commands", {
        description: "Expected to return unsupported because command execution requires desktop Obsidian."
      })
    ])
  ]
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);

function folder(name, items) {
  return { name, item: items };
}

function apiRequest(name, method, urlPath, options = {}) {
  return request(name, method, urlPath, {
    ...options,
    auth: options.auth
  });
}

function adminRequest(name, method, urlPath, options = {}) {
  return request(name, method, urlPath, {
    ...options,
    auth: basicAuth("{{adminUsername}}", "{{adminPassword}}")
  });
}

function request(name, method, urlPath, options = {}) {
  const item = {
    name,
    request: {
      method,
      header: [],
      url: `{{baseUrl}}${urlPath}`,
      description: options.description || ""
    }
  };

  if (options.auth) {
    item.request.auth = options.auth;
  }

  if (options.body !== undefined) {
    item.request.header.push({
      key: "Content-Type",
      value: "application/json"
    });
    item.request.body = {
      mode: "raw",
      raw: JSON.stringify(options.body, null, 2),
      options: {
        raw: {
          language: "json"
        }
      }
    };
  }

  return item;
}

function bearerAuth(token) {
  return {
    type: "bearer",
    bearer: [
      {
        key: "token",
        value: token,
        type: "string"
      }
    ]
  };
}

function basicAuth(username, password) {
  return {
    type: "basic",
    basic: [
      {
        key: "username",
        value: username,
        type: "string"
      },
      {
        key: "password",
        value: password,
        type: "string"
      }
    ]
  };
}
