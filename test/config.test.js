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
    audioDir: "Attachments/Audio"
  });

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
      audioDir: "Attachments\\Audio"
    }
  });

  const loaded = await loadRuntimeConfig(serverConfig);
  assert.deepEqual(loaded.attachments, {
    imageDir: "Attachments/Images",
    audioDir: "Attachments/Audio"
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
