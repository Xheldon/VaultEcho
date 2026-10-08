import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "./secrets.js";
import { MAX_MARKDOWN_SCAN_BYTES } from "./limits.js";

const INDEX_VERSION = 2;
const META_FILE = "meta.json";
const LEGACY_INDEX_FILE = "embeddings.json";
const DEFAULT_BATCH_SIZE = 16;
const DEFAULT_MAX_CHUNK_CHARS = 1600;
const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 50;
const AUTO_INDEX_DEBOUNCE_MS = 3000;

let cache = null;
let lock = Promise.resolve();
let pending = new Map();
let pendingTimer = null;

function withIndexLock(fn) {
  const run = lock.then(() => fn());
  lock = run.catch(() => {});
  return run;
}

export function isEmbeddingReady(config) {
  try {
    return Boolean(config.embedding?.enabled && config.embedding?.model && config.embedding?.baseUrl && readEmbeddingApiKey(config));
  } catch {
    return false;
  }
}

export async function getEmbeddingIndexStatus(config) {
  const index = await withIndexLock(() => loadIndex(config));
  const errors = await readIndexErrors(config);
  let chunks = 0;
  for (const list of index.chunksByPath.values()) chunks += list.length;
  return {
    ok: true, operation: "index/status",
    enabled: Boolean(config.embedding?.enabled), ready: isEmbeddingReady(config),
    provider: config.embedding?.provider || "openai-compatible", model: config.embedding?.model || "",
    baseUrl: config.embedding?.baseUrl || "", files: index.files.size, chunks,
    updatedAt: index.updatedAt || "", lastError: errors[0] || null,
    signatureMatches: index.signature === embeddingSignature(config)
  };
}

export async function clearEmbeddingIndexErrors(config) {
  try { await fs.unlink(indexErrorsPath(config)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  return { ok: true, operation: "index/errors/clear" };
}

export function rebuildEmbeddingIndex(config, options = {}) {
  return withIndexLock(() => rebuildEmbeddingIndexNow(config, options));
}

async function rebuildEmbeddingIndexNow(config, options = {}) {
  ensureEmbeddingReady(config);
  const index = await loadIndex(config);
  const signature = embeddingSignature(config);
  const force = Boolean(options.force) || index.signature !== signature;
  const files = await listMarkdownFiles(config);
  const seen = new Set();
  let reusedFiles = 0, indexedFiles = 0, dirty = force;

  for (const filePath of files) {
    const relativePath = toVaultRelativePath(config, filePath);
    const stat = await statIfExists(filePath);
    if (!stat?.isFile() || stat.size > MAX_MARKDOWN_SCAN_BYTES) continue;
    seen.add(relativePath);
    const previous = index.files.get(relativePath);
    if (!force && previous && previous.size === stat.size && previous.mtimeMs === stat.mtimeMs) { reusedFiles += 1; continue; }
    const content = await fs.readFile(filePath, "utf8");
    const hash = sha256(content);
    if (!force && previous?.hash === hash) {
      reusedFiles += 1;
      index.files.set(relativePath, { ...previous, size: stat.size, mtimeMs: stat.mtimeMs });
      dirty = true;
      continue;
    }
    await putFile(config, index, relativePath, content, hash, stat);
    indexedFiles += 1; dirty = true;
  }
  for (const relativePath of [...index.files.keys()]) {
    if (!seen.has(relativePath)) { index.files.delete(relativePath); index.chunksByPath.delete(relativePath); dirty = true; }
  }
  index.signature = signature;
  if (dirty) await saveIndex(config, index);
  let chunks = 0; for (const l of index.chunksByPath.values()) chunks += l.length;
  return { ok: true, operation: "index/rebuild", files: index.files.size, chunks, indexedFiles, reusedFiles, force, written: dirty };
}

async function putFile(config, index, relativePath, content, hash, stat) {
  const chunks = chunkMarkdown(relativePath, content, config.embedding?.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS);
  const embedded = await embedChunks(config, chunks);
  index.chunksByPath.set(relativePath, embedded.map(toStoredChunk));
  index.files.set(relativePath, { path: relativePath, hash, chunkCount: embedded.length, indexedAt: new Date().toISOString(), size: stat?.size ?? -1, mtimeMs: stat?.mtimeMs ?? -1 });
  if (embedded[0]) index.dims = embedded[0].embedding.length;
}

function toStoredChunk(chunk) {
  const vector = chunk.embedding instanceof Float32Array ? chunk.embedding : Float32Array.from(chunk.embedding);
  let n = 0; for (let i = 0; i < vector.length; i += 1) n += vector[i] * vector[i];
  return { id: chunk.id, path: chunk.path, heading: chunk.heading, lineStart: chunk.lineStart, lineEnd: chunk.lineEnd, text: chunk.text, vector, norm: Math.sqrt(n) };
}

export function indexEmbeddingFile(config, relativePath) {
  if (!isEmbeddingReady(config)) return Promise.resolve({ ok: false, operation: "index/file", skipped: true, reason: "Embedding is not configured" });
  const normalizedPath = normalizeVaultRelativePath(relativePath);
  if (!normalizedPath.toLowerCase().endsWith(".md")) return Promise.resolve({ ok: false, operation: "index/file", skipped: true, reason: "Only Markdown files are indexed" });
  return withIndexLock(async () => (await indexFilesNow(config, [normalizedPath]))[0]);
}

async function indexFilesNow(config, paths) {
  const index = await loadIndex(config);
  const signature = embeddingSignature(config);
  const results = []; let dirty = false;
  for (const normalizedPath of paths) {
    try {
      const absolutePath = path.resolve(config.vaultRoot, normalizedPath);
      const stat = await statIfExists(absolutePath);
      const drop = (reason, extra) => {
        if (index.files.delete(normalizedPath) | index.chunksByPath.delete(normalizedPath)) dirty = true;
        results.push({ ok: true, operation: "index/file", path: normalizedPath, ...extra, ...(reason ? { skipped: true, reason } : {}) });
      };
      if (isExcludedPath(normalizedPath, config.excludePaths)) { drop("Path is excluded"); continue; }
      if (!stat) { drop(null, { removed: true }); continue; }
      if (!stat.isFile() || stat.size > MAX_MARKDOWN_SCAN_BYTES) { drop("File is too large"); continue; }
      const content = await fs.readFile(absolutePath, "utf8");
      const hash = sha256(content);
      const previous = index.signature === signature ? index.files.get(normalizedPath) : null;
      if (previous?.hash === hash) { results.push({ ok: true, operation: "index/file", path: normalizedPath, skipped: true, reason: "File is unchanged" }); continue; }
      await putFile(config, index, normalizedPath, content, hash, stat);
      dirty = true;
      results.push({ ok: true, operation: "index/file", path: normalizedPath, chunks: index.chunksByPath.get(normalizedPath).length });
    } catch (error) {
      results.push({ ok: false, operation: "index/file", path: normalizedPath, error: error.message });
      await writeIndexError(config, { path: normalizedPath, error: error.message, at: new Date().toISOString() }).catch(() => {});
    }
  }
  if (index.files.size && !index.signature) index.signature = signature;
  if (dirty) await saveIndex(config, index);
  return results;
}

export function enqueueEmbeddingIndex(config, relativePath) {
  if (!config.embedding?.autoIndexAfterWrite || !isEmbeddingReady(config)) return;
  pending.set(normalizeVaultRelativePath(relativePath), config);
  if (pendingTimer) return;
  pendingTimer = setTimeout(() => {
    pendingTimer = null;
    const batch = pending; pending = new Map();
    const cfg = [...batch.values()].at(-1);
    withIndexLock(() => indexFilesNow(cfg, [...batch.keys()].filter((p) => p.toLowerCase().endsWith(".md"))))
      .catch((error) => console.warn(`Embedding auto-index failed: ${error.message}`));
  }, AUTO_INDEX_DEBOUNCE_MS);
  pendingTimer.unref?.();
}

export async function searchEmbeddingIndex(config, params = {}) {
  ensureEmbeddingReady(config);
  const query = params.query || params.content || params.text || "";
  if (!query || typeof query !== "string") throw new Error("query is required");
  const index = await withIndexLock(() => loadIndex(config));
  if (index.signature !== embeddingSignature(config)) {
    return { ok: false, operation: "index/search", error: "Embedding index was built with a different model/config. Rebuild the index first." };
  }
  const limit = Math.min(normalizePositiveInteger(params.limit, config.embedding?.searchLimit || DEFAULT_SEARCH_LIMIT), MAX_SEARCH_LIMIT);
  const [queryEmbedding] = await embedTexts(config, [query]);
  const q = Float32Array.from(queryEmbedding);
  let qn = 0; for (let i = 0; i < q.length; i += 1) qn += q[i] * q[i]; qn = Math.sqrt(qn);
  const top = [];
  for (const list of index.chunksByPath.values()) {
    for (const chunk of list) {
      const v = chunk.vector;
      if (v.length !== q.length || !chunk.norm || !qn) continue;
      let dot = 0; for (let i = 0; i < v.length; i += 1) dot += v[i] * q[i];
      const score = dot / (chunk.norm * qn);
      if (top.length < limit || score > top[top.length - 1].score) {
        top.push({ chunk, score }); top.sort((a, b) => b.score - a.score); if (top.length > limit) top.pop();
      }
    }
  }
  const results = top.map(({ chunk, score }) => ({ path: chunk.path, heading: chunk.heading, lineStart: chunk.lineStart, lineEnd: chunk.lineEnd, text: chunk.text, score }));
  return { ok: true, operation: "index/search", query, results };
}

export function startEmbeddingAutoScan(loadConfig) {
  let nextRunAt = 0;
  const tick = async () => {
    const config = await loadConfig();
    const intervalMinutes = config.embedding?.autoScanIntervalMinutes || 0;
    if (!isEmbeddingReady(config) || intervalMinutes <= 0) return;
    const now = Date.now();
    if (now < nextRunAt) return;
    nextRunAt = now + intervalMinutes * 60 * 1000;
    try { await rebuildEmbeddingIndex(config, { force: false }); } catch (error) { console.warn(`Embedding auto scan failed: ${error.message}`); }
  };
  setInterval(() => { tick().catch((e) => console.warn(`Embedding auto scan failed: ${e.message}`)); }, 60 * 1000).unref();
  tick().catch((e) => console.warn(`Embedding auto scan failed: ${e.message}`));
}

function indexDir(config) { return path.join(config.dataDir, "index"); }

async function loadIndex(config) {
  const metaPath = path.join(indexDir(config), META_FILE);
  const st = await statIfExists(metaPath);
  if (cache && cache.key === config.dataDir && (cache.metaMtimeMs === (st?.mtimeMs ?? 0))) return cache;
  if (!st) {
    const legacy = await migrateLegacyIndex(config);
    cache = legacy || emptyIndex(config);
    return cache;
  }
  const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
  const buf = await fs.readFile(path.join(indexDir(config), meta.vectorsFile));
  const all = buf.byteOffset % 4 === 0 ? new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4) : new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const dims = meta.dims;
  const chunksByPath = new Map();
  meta.chunks.forEach((c, row) => {
    const [id, p, heading, lineStart, lineEnd, text, norm] = c;
    const vector = all.subarray(row * dims, (row + 1) * dims);
    let list = chunksByPath.get(p); if (!list) chunksByPath.set(p, (list = []));
    list.push({ id, path: p, heading, lineStart, lineEnd, text, vector, norm });
  });
  cache = { key: config.dataDir, metaMtimeMs: st.mtimeMs, signature: meta.signature, updatedAt: meta.updatedAt, dims,
    files: new Map(Object.entries(meta.files)), chunksByPath, vectorsFile: meta.vectorsFile };
  return cache;
}

function emptyIndex(config) {
  return { key: config.dataDir, metaMtimeMs: 0, signature: "", updatedAt: "", dims: 0, files: new Map(), chunksByPath: new Map(), vectorsFile: "" };
}

async function saveIndex(config, index) {
  const dir = indexDir(config);
  await fs.mkdir(dir, { recursive: true });
  let rows = 0, dims = index.dims || 0;
  for (const list of index.chunksByPath.values()) { rows += list.length; if (!dims && list[0]) dims = list[0].vector.length; }
  const vectors = new Float32Array(rows * dims);
  const metaChunks = new Array(rows);
  let row = 0;
  for (const list of index.chunksByPath.values()) {
    for (const c of list) {
      vectors.set(c.vector, row * dims);
      metaChunks[row] = [c.id, c.path, c.heading, c.lineStart, c.lineEnd, c.text, c.norm];
      c.vector = vectors.subarray(row * dims, (row + 1) * dims);
      row += 1;
    }
  }
  const gen = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const vectorsFile = `vectors.${gen}.f32`;
  await fs.writeFile(path.join(dir, `${vectorsFile}.tmp`), Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));
  await fs.rename(path.join(dir, `${vectorsFile}.tmp`), path.join(dir, vectorsFile));
  index.updatedAt = new Date().toISOString(); index.dims = dims;
  const meta = { version: INDEX_VERSION, signature: index.signature, updatedAt: index.updatedAt, dims, vectorsFile,
    files: Object.fromEntries(index.files), chunks: metaChunks };
  const metaPath = path.join(dir, META_FILE);
  await fs.writeFile(`${metaPath}.${gen}.tmp`, JSON.stringify(meta));
  await fs.rename(`${metaPath}.${gen}.tmp`, metaPath);
  const old = index.vectorsFile; index.vectorsFile = vectorsFile;
  if (old && old !== vectorsFile) await fs.unlink(path.join(dir, old)).catch(() => {});
  index.metaMtimeMs = (await fs.stat(metaPath)).mtimeMs;
  cache = index;
  await cleanupStaleTempFiles(dir);
}

async function cleanupStaleTempFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    const now = Date.now();
    for (const entry of entries) {
      if (entry.endsWith(".tmp")) {
        const filePath = path.join(dir, entry);
        try {
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > 3600 * 1000) {
            await fs.unlink(filePath);
          }
        } catch {}
      }
    }
  } catch {}
}

async function migrateLegacyIndex(config) {
  const legacyPath = path.join(indexDir(config), LEGACY_INDEX_FILE);
  let raw;
  try { raw = await fs.readFile(legacyPath, "utf8"); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  const legacy = JSON.parse(raw); raw = null;
  const index = emptyIndex(config);
  index.signature = legacy.signature || "";
  for (const [p, f] of Object.entries(legacy.files || {})) index.files.set(p, { ...f, size: -1, mtimeMs: -1 });
  for (const c of legacy.chunks || []) {
    let list = index.chunksByPath.get(c.path); if (!list) index.chunksByPath.set(c.path, (list = []));
    list.push(toStoredChunk(c)); c.embedding = null;
  }
  await saveIndex(config, index);
  await fs.rename(legacyPath, `${legacyPath}.migrated`);
  return index;
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
    maxChunkChars: config.embedding?.maxChunkChars || DEFAULT_MAX_CHUNK_CHARS,
    includeRootMarkdownFiles: Boolean(config.includeRootMarkdownFiles),
    excludePaths: normalizeExcludePaths(config.excludePaths)
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
  if (config.includeRootMarkdownFiles) {
    files.push(...await listRootMarkdownFiles(config.vaultRoot));
  }
  for (const dir of config.allowedDirs) {
    const root = path.join(config.vaultRoot, dir);
    for await (const filePath of walkMarkdown(root)) {
      files.push(filePath);
    }
  }
  const excludePaths = normalizeExcludePaths(config.excludePaths);
  return files
    .filter((filePath) => !isExcludedPath(toVaultRelativePath(config, filePath), excludePaths))
    .sort((left, right) => left.localeCompare(right));
}

function normalizeExcludePaths(paths = []) {
  return (Array.isArray(paths) ? paths : [])
    .map((item) => path.posix.normalize(String(item || "").trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "")))
    .filter((item) => item && item !== "." && item !== ".." && !item.startsWith("../"));
}

function isExcludedPath(relativePath, excludePaths = []) {
  const normalizedExcludePaths = normalizeExcludePaths(excludePaths);
  const normalized = path.posix.normalize(String(relativePath || "").replaceAll("\\", "/").replace(/^\/+|\/+$/g, ""));
  return normalizedExcludePaths.some((excluded) => normalized === excluded || normalized.startsWith(`${excluded}/`));
}

async function listRootMarkdownFiles(vaultRoot) {
  let entries;
  try {
    entries = await fs.readdir(vaultRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => path.join(vaultRoot, entry.name));
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
