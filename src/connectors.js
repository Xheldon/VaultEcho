import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { decryptSecret, encryptSecret } from "./secrets.js";
import { buildDailyPath, renderTemplate } from "./time.js";
import { executeOperation } from "./vault.js";

const RUNS_FILE = "connector-runs.json";
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_X_BASE_URL = "https://api.x.com/2";
const DEFAULT_STRAVA_BASE_URL = "https://www.strava.com/api/v3";
const STRAVA_OAUTH_TOKEN_URL = "https://www.strava.com/oauth/token";
const X_FETCH_TIMEOUT_MS = 10 * 1000;
const X_FETCH_RETRY_DELAYS_MS = [1000, 3000];
const STRAVA_FETCH_TIMEOUT_MS = 10 * 1000;
const STRAVA_FETCH_RETRY_DELAYS_MS = [1000, 3000];
const CONNECTOR_RETRY_DELAY_MS = 15 * 60 * 1000;
const CONNECTOR_RUN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CONNECTOR_RUN_RECORDS = 500;
const CONNECTOR_POLL_INTERVAL_MINUTES = [15, 30, 60, 120, 360, 720, 1440];
const CONNECTOR_LOOKBACK_MINUTES = new Map([
  [15, 30],
  [30, 60],
  [60, 120],
  [120, 360],
  [360, 720],
  [720, 1440],
  [1440, 2880]
]);
const DAILY_CATCHUP_MINUTE_OF_DAY = 23 * 60 + 59;
const DAILY_CATCHUP_GRACE_MS = 30 * 60 * 1000;
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
  const occurrences = dueConnectorOccurrences(config.connectors, now, config.timeZone);
  if (!occurrences.length) return { ok: true, operation: "connectors/run-due", results: [] };
  const results = [];

  for (const occurrence of occurrences) {
    const day = localDayKey(occurrence.at, config.timeZone);

    for (const source of sources) {
      const runKey = scheduledRunKey(source.id, occurrence.at, config.timeZone, occurrence.kind);
      if (runs.runs[runKey]?.ok) continue;

      try {
        const result = await runConnector(config, source.id, {
          now,
          targetDate: occurrence.at,
          windowKind: occurrence.kind,
          recordRun: false
        });
        await writeConnectorRun(config, runKey, {
          connectorId: source.id,
          connectorName: source.name || source.id,
          platform: source.platform,
          day,
          ok: true,
          manual: false,
          windowKind: result.windowKind,
          windowStart: result.windowStart,
          windowEnd: result.windowEnd,
          lookbackMinutes: result.lookbackMinutes,
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
          windowKind: occurrence.kind,
          error: error.message,
          ranAt: new Date().toISOString()
        });
        results.push({ ok: false, connectorId: source.id, platform: source.platform, error: error.message });
      }
    }
  }

  return { ok: true, operation: "connectors/run-due", results };
}

export async function runConnector(config, connectorId = "x", options = {}) {
  const connector = findConnectorSource(config, connectorId);
  if (!connector) {
    throw new Error(`Connector not found: ${connectorId || "x"}`);
  }
  if (!connector.enabled) {
    throw new Error(`Connector is not enabled: ${connector.id}`);
  }

  const runAt = options.runAt || new Date();
  const targetDate = options.targetDate || options.now || runAt;
  const day = localDayKey(targetDate, config.timeZone);
  const shouldRecordRun = options.recordRun !== false;

  try {
    const result = await runConnectorByPlatform(config, connector, {
      now: options.now || runAt,
      targetDate,
      windowKind: options.windowKind,
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
        windowKind: result.windowKind,
        windowStart: result.windowStart,
        windowEnd: result.windowEnd,
        lookbackMinutes: result.lookbackMinutes,
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

async function runConnectorByPlatform(config, connector, options) {
  if (connector.platform === "x") return runXConnector(config, connector, options);
  if (connector.platform === "strava") return runStravaConnector(config, connector, options);
  throw new Error(`Unsupported connector platform: ${connector.platform}`);
}

export function nextConnectorRunAt(config, now = new Date()) {
  const hasEnabledSource = connectorSources(config).some((source) => source.enabled);
  if (!config.connectors?.enabled || !hasEnabledSource) return null;
  return earliestDate([
    nextOccurrenceForConnector(config.connectors, now, config.timeZone),
    nextDailyCatchupOccurrence(now, config.timeZone)
  ]);
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
  const window = connectorWindow(config.connectors, options, config.timeZone);
  const posts = await fetchXPostsForWindow(x, bearerToken, account.userId, window);
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
    windowKind: window.kind,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    lookbackMinutes: window.lookbackMinutes || 0,
    path: written[written.length - 1]?.path || results[results.length - 1]?.path || "",
    postsFound: posts.length,
    postsWritten: written.length,
    postsSkipped: results.length - written.length,
    results
  };
}

async function runStravaConnector(config, strava, options) {
  const window = connectorWindow(config.connectors, options, config.timeZone);
  let token = await resolveStravaAccessToken(config, strava);
  let details;
  try {
    details = await fetchStravaActivityDetailsForWindow(strava, token.accessToken, window);
  } catch (error) {
    if (!error.stravaUnauthorized || error.stravaMissingActivityReadPermission) throw error;
    token = await resolveStravaAccessToken(config, strava, { forceRefresh: true });
    details = await fetchStravaActivityDetailsForWindow(strava, token.accessToken, window);
  }
  const minMovingTimeSeconds = stravaMinMovingTimeSeconds(strava);
  const activities = details
    .map((activity) => normalizeStravaActivity(activity, config.timeZone))
    .filter((activity) => activity && stravaActivityDurationSeconds(activity) >= minMovingTimeSeconds)
    .sort((left, right) => left.startDate - right.startDate);
  const heading = parseHeadingMarkdown(
    strava.output?.headingMarkdown,
    config.dailyNote.headingLevel,
    "## 今日运动"
  );
  const insertAfterHeading = resolveStravaInsertAfterHeading(config, strava);
  const results = [];
  const entries = activities.map((activity) => ({
    activity,
    content: formatStravaActivityEntry(activity),
    dailyPath: buildDailyPath(activity.startDate, config.dailyNote, activity.name || activity.type || "")
  }));
  const missingDailyPaths = await missingVaultPathsAtStart(config, entries.map((entry) => entry.dailyPath));

  for (const { activity, content, dailyPath } of entries) {
    const result = await executeOperation(config, {
      operation: "upsert_daily_separated_heading",
      at: activity.startDate.toISOString(),
      heading: heading.heading,
      headingLevel: heading.headingLevel,
      insertAfterHeading: insertAfterHeading.heading,
      insertAfterHeadingLevel: insertAfterHeading.headingLevel,
      content,
      idempotencyKey: stravaActivityIdempotencyKey(strava, activity.id),
      forceReplayIdempotent: missingDailyPaths.has(dailyPath),
      replayIfResultMissing: true
    });
    results.push({
      id: activity.id,
      createdAt: activity.startDate.toISOString(),
      path: result.path,
      idempotent: Boolean(result.idempotent)
    });
  }

  const written = results.filter((item) => !item.idempotent);
  return {
    ok: true,
    operation: "connectors/run",
    connectorId: strava.id,
    connectorName: strava.name || strava.id,
    platform: "strava",
    day: window.day,
    windowKind: window.kind,
    windowStart: window.start.toISOString(),
    windowEnd: window.end.toISOString(),
    lookbackMinutes: window.lookbackMinutes || 0,
    path: written[written.length - 1]?.path || results[results.length - 1]?.path || "",
    activitiesFound: activities.length,
    activitiesWritten: written.length,
    activitiesSkipped: results.length - written.length,
    postsFound: activities.length,
    postsWritten: written.length,
    postsSkipped: results.length - written.length,
    results
  };
}

function resolveStravaInsertAfterHeading(config, strava) {
  const configured = String(strava.output?.insertAfterHeadingMarkdown || "").trim();
  if (configured) return parseHeadingMarkdown(configured, config.dailyNote.headingLevel);
  const lastSlot = [...(config.dailyNote?.slots || [])].reverse().find((slot) => slot?.heading);
  return {
    heading: lastSlot?.heading || "",
    headingLevel: config.dailyNote.headingLevel || 2
  };
}

async function resolveStravaAccessToken(config, strava, options = {}) {
  const state = await readStravaTokenState(config, strava);
  const authorizationCode = readStravaAuthorizationCode(config, strava);
  const authorizationCodeHash = authorizationCode ? secretHash(authorizationCode) : "";
  if (authorizationCode && state.authorizationCodeHash !== authorizationCodeHash) {
    const clientId = String(strava.clientId || "").trim();
    const clientSecret = readStravaClientSecret(config, strava);
    if (!clientId) throw new Error("Strava connector clientId is not configured");
    if (!clientSecret) throw new Error("Strava connector clientSecret is not configured");
    const configRefreshToken = readStravaRefreshToken(config, strava);
    const exchanged = await postStravaOAuthToken({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code: authorizationCode
    });
    assertStravaActivityScope(exchanged.scope);
    await writeStravaTokenState(config, strava, exchanged, configRefreshToken ? secretHash(configRefreshToken) : "", authorizationCodeHash);
    return { accessToken: exchanged.access_token };
  }

  const stateAccessToken = readEncryptedStateSecret(config, state.accessTokenEncrypted);
  if (!options.forceRefresh && stateAccessToken && Number(state.expiresAt) > Math.floor(Date.now() / 1000) + 3600) {
    return { accessToken: stateAccessToken };
  }

  const configAccessToken = readStravaAccessToken(config, strava);
  if (!options.forceRefresh && configAccessToken && Number(strava.accessTokenExpiresAt) > Math.floor(Date.now() / 1000) + 3600) {
    return { accessToken: configAccessToken };
  }

  const clientId = String(strava.clientId || "").trim();
  const clientSecret = readStravaClientSecret(config, strava);
  const configRefreshToken = readStravaRefreshToken(config, strava);
  const configRefreshTokenHash = configRefreshToken ? secretHash(configRefreshToken) : "";
  const stateRefreshToken = state.configRefreshTokenHash === configRefreshTokenHash
    ? readEncryptedStateSecret(config, state.refreshTokenEncrypted)
    : "";
  const refreshToken = stateRefreshToken || configRefreshToken;
  if (!clientId) throw new Error("Strava connector clientId is not configured");
  if (!clientSecret) throw new Error("Strava connector clientSecret is not configured");
  if (!refreshToken) throw new Error("Strava connector refreshToken is not configured");

  const refreshed = await postStravaOAuthToken({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken
  });
  await writeStravaTokenState(config, strava, refreshed, configRefreshTokenHash, state.authorizationCodeHash || authorizationCodeHash);
  return { accessToken: refreshed.access_token };
}

async function postStravaOAuthToken(params) {
  const response = await fetch(STRAVA_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params)
  });
  if (!response.ok) {
    throw new Error(`Strava OAuth failed with ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  return response.json();
}

async function fetchStravaActivityDetailsForWindow(strava, accessToken, window) {
  const summaries = await fetchStravaActivitiesForWindow(strava, accessToken, window);
  return fetchStravaActivityDetails(strava, accessToken, summaries);
}

async function fetchStravaActivitiesForWindow(strava, accessToken, window) {
  const activities = [];
  const maxActivities = Math.max(1, Math.min(Number(strava.maxActivitiesPerRun) || 10, 30));
  const perPage = Math.min(maxActivities, 30);

  for (let page = 1; activities.length < maxActivities; page += 1) {
    const payload = await fetchStravaJson(strava, accessToken, "/athlete/activities", {
      after: Math.floor(window.start.getTime() / 1000),
      before: Math.ceil(window.end.getTime() / 1000),
      page,
      per_page: perPage
    });
    const batch = Array.isArray(payload) ? payload : [];
    activities.push(...batch);
    if (batch.length < perPage) break;
  }

  return activities.slice(0, maxActivities);
}

async function fetchStravaActivityDetails(strava, accessToken, summaries) {
  const details = [];
  const delayMs = Math.max(0, Math.min(Number(strava.requestDelayMs) || 0, 30000));
  for (const [index, summary] of summaries.entries()) {
    if (!summary?.id) continue;
    if (index > 0 && delayMs > 0) await sleep(delayMs);
    details.push(await fetchStravaJson(strava, accessToken, `/activities/${encodeURIComponent(summary.id)}`));
  }
  return details;
}

async function fetchStravaJson(strava, accessToken, route, params = {}) {
  const baseUrl = String(strava.baseUrl || DEFAULT_STRAVA_BASE_URL).replace(/\/+$/g, "");
  const url = new URL(`${baseUrl}${route}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchStravaResponse(url, accessToken);
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401 && isStravaActivityReadPermissionError(text)) {
      const error = new Error("Strava connector is missing activity read permission. Reauthorize Strava with scope read,activity:read_all, then paste the new authorization code or refresh token.");
      error.stravaUnauthorized = true;
      error.stravaMissingActivityReadPermission = true;
      throw error;
    }
    if (response.status === 429) {
      throw new Error(`Strava API rate limited with 429: ${formatStravaRateLimitHeaders(response)} ${text.slice(0, 300)}`.trim());
    }
    const error = new Error(`Strava API failed with ${response.status}: ${text.slice(0, 500)}`);
    error.stravaUnauthorized = response.status === 401;
    throw error;
  }
  return response.json();
}

async function fetchStravaResponse(url, accessToken) {
  let lastError;
  for (let attempt = 0; attempt <= STRAVA_FETCH_RETRY_DELAYS_MS.length; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STRAVA_FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Accept": "application/json"
        }
      });
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < STRAVA_FETCH_RETRY_DELAYS_MS.length) {
        await sleep(STRAVA_FETCH_RETRY_DELAYS_MS[attempt]);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`Strava API request failed: GET ${redactUrl(url)}: ${formatFetchError(lastError, STRAVA_FETCH_TIMEOUT_MS)}`);
}

function normalizeStravaActivity(activity, timeZone) {
  const startDate = stravaActivityStartDate(activity);
  if (!startDate || Number.isNaN(startDate.getTime())) return null;
  const parts = localDateTimeParts(startDate, timeZone);
  const type = String(activity.sport_type || activity.type || "").trim();
  return {
    id: String(activity.id || ""),
    name: cleanActivityName(activity.name || ""),
    type,
    startDate,
    HH: pad2(parts.hour),
    mm: pad2(parts.minute),
    movingTimeSeconds: numberOrNull(activity.moving_time),
    elapsedTimeSeconds: numberOrNull(activity.elapsed_time),
    averageHeartrate: numberOrNull(activity.average_heartrate),
    maxHeartrate: numberOrNull(activity.max_heartrate),
    distanceMeters: numberOrNull(activity.distance),
    elevationGainMeters: numberOrNull(activity.total_elevation_gain),
    averageSpeed: numberOrNull(activity.average_speed),
    maxSpeed: numberOrNull(activity.max_speed),
    calories: numberOrNull(activity.calories),
    deviceName: cleanDeviceName(activity.device_name || "")
  };
}

function stravaActivityStartDate(activity) {
  if (activity.start_date) return new Date(activity.start_date);
  if (!activity.start_date_local) return null;
  const local = String(activity.start_date_local)
    .replace(/Z$/i, "")
    .replace(/[+-]\d{2}:?\d{2}$/i, "");
  return new Date(`${local}+08:00`);
}

// Effective duration for the min-duration filter. Non-GPS sports (badminton,
// table tennis, gym, etc.) may not report moving_time, so fall back to elapsed.
function stravaActivityDurationSeconds(activity) {
  if (positiveNumber(activity.movingTimeSeconds)) return activity.movingTimeSeconds;
  if (positiveNumber(activity.elapsedTimeSeconds)) return activity.elapsedTimeSeconds;
  return 0;
}

// Builds the entry from whatever metrics the activity actually has. Indoor and
// non-GPS sports lack speed/distance (and sometimes heart rate or calories), so
// every metric is optional and simply omitted when absent.
function formatStravaActivityEntry(activity) {
  const parts = [];
  if (activity.name) parts.push(activity.name);
  if (activity.type) parts.push(activity.type);
  if (positiveNumber(activity.movingTimeSeconds)) parts.push(`运动时间 ${formatDuration(activity.movingTimeSeconds)}`);
  if (positiveNumber(activity.elapsedTimeSeconds)) parts.push(`总耗时 ${formatDuration(activity.elapsedTimeSeconds)}`);
  if (positiveNumber(activity.averageHeartrate)) parts.push(`平均心率 ${Math.round(activity.averageHeartrate)} bpm`);
  if (positiveNumber(activity.maxHeartrate)) parts.push(`最大心率 ${Math.round(activity.maxHeartrate)} bpm`);
  if (positiveNumber(activity.distanceMeters)) parts.push(`总里程 ${formatDistance(activity.distanceMeters)}`);
  if (finiteNumber(activity.elevationGainMeters)) parts.push(`累计爬升 ${formatElevation(activity.elevationGainMeters)}`);
  if (positiveNumber(activity.averageSpeed)) parts.push(`平均速度 ${formatSpeed(activity.averageSpeed)}`);
  if (positiveNumber(activity.maxSpeed)) parts.push(`最大速度 ${formatSpeed(activity.maxSpeed)}`);
  if (positiveNumber(activity.calories)) parts.push(`卡路里 ${Math.round(activity.calories)} kcal`);
  const deviceSuffix = activity.deviceName ? `，[[${activity.deviceName}]]` : "";
  return `[${activity.HH}:${activity.mm}] ${parts.join("，")}${deviceSuffix}。`;
}

function formatDuration(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}小时${pad2(minutes)}分`;
  if (secs > 0) return `${minutes}分${pad2(secs)}秒`;
  return `${minutes}分钟`;
}

function formatSpeed(metersPerSecond) {
  return `${(metersPerSecond * 3.6).toFixed(1)} km/h`;
}

function formatDistance(meters) {
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatElevation(meters) {
  return `${Math.round(meters)} m`;
}

function stravaMinMovingTimeSeconds(strava) {
  return Math.max(0, Number(strava.minMovingTimeMinutes) || 0) * 60;
}

function cleanActivityName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanDeviceName(value) {
  return String(value || "").replace(/[\r\n[\]|]/g, " ").replace(/\s+/g, " ").trim();
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function stravaActivityIdempotencyKey(strava, activityId) {
  return strava.id === "strava" ? `strava-activity-${activityId}` : `strava-activity-${strava.id}-${activityId}`;
}

function readStravaClientSecret(config, strava) {
  if (strava.clientSecret) return strava.clientSecret;
  if (!strava.clientSecretEncrypted) return "";
  return decryptSecret(strava.clientSecretEncrypted, config.appEncryptionKey);
}

function readStravaRefreshToken(config, strava) {
  if (strava.refreshToken) return strava.refreshToken;
  if (!strava.refreshTokenEncrypted) return "";
  return decryptSecret(strava.refreshTokenEncrypted, config.appEncryptionKey);
}

function readStravaAccessToken(config, strava) {
  if (strava.accessToken) return strava.accessToken;
  if (!strava.accessTokenEncrypted) return "";
  return decryptSecret(strava.accessTokenEncrypted, config.appEncryptionKey);
}

function readStravaAuthorizationCode(config, strava) {
  if (strava.authorizationCode) return strava.authorizationCode;
  if (!strava.authorizationCodeEncrypted) return "";
  return decryptSecret(strava.authorizationCodeEncrypted, config.appEncryptionKey);
}

async function readStravaTokenState(config, strava) {
  try {
    const payload = JSON.parse(await fs.readFile(stravaTokenStatePath(config, strava), "utf8"));
    return payload && typeof payload === "object" ? payload : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeStravaTokenState(config, strava, token, configRefreshTokenHash, authorizationCodeHash = "") {
  const filePath = stravaTokenStatePath(config, strava);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWrite(filePath, `${JSON.stringify({
    accessTokenEncrypted: encryptSecret(token.access_token || "", config.appEncryptionKey),
    refreshTokenEncrypted: encryptSecret(token.refresh_token || "", config.appEncryptionKey),
    expiresAt: Number(token.expires_at) || 0,
    scope: token.scope || "",
    configRefreshTokenHash,
    authorizationCodeHash,
    updatedAt: new Date().toISOString()
  }, null, 2)}\n`);
}

function assertStravaActivityScope(scope) {
  if (!scope) return;
  const scopes = new Set(String(scope).split(/[,\s]+/).filter(Boolean));
  if (scopes.has("activity:read") || scopes.has("activity:read_all")) return;
  throw new Error("Strava authorization did not grant activity read permission. Reauthorize and make sure activity:read_all remains checked.");
}

function isStravaActivityReadPermissionError(text) {
  return /activity:read_permission/i.test(String(text || ""));
}

function readEncryptedStateSecret(config, value) {
  if (!value) return "";
  return decryptSecret(value, config.appEncryptionKey);
}

function stravaTokenStatePath(config, strava) {
  const id = String(strava.id || "strava").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "strava";
  return path.join(config.dataDir, `strava-token-${id}.json`);
}

function secretHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function formatStravaRateLimitHeaders(response) {
  const parts = [];
  const limit = response.headers.get("x-ratelimit-limit");
  const usage = response.headers.get("x-ratelimit-usage");
  const readLimit = response.headers.get("x-readratelimit-limit");
  const readUsage = response.headers.get("x-readratelimit-usage");
  if (limit || usage) parts.push(`overall ${usage || "?"}/${limit || "?"}`);
  if (readLimit || readUsage) parts.push(`read ${readUsage || "?"}/${readLimit || "?"}`);
  return parts.length ? parts.join(", ") : "rate-limit headers unavailable";
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

async function fetchXPostsForWindow(x, bearerToken, userId, window) {
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
      if (createdAt >= window.start && createdAt < window.end) {
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

function parseHeadingMarkdown(value, fallbackLevel, fallbackMarkdown = "## Twitter") {
  const raw = String(value || fallbackMarkdown).trim();
  const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(raw);
  if (match) {
    return {
      headingLevel: match[1].length,
      heading: match[2].trim()
    };
  }
  return {
    headingLevel: fallbackLevel || 2,
    heading: raw || fallbackMarkdown.replace(/^#{1,6}\s+/, "") || "Untitled"
  };
}

function nextOccurrenceForConnector(connector, now, timeZone) {
  const parts = localDateTimeParts(now, timeZone);
  const intervalMinutes = connectorPollIntervalMinutes(connector);
  const nextMinutes = Math.floor(minutesOfDay(parts) / intervalMinutes + 1) * intervalMinutes;
  const localOccurrence = localDayStartPlusMinutes(parts, nextMinutes);
  return zonedDateTimeToUtc(localOccurrence, timeZone);
}

function dueConnectorOccurrences(connector, now, timeZone) {
  const dailyCatchupAt = previousDailyCatchupOccurrence(now, timeZone);
  const occurrences = [
    { kind: "lookback", at: previousOccurrenceForConnector(connector, now, timeZone) }
  ];
  if (dailyCatchupAt && now.getTime() - dailyCatchupAt.getTime() <= DAILY_CATCHUP_GRACE_MS) {
    occurrences.push({ kind: "daily-catchup", at: dailyCatchupAt });
  }
  return occurrences
    .filter((occurrence) => occurrence.at && occurrence.at <= now)
    .sort((left, right) => left.at.getTime() - right.at.getTime());
}

function previousOccurrenceForConnector(connector, now, timeZone) {
  const parts = localDateTimeParts(now, timeZone);
  const intervalMinutes = connectorPollIntervalMinutes(connector);
  const previousMinutes = Math.floor(minutesOfDay(parts) / intervalMinutes) * intervalMinutes;
  const localOccurrence = localDayStartPlusMinutes(parts, previousMinutes);
  return zonedDateTimeToUtc(localOccurrence, timeZone);
}

function nextDailyCatchupOccurrence(now, timeZone) {
  const parts = localDateTimeParts(now, timeZone);
  const today = localDayStartPlusMinutes(parts, DAILY_CATCHUP_MINUTE_OF_DAY);
  const todayOccurrence = zonedDateTimeToUtc(today, timeZone);
  if (todayOccurrence > now) return todayOccurrence;
  return zonedDateTimeToUtc(localDayStartPlusMinutes(addLocalDays(parts, 1), DAILY_CATCHUP_MINUTE_OF_DAY), timeZone);
}

function previousDailyCatchupOccurrence(now, timeZone) {
  const parts = localDateTimeParts(now, timeZone);
  const today = localDayStartPlusMinutes(parts, DAILY_CATCHUP_MINUTE_OF_DAY);
  const todayOccurrence = zonedDateTimeToUtc(today, timeZone);
  if (todayOccurrence <= now) return todayOccurrence;
  return zonedDateTimeToUtc(localDayStartPlusMinutes(addLocalDays(parts, -1), DAILY_CATCHUP_MINUTE_OF_DAY), timeZone);
}

function connectorWindow(connector, options, timeZone) {
  if (options.windowKind === "daily-catchup") {
    return dailyCatchupWindow(options.targetDate || options.now || new Date(), options.now, timeZone);
  }
  return lookbackWindow(connector, options.now || options.targetDate || new Date(), timeZone);
}

function lookbackWindow(connector, now, timeZone) {
  const effectiveNow = now instanceof Date ? now : new Date(now || Date.now());
  const lookbackMinutes = connectorLookbackMinutes(connector);
  const start = new Date(effectiveNow.getTime() - lookbackMinutes * 60 * 1000);
  return {
    kind: "lookback",
    day: localDayKey(effectiveNow, timeZone),
    start,
    end: effectiveNow,
    lookbackMinutes
  };
}

function dailyCatchupWindow(targetDate, now, timeZone) {
  const parts = localDateTimeParts(targetDate || now || new Date(), timeZone);
  const nextDay = addLocalDays(parts, 1);
  const start = zonedDateTimeToUtc({ ...parts, hour: 0, minute: 0, second: 0 }, timeZone);
  const dayEnd = zonedDateTimeToUtc({ ...nextDay, hour: 0, minute: 0, second: 0 }, timeZone);
  const effectiveNow = now instanceof Date ? now : new Date(now || Date.now());
  const endMs = Math.min(Math.max(effectiveNow.getTime(), start.getTime() + 1000), dayEnd.getTime());

  return {
    kind: "daily-catchup",
    day: dateLabel(parts),
    start,
    end: new Date(endMs),
    lookbackMinutes: 0
  };
}

function earliestDate(dates) {
  return dates
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime())[0] || null;
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

function connectorLookbackMinutes(connector) {
  return CONNECTOR_LOOKBACK_MINUTES.get(connectorPollIntervalMinutes(connector)) || 2880;
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

function scheduledRunKey(connectorId, occurrence, timeZone, kind = "lookback") {
  const parts = localDateTimeParts(occurrence, timeZone);
  const base = `${connectorId}:${dateLabel(parts)}:${pad2(parts.hour)}:${pad2(parts.minute)}`;
  return kind === "daily-catchup" ? `${base}:daily-catchup` : base;
}

function connectorRunsPath(config) {
  return path.join(config.dataDir, RUNS_FILE);
}

function formatFetchError(error, timeoutMs = X_FETCH_TIMEOUT_MS) {
  if (error?.name === "AbortError") {
    return `request timed out after ${Math.round(timeoutMs / 1000)}s`;
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
