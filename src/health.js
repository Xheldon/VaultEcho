import { formatStravaActivityEntry, parseHeadingMarkdown } from "./connectors.js";
import { buildDailyPath, getDateTimeParts } from "./time.js";
import { executeOperation } from "./vault.js";

// Maximum number of raw samples accepted in a single ingest, guarding against
// a pathological payload even when it fits under maxJsonBodyBytes.
const MAX_SLEEP_SAMPLES = 5000;
const MAX_WORKOUTS = 200;

// A small subset of HKWorkoutActivityType raw values mapped to readable labels.
// The push client should send a readable activity string; this only covers the
// case where it sends the numeric HealthKit enum instead.
const HK_WORKOUT_TYPES = new Map([
  [13, "Cycling"],
  [16, "Elliptical"],
  [24, "Hiking"],
  [35, "Rowing"],
  [37, "Running"],
  [44, "Strength Training"],
  [46, "Swimming"],
  [52, "Walking"],
  [57, "Yoga"],
  [63, "High Intensity Interval Training"],
  [3000, "Other"]
]);

// HealthKit sleep-stage values arrive either as the numeric
// HKCategoryValueSleepAnalysis enum or as string identifiers; both are mapped to
// one of: inBed, awake, core, deep, rem, asleep (unspecified).
const SLEEP_STAGE_BY_NUMBER = new Map([
  [0, "inBed"],
  [1, "asleep"],
  [2, "awake"],
  [3, "core"],
  [4, "deep"],
  [5, "rem"]
]);

const ASLEEP_STAGES = new Set(["core", "deep", "rem", "asleep"]);

export async function ingestHealth(config, params = {}) {
  const appleHealth = config.appleHealth || {};
  if (!appleHealth.enabled) {
    return { ok: false, operation: "health/ingest", error: "Apple Health ingest is not enabled" };
  }

  const timeZone = config.dailyNote.timeZone;
  const results = [];
  let sleepSummaries = [];
  const workoutResults = [];

  const sleepPayload = params.sleep ?? params.sleepAnalysis;
  if (sleepPayload !== undefined && sleepPayload !== null && appleHealth.sleep?.enabled) {
    const sleep = await ingestSleep(config, appleHealth.sleep, sleepPayload, timeZone);
    sleepSummaries = sleep.summaries;
    results.push(...sleep.writes);
  }

  const workoutsPayload = normalizeWorkoutList(params.workouts ?? params.workout);
  if (workoutsPayload.length && appleHealth.workouts?.enabled) {
    const written = await ingestWorkouts(config, appleHealth.workouts, workoutsPayload, timeZone);
    workoutResults.push(...written.entries);
    results.push(...written.writes);
  }

  return {
    ok: true,
    operation: "health/ingest",
    timeZone,
    sleep: sleepSummaries,
    workouts: workoutResults,
    results
  };
}

// ----- Sleep -----

// A day can hold several sleep sessions (a night plus a nap), so each session
// becomes its own [HH:mm] entry that is merged and sorted under the sleep
// heading, exactly like workout entries. A session is de-duplicated by its id
// (or, lacking one, its bed time), so an unchanged re-push is not written twice.
async function ingestSleep(config, sleepConfig, payload, timeZone) {
  const sessions = extractSleepSessions(payload);
  const summaries = [];
  const writes = [];

  for (const session of sessions) {
    if (!session.samples.length) {
      summaries.push({ ok: false, error: "No sleep samples provided" });
      continue;
    }
    const aggregate = aggregateSleep(session.samples);
    if (!aggregate.asleepMinutes && !aggregate.inBedMinutes) {
      summaries.push({ ok: false, error: "Sleep samples contained no in-bed or asleep time" });
      continue;
    }

    const parts = getDateTimeParts(aggregate.wakeDate, timeZone);
    const heartRate = resolveAverage(session.heartRate);
    const hrv = resolveAverage(session.hrv);
    const body = formatSleepBody(aggregate, { heartRate, hrv });
    const line = `[${parts.HH}:${parts.mm}] ${body}`;

    const write = await writeDailyEntry(config, sleepConfig.output, {
      at: aggregate.wakeDate.toISOString(),
      line,
      body,
      idempotencyKey: sleepIdempotencyKey(session, aggregate),
      replayIfResultMissing: true
    });

    summaries.push({
      ok: true,
      date: parts["yyyy-MM-dd"],
      wakeAt: parts.isoLike,
      asleepMinutes: aggregate.asleepMinutes,
      inBedMinutes: aggregate.inBedMinutes,
      stages: aggregate.stages,
      heartRate,
      hrv,
      path: write.path,
      idempotent: Boolean(write.idempotent)
    });
    writes.push(write);
  }

  return { summaries, writes };
}

function extractSleepSessions(payload) {
  if (payload && Array.isArray(payload.sessions)) {
    return payload.sessions.map((session) => buildSleepSession(session));
  }
  return [buildSleepSession(payload)];
}

function buildSleepSession(source) {
  return {
    samples: extractSleepSamples(source),
    heartRate: source?.heartRate ?? source?.heartRates ?? source?.avgHeartRate,
    hrv: source?.hrv ?? source?.heartRateVariability ?? source?.hrvSdnn,
    id: firstString(source?.id, source?.uuid, source?.sessionId)
  };
}

function sleepIdempotencyKey(session, aggregate) {
  if (session.id) return `apple-sleep-${session.id.replace(/[^a-z0-9_-]+/gi, "-")}`;
  // Without an explicit id, anchor on the fall-asleep time. It identifies the
  // session (a nap has a different one) and stays stable as later stages stream
  // in, unlike the in-bed boundary which can shift between pushes.
  const start = aggregate.asleepStartDate || aggregate.startDate || aggregate.wakeDate;
  const minute = new Date(Math.floor(start.getTime() / 60000) * 60000);
  return `apple-sleep-${minute.toISOString()}`;
}

function extractSleepSamples(payload) {
  const raw = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.samples)
      ? payload.samples
      : Array.isArray(payload?.stages)
        ? payload.stages
        : [];
  const samples = [];
  for (const item of raw.slice(0, MAX_SLEEP_SAMPLES)) {
    if (!item || typeof item !== "object") continue;
    const start = toDate(item.startDate ?? item.start ?? item.startTime);
    const end = toDate(item.endDate ?? item.end ?? item.endTime);
    if (!start || !end || end <= start) continue;
    samples.push({ stage: classifySleepStage(item.value ?? item.stage ?? item.category), start, end });
  }
  return samples;
}

function classifySleepStage(value) {
  if (typeof value === "number" && SLEEP_STAGE_BY_NUMBER.has(value)) {
    return SLEEP_STAGE_BY_NUMBER.get(value);
  }
  const text = String(value ?? "").toLowerCase();
  if (text.includes("inbed")) return "inBed";
  if (text.includes("awake")) return "awake";
  if (text.includes("core")) return "core";
  if (text.includes("deep")) return "deep";
  if (text.includes("rem")) return "rem";
  if (text.includes("asleep") || text.includes("unspecified")) return "asleep";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && SLEEP_STAGE_BY_NUMBER.has(numeric)) {
    return SLEEP_STAGE_BY_NUMBER.get(numeric);
  }
  return "unknown";
}

function aggregateSleep(samples) {
  const stageMinutes = { core: 0, deep: 0, rem: 0, asleep: 0, awake: 0, inBed: 0 };
  // Wake time is the end of the whole session, i.e. the latest sample end. The
  // daily note is attributed to this wake day (a night starting before midnight
  // still lands on the morning you got up).
  let wakeDate = samples[0].end;
  let startDate = samples[0].start;
  let asleepStartDate = null;
  for (const sample of samples) {
    const minutes = (sample.end.getTime() - sample.start.getTime()) / 60000;
    if (stageMinutes[sample.stage] !== undefined) {
      stageMinutes[sample.stage] += minutes;
    }
    if (sample.end > wakeDate) wakeDate = sample.end;
    if (sample.start < startDate) startDate = sample.start;
    if (ASLEEP_STAGES.has(sample.stage) && (!asleepStartDate || sample.start < asleepStartDate)) {
      asleepStartDate = sample.start;
    }
  }

  const asleepMinutes = stageMinutes.core + stageMinutes.deep + stageMinutes.rem + stageMinutes.asleep;
  return {
    startDate,
    asleepStartDate,
    wakeDate,
    asleepMinutes,
    inBedMinutes: stageMinutes.inBed,
    stages: {
      deep: Math.round(stageMinutes.deep),
      core: Math.round(stageMinutes.core),
      rem: Math.round(stageMinutes.rem),
      awake: Math.round(stageMinutes.awake)
    }
  };
}

function formatSleepBody(aggregate, { heartRate, hrv }) {
  const segments = [];

  const bedSuffix = aggregate.inBedMinutes > 0
    ? `（卧床${formatSleepDuration(aggregate.inBedMinutes)}）`
    : "";
  segments.push(`睡眠 ${formatSleepDuration(aggregate.asleepMinutes)}${bedSuffix}`);

  const stageParts = [];
  if (aggregate.stages.deep > 0) stageParts.push(`深睡${formatSleepDuration(aggregate.stages.deep)}`);
  if (aggregate.stages.core > 0) stageParts.push(`核心${formatSleepDuration(aggregate.stages.core)}`);
  if (aggregate.stages.rem > 0) stageParts.push(`REM${formatSleepDuration(aggregate.stages.rem)}`);
  if (aggregate.stages.awake > 0) stageParts.push(`清醒${formatSleepDuration(aggregate.stages.awake)}`);
  if (stageParts.length) segments.push(stageParts.join("·"));

  const vitalParts = [];
  if (positiveNumber(heartRate)) vitalParts.push(`平均心率${Math.round(heartRate)} bpm`);
  if (positiveNumber(hrv)) vitalParts.push(`HRV ${Math.round(hrv)} ms`);
  if (vitalParts.length) segments.push(vitalParts.join("·"));

  return segments.join("｜");
}

function formatSleepDuration(minutes) {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0) return `${hours}小时${pad2(mins)}分`;
  return `${mins}分`;
}

// ----- Workouts -----

async function ingestWorkouts(config, workoutsConfig, rawWorkouts, timeZone) {
  const minSeconds = Math.max(0, Number(workoutsConfig.minDurationMinutes) || 0) * 60;
  const activities = rawWorkouts
    .map((raw) => normalizeWorkout(raw, timeZone))
    .filter((activity) => activity && workoutDurationSeconds(activity) >= minSeconds)
    .sort((left, right) => left.startDate - right.startDate);

  const entries = [];
  const writes = [];
  for (const activity of activities) {
    const line = formatStravaActivityEntry(activity);
    const body = line.replace(/^\[\d{2}:\d{2}\]\s*/, "");
    const write = await writeDailyEntry(config, workoutsConfig.output, {
      at: activity.startDate.toISOString(),
      line,
      body,
      idempotencyKey: `apple-workout-${activity.id}`,
      replayIfResultMissing: true
    });
    writes.push(write);
    entries.push({ id: activity.id, at: activity.startDate.toISOString(), path: write.path, idempotent: Boolean(write.idempotent) });
  }

  return { entries, writes };
}

function normalizeWorkout(raw, timeZone) {
  if (!raw || typeof raw !== "object") return null;
  const start = toDate(raw.startDate ?? raw.start ?? raw.startTime);
  if (!start) return null;
  const end = toDate(raw.endDate ?? raw.end ?? raw.endTime);
  const parts = getDateTimeParts(start, timeZone);
  const type = workoutTypeLabel(raw);
  let name = cleanText(raw.name ?? raw.title ?? "");
  if (name && name === type) name = "";
  const durationSeconds = numberOrNull(raw.duration ?? raw.movingTime)
    ?? (end ? (end.getTime() - start.getTime()) / 1000 : null);

  return {
    id: workoutId(raw, start, type),
    name,
    type,
    startDate: start,
    HH: parts.HH,
    mm: parts.mm,
    movingTimeSeconds: durationSeconds,
    elapsedTimeSeconds: end ? (end.getTime() - start.getTime()) / 1000 : null,
    averageHeartrate: numberOrNull(raw.averageHeartRate ?? raw.avgHeartRate ?? raw.averageHeartrate),
    maxHeartrate: numberOrNull(raw.maxHeartRate ?? raw.maximumHeartRate ?? raw.maxHeartrate),
    distanceMeters: resolveDistanceMeters(raw),
    elevationGainMeters: numberOrNull(raw.elevationGain ?? raw.totalElevationGain ?? raw.elevation),
    averageSpeed: numberOrNull(raw.averageSpeed),
    maxSpeed: numberOrNull(raw.maxSpeed),
    calories: resolveCalories(raw),
    deviceName: cleanDeviceName(raw.deviceName ?? raw.device ?? raw.sourceName ?? raw.source ?? "")
  };
}

function workoutDurationSeconds(activity) {
  if (positiveNumber(activity.movingTimeSeconds)) return activity.movingTimeSeconds;
  if (positiveNumber(activity.elapsedTimeSeconds)) return activity.elapsedTimeSeconds;
  return 0;
}

function workoutTypeLabel(raw) {
  const explicit = firstString(
    raw.activityName,
    raw.workoutActivityTypeName,
    typeof raw.activityType === "string" ? raw.activityType : "",
    typeof raw.workoutActivityType === "string" ? raw.workoutActivityType : "",
    raw.type,
    raw.sport
  );
  if (explicit && !/^\d+$/.test(explicit)) return cleanText(explicit);
  const numeric = Number(raw.workoutActivityType ?? raw.activityType ?? raw.type);
  if (Number.isFinite(numeric) && HK_WORKOUT_TYPES.has(numeric)) return HK_WORKOUT_TYPES.get(numeric);
  return cleanText(explicit) || "Workout";
}

function workoutId(raw, start, type) {
  const explicit = firstString(raw.uuid, raw.id, raw.workoutId, raw.guid);
  if (explicit) return explicit.replace(/[^a-z0-9_-]+/gi, "-");
  return `${start.toISOString()}-${type}`.replace(/[^a-z0-9_-]+/gi, "-");
}

function resolveDistanceMeters(raw) {
  if (raw.distanceMeters !== undefined) return numberOrNull(raw.distanceMeters);
  if (raw.distanceKm !== undefined) {
    const km = numberOrNull(raw.distanceKm);
    return km === null ? null : km * 1000;
  }
  // HealthKit distance quantities are reported in meters.
  return numberOrNull(raw.totalDistance ?? raw.distance);
}

function resolveCalories(raw) {
  return numberOrNull(raw.totalEnergyBurned ?? raw.activeEnergyBurned ?? raw.calories ?? raw.energyBurned);
}

// ----- Shared write path -----

async function writeDailyEntry(config, output, entry) {
  const target = output?.target === "time-slot" ? "time-slot" : "heading";

  if (target === "time-slot") {
    return executeOperation(config, {
      operation: "append_daily_by_time",
      at: entry.at,
      content: entry.body,
      idempotencyKey: entry.idempotencyKey,
      replayIfResultMissing: Boolean(entry.replayIfResultMissing)
    });
  }

  const heading = parseHeadingMarkdown(output?.headingMarkdown, config.dailyNote.headingLevel);
  const insertAfter = resolveInsertAfterHeading(config, output);
  return executeOperation(config, {
    operation: "upsert_daily_separated_heading",
    at: entry.at,
    heading: heading.heading,
    headingLevel: heading.headingLevel,
    insertAfterHeading: insertAfter.heading,
    insertAfterHeadingLevel: insertAfter.headingLevel,
    content: entry.line,
    idempotencyKey: entry.idempotencyKey,
    replayIfResultMissing: true
  });
}

function resolveInsertAfterHeading(config, output) {
  const configured = String(output?.insertAfterHeadingMarkdown || "").trim();
  if (configured) return parseHeadingMarkdown(configured, config.dailyNote.headingLevel);
  const lastSlot = [...(config.dailyNote?.slots || [])].reverse().find((slot) => slot?.heading);
  return {
    heading: lastSlot?.heading || "",
    headingLevel: config.dailyNote.headingLevel || 2
  };
}

// ----- helpers -----

function normalizeWorkoutList(value) {
  if (Array.isArray(value)) return value.slice(0, MAX_WORKOUTS);
  if (value && typeof value === "object") return [value];
  return [];
}

function resolveAverage(value) {
  if (positiveNumber(value)) return value;
  const samples = Array.isArray(value) ? value : Array.isArray(value?.samples) ? value.samples : null;
  if (!samples || !samples.length) return null;
  const numbers = samples
    .map((item) => (typeof item === "number" ? item : numberOrNull(item?.value ?? item?.bpm ?? item?.ms)))
    .filter((number) => positiveNumber(number));
  if (!numbers.length) return null;
  return numbers.reduce((sum, number) => sum + number, 0) / numbers.length;
}

function toDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function cleanDeviceName(value) {
  return String(value || "").replace(/[\r\n[\]|]/g, " ").replace(/\s+/g, " ").trim();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
