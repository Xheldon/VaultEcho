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
    { heading: "上午", start: "05:00", end: "11:59" },
    { heading: "下午", start: "12:00", end: "17:59" },
    { heading: "晚上", start: "18:00", end: "04:59" }
  ]
};

test("buildDailyWrite chooses the afternoon heading at 16:21", () => {
  const result = buildDailyWrite(
    {
      operation: "append_daily_by_time",
      at: "2026-05-13T16:21:00+08:00",
      content: "在折腾 Obsidian 的多人日记录云端处理自动化方案，嘿嘿"
    },
    dailyNote
  );

  assert.equal(result.path, "Daily/2026-05-13.md");
  assert.equal(result.heading, "下午");
  assert.equal(result.timestamp, "16:21");
  assert.equal(result.content, "[16:21] 在折腾 Obsidian 的多人日记录云端处理自动化方案，嘿嘿");
});

test("pickTimeSlot supports a slot that crosses midnight", () => {
  const slot = pickTimeSlot(dailyNote.slots, 2 * 60 + 10);
  assert.equal(slot.heading, "晚上");
});

test("buildDailyWrite falls back when custom slots do not cover the current time", () => {
  const result = buildDailyWrite(
    {
      operation: "append_daily_by_time",
      at: "2026-05-13T16:21:00+08:00",
      content: "没有匹配时段"
    },
    {
      ...dailyNote,
      slots: [{ heading: "上午", start: "05:00", end: "11:59" }]
    }
  );

  assert.equal(result.heading, "未分组");
  assert.equal(result.slot, "未分组");
});
