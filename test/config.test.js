import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadRuntimeConfig,
  loadServerConfig,
  publicRuntimeConfig,
  saveRuntimeConfig
} from "../src/config.js";

test("runtime config encrypts embedding api key and public config only exposes apiKeySet", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-config-"));
  const serverConfig = loadServerConfig(
    {
      APP_ENCRYPTION_KEY: "stable-test-secret",
      CONFIG_PATH: path.join(root, "data", "config.json")
    },
    root
  );

  await saveRuntimeConfig(serverConfig, {
    embedding: {
      enabled: true,
      baseUrl: "https://embedding.example.test/v1",
      model: "test-embedding",
      apiKey: "secret-api-key"
    }
  });

  const raw = await fs.readFile(serverConfig.configPath, "utf8");
  const loaded = await loadRuntimeConfig(serverConfig);
  const publicConfig = publicRuntimeConfig(loaded);

  assert.equal(raw.includes("secret-api-key"), false);
  assert.equal(Boolean(loaded.embedding.apiKeyEncrypted), true);
  assert.equal(publicConfig.embedding.apiKeyEncrypted, undefined);
  assert.equal(publicConfig.embedding.apiKeySet, true);
  assert.deepEqual(publicConfig.attachments, {
    imageDir: "Attachments/Images",
    audioDir: "Attachments/Audio",
    videoDir: "Attachments/Video",
    fileDir: "Attachments/Files",
    maxUploadBytes: 10485760
  });
  assert.equal(publicConfig.includeRootMarkdownFiles, false);
  assert.deepEqual(publicConfig.excludePaths, []);
  assert.equal(publicConfig.timeZone, "Asia/Shanghai");
  assert.equal(publicConfig.dailyNote.timeZone, "Asia/Shanghai");
  assert.equal(publicConfig.ai.apiMode, "chat-completions");
  assert.equal(publicConfig.ai.apiKeySet, false);
  assert.equal(publicConfig.reviews.enabled, false);
  assert.equal(publicConfig.reviews.tasks.length, 4);
  assert.equal(publicConfig.reviews.tasks[0].includeDailyNotes, true);
  assert.deepEqual(publicConfig.reviews.tasks[0].excludePaths, []);
  assert.equal(publicConfig.reviews.tasks[0].output.templatePath, "");
  assert.equal(publicConfig.reviews.tasks[0].output.writeMode, undefined);
  assert.equal(publicConfig.dailyNote.templatePath, "");
  assert.equal(publicConfig.dailyNote.createIfMissing, true);
  assert.equal(publicConfig.dailyNote.blankLineBetweenEntries, true);

  await saveRuntimeConfig(serverConfig, {
    ...publicConfig,
    embedding: {
      ...publicConfig.embedding,
      apiKey: ""
    }
  });

  const preserved = await loadRuntimeConfig(serverConfig);
  assert.equal(preserved.embedding.apiKeyEncrypted, loaded.embedding.apiKeyEncrypted);
});

test("runtime config normalizes AI API mode", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-config-"));
  const serverConfig = loadServerConfig(
    {
      CONFIG_PATH: path.join(root, "data", "config.json")
    },
    root
  );

  await saveRuntimeConfig(serverConfig, {
    ai: {
      apiMode: "responses"
    }
  });

  const loaded = await loadRuntimeConfig(serverConfig);
  assert.equal(loaded.ai.apiMode, "responses");

  await saveRuntimeConfig(serverConfig, {
    ai: {
      apiMode: "invalid"
    }
  });

  const fallback = await loadRuntimeConfig(serverConfig);
  assert.equal(fallback.ai.apiMode, "chat-completions");
});

test("runtime config normalizes review exclude paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-config-"));
  const serverConfig = loadServerConfig(
    {
      CONFIG_PATH: path.join(root, "data", "config.json")
    },
    root
  );

  await saveRuntimeConfig(serverConfig, {
    reviews: {
      tasks: [
        {
          id: "weekly-review",
          excludePaths: ["/Attachments/", "Media\\Movies", "Media/Movies"]
        }
      ]
    }
  });

  const loaded = await loadRuntimeConfig(serverConfig);
  assert.deepEqual(loaded.reviews.tasks[0].excludePaths, ["Attachments", "Media/Movies"]);

  await assert.rejects(
    saveRuntimeConfig(serverConfig, {
      reviews: {
        tasks: [
          {
            id: "weekly-review",
            excludePaths: ["../outside"]
          }
        ]
      }
    }),
    /cannot escape/
  );
});

test("runtime config normalizes global exclude paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-config-"));
  const serverConfig = loadServerConfig(
    {
      CONFIG_PATH: path.join(root, "data", "config.json")
    },
    root
  );

  await saveRuntimeConfig(serverConfig, {
    excludePaths: ["/Attachments/", "Media\\Movies", "Media/Movies"],
    includeRootMarkdownFiles: true
  });

  const loaded = await loadRuntimeConfig(serverConfig);
  assert.equal(loaded.includeRootMarkdownFiles, true);
  assert.deepEqual(loaded.excludePaths, ["Attachments", "Media/Movies"]);

  await assert.rejects(
    saveRuntimeConfig(serverConfig, {
      excludePaths: ["../outside"]
    }),
    /cannot escape/
  );
});

test("runtime config normalizes attachment directories", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-config-"));
  const serverConfig = loadServerConfig(
    {
      CONFIG_PATH: path.join(root, "data", "config.json")
    },
    root
  );

  await saveRuntimeConfig(serverConfig, {
    attachments: {
      imageDir: "/Attachments/Images/",
      audioDir: "Attachments\\Audio",
      videoDir: "Media/Video",
      fileDir: "Helper/附件",
      maxUploadBytes: 2048
    }
  });

  const loaded = await loadRuntimeConfig(serverConfig);
  assert.deepEqual(loaded.attachments, {
    imageDir: "Attachments/Images",
    audioDir: "Attachments/Audio",
    videoDir: "Media/Video",
    fileDir: "Helper/附件",
    maxUploadBytes: 2048
  });

  await assert.rejects(
    saveRuntimeConfig(serverConfig, {
      attachments: {
        imageDir: "../outside",
        audioDir: "Attachments/Audio"
      }
    }),
    /cannot escape/
  );
});

test("runtime config initializes allowed dirs from existing vault folders", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-config-"));
  await fs.mkdir(path.join(root, "vault", "Inbox"), { recursive: true });
  await fs.mkdir(path.join(root, "vault", "Journal"), { recursive: true });
  await fs.mkdir(path.join(root, "vault", ".obsidian"), { recursive: true });
  const serverConfig = loadServerConfig(
    {
      CONFIG_PATH: path.join(root, "data", "config.json")
    },
    root
  );

  const loaded = await loadRuntimeConfig(serverConfig);

  assert.deepEqual(loaded.allowedDirs, ["Inbox", "Journal"]);
});

test("runtime config rejects overlapping daily note time slots", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vault-config-"));
  const serverConfig = loadServerConfig(
    {
      CONFIG_PATH: path.join(root, "data", "config.json")
    },
    root
  );

  await assert.rejects(
    saveRuntimeConfig(serverConfig, {
      dailyNote: {
        slots: [
          { heading: "Work", start: "09:00", end: "12:00" },
          { heading: "Review", start: "11:30", end: "13:00" }
        ]
      }
    }),
    /Daily note time slots overlap/
  );
});
