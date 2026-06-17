import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ingestHealth, ingestHealthSleep, ingestHealthWorkouts } from "../src/health.js";

test("sleep ingest writes one aggregated summary under the wake-day heading", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);

  const result = await ingestHealth(config, {
    sleep: {
      samples: [
        { value: "asleepDeep", startDate: "2026-06-16T23:30:00+08:00", endDate: "2026-06-17T00:42:00+08:00" },
        { value: "asleepCore", startDate: "2026-06-17T00:42:00+08:00", endDate: "2026-06-17T05:02:00+08:00" },
        { value: "asleepREM", startDate: "2026-06-17T05:02:00+08:00", endDate: "2026-06-17T06:42:00+08:00" },
        { value: "awake", startDate: "2026-06-17T06:42:00+08:00", endDate: "2026-06-17T07:02:00+08:00" },
        { value: "inBed", startDate: "2026-06-16T23:25:00+08:00", endDate: "2026-06-17T07:05:00+08:00" }
      ],
      heartRate: 52,
      hrv: 48
    }
  });

  assert.equal(result.ok, true);
  // Night that ends on the 17th is attributed to the 17th daily note.
  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  assert.match(
    daily,
    /\[07:05\] 睡眠 7小时12分（卧床7小时40分）｜深睡1小时12分·核心4小时20分·REM1小时40分·清醒20分｜平均心率52 bpm·HRV 48 ms/
  );
  assert.match(daily, /## 今日睡眠/);
});

test("multiple sleep sessions (night plus nap) accumulate under 今日睡眠, sorted by time", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);

  // Night sleep, pushed on its own.
  await ingestHealth(config, {
    sleep: {
      samples: [
        { value: "asleepDeep", startDate: "2026-06-16T23:30:00+08:00", endDate: "2026-06-17T01:00:00+08:00" },
        { value: "asleepCore", startDate: "2026-06-17T01:00:00+08:00", endDate: "2026-06-17T07:10:00+08:00" }
      ],
      heartRate: 50
    }
  });

  // Afternoon nap, pushed separately on the same day.
  await ingestHealth(config, {
    sleep: {
      samples: [
        { value: "asleepCore", startDate: "2026-06-17T14:00:00+08:00", endDate: "2026-06-17T14:35:00+08:00" }
      ]
    }
  });

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  // One heading, two entries, the night before the nap.
  assert.equal(daily.match(/## 今日睡眠/g).length, 1);
  const sleepLines = daily.split("\n").filter((line) => /^\[\d{2}:\d{2}\] 睡眠/.test(line));
  assert.equal(sleepLines.length, 2);
  assert.match(sleepLines[0], /^\[07:10\]/);
  assert.match(sleepLines[1], /^\[14:35\]/);
  // One blank line between the two entries (same spacing as the workout block).
  assert.match(daily, /\[07:10\] 睡眠[^\n]*\n\n\[14:35\] 睡眠/);
});

test("re-pushing the same sleep session is de-duplicated", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  const payload = {
    sleep: {
      samples: [
        { value: "asleepDeep", startDate: "2026-06-16T23:30:00+08:00", endDate: "2026-06-17T01:00:00+08:00" },
        { value: "asleepCore", startDate: "2026-06-17T01:00:00+08:00", endDate: "2026-06-17T07:10:00+08:00" }
      ],
      heartRate: 50
    }
  };

  await ingestHealth(config, payload);
  const second = await ingestHealth(config, payload);
  assert.equal(second.sleep[0].idempotent, true);

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  const sleepLines = daily.split("\n").filter((line) => /^\[\d{2}:\d{2}\] 睡眠/.test(line));
  assert.equal(sleepLines.length, 1);
});

test("a single request can carry multiple sleep sessions via sleep.sessions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);

  await ingestHealth(config, {
    sleep: {
      sessions: [
        { samples: [{ value: "asleepCore", startDate: "2026-06-16T23:30:00+08:00", endDate: "2026-06-17T07:10:00+08:00" }], heartRate: 50 },
        { samples: [{ value: "asleepCore", startDate: "2026-06-17T14:00:00+08:00", endDate: "2026-06-17T14:35:00+08:00" }] }
      ]
    }
  });

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  const sleepLines = daily.split("\n").filter((line) => /^\[\d{2}:\d{2}\] 睡眠/.test(line));
  assert.equal(sleepLines.length, 2);
});

test("workout ingest writes a Strava-style activity entry under the workout heading", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);

  const result = await ingestHealth(config, {
    workouts: [
      {
        uuid: "WORKOUT-1",
        type: "Badminton",
        startDate: "2026-06-17T09:47:00+08:00",
        duration: 1800,
        averageHeartRate: 120,
        maxHeartRate: 165,
        totalEnergyBurned: 250,
        deviceName: "Apple Watch Series 10"
      }
    ]
  });

  assert.equal(result.ok, true);
  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  assert.match(daily, /## 今日运动/);
  assert.match(
    daily,
    /\[09:47\] 羽毛球，运动时间 30分钟，平均心率 120 bpm，最大心率 165 bpm，卡路里 250 kcal，\[\[Apple Watch Series 10\]\]。/
  );
});

test("re-pushing the same workout uuid does not duplicate", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  const payload = {
    workouts: [
      { uuid: "DUP-1", type: "Running", startDate: "2026-06-17T18:05:00+08:00", duration: 1800, distanceMeters: 5200 }
    ]
  };

  await ingestHealth(config, payload);
  const second = await ingestHealth(config, payload);
  assert.equal(second.workouts[0].idempotent, true);

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  const runningLines = daily.split("\n").filter((line) => line.includes("跑步"));
  assert.equal(runningLines.length, 1);
});

test("time-slot target routes the workout into the matching slot heading without a fixed heading", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  config.appleHealth.workouts.output.target = "time-slot";

  await ingestHealth(config, {
    workouts: [
      { uuid: "SLOT-1", type: "Running", startDate: "2026-06-17T09:47:00+08:00", duration: 1800 }
    ]
  });

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  assert.match(daily, /## Morning/);
  assert.doesNotMatch(daily, /## 今日运动/);
  assert.match(daily, /\[09:47\] 跑步，运动时间 30分钟。/);
});

test("ingest is rejected when Apple Health is disabled", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  config.appleHealth.enabled = false;

  const result = await ingestHealth(config, { workouts: [{ uuid: "X", type: "Running", startDate: "2026-06-17T09:47:00+08:00", duration: 600 }] });
  assert.equal(result.ok, false);
});

test("creates the daily note from the configured template when it does not exist", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  config.dailyNote.templatePath = "Templates/daily.md";
  await fs.mkdir(path.join(root, "vault", "Templates"), { recursive: true });
  await fs.writeFile(
    path.join(root, "vault", "Templates", "daily.md"),
    "---\ndate: {{YYYY}}-{{MM}}-{{DD}}\ntags: [daily]\n---\n\n## Morning\n\n## Afternoon\n\n## Evening\n",
    "utf8"
  );

  const dailyPath = path.join(root, "vault", "Daily", "2026-06-17.md");
  assert.equal(await fs.access(dailyPath).then(() => true).catch(() => false), false);

  await ingestHealth(config, {
    sleep: { samples: [{ value: "asleepCore", startDate: "2026-06-16T23:30:00+08:00", endDate: "2026-06-17T07:10:00+08:00" }] },
    workouts: [{ uuid: "w1", type: "Running", startDate: "2026-06-17T18:05:00+08:00", duration: 1800 }]
  });

  const daily = await fs.readFile(dailyPath, "utf8");
  // The note was created from the template (rendered frontmatter + headings)...
  assert.match(daily, /^---\ndate: 2026-06-17\ntags: \[daily\]\n---/);
  assert.match(daily, /## Evening/);
  // ...and the health entries were inserted.
  assert.match(daily, /## 今日睡眠/);
  assert.match(daily, /\[07:10\] 睡眠/);
  assert.match(daily, /\[18:05\] 跑步/);
});

test("does not create the daily note when createIfMissing is off", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  config.dailyNote.createIfMissing = false;

  await assert.rejects(
    ingestHealth(config, {
      workouts: [{ uuid: "w1", type: "Running", startDate: "2026-06-17T18:05:00+08:00", duration: 1800 }]
    }),
    /does not exist/i
  );
  assert.equal(await fs.access(path.join(root, "vault", "Daily", "2026-06-17.md")).then(() => true).catch(() => false), false);
});

test("a custom content template renders placeholders and drops absent metrics", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  config.appleHealth.workouts.output.contentTemplate =
    "[{{time}}] {{type}}{{#duration}}｜{{duration}}{{/duration}}{{#distance}}｜{{distance}}km{{/distance}}{{#maxHeartRate}}｜最高{{maxHeartRate}}bpm{{/maxHeartRate}}";
  config.appleHealth.sleep.output.contentTemplate =
    "[{{wakeTime}}] 起床{{wakeTime}}，睡了{{asleep}}{{#maxHeartRate}}，最高心率{{maxHeartRate}}{{/maxHeartRate}}{{#wristTemperature}}，手腕{{wristTemperature}}℃{{/wristTemperature}}";

  await ingestHealth(config, {
    sleep: {
      samples: [{ value: "asleepCore", startDate: "2026-06-16T23:30:00+08:00", endDate: "2026-06-17T07:10:00+08:00" }],
      heartRate: [{ value: 48 }, { value: 70 }],
      wristTemperature: 36.4
    },
    workouts: [
      { uuid: "run", type: "Running", startDate: "2026-06-17T07:30:00+08:00", duration: 1800, distanceMeters: 5000, maxHeartRate: 172 },
      { uuid: "gym", type: "Strength Training", startDate: "2026-06-17T19:00:00+08:00", duration: 2400 }
    ]
  });

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  // Full-metric workout renders everything.
  assert.match(daily, /\[07:30\] 跑步｜30分钟｜5\.00km｜最高172bpm/);
  // Indoor workout has no distance/HR: those conditional sections drop cleanly.
  assert.match(daily, /\[19:00\] Strength Training｜40分钟$/m);
  // Sleep uses max heart rate from the sample array and wrist temperature.
  assert.match(daily, /\[07:10\] 起床07:10，睡了7小时40分，最高心率70，手腕36\.4℃/);
});

test("accepts a bare top-level sleep body with segments, nested vitals, and pre-aggregated totals", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);

  // Shape produced by the companion app: posted directly (no { sleep } wrapper),
  // stages under `segments`, vitals nested, plus pre-computed totals.
  const result = await ingestHealth(config, {
    id: "sleep-2026-06-17-0050-apple-watch-10",
    segments: [
      { stage: "core", start: "2026-06-16T16:50:13.249Z", end: "2026-06-16T23:06:55.111Z" },
      { stage: "rem", start: "2026-06-16T23:06:55.111Z", end: "2026-06-16T23:21:20.935Z" },
      { stage: "awake", start: "2026-06-16T23:21:20.935Z", end: "2026-06-16T23:52:12.017Z" },
      { stage: "core", start: "2026-06-16T23:52:12.017Z", end: "2026-06-17T00:30:01.347Z" }
    ],
    sleepStart: "2026-06-16T16:50:13.249Z",
    sleepEnd: "2026-06-17T00:30:01.347Z",
    stages: { awakeSec: 2507.9, coreSec: 17078.4, deepSec: 1910.8, remSec: 6090.8, unspecifiedSec: 0 },
    timeInBedSec: 27588.0,
    totalAsleepSec: 25080.1,
    vitals: { averageHeartRateBpm: 62.7, averageHRVms: 42.04, oxygenSaturation: 0.9346, respiratoryRate: 9.96, wristTemperatureDeltaC: 36.46 }
  });

  assert.equal(result.ok, true);
  assert.equal(result.sleep.length, 1);
  assert.equal(result.sleep[0].ok, true);

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  // Wake at 00:30 UTC -> 08:30 Asia/Shanghai on the 17th; totals from the
  // pre-aggregated fields, vitals (incl. respiratory/SpO2/wrist temp) from the
  // nested object.
  assert.match(
    daily,
    /\[08:30\] 睡眠 6小时58分（卧床7小时40分）｜深睡32分·核心4小时45分·REM1小时42分·清醒42分｜平均心率63 bpm·HRV 42 ms·呼吸10次\/分·血氧93%·手腕温度36\.5℃/
  );
});

test("accepts a bare workout body without a top-level start time (GPS workout)", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);

  // Real cycling shape: no `start`, heartRate as an object, app field names,
  // and a route array (ignored). Posted directly to the workouts handler.
  const result = await ingestHealthWorkouts(config, {
    id: "840D31FA",
    activityType: "cycling",
    end: "2026-06-17T02:02:45.645Z",
    duration: 1326.91,
    distanceMeters: 4500.38,
    avgPaceSecPerKm: 294.84,
    elevationGainMeters: 7.34,
    activeEnergyKcal: 75.2,
    heartRate: { averageBpm: 114.42, maxBpm: 143, minBpm: 83 },
    route: [{ lat: 39.99, lon: 116.46, timestamp: "2026-06-17T01:40:38.538Z" }]
  });

  assert.equal(result.ok, true);
  assert.equal(result.workouts.length, 1);
  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  assert.match(
    daily,
    /\[09:40\] 骑行，运动时间 22分07秒，平均心率 114 bpm，最大心率 143 bpm，总里程 4\.50 km，配速 4'55"，累计爬升 7 m，卡路里 75 kcal。/
  );
});

test("dedicated health/sleep and health/workouts endpoints accept a bare body", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);

  const sleep = await ingestHealthSleep(config, {
    id: "night-1",
    segments: [{ stage: "core", start: "2026-06-16T23:30:00+08:00", end: "2026-06-17T07:10:00+08:00" }],
    sleepStart: "2026-06-16T23:30:00+08:00",
    sleepEnd: "2026-06-17T07:10:00+08:00"
  });
  assert.equal(sleep.operation, "health/sleep");
  assert.equal(sleep.sleep[0].ok, true);

  const workouts = await ingestHealthWorkouts(config, {
    uuid: "run-1",
    type: "Running",
    startDate: "2026-06-17T18:05:00+08:00",
    duration: 1800
  });
  assert.equal(workouts.operation, "health/workouts");
  assert.equal(workouts.workouts.length, 1);

  const daily = await fs.readFile(path.join(root, "vault", "Daily", "2026-06-17.md"), "utf8");
  assert.match(daily, /## 今日睡眠/);
  assert.match(daily, /## 今日运动/);
  assert.match(daily, /\[18:05\] 跑步/);
});

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    allowedDirs: ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Templates", "Attachments", "Archive"],
    appleHealth: {
      enabled: true,
      sleep: {
        enabled: true,
        output: { target: "heading", headingMarkdown: "## 今日睡眠", insertAfterHeadingMarkdown: "" }
      },
      workouts: {
        enabled: true,
        minDurationMinutes: 0,
        output: { target: "heading", headingMarkdown: "## 今日运动", insertAfterHeadingMarkdown: "" }
      }
    },
    dailyNote: {
      pathTemplate: "Daily/{{yyyy-MM-dd}}.md",
      templatePath: "",
      createIfMissing: true,
      headingLevel: 2,
      linePattern: "^\\[\\d{2}:\\d{2}\\]",
      lineFormat: "[{{HH:mm}}] {{content}}",
      blankLineBetweenEntries: true,
      sortEntriesByTime: true,
      timeZone: "Asia/Shanghai",
      slots: [
        { heading: "Morning", start: "05:00", end: "11:59" },
        { heading: "Afternoon", start: "12:00", end: "17:59" },
        { heading: "Evening", start: "18:00", end: "04:59" }
      ]
    }
  };
}
