import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeApiAction } from "../src/api.js";

test("v1 api new creates a note from filename and can run a safe vault script", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-api-action-"));
  const config = testConfig(root);
  const script = JSON.stringify({
    operations: [
      {
        op: "append",
        path: "Daily/2026-05-13.md",
        content: "- Created {{path}}\n"
      }
    ]
  });

  const result = await executeApiAction(config, "new", {
    filename: "Ideas/api-note",
    content: "Hello",
    script
  });

  assert.equal(result.result.path, "Ideas/api-note.md");
  assert.equal(result.script[0].path, "Daily/2026-05-13.md");
  assert.equal(
    await fs.readFile(path.join(root, "vault", "Daily", "2026-05-13.md"), "utf8"),
    "- Created Ideas/api-note.md\n"
  );
});

test("v1 api exposes fine-grained heading and frontmatter actions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-api-action-"));
  const config = testConfig(root);

  await executeApiAction(config, "files/write", {
    path: "Ideas/fine.md",
    content: "## Work\nA\n"
  });
  await executeApiAction(config, "headings/append", {
    path: "Ideas/fine.md",
    heading: "Work",
    content: "B"
  });
  await executeApiAction(config, "frontmatter/set", {
    path: "Ideas/fine.md",
    key: "status",
    value: "draft"
  });

  const heading = await executeApiAction(config, "headings/read", {
    path: "Ideas/fine.md",
    heading: "Work"
  });
  const status = await executeApiAction(config, "frontmatter/get", {
    path: "Ideas/fine.md",
    key: "status"
  });

  assert.equal(heading.result.content, "A\nB");
  assert.equal(status.result.value, "draft");
});

test("files/create applies template first and request yaml last", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-api-action-"));
  const config = testConfig(root);
  const templatePath = path.join(root, "vault", "Templates", "idea.md");
  await fs.mkdir(path.dirname(templatePath), { recursive: true });
  await fs.writeFile(
    templatePath,
    "---\nstatus: template\nsource: template\n---\n\n# {{title}}\n\n{{content}}\n",
    "utf8"
  );

  const result = await executeApiAction(config, "files/create", {
    path: "Ideas/from-template.md",
    title: "模板测试",
    templatePath: "Templates/idea.md",
    content: "正文内容",
    yaml: {
      status: "done",
      tags: ["idea", "capture"]
    }
  });

  assert.equal(result.result.path, "Ideas/from-template.md");
  assert.equal(
    await fs.readFile(path.join(root, "vault", "Ideas", "from-template.md"), "utf8"),
    "---\nstatus: done\nsource: template\ntags: [\"idea\",\"capture\"]\n---\n\n# 模板测试\n\n正文内容\n"
  );
});

test("files/create appends content when template has no content placeholder", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-api-action-"));
  const config = testConfig(root);
  const templatePath = path.join(root, "vault", "Templates", "plain.md");
  await fs.mkdir(path.dirname(templatePath), { recursive: true });
  await fs.writeFile(templatePath, "# {{title}}\n\nTemplate body\n", "utf8");

  await executeApiAction(config, "files/create", {
    path: "Ideas/no-placeholder.md",
    templatePath: "Templates/plain.md",
    content: "Extra body"
  });

  assert.equal(
    await fs.readFile(path.join(root, "vault", "Ideas", "no-placeholder.md"), "utf8"),
    "# no-placeholder\n\nTemplate body\n\nExtra body\n"
  );
});

test("v1 api batch executes multiple fine-grained operations", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-api-action-"));
  const config = testConfig(root);

  const result = await executeApiAction(config, "batch", {
    operations: [
      { route: "files/write", path: "Ideas/batch.md", content: "## Log\n" },
      { route: "headings/append", path: "Ideas/batch.md", heading: "Log", content: "Item" }
    ]
  });

  assert.equal(result.result.results.length, 2);
  assert.equal(await fs.readFile(path.join(root, "vault", "Ideas", "batch.md"), "utf8"), "## Log\nItem\n");
});

test("v1 api rejects non-json executable-looking script", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-api-action-"));
  const config = testConfig(root);

  await assert.rejects(
    executeApiAction(config, "script", {
      script: "fs.rmSync('/')"
    }),
    /script must be URL-encoded JSON/
  );
});

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    allowedDirs: ["Inbox", "Notes", "Ideas", "Projects", "Daily", "Templates", "Attachments", "Archive"],
    dailyNote: {
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
    }
  };
}
