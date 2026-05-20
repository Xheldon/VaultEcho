import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runConnector } from "../src/connectors.js";

test("X connector reads only the local day and writes posts chronologically under the configured heading", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-connector-"));
  const config = testConfig(root);
  const originalFetch = globalThis.fetch;
  const requestedUrls = [];

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    requestedUrls.push(url);
    assert.equal(init.headers.Authorization, "Bearer test-x-token");

    if (url.pathname === "/2/users/by/username/xdevelopers") {
      return jsonResponse({ data: { id: "123", username: "xdevelopers" } });
    }

    if (url.pathname === "/2/users/123/tweets") {
      return jsonResponse({
        data: [
          { id: "post-2", text: "Second post", created_at: "2026-05-20T07:42:00.000Z" },
          { id: "post-1", text: "First post", created_at: "2026-05-20T04:22:00.000Z" }
        ],
        meta: { result_count: 2 }
      });
    }

    return jsonResponse({ error: "unexpected url" }, 404);
  };

  try {
    const result = await runConnector(config, "x", {
      now: new Date("2026-05-20T12:30:00.000Z"),
      runAt: new Date("2026-05-20T12:30:00.000Z")
    });

    const tweetsUrl = requestedUrls.find((url) => url.pathname === "/2/users/123/tweets");
    assert.equal(tweetsUrl.searchParams.get("start_time"), "2026-05-19T16:00:00.000Z");
    assert.equal(tweetsUrl.searchParams.get("end_time"), "2026-05-20T12:30:00.000Z");
    assert.equal(tweetsUrl.searchParams.get("exclude"), "retweets");
    assert.equal(result.postsFound, 2);
    assert.equal(result.postsWritten, 2);

    const notePath = path.join(root, "vault", "Daily", "2026-05-20.md");
    assert.equal(
      await fs.readFile(notePath, "utf8"),
      "## Twitter\n\n[12:22] First post\n\n[15:42] Second post\n"
    );

    const secondRun = await runConnector(config, "x", {
      now: new Date("2026-05-20T12:45:00.000Z"),
      runAt: new Date("2026-05-20T12:45:00.000Z")
    });
    assert.equal(secondRun.postsWritten, 0);
    assert.equal(secondRun.postsSkipped, 2);
    assert.equal(
      await fs.readFile(notePath, "utf8"),
      "## Twitter\n\n[12:22] First post\n\n[15:42] Second post\n"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    timeZone: "Asia/Shanghai",
    allowedDirs: ["Daily"],
    dailyNote: {
      pathTemplate: "Daily/{{YYYY}}-{{MM}}-{{DD}}.md",
      templatePath: "",
      createIfMissing: true,
      headingLevel: 2,
      linePattern: "^\\[\\d{2}:\\d{2}\\]",
      lineFormat: "[{{HH:mm}}] {{content}}",
      blankLineBetweenEntries: true,
      timeZone: "Asia/Shanghai",
      slots: []
    },
    connectors: {
      enabled: true,
      x: {
        enabled: true,
        platform: "x",
        baseUrl: "https://api.x.com/2",
        username: "xdevelopers",
        bearerToken: "test-x-token",
        schedule: { time: "23:55" },
        includeReplies: true,
        includeRetweets: false,
        maxPostsPerRun: 50,
        output: {
          headingMarkdown: "## Twitter",
          lineFormat: "",
          contentTemplate: "{{text}}"
        }
      }
    }
  };
}
