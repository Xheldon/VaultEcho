import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "./secrets.js";
import { buildDailyPath, renderTemplate } from "./time.js";
import { executeOperation } from "./vault.js";

const RUNS_FILE = "connector-runs.json";
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_X_BASE_URL = "https://api.x.com/2";
const X_FETCH_TIMEOUT_MS = 10 * 1000;
const X_FETCH_RETRY_DELAYS_MS = [1000, 3000];
const CONNECTOR_RETRY_DELAY_MS = 15 * 60 * 1000;
const CONNECTOR_RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONNECTOR_RUN_RECORDS = 500;
const CONNECTOR_POLL_INTERVAL_MINUTES = [15, 30, 60, 120, 360, 720, 1440];
let connectorRunsQueue = Promise.resolve();
let atomicWriteCounter = 0;

export function startConnectorScheduler(loadConfig) {
  let timer = null;
  let running = false;

  const schedule = async (delayMs = 0) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (running) {
        await schedule(60 * 1000);
        return;
      }
      running = true;
      try {
        const config = await loadConfig();
        const result = await runDueConnectors(config, new Date());
        if (result.results?.some((item) => item?.ok === false)) {
          await schedule(CONNECTOR_RETRY_DELAY_MS);
          return;
        }
        await scheduleNext(config, new Date());
      } catch (error) {
        console.warn(`Connector scheduler failed: ${error.message}`);
        await schedule(CONNECTOR_RETRY_DELAY_MS);
      } finally {
        running = false;
      }
    }, Math.max(0, Math.min(delayMs, MAX_TIMER_DELAY_MS)));
    timer.unref?.();
  };

  const scheduleNext = async (config, now) => {
    const next = nextConnectorRunAt(config, now);
    if (!next) {
      await schedule(6 * 60 * 60 * 1000);
      return;
    }
    await schedule(next.getTime() - now.getTime() + 1000);
  };

  schedule(0).catch((error) => console.warn(`Connector scheduler failed: ${error.message}`));

  return {
    reschedule() {
      schedule(0).catch((error) => console.warn(`Connector scheduler failed: ${error.message}`));
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

export async function getConnectorStatus(config, now = new Date()) {
  const runs = await readConnectorRuns(config);
  const sources = connectorSources(config);
  return {
    ok: true,
    operation: "connectors/status",
    enabled: Boolean(config.connectors?.enabled),
    timeZone: config.timeZone,
    connectors: sources.map((source) => {
      const scheduled = Boolean(config.connectors?.enabled && source.enabled);
      return {
        id: source.id,
        name: source.name || source.id,
        platform: source.platform,
        enabled: Boolean(source.enabled),
        scheduled,
        nextRunAt: scheduled ? nextOccurrenceForConnector(config.connectors, now, config.timeZone)?.toISOString() || "" : "",
        lastRun: latestRunForConnector(runs, source.id)
      };
    })
  };
}

export async function runDueConnectors(config, now = new Date()) {
  if (!config.connectors?.enabled) return { ok: true, operation: "connectors/run-due", results: [] };
  const sources = connectorSources(config).filter((source) => source.enabled);
  if (!sources.length) return { ok: true, operation: "connectors/run-due", results: [] };
  const runs = await readConnectorRuns(config);
  const occurrence = previousOccurrenceForConnector(config.connectors, now, config.timeZone);
  if (!occurrence || occurrence > now) return { ok: true, operation: "connectors/run-due", results: [] };

  const day = localDayKey(occurrence, config.timeZone);
  const results = [];

  for (const source of sources) {
    const runKey = scheduledRunKey(source.id, occurrence, config.timeZone);
    if (runs.runs[runKey]?.ok) continue;

    try {
      const result = await runConnector(config, source.id, {
        now,
        targetDate: occurrence,
        recordRun: false
      });
      await writeConnectorRun(config, runKey, {
        connectorId: source.id,
        connectorName: source.name || source.id,
        platform: source.platform,
        day,
        ok: true,
        manual: false,
        postsFound: result.postsFound,
        postsWritten: result.postsWritten,
        postsSkipped: result.postsSkipped,
        path: result.path,
        ranAt: new Date().toISOString()
      });
      results.push(result);
    } catch (error) {
      await writeConnectorRun(config, runKey, {
        connectorId: source.id,
        connectorName: source.name || source.id,
        platform: source.platform,
        day,
        ok: false,
        manual: false,
        error: error.message,
        ranAt: new Date().toISOString()
      });
      results.push({ ok: false, connectorId: source.id, platform: source.platform, error: error.message });
    }
  }

  return { ok: true, operation: "connectors/run-due", results };
}

export async function runConnector(config, connectorId = "x", options = {}) {
  const connector = findConnectorSource(config, connectorId);
  if (!connector) {
    throw new Error(`Connector not found: ${connectorId || "x"}`);
  }
  if (connector.platform !== "x") {
    throw new Error(`Unsupported connector platform: ${connector.platform}`);
  }
  if (!connector.enabled) {
    throw new Error(`Connector is not enabled: ${connector.id}`);
  }

  const runAt = options.runAt || new Date();
  const targetDate = options.targetDate || options.now || runAt;
  const day = localDayKey(targetDate, config.timeZone);
  const shouldRecordRun = options.recordRun !== false;

  try {
    const result = await runXConnector(config, connector, {
      now: options.now || runAt,
      targetDate,
      day
    });
    if (shouldRecordRun) {
      await writeConnectorRun(config, manualRunKey(connector.id, day, runAt), {
        connectorId: connector.id,
        connectorName: connector.name || connector.id,
        platform: connector.platform,
        day,
        ok: true,
        manual: true,
        postsFound: result.postsFound,
        postsWritten: result.postsWritten,
        postsSkipped: result.postsSkipped,
        path: result.path,
        ranAt: runAt.toISOString()
      });
    }
    return result;
  } catch (error) {
    if (shouldRecordRun) {
      await writeConnectorRun(config, manualRunKey(connector.id, day, runAt), {
        connectorId: connector.id,
        connectorName: connector.name || connector.id,
        platform: connector.platform,
        day,
        ok: false,
        manual: true,
        error: error.message,
        ranAt: runAt.toISOString()
      });
    }
    throw error;
  }
}

export function nextConnectorRunAt(config, now = new Date()) {
  const hasEnabledSource = connectorSources(config).some((source) => source.enabled);
  if (!config.connectors?.enabled || !hasEnabledSource) return null;
  return nextOccurrenceForConnector(config.connectors, now, config.timeZone);
}

function connectorSources(config) {
  const sources = Array.isArray(config.connectors?.sources) ? config.connectors.sources : [];
  if (sources.length) return sources.filter((source) => source?.id && source?.platform);
  const legacyX = config.connectors?.x;
  if (legacyX) return [{ id: "x", name: "X", platform: "x", ...legacyX }];
  return [];
}

function findConnectorSource(config, connectorId) {
  const sources = connectorSources(config);
  const requestedId = String(connectorId || "").trim();
  if (!requestedId && sources.length === 1) return sources[0];
  const normalizedId = requestedId || "x";
  return sources.find((source) => source.id === normalizedId) || null;
}

async function runXConnector(config, x, options) {
  const bearerToken = readXBearerToken(config, x);
  if (!bearerToken) {
    throw new Error("X connector token is not configured");
  }

  const account = await resolveXAccount(x, bearerToken);
  const window = dayWindow(options.targetDate, options.now, config.timeZone);
  const posts = await fetchXPostsForDay(x, bearerToken, account.userId, window);
  const outputTarget = x.output?.target === "time-slot" ? "time-slot" : "heading";
  const heading = outputTarget === "heading"
    ? parseHeadingMarkdown(x.output?.headingMarkdown, config.dailyNote.headingLevel)
    : null;
  const contentTemplate = x.output?.contentTemplate || "{{text}}";
  const lineFormat = x.output?.lineFormat || config.dailyNote.lineFormat;
  const results = [];
  const entries = posts
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))
    .map((post) => {
      const vars = postTemplateVars(post, account.username);
      const content = renderTemplate(contentTemplate, vars).trim() || vars.text || vars.url;
      return {
        post,
        content,
        dailyPath: buildDailyPath(post.created_at, config.dailyNote, content)
      };
    });
  const missingDailyPaths = await missingVaultPathsAtStart(config, entries.map((entry) => entry.dailyPath));

  for (const { post, content, dailyPath } of entries) {
    const result = await executeOperation(config, {
      operation: "append_daily_by_time",
      at: post.created_at,
      heading: heading?.heading,
      headingLevel: heading?.headingLevel,
      lineFormat,
      content,
      idempotencyKey: xPostIdempotencyKey(x, post.id),
      forceReplayIdempotent: missingDailyPaths.has(dailyPath),
      replayIfResultMissing: true
    });
    results.push({
      id: post.id,
      createdAt: post.created_at,
      path: result.path,
      idempotent: Boolean(result.idempotent)
    });
  }

  const written = results.filter((item) => !item.idempotent);
  return {
    ok: true,
    operation: "connectors/run",
    connectorId: x.id,
    connectorName: x.name || x.id,
    platform: "x",
    day: window.day,
    path: written[written.length - 1]?.path || results[results.length - 1]?.path || "",
    postsFound: posts.length,
    postsWritten: written.length,
    postsSkipped: results.length - written.length,
    results
  };
}

async function resolveXAccount(x, bearerToken) {
  const userId = String(x.userId || "").trim();
  const username = normalizeUsername(x.username);
  if (userId) return { userId, username };
  if (!username) throw new Error("X connector requires either User ID or Username");

  const payload = await fetchXJson(x, bearerToken, `/users/by/username/${encodeURIComponent(username)}`, {
    "user.fields": "username"
  });
  const resolvedId = payload?.data?.id;
  if (!resolvedId) throw new Error(`X user not found: ${username}`);
  return {
    userId: String(resolvedId),
    username: payload.data.username || username
  };
}

async function fetchXPostsForDay(x, bearerToken, userId, window) {
  const posts = [];
  let nextToken = "";
  const maxPosts = Math.max(5, Math.min(Number(x.maxPostsPerRun) || 50, 100));

  while (posts.length < maxPosts) {
    const pageSize = Math.max(5, Math.min(maxPosts - posts.length, 100));
    const params = {
      start_time: window.start.toISOString(),
      end_time: window.end.toISOString(),
      max_results: String(pageSize),
      "tweet.fields": "created_at,note_tweet,referenced_tweets,edit_history_tweet_ids"
    };
    const exclude = [];
    if (!x.includeRetweets) exclude.push("retweets");
    if (!x.includeReplies) exclude.push("replies");
    if (exclude.length) params.exclude = exclude.join(",");
    if (nextToken) params.pagination_token = nextToken;

    const payload = await fetchXJson(x, bearerToken, `/users/${encodeURIComponent(userId)}/tweets`, params);
    for (const post of Array.isArray(payload.data) ? payload.data : []) {
      if (!post?.id || !post.created_at) continue;
      const createdAt = new Date(post.created_at);
      if (createdAt >= window.start && createdAt < window.dayEnd) {
        posts.push(post);
      }
    }
    nextToken = payload.meta?.next_token || "";
    if (!nextToken || !payload.data?.length) break;
  }

  return posts.slice(0, maxPosts);
}

async function fetchXJson(x, bearerToken, route, params = {}) {
  const baseUrl = String(x.baseUrl || DEFAULT_X_BASE_URL).replace(/\/+$/g, "");
  const url = new URL(`${baseUrl}${route}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchXResponse(url, bearerToken);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`X API failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  return response.json();
}

async function fetchXResponse(url, bearerToken) {
  let lastError;
  for (let attempt = 0; attempt <= X_FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), X_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${bearerToken}`,
          "Accept": "application/json"
        }
      });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < X_FETCH_RETRY_DELAYS_MS.length) {
        await sleep(X_FETCH_RETRY_DELAYS_MS[attempt]);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`X API request failed: GET ${redactUrl(url)}: ${formatFetchError(lastError)}`);
}

function readXBearerToken(config, x) {
  if (x.bearerToken) return x.bearerToken;
  if (x.apiToken) return x.apiToken;
  if (x.accessToken) return x.accessToken;
  if (!x.bearerTokenEncrypted) return "";
  return decryptSecret(x.bearerTokenEncrypted, config.appEncryptionKey);
}

function postTemplateVars(post, username) {
  const text = String(post.note_tweet?.text || post.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  const normalizedUsername = normalizeUsername(username);
  const url = normalizedUsername
    ? `https://x.com/${normalizedUsername}/status/${post.id}`
    : `https://x.com/i/web/status/${post.id}`;
  return {
    id: post.id,
    text,
    url,
    username: normalizedUsername,
    created_at: post.created_at,
    createdAt: post.created_at
  };
}

function xPostIdempotencyKey(x, postId) {
  return x.id === "x" ? `x-post-${postId}` : `x-post-${x.id}-${postId}`;
}

function parseHeadingMarkdown(value, fallbackLevel) {
  const raw = String(value || "## Twitter").trim();
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
  if (match) {
    return {
      headingLevel: match[1].length,
      heading: match[2].trim()
    };
  }
  return {
    headingLevel: fallbackLevel || 2,
    heading: raw || "Twitter"
  };
}

function nextOccurrenceForConnector(connector, now, timeZone) {
  const parts = localDateTimeParts(now, timeZone);
  const intervalMinutes = connectorPollIntervalMinutes(connector);
  const nextMinutes = Math.floor(minutesOfDay(parts) / intervalMinutes + 1) * intervalMinutes;
  const localOccurrence = localDayStartPlusMinutes(parts, nextMinutes);
  return zonedDateTimeToUtc(localOccurrence, timeZone);
}

function previousOccurrenceForConnector(connector, now, timeZone) {
  const parts = localDateTimeParts(now, timeZone);
  const intervalMinutes = connectorPollIntervalMinutes(connector);
  const previousMinutes = Math.floor(minutesOfDay(parts) / intervalMinutes) * intervalMinutes;
  const localOccurrence = localDayStartPlusMinutes(parts, previousMinutes);
  return zonedDateTimeToUtc(localOccurrence, timeZone);
}

function dayWindow(targetDate, now, timeZone) {
  const parts = localDateTimeParts(targetDate || now || new Date(), timeZone);
  const nextDay = addLocalDays(parts, 1);
  const start = zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone);
  const dayEnd = zonedDateTimeToUtc({ ...nextDay, hour: 0, minute: 0, second: 0 }, timeZone);
  const effectiveNow = now instanceof Date ? now : new Date(now || Date.now());
  const endMs = Math.min(Math.max(effectiveNow.getTime(), start.getTime() + 1000), dayEnd.getTime());

  return {
    day: dateLabel(parts),
    start,
    end: new Date(endMs),
    dayEnd
  };
}

function localDayKey(date, timeZone) {
  return dateLabel(localDateTimeParts(date, timeZone));
}

function localDateTimeParts(date, timeZone) {
  const input = date instanceof Date ? date : new Date(date || Date.now());
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(input).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function zonedDateTimeToUtc(parts, timeZone) {
  const targetMs = wallClockMs(parts);
  let utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = localDateTimeParts(utc, timeZone);
    const diff = targetMs - wallClockMs(current);
    if (diff === 0) return utc;
    utc = new Date(utc.getTime() + diff);
  }
  return utc;
}

function wallClockMs(parts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
}

function localDayStartPlusMinutes(parts, minutes) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, minutes, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: date.getUTCHours(),
    minute: date.getUTCMinutes(),
    second: 0
  };
}

function minutesOfDay(parts) {
  return (parts.hour || 0) * 60 + (parts.minute || 0);
}

function connectorPollIntervalMinutes(connector) {
  const parsed = Number(connector?.schedule?.intervalMinutes);
  return CONNECTOR_POLL_INTERVAL_MINUTES.includes(parsed) ? parsed : 1440;
}

function addLocalDays(parts, days) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function dateLabel(parts) {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@+/, "");
}

async function missingVaultPathsAtStart(config, relativePaths) {
  const missing = new Set();
  for (const relativePath of new Set(relativePaths)) {
    const absolutePath = path.resolve(config.vaultRoot, relativePath);
    const relativeFromRoot = path.relative(config.vaultRoot, absolutePath);
    if (relativeFromRoot.startsWith("..") || path.isAbsolute(relativeFromRoot)) continue;
    try {
      await fs.access(absolutePath);
    } catch (error) {
      if (error.code === "ENOENT") {
        missing.add(relativePath);
        continue;
      }
      throw error;
    }
  }
  return missing;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

async function readConnectorRuns(config) {
  const filePath = connectorRunsPath(config);
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { runs: {} };
    throw error;
  }

  try {
    const payload = JSON.parse(raw);
    return { runs: payload.runs && typeof payload.runs === "object" ? payload.runs : {} };
  } catch (error) {
    if (error instanceof SyntaxError) {
      await quarantineConnectorRunsFile(filePath, error);
      return { runs: {} };
    }
    throw error;
  }
}

async function writeConnectorRun(config, key, record) {
  const task = connectorRunsQueue.catch(() => {}).then(async () => {
    const runs = await readConnectorRuns(config);
    runs.runs[key] = record;
    runs.runs = pruneConnectorRuns(runs.runs);
    const filePath = connectorRunsPath(config);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await atomicWrite(filePath, `${JSON.stringify(runs, null, 2)}\n`);
    await cleanupConnectorRunArtifacts(config);
  });
  connectorRunsQueue = task.catch(() => {});
  await task;
}

function latestRunForConnector(runs, connectorId) {
  return Object.values(runs.runs || {})
    .filter((run) => run.connectorId === connectorId)
    .sort((left, right) => String(right.ranAt).localeCompare(String(left.ranAt)))[0] || null;
}

function pruneConnectorRuns(runs) {
  const now = Date.now();
  const entries = Object.entries(runs || {})
    .map(([key, value]) => ({ key, value, time: Date.parse(value?.ranAt || "") || 0 }))
    .sort((left, right) => right.time - left.time);
  const kept = entries
    .filter((entry, index) => index < MAX_CONNECTOR_RUN_RECORDS && entry.time && now - entry.time <= CONNECTOR_RUN_RETENTION_MS);
  return Object.fromEntries(kept.map((entry) => [entry.key, entry.value]));
}

async function cleanupConnectorRunArtifacts(config) {
  const dir = config.dataDir;
  const cutoff = Date.now() - CONNECTOR_RUN_RETENTION_MS;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const isRunArtifact =
      entry.name.startsWith(`${RUNS_FILE}.corrupt.`) ||
      (entry.name.startsWith(`${RUNS_FILE}.`) && entry.name.endsWith(".tmp"));
    if (!isRunArtifact) continue;
    const filePath = path.join(dir, entry.name);
    const stat = await fs.stat(filePath);
    if (stat.mtimeMs < cutoff) {
      await fs.unlink(filePath);
    }
  }
}

function manualRunKey(connectorId, day, runAt) {
  return `${connectorId}:${day}:manual:${runAt.toISOString()}`;
}

function scheduledRunKey(connectorId, occurrence, timeZone) {
  const parts = localDateTimeParts(occurrence, timeZone);
  return `${connectorId}:${dateLabel(parts)}:${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

function connectorRunsPath(config) {
  return path.join(config.dataDir, RUNS_FILE);
}

function formatFetchError(error) {
  if (error?.name === "AbortError") {
    return `request timed out after ${Math.round(X_FETCH_TIMEOUT_MS / 1000)}s`;
  }
  const parts = [error?.message || String(error)];
  const cause = error?.cause;
  if (cause) {
    const causeParts = [cause.code, cause.name, cause.message].filter(Boolean);
    if (causeParts.length) parts.push(`cause: ${causeParts.join(" - ")}`);
  }
  return parts.join("; ");
}

function redactUrl(url) {
  const safe = new URL(String(url));
  safe.searchParams.delete("pagination_token");
  return safe.toString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${++atomicWriteCounter}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}

async function quarantineConnectorRunsFile(filePath, parseError) {
  const backupPath = `${filePath}.corrupt.${process.pid}.${Date.now()}.${++atomicWriteCounter}`;
  try {
    await fs.rename(filePath, backupPath);
    console.warn(`Connector runs state is invalid and was moved to ${backupPath}: ${parseError.message}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
