import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runConnector, runDueConnectors } from "../src/connectors.js";

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

    await fs.unlink(notePath);
    const replayRun = await runConnector(config, "x", {
      now: new Date("2026-05-20T12:50:00.000Z"),
      runAt: new Date("2026-05-20T12:50:00.000Z")
    });
    assert.equal(replayRun.postsWritten, 2);
    assert.equal(replayRun.postsSkipped, 0);
    assert.equal(
      await fs.readFile(notePath, "utf8"),
      "## Twitter\n\n[12:22] First post\n\n[15:42] Second post\n"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("X connector can write posts into the matching daily time slot", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-connector-"));
  const config = testConfig(root);
  config.connectors.sources[0].output.target = "time-slot";
  config.dailyNote.slots = [
    { heading: "上午", start: "05:00", end: "11:59" },
    { heading: "下午", start: "12:00", end: "17:59" },
    { heading: "晚上", start: "18:00", end: "04:59" }
  ];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/by/username/xdevelopers") {
      return jsonResponse({ data: { id: "123", username: "xdevelopers" } });
    }
    if (url.pathname === "/2/users/123/tweets") {
      return jsonResponse({
        data: [
          { id: "post-1", text: "Afternoon post", created_at: "2026-05-20T04:20:00.000Z" }
        ],
        meta: { result_count: 1 }
      });
    }
    return jsonResponse({ error: "unexpected url" }, 404);
  };

  try {
    const result = await runConnector(config, "x", {
      now: new Date("2026-05-20T12:30:00.000Z"),
      runAt: new Date("2026-05-20T12:30:00.000Z")
    });

    assert.equal(result.postsWritten, 1);
    assert.equal(
      await fs.readFile(path.join(root, "vault", "Daily", "2026-05-20.md"), "utf8"),
      "## 下午\n\n[12:20] Afternoon post\n"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("X connector recovers a corrupted run history file before recording a run", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-connector-"));
  const config = testConfig(root);
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(path.join(config.dataDir, "connector-runs.json"), "{\"runs\":{}}\n}", "utf8");
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/by/username/xdevelopers") {
      return jsonResponse({ data: { id: "123", username: "xdevelopers" } });
    }
    if (url.pathname === "/2/users/123/tweets") {
      return jsonResponse({ data: [], meta: { result_count: 0 } });
    }
    return jsonResponse({ error: "unexpected url" }, 404);
  };

  try {
    const result = await runConnector(config, "x", {
      now: new Date("2026-05-20T12:30:00.000Z"),
      runAt: new Date("2026-05-20T12:30:00.000Z")
    });

    assert.equal(result.postsFound, 0);
    const runs = JSON.parse(await fs.readFile(path.join(config.dataDir, "connector-runs.json"), "utf8"));
    assert.equal(Object.values(runs.runs).length, 1);
    const backups = (await fs.readdir(config.dataDir)).filter((name) => name.startsWith("connector-runs.json.corrupt."));
    assert.equal(backups.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scheduled X connector retries a failed interval run instead of treating it as complete", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-connector-"));
  const config = testConfig(root);
  config.connectors.sources[0].userId = "123";
  config.connectors.sources[0].username = "xdevelopers";
  config.connectors.schedule.intervalMinutes = 60;
  await fs.mkdir(config.dataDir, { recursive: true });
  await fs.writeFile(
    path.join(config.dataDir, "connector-runs.json"),
    JSON.stringify({
      runs: {
        "x:2026-05-20:13:00": {
          connectorId: "x",
          platform: "x",
          day: "2026-05-20",
          ok: false,
          manual: false,
          error: "fetch failed",
          ranAt: "2026-05-20T05:00:00.000Z"
        }
      }
    }, null, 2),
    "utf8"
  );
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/123/tweets") {
      return jsonResponse({ data: [], meta: { result_count: 0 } });
    }
    return jsonResponse({ error: "unexpected url" }, 404);
  };

  try {
    const result = await runDueConnectors(config, new Date("2026-05-20T05:10:00.000Z"));

    assert.equal(result.results.length, 1);
    assert.equal(result.results[0].ok, true);
    const runs = JSON.parse(await fs.readFile(path.join(config.dataDir, "connector-runs.json"), "utf8"));
    assert.equal(runs.runs["x:2026-05-20:13:00"].ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("multiple X sources write independently and dedupe by source plus post id", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-connector-"));
  const config = testConfig(root);
  config.connectors.sources = [
    {
      ...config.connectors.sources[0],
      id: "x-main",
      name: "Main X",
      userId: "123",
      username: "main",
      bearerToken: "main-token",
      output: { ...config.connectors.sources[0].output, headingMarkdown: "## Main X" }
    },
    {
      ...config.connectors.sources[0],
      id: "x-alt",
      name: "Alt X",
      userId: "456",
      username: "alt",
      bearerToken: "alt-token",
      output: { ...config.connectors.sources[0].output, headingMarkdown: "## Alt X" }
    }
  ];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/123/tweets") {
      assert.equal(init.headers.Authorization, "Bearer main-token");
      return jsonResponse({
        data: [{ id: "shared-post", text: "Main source", created_at: "2026-05-20T04:20:00.000Z" }],
        meta: { result_count: 1 }
      });
    }
    if (url.pathname === "/2/users/456/tweets") {
      assert.equal(init.headers.Authorization, "Bearer alt-token");
      return jsonResponse({
        data: [{ id: "shared-post", text: "Alt source", created_at: "2026-05-20T04:21:00.000Z" }],
        meta: { result_count: 1 }
      });
    }
    return jsonResponse({ error: "unexpected url" }, 404);
  };

  try {
    const mainRun = await runConnector(config, "x-main", {
      now: new Date("2026-05-20T12:30:00.000Z"),
      runAt: new Date("2026-05-20T12:30:00.000Z")
    });
    const altRun = await runConnector(config, "x-alt", {
      now: new Date("2026-05-20T12:31:00.000Z"),
      runAt: new Date("2026-05-20T12:31:00.000Z")
    });
    const replayMain = await runConnector(config, "x-main", {
      now: new Date("2026-05-20T12:32:00.000Z"),
      runAt: new Date("2026-05-20T12:32:00.000Z")
    });

    assert.equal(mainRun.postsWritten, 1);
    assert.equal(altRun.postsWritten, 1);
    assert.equal(replayMain.postsWritten, 0);
    assert.equal(replayMain.postsSkipped, 1);
    assert.equal(
      await fs.readFile(path.join(root, "vault", "Daily", "2026-05-20.md"), "utf8"),
      "## Main X\n\n[12:20] Main source\n\n## Alt X\n\n[12:21] Alt source\n"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("connector run state and run artifacts older than one week are pruned", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-connector-"));
  const config = testConfig(root);
  config.connectors.sources[0].userId = "123";
  await fs.mkdir(config.dataDir, { recursive: true });
  const oldDate = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  const freshDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await fs.writeFile(
    path.join(config.dataDir, "connector-runs.json"),
    JSON.stringify({
      runs: {
        "x:old": {
          connectorId: "x",
          platform: "x",
          day: "2026-05-12",
          ok: true,
          manual: true,
          ranAt: oldDate.toISOString()
        },
        "x:fresh": {
          connectorId: "x",
          platform: "x",
          day: "2026-05-19",
          ok: true,
          manual: true,
          ranAt: freshDate.toISOString()
        }
      }
    }, null, 2),
    "utf8"
  );
  const oldCorruptPath = path.join(config.dataDir, "connector-runs.json.corrupt.old");
  const oldTempPath = path.join(config.dataDir, "connector-runs.json.1.tmp");
  await fs.writeFile(oldCorruptPath, "bad", "utf8");
  await fs.writeFile(oldTempPath, "tmp", "utf8");
  await fs.utimes(oldCorruptPath, oldDate, oldDate);
  await fs.utimes(oldTempPath, oldDate, oldDate);
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/123/tweets") {
      return jsonResponse({ data: [], meta: { result_count: 0 } });
    }
    return jsonResponse({ error: "unexpected url" }, 404);
  };

  try {
    await runConnector(config, "x", {
      now: new Date("2026-05-20T12:30:00.000Z"),
      runAt: new Date("2026-05-20T12:30:00.000Z")
    });

    const runs = JSON.parse(await fs.readFile(path.join(config.dataDir, "connector-runs.json"), "utf8"));
    assert.equal(runs.runs["x:old"], undefined);
    assert.equal(Boolean(runs.runs["x:fresh"]), true);
    const artifacts = await fs.readdir(config.dataDir);
    assert.equal(artifacts.includes("connector-runs.json.corrupt.old"), false);
    assert.equal(artifacts.includes("connector-runs.json.1.tmp"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("X connector retries transient fetch failures before succeeding", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-connector-"));
  const config = testConfig(root);
  config.connectors.sources[0].userId = "123";
  let attempts = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/2/users/123/tweets") {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("socket reset");
      }
      return jsonResponse({ data: [], meta: { result_count: 0 } });
    }
    return jsonResponse({ error: "unexpected url" }, 404);
  };

  try {
    const result = await runConnector(config, "x", {
      now: new Date("2026-05-20T12:30:00.000Z"),
      runAt: new Date("2026-05-20T12:30:00.000Z")
    });

    assert.equal(result.postsFound, 0);
    assert.equal(attempts, 2);
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
      schedule: { intervalMinutes: 1440 },
      sources: [
        {
          id: "x",
          name: "X Developers",
          enabled: true,
          platform: "x",
          baseUrl: "https://api.x.com/2",
          username: "xdevelopers",
          bearerToken: "test-x-token",
          includeReplies: true,
          includeRetweets: false,
          maxPostsPerRun: 50,
          output: {
            target: "heading",
            headingMarkdown: "## Twitter",
            lineFormat: "",
            contentTemplate: "{{text}}"
          }
        }
      ]
    }
  };
}
