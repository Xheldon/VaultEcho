import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { rebuildEmbeddingIndex } from "../src/embedding-index.js";
import { getReviewStatus, runReviewTask } from "../src/review-tasks.js";

test("review task summarizes period notes with semantic recall and appends a review entry", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Daily"), { recursive: true });
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(
    path.join(root, "vault", "Daily", "2026-05-13.md"),
    "## Afternoon\n\n[16:21] Thinking about Obsidian automation.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "vault", "Ideas", "history.md"),
    "# History\n\nEarlier automation note from March.\n",
    "utf8"
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/embeddings")) {
      const body = JSON.parse(options.body);
      const input = Array.isArray(body.input) ? body.input : [body.input];
      return {
        ok: true,
        json: async () => ({
          data: input.map((text, index) => ({ index, embedding: fakeEmbedding(text) }))
        })
      };
    }
    if (String(url).endsWith("/chat/completions")) {
      const body = JSON.parse(options.body);
      assert.equal(body.model, "test-chat");
      assert.match(body.messages[1].content, /Semantic recall/);
      assert.match(body.messages[1].content, /Daily\/2026-05-13.md/);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "## Key themes\n\n- Automation kept recurring."
              }
            }
          ]
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await rebuildEmbeddingIndex(config);
    const result = await runReviewTask(config, "weekly-review", {
      now: new Date("2026-05-18T00:30:00.000Z"),
      runAt: new Date("2026-05-18T06:33:21.000Z")
    });

    assert.equal(result.path, "Reviews/Weekly/2026-W20.md");
    assert.equal(result.semanticRecall.results > 0, true);
    const output = await fs.readFile(path.join(root, "vault", result.path), "utf8");
    assert.doesNotMatch(output, /<!-- vaultecho:review/);
    assert.match(output, /> Period: 2026-W20 \(2026-05-11 to 2026-05-18\)/);
    assert.match(output, /> Generated At: 2026-05-18 14:33:21/);
    assert.match(output, /Automation kept recurring/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review task applies a task-specific template once and appends repeated runs", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);
  config.reviews.tasks[0].output.templatePath = "Templates/weekly-review";
  await fs.mkdir(path.join(root, "vault", "Templates"), { recursive: true });
  await fs.writeFile(
    path.join(root, "vault", "Templates", "weekly-review.md"),
    "---\ntype: weekly-review\nperiod: {{periodLabel}}\ncreated: {{generatedAt}}\n---\n",
    "utf8"
  );

  let calls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/chat/completions")) {
      calls += 1;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: `## Key themes\n\n- Template run ${calls}.` } }]
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await runReviewTask(config, "weekly-review", {
      now: new Date("2026-05-18T00:30:00.000Z"),
      runAt: new Date("2026-05-18T06:33:21.000Z")
    });
    await runReviewTask(config, "weekly-review", {
      now: new Date("2026-05-18T00:30:00.000Z"),
      runAt: new Date("2026-05-18T07:44:22.000Z")
    });

    const output = await fs.readFile(path.join(root, "vault", "Reviews", "Weekly", "2026-W20.md"), "utf8");
    assert.match(output, /^---\ntype: weekly-review\nperiod: 2026-W20\ncreated: 2026-05-18 14:33:21\n---\n\n> \[!info\] VaultEcho Review/m);
    assert.equal((output.match(/> \[!info\] VaultEcho Review/g) || []).length, 2);
    assert.match(output, /> Generated At: 2026-05-18 14:33:21/);
    assert.match(output, /> Generated At: 2026-05-18 15:44:22/);
    assert.match(output, /Template run 1/);
    assert.match(output, /Template run 2/);
    assert.doesNotMatch(output, /> Run:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review task excludes configured folders from source notes and semantic recall", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);
  config.allowedDirs = ["Notes", "Reviews"];
  config.excludePaths = ["Notes/Imports"];
  config.reviews.tasks[0] = {
    ...config.reviews.tasks[0],
    includeDailyNotes: false,
    sourceDirs: ["Notes"],
    excludePaths: ["Notes/Movies"],
    semanticRecall: {
      enabled: true,
      query: "movie backlog",
      limit: 20,
      scopeDirs: ["Notes"]
    }
  };

  await fs.mkdir(path.join(root, "vault", "Notes", "Movies"), { recursive: true });
  await fs.mkdir(path.join(root, "vault", "Notes", "Imports"), { recursive: true });
  await fs.writeFile(
    path.join(root, "vault", "Notes", "week.md"),
    "# Week\n\nReal weekly work note about project planning.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "vault", "Notes", "Movies", "import.md"),
    "# Movie backlog\n\nImported 1000 historical movie records.\n",
    "utf8"
  );
  await fs.writeFile(
    path.join(root, "vault", "Notes", "Imports", "bulk.md"),
    "# Bulk import\n\nImported 500 historical notes.\n",
    "utf8"
  );
  const mtime = new Date("2026-05-13T08:00:00.000Z");
  await fs.utimes(path.join(root, "vault", "Notes", "week.md"), mtime, mtime);
  await fs.utimes(path.join(root, "vault", "Notes", "Movies", "import.md"), mtime, mtime);
  await fs.utimes(path.join(root, "vault", "Notes", "Imports", "bulk.md"), mtime, mtime);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/embeddings")) {
      const body = JSON.parse(options.body);
      const input = Array.isArray(body.input) ? body.input : [body.input];
      return {
        ok: true,
        json: async () => ({
          data: input.map((text, index) => ({ index, embedding: fakeEmbedding(text) }))
        })
      };
    }
    if (String(url).endsWith("/chat/completions")) {
      const body = JSON.parse(options.body);
      const userMessage = body.messages[1].content;
      assert.match(userMessage, /Notes\/week.md/);
      assert.match(userMessage, /Real weekly work note/);
      assert.doesNotMatch(userMessage, /Notes\/Movies\/import.md/);
      assert.doesNotMatch(userMessage, /Imported 1000 historical movie records/);
      assert.doesNotMatch(userMessage, /Notes\/Imports\/bulk.md/);
      assert.doesNotMatch(userMessage, /Imported 500 historical notes/);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "## Key themes\n\n- Exclusions worked." } }]
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    await rebuildEmbeddingIndex(config);
    const result = await runReviewTask(config, "weekly-review", {
      now: new Date("2026-05-18T00:30:00.000Z")
    });

    assert.equal(result.path, "Reviews/Weekly/2026-W20.md");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review task can include root markdown files as period sources", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);
  config.includeRootMarkdownFiles = true;
  config.allowedDirs = ["Reviews"];
  config.reviews.tasks[0] = {
    ...config.reviews.tasks[0],
    includeDailyNotes: false,
    sourceDirs: [],
    semanticRecall: {
      enabled: false,
      query: "",
      limit: 3,
      scopeDirs: []
    }
  };

  await fs.mkdir(path.join(root, "vault"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Evergreen.md"), "# Root\n\nRoot period note.\n", "utf8");
  const mtime = new Date("2026-05-13T08:00:00.000Z");
  await fs.utimes(path.join(root, "vault", "Evergreen.md"), mtime, mtime);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/chat/completions")) {
      const body = JSON.parse(options.body);
      assert.match(body.messages[1].content, /Evergreen.md/);
      assert.match(body.messages[1].content, /Root period note/);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "## Key themes\n\n- Root note included." } }]
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await runReviewTask(config, "weekly-review", {
      now: new Date("2026-05-18T00:30:00.000Z")
    });

    assert.equal(result.path, "Reviews/Weekly/2026-W20.md");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review task can include daily notes from the configured daily path template", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);
  config.allowedDirs = ["Journal", "Reviews", "Templates", "Archive"];
  config.dailyNote.pathTemplate = "Journal/{{YYYY}}/{{YYYY}}-{{MM}}-{{DD}}.md";
  config.reviews.tasks = [
    {
      id: "weekly-review",
      enabled: true,
      name: "Weekly Review",
      period: "weekly",
      targetPeriod: "previous",
      schedule: { weekday: 1, time: "08:00" },
      includeDailyNotes: true,
      sourceDirs: [],
      output: {
        pathTemplate: "Reviews/Weekly/{{YYYY}}-W{{WW}}.md",
        heading: "Weekly Review",
        templatePath: ""
      },
      semanticRecall: {
        enabled: false,
        query: "",
        limit: 3,
        scopeDirs: []
      },
      prompt: "Summarize the period."
    }
  ];

  await fs.mkdir(path.join(root, "vault", "Journal", "2026"), { recursive: true });
  await fs.writeFile(
    path.join(root, "vault", "Journal", "2026", "2026-05-13.md"),
    "## Afternoon\n\n[16:21] Custom daily path note.\n",
    "utf8"
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/chat/completions")) {
      const body = JSON.parse(options.body);
      assert.match(body.messages[1].content, /Journal\/2026\/2026-05-13.md/);
      assert.match(body.messages[1].content, /Custom daily path note/);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: "## Key themes\n\n- Daily notes can live outside a Daily directory."
              }
            }
          ]
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await runReviewTask(config, "weekly-review", {
      now: new Date("2026-05-18T00:30:00.000Z")
    });

    assert.equal(result.path, "Reviews/Weekly/2026-W20.md");
    const output = await fs.readFile(path.join(root, "vault", result.path), "utf8");
    assert.match(output, /Daily notes can live outside a Daily directory/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review task can call the OpenAI Responses API mode", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);
  config.ai.apiMode = "responses";
  config.ai.model = "gpt-5.5";
  config.ai.maxOutputTokens = 64000;
  config.reviews.tasks[0].semanticRecall = {
    enabled: false,
    query: "",
    limit: 3,
    scopeDirs: []
  };

  await fs.mkdir(path.join(root, "vault", "Daily"), { recursive: true });
  await fs.writeFile(
    path.join(root, "vault", "Daily", "2026-05-13.md"),
    "## Afternoon\n\n[16:21] Long-form weekly review test.\n",
    "utf8"
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/responses")) {
      const body = JSON.parse(options.body);
      assert.equal(body.model, "gpt-5.5");
      assert.equal(body.max_output_tokens, 64000);
      assert.equal(body.store, false);
      assert.match(body.instructions, /Summarize the period/);
      assert.match(body.input[0].content, /Long-form weekly review test/);
      assert.equal(body.temperature, undefined);
      return {
        ok: true,
        json: async () => ({
          output_text: "## Key themes\n\n- Responses mode worked."
        })
      };
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await runReviewTask(config, "weekly-review", {
      now: new Date("2026-05-18T00:30:00.000Z")
    });

    assert.equal(result.path, "Reviews/Weekly/2026-W20.md");
    const output = await fs.readFile(path.join(root, "vault", result.path), "utf8");
    assert.match(output, /Responses mode worked/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("review status computes the next weekly run when the configured weekday already passed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);
  config.reviews.tasks[0].schedule = {
    time: "23:00",
    weekday: 0,
    monthDay: 1,
    quarterDayOffset: 1,
    month: 1,
    period: "weekly"
  };

  const status = await getReviewStatus(config, new Date("2026-05-19T08:00:00.000Z"));
  assert.equal(status.tasks[0].nextRunAt, "2026-05-24T15:00:00.000Z");
});

test("review task rejects an unknown task id", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-review-task-"));
  const config = testConfig(root);

  await assert.rejects(
    () => runReviewTask(config, "missing-review", {
      now: new Date("2026-05-18T00:30:00.000Z")
    }),
    /Review task not found: missing-review/
  );
});

function fakeEmbedding(text) {
  const normalized = String(text).toLowerCase();
  return [
    normalized.includes("automation") ? 1 : 0,
    normalized.includes("obsidian") ? 1 : 0,
    normalized.length / 1000
  ];
}

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    timeZone: "Asia/Shanghai",
    allowedDirs: ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Reviews", "Templates", "Attachments", "Archive"],
    appEncryptionKey: "test-encryption-key",
    dailyNote: {
      pathTemplate: "Daily/{{YYYY}}-{{MM}}-{{DD}}.md",
      templatePath: "",
      createIfMissing: true,
      headingLevel: 2,
      linePattern: "^\\[\\d{2}:\\d{2}\\]",
      lineFormat: "[{{HH:mm}}] {{content}}",
      blankLineBetweenEntries: true,
      timeZone: "Asia/Shanghai",
      slots: []
    },
    embedding: {
      enabled: true,
      provider: "openai-compatible",
      baseUrl: "https://embedding.example.test/v1",
      model: "test-embedding",
      apiKey: "test-api-key",
      dimensions: 0,
      batchSize: 2,
      maxChunkChars: 1600,
      searchLimit: 8,
      autoIndexAfterWrite: false,
      autoScanIntervalMinutes: 0
    },
    ai: {
      provider: "openai-compatible",
      baseUrl: "https://chat.example.test/v1",
      model: "test-chat",
      apiKey: "test-chat-key",
      temperature: 0.2,
      maxOutputTokens: 1000
    },
    reviews: {
      enabled: true,
      maxSourceChars: 60000,
      maxRecallChars: 16000,
      tasks: [
        {
          id: "weekly-review",
          enabled: true,
          name: "Weekly Review",
          period: "weekly",
          targetPeriod: "previous",
          schedule: { weekday: 1, time: "08:00" },
          sourceDirs: ["Daily"],
          output: {
            pathTemplate: "Reviews/Weekly/{{YYYY}}-W{{WW}}.md",
            heading: "Weekly Review",
            templatePath: ""
          },
          semanticRecall: {
            enabled: true,
            query: "automation",
            limit: 3,
            scopeDirs: ["Daily", "Ideas"]
          },
          prompt: "Summarize the period and use semantic recall."
        }
      ]
    }
  };
}
