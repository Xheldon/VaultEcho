import fs from "node:fs/promises";
import path from "node:path";
import { executeOperation, resolveVaultPath } from "./vault.js";
import { buildDailyPath, getDateTimeParts } from "./time.js";
import { MAX_MARKDOWN_READ_BYTES, MAX_MARKDOWN_SCAN_BYTES } from "./limits.js";

const DEFAULT_NEW_NOTE_DIR = "Inbox";

export async function executeObsidianUri(config, input) {
  const request = normalizeUriRequest(input);

  switch (request.action) {
    case "open":
      return handleOpen(config, request.params);
    case "new":
      return handleNew(config, request.params);
    case "daily":
      return handleDaily(config, request.params);
    case "unique":
      return handleUnique(config, request.params);
    case "search":
      return handleSearch(config, request.params);
    case "choose-vault":
      return {
        ok: true,
        action: "choose-vault",
        supported: false,
        reason: "Vault manager is a desktop UI action and is not available in headless mode.",
        vaultRoot: config.vaultRoot
      };
    case "hook-get-address":
      return {
        ok: false,
        action: "hook-get-address",
        supported: false,
        reason: "Hook requires the current focused Obsidian UI note, which is unavailable in headless mode."
      };
    default:
      throw new Error(`Unsupported Obsidian URI action: ${request.action}`);
  }
}

export function normalizeUriRequest(input) {
  if (typeof input === "string") {
    return parseObsidianUri(input);
  }

  if (input?.uri) {
    return parseObsidianUri(input.uri);
  }

  if (input?.action) {
    const { action, ...params } = input;
    return { action, params };
  }

  throw new Error("uri or action is required");
}

export function parseObsidianUri(uri) {
  if (!uri || typeof uri !== "string") {
    throw new Error("uri must be a string");
  }

  if (!uri.startsWith("obsidian://")) {
    throw new Error("Only obsidian:// URIs are supported");
  }

  const parsed = new URL(uri);
  if (parsed.hostname === "vault") {
    const parts = decodeURIComponent(parsed.pathname.slice(1)).split("/");
    const [vault, ...fileParts] = parts;
    return {
      action: "open",
      params: compactParams({ vault, file: fileParts.join("/") })
    };
  }

  if (!parsed.hostname && parsed.pathname) {
    return {
      action: "open",
      params: { path: decodeURIComponent(parsed.pathname) }
    };
  }

  return {
    action: parsed.hostname,
    params: Object.fromEntries(parsed.searchParams.entries())
  };
}

async function handleOpen(config, params) {
  const target = resolveUriTarget(config, params, { requireFile: false });
  if (!target) {
    return { ok: true, action: "open", vaultRoot: config.vaultRoot };
  }

  if (truthy(params.append) && hasContent(params)) {
    return executeOperation(config, {
      operation: "append",
      path: target.relativePath,
      content: params.content,
      idempotencyKey: params.idempotencyKey
    });
  }

  if (truthy(params.prepend) && hasContent(params)) {
    return executeOperation(config, {
      operation: "prepend",
      path: target.relativePath,
      content: params.content,
      idempotencyKey: params.idempotencyKey
    });
  }

  const content = await readTextIfExists(target.absolutePath);
  return {
    ok: true,
    action: "open",
    path: target.relativePath,
    exists: content !== null,
    fragment: target.fragment || null,
    content: content ?? ""
  };
}

async function handleNew(config, params) {
  const target = resolveUriTarget(config, params, { requireFile: true });
  const content = readContentParam(params);

  if (truthy(params.prepend)) {
    return executeOperation(config, {
      operation: "prepend",
      path: target.relativePath,
      content,
      idempotencyKey: params.idempotencyKey
    });
  }

  if (truthy(params.append)) {
    return executeOperation(config, {
      operation: "append",
      path: target.relativePath,
      content,
      idempotencyKey: params.idempotencyKey
    });
  }

  return executeOperation(config, {
    operation: "create_markdown",
    path: target.relativePath,
    content,
    ifExists: truthy(params.overwrite) ? "overwrite" : "fail",
    idempotencyKey: params.idempotencyKey
  });
}

async function handleDaily(config, params) {
  if (truthy(params.appendByTime) && hasContent(params)) {
    return executeOperation(config, {
      operation: "append_daily_by_time",
      content: readContentParam(params),
      at: params.at,
      idempotencyKey: params.idempotencyKey
    });
  }

  const dailyPath = buildDailyPath(params.at || new Date(), config.dailyNote);
  const target = resolveVaultPath(config, dailyPath);
  const content = readContentParam(params, "");

  if (truthy(params.prepend)) {
    return executeOperation(config, {
      operation: "prepend",
      path: target.relativePath,
      content,
      idempotencyKey: params.idempotencyKey
    });
  }

  if (truthy(params.append)) {
    return executeOperation(config, {
      operation: "append",
      path: target.relativePath,
      content,
      idempotencyKey: params.idempotencyKey
    });
  }

  if (hasContent(params)) {
    return executeOperation(config, {
      operation: "create_markdown",
      path: target.relativePath,
      content,
      ifExists: truthy(params.overwrite) ? "overwrite" : "fail",
      idempotencyKey: params.idempotencyKey
    });
  }

  if (!(await exists(target.absolutePath))) {
    await executeOperation(config, {
      operation: "create_markdown",
      path: target.relativePath,
      content: "",
      ifExists: "fail",
      idempotencyKey: params.idempotencyKey
    });
  }

  const existing = await readTextIfExists(target.absolutePath);
  return {
    ok: true,
    action: "daily",
    path: target.relativePath,
    exists: true,
    content: existing ?? ""
  };
}

async function handleUnique(config, params) {
  const parts = getDateTimeParts(params.at || new Date(), config.dailyNote.timeZone);
  const folder = normalizeFolder(params.folder || DEFAULT_NEW_NOTE_DIR);
  const prefix = sanitizeFileName(params.prefix || "unique");
  const pathTemplate = `${folder}/${parts["yyyy-MM-dd"]}-${parts.HH}${parts.mm}-${prefix}.md`;
  const target = resolveVaultPath(config, pathTemplate);

  return executeOperation(config, {
    operation: "create_markdown",
    path: target.relativePath,
    content: readContentParam(params, ""),
    ifExists: "append_suffix",
    idempotencyKey: params.idempotencyKey
  });
}

async function handleSearch(config, params) {
  const query = typeof params.query === "string" ? params.query : "";
  const limit = Math.min(Number(params.limit || 50), 200);
  const results = [];

  for (const dir of config.allowedDirs) {
    const root = path.join(config.vaultRoot, dir);
    for await (const filePath of walkMarkdown(root)) {
      const relativePath = path.relative(config.vaultRoot, filePath).replaceAll(path.sep, "/");
      if (!(await canReadMarkdownForScan(filePath))) {
        continue;
      }
      if (!query) {
        results.push({ path: relativePath });
      } else {
        const content = await fs.readFile(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (lines[index].includes(query)) {
            results.push({ path: relativePath, line: index + 1, text: lines[index] });
            break;
          }
        }
      }

      if (results.length >= limit) {
        return { ok: true, action: "search", query, results };
      }
    }
  }

  return { ok: true, action: "search", query, results };
}

function resolveUriTarget(config, params, options) {
  let file = params.file || "";

  if (params.path) {
    file = absolutePathToVaultRelative(config, params.path);
  }

  if (!file && params.name) {
    file = `${DEFAULT_NEW_NOTE_DIR}/${params.name}`;
  }

  if (!file) {
    if (options.requireFile) {
      throw new Error("file, path, or name is required");
    }
    return null;
  }

  const { filePath, fragment } = splitFragment(file);
  const relativePath = ensureMarkdownExtension(filePath);
  const target = resolveVaultPath(config, relativePath);
  return { ...target, fragment };
}

function absolutePathToVaultRelative(config, inputPath) {
  const normalized = String(inputPath || "").replaceAll("\\", "/");
  const absolutePath = path.isAbsolute(normalized)
    ? path.resolve(normalized)
    : path.resolve(config.vaultRoot, normalized);
  const relativePath = path.relative(config.vaultRoot, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("URI path must be inside the configured vault root");
  }
  return relativePath.replaceAll(path.sep, "/");
}

async function canReadMarkdownForScan(filePath) {
  const stat = await statIfExists(filePath);
  return Boolean(stat?.isFile() && stat.size <= MAX_MARKDOWN_SCAN_BYTES);
}

function splitFragment(file) {
  const index = file.indexOf("#");
  if (index === -1) return { filePath: file, fragment: "" };
  return {
    filePath: file.slice(0, index),
    fragment: file.slice(index + 1)
  };
}

function ensureMarkdownExtension(file) {
  if (path.posix.extname(file)) return file;
  return `${file}.md`;
}

function readContentParam(params, fallback) {
  if (params.clipboard && !hasContent(params)) {
    throw new Error("clipboard is a desktop UI feature and is not available in headless mode");
  }
  if (!hasContent(params)) {
    return fallback ?? "";
  }
  return params.content;
}

function hasContent(params) {
  return Object.hasOwn(params, "content");
}

function truthy(value) {
  return value === "" || value === true || value === "true" || value === "1";
}

function normalizeFolder(value) {
  return String(value || DEFAULT_NEW_NOTE_DIR).replace(/^\/+|\/+$/g, "");
}

function sanitizeFileName(value) {
  return String(value).trim().replace(/[\\/:*?"<>|#^[\]]+/g, "-") || "unique";
}

function compactParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value));
}

async function readTextIfExists(filePath) {
  const stat = await statIfExists(filePath);
  if (!stat) return null;
  if (stat.isFile() && stat.size > MAX_MARKDOWN_READ_BYTES) {
    throw new Error(`Markdown file is too large to read: max ${MAX_MARKDOWN_READ_BYTES} bytes`);
  }
  return fs.readFile(filePath, "utf8");
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

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
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
