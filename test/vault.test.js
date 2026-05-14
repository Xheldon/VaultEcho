import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeOperation } from "../src/vault.js";

test("create_markdown with append_suffix returns full nested vault path", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const config = testConfig(root);

  await executeOperation(config, {
    operation: "create_markdown",
    path: "Ideas/nested/item.md",
    content: "First"
  });

  const result = await executeOperation(config, {
    operation: "create_markdown",
    path: "Ideas/nested/item.md",
    content: "Second",
    ifExists: "append_suffix"
  });

  assert.equal(result.path, "Ideas/nested/item-2.md");
});

test("idempotencyKey returns previous result without repeating append", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const config = testConfig(root);

  await executeOperation(config, {
    operation: "append",
    path: "Inbox/log.md",
    content: "once\n",
    idempotencyKey: "same-request"
  });
  await executeOperation(config, {
    operation: "append",
    path: "Inbox/log.md",
    content: "twice\n",
    idempotencyKey: "same-request"
  });

  const content = await fs.readFile(path.join(root, "vault", "Inbox", "log.md"), "utf8");
  assert.equal(content, "once\n");
});

test("append_daily_by_time inserts below the last timestamp in the matching time heading", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const config = testConfig(root);
  const dailyPath = path.join(root, "vault", "Daily", "2026-05-13.md");
  await fs.mkdir(path.dirname(dailyPath), { recursive: true });
  await fs.writeFile(
    dailyPath,
    "## Morning\n\nMorning content\n\n## Afternoon\n[16:18] Working on Obsidian\n\n## Evening\n",
    "utf8"
  );

  const result = await executeOperation(config, {
    operation: "append_daily_by_time",
    at: "2026-05-13T16:21:00+08:00",
    content: "Continue testing automatic insertion",
    idempotencyKey: "daily-demo"
  });

  const content = await fs.readFile(dailyPath, "utf8");
  assert.equal(result.heading, "Afternoon");
  assert.equal(result.timestamp, "16:21");
  assert.equal(
    content,
    "## Morning\n\nMorning content\n\n## Afternoon\n[16:18] Working on Obsidian\n[16:21] Continue testing automatic insertion\n\n## Evening\n"
  );
});

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    allowedDirs: ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Attachments", "Archive"],
    dailyNote: {
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
    }
  };
}
