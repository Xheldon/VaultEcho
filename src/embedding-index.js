import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "./secrets.js";

const INDEX_VERSION = 1;
const INDEX_FILE = "embeddings.json";
const DEFAULT_BATCH_SIZE = 16;
const DEFAULT_MAX_CHUNK_CHARS = 1600;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 50;
const queuedFiles = new Map();
let rebuildQueue = Promise.resolve();

export function isEmbeddingReady(config) {
  try {
    return Boolean(
      config.embedding?.enabled &&
      config.embedding?.model &&
      config.embedding?.baseUrl &&
      readEmbeddingApiKey(config)
    );
  } catch {
    return false;
  }
}

export async function getEmbeddingIndexStatus(config) {
  const store = await readIndexStore(config);
  const errors = await readIndexErrors(config);
  return {
    ok: true,
    operation: "index/status",
    enabled: Boolean(config.embedding?.enabled),
    ready: isEmbeddingReady(config),
    provider: config.embedding?.provider || "openai-compatible",
    model: config.embedding?.model || "",
    baseUrl: config.embedding?.baseUrl || "",
    files: Object.keys(store.files).length,
    chunks: store.chunks.length,
    updatedAt: store.updatedAt || "",
    lastError: errors[0] || null,
    signatureMatches: store.signature === embeddingSignature(config)
  };
}

export async function clearEmbeddingIndexErrors(config) {
  try {
    await fs.unlink(indexErrorsPath(config));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return { ok: true, operation: "index/errors/clear" };
}

export async function rebuildEmbeddingIndex(config, options = {}) {
  const previous = rebuildQueue.catch(() => {});
  const current = previous.then(() => rebuildEmbeddingIndexNow(config, options));
  rebuildQueue = current.catch(() => {});
  return current;
}

async function rebuildEmbeddingIndexNow(config, options = {}) {
  ensureEmbeddingReady(config);
  const existing = await readIndexStore(config);
  const signature = embeddingSignature(config);
  const force = Boolean(options.force) || existing.signature !== signature;
  const files = await listMarkdownFiles(config);
  const nextFiles = {};
  const nextChunks = [];
  let reusedFiles = 0;
  let indexedFiles = 0;

  for (const filePath of files) {
    const relativePath = toVaultRelativePath(config, filePath);
    if (!(await canReadMarkdownForIndex(filePath))) {
      continue;
    }
    const content = await fs.readFile(filePath, "utf8");
    const hash = sha256(content);
    const previous = existing.files[relativePath];

    if (!force && previous?.hash === hash) {
      reusedFiles += 1;
      nextFiles[relativePath] = previous;
      nextChunks.push(...existing.chunks.filter((chunk) => chunk.path === relativePath));
      continue;
    }

    const chunks = chunkMarkdown(relativePath, content, config.embedding?.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS);
    const embeddedChunks = await embedChunks(config, chunks);
    indexedFiles += 1;
    nextFiles[relativePath] = {
      path: relativePath,
      hash,
      chunkCount: embeddedChunks.length,
      indexedAt: new Date().toISOString()
    };
    nextChunks.push(...embeddedChunks);
  }

  const store = normalizeIndexStore({
    version: INDEX_VERSION,
    signature,
    updatedAt: new Date().toISOString(),
    files: nextFiles,
    chunks: nextChunks
  });
  await writeIndexStore(config, store);

  return {
    ok: true,
    operation: "index/rebuild",
    files: Object.keys(store.files).length,
    chunks: store.chunks.length,
    indexedFiles,
    reusedFiles,
    force
  };
}

export async function indexEmbeddingFile(config, relativePath) {
  if (!isEmbeddingReady(config)) {
    return { ok: false, operation: "index/file", skipped: true, reason: "Embedding is not configured" };
  }

  const normalizedPath = normalizeVaultRelativePath(relativePath);
  if (!normalizedPath.toLowerCase().endsWith(".md")) {
    return { ok: false, operation: "index/file", skipped: true, reason: "Only Markdown files are indexed" };
  }

  const absolutePath = path.resolve(config.vaultRoot, normalizedPath);
  const store = await readIndexStore(config);
  const signature = embeddingSignature(config);
  const exists = await fileExists(absolutePath);
  const chunksWithoutFile = store.chunks.filter((chunk) => chunk.path !== normalizedPath);
  const nextFiles = { ...store.files };

  if (!exists) {
    delete nextFiles[normalizedPath];
    await writeIndexStore(config, normalizeIndexStore({
      ...store,
      signature,
      updatedAt: new Date().toISOString(),
      files: nextFiles,
      chunks: chunksWithoutFile
    }));
    return { ok: true, operation: "index/file", path: normalizedPath, removed: true };
  }
  if (!(await canReadMarkdownForIndex(absolutePath))) {
    delete nextFiles[normalizedPath];
    await writeIndexStore(config, normalizeIndexStore({
      ...store,
      signature,
      updatedAt: new Date().toISOString(),
      files: nextFiles,
      chunks: chunksWithoutFile
    }));
    return { ok: true, operation: "index/file", path: normalizedPath, skipped: true, reason: "File is too large" };
  }

  const content = await fs.readFile(absolutePath, "utf8");
  const hash = sha256(content);
  const previous = store.signature === signature ? store.files[normalizedPath] : null;
  if (previous?.hash === hash) {
    return { ok: true, operation: "index/file", path: normalizedPath, skipped: true, reason: "File is unchanged" };
  }

  const chunks = chunkMarkdown(normalizedPath, content, config.embedding?.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS);
  const embeddedChunks = await embedChunks(config, chunks);
  nextFiles[normalizedPath] = {
    path: normalizedPath,
    hash,
    chunkCount: embeddedChunks.length,
    indexedAt: new Date().toISOString()
  };

  await writeIndexStore(config, normalizeIndexStore({
    ...store,
    signature,
    updatedAt: new Date().toISOString(),
    files: nextFiles,
    chunks: [...chunksWithoutFile, ...embeddedChunks]
  }));

  return { ok: true, operation: "index/file", path: normalizedPath, chunks: embeddedChunks.length };
}

export function enqueueEmbeddingIndex(config, relativePath) {
  if (!config.embedding?.autoIndexAfterWrite || !isEmbeddingReady(config)) return;

  const normalizedPath = normalizeVaultRelativePath(relativePath);
  const previous = queuedFiles.get(normalizedPath) || Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(() => indexEmbeddingFile(config, normalizedPath))
    .catch((error) => {
      console.warn(`Embedding index failed for ${normalizedPath}: ${error.message}`);
      return writeIndexError(config, {
        path: normalizedPath,
        error: error.message,
        at: new Date().toISOString()
      });
    });
  queuedFiles.set(normalizedPath, current);
  current.finally(() => {
    if (queuedFiles.get(normalizedPath) === current) {
      queuedFiles.delete(normalizedPath);
    }
  });
}

export async function searchEmbeddingIndex(config, params = {}) {
  ensureEmbeddingReady(config);
  const query = params.query || params.content || params.text || "";
  if (!query || typeof query !== "string") {
    throw new Error("query is required");
  }

  const store = await readIndexStore(config);
  if (store.signature !== embeddingSignature(config)) {
    return {
      ok: false,
      operation: "index/search",
      error: "Embedding index was built with a different model/config. Rebuild the index first."
    };
  }

  const limit = Math.min(
    normalizePositiveInteger(params.limit, config.embedding?.searchLimit || DEFAULT_SEARCH_LIMIT),
    MAX_SEARCH_LIMIT
  );
  const [queryEmbedding] = await embedTexts(config, [query]);
  const results = store.chunks
    .map((chunk) => ({
      path: chunk.path,
      heading: chunk.heading,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      text: chunk.text,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    }))
    .filter((result) => Number.isFinite(result.score))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);

  return { ok: true, operation: "index/search", query, results };
}

export function startEmbeddingAutoScan(loadConfig) {
  let running = false;
  let nextRunAt = 0;

  const tick = async () => {
    if (running) return;
    const config = await loadConfig();
    const intervalMinutes = config.embedding?.autoScanIntervalMinutes || 0;
    if (!isEmbeddingReady(config) || intervalMinutes <= 0) return;

    const now = Date.now();
    if (now < nextRunAt) return;
    running = true;
    nextRunAt = now + intervalMinutes * 60 * 1000;
    try {
      await rebuildEmbeddingIndex(config, { force: false });
    } catch (error) {
      console.warn(`Embedding auto scan failed: ${error.message}`);
    } finally {
      running = false;
    }
  };

  setInterval(() => {
    tick().catch((error) => console.warn(`Embedding auto scan failed: ${error.message}`));
  }, 60 * 1000).unref();

  tick().catch((error) => console.warn(`Embedding auto scan failed: ${error.message}`));
}

function ensureEmbeddingReady(config) {
  if (!isEmbeddingReady(config)) {
    throw new Error("Embedding is not configured. Enable embedding, set model/baseUrl, and save an API key.");
  }
}

async function embedChunks(config, chunks) {
  if (chunks.length === 0) return [];
  const vectors = await embedTexts(config, chunks.map((chunk) => chunk.text));
  return chunks.map((chunk, index) => ({
    ...chunk,
    embedding: vectors[index]
  }));
}

async function embedTexts(config, texts) {
  const apiKey = readEmbeddingApiKey(config);
  const batchSize = config.embedding?.batchSize || DEFAULT_BATCH_SIZE;
  const results = [];

  for (let index = 0; index < texts.length; index += batchSize) {
    const batch = texts.slice(index, index + batchSize);
    const response = await fetch(embeddingEndpoint(config), {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(embeddingRequestBody(config, batch))
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Embedding API failed with ${response.status}: ${text.slice(0, 500)}`);
    }

    const payload = await response.json();
    const data = Array.isArray(payload.data) ? payload.data : [];
    if (data.length !== batch.length) {
      throw new Error(`Embedding API returned ${data.length} vectors for ${batch.length} inputs`);
    }
    for (const item of data) {
      if (!Array.isArray(item.embedding)) {
        throw new Error("Embedding API response is missing embedding vector");
      }
      results.push(item.embedding.map(Number));
    }
  }

  return results;
}

function embeddingRequestBody(config, input) {
  const body = {
    model: config.embedding.model,
    input
  };
  if (config.embedding.dimensions) {
    body.dimensions = config.embedding.dimensions;
  }
  return body;
}

function embeddingEndpoint(config) {
  return `${String(config.embedding.baseUrl).replace(/\/+$/g, "")}/embeddings`;
}

function readEmbeddingApiKey(config) {
  if (config.embedding?.apiKey) return config.embedding.apiKey;
  if (!config.embedding?.apiKeyEncrypted) return "";
  return decryptSecret(config.embedding.apiKeyEncrypted, config.appEncryptionKey);
}

function embeddingSignature(config) {
  return sha256(JSON.stringify({
    provider: config.embedding?.provider || "openai-compatible",
    baseUrl: config.embedding?.baseUrl || "",
    model: config.embedding?.model || "",
    dimensions: config.embedding?.dimensions || 0,
    maxChunkChars: config.embedding?.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS
  }));
}

function chunkMarkdown(relativePath, content, maxChunkChars) {
  const lines = content.split(/\r?\n/);
  const chunks = [];
  let inFrontmatter = false;
  let frontmatterClosed = false;
  let heading = "";
  let buffer = [];
  let blockStart = 1;

  if (lines[0]?.trim() === "---") {
    inFrontmatter = true;
  }

  const flush = (lineEnd) => {
    const raw = buffer.join("\n").trim();
    if (!raw) {
      buffer = [];
      return;
    }

    const prefixed = heading ? `${heading}\n${raw}` : raw;
    for (const piece of splitByLength(prefixed, maxChunkChars)) {
      const chunkIndex = chunks.length;
      chunks.push({
        id: sha256(`${relativePath}\0${chunkIndex}\0${piece}`),
        path: relativePath,
        heading,
        lineStart: blockStart,
        lineEnd,
        text: piece
      });
    }
    buffer = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const line = lines[index];

    if (inFrontmatter) {
      if (lineNumber > 1 && line.trim() === "---") {
        inFrontmatter = false;
        frontmatterClosed = true;
      }
      continue;
    }

    if (!frontmatterClosed && line.trim() === "---") {
      inFrontmatter = true;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flush(lineNumber - 1);
      heading = `${headingMatch[1]} ${headingMatch[2]}`;
      blockStart = lineNumber;
      buffer = [];
      continue;
    }

    if (!line.trim()) {
      flush(lineNumber);
      blockStart = lineNumber + 1;
      continue;
    }

    if (buffer.length === 0) {
      blockStart = lineNumber;
    }
    buffer.push(line);
  }

  flush(lines.length);
  return chunks;
}

function splitByLength(text, maxLength) {
  const normalizedMax = Math.max(200, Number(maxLength) || DEFAULT_MAX_CHUNK_CHARS);
  if (text.length <= normalizedMax) return [text];
  const pieces = [];
  for (let index = 0; index < text.length; index += normalizedMax) {
    pieces.push(text.slice(index, index + normalizedMax));
  }
  return pieces;
}

async function listMarkdownFiles(config) {
  const files = [];
  for (const dir of config.allowedDirs) {
    const root = path.join(config.vaultRoot, dir);
    for await (const filePath of walkMarkdown(root)) {
      files.push(filePath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function* walkMarkdown(root) {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkMarkdown(filePath);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      yield filePath;
    }
  }
}

async function readIndexStore(config) {
  try {
    return normalizeIndexStore(JSON.parse(await fs.readFile(indexStorePath(config), "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return normalizeIndexStore({});
    throw error;
  }
}

async function writeIndexStore(config, store) {
  const filePath = indexStorePath(config);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function normalizeIndexStore(store) {
  return {
    version: INDEX_VERSION,
    signature: typeof store.signature === "string" ? store.signature : "",
    updatedAt: typeof store.updatedAt === "string" ? store.updatedAt : "",
    files: store.files && typeof store.files === "object" && !Array.isArray(store.files) ? store.files : {},
    chunks: Array.isArray(store.chunks) ? store.chunks : []
  };
}

function indexStorePath(config) {
  return path.join(config.dataDir, "index", INDEX_FILE);
}

async function readIndexErrors(config) {
  try {
    const payload = JSON.parse(await fs.readFile(indexErrorsPath(config), "utf8"));
    return Array.isArray(payload.errors) ? payload.errors : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeIndexError(config, errorRecord) {
  const errors = [errorRecord, ...(await readIndexErrors(config))].slice(0, 50);
  const filePath = indexErrorsPath(config);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify({ errors }, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

function indexErrorsPath(config) {
  return path.join(config.dataDir, "index", "embedding-errors.json");
}

function normalizeVaultRelativePath(inputPath) {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("path is required");
  }
  if (path.isAbsolute(inputPath)) {
    throw new Error("Absolute paths are not allowed");
  }
  const normalized = path.posix.normalize(inputPath.replaceAll("\\", "/"));
  if (normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new Error("Path traversal is not allowed");
  }
  return normalized;
}

function toVaultRelativePath(config, filePath) {
  return path.relative(config.vaultRoot, filePath).replaceAll(path.sep, "/");
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return Number.NaN;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }
  if (leftNorm === 0 || rightNorm === 0) return Number.NaN;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function canReadMarkdownForIndex(filePath) {
  const stat = await statIfExists(filePath);
  return Boolean(stat?.isFile() && stat.size <= DEFAULT_MAX_FILE_BYTES);
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return number;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
