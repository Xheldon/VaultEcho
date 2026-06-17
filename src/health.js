import { parseHeadingMarkdown } from "./connectors.js";
import {
  DEFAULT_APPLE_HEALTH_SLEEP_TEMPLATE,
  DEFAULT_APPLE_HEALTH_WORKOUT_TEMPLATE
} from "./config.js";
import { getDateTimeParts } from "./time.js";
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

// Readable labels for the common HKWorkoutActivityType string values the app
// sends (lowercased, HKWorkoutActivityType prefix stripped). Unknown types fall
// back to the raw string.
const WORKOUT_TYPE_LABELS = new Map([
  ["running", "跑步"],
  ["walking", "步行"],
  ["cycling", "骑行"],
  ["hiking", "徒步"],
  ["swimming", "游泳"],
  ["yoga", "瑜伽"],
  ["rowing", "划船"],
  ["elliptical", "椭圆机"],
  ["functionalstrengthtraining", "力量训练"],
  ["traditionalstrengthtraining", "力量训练"],
  ["highintensityintervaltraining", "高强度间歇"],
  ["coretraining", "核心训练"],
  ["pilates", "普拉提"],
  ["dance", "舞蹈"],
  ["cardiodance", "有氧舞蹈"],
  ["stairclimbing", "爬楼"],
  ["jumprope", "跳绳"],
  ["badminton", "羽毛球"],
  ["tabletennis", "乒乓球"],
  ["basketball", "篮球"],
  ["soccer", "足球"],
  ["tennis", "网球"],
  ["golf", "高尔夫"],
  ["climbing", "攀岩"],
  ["skatingsports", "滑冰"],
  ["downhillskiing", "滑雪"],
  ["cooldown", "放松"]
]);

export async function ingestHealth(config, params = {}) {
  const appleHealth = config.appleHealth || {};
  if (!appleHealth.enabled) {
    return { ok: false, operation: "health/ingest", error: "Apple Health ingest is not enabled" };
  }

  const timeZone = config.dailyNote.timeZone;
  const results = [];
  let sleepSummaries = [];
  const workoutResults = [];

  let sleepPayload = params.sleep ?? params.sleepAnalysis;
  let workoutsPayload = normalizeWorkoutList(params.workouts ?? params.workout);
  // Accept a bare top-level body without a sleep/workouts wrapper by inferring
  // its kind from the shape (the iOS app may POST a sleep object directly).
  if (sleepPayload === undefined && !workoutsPayload.length) {
    if (looksLikeSleepPayload(params)) sleepPayload = params;
    else if (looksLikeWorkoutPayload(params)) workoutsPayload = [params];
  }

  if (sleepPayload !== undefined && sleepPayload !== null && appleHealth.sleep?.enabled) {
    const sleep = await ingestSleep(config, appleHealth.sleep, sleepPayload, timeZone);
    sleepSummaries = sleep.summaries;
    results.push(...sleep.writes);
  }

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

// Dedicated sleep endpoint: the request body is the sleep payload itself (one
// session, or { sessions: [...] }); a { sleep: {...} } wrapper is also accepted.
export async function ingestHealthSleep(config, params = {}) {
  const appleHealth = config.appleHealth || {};
  if (!appleHealth.enabled) {
    return { ok: false, operation: "health/sleep", error: "Apple Health ingest is not enabled" };
  }
  if (!appleHealth.sleep?.enabled) {
    return { ok: false, operation: "health/sleep", error: "Apple Health sleep ingest is disabled" };
  }
  const timeZone = config.dailyNote.timeZone;
  const payload = params.sleep ?? params.sleepAnalysis ?? params;
  const sleep = await ingestSleep(config, appleHealth.sleep, payload, timeZone);
  return { ok: true, operation: "health/sleep", timeZone, sleep: sleep.summaries, results: sleep.writes };
}

// Dedicated workouts endpoint: the request body is the workout payload itself (a
// single workout object, or { workouts: [...] }).
export async function ingestHealthWorkouts(config, params = {}) {
  const appleHealth = config.appleHealth || {};
  if (!appleHealth.enabled) {
    return { ok: false, operation: "health/workouts", error: "Apple Health ingest is not enabled" };
  }
  if (!appleHealth.workouts?.enabled) {
    return { ok: false, operation: "health/workouts", error: "Apple Health workout ingest is disabled" };
  }
  const timeZone = config.dailyNote.timeZone;
  // This endpoint is workout-specific, so a bare body is treated as one workout.
  const list = Array.isArray(params.workouts)
    ? params.workouts.slice(0, MAX_WORKOUTS)
    : params.workout
      ? [params.workout]
      : [params];
  const written = await ingestWorkouts(config, appleHealth.workouts, list, timeZone);
  return { ok: true, operation: "health/workouts", timeZone, workouts: written.entries, results: written.writes };
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
    if (!session.samples.length && !isPlainObject(session.preStages)) {
      summaries.push({ ok: false, error: "No sleep segments/samples or stage summary provided" });
      continue;
    }
    const aggregate = aggregateSleep(session);
    if (!aggregate.wakeDate) {
      summaries.push({ ok: false, error: "Could not determine wake time (need segments, or sleepEnd)" });
      continue;
    }
    if (!aggregate.asleepMinutes && !aggregate.inBedMinutes) {
      summaries.push({ ok: false, error: "Sleep data contained no in-bed or asleep time" });
      continue;
    }

    const parts = getDateTimeParts(aggregate.wakeDate, timeZone);
    const vars = buildSleepVars(aggregate, session, timeZone);
    const entry = buildEntryFromTemplate(sleepConfig.output, DEFAULT_APPLE_HEALTH_SLEEP_TEMPLATE, vars, vars.wakeTime);

    const write = await writeDailyEntry(config, sleepConfig.output, {
      at: aggregate.wakeDate.toISOString(),
      line: entry.line,
      body: entry.body,
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
      heartRate: vars.avgHeartRate ?? null,
      hrv: vars.hrv ?? null,
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
  const vitals = isPlainObject(source?.vitals) ? source.vitals : {};
  return {
    samples: extractSleepSamples(source),
    // Pre-aggregated totals the app may have already computed; preferred over
    // recomputing from segments when present.
    preStages: isPlainObject(source?.stages) ? source.stages : null,
    totalAsleepSec: numberOrNull(source?.totalAsleepSec),
    timeInBedSec: numberOrNull(source?.timeInBedSec),
    sleepStart: source?.sleepStart,
    sleepEnd: source?.sleepEnd,
    awakenings: numberOrNull(source?.awakenings),
    heartRate: source?.heartRate ?? source?.heartRates ?? source?.avgHeartRate
      ?? vitals.averageHeartRateBpm ?? vitals.avgHeartRateBpm ?? vitals.heartRate,
    hrv: source?.hrv ?? source?.heartRateVariability ?? source?.hrvSdnn
      ?? vitals.averageHRVms ?? vitals.hrvMs ?? vitals.hrv,
    respiratoryRate: source?.respiratoryRate ?? source?.respiratory ?? source?.breathingRate
      ?? vitals.respiratoryRate ?? vitals.respiratoryRateBpm,
    wristTemperature: source?.wristTemperature ?? source?.wristTemp ?? source?.temperature
      ?? vitals.wristTemperatureDeltaC ?? vitals.wristTemperatureC ?? vitals.wristTemperature,
    spo2: source?.spo2 ?? source?.oxygenSaturation ?? source?.bloodOxygen
      ?? vitals.oxygenSaturation ?? vitals.spo2,
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
    : Array.isArray(payload?.segments)
      ? payload.segments
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

// Aggregates one session. Stage durations and totals are taken from the app's
// pre-computed values (the `stages`/`totalAsleepSec`/`timeInBedSec` fields) when
// present, otherwise derived from the raw segments. Wake time anchors the daily
// note to the wake day; a night that starts before midnight still lands on the
// morning you got up.
function aggregateSleep(session) {
  const samples = Array.isArray(session.samples) ? session.samples : [];
  const stageMinutes = { core: 0, deep: 0, rem: 0, asleep: 0, awake: 0, inBed: 0 };
  let segmentWake = null;
  let segmentStart = null;
  let asleepStartDate = null;
  let inBedStartDate = null;
  let awakeCount = 0;
  for (const sample of samples) {
    const minutes = (sample.end.getTime() - sample.start.getTime()) / 60000;
    if (stageMinutes[sample.stage] !== undefined) {
      stageMinutes[sample.stage] += minutes;
    }
    if (!segmentWake || sample.end > segmentWake) segmentWake = sample.end;
    if (!segmentStart || sample.start < segmentStart) segmentStart = sample.start;
    if (ASLEEP_STAGES.has(sample.stage) && (!asleepStartDate || sample.start < asleepStartDate)) {
      asleepStartDate = sample.start;
    }
    if (sample.stage === "inBed" && (!inBedStartDate || sample.start < inBedStartDate)) {
      inBedStartDate = sample.start;
    }
    if (sample.stage === "awake") awakeCount += 1;
  }

  const pre = isPlainObject(session.preStages) ? session.preStages : null;
  const stages = pre
    ? {
        deep: Math.round(secToMin(pre.deepSec)),
        core: Math.round(secToMin(pre.coreSec)),
        rem: Math.round(secToMin(pre.remSec)),
        awake: Math.round(secToMin(pre.awakeSec))
      }
    : {
        deep: Math.round(stageMinutes.deep),
        core: Math.round(stageMinutes.core),
        rem: Math.round(stageMinutes.rem),
        awake: Math.round(stageMinutes.awake)
      };

  const asleepMinutes = positiveNumber(session.totalAsleepSec)
    ? secToMin(session.totalAsleepSec)
    : pre
      ? secToMin((pre.coreSec || 0) + (pre.deepSec || 0) + (pre.remSec || 0) + (pre.unspecifiedSec || 0))
      : stageMinutes.core + stageMinutes.deep + stageMinutes.rem + stageMinutes.asleep;
  const inBedMinutes = positiveNumber(session.timeInBedSec) ? secToMin(session.timeInBedSec) : stageMinutes.inBed;

  const wakeDate = toDate(session.sleepEnd) || segmentWake;
  const bedDate = toDate(session.sleepStart) || asleepStartDate || segmentStart;
  const latencyMinutes = inBedStartDate && bedDate && bedDate > inBedStartDate
    ? (bedDate.getTime() - inBedStartDate.getTime()) / 60000
    : 0;
  const awakenings = Number.isInteger(session.awakenings) && session.awakenings >= 0
    ? session.awakenings
    : awakeCount;

  return {
    startDate: segmentStart || bedDate,
    asleepStartDate: bedDate,
    wakeDate,
    asleepMinutes,
    inBedMinutes,
    latencyMinutes,
    awakenings,
    stages
  };
}

// Builds the placeholder variables for the sleep template. Only meaningful
// values are set; absent ones stay undefined so conditional sections drop them.
function buildSleepVars(aggregate, session, timeZone) {
  const vars = {
    wakeTime: timeOfDay(aggregate.wakeDate, timeZone),
    date: getDateTimeParts(aggregate.wakeDate, timeZone)["yyyy-MM-dd"],
    asleep: formatSleepDuration(aggregate.asleepMinutes)
  };
  if (aggregate.asleepStartDate) vars.bedTime = timeOfDay(aggregate.asleepStartDate, timeZone);
  if (aggregate.inBedMinutes > 0) vars.inBed = formatSleepDuration(aggregate.inBedMinutes);
  if (aggregate.stages.deep > 0) vars.deep = formatSleepDuration(aggregate.stages.deep);
  if (aggregate.stages.core > 0) vars.core = formatSleepDuration(aggregate.stages.core);
  if (aggregate.stages.rem > 0) vars.rem = formatSleepDuration(aggregate.stages.rem);
  if (aggregate.stages.awake > 0) vars.awake = formatSleepDuration(aggregate.stages.awake);
  if (aggregate.latencyMinutes > 0) vars.latency = formatSleepDuration(aggregate.latencyMinutes);
  if (aggregate.awakenings > 0) vars.awakenings = aggregate.awakenings;

  const hr = resolveStats(session.heartRate);
  if (positiveNumber(hr.avg)) vars.avgHeartRate = Math.round(hr.avg);
  if (positiveNumber(hr.min)) vars.minHeartRate = Math.round(hr.min);
  if (positiveNumber(hr.max)) vars.maxHeartRate = Math.round(hr.max);
  const hrv = resolveAverage(session.hrv);
  if (positiveNumber(hrv)) vars.hrv = Math.round(hrv);
  const respiratoryRate = resolveAverage(session.respiratoryRate);
  if (positiveNumber(respiratoryRate)) vars.respiratoryRate = round1(respiratoryRate);
  const wristTemperature = resolveAverage(session.wristTemperature);
  if (wristTemperature !== null && wristTemperature !== 0) vars.wristTemperature = round1(wristTemperature);
  const spo2 = resolveAverage(session.spo2);
  if (positiveNumber(spo2)) vars.spo2 = Math.round(spo2 <= 1 ? spo2 * 100 : spo2);

  // Convenience groups used by the default template (stage breakdown joined by
  // "·", and the two core vitals), so the default output stays compact.
  const stageParts = [
    vars.deep && `深睡${vars.deep}`,
    vars.core && `核心${vars.core}`,
    vars.rem && `REM${vars.rem}`,
    vars.awake && `清醒${vars.awake}`
  ].filter(Boolean);
  if (stageParts.length) vars.stages = stageParts.join("·");
  const vitalParts = [
    vars.avgHeartRate && `平均心率${vars.avgHeartRate} bpm`,
    vars.hrv && `HRV ${vars.hrv} ms`,
    vars.respiratoryRate && `呼吸${vars.respiratoryRate}次/分`,
    vars.spo2 && `血氧${vars.spo2}%`,
    vars.wristTemperature && `手腕温度${vars.wristTemperature}℃`
  ].filter(Boolean);
  if (vitalParts.length) vars.vitals = vitalParts.join("·");

  return vars;
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
    const vars = buildWorkoutVars(activity);
    const entry = buildEntryFromTemplate(workoutsConfig.output, DEFAULT_APPLE_HEALTH_WORKOUT_TEMPLATE, vars, vars.time);
    const write = await writeDailyEntry(config, workoutsConfig.output, {
      at: activity.startDate.toISOString(),
      line: entry.line,
      body: entry.body,
      idempotencyKey: `apple-workout-${activity.id}`,
      replayIfResultMissing: true
    });
    writes.push(write);
    entries.push({ id: activity.id, at: activity.startDate.toISOString(), path: write.path, idempotent: Boolean(write.idempotent) });
  }

  return { entries, writes };
}

function normalizeWorkout(raw, timeZone) {
  if (!isPlainObject(raw)) return null;
  const end = toDate(raw.endDate ?? raw.end ?? raw.endTime);
  const durationSeconds = numberOrNull(raw.duration ?? raw.movingTime ?? raw.durationSec);

  // The payload may omit a start time; derive it from the route's first point or
  // from end - duration so GPS workouts (which only carry `end`) still land.
  let start = toDate(raw.startDate ?? raw.start ?? raw.startTime);
  if (!start) {
    const routeStart = Array.isArray(raw.route) && raw.route.length ? toDate(raw.route[0]?.timestamp) : null;
    if (routeStart) start = routeStart;
    else if (end && positiveNumber(durationSeconds)) start = new Date(end.getTime() - durationSeconds * 1000);
  }
  if (!start) return null;

  const parts = getDateTimeParts(start, timeZone);
  const type = workoutTypeLabel(raw);
  let name = cleanText(raw.name ?? raw.title ?? "");
  if (name && name === type) name = "";
  const movingTimeSeconds = positiveNumber(durationSeconds)
    ? durationSeconds
    : (end ? (end.getTime() - start.getTime()) / 1000 : null);
  const distanceMeters = resolveDistanceMeters(raw);
  const heartRate = isPlainObject(raw.heartRate) ? raw.heartRate : {};
  const avgPaceSecPerKm = numberOrNull(raw.avgPaceSecPerKm ?? raw.averagePaceSecPerKm ?? raw.averagePaceSecondsPerKm)
    ?? (positiveNumber(distanceMeters) && positiveNumber(movingTimeSeconds)
      ? movingTimeSeconds / (distanceMeters / 1000)
      : null);

  return {
    id: workoutId(raw, start, type),
    name,
    type,
    startDate: start,
    HH: parts.HH,
    mm: parts.mm,
    date: parts["yyyy-MM-dd"],
    movingTimeSeconds,
    elapsedTimeSeconds: end ? (end.getTime() - start.getTime()) / 1000 : null,
    averageHeartrate: numberOrNull(raw.averageHeartRate ?? raw.avgHeartRate ?? raw.averageHeartrate
      ?? heartRate.averageBpm ?? heartRate.avgBpm ?? heartRate.average),
    maxHeartrate: numberOrNull(raw.maxHeartRate ?? raw.maximumHeartRate ?? raw.maxHeartrate
      ?? heartRate.maxBpm ?? heartRate.max),
    minHeartrate: numberOrNull(raw.minHeartRate ?? raw.minimumHeartRate ?? heartRate.minBpm ?? heartRate.min),
    distanceMeters,
    elevationGainMeters: numberOrNull(raw.elevationGain ?? raw.totalElevationGain ?? raw.elevation ?? raw.elevationGainMeters),
    averageSpeed: numberOrNull(raw.averageSpeed ?? raw.avgSpeed),
    maxSpeed: numberOrNull(raw.maxSpeed),
    avgPaceSecPerKm,
    flightsClimbed: numberOrNull(raw.flightsClimbed ?? raw.flights),
    steps: numberOrNull(raw.steps ?? raw.stepCount),
    calories: resolveCalories(raw),
    deviceName: cleanDeviceName(raw.deviceName ?? raw.device ?? raw.sourceName ?? raw.source ?? "")
  };
}

// Builds the placeholder variables for the workout template. Only meaningful
// values are set; absent ones stay undefined so conditional sections drop them.
function buildWorkoutVars(activity) {
  const vars = { time: `${activity.HH}:${activity.mm}`, date: activity.date, type: activity.type };
  if (activity.name) vars.name = activity.name;
  if (positiveNumber(activity.movingTimeSeconds)) vars.duration = formatWorkoutDuration(activity.movingTimeSeconds);
  // Only surface elapsed time when it differs meaningfully from moving time
  // (a continuous workout has them ~equal, so showing both is noise).
  if (
    positiveNumber(activity.elapsedTimeSeconds) &&
    Math.abs(activity.elapsedTimeSeconds - (activity.movingTimeSeconds || 0)) >= 60
  ) {
    vars.totalDuration = formatWorkoutDuration(activity.elapsedTimeSeconds);
  }
  if (positiveNumber(activity.averageHeartrate)) vars.avgHeartRate = Math.round(activity.averageHeartrate);
  if (positiveNumber(activity.maxHeartrate)) vars.maxHeartRate = Math.round(activity.maxHeartrate);
  if (positiveNumber(activity.minHeartrate)) vars.minHeartRate = Math.round(activity.minHeartrate);
  if (positiveNumber(activity.distanceMeters)) vars.distance = (activity.distanceMeters / 1000).toFixed(2);
  if (finiteNumber(activity.elevationGainMeters) && activity.elevationGainMeters !== 0) {
    vars.elevationGain = Math.round(activity.elevationGainMeters);
  }
  if (positiveNumber(activity.averageSpeed)) vars.avgSpeed = (activity.averageSpeed * 3.6).toFixed(1);
  if (positiveNumber(activity.maxSpeed)) vars.maxSpeed = (activity.maxSpeed * 3.6).toFixed(1);
  if (positiveNumber(activity.avgPaceSecPerKm)) vars.avgPace = formatPace(activity.avgPaceSecPerKm);
  if (positiveNumber(activity.flightsClimbed)) vars.flightsClimbed = Math.round(activity.flightsClimbed);
  if (positiveNumber(activity.steps)) vars.steps = Math.round(activity.steps);
  if (positiveNumber(activity.calories)) vars.calories = Math.round(activity.calories);
  if (activity.deviceName) vars.device = activity.deviceName;
  return vars;
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
  if (explicit && !/^\d+$/.test(explicit)) {
    const key = explicit.replace(/^HKWorkoutActivityType/i, "").toLowerCase();
    return WORKOUT_TYPE_LABELS.get(key) || cleanText(explicit);
  }
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
  return numberOrNull(
    raw.totalEnergyBurned ?? raw.activeEnergyBurned ?? raw.activeEnergyKcal ?? raw.calories ?? raw.energyBurned
  );
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

// ----- template rendering -----

// Renders the configured line and derives the heading entry (with the [HH:mm]
// prefix needed for sorting) and the time-slot body (without the prefix).
function buildEntryFromTemplate(output, defaultTemplate, vars, timeStr) {
  const template = String(output?.contentTemplate || "").trim() || defaultTemplate;
  let rendered = renderHealthTemplate(template, vars);
  if (!/^\[\d{2}:\d{2}\]/.test(rendered)) {
    // The heading block sorts by the leading [HH:mm]; ensure one is present even
    // if the user removed it from the template.
    rendered = `[${timeStr}] ${rendered}`.trim();
  }
  const body = rendered.replace(/^\[\d{2}:\d{2}\]\s*/, "");
  return { line: rendered, body };
}

// A tiny template engine: {{#key}}...{{/key}} renders the inner block only when
// the variable is present, and {{key}} substitutes the value (empty when absent).
// Conditional sections let absent metrics drop their own label and separator.
function renderHealthTemplate(template, vars) {
  const withSections = template.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (match, key, inner) => (isPresent(vars[key]) ? inner : "")
  );
  const substituted = withSections.replace(
    /\{\{(\w+)\}\}/g,
    (match, key) => (isPresent(vars[key]) ? String(vars[key]) : "")
  );
  return substituted.replace(/[ \t]{2,}/g, " ").trim();
}

function isPresent(value) {
  if (value === undefined || value === null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value) && value !== 0;
  return true;
}

// ----- helpers -----

function normalizeWorkoutList(value) {
  if (Array.isArray(value)) return value.slice(0, MAX_WORKOUTS);
  if (looksLikeWorkoutPayload(value)) return [value];
  return [];
}

function looksLikeSleepPayload(value) {
  if (!isPlainObject(value)) return false;
  return (
    Array.isArray(value.segments) ||
    Array.isArray(value.samples) ||
    Array.isArray(value.sessions) ||
    isPlainObject(value.stages) ||
    value.sleepStart !== undefined ||
    value.totalAsleepSec !== undefined
  );
}

function looksLikeWorkoutPayload(value) {
  if (!isPlainObject(value)) return false;
  const hasTime =
    value.startDate !== undefined || value.start !== undefined || value.startTime !== undefined ||
    value.endDate !== undefined || value.end !== undefined || value.endTime !== undefined ||
    value.duration !== undefined;
  const hasType =
    value.workoutActivityType !== undefined ||
    value.activityType !== undefined ||
    value.type !== undefined ||
    value.exerciseType !== undefined ||
    value.sport !== undefined;
  return hasTime && hasType;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function secToMin(seconds) {
  const number = Number(seconds);
  return Number.isFinite(number) ? number / 60 : 0;
}

function resolveAverage(value) {
  return resolveStats(value).avg ?? null;
}

// Returns { avg, min, max } from either a single number or an array of samples
// ({ value }/{ bpm }/{ ms } or bare numbers).
function resolveStats(value) {
  // A single number is just an average; min/max are only known from samples or
  // an explicit object so they are not fabricated from one value.
  if (typeof value === "number" && Number.isFinite(value)) return { avg: value };
  if (isPlainObject(value) && !Array.isArray(value.samples)) {
    return {
      avg: numberOrNull(value.averageBpm ?? value.avgBpm ?? value.average ?? value.avg),
      min: numberOrNull(value.minBpm ?? value.min),
      max: numberOrNull(value.maxBpm ?? value.max)
    };
  }
  const samples = Array.isArray(value) ? value : Array.isArray(value?.samples) ? value.samples : null;
  if (!samples || !samples.length) return {};
  const numbers = samples
    .map((item) => (typeof item === "number" ? item : numberOrNull(item?.value ?? item?.bpm ?? item?.ms)))
    .filter((number) => Number.isFinite(number));
  if (!numbers.length) return {};
  return {
    avg: numbers.reduce((sum, number) => sum + number, 0) / numbers.length,
    min: Math.min(...numbers),
    max: Math.max(...numbers)
  };
}

function formatWorkoutDuration(seconds) {
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) return `${hours}小时${pad2(minutes)}分`;
  if (secs > 0) return `${minutes}分${pad2(secs)}秒`;
  return `${minutes}分钟`;
}

function formatPace(secondsPerKm) {
  const total = Math.round(secondsPerKm);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}'${pad2(secs)}"`;
}

function timeOfDay(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  return `${parts.HH}:${parts.mm}`;
}

function round1(value) {
  return Math.round(value * 10) / 10;
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

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
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
