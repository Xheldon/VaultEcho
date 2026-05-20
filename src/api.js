import fs from "node:fs/promises";
import path from "node:path";
import { normalizeApiRoute } from "./api-spec.js";
import {
  applyFrontmatterFields,
  appendToHeading,
  getFrontmatterField,
  getHeadingContent,
  prependToHeading,
  replaceFrontmatterField,
  replaceHeadingContent,
  insertAfterLastMatchingLine
} from "./markdown.js";
import { executeObsidianUri } from "./obsidian-uri.js";
import { executeVaultScript } from "./vault-script.js";
import {
  MAX_MARKDOWN_PATCH_BYTES,
  MAX_MARKDOWN_READ_BYTES,
  MAX_MARKDOWN_SCAN_BYTES
} from "./limits.js";
import {
  clearEmbeddingIndexErrors,
  enqueueEmbeddingIndex,
  getEmbeddingIndexStatus,
  indexEmbeddingFile,
  rebuildEmbeddingIndex,
  searchEmbeddingIndex
} from "./embedding-index.js";
import { getConnectorStatus, runConnector } from "./connectors.js";
import { buildDailyPath, getDateTimeParts, renderTemplate } from "./time.js";
import { executeOperation, resolveVaultPath } from "./vault.js";
import { getReviewStatus, runReviewTask } from "./review-tasks.js";

const DEFAULT_FILE_DIR = "Inbox";
const MAX_BATCH_OPERATIONS = 50;
export const API_HANDLER_ROUTES = [
  "files/create",
  "files/read",
  "files/write",
  "files/append",
  "files/prepend",
  "files/delete",
  "files/list",
  "attachments/upload",
  "headings/read",
  "headings/append",
  "headings/prepend",
  "headings/replace",
  "headings/insert-after-last-matching-line",
  "frontmatter/get",
  "frontmatter/set",
  "daily/append-by-time",
  "daily/read",
  "search/simple",
  "search/semantic",
  "tags/list",
  "index/status",
  "index/errors/clear",
  "index/rebuild",
  "index/file",
  "reviews/status",
  "reviews/run",
  "connectors/status",
  "connectors/run",
  "batch",
  "uri/execute",
  "unsupported/active",
  "unsupported/commands"
];

export async function executeApiAction(config, route, input = {}) {
  const normalizedRoute = normalizeApiRoute(route);
  const script = input.script || "";
  const params = { ...input };
  delete params.script;

  const primary = await executePrimary(config, normalizedRoute, params);
  const scriptResults = await executeVaultScript(config, script, {
    route: normalizedRoute,
    path: primary?.path || "",
    content: contentOf(params),
    filename: params.filename || params.file || params.path || params.name || "",
    idempotencyKey: params.idempotencyKey || ""
  });
  if (!normalizedRoute.startsWith("index/") && normalizedRoute !== "search/semantic") {
    enqueueIndexFromResult(config, primary);
    for (const scriptResult of scriptResults) {
      enqueueIndexFromResult(config, scriptResult);
    }
  }

  return {
    ok: primary?.ok !== false,
    route: normalizedRoute,
    result: primary,
    script: scriptResults
  };
}

async function executePrimary(config, route, params) {
  switch (route) {
    case "files/create":
      return createFile(config, params);
    case "files/read":
      return readFile(config, params);
    case "files/write":
      return writeFile(config, params);
    case "files/append":
      return appendFile(config, params);
    case "files/prepend":
      return prependFile(config, params);
    case "files/delete":
      return deleteFile(config, params);
    case "files/list":
      return listFiles(config, params);
    case "attachments/upload":
      return unsupported("attachments/upload", "Use multipart/form-data against /v1/api/attachments/upload.");
    case "headings/read":
      return readHeading(config, params);
    case "headings/append":
      return patchHeading(config, params, "append");
    case "headings/prepend":
      return patchHeading(config, params, "prepend");
    case "headings/replace":
      return patchHeading(config, params, "replace");
    case "headings/insert-after-last-matching-line":
      return patchHeading(config, params, "insert-after-last-matching-line");
    case "frontmatter/get":
      return getFrontmatter(config, params);
    case "frontmatter/set":
      return setFrontmatter(config, params);
    case "daily/append-by-time":
      return appendDailyByTime(config, params);
    case "daily/read":
      return readDaily(config, params);
    case "search/simple":
      return searchSimple(config, params);
    case "search/semantic":
      return searchEmbeddingIndex(config, params);
    case "tags/list":
      return listTags(config);
    case "index/status":
      return getEmbeddingIndexStatus(config);
    case "index/errors/clear":
      return clearEmbeddingIndexErrors(config);
    case "index/rebuild":
      return rebuildEmbeddingIndex(config, { force: truthy(params.force) });
    case "index/file":
      return indexEmbeddingFile(config, normalizeApiFilePath(config, params));
    case "reviews/status":
      return getReviewStatus(config);
    case "reviews/run":
      return runReviewTask(config, params.taskId || params.id || params.task);
    case "connectors/status":
      return getConnectorStatus(config);
    case "connectors/run":
      return runConnector(config, params.connectorId || params.id || params.platform || "x");
    case "batch":
      return executeBatch(config, params);
    case "uri/execute":
      return executeObsidianUri(config, params);
    case "unsupported/active":
      return unsupported("active", "The active file is a desktop UI concept and is not available in headless mode.");
    case "unsupported/commands":
      return unsupported("commands", "Obsidian commands require a running desktop Obsidian workspace.");
    default:
      throw new Error(`Unsupported API route: ${route}`);
  }
}

function enqueueIndexFromResult(config, result) {
  if (!result) return;
  if (Array.isArray(result.results)) {
    for (const item of result.results) {
      enqueueIndexFromResult(config, item);
    }
    return;
  }
  if (typeof result.path === "string" && result.path.toLowerCase().endsWith(".md")) {
    enqueueEmbeddingIndex(config, result.path);
  }
}

async function createFile(config, params) {
  const filePath = normalizeApiFilePath(config, params);
  const content = await buildCreateContent(config, filePath, params);

  return executeOperation(config, {
    operation: "create_markdown",
    path: filePath,
    content,
    ifExists: params.ifExists || (truthy(params.overwrite) ? "overwrite" : "fail"),
    idempotencyKey: params.idempotencyKey
  });
}

async function readFile(config, params) {
  const target = resolveVaultPath(config, normalizeApiPath(config, params, { requireFile: true }));
  const content = await readTextIfExists(target.absolutePath, MAX_MARKDOWN_READ_BYTES);
  if (content === null) {
    return { ok: false, operation: "files/read", path: target.relativePath, error: "File not found" };
  }

  return { ok: true, operation: "files/read", path: target.relativePath, content };
}

async function writeFile(config, params) {
  const target = resolveVaultPath(config, normalizeApiFilePath(config, params));
  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
  await atomicWrite(target.absolutePath, ensureTrailingNewline(contentOf(params)));
  return { ok: true, operation: "files/write", path: target.relativePath };
}

async function appendFile(config, params) {
  return executeOperation(config, {
    operation: "append",
    path: normalizeApiFilePath(config, params),
    content: contentOf(params),
    idempotencyKey: params.idempotencyKey
  });
}

async function prependFile(config, params) {
  return executeOperation(config, {
    operation: "prepend",
    path: normalizeApiFilePath(config, params),
    content: contentOf(params),
    idempotencyKey: params.idempotencyKey
  });
}

async function deleteFile(config, params) {
  return executeOperation(config, {
    operation: "soft_delete",
    path: normalizeApiFilePath(config, params),
    idempotencyKey: params.idempotencyKey
  });
}

async function listFiles(config, params) {
  const targetPath = normalizeApiPath(config, params, { requireFile: false, defaultPath: "" });
  if (!targetPath) {
    const entries = [];
    for (const dir of config.allowedDirs) {
      const stat = await statIfExists(path.join(config.vaultRoot, dir));
      if (stat) {
        entries.push({ path: dir, type: stat.isDirectory() ? "directory" : "file" });
      }
    }
    return { ok: true, operation: "files/list", path: "", entries };
  }

  const target = targetPath
    ? resolveVaultPath(config, targetPath)
    : { relativePath: "", absolutePath: config.vaultRoot };
  const stat = await statIfExists(target.absolutePath);
  if (!stat) {
    return { ok: false, operation: "files/list", path: targetPath, error: "Path not found" };
  }

  if (stat.isFile()) {
    return { ok: true, operation: "files/list", path: target.relativePath, entries: [{ path: target.relativePath, type: "file" }] };
  }

  const entries = await fs.readdir(target.absolutePath, { withFileTypes: true });
  return {
    ok: true,
    operation: "files/list",
    path: target.relativePath,
    entries: entries.map((entry) => ({
      path: path.posix.join(target.relativePath, entry.name),
      type: entry.isDirectory() ? "directory" : "file"
    }))
  };
}

async function readHeading(config, params) {
  const target = resolveVaultPath(config, normalizeApiFilePath(config, params));
  const content = await readTextIfExists(target.absolutePath, MAX_MARKDOWN_READ_BYTES);
  if (content === null) {
    return { ok: false, operation: "headings/read", path: target.relativePath, error: "File not found" };
  }

  const heading = getHeadingContent(content, {
    heading: required(params.heading, "heading"),
    headingLevel: Number(params.headingLevel || 2)
  });

  if (heading === null) {
    return { ok: false, operation: "headings/read", path: target.relativePath, error: "Heading not found" };
  }

  return { ok: true, operation: "headings/read", path: target.relativePath, heading: params.heading, content: heading };
}

async function patchHeading(config, params, operation) {
  const target = resolveVaultPath(config, normalizeApiFilePath(config, params));
  await ensurePatchableMarkdownFile(target.absolutePath);
  const original = await readTextIfExists(target.absolutePath) ?? "";
  const options = {
    heading: required(params.heading, "heading"),
    headingLevel: Number(params.headingLevel || 2),
    linePattern: config.dailyNote.linePattern,
    content: contentOf(params),
    ifHeadingMissing: params.ifHeadingMissing || "create"
  };

  let next;
  if (operation === "append") next = appendToHeading(original, options);
  if (operation === "prepend") next = prependToHeading(original, options);
  if (operation === "replace") next = replaceHeadingContent(original, options);
  if (operation === "insert-after-last-matching-line") next = insertAfterLastMatchingLine(original, options);
  if (!next) throw new Error(`Unsupported heading operation: ${operation}`);

  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
  await atomicWrite(target.absolutePath, next);
  return { ok: true, operation: `headings/${operation}`, path: target.relativePath, heading: params.heading };
}

async function getFrontmatter(config, params) {
  const target = resolveVaultPath(config, normalizeApiFilePath(config, params));
  const content = await readTextIfExists(target.absolutePath, MAX_MARKDOWN_READ_BYTES);
  if (content === null) {
    return { ok: false, operation: "frontmatter/get", path: target.relativePath, error: "File not found" };
  }
  const key = required(params.key || params.field, "key");
  return { ok: true, operation: "frontmatter/get", path: target.relativePath, key, value: getFrontmatterField(content, key) };
}

async function setFrontmatter(config, params) {
  const target = resolveVaultPath(config, normalizeApiFilePath(config, params));
  await ensurePatchableMarkdownFile(target.absolutePath);
  const original = await readTextIfExists(target.absolutePath) ?? "";
  const key = required(params.key || params.field, "key");
  const value = params.value ?? contentOf(params);
  const next = replaceFrontmatterField(original, key, parseMaybeJson(value));
  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
  await atomicWrite(target.absolutePath, next);
  return { ok: true, operation: "frontmatter/set", path: target.relativePath, key };
}

async function appendDailyByTime(config, params) {
  return executeOperation(config, {
    operation: "append_daily_by_time",
    content: contentOf(params),
    at: params.at,
    createIfMissing: params.createIfMissing,
    templatePath: params.templatePath || params.template,
    idempotencyKey: params.idempotencyKey
  });
}

async function readDaily(config, params) {
  const dailyPath = buildDailyPath(params.at || new Date(), config.dailyNote);
  return readFile(config, { path: dailyPath });
}

async function searchSimple(config, params) {
  const query = params.query || contentOf(params);
  const limit = Math.min(Number(params.limit || 100), 500);
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
        const lineIndex = lines.findIndex((line) => line.includes(query));
        if (lineIndex !== -1) {
          results.push({ path: relativePath, line: lineIndex + 1, text: lines[lineIndex] });
        }
      }
      if (results.length >= limit) return { ok: true, operation: "search/simple", query, results };
    }
  }

  return { ok: true, operation: "search/simple", query, results };
}

async function listTags(config) {
  const counts = new Map();
  const tagPattern = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;

  for (const dir of config.allowedDirs) {
    const root = path.join(config.vaultRoot, dir);
    for await (const filePath of walkMarkdown(root)) {
      if (!(await canReadMarkdownForScan(filePath))) {
        continue;
      }
      const content = await fs.readFile(filePath, "utf8");
      for (const match of content.matchAll(tagPattern)) {
        const tag = `#${match[2]}`;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }
  }

  return {
    ok: true,
    operation: "tags/list",
    tags: Array.from(counts.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([tag, count]) => ({ tag, count }))
  };
}

async function canReadMarkdownForScan(filePath) {
  const stat = await statIfExists(filePath);
  return Boolean(stat?.isFile() && stat.size <= MAX_MARKDOWN_SCAN_BYTES);
}

async function ensurePatchableMarkdownFile(filePath) {
  const stat = await statIfExists(filePath);
  if (stat?.isFile() && stat.size > MAX_MARKDOWN_PATCH_BYTES) {
    throw new Error(`Markdown file is too large to patch: max ${MAX_MARKDOWN_PATCH_BYTES} bytes`);
  }
}

async function executeBatch(config, params) {
  const operations = params.operations || params.ops || [];
  if (!Array.isArray(operations)) {
    throw new Error("batch requires operations array");
  }
  if (operations.length > MAX_BATCH_OPERATIONS) {
    throw new Error(`batch can contain at most ${MAX_BATCH_OPERATIONS} operations`);
  }

  const results = [];
  for (const operation of operations) {
    const route = operation.route || operation.action || operation.op;
    if (!route) throw new Error("batch operation requires route, action, or op");
    const { route: _route, action: _action, op: _op, ...nestedParams } = operation;
    results.push(await executePrimary(config, normalizeApiRoute(route), nestedParams));
  }

  return { ok: true, operation: "batch", results };
}

function normalizeApiFilePath(config, params) {
  return ensureMarkdownExtension(normalizeApiPath(config, params, { requireFile: true }));
}

function normalizeApiPath(config, params, options) {
  const raw = params.filename || params.file || params.path || params.name || options.defaultPath;
  if (!raw && options.requireFile) {
    throw new Error("filename, file, path, or name is required");
  }
  if (!raw) return "";

  const file = String(raw).replace(/^\/+/, "");
  return hasAllowedTopLevel(config, file) ? file : path.posix.join(DEFAULT_FILE_DIR, file);
}

function hasAllowedTopLevel(config, file) {
  const [topLevel] = file.split("/");
  return config.allowedDirs.includes(topLevel);
}

function ensureMarkdownExtension(file) {
  if (path.posix.extname(file)) return file;
  return `${file}.md`;
}

function contentOf(params) {
  return params.content ?? params.text ?? "";
}

async function buildCreateContent(config, targetPath, params) {
  const body = contentOf(params);
  const templatePath = params.templatePath || params.template || "";
  const variables = buildCreateTemplateVariables(config, targetPath, params, body);

  let content = body;
  if (templatePath) {
    const templateContent = await readTemplate(config, templatePath);
    content = applyTemplateContent(templateContent, body, variables);
  }

  const yaml = parseYamlAttributes(params.yaml ?? params.frontmatter);
  if (yaml) {
    content = applyFrontmatterFields(content, yaml);
  }

  return content;
}

async function readTemplate(config, templatePath) {
  const target = resolveVaultReadPath(config, templatePath);
  const content = await readTextIfExists(target.absolutePath);
  if (content === null) {
    throw new Error(`Template not found: ${target.relativePath}`);
  }
  return content;
}

function applyTemplateContent(templateContent, body, variables) {
  const rendered = renderTemplate(templateContent, variables);
  if (templateContent.includes("{{content}}")) {
    return rendered;
  }
  if (!body) {
    return rendered;
  }
  return `${rendered.replace(/\n+$/g, "")}\n\n${body}`;
}

function buildCreateTemplateVariables(config, targetPath, params, body) {
  const now = getDateTimeParts(params.at || new Date(), config.dailyNote.timeZone);
  const parsed = path.posix.parse(targetPath);
  return {
    ...now,
    content: body,
    path: targetPath,
    title: params.title || parsed.name,
    name: parsed.name,
    basename: parsed.name,
    dir: parsed.dir,
    source: params.source || ""
  };
}

function parseYamlAttributes(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("yaml/frontmatter must be an object");
      }
      return parsed;
    } catch (error) {
      if (error.message === "yaml/frontmatter must be an object") throw error;
      throw new Error("yaml/frontmatter string must be valid JSON object");
    }
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("yaml/frontmatter must be an object");
  }
  return value;
}

function resolveVaultReadPath(config, inputPath) {
  if (!inputPath || typeof inputPath !== "string") {
    throw new Error("templatePath is required");
  }
  if (path.isAbsolute(inputPath)) {
    throw new Error("Template absolute paths are not allowed");
  }

  const relativePath = path.posix.normalize(inputPath.replaceAll("\\", "/"));
  if (relativePath === "." || relativePath.startsWith("../") || relativePath === "..") {
    throw new Error("Template path traversal is not allowed");
  }

  const absolutePath = path.resolve(config.vaultRoot, relativePath);
  const relativeFromRoot = path.relative(config.vaultRoot, absolutePath);
  if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) {
    throw new Error("Template path escapes vault root");
  }

  return { relativePath, absolutePath };
}

function required(value, name) {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${name} is required`);
  }
  return value;
}

function truthy(value) {
  return value === "" || value === true || value === "true" || value === "1";
}

function parseMaybeJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

async function readTextIfExists(filePath, maxBytes = 0) {
  const stat = await statIfExists(filePath);
  if (!stat) return null;
  if (stat.isFile() && maxBytes > 0 && stat.size > maxBytes) {
    throw new Error(`Markdown file is too large to read: max ${maxBytes} bytes`);
  }
  return fs.readFile(filePath, "utf8");
}

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
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

function unsupported(action, reason) {
  return { ok: false, action, supported: false, reason };
}
