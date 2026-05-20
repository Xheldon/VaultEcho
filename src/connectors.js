import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret } from "./secrets.js";
import { renderTemplate } from "./time.js";
import { executeOperation } from "./vault.js";

const RUNS_FILE = "connector-runs.json";
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_X_BASE_URL = "https://api.x.com/2";

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
        await runDueConnectors(config, new Date());
        await scheduleNext(config, new Date());
      } catch (error) {
        console.warn(`Connector scheduler failed: ${error.message}`);
        await schedule(15 * 60 * 1000);
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
  const x = config.connectors?.x || {};
  const scheduled = Boolean(config.connectors?.enabled && x.enabled);
  return {
    ok: true,
    operation: "connectors/status",
    enabled: Boolean(config.connectors?.enabled),
    timeZone: config.timeZone,
    connectors: [
      {
        id: "x",
        platform: "x",
        enabled: Boolean(x.enabled),
        scheduled,
        nextRunAt: scheduled ? nextOccurrenceForConnector(x, now, config.timeZone)?.toISOString() || "" : "",
        lastRun: latestRunForConnector(runs, "x")
      }
    ]
  };
}

export async function runDueConnectors(config, now = new Date()) {
  if (!config.connectors?.enabled) return { ok: true, operation: "connectors/run-due", results: [] };
  const x = config.connectors?.x;
  if (!x?.enabled) return { ok: true, operation: "connectors/run-due", results: [] };

  const runs = await readConnectorRuns(config);
  const occurrence = previousOccurrenceForConnector(x, now, config.timeZone);
  if (!occurrence || occurrence > now) return { ok: true, operation: "connectors/run-due", results: [] };

  const day = localDayKey(occurrence, config.timeZone);
  const runKey = `x:${day}`;
  if (runs.runs[runKey]) return { ok: true, operation: "connectors/run-due", results: [] };

  try {
    const result = await runConnector(config, "x", {
      now,
      targetDate: occurrence,
      recordRun: false
    });
    await writeConnectorRun(config, runKey, {
      connectorId: "x",
      platform: "x",
      day,
      ok: true,
      manual: false,
      postsFound: result.postsFound,
      postsWritten: result.postsWritten,
      postsSkipped: result.postsSkipped,
      path: result.path,
      ranAt: new Date().toISOString()
    });
    return { ok: true, operation: "connectors/run-due", results: [result] };
  } catch (error) {
    await writeConnectorRun(config, runKey, {
      connectorId: "x",
      platform: "x",
      day,
      ok: false,
      manual: false,
      error: error.message,
      ranAt: new Date().toISOString()
    });
    return { ok: true, operation: "connectors/run-due", results: [{ ok: false, connectorId: "x", error: error.message }] };
  }
}

export async function runConnector(config, connectorId = "x", options = {}) {
  const normalizedId = String(connectorId || "x").trim().toLowerCase();
  if (normalizedId !== "x") throw new Error(`Unsupported connector: ${connectorId}`);
  const x = config.connectors?.x;
  if (!x?.enabled) {
    throw new Error("X connector is not enabled");
  }

  const runAt = options.runAt || new Date();
  const targetDate = options.targetDate || options.now || runAt;
  const day = localDayKey(targetDate, config.timeZone);
  const shouldRecordRun = options.recordRun !== false;

  try {
    const result = await runXConnector(config, x, {
      now: options.now || runAt,
      targetDate,
      day
    });
    if (shouldRecordRun) {
      await writeConnectorRun(config, manualRunKey("x", day, runAt), {
        connectorId: "x",
        platform: "x",
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
      await writeConnectorRun(config, manualRunKey("x", day, runAt), {
        connectorId: "x",
        platform: "x",
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
  const x = config.connectors?.x;
  if (!config.connectors?.enabled || !x?.enabled) return null;
  return nextOccurrenceForConnector(x, now, config.timeZone);
}

async function runXConnector(config, x, options) {
  const bearerToken = readXBearerToken(config, x);
  if (!bearerToken) {
    throw new Error("X connector token is not configured");
  }

  const account = await resolveXAccount(x, bearerToken);
  const window = dayWindow(options.targetDate, options.now, config.timeZone);
  const posts = await fetchXPostsForDay(x, bearerToken, account.userId, window);
  const heading = parseHeadingMarkdown(x.output?.headingMarkdown, config.dailyNote.headingLevel);
  const contentTemplate = x.output?.contentTemplate || "{{text}}";
  const lineFormat = x.output?.lineFormat || config.dailyNote.lineFormat;
  const results = [];

  for (const post of posts.sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)))) {
    const vars = postTemplateVars(post, account.username);
    const content = renderTemplate(contentTemplate, vars).trim() || vars.text || vars.url;
    const result = await executeOperation(config, {
      operation: "append_daily_by_time",
      at: post.created_at,
      heading: heading.heading,
      headingLevel: heading.headingLevel,
      lineFormat,
      content,
      idempotencyKey: `x-post-${post.id}`
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
    connectorId: "x",
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

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${bearerToken}`,
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`X API failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  return response.json();
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
  const today = occurrenceForLocalDay(parts, connector.schedule?.time, timeZone);
  if (today > now) return today;
  return occurrenceForLocalDay(addLocalDays(parts, 1), connector.schedule?.time, timeZone);
}

function previousOccurrenceForConnector(connector, now, timeZone) {
  const parts = localDateTimeParts(now, timeZone);
  const today = occurrenceForLocalDay(parts, connector.schedule?.time, timeZone);
  if (today <= now) return today;
  return occurrenceForLocalDay(addLocalDays(parts, -1), connector.schedule?.time, timeZone);
}

function occurrenceForLocalDay(parts, time, timeZone) {
  const [hour, minute] = String(time || "23:55").split(":").map(Number);
  return zonedDateTimeToUtc({
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour,
    minute,
    second: 0
  }, timeZone);
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

function pad2(value) {
  return String(value).padStart(2, "0");
}

async function readConnectorRuns(config) {
  try {
    const payload = JSON.parse(await fs.readFile(connectorRunsPath(config), "utf8"));
    return { runs: payload.runs && typeof payload.runs === "object" ? payload.runs : {} };
  } catch (error) {
    if (error.code === "ENOENT") return { runs: {} };
    throw error;
  }
}

async function writeConnectorRun(config, key, record) {
  const runs = await readConnectorRuns(config);
  runs.runs[key] = record;
  const filePath = connectorRunsPath(config);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWrite(filePath, `${JSON.stringify(runs, null, 2)}\n`);
}

function latestRunForConnector(runs, connectorId) {
  return Object.values(runs.runs || {})
    .filter((run) => run.connectorId === connectorId)
    .sort((left, right) => String(right.ranAt).localeCompare(String(left.ranAt)))[0] || null;
}

function manualRunKey(connectorId, day, runAt) {
  return `${connectorId}:${day}:manual:${runAt.toISOString()}`;
}

function connectorRunsPath(config) {
  return path.join(config.dataDir, RUNS_FILE);
}

async function atomicWrite(filePath, content) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, content, "utf8");
  await fs.rename(tempPath, filePath);
}
