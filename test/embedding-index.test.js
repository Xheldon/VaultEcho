import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  getEmbeddingIndexStatus,
  rebuildEmbeddingIndex,
  searchEmbeddingIndex,
  indexEmbeddingFile
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

test("embedding index storage round-trip preserves vectors and metadata", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-embedding-index-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Ideas", "apple.md"), "# Fruit\n\napple apple note\n", "utf8");

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
    await rebuildEmbeddingIndex(config);
    const status1 = await getEmbeddingIndexStatus(config);
    const search1 = await searchEmbeddingIndex(config, { query: "apple", limit: 2 });

    const status2 = await getEmbeddingIndexStatus(config);
    const search2 = await searchEmbeddingIndex(config, { query: "apple", limit: 2 });

    assert.equal(status1.files, status2.files);
    assert.equal(status1.chunks, status2.chunks);
    assert.equal(search1.results.length, search2.results.length);
    assert.equal(search1.results[0].path, search2.results[0].path);
    assert.ok(Math.abs(search1.results[0].score - search2.results[0].score) < 0.001);

    const metaPath = path.join(root, "data", "index", "meta.json");
    const metaExists = await fs.access(metaPath).then(() => true).catch(() => false);
    assert.ok(metaExists);

    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
    assert.equal(meta.version, 2);
    assert.ok(meta.vectorsFile);

    const vectorPath = path.join(root, "data", "index", meta.vectorsFile);
    const vectorExists = await fs.access(vectorPath).then(() => true).catch(() => false);
    assert.ok(vectorExists);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedding index migrates legacy embeddings.json automatically", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-embedding-index-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Ideas", "apple.md"), "# Fruit\n\napple apple note\n", "utf8");

  const legacyStore = {
    version: 1,
    signature: "legacy-sig",
    updatedAt: "2024-01-01T00:00:00.000Z",
    files: {
      "Ideas/apple.md": {
        path: "Ideas/apple.md",
        hash: "abc123",
        chunkCount: 1,
        indexedAt: "2024-01-01T00:00:00.000Z"
      }
    },
    chunks: [
      {
        id: "chunk1",
        path: "Ideas/apple.md",
        heading: "# Fruit",
        lineStart: 1,
        lineEnd: 3,
        text: "# Fruit\n\napple apple note",
        embedding: [1, 0, 0.02]
      }
    ]
  };

  await fs.mkdir(path.join(root, "data", "index"), { recursive: true });
  await fs.writeFile(
    path.join(root, "data", "index", "embeddings.json"),
    JSON.stringify(legacyStore, null, 2),
    "utf8"
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Should not call embedding API during migration");
  };

  try {
    const status = await getEmbeddingIndexStatus(config);
    assert.equal(status.files, 1);
    assert.equal(status.chunks, 1);
    assert.equal(status.signatureMatches, false);

    const migratedExists = await fs.access(path.join(root, "data", "index", "embeddings.json.migrated"))
      .then(() => true).catch(() => false);
    assert.ok(migratedExists);

    const metaExists = await fs.access(path.join(root, "data", "index", "meta.json"))
      .then(() => true).catch(() => false);
    assert.ok(metaExists);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedding index handles concurrent operations with locking", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-embedding-index-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Ideas", "apple.md"), "# Fruit\n\napple note\n", "utf8");
  await fs.writeFile(path.join(root, "vault", "Ideas", "banana.md"), "# Fruit\n\nbanana note\n", "utf8");
  await fs.writeFile(path.join(root, "vault", "Ideas", "cherry.md"), "# Fruit\n\ncherry note\n", "utf8");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const input = Array.isArray(body.input) ? body.input : [body.input];
    await new Promise(resolve => setTimeout(resolve, 10));
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
    const operations = [
      rebuildEmbeddingIndex(config),
      indexEmbeddingFile(config, "Ideas/apple.md"),
      getEmbeddingIndexStatus(config),
      searchEmbeddingIndex(config, { query: "apple", limit: 2 })
    ];

    const results = await Promise.all(operations);
    const [rebuild, index, status, search] = results;

    assert.ok(rebuild.ok);
    assert.ok(index.ok || index.skipped);
    assert.ok(status.ok);
    assert.ok(search.ok);
    assert.ok(status.files >= 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("embedding index cleans up stale temporary files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-embedding-index-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Ideas", "apple.md"), "# Fruit\n\napple note\n", "utf8");

  const indexDir = path.join(root, "data", "index");
  await fs.mkdir(indexDir, { recursive: true });

  const staleTmp = path.join(indexDir, "vectors.old.tmp");
  await fs.writeFile(staleTmp, "stale content");
  const stat = await fs.stat(staleTmp);
  await fs.utimes(staleTmp, new Date(stat.atime), new Date(Date.now() - 7200 * 1000));

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
    await rebuildEmbeddingIndex(config);

    const tmpExists = await fs.access(staleTmp).then(() => true).catch(() => false);
    assert.equal(tmpExists, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

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
