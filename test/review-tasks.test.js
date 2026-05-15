import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { rebuildEmbeddingIndex } from "../src/embedding-index.js";
import { runReviewTask } from "../src/review-tasks.js";

test("review task summarizes period notes with semantic recall and writes a managed block", async () => {
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
      now: new Date("2026-05-18T00:30:00.000Z")
    });

    assert.equal(result.path, "Reviews/Weekly/2026-W20.md");
    assert.equal(result.semanticRecall.results > 0, true);
    const output = await fs.readFile(path.join(root, "vault", result.path), "utf8");
    assert.match(output, /<!-- vaultecho:review task=weekly-review period=2026-W20 start -->/);
    assert.match(output, /Automation kept recurring/);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
            writeMode: "replace_managed_block"
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
