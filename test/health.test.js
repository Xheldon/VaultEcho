import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ingestHealth } from "../src/health.js";

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
    /\[09:47\] Badminton，运动时间 30分钟，平均心率 120 bpm，最大心率 165 bpm，卡路里 250 kcal，\[\[Apple Watch Series 10\]\]。/
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
  const runningLines = daily.split("\n").filter((line) => line.includes("Running"));
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
  assert.match(daily, /\[09:47\] Running，运动时间 30分钟。/);
});

test("ingest is rejected when Apple Health is disabled", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-health-"));
  const config = testConfig(root);
  config.appleHealth.enabled = false;

  const result = await ingestHealth(config, { workouts: [{ uuid: "X", type: "Running", startDate: "2026-06-17T09:47:00+08:00", duration: 600 }] });
  assert.equal(result.ok, false);
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
