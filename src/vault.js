import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  appendFrontmatterField,
  appendToHeading,
  insertAfterLastMatchingLine,
  upsertSeparatedHeadingEntries
} from "./markdown.js";
import { buildDailyPath, buildDailyWrite, getDateTimeParts, renderTemplate } from "./time.js";
import { MAX_MARKDOWN_APPEND_BYTES, MAX_MARKDOWN_PATCH_BYTES } from "./limits.js";

const fileQueues = new Map();
const IDEMPOTENCY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
let lastIdempotencyCleanupAt = 0;

export async function executeOperation(config, operation) {
  validateOperation(operation);
  const idempotencyKey = normalizeString(operation.idempotencyKey);

  if (idempotencyKey) {
    const existing = await readIdempotencyRecord(config, idempotencyKey);
    if (
      existing &&
      !operation.forceReplayIdempotent &&
      !(await shouldReplayMissingIdempotentResult(config, operation, existing.result))
    ) {
      return { ...existing.result, idempotent: true };
    }
  }

  const preparedOperation = prepareOperation(config, operation);
  const targetPath = resolveVaultPath(config, preparedOperation.path);
  const result = await withFileQueue(targetPath.absolutePath, async () => {
    switch (preparedOperation.operation) {
      case "create_markdown":
        return createMarkdown(targetPath, preparedOperation);
      case "append":
        return appendFile(targetPath, preparedOperation);
      case "prepend":
        return prependFile(targetPath, preparedOperation);
      case "append_to_heading":
        return patchHeading(targetPath, preparedOperation, appendToHeading);
      case "insert_after_last_matching_line":
        return patchHeading(targetPath, preparedOperation, insertAfterLastMatchingLine);
      case "append_daily_by_time":
        return appendDailyByTime(config, targetPath, preparedOperation);
      case "upsert_daily_separated_heading":
        return upsertDailySeparatedHeading(config, targetPath, preparedOperation);
      case "append_frontmatter_field":
        return appendFrontmatterFieldOp(config, targetPath, preparedOperation);
      case "soft_delete":
        return softDelete(config, targetPath);
      default:
        throw new Error(`Unsupported operation: ${preparedOperation.operation}`);
    }
  });

  if (idempotencyKey) {
    await writeIdempotencyRecord(config, idempotencyKey, result);
    cleanupIdempotencyRecords(config).catch((error) => {
      console.warn(`Idempotency cleanup failed: ${error.message}`);
    });
  }

  return result;
}

function prepareOperation(config, operation) {
  if (operation.operation === "insert_after_last_matching_line") {
    return {
      ...operation,
      linePattern: config.dailyNote.linePattern
    };
  }

  if (operation.operation === "upsert_daily_separated_heading") {
    const at = operation.at || new Date();
    const dailyPath = buildDailyPath(at, config.dailyNote, (operation.entries || [operation.content || ""]).join("\n"));
    const parts = getDateTimeParts(at, config.dailyNote.timeZone);
    const parsedPath = path.posix.parse(dailyPath);
    return {
      ...operation,
      path: dailyPath,
      headingLevel: operation.headingLevel || config.dailyNote.headingLevel,
      insertAfterHeadingLevel: operation.insertAfterHeadingLevel || config.dailyNote.headingLevel,
      replaceExisting: normalizeBoolean(operation.replaceExisting, false),
      linePattern: operation.linePattern || config.dailyNote.linePattern,
      templatePath: operation.templatePath ?? config.dailyNote.templatePath,
      createIfMissing: normalizeBoolean(operation.createIfMissing, config.dailyNote.createIfMissing),
      templateVars: {
        ...parts,
        content: "",
        entry: "",
        path: dailyPath,
        title: parsedPath.name,
        name: parsedPath.name,
        basename: parsedPath.name,
        dir: parsedPath.dir
      }
    };
  }

  if (operation.operation === "append_frontmatter_field") {
    const at = operation.at || new Date();
    const parts = getDateTimeParts(at, config.dailyNote.timeZone);
    const hasExplicitPath = Boolean(operation.path);
    const targetPath = hasExplicitPath ? operation.path : buildDailyPath(at, config.dailyNote);
    const parsedPath = path.posix.parse(targetPath);
    const templatePath = operation.templatePath ?? (hasExplicitPath ? "" : config.dailyNote.templatePath);
    return {
      ...operation,
      path: targetPath,
      createIfMissing: normalizeBoolean(operation.createIfMissing, true),
      templatePath,
      templateVars: {
        ...parts,
        content: "",
        path: targetPath,
        title: parsedPath.name,
        name: parsedPath.name,
        basename: parsedPath.name,
        dir: parsedPath.dir
      }
    };
  }

  if (operation.operation !== "append_daily_by_time") return operation;

  const dailyWrite = buildDailyWrite(operation, config.dailyNote);
  return {
    ...operation,
    ...dailyWrite,
    templatePath: operation.templatePath ?? config.dailyNote.templatePath,
    createIfMissing: normalizeBoolean(operation.createIfMissing, config.dailyNote.createIfMissing),
    blankLineBetweenEntries: config.dailyNote.blankLineBetweenEntries,
    sortByTimestamp: config.dailyNote.sortEntriesByTime,
    ifHeadingMissing: operation.ifHeadingMissing || "create"
  };
}

export function resolveVaultPath(config, inputPath) {
  const relativePath = normalizeVaultRelativePath(inputPath);
  enforceAllowedDir(config, relativePath);

  const absolutePath = path.resolve(config.vaultRoot, relativePath);
  const relativeFromRoot = path.relative(config.vaultRoot, absolutePath);
  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    throw new Error("Path escapes vault root");
  }

  return { relativePath, absolutePath, vaultRoot: config.vaultRoot };
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

function enforceAllowedDir(config, relativePath) {
  const [topLevel] = relativePath.split("/");
  if (!config.allowedDirs.includes(topLevel)) {
    throw new Error(`Top-level directory is not allowed: ${topLevel}`);
  }
}

async function createMarkdown(targetPath, operation) {
  ensureMarkdownPath(targetPath.relativePath);
  const content = normalizeString(operation.content);
  const ifExists = operation.ifExists || "fail";

  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });

  if (ifExists === "append_suffix") {
    const suffixedPath = await findAvailablePath(targetPath.absolutePath);
    await atomicWrite(suffixedPath, ensureTrailingNewline(content));
    return {
      ok: true,
      operation: operation.operation,
      path: toVaultRelativePath(targetPath, suffixedPath)
    };
  }

  if (ifExists === "fail" && (await exists(targetPath.absolutePath))) {
    throw new Error(`File already exists: ${targetPath.relativePath}`);
  }

  if (!["fail", "overwrite"].includes(ifExists)) {
    throw new Error(`Unsupported ifExists mode: ${ifExists}`);
  }

  await atomicWrite(targetPath.absolutePath, ensureTrailingNewline(content));
  return { ok: true, operation: operation.operation, path: targetPath.relativePath };
}

async function appendFile(targetPath, operation) {
  const content = normalizeString(operation.content);
  await ensureAppendableFile(targetPath.absolutePath, content);
  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await fs.appendFile(targetPath.absolutePath, content, "utf8");
  return { ok: true, operation: operation.operation, path: targetPath.relativePath };
}

async function prependFile(targetPath, operation) {
  const content = normalizeString(operation.content);
  await ensurePatchableMarkdownFile(targetPath.absolutePath);
  const original = await readTextIfExists(targetPath.absolutePath);
  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await atomicWrite(targetPath.absolutePath, `${content}${original}`);
  return { ok: true, operation: operation.operation, path: targetPath.relativePath };
}

async function patchHeading(targetPath, operation, transform) {
  ensureMarkdownPath(targetPath.relativePath);
  await ensurePatchableMarkdownFile(targetPath.absolutePath);
  const original = await readTextIfExists(targetPath.absolutePath);
  const next = transform(original, {
    heading: operation.heading,
    headingLevel: operation.headingLevel || 2,
    linePattern: operation.linePattern,
    content: normalizeString(operation.content),
    blankLineBetweenEntries: Boolean(operation.blankLineBetweenEntries),
    sortByTimestamp: Boolean(operation.sortByTimestamp),
    ifHeadingMissing: operation.ifHeadingMissing || "create"
  });

  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await atomicWrite(targetPath.absolutePath, next);
  return { ok: true, operation: operation.operation, path: targetPath.relativePath };
}

async function appendDailyByTime(config, targetPath, operation) {
  if (!(await exists(targetPath.absolutePath))) {
    if (!operation.createIfMissing) {
      throw new Error(`Daily note does not exist: ${targetPath.relativePath}`);
    }
    if (operation.templatePath) {
      await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
      await atomicWrite(
        targetPath.absolutePath,
        ensureTrailingNewline(await renderDailyTemplate(config, operation.templatePath, operation.templateVars || {}))
      );
    }
  }

  const result = await patchHeading(targetPath, operation, insertAfterLastMatchingLine);
  return {
    ...result,
    heading: operation.heading,
    timestamp: operation.timestamp,
    slot: operation.slot,
    at: operation.at
  };
}

async function upsertDailySeparatedHeading(config, targetPath, operation) {
  if (!(await exists(targetPath.absolutePath))) {
    if (!operation.createIfMissing) {
      throw new Error(`Daily note does not exist: ${targetPath.relativePath}`);
    }
    if (operation.templatePath) {
      await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
      await atomicWrite(
        targetPath.absolutePath,
        ensureTrailingNewline(await renderDailyTemplate(config, operation.templatePath, operation.templateVars || {}))
      );
    }
  }

  ensureMarkdownPath(targetPath.relativePath);
  await ensurePatchableMarkdownFile(targetPath.absolutePath);
  const original = await readTextIfExists(targetPath.absolutePath);
  const next = upsertSeparatedHeadingEntries(original, {
    heading: operation.heading,
    headingLevel: operation.headingLevel,
    entries: operation.entries || [operation.content],
    linePattern: operation.linePattern,
    separator: operation.separator || "---",
    insertAfterHeading: operation.insertAfterHeading || "",
    insertAfterHeadingLevel: operation.insertAfterHeadingLevel || operation.headingLevel,
    replaceExisting: Boolean(operation.replaceExisting)
  });

  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await atomicWrite(targetPath.absolutePath, next);
  return {
    ok: true,
    operation: operation.operation,
    path: targetPath.relativePath,
    heading: operation.heading,
    headingLevel: operation.headingLevel,
    at: operation.at
  };
}

async function appendFrontmatterFieldOp(config, targetPath, operation) {
  ensureMarkdownPath(targetPath.relativePath);
  await ensurePatchableMarkdownFile(targetPath.absolutePath);

  let original = "";
  if (await exists(targetPath.absolutePath)) {
    original = await readTextIfExists(targetPath.absolutePath);
  } else if (!operation.createIfMissing) {
    throw new Error(`Note does not exist: ${targetPath.relativePath}`);
  } else if (operation.templatePath) {
    original = ensureTrailingNewline(
      await renderDailyTemplate(config, operation.templatePath, operation.templateVars || {})
    );
  }

  const next = appendFrontmatterField(original, operation.key, operation.value, {
    unique: operation.unique,
    position: operation.position
  });

  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await atomicWrite(targetPath.absolutePath, ensureTrailingNewline(next));
  return {
    ok: true,
    operation: operation.operation,
    path: targetPath.relativePath,
    key: operation.key,
    at: operation.at
  };
}

async function renderDailyTemplate(config, templatePath, variables) {
  const template = await readVaultRelativeFile(config, templatePath, "Daily note template");
  return renderTemplate(template, variables);
}

async function readVaultRelativeFile(config, inputPath, label) {
  const absolutePath = resolveVaultReadPath(config, inputPath, label);
  try {
    return await fs.readFile(absolutePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`${label} not found: ${inputPath}`);
    }
    throw error;
  }
}

async function softDelete(config, targetPath) {
  const deletedAt = new Date().toISOString().replace(/[:.]/g, "-");
  const trashPath = path.join(config.vaultRoot, "Archive", "Deleted", `${deletedAt}-${path.basename(targetPath.relativePath)}`);

  if (!(await exists(targetPath.absolutePath))) {
    return { ok: true, operation: "soft_delete", path: targetPath.relativePath, skipped: true };
  }

  await fs.mkdir(path.dirname(trashPath), { recursive: true });
  await fs.rename(targetPath.absolutePath, trashPath);

  return {
    ok: true,
    operation: "soft_delete",
    path: targetPath.relativePath,
    movedTo: path.relative(config.vaultRoot, trashPath).replaceAll(path.sep, "/")
  };
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

async function findAvailablePath(filePath) {
  if (!(await exists(filePath))) return filePath;

  const parsed = path.parse(filePath);
  for (let index = 2; index < 1000; index += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name}-${index}${parsed.ext}`);
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error("Unable to find an available filename");
}

async function withFileQueue(key, task) {
  const previous = fileQueues.get(key) || Promise.resolve();
  const current = previous.catch(() => {}).then(task);
  const queued = current.catch(() => {});
  fileQueues.set(key, queued);
  try {
    return await current;
  } finally {
    if (fileQueues.get(key) === queued) {
      fileQueues.delete(key);
    }
  }
}

function validateOperation(operation) {
  if (!operation || typeof operation !== "object") {
    throw new Error("Request body must be an operation object");
  }
  if (!operation.operation || typeof operation.operation !== "string") {
    throw new Error("operation is required");
  }
}

function ensureMarkdownPath(relativePath) {
  if (!relativePath.toLowerCase().endsWith(".md")) {
    throw new Error("Markdown operations require a .md path");
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

function normalizeString(value) {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  return String(value);
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function toVaultRelativePath(targetPath, filePath) {
  return path.relative(targetPath.vaultRoot, filePath).replaceAll(path.sep, "/");
}

function resolveVaultReadPath(config, inputPath, label) {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error(`${label} path is required`);
  }
  if (path.isAbsolute(inputPath)) {
    throw new Error(`${label} absolute paths are not allowed`);
  }

  const relativePath = path.posix.normalize(inputPath.replaceAll("\\", "/"));
  if (relativePath === "." || relativePath.startsWith("../") || relativePath === "..") {
    throw new Error(`${label} path traversal is not allowed`);
  }

  const absolutePath = path.resolve(config.vaultRoot, relativePath);
  const relativeFromRoot = path.relative(config.vaultRoot, absolutePath);
  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    throw new Error(`${label} path escapes vault root`);
  }

  return absolutePath;
}

async function readIdempotencyRecord(config, key) {
  const filePath = idempotencyPath(config, key);
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function writeIdempotencyRecord(config, key, result) {
  const filePath = idempotencyPath(config, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWrite(
    filePath,
    JSON.stringify({ key, result, createdAt: new Date().toISOString() }, null, 2)
  );
}

async function shouldReplayMissingIdempotentResult(config, operation, result) {
  if (!operation.replayIfResultMissing || !result?.path) return false;
  let absolutePath;
  try {
    absolutePath = resolveVaultReadPath(config, result.path, "idempotency result");
  } catch {
    return false;
  }
  return !(await exists(absolutePath));
}

async function cleanupIdempotencyRecords(config) {
  const now = Date.now();
  if (now - lastIdempotencyCleanupAt < 60 * 60 * 1000) return;
  lastIdempotencyCleanupAt = now;

  const dir = path.join(config.dataDir, "idempotency");
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  const cutoff = now - IDEMPOTENCY_TTL_MS;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const shouldCheck = entry.name.endsWith(".json") || entry.name.endsWith(".tmp");
    if (!shouldCheck) continue;
    const filePath = path.join(dir, entry.name);
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(filePath);
    }
  }
}

export function startIdempotencyCleanup(configProvider) {
  const run = async () => {
    try {
      await cleanupIdempotencyRecords(await configProvider());
    } catch (error) {
      console.warn(`Idempotency cleanup failed: ${error.message}`);
    }
  };
  setInterval(run, 60 * 60 * 1000).unref();
  run();
}

async function ensurePatchableMarkdownFile(filePath) {
  const stat = await statIfExists(filePath);
  if (stat?.isFile() && stat.size > MAX_MARKDOWN_PATCH_BYTES) {
    throw new Error(`Markdown file is too large to patch: max ${MAX_MARKDOWN_PATCH_BYTES} bytes`);
  }
}

async function ensureAppendableFile(filePath, content) {
  const stat = await statIfExists(filePath);
  const currentSize = stat?.isFile() ? stat.size : 0;
  const nextSize = currentSize + Buffer.byteLength(content, "utf8");
  if (nextSize > MAX_MARKDOWN_APPEND_BYTES) {
    throw new Error(`File is too large to append: max ${MAX_MARKDOWN_APPEND_BYTES} bytes`);
  }
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function idempotencyPath(config, key) {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(config.dataDir, "idempotency", `${hash}.json`);
}
