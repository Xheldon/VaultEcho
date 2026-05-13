import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { appendToHeading, insertAfterLastMatchingLine } from "./markdown.js";
import { buildDailyWrite } from "./time.js";

const fileQueues = new Map();

export async function executeOperation(config, operation) {
  validateOperation(operation);
  const idempotencyKey = normalizeString(operation.idempotencyKey);

  if (idempotencyKey) {
    const existing = await readIdempotencyRecord(config, idempotencyKey);
    if (existing) {
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
        return appendDailyByTime(targetPath, preparedOperation);
      case "soft_delete":
        return softDelete(config, targetPath);
      default:
        throw new Error(`Unsupported operation: ${preparedOperation.operation}`);
    }
  });

  if (idempotencyKey) {
    await writeIdempotencyRecord(config, idempotencyKey, result);
  }

  return result;
}

function prepareOperation(config, operation) {
  if (operation.operation !== "append_daily_by_time") return operation;

  const dailyWrite = buildDailyWrite(operation, config.dailyNote);
  return {
    ...operation,
    ...dailyWrite,
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
  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await fs.appendFile(targetPath.absolutePath, content, "utf8");
  return { ok: true, operation: operation.operation, path: targetPath.relativePath };
}

async function prependFile(targetPath, operation) {
  const content = normalizeString(operation.content);
  const original = await readTextIfExists(targetPath.absolutePath);
  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await atomicWrite(targetPath.absolutePath, `${content}${original}`);
  return { ok: true, operation: operation.operation, path: targetPath.relativePath };
}

async function patchHeading(targetPath, operation, transform) {
  ensureMarkdownPath(targetPath.relativePath);
  const original = await readTextIfExists(targetPath.absolutePath);
  const next = transform(original, {
    heading: operation.heading,
    headingLevel: operation.headingLevel || 2,
    linePattern: operation.linePattern,
    content: normalizeString(operation.content),
    ifHeadingMissing: operation.ifHeadingMissing || "create"
  });

  await fs.mkdir(path.dirname(targetPath.absolutePath), { recursive: true });
  await atomicWrite(targetPath.absolutePath, next);
  return { ok: true, operation: operation.operation, path: targetPath.relativePath };
}

async function appendDailyByTime(targetPath, operation) {
  const result = await patchHeading(targetPath, operation, insertAfterLastMatchingLine);
  return {
    ...result,
    heading: operation.heading,
    timestamp: operation.timestamp,
    slot: operation.slot,
    at: operation.at
  };
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

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function toVaultRelativePath(targetPath, filePath) {
  return path.relative(targetPath.vaultRoot, filePath).replaceAll(path.sep, "/");
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

function idempotencyPath(config, key) {
  const hash = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(config.dataDir, "idempotency", `${hash}.json`);
}
