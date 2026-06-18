import fs from "node:fs/promises";
import path from "node:path";
import { encryptSecret } from "./secrets.js";

const DEFAULT_TIME_ZONE = "Asia/Shanghai";

const DEFAULT_DAILY_NOTE = {
  pathTemplate: "Daily/{{YYYY}}-{{MM}}-{{DD}}.md",
  templatePath: "",
  createIfMissing: true,
  headingLevel: 2,
  linePattern: "^\\[\\d{2}:\\d{2}\\]",
  lineFormat: "[{{HH:mm}}] {{content}}",
  blankLineBetweenEntries: true,
  sortEntriesByTime: true,
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
  audioDir: "Attachments/Audio",
  videoDir: "Attachments/Video",
  fileDir: "Attachments/Files",
  maxUploadBytes: 10 * 1024 * 1024
};

const DEFAULT_AI = {
  provider: "openai-compatible",
  apiMode: "chat-completions",
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
    includeDailyNotes: true,
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    excludePaths: [],
    output: {
      pathTemplate: "Reviews/Weekly/{{YYYY}}-W{{WW}}.md",
      heading: "Weekly Review",
      templatePath: ""
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
    includeDailyNotes: true,
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    excludePaths: [],
    output: {
      pathTemplate: "Reviews/Monthly/{{YYYY}}-{{MM}}.md",
      heading: "Monthly Review",
      templatePath: ""
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
    includeDailyNotes: true,
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    excludePaths: [],
    output: {
      pathTemplate: "Reviews/Quarterly/{{YYYY}}-Q{{Q}}.md",
      heading: "Quarterly Review",
      templatePath: ""
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
    includeDailyNotes: true,
    sourceDirs: ["Daily", "Inbox", "Notes", "Ideas", "Projects"],
    excludePaths: [],
    output: {
      pathTemplate: "Reviews/Yearly/{{YYYY}}.md",
      heading: "Yearly Review",
      templatePath: ""
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

const CONNECTOR_POLL_INTERVAL_MINUTES = [15, 30, 60, 120, 360, 720, 1440];

const DEFAULT_X_CONNECTOR_SOURCE = {
  id: "x",
  name: "X",
  enabled: false,
  platform: "x",
  baseUrl: "https://api.x.com/2",
  userId: "",
  username: "",
  bearerTokenEncrypted: "",
  includeReplies: true,
  includeRetweets: false,
  maxPostsPerRun: 50,
  output: {
    target: "heading",
    headingMarkdown: "## Twitter",
    lineFormat: "",
    contentTemplate: "{{text}}"
  }
};

const DEFAULT_STRAVA_CONNECTOR_SOURCE = {
  id: "strava",
  name: "Strava",
  enabled: false,
  platform: "strava",
  baseUrl: "https://www.strava.com/api/v3",
  clientId: "",
  redirectUri: "",
  clientSecretEncrypted: "",
  refreshTokenEncrypted: "",
  accessTokenEncrypted: "",
  authorizationCodeEncrypted: "",
  accessTokenExpiresAt: 0,
  scope: "",
  maxActivitiesPerRun: 10,
  requestDelayMs: 1000,
  minMovingTimeMinutes: 5,
  output: {
    headingMarkdown: "## 今日运动",
    insertAfterHeadingMarkdown: ""
  }
};

const DEFAULT_CONNECTORS = {
  enabled: false,
  schedule: { intervalMinutes: 1440 },
  sources: []
};

export const DEFAULT_APPLE_HEALTH_WORKOUT_TEMPLATE =
  "[{{time}}] {{#name}}{{name}}，{{/name}}{{type}}{{#duration}}，运动时间 {{duration}}{{/duration}}{{#totalDuration}}，总耗时 {{totalDuration}}{{/totalDuration}}{{#avgHeartRate}}，平均心率 {{avgHeartRate}} bpm{{/avgHeartRate}}{{#maxHeartRate}}，最大心率 {{maxHeartRate}} bpm{{/maxHeartRate}}{{#distance}}，总里程 {{distance}} km{{/distance}}{{#avgPace}}，配速 {{avgPace}}{{/avgPace}}{{#elevationGain}}，累计爬升 {{elevationGain}} m{{/elevationGain}}{{#avgSpeed}}，平均速度 {{avgSpeed}} km/h{{/avgSpeed}}{{#maxSpeed}}，最大速度 {{maxSpeed}} km/h{{/maxSpeed}}{{#calories}}，卡路里 {{calories}} kcal{{/calories}}{{#device}}，[[{{device}}]]{{/device}}。";

export const DEFAULT_APPLE_HEALTH_SLEEP_TEMPLATE =
  "[{{wakeTime}}] 睡眠 {{asleep}}{{#inBed}}（卧床{{inBed}}）{{/inBed}}{{#stages}}｜{{stages}}{{/stages}}{{#vitals}}｜{{vitals}}{{/vitals}}";

export const DEFAULT_APPLE_HEALTH_WEATHER_TEMPLATE =
  "[{{time}}]{{#icon}} {{icon}}{{/icon}}{{#temp}} {{temp}}°{{/temp}}{{#condition}} {{condition}}{{/condition}}{{#feelsLike}}，体感 {{feelsLike}}°{{/feelsLike}}{{#humidity}}，湿度 {{humidity}}%{{/humidity}}{{#windSpeed}}，风 {{windSpeed}} km/h{{/windSpeed}}{{#uvIndex}}，紫外线 {{uvIndex}}{{/uvIndex}}。";

const DEFAULT_APPLE_HEALTH = {
  enabled: false,
  sleep: {
    enabled: true,
    output: {
      target: "heading",
      headingMarkdown: "## 今日睡眠",
      insertAfterHeadingMarkdown: "",
      contentTemplate: DEFAULT_APPLE_HEALTH_SLEEP_TEMPLATE
    }
  },
  workouts: {
    enabled: true,
    minDurationMinutes: 0,
    output: {
      target: "heading",
      headingMarkdown: "## 今日运动",
      insertAfterHeadingMarkdown: "",
      contentTemplate: DEFAULT_APPLE_HEALTH_WORKOUT_TEMPLATE
    }
  },
  weather: {
    enabled: true,
    output: {
      target: "heading",
      headingMarkdown: "## 今日天气",
      insertAfterHeadingMarkdown: "",
      contentTemplate: DEFAULT_APPLE_HEALTH_WEATHER_TEMPLATE
    }
  }
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
    const inferredAllowedDirs = await listExistingTopLevelDirs(config.vaultRoot);
    if (inferredAllowedDirs.length > 0) {
      config.allowedDirs = inferredAllowedDirs;
    }
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
    allowedDirs: normalizeAllowedDirs(input.allowedDirs, previous.allowedDirs),
    includeRootMarkdownFiles: normalizeBoolean(input.includeRootMarkdownFiles, previous.includeRootMarkdownFiles ?? false),
    excludePaths: normalizeVaultRelativePathList(input.excludePaths, previous.excludePaths || []),
    maxJsonBodyBytes: normalizePositiveInteger(input.maxJsonBodyBytes, 1024 * 1024),
    attachments: normalizeAttachmentConfig(input.attachments),
    embedding: normalizeEmbeddingConfig(input.embedding, previous.embedding, serverConfig),
    ai: normalizeAiConfig(input.ai, previous.ai, serverConfig),
    connectors: normalizeConnectorsConfig(input.connectors, previous.connectors, serverConfig),
    appleHealth: normalizeAppleHealthConfig(input.appleHealth),
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
      sortEntriesByTime: normalizeBoolean(
        dailyNote.sortEntriesByTime,
        DEFAULT_DAILY_NOTE.sortEntriesByTime
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
    includeRootMarkdownFiles: Boolean(config.includeRootMarkdownFiles),
    excludePaths: config.excludePaths,
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
    connectors: publicConnectorsConfig(config.connectors),
    appleHealth: config.appleHealth,
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

async function listExistingTopLevelDirs(vaultRoot) {
  try {
    const entries = await fs.readdir(vaultRoot, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function normalizeAllowedDirs(value, fallback = []) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item).trim()).filter(Boolean)));
  }

  if (typeof value === "string") {
    return Array.from(new Set(value.split(",").map((item) => item.trim()).filter(Boolean)));
  }

  return Array.isArray(fallback) ? Array.from(new Set(fallback.map((item) => String(item).trim()).filter(Boolean))) : [];
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
    audioDir: normalizeVaultRelativeDir(source.audioDir, DEFAULT_ATTACHMENTS.audioDir),
    videoDir: normalizeVaultRelativeDir(source.videoDir, DEFAULT_ATTACHMENTS.videoDir),
    fileDir: normalizeVaultRelativeDir(source.fileDir, DEFAULT_ATTACHMENTS.fileDir),
    maxUploadBytes: normalizePositiveInteger(source.maxUploadBytes, DEFAULT_ATTACHMENTS.maxUploadBytes)
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
    apiMode: normalizeAiApiMode(source.apiMode, DEFAULT_AI.apiMode),
    baseUrl: normalizeString(source.baseUrl, DEFAULT_AI.baseUrl),
    model: typeof source.model === "string" ? source.model.trim() : DEFAULT_AI.model,
    temperature: normalizeNumber(source.temperature, DEFAULT_AI.temperature),
    maxOutputTokens: normalizePositiveInteger(source.maxOutputTokens, DEFAULT_AI.maxOutputTokens),
    apiKeyEncrypted
  };
}

function normalizeConnectorsConfig(input = {}, previous = {}, serverConfig) {
  const source = isPlainObject(input) ? input : {};
  const previousSource = isPlainObject(previous) ? previous : {};
  const scheduleFallback =
    previousSource.schedule?.intervalMinutes ??
    previousSource.x?.schedule?.intervalMinutes ??
    DEFAULT_CONNECTORS.schedule.intervalMinutes;
  const rawSources = Array.isArray(source.sources)
    ? source.sources
    : isPlainObject(source.x)
      ? [{ id: "x", name: "X", ...source.x }]
      : [];

  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_CONNECTORS.enabled),
    schedule: {
      intervalMinutes: normalizeConnectorPollIntervalMinutes(
        source.schedule?.intervalMinutes ??
          source.pollIntervalMinutes ??
          source.intervalMinutes ??
          source.x?.schedule?.intervalMinutes,
        scheduleFallback
      )
    },
    sources: normalizeConnectorSources(rawSources, previousSource, serverConfig)
  };
}

function normalizeConnectorSources(rawSources, previousConnectors, serverConfig) {
  const previousSources = Array.isArray(previousConnectors.sources)
    ? previousConnectors.sources
    : isPlainObject(previousConnectors.x)
      ? [{ id: "x", name: "X", ...previousConnectors.x }]
      : [];
  const previousById = new Map(previousSources.map((source) => [source.id, source]));
  const usedIds = new Set();
  const normalized = [];

  for (const [index, source] of rawSources.entries()) {
    if (!isPlainObject(source)) continue;
    const platform = normalizeConnectorPlatform(source.platform);
    const fallbackId = index === 0
      ? (platform === "strava" ? DEFAULT_STRAVA_CONNECTOR_SOURCE.id : DEFAULT_X_CONNECTOR_SOURCE.id)
      : `${platform}-${index + 1}`;
    const preferredId = normalizeId(source.id, fallbackId);
    const id = uniqueConnectorId(preferredId, usedIds);
    usedIds.add(id);
    const previous = previousById.get(id);
    normalized.push(
      platform === "strava"
        ? normalizeStravaConnectorSourceConfig({ ...source, id }, previous, serverConfig, index)
        : normalizeXConnectorSourceConfig({ ...source, id }, previous, serverConfig, index)
    );
  }

  return normalized;
}

function normalizeXConnectorSourceConfig(input = {}, previous = {}, serverConfig, index = 0) {
  const source = isPlainObject(input) ? input : {};
  const previousSource = isPlainObject(previous) ? previous : {};
  const output = isPlainObject(source.output) ? source.output : {};
  const fallbackOutput = DEFAULT_X_CONNECTOR_SOURCE.output;
  const token = normalizeOptionalString(
    source.bearerToken || source.apiToken || source.accessToken || "",
    ""
  );
  const clearToken = normalizeBoolean(source.clearBearerToken || source.clearApiToken, false);
  let bearerTokenEncrypted = clearToken
    ? ""
    : normalizeOptionalString(source.bearerTokenEncrypted || previousSource.bearerTokenEncrypted, "");

  if (token) {
    bearerTokenEncrypted = encryptSecret(token, serverConfig.appEncryptionKey);
  }

  return {
    id: normalizeId(source.id, index === 0 ? DEFAULT_X_CONNECTOR_SOURCE.id : `x-${index + 1}`),
    name: normalizeString(
      source.name,
      previousSource.name || (source.username ? `X @${normalizeXUsername(source.username)}` : DEFAULT_X_CONNECTOR_SOURCE.name)
    ),
    enabled: normalizeBoolean(source.enabled, DEFAULT_X_CONNECTOR_SOURCE.enabled),
    platform: "x",
    baseUrl: normalizeUrlBase(source.baseUrl, DEFAULT_X_CONNECTOR_SOURCE.baseUrl),
    userId: normalizeOptionalString(source.userId, ""),
    username: normalizeXUsername(source.username),
    bearerTokenEncrypted,
    includeReplies: normalizeBoolean(source.includeReplies, DEFAULT_X_CONNECTOR_SOURCE.includeReplies),
    includeRetweets: normalizeBoolean(source.includeRetweets, DEFAULT_X_CONNECTOR_SOURCE.includeRetweets),
    maxPostsPerRun: normalizeIntegerRange(
      source.maxPostsPerRun,
      5,
      100,
      DEFAULT_X_CONNECTOR_SOURCE.maxPostsPerRun
    ),
    output: {
      target: normalizeConnectorOutputTarget(output.target, fallbackOutput.target),
      headingMarkdown: normalizeHeadingMarkdown(output.headingMarkdown, fallbackOutput.headingMarkdown),
      lineFormat: normalizeOptionalString(output.lineFormat, fallbackOutput.lineFormat),
      contentTemplate: normalizeOptionalString(output.contentTemplate, fallbackOutput.contentTemplate)
    }
  };
}

function normalizeStravaConnectorSourceConfig(input = {}, previous = {}, serverConfig, index = 0) {
  const source = isPlainObject(input) ? input : {};
  const previousSource = isPlainObject(previous) ? previous : {};
  const output = isPlainObject(source.output) ? source.output : {};
  const fallbackOutput = DEFAULT_STRAVA_CONNECTOR_SOURCE.output;
  const clientSecret = normalizeOptionalString(source.clientSecret || "", "");
  const refreshToken = normalizeOptionalString(source.refreshToken || "", "");
  const accessToken = normalizeOptionalString(source.accessToken || "", "");
  const authorizationCode = normalizeOptionalString(source.authorizationCode || "", "");
  let clientSecretEncrypted = normalizeSecretField(
    clientSecret,
    source.clientSecretEncrypted || previousSource.clientSecretEncrypted,
    source.clearClientSecret,
    serverConfig
  );
  let refreshTokenEncrypted = normalizeSecretField(
    refreshToken,
    source.refreshTokenEncrypted || previousSource.refreshTokenEncrypted,
    source.clearRefreshToken,
    serverConfig
  );
  let accessTokenEncrypted = normalizeSecretField(
    accessToken,
    source.accessTokenEncrypted || previousSource.accessTokenEncrypted,
    source.clearAccessToken,
    serverConfig
  );
  let authorizationCodeEncrypted = normalizeSecretField(
    authorizationCode,
    source.authorizationCodeEncrypted || previousSource.authorizationCodeEncrypted,
    source.clearAuthorizationCode,
    serverConfig
  );
  return {
    id: normalizeId(source.id, index === 0 ? DEFAULT_STRAVA_CONNECTOR_SOURCE.id : `strava-${index + 1}`),
    name: normalizeString(source.name, previousSource.name || DEFAULT_STRAVA_CONNECTOR_SOURCE.name),
    enabled: normalizeBoolean(source.enabled, DEFAULT_STRAVA_CONNECTOR_SOURCE.enabled),
    platform: "strava",
    baseUrl: normalizeUrlBase(source.baseUrl, DEFAULT_STRAVA_CONNECTOR_SOURCE.baseUrl),
    clientId: normalizeOptionalString(source.clientId, previousSource.clientId || DEFAULT_STRAVA_CONNECTOR_SOURCE.clientId),
    redirectUri: normalizeString(
      source.redirectUri,
      previousSource.redirectUri || DEFAULT_STRAVA_CONNECTOR_SOURCE.redirectUri
    ),
    clientSecretEncrypted,
    refreshTokenEncrypted,
    accessTokenEncrypted,
    authorizationCodeEncrypted,
    accessTokenExpiresAt: normalizeNonNegativeInteger(
      source.accessTokenExpiresAt ?? previousSource.accessTokenExpiresAt,
      DEFAULT_STRAVA_CONNECTOR_SOURCE.accessTokenExpiresAt
    ),
    scope: normalizeOptionalString(source.scope, previousSource.scope || DEFAULT_STRAVA_CONNECTOR_SOURCE.scope),
    maxActivitiesPerRun: normalizeIntegerRange(
      source.maxActivitiesPerRun,
      1,
      30,
      previousSource.maxActivitiesPerRun || DEFAULT_STRAVA_CONNECTOR_SOURCE.maxActivitiesPerRun
    ),
    requestDelayMs: normalizeIntegerRange(
      source.requestDelayMs,
      0,
      30000,
      previousSource.requestDelayMs ?? DEFAULT_STRAVA_CONNECTOR_SOURCE.requestDelayMs
    ),
    minMovingTimeMinutes: normalizeIntegerRange(
      source.minMovingTimeMinutes,
      0,
      240,
      previousSource.minMovingTimeMinutes ?? DEFAULT_STRAVA_CONNECTOR_SOURCE.minMovingTimeMinutes
    ),
    output: {
      headingMarkdown: normalizeHeadingMarkdown(output.headingMarkdown, fallbackOutput.headingMarkdown),
      insertAfterHeadingMarkdown: normalizeHeadingMarkdown(
        output.insertAfterHeadingMarkdown,
        fallbackOutput.insertAfterHeadingMarkdown
      )
    }
  };
}

function normalizeAppleHealthConfig(input = {}) {
  const source = isPlainObject(input) ? input : {};
  const sleep = isPlainObject(source.sleep) ? source.sleep : {};
  const workouts = isPlainObject(source.workouts) ? source.workouts : {};
  const weather = isPlainObject(source.weather) ? source.weather : {};
  return {
    enabled: normalizeBoolean(source.enabled, DEFAULT_APPLE_HEALTH.enabled),
    sleep: {
      enabled: normalizeBoolean(sleep.enabled, DEFAULT_APPLE_HEALTH.sleep.enabled),
      output: normalizeAppleHealthOutput(sleep.output, DEFAULT_APPLE_HEALTH.sleep.output)
    },
    workouts: {
      enabled: normalizeBoolean(workouts.enabled, DEFAULT_APPLE_HEALTH.workouts.enabled),
      minDurationMinutes: normalizeIntegerRange(
        workouts.minDurationMinutes,
        0,
        240,
        DEFAULT_APPLE_HEALTH.workouts.minDurationMinutes
      ),
      output: normalizeAppleHealthOutput(workouts.output, DEFAULT_APPLE_HEALTH.workouts.output)
    },
    weather: {
      enabled: normalizeBoolean(weather.enabled, DEFAULT_APPLE_HEALTH.weather.enabled),
      output: normalizeAppleHealthOutput(weather.output, DEFAULT_APPLE_HEALTH.weather.output)
    }
  };
}

function normalizeAppleHealthOutput(output, fallback) {
  const source = isPlainObject(output) ? output : {};
  return {
    target: normalizeConnectorOutputTarget(source.target, fallback.target),
    headingMarkdown: normalizeHeadingMarkdown(source.headingMarkdown, fallback.headingMarkdown),
    insertAfterHeadingMarkdown: normalizeHeadingMarkdown(
      source.insertAfterHeadingMarkdown,
      fallback.insertAfterHeadingMarkdown
    ),
    // An empty template falls back to the default; trailing/leading whitespace
    // is trimmed since the entry is a single line.
    contentTemplate: normalizeString(source.contentTemplate, fallback.contentTemplate)
  };
}

function publicConnectorsConfig(config = {}) {
  return {
    enabled: Boolean(config.enabled),
    schedule: {
      intervalMinutes: normalizeConnectorPollIntervalMinutes(
        config.schedule?.intervalMinutes,
        DEFAULT_CONNECTORS.schedule.intervalMinutes
      )
    },
    sources: (Array.isArray(config.sources) ? config.sources : []).map(publicConnectorSourceConfig)
  };
}

function publicConnectorSourceConfig(source = {}) {
  const publicSource = { ...source };
  const bearerTokenSet = Boolean(publicSource.bearerTokenEncrypted);
  const clientSecretSet = Boolean(publicSource.clientSecretEncrypted);
  const refreshTokenSet = Boolean(publicSource.refreshTokenEncrypted);
  const accessTokenSet = Boolean(publicSource.accessTokenEncrypted);
  const authorizationCodeSet = Boolean(publicSource.authorizationCodeEncrypted);
  delete publicSource.bearerTokenEncrypted;
  delete publicSource.bearerToken;
  delete publicSource.apiToken;
  delete publicSource.accessToken;
  delete publicSource.clientSecretEncrypted;
  delete publicSource.clientSecret;
  delete publicSource.refreshTokenEncrypted;
  delete publicSource.refreshToken;
  delete publicSource.accessTokenEncrypted;
  delete publicSource.authorizationCodeEncrypted;
  delete publicSource.authorizationCode;
  return {
    ...publicSource,
    bearerTokenSet,
    clientSecretSet,
    refreshTokenSet,
    accessTokenSet,
    authorizationCodeSet
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
    includeDailyNotes: normalizeBoolean(task.includeDailyNotes, fallback.includeDailyNotes ?? true),
    sourceDirs: normalizeStringList(task.sourceDirs, fallback.sourceDirs),
    excludePaths: normalizeVaultRelativePathList(task.excludePaths, fallback.excludePaths || []),
    output: {
      pathTemplate: normalizeVaultRelativeTemplatePath(output.pathTemplate, fallback.output.pathTemplate),
      heading: normalizeString(output.heading, fallback.output.heading),
      templatePath: normalizeOptionalVaultRelativePath(output.templatePath || output.template || fallback.output.templatePath || "")
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

function normalizeAiApiMode(value, fallback) {
  if (value === "responses" || value === "chat-completions") return value;
  return fallback;
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

function normalizeOptionalString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeUrlBase(value, fallback) {
  const raw = normalizeString(value, fallback).replace(/\/+$/g, "");
  if (!/^https?:\/\//i.test(raw)) {
    throw new Error("Connector base URL must start with http:// or https://");
  }
  return raw;
}

function normalizeSecretField(plainText, encryptedFallback, clearValue, serverConfig) {
  if (normalizeBoolean(clearValue, false)) return "";
  const secret = normalizeOptionalString(plainText, "");
  if (secret) return encryptSecret(secret, serverConfig.appEncryptionKey);
  return normalizeOptionalString(encryptedFallback, "");
}

function normalizeConnectorPlatform(value) {
  return value === "strava" ? "strava" : "x";
}

function normalizeXUsername(value) {
  return normalizeOptionalString(value, "").replace(/^@+/, "");
}

function normalizeHeadingMarkdown(value, fallback) {
  const raw = normalizeString(value, fallback);
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
  if (match && match[2].trim()) return `${match[1]} ${match[2].trim()}`;
  if (!raw.trim()) return fallback;
  return raw.trim();
}

function normalizeConnectorOutputTarget(value, fallback) {
  return value === "time-slot" || value === "heading" ? value : fallback;
}

function normalizeConnectorPollIntervalMinutes(value, fallback) {
  const parsed = Number(value);
  return CONNECTOR_POLL_INTERVAL_MINUTES.includes(parsed) ? parsed : fallback;
}

function uniqueConnectorId(preferredId, usedIds) {
  if (!usedIds.has(preferredId)) return preferredId;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${preferredId}-${index}`;
    if (!usedIds.has(candidate)) return candidate;
  }
  throw new Error("Unable to generate a unique connector id");
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

function normalizeVaultRelativePathList(value, fallback = []) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n|,/)
      : fallback;
  const paths = [];
  const seen = new Set();
  for (const item of raw) {
    const rawPath = String(item || "").trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
    if (!rawPath) continue;
    if (path.isAbsolute(rawPath)) {
      throw new Error("Review exclude paths must be vault-relative paths");
    }
    const normalized = path.posix.normalize(rawPath);
    if (normalized === "." || normalized === ".." || normalized.startsWith("../")) {
      throw new Error("Review exclude paths cannot escape the vault root");
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    paths.push(normalized);
  }
  return paths;
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
