import assert from "node:assert/strict";
import test from "node:test";
import { buildDailyWrite, pickTimeSlot } from "../src/time.js";

const dailyNote = {
  pathTemplate: "Daily/{{yyyy-MM-dd}}.md",
  headingLevel: 2,
  linePattern: "^\\[\\d{2}:\\d{2}\\]",
  lineFormat: "[{{HH:mm}}] {{content}}",
  timeZone: "Asia/Shanghai",
  slots: [
    { heading: "Morning", start: "05:00", end: "11:59" },
    { heading: "Afternoon", start: "12:00", end: "17:59" },
    { heading: "Evening", start: "18:00", end: "04:59" }
  ]
};

test("buildDailyWrite chooses the afternoon heading at 16:21", () => {
  const result = buildDailyWrite(
    {
      operation: "append_daily_by_time",
      at: "2026-05-13T16:21:00+08:00",
      content: "Working on Obsidian automation"
    },
    dailyNote
  );

  assert.equal(result.path, "Daily/2026-05-13.md");
  assert.equal(result.heading, "Afternoon");
  assert.equal(result.timestamp, "16:21");
  assert.equal(result.content, "[16:21] Working on Obsidian automation");
});

test("pickTimeSlot supports a slot that crosses midnight", () => {
  const slot = pickTimeSlot(dailyNote.slots, 2 * 60 + 10);
  assert.equal(slot.heading, "Evening");
});

test("buildDailyWrite falls back when custom slots do not cover the current time", () => {
  const result = buildDailyWrite(
    {
      operation: "append_daily_by_time",
      at: "2026-05-13T16:21:00+08:00",
      content: "No matching slot"
    },
    {
      ...dailyNote,
      slots: [{ heading: "Morning", start: "05:00", end: "11:59" }]
    }
  );

  assert.equal(result.heading, "Unsorted");
  assert.equal(result.slot, "Unsorted");
});
