import fs from "node:fs/promises";
import path from "node:path";
import { MAX_MARKDOWN_SCAN_BYTES } from "./limits.js";
import { searchEmbeddingIndex } from "./embedding-index.js";
import { decryptSecret } from "./secrets.js";
import { buildDailyPath, renderTemplate } from "./time.js";
import { resolveVaultPath } from "./vault.js";

const RUNS_FILE = "review-runs.json";
const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;

export function startReviewTaskScheduler(loadConfig) {
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
        await runDueReviewTasks(config, new Date());
        await scheduleNext(config, new Date());
      } catch (error) {
        console.warn(`Review task scheduler failed: ${error.message}`);
        await schedule(15 * 60 * 1000);
      } finally {
        running = false;
      }
    }, Math.max(0, Math.min(delayMs, MAX_TIMER_DELAY_MS)));
    timer.unref?.();
  };

  const scheduleNext = async (config, now) => {
    const next = nextReviewRunAt(config, now);
    if (!next) {
      await schedule(6 * 60 * 60 * 1000);
      return;
    }
    await schedule(next.getTime() - now.getTime() + 1000);
  };

  schedule(0).catch((error) => console.warn(`Review task scheduler failed: ${error.message}`));

  return {
    reschedule() {
      schedule(0).catch((error) => console.warn(`Review task scheduler failed: ${error.message}`));
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}

export async function getReviewStatus(config, now = new Date()) {
  const runs = await readReviewRuns(config);
  return {
    ok: true,
    operation: "reviews/status",
    enabled: Boolean(config.reviews?.enabled),
    timeZone: config.timeZone,
    tasks: (config.reviews?.tasks || []).map((task) => ({
      id: task.id,
      name: task.name,
      enabled: Boolean(task.enabled),
      period: task.period,
      nextRunAt: task.enabled ? nextOccurrenceForTask(task, now, config.timeZone)?.toISOString() || "" : "",
      lastRun: latestRunForTask(runs, task.id)
    }))
  };
}

export async function runDueReviewTasks(config, now = new Date()) {
  if (!config.reviews?.enabled) return { ok: true, operation: "reviews/run-due", results: [] };
  const runs = await readReviewRuns(config);
  const results = [];

  for (const task of config.reviews.tasks || []) {
    if (!task.enabled) continue;
    const occurrence = previousOccurrenceForTask(task, now, config.timeZone);
    if (!occurrence || occurrence > now) continue;
    const range = periodRangeForTask(task, occurrence, config.timeZone);
    const runKey = `${task.id}:${range.label}`;
    if (runs.runs[runKey]) continue;

    try {
      const result = await runReviewTask(config, task.id, { now: occurrence, range });
      await writeReviewRun(config, runKey, {
        taskId: task.id,
        period: range.label,
        ok: true,
        path: result.path,
        ranAt: new Date().toISOString()
      });
      results.push(result);
    } catch (error) {
      await writeReviewRun(config, runKey, {
        taskId: task.id,
        period: range.label,
        ok: false,
        error: error.message,
        ranAt: new Date().toISOString()
      });
      results.push({ ok: false, operation: "reviews/run", taskId: task.id, period: range.label, error: error.message });
    }
  }

  return { ok: true, operation: "reviews/run-due", results };
}

export async function runReviewTask(config, taskId, options = {}) {
  const task = findReviewTask(config, taskId);
  const range = options.range || periodRangeForTask(task, options.now || new Date(), config.timeZone);
  const sourceDocs = await collectPeriodDocuments(config, task, range);
  const sourceText = buildSourceText(sourceDocs, config.reviews?.maxSourceChars || 60000);
  const semanticRecall = await collectSemanticRecall(config, task, sourceText);
  const messages = buildReviewMessages(task, range, sourceText, semanticRecall, config.reviews?.maxRecallChars || 16000);
  const summary = await callChatModel(config, messages);
  const written = await writeReviewOutput(config, task, range, summary, options.runAt || new Date());

  return {
    ok: true,
    operation: "reviews/run",
    taskId: task.id,
    name: task.name,
    period: range.label,
    path: written.path,
    sourceDocuments: sourceDocs.length,
    semanticRecall: {
      enabled: Boolean(task.semanticRecall?.enabled),
      results: semanticRecall.results.length,
      warning: semanticRecall.warning || ""
    }
  };
}

export function nextReviewRunAt(config, now = new Date()) {
  if (!config.reviews?.enabled) return null;
  const candidates = (config.reviews.tasks || [])
    .filter((task) => task.enabled)
    .map((task) => nextOccurrenceForTask(task, now, config.timeZone))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime());
  return candidates[0] || null;
}

function findReviewTask(config, taskId) {
  const tasks = config.reviews?.tasks || [];
  const requestedId = String(taskId || "").trim();
  const task = requestedId ? tasks.find((item) => item.id === requestedId) : tasks[0];
  if (requestedId && !task) throw new Error(`Review task not found: ${requestedId}`);
  if (!task) throw new Error("No review task is configured");
  return task;
}

async function collectPeriodDocuments(config, task, range) {
  const docs = [];
  const seen = new Set();
  const sourceDirs = (task.sourceDirs || []).filter((dir) => config.allowedDirs.includes(dir));

  if (task.includeDailyNotes || sourceDirs.includes("Daily")) {
    for (const day of daysInRange(range.startDate, range.endDate)) {
      const dailyPath = buildDailyPath(localNoonToDate(day, config.timeZone), config.dailyNote);
      await addDocument(config, docs, seen, dailyPath);
    }
  }

  for (const dir of sourceDirs) {
    if (dir === "Daily" && task.includeDailyNotes) continue;
    const root = path.join(config.vaultRoot, dir);
    for await (const filePath of walkMarkdown(root)) {
      const stat = await statIfExists(filePath);
      if (!stat?.isFile() || stat.size > MAX_MARKDOWN_SCAN_BYTES) continue;
      if (stat.mtime < range.start || stat.mtime >= range.end) continue;
      const relativePath = toVaultRelativePath(config, filePath);
      await addDocument(config, docs, seen, relativePath, stat);
    }
  }

  return docs.sort((left, right) => left.path.localeCompare(right.path));
}

async function addDocument(config, docs, seen, relativePath, knownStat = null) {
  if (seen.has(relativePath)) return;
  seen.add(relativePath);
  const filePath = path.join(config.vaultRoot, relativePath);
  const stat = knownStat || await statIfExists(filePath);
  if (!stat?.isFile() || stat.size > MAX_MARKDOWN_SCAN_BYTES) return;
  const text = await fs.readFile(filePath, "utf8");
  docs.push({
    path: relativePath,
    mtime: stat.mtime.toISOString(),
    text
  });
}

function buildSourceText(docs, maxChars) {
  const parts = [];
  let remaining = maxChars;
  for (const doc of docs) {
    if (remaining <= 0) break;
    const header = `\n\n---\nSource: ${doc.path}\nModified: ${doc.mtime}\n---\n`;
    const available = remaining - header.length;
    if (available <= 0) break;
    const body = doc.text.slice(0, available);
    parts.push(`${header}${body}`);
    remaining -= header.length + body.length;
  }
  return parts.join("").trim();
}

async function collectSemanticRecall(config, task, sourceText) {
  if (!task.semanticRecall?.enabled) return { results: [] };
  const query = task.semanticRecall.query || sourceText.slice(0, 4000);
  if (!query.trim()) return { results: [] };

  try {
    const result = await searchEmbeddingIndex(config, {
      query,
      limit: task.semanticRecall.limit || 8
    });
    if (result.ok === false) {
      return { results: [], warning: result.error || "Semantic recall failed" };
    }
    const allowed = new Set(task.semanticRecall.scopeDirs || []);
    const results = (result.results || [])
      .filter((item) => allowed.size === 0 || allowed.has(item.path.split("/")[0]))
      .map((item) => ({
        path: item.path,
        heading: item.heading,
        score: item.score,
        text: item.text
      }));
    return { results };
  } catch (error) {
    return { results: [], warning: error.message };
  }
}

function buildReviewMessages(task, range, sourceText, semanticRecall, maxRecallChars) {
  const recallText = semanticRecall.results.length
    ? clampText(semanticRecall.results.map((item, index) => [
      `Recall ${index + 1}: ${item.path}${item.heading ? ` ${item.heading}` : ""}`,
      `Score: ${Number(item.score).toFixed(4)}`,
      item.text
    ].join("\n")).join("\n\n"), maxRecallChars)
    : semanticRecall.warning
      ? `Semantic recall warning: ${semanticRecall.warning}`
      : "No semantic recall results.";

  return [
    {
      role: "system",
      content: task.prompt
    },
    {
      role: "user",
      content: [
        `Review task: ${task.name}`,
        `Period: ${range.label}`,
        `Date range: ${range.startDate.iso} to ${range.endDate.iso} (exclusive)`,
        "",
        "Period source notes:",
        sourceText || "No source notes were found for this period.",
        "",
        "Semantic recall:",
        recallText
      ].join("\n")
    }
  ];
}

async function callChatModel(config, messages) {
  const apiKey = readAiApiKey(config);
  if (!config.ai?.model || !config.ai?.baseUrl || !apiKey) {
    throw new Error("AI model is not configured. Set AI base URL, model, and API key in the Web UI.");
  }

  const response = await fetch(`${String(config.ai.baseUrl).replace(/\/+$/g, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.ai.model,
      messages,
      temperature: config.ai.temperature ?? 0.2,
      max_tokens: config.ai.maxOutputTokens || 1600
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI API failed with ${response.status}: ${text.slice(0, 500)}`);
  }

  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI API response is missing message content");
  }
  return content.trim();
}

async function writeReviewOutput(config, task, range, summary, runAt) {
  const outputPath = renderTemplate(task.output.pathTemplate, range.variables);
  const target = resolveVaultPath(config, ensureMarkdownExtension(outputPath));
  const existing = await readTextIfExists(target.absolutePath);
  const base = existing === null
    ? await renderReviewBase(config, task, range, target.relativePath, runAt)
    : existing;
  const next = appendReviewEntry(base, reviewEntry(range, summary, runAt, config.timeZone));
  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
  await atomicWrite(target.absolutePath, next);
  return { path: target.relativePath };
}

async function renderReviewBase(config, task, range, outputPath, runAt) {
  const variables = reviewTemplateVariables(task, range, outputPath, runAt, config.timeZone);
  if (!task.output.templatePath) {
    return `# ${variables.title}`;
  }

  const template = await readReviewTemplate(config, task.output.templatePath);
  return renderTemplate(template, variables).trimEnd();
}

async function readReviewTemplate(config, templatePath) {
  const target = resolveVaultPath(config, ensureMarkdownExtension(templatePath));
  const content = await readTextIfExists(target.absolutePath);
  if (content === null) {
    throw new Error(`Review template not found: ${target.relativePath}`);
  }
  return content;
}

function reviewTemplateVariables(task, range, outputPath, runAt, timeZone) {
  const heading = task.output.heading || task.name;
  return {
    ...range.variables,
    generatedAt: formatInTimeZone(runAt, timeZone),
    title: `${heading} ${range.label}`,
    heading,
    taskId: task.id,
    taskName: task.name,
    outputPath
  };
}

function reviewEntry(range, summary, runAt, timeZone) {
  return `${reviewNotice(range, runAt, timeZone)}\n\n${summary.trim()}`;
}

function reviewNotice(range, runAt, timeZone) {
  return [
    "> [!info] VaultEcho Review",
    `> Period: ${range.label} (${range.startDate.iso} to ${range.endDate.iso})`,
    `> Generated At: ${formatInTimeZone(runAt, timeZone)}`
  ].join("\n");
}

function appendReviewEntry(markdown, entry) {
  const base = String(markdown || "").trimEnd();
  return ensureTrailingNewline(base ? `${base}\n\n${entry}` : entry);
}

function formatInTimeZone(date, timeZone) {
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
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function periodRangeForTask(task, occurrence, timeZone) {
  const local = localDateParts(occurrence, timeZone);
  if (task.period === "weekly") return weeklyRange(task, local, timeZone);
  if (task.period === "monthly") return monthlyRange(task, local, timeZone);
  if (task.period === "quarterly") return quarterlyRange(task, local, timeZone);
  return yearlyRange(task, local, timeZone);
}

function weeklyRange(task, local, timeZone) {
  const currentStart = addDays(local, -isoWeekday(local) + 1);
  const startDate = task.targetPeriod === "current" ? currentStart : addDays(currentStart, -7);
  const endDate = addDays(startDate, 7);
  const isoWeek = isoWeekInfo(startDate);
  return buildRange("weekly", `${isoWeek.year}-W${pad2(isoWeek.week)}`, startDate, endDate, timeZone, {
    YYYY: String(isoWeek.year),
    WW: pad2(isoWeek.week)
  });
}

function monthlyRange(task, local, timeZone) {
  const currentStart = { year: local.year, month: local.month, day: 1 };
  const startDate = task.targetPeriod === "current" ? currentStart : addMonths(currentStart, -1);
  const endDate = addMonths(startDate, 1);
  return buildRange("monthly", `${startDate.year}-${pad2(startDate.month)}`, startDate, endDate, timeZone, {
    YYYY: String(startDate.year),
    MM: pad2(startDate.month)
  });
}

function quarterlyRange(task, local, timeZone) {
  const quarter = Math.floor((local.month - 1) / 3) + 1;
  const currentStart = { year: local.year, month: (quarter - 1) * 3 + 1, day: 1 };
  const startDate = task.targetPeriod === "current" ? currentStart : addMonths(currentStart, -3);
  const endDate = addMonths(startDate, 3);
  const targetQuarter = Math.floor((startDate.month - 1) / 3) + 1;
  return buildRange("quarterly", `${startDate.year}-Q${targetQuarter}`, startDate, endDate, timeZone, {
    YYYY: String(startDate.year),
    Q: String(targetQuarter)
  });
}

function yearlyRange(task, local, timeZone) {
  const currentStart = { year: local.year, month: 1, day: 1 };
  const startDate = task.targetPeriod === "current" ? currentStart : { year: local.year - 1, month: 1, day: 1 };
  const endDate = { year: startDate.year + 1, month: 1, day: 1 };
  return buildRange("yearly", String(startDate.year), startDate, endDate, timeZone, {
    YYYY: String(startDate.year)
  });
}

function buildRange(period, label, startDate, endDate, timeZone, variables) {
  const start = zonedDateTimeToUtc(startDate, "00:00", timeZone);
  const end = zonedDateTimeToUtc(endDate, "00:00", timeZone);
  return {
    period,
    label,
    start,
    end,
    startDate: { ...startDate, iso: dateIso(startDate) },
    endDate: { ...endDate, iso: dateIso(endDate) },
    variables: {
      ...variables,
      period,
      periodLabel: label,
      startDate: dateIso(startDate),
      endDate: dateIso(endDate)
    }
  };
}

function previousOccurrenceForTask(task, now, timeZone) {
  const candidate = occurrenceForLocalDate(task, localDateParts(now, timeZone), timeZone);
  if (candidate <= now) return candidate;
  return occurrenceForLocalDate(task, previousPeriodLocalDate(task, localDateParts(now, timeZone)), timeZone);
}

function nextOccurrenceForTask(task, now, timeZone) {
  const candidate = occurrenceForLocalDate(task, localDateParts(now, timeZone), timeZone);
  if (candidate > now) return candidate;
  return occurrenceForLocalDate(task, nextPeriodLocalDate(task, localDateParts(now, timeZone)), timeZone);
}

function occurrenceForLocalDate(task, local, timeZone) {
  if (task.period === "weekly") {
    const start = addDays(local, -local.weekday);
    const date = addDays(start, task.schedule.weekday);
    return zonedDateTimeToUtc(date, task.schedule.time, timeZone);
  }
  if (task.period === "monthly") {
    const day = Math.min(task.schedule.monthDay, daysInMonth(local.year, local.month));
    return zonedDateTimeToUtc({ year: local.year, month: local.month, day }, task.schedule.time, timeZone);
  }
  if (task.period === "quarterly") {
    const quarter = Math.floor((local.month - 1) / 3) + 1;
    const nextQuarterStart = quarter === 4
      ? { year: local.year + 1, month: 1, day: 1 }
      : { year: local.year, month: quarter * 3 + 1, day: 1 };
    return zonedDateTimeToUtc(addDays(nextQuarterStart, task.schedule.quarterDayOffset - 1), task.schedule.time, timeZone);
  }
  return zonedDateTimeToUtc({
    year: local.year,
    month: task.schedule.month,
    day: Math.min(task.schedule.monthDay, daysInMonth(local.year, task.schedule.month))
  }, task.schedule.time, timeZone);
}

function previousPeriodLocalDate(task, local) {
  if (task.period === "weekly") return addDays(local, -7);
  if (task.period === "monthly") return addMonths(local, -1);
  if (task.period === "quarterly") return addMonths(local, -3);
  return { ...local, year: local.year - 1 };
}

function nextPeriodLocalDate(task, local) {
  if (task.period === "weekly") return addDays(local, 7);
  if (task.period === "monthly") return addMonths(local, 1);
  if (task.period === "quarterly") return addMonths(local, 3);
  return { ...local, year: local.year + 1 };
}

function localDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const result = {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day)
  };
  return { ...result, weekday: new Date(Date.UTC(result.year, result.month - 1, result.day)).getUTCDay() };
}

function zonedDateTimeToUtc(date, time, timeZone) {
  const [hour, minute] = time.split(":").map(Number);
  let utc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0);
  for (let index = 0; index < 2; index += 1) {
    const offset = timeZoneOffsetMs(new Date(utc), timeZone);
    utc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0) - offset;
  }
  return new Date(utc);
}

function timeZoneOffsetMs(date, timeZone) {
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
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return localAsUtc - date.getTime();
}

function localNoonToDate(date, timeZone) {
  return zonedDateTimeToUtc(date, "12:00", timeZone);
}

function* daysInRange(startDate, endDate) {
  for (let current = startDate; dateSerial(current) < dateSerial(endDate); current = addDays(current, 1)) {
    yield current;
  }
}

function addDays(date, days) {
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
}

function addMonths(date, months) {
  const next = new Date(Date.UTC(date.year, date.month - 1 + months, 1));
  const day = Math.min(date.day, daysInMonth(next.getUTCFullYear(), next.getUTCMonth() + 1));
  return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateSerial(date) {
  return Math.floor(Date.UTC(date.year, date.month - 1, date.day) / 86400000);
}

function isoWeekday(date) {
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return day === 0 ? 7 : day;
}

function isoWeekInfo(date) {
  const target = new Date(Date.UTC(date.year, date.month - 1, date.day));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target - yearStart) / 86400000) + 1) / 7);
  return { year: target.getUTCFullYear(), week };
}

function dateIso(date) {
  return `${date.year}-${pad2(date.month)}-${pad2(date.day)}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function readAiApiKey(config) {
  if (config.ai?.apiKey) return config.ai.apiKey;
  if (!config.ai?.apiKeyEncrypted) return "";
  return decryptSecret(config.ai.apiKeyEncrypted, config.appEncryptionKey);
}

async function readReviewRuns(config) {
  try {
    const payload = JSON.parse(await fs.readFile(reviewRunsPath(config), "utf8"));
    return { runs: payload.runs && typeof payload.runs === "object" ? payload.runs : {} };
  } catch (error) {
    if (error.code === "ENOENT") return { runs: {} };
    throw error;
  }
}

async function writeReviewRun(config, key, record) {
  const runs = await readReviewRuns(config);
  runs.runs[key] = record;
  const filePath = reviewRunsPath(config);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await atomicWrite(filePath, `${JSON.stringify(runs, null, 2)}\n`);
}

function latestRunForTask(runs, taskId) {
  return Object.values(runs.runs || {})
    .filter((run) => run.taskId === taskId)
    .sort((left, right) => String(right.ranAt).localeCompare(String(left.ranAt)))[0] || null;
}

function reviewRunsPath(config) {
  return path.join(config.dataDir, RUNS_FILE);
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

async function statIfExists(filePath) {
  try {
    return await fs.stat(filePath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
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

function ensureMarkdownExtension(file) {
  if (path.posix.extname(file)) return file;
  return `${file}.md`;
}

function ensureTrailingNewline(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function clampText(value, maxChars) {
  if (!maxChars || value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[Truncated by maxRecallChars]`;
}

function toVaultRelativePath(config, filePath) {
  return path.relative(config.vaultRoot, filePath).replaceAll(path.sep, "/");
}
