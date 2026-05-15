import fs from "node:fs/promises";
import path from "node:path";
import { encryptSecret } from "./secrets.js";

const DEFAULT_ALLOWED_DIRS = [
  "Inbox",
  "Notes",
  "Ideas",
  "Projects",
  "Daily",
  "Reviews",
  "Templates",
  "Attachments",
  "Archive"
];

const DEFAULT_TIME_ZONE = "Asia/Shanghai";

const DEFAULT_DAILY_NOTE = {
  pathTemplate: "Daily/{{YYYY}}-{{MM}}-{{DD}}.md",
  templatePath: "",
  createIfMissing: true,
  headingLevel: 2,
  linePattern: "^\\[\\d{2}:\\d{2}\\]",
  lineFormat: "[{{HH:mm}}] {{content}}",
  blankLineBetweenEntries: true,
  timeZone: DEFAULT_TIME_ZONE,
  slots: [
    { heading: "Morning", start: "05:00", end: "11:59" },
    { heading: "Afternoon", start: "12:00", end: "17:59" },
    { heading: "Evening", start: "18:00", end: "04:59" }
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

const DEFAULT_AI = {
  provider: "openai-compatible",
  baseUrl: "https://api.openai.com/v1",
  model: "",
  temperature: 0.2,
  maxOutputTokens: 1600
};

const DEFAULT_REVIEW_TASKS = [
  {
    id: "weekly-review",
    enabled: false,
    name: "Weekly Review",
    period: "weekly",
    targetPeriod: "previous",
    schedule: { weekday: 1, time: "08:00" },
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    output: {
      pathTemplate: "Reviews/Weekly/{{YYYY}}-W{{WW}}.md",
      heading: "Weekly Review",
      writeMode: "replace_managed_block"
    },
    semanticRecall: {
      enabled: true,
      query: "",
      limit: 8,
      scopeDirs: ["Daily", "Notes", "Ideas", "Projects"]
    },
    prompt: defaultReviewPrompt("weekly")
  },
  {
    id: "monthly-review",
    enabled: false,
    name: "Monthly Review",
    period: "monthly",
    targetPeriod: "previous",
    schedule: { monthDay: 1, time: "08:00" },
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    output: {
      pathTemplate: "Reviews/Monthly/{{YYYY}}-{{MM}}.md",
      heading: "Monthly Review",
      writeMode: "replace_managed_block"
    },
    semanticRecall: {
      enabled: true,
      query: "",
      limit: 10,
      scopeDirs: ["Daily", "Notes", "Ideas", "Projects"]
    },
    prompt: defaultReviewPrompt("monthly")
  },
  {
    id: "quarterly-review",
    enabled: false,
    name: "Quarterly Review",
    period: "quarterly",
    targetPeriod: "previous",
    schedule: { quarterDayOffset: 1, time: "08:00" },
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    output: {
      pathTemplate: "Reviews/Quarterly/{{YYYY}}-Q{{Q}}.md",
      heading: "Quarterly Review",
      writeMode: "replace_managed_block"
    },
    semanticRecall: {
      enabled: true,
      query: "",
      limit: 12,
      scopeDirs: ["Daily", "Notes", "Ideas", "Projects"]
    },
    prompt: defaultReviewPrompt("quarterly")
  },
  {
    id: "yearly-review",
    enabled: false,
    name: "Yearly Review",
    period: "yearly",
    targetPeriod: "previous",
    schedule: { month: 1, monthDay: 1, time: "09:00" },
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    output: {
      pathTemplate: "Reviews/Yearly/{{YYYY}}.md",
      heading: "Yearly Review",
      writeMode: "replace_managed_block"
    },
    semanticRecall: {
      enabled: true,
      query: "",
      limit: 16,
      scopeDirs: ["Daily", "Notes", "Ideas", "Projects"]
    },
    prompt: defaultReviewPrompt("yearly")
  }
];

const DEFAULT_REVIEWS = {
  enabled: false,
  maxSourceChars: 60000,
  maxRecallChars: 16000,
  tasks: DEFAULT_REVIEW_TASKS
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
  const timeZone = normalizeString(input.timeZone || dailyNote.timeZone, DEFAULT_TIME_ZONE);

  const config = {
    vaultRoot: path.resolve(input.vaultRoot || serverConfig.defaultVaultRoot),
    dataDir: path.resolve(input.dataDir || serverConfig.defaultDataDir),
    timeZone,
    allowedDirs: normalizeAllowedDirs(input.allowedDirs),
    maxJsonBodyBytes: normalizePositiveInteger(input.maxJsonBodyBytes, 1024 * 1024),
    attachments: normalizeAttachmentConfig(input.attachments),
    embedding: normalizeEmbeddingConfig(input.embedding, previous.embedding, serverConfig),
    ai: normalizeAiConfig(input.ai, previous.ai, serverConfig),
    reviews: normalizeReviewsConfig(input.reviews),
    dailyNote: {
      pathTemplate: normalizeString(dailyNote.pathTemplate, DEFAULT_DAILY_NOTE.pathTemplate),
      templatePath: normalizeOptionalVaultRelativePath(dailyNote.templatePath || dailyNote.template || ""),
      createIfMissing: normalizeBoolean(dailyNote.createIfMissing, DEFAULT_DAILY_NOTE.createIfMissing),
      headingLevel: normalizeIntegerRange(dailyNote.headingLevel, 1, 6, DEFAULT_DAILY_NOTE.headingLevel),
      linePattern: normalizeString(dailyNote.linePattern, DEFAULT_DAILY_NOTE.linePattern),
      lineFormat: normalizeString(dailyNote.lineFormat, DEFAULT_DAILY_NOTE.lineFormat),
      blankLineBetweenEntries: normalizeBoolean(
        dailyNote.blankLineBetweenEntries,
        DEFAULT_DAILY_NOTE.blankLineBetweenEntries
      ),
      timeZone,
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
  const ai = { ...(config.ai || {}) };
  const aiApiKeySet = Boolean(ai.apiKeyEncrypted);
  delete ai.apiKeyEncrypted;

  return {
    vaultRoot: config.vaultRoot,
    dataDir: config.dataDir,
    timeZone: config.timeZone,
    allowedDirs: config.allowedDirs,
    maxJsonBodyBytes: config.maxJsonBodyBytes,
    attachments: config.attachments,
    embedding: {
      ...embedding,
      apiKeySet
    },
    ai: {
      ...ai,
      apiKeySet: aiApiKeySet
    },
    reviews: config.reviews,
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

  ensureSlotsDoNotOverlap(normalized);
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

function normalizeAiConfig(input = {}, previous = {}, serverConfig) {
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
    provider: normalizeString(source.provider, DEFAULT_AI.provider),
    baseUrl: normalizeString(source.baseUrl, DEFAULT_AI.baseUrl),
    model: typeof source.model === "string" ? source.model.trim() : DEFAULT_AI.model,
    temperature: normalizeNumber(source.temperature, DEFAULT_AI.temperature),
    maxOutputTokens: normalizePositiveInteger(source.maxOutputTokens, DEFAULT_AI.maxOutputTokens),
    apiKeyEncrypted
  };
}

function normalizeReviewsConfig(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const tasks = Array.isArray(source.tasks) ? source.tasks : DEFAULT_REVIEWS.tasks;
  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_REVIEWS.enabled),
    maxSourceChars: normalizePositiveInteger(source.maxSourceChars, DEFAULT_REVIEWS.maxSourceChars),
    maxRecallChars: normalizePositiveInteger(source.maxRecallChars, DEFAULT_REVIEWS.maxRecallChars),
    tasks: tasks.map((task, index) => normalizeReviewTask(task, index)).filter(Boolean)
  };
}

function normalizeReviewTask(task, index) {
  if (!isPlainObject(task)) return null;
  const fallback = DEFAULT_REVIEW_TASKS[index] || DEFAULT_REVIEW_TASKS[0];
  const period = ["weekly", "monthly", "quarterly", "yearly"].includes(task.period)
    ? task.period
    : fallback.period;
  const schedule = isPlainObject(task.schedule) ? task.schedule : {};
  const output = isPlainObject(task.output) ? task.output : {};
  const recall = isPlainObject(task.semanticRecall) ? task.semanticRecall : {};

  return {
    id: normalizeId(task.id, fallback.id),
    enabled: normalizeBoolean(task.enabled, fallback.enabled),
    name: normalizeString(task.name, fallback.name),
    period,
    targetPeriod: task.targetPeriod === "current" ? "current" : "previous",
    schedule: normalizeReviewSchedule(schedule, fallback.schedule, period),
    sourceDirs: normalizeStringList(task.sourceDirs, fallback.sourceDirs),
    output: {
      pathTemplate: normalizeVaultRelativeTemplatePath(output.pathTemplate, fallback.output.pathTemplate),
      heading: normalizeString(output.heading, fallback.output.heading),
      writeMode: output.writeMode === "append" ? "append" : "replace_managed_block"
    },
    semanticRecall: {
      enabled: normalizeBoolean(recall.enabled, fallback.semanticRecall.enabled),
      query: typeof recall.query === "string" ? recall.query.trim() : fallback.semanticRecall.query,
      limit: normalizeIntegerRange(recall.limit, 1, 50, fallback.semanticRecall.limit),
      scopeDirs: normalizeStringList(recall.scopeDirs, fallback.semanticRecall.scopeDirs)
    },
    prompt: normalizeString(task.prompt, fallback.prompt)
  };
}

function normalizeReviewSchedule(schedule, fallback, period) {
  return {
    time: isTime(schedule.time) ? schedule.time : fallback.time,
    weekday: normalizeIntegerRange(schedule.weekday, 0, 6, fallback.weekday ?? 1),
    monthDay: normalizeIntegerRange(schedule.monthDay, 1, 31, fallback.monthDay ?? 1),
    quarterDayOffset: normalizeIntegerRange(schedule.quarterDayOffset, 1, 31, fallback.quarterDayOffset ?? 1),
    month: normalizeIntegerRange(schedule.month, 1, 12, fallback.month ?? 1),
    period
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

function normalizeNumber(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return number;
}

function normalizeIntegerRange(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) return fallback;
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

function normalizeStringList(value, fallback) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : fallback;
  const items = raw.map((item) => String(item).trim()).filter(Boolean);
  return items.length > 0 ? Array.from(new Set(items)) : fallback;
}

function normalizeId(value, fallback) {
  const id = typeof value === "string" ? value.trim() : "";
  if (/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id)) return id;
  return fallback;
}

function normalizeVaultRelativeTemplatePath(value, fallback) {
  const raw = normalizeString(value, fallback).replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!raw || path.isAbsolute(raw)) {
    throw new Error("Review output path template must be a vault-relative path");
  }
  const firstSegment = raw.split("/")[0];
  if (firstSegment === "." || firstSegment === "..") {
    throw new Error("Review output path template cannot escape the vault root");
  }
  return raw;
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

function normalizeOptionalVaultRelativePath(value) {
  if (value === undefined || value === null || value === "") return "";
  const raw = String(value).trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!raw || path.isAbsolute(raw)) {
    throw new Error("Template path must be a vault-relative path");
  }
  const normalized = path.posix.normalize(raw);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Template path cannot escape the vault root");
  }
  return normalized;
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function ensureSlotsDoNotOverlap(slots) {
  const occupied = new Map();
  for (const slot of slots) {
    for (const minute of coveredMinutes(slot)) {
      const previous = occupied.get(minute);
      if (previous) {
        throw new Error(`Daily note time slots overlap: ${previous} and ${slot.heading}`);
      }
      occupied.set(minute, slot.heading);
    }
  }
}

function coveredMinutes(slot) {
  const start = parseMinutes(slot.start);
  const end = parseMinutes(slot.end);
  const minutes = [];
  let current = start;
  for (let count = 0; count < 1440; count += 1) {
    minutes.push(current);
    if (current === end) break;
    current = (current + 1) % 1440;
  }
  return minutes;
}

function parseMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function defaultReviewPrompt(period) {
  return [
    `You are helping review a personal Obsidian vault for a ${period} reflection.`,
    "Use the period source notes as the primary evidence.",
    "Use semantic recall only to find meaningful historical connections, not to distract from the current period.",
    "Write concise Markdown with these sections:",
    "1. Key themes",
    "2. Notable patterns or changes",
    "3. Open loops",
    "4. Questions worth thinking about next",
    "Avoid generic advice. Ground claims in the supplied notes."
  ].join("\n");
}
