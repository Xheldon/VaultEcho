import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { executeObsidianUri, parseObsidianUri } from "../src/obsidian-uri.js";

test("parseObsidianUri parses normal and shorthand URIs", () => {
  assert.deepEqual(
    parseObsidianUri("obsidian://new?file=Ideas%2Fdemo&content=Hello"),
    {
      action: "new",
      params: {
        file: "Ideas/demo",
        content: "Hello"
      }
    }
  );

  assert.deepEqual(
    parseObsidianUri("obsidian://vault/My%20Vault/Ideas/demo"),
    {
      action: "open",
      params: {
        vault: "My Vault",
        file: "Ideas/demo"
      }
    }
  );
});

test("new URI creates and appends to a note", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-uri-"));
  const config = testConfig(root);

  await executeObsidianUri(config, {
    uri: "obsidian://new?file=Ideas%2Fdemo&content=Hello"
  });
  await executeObsidianUri(config, {
    uri: "obsidian://new?file=Ideas%2Fdemo&content=%0AWorld&append=true"
  });

  const content = await fs.readFile(path.join(root, "vault", "Ideas", "demo.md"), "utf8");
  assert.equal(content, "Hello\n\nWorld");
});

test("daily URI can use the gateway time-slot extension", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-uri-"));
  const config = testConfig(root);
  const dailyPath = path.join(root, "vault", "Daily", "2026-05-13.md");
  await fs.mkdir(path.dirname(dailyPath), { recursive: true });
  await fs.writeFile(dailyPath, "## Morning\n\n## Afternoon\n[16:18] A\n\n## Evening\n", "utf8");

  const result = await executeObsidianUri(config, {
    action: "daily",
    appendByTime: "true",
    at: "2026-05-13T16:21:00+08:00",
    content: "B"
  });

  assert.equal(result.heading, "Afternoon");
  assert.equal(
    await fs.readFile(dailyPath, "utf8"),
    "## Morning\n\n## Afternoon\n[16:18] A\n[16:21] B\n\n## Evening\n"
  );
});

test("search URI returns matching markdown files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-uri-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Ideas"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Ideas", "match.md"), "alpha\nneedle\n", "utf8");

  const result = await executeObsidianUri(config, {
    uri: "obsidian://search?query=needle"
  });

  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].path, "Ideas/match.md");
  assert.equal(result.results[0].line, 2);
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
