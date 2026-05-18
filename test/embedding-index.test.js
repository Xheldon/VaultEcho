import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getEmbeddingIndexStatus,
  rebuildEmbeddingIndex,
  searchEmbeddingIndex
} from "../src/embedding-index.js";

test("embedding index rebuilds markdown chunks and supports semantic search", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-embedding-index-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Ideas", "apple.md"), "# Fruit\n\napple apple note\n", "utf8");
  await fs.writeFile(path.join(root, "vault", "Ideas", "banana.md"), "# Fruit\n\nbanana banana note\n", "utf8");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const input = Array.isArray(body.input) ? body.input : [body.input];
    return {
      ok: true,
      json: async () => ({
        data: input.map((text, index) => ({
          index,
          embedding: fakeEmbedding(text)
        }))
      })
    };
  };

  try {
    const rebuilt = await rebuildEmbeddingIndex(config);
    const status = await getEmbeddingIndexStatus(config);
    const search = await searchEmbeddingIndex(config, { query: "apple", limit: 2 });

    assert.equal(rebuilt.files, 2);
    assert.equal(status.ready, true);
    assert.equal(status.files, 2);
    assert.equal(search.results[0].path, "Ideas/apple.md");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedding index can include root markdown files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-embedding-index-"));
  const config = testConfig(root);
  config.includeRootMarkdownFiles = true;
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Evergreen.md"), "# Root\n\nroot apple note\n", "utf8");
  await fs.writeFile(path.join(root, "vault", "Ideas", "banana.md"), "# Fruit\n\nbanana banana note\n", "utf8");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const input = Array.isArray(body.input) ? body.input : [body.input];
    return {
      ok: true,
      json: async () => ({
        data: input.map((text, index) => ({
          index,
          embedding: fakeEmbedding(text)
        }))
      })
    };
  };

  try {
    const rebuilt = await rebuildEmbeddingIndex(config);
    const search = await searchEmbeddingIndex(config, { query: "apple", limit: 2 });

    assert.equal(rebuilt.files, 2);
    assert.equal(search.results[0].path, "Evergreen.md");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedding index skips globally excluded paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-embedding-index-"));
  const config = testConfig(root);
  config.excludePaths = ["Ideas/Archive"];
  await fs.mkdir(path.join(root, "vault", "Ideas", "Archive"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Ideas", "apple.md"), "# Fruit\n\napple apple note\n", "utf8");
  await fs.writeFile(path.join(root, "vault", "Ideas", "Archive", "banana.md"), "# Fruit\n\nbanana banana note\n", "utf8");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const input = Array.isArray(body.input) ? body.input : [body.input];
    return {
      ok: true,
      json: async () => ({
        data: input.map((text, index) => ({
          index,
          embedding: fakeEmbedding(text)
        }))
      })
    };
  };

  try {
    const rebuilt = await rebuildEmbeddingIndex(config);
    const search = await searchEmbeddingIndex(config, { query: "banana", limit: 2 });

    assert.equal(rebuilt.files, 1);
    assert.deepEqual(search.results.map((result) => result.path), ["Ideas/apple.md"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function fakeEmbedding(text) {
  const normalized = String(text).toLowerCase();
  return [
    normalized.includes("apple") ? 1 : 0,
    normalized.includes("banana") ? 1 : 0,
    normalized.length / 1000
  ];
}

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    allowedDirs: ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Templates", "Attachments", "Archive"],
    appEncryptionKey: "test-encryption-key",
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
    }
  };
}
