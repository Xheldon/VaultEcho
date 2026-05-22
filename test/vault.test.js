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
    "## Morning\n\nMorning content\n\n## Afternoon\n[16:18] Working on Obsidian\n\n[16:21] Continue testing automatic insertion\n\n## Evening\n"
  );
});

test("append_daily_by_time inserts after multiline timestamp entry blocks", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const config = testConfig(root);
  const dailyPath = path.join(root, "vault", "Daily", "2026-05-13.md");
  await fs.mkdir(path.dirname(dailyPath), { recursive: true });
  await fs.writeFile(
    dailyPath,
    "## Evening\n[23:22] First line\ncontinued line\nfinal line\n",
    "utf8"
  );

  await executeOperation(config, {
    operation: "append_daily_by_time",
    at: "2026-05-13T23:40:00+08:00",
    content: "Next entry"
  });

  assert.equal(
    await fs.readFile(dailyPath, "utf8"),
    "## Evening\n[23:22] First line\ncontinued line\nfinal line\n\n[23:40] Next entry\n"
  );
});

test("append_daily_by_time creates a missing daily note from the configured template", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const baseConfig = testConfig(root);
  const config = {
    ...baseConfig,
    dailyNote: {
      ...baseConfig.dailyNote,
      pathTemplate: "Daily/{{YYYY}}/{{YYYY}}-{{MM}}-{{DD}}",
      headingLevel: 3,
      templatePath: "Templates/daily.md"
    }
  };
  const templatePath = path.join(root, "vault", "Templates", "daily.md");
  await fs.mkdir(path.dirname(templatePath), { recursive: true });
  await fs.writeFile(templatePath, "---\ndate: {{YYYY-MM-DD}}\n---\n\n# {{title}}\n", "utf8");

  const result = await executeOperation(config, {
    operation: "append_daily_by_time",
    at: "2026-05-13T16:21:00+08:00",
    content: "Created from template"
  });

  const dailyPath = path.join(root, "vault", "Daily", "2026", "2026-05-13.md");
  assert.equal(result.path, "Daily/2026/2026-05-13.md");
  assert.equal(
    await fs.readFile(dailyPath, "utf8"),
    "---\ndate: 2026-05-13\n---\n\n# 2026-05-13\n\n### Afternoon\n\n[16:21] Created from template\n"
  );
});

test("append_daily_by_time can reject missing daily notes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const config = testConfig(root);

  await assert.rejects(
    executeOperation(config, {
      operation: "append_daily_by_time",
      at: "2026-05-13T16:21:00+08:00",
      content: "Do not create",
      createIfMissing: false
    }),
    /Daily note does not exist/
  );
});

test("upsert_daily_separated_heading creates a configurable separated daily section before base block", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const config = testConfig(root);
  const dailyPath = path.join(root, "vault", "Daily", "2026-05-21.md");
  await fs.mkdir(path.dirname(dailyPath), { recursive: true });
  await fs.writeFile(
    dailyPath,
    "## Evening\n\n[23:54] Existing entry\n\nInline note that should stay below the timestamp block.\n\n> 下方的 Base 汇总了今天创建的所有笔记。\n\n![[日记.base]]\n",
    "utf8"
  );

  await executeOperation(config, {
    operation: "upsert_daily_separated_heading",
    at: "2026-05-21T09:47:00+08:00",
    heading: "运动",
    headingLevel: 1,
    insertAfterHeading: "Evening",
    insertAfterHeadingLevel: 2,
    content: "[09:47] Ride，运动时间 16分39秒。",
    idempotencyKey: "strava-demo"
  });

  assert.equal(
    await fs.readFile(dailyPath, "utf8"),
    "## Evening\n\n[23:54] Existing entry\n\n---\n\n# 运动\n\n[09:47] Ride，运动时间 16分39秒。\n\n---\n\nInline note that should stay below the timestamp block.\n\n> 下方的 Base 汇总了今天创建的所有笔记。\n\n![[日记.base]]\n"
  );
});

test("upsert_daily_separated_heading merges existing entries under the configured heading chronologically", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-"));
  const config = testConfig(root);
  const dailyPath = path.join(root, "vault", "Daily", "2026-05-21.md");
  await fs.mkdir(path.dirname(dailyPath), { recursive: true });
  await fs.writeFile(
    dailyPath,
    "## Evening\n\n[23:54] Existing entry\n\n---\n\n## 今日运动\n\n[20:15] Evening ride。\n\n---\n\n> 下方的 Base 汇总了今天创建的所有笔记。\n",
    "utf8"
  );

  await executeOperation(config, {
    operation: "upsert_daily_separated_heading",
    at: "2026-05-21T09:47:00+08:00",
    heading: "今日运动",
    headingLevel: 2,
    insertAfterHeading: "Evening",
    insertAfterHeadingLevel: 2,
    content: "[09:47] Morning ride。"
  });

  assert.equal(
    await fs.readFile(dailyPath, "utf8"),
    "## Evening\n\n[23:54] Existing entry\n\n---\n\n## 今日运动\n\n[09:47] Morning ride。\n\n[20:15] Evening ride。\n\n---\n\n> 下方的 Base 汇总了今天创建的所有笔记。\n"
  );
});

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    allowedDirs: ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Templates", "Attachments", "Archive"],
    dailyNote: {
      pathTemplate: "Daily/{{yyyy-MM-dd}}.md",
      templatePath: "",
      createIfMissing: true,
      headingLevel: 2,
      linePattern: "^\\[\\d{2}:\\d{2}\\]",
      lineFormat: "[{{HH:mm}}] {{content}}",
      blankLineBetweenEntries: true,
      timeZone: "Asia/Shanghai",
      slots: [
        { heading: "Morning", start: "05:00", end: "11:59" },
        { heading: "Afternoon", start: "12:00", end: "17:59" },
        { heading: "Evening", start: "18:00", end: "04:59" }
      ]
    }
  };
}
