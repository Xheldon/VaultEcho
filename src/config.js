import fs from "node:fs/promises";
import path from "node:path";
import { encryptSecret } from "./secrets.js";

const DEFAULT_ALLOWED_DIRS = [
  "Inbox",
  "Notes",
  "Ideas",
  "Projects",
  "Daily",
  "Templates",
  "Attachments",
  "Archive"
];

const DEFAULT_DAILY_NOTE = {
  pathTemplate: "Daily/{{yyyy-MM-dd}}.md",
  headingLevel: 2,
  linePattern: "^\\[\\d{2}:\\d{2}\\]",
  lineFormat: "[{{HH:mm}}] {{content}}",
  timeZone: "Asia/Shanghai",
  slots: [
    { heading: "上午", start: "05:00", end: "11:59" },
    { heading: "下午", start: "12:00", end: "17:59" },
    { heading: "晚上", start: "18:00", end: "04:59" }
  ]
};

const DEFAULT_EMBEDDING = {
  enabled: false,
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  dimensions: 0,
  batchSize: 16,
  maxChunkChars: 1600,
  searchLimit: 8,
  autoIndexAfterWrite: true,
  autoScanIntervalMinutes: 0
};

const DEFAULT_ATTACHMENTS = {
  imageDir: "Attachments/Images",
  audioDir: "Attachments/Audio"
};

export function loadServerConfig(env = process.env, cwd = process.cwd()) {
  const isContainerDefault = cwd === "/app";
  const defaultDataDir = isContainerDefault ? "/data" : path.join(cwd, "data");
  const defaultVaultRoot = isContainerDefault ? "/vault" : path.join(cwd, "vault");

  return {
    port: Number(env.PORT || 8787),
    bindHost: env.BIND_HOST || "127.0.0.1",
    apiToken: env.API_TOKEN || "",
    adminUsername: env.ADMIN_USERNAME || "admin",
    adminPassword: env.ADMIN_PASSWORD || "",
    appEncryptionKey: env.APP_ENCRYPTION_KEY || "",
    configPath: path.resolve(env.CONFIG_PATH || path.join(defaultDataDir, "config.json")),
    defaultDataDir,
    defaultVaultRoot
  };
}

export async function loadRuntimeConfig(serverConfig) {
  try {
    const raw = JSON.parse(await fs.readFile(serverConfig.configPath, "utf8"));
    return normalizeRuntimeConfig(raw, serverConfig);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const config = normalizeRuntimeConfig({}, serverConfig);
    await saveRuntimeConfig(serverConfig, config);
    return config;
  }
}

export async function saveRuntimeConfig(serverConfig, input) {
  const previous = await readRawRuntimeConfig(serverConfig);
  const config = normalizeRuntimeConfig(input, serverConfig, previous);
  await fs.mkdir(path.dirname(serverConfig.configPath), { recursive: true });
  await fs.writeFile(serverConfig.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

export function normalizeRuntimeConfig(input = {}, serverConfig, previous = {}) {
  const dailyNote = {
    ...DEFAULT_DAILY_NOTE,
    ...(isPlainObject(input.dailyNote) ? input.dailyNote : {})
  };

  const config = {
    vaultRoot: path.resolve(input.vaultRoot || serverConfig.defaultVaultRoot),
    dataDir: path.resolve(input.dataDir || serverConfig.defaultDataDir),
    allowedDirs: normalizeAllowedDirs(input.allowedDirs),
    maxJsonBodyBytes: normalizePositiveInteger(input.maxJsonBodyBytes, 1024 * 1024),
    attachments: normalizeAttachmentConfig(input.attachments),
    embedding: normalizeEmbeddingConfig(input.embedding, previous.embedding, serverConfig),
    dailyNote: {
      pathTemplate: normalizeString(dailyNote.pathTemplate, DEFAULT_DAILY_NOTE.pathTemplate),
      headingLevel: normalizePositiveInteger(dailyNote.headingLevel, 2),
      linePattern: normalizeString(dailyNote.linePattern, DEFAULT_DAILY_NOTE.linePattern),
      lineFormat: normalizeString(dailyNote.lineFormat, DEFAULT_DAILY_NOTE.lineFormat),
      timeZone: normalizeString(dailyNote.timeZone, DEFAULT_DAILY_NOTE.timeZone),
      slots: normalizeSlots(dailyNote.slots)
    }
  };

  Object.defineProperty(config, "appEncryptionKey", {
    value: serverConfig.appEncryptionKey,
    enumerable: false
  });

  return config;
}

export function publicRuntimeConfig(config) {
  const embedding = { ...(config.embedding || {}) };
  const apiKeySet = Boolean(embedding.apiKeyEncrypted);
  delete embedding.apiKeyEncrypted;

  return {
    vaultRoot: config.vaultRoot,
    dataDir: config.dataDir,
    allowedDirs: config.allowedDirs,
    maxJsonBodyBytes: config.maxJsonBodyBytes,
    attachments: config.attachments,
    embedding: {
      ...embedding,
      apiKeySet
    },
    dailyNote: config.dailyNote
  };
}

async function readRawRuntimeConfig(serverConfig) {
  try {
    return JSON.parse(await fs.readFile(serverConfig.configPath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

function normalizeAllowedDirs(value) {
  if (Array.isArray(value)) {
    const dirs = value.map((item) => String(item).trim()).filter(Boolean);
    return dirs.length > 0 ? dirs : DEFAULT_ALLOWED_DIRS;
  }

  if (typeof value === "string") {
    const dirs = value.split(",").map((item) => item.trim()).filter(Boolean);
    return dirs.length > 0 ? dirs : DEFAULT_ALLOWED_DIRS;
  }

  return DEFAULT_ALLOWED_DIRS;
}

function normalizeSlots(value) {
  const slots = Array.isArray(value) ? value : DEFAULT_DAILY_NOTE.slots;
  const normalized = slots
    .map((slot) => ({
      heading: normalizeString(slot?.heading, ""),
      start: normalizeString(slot?.start, ""),
      end: normalizeString(slot?.end, "")
    }))
    .filter((slot) => slot.heading && isTime(slot.start) && isTime(slot.end));

  return normalized.length > 0 ? normalized : DEFAULT_DAILY_NOTE.slots;
}

function normalizeAttachmentConfig(input = {}) {
  const source = isPlainObject(input) ? input : {};
  return {
    imageDir: normalizeVaultRelativeDir(source.imageDir, DEFAULT_ATTACHMENTS.imageDir),
    audioDir: normalizeVaultRelativeDir(source.audioDir, DEFAULT_ATTACHMENTS.audioDir)
  };
}

function normalizeEmbeddingConfig(input = {}, previous = {}, serverConfig) {
  const source = isPlainObject(input) ? input : {};
  const previousSource = isPlainObject(previous) ? previous : {};
  const apiKey = typeof source.apiKey === "string" ? source.apiKey.trim() : "";
  const clearApiKey = normalizeBoolean(source.clearApiKey, false);
  let apiKeyEncrypted = clearApiKey
    ? ""
    : normalizeString(source.apiKeyEncrypted || previousSource.apiKeyEncrypted, "");

  if (apiKey) {
    apiKeyEncrypted = encryptSecret(apiKey, serverConfig.appEncryptionKey);
  }

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_EMBEDDING.enabled),
    provider: normalizeString(source.provider, DEFAULT_EMBEDDING.provider),
    baseUrl: normalizeString(source.baseUrl, DEFAULT_EMBEDDING.baseUrl),
    model: typeof source.model === "string" ? source.model.trim() : DEFAULT_EMBEDDING.model,
    dimensions: normalizeNonNegativeInteger(source.dimensions, DEFAULT_EMBEDDING.dimensions),
    batchSize: normalizePositiveInteger(source.batchSize, DEFAULT_EMBEDDING.batchSize),
    maxChunkChars: normalizePositiveInteger(source.maxChunkChars, DEFAULT_EMBEDDING.maxChunkChars),
    searchLimit: normalizePositiveInteger(source.searchLimit, DEFAULT_EMBEDDING.searchLimit),
    autoIndexAfterWrite: normalizeBoolean(source.autoIndexAfterWrite, DEFAULT_EMBEDDING.autoIndexAfterWrite),
    autoScanIntervalMinutes: normalizeNonNegativeInteger(
      source.autoScanIntervalMinutes,
      DEFAULT_EMBEDDING.autoScanIntervalMinutes
    ),
    apiKeyEncrypted
  };
}

function normalizePositiveInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) return fallback;
  return number;
}

function normalizeNonNegativeInteger(value, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return fallback;
  return number;
}

function normalizeBoolean(value, fallback) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function normalizeString(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

function normalizeVaultRelativeDir(value, fallback) {
  const raw = normalizeString(value, fallback).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!raw || path.isAbsolute(raw)) {
    throw new Error("Attachment directory must be a vault-relative path");
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Attachment directory cannot escape the vault root");
  }
  return normalized;
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
