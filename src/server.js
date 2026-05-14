import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { executeApiAction } from "./api.js";
import { loadRuntimeConfig, loadServerConfig, publicRuntimeConfig, saveRuntimeConfig } from "./config.js";
import { startEmbeddingAutoScan } from "./embedding-index.js";
import { renderAdminPage } from "./ui.js";

const serverConfig = loadServerConfig();
const initialConfig = await loadRuntimeConfig(serverConfig);
await ensureRuntimeDirs(initialConfig);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && ["/", "/admin"].includes(url.pathname)) {
      requireAdminAuth(serverConfig, request);
      return sendHtml(response, 200, renderAdminPage());
    }

    if (request.method === "GET" && url.pathname === "/health") {
      requireAdminAuth(serverConfig, request);
      const runtimeConfig = await loadRuntimeConfig(serverConfig);
      return sendJson(response, 200, {
        ok: true,
        configPath: serverConfig.configPath,
        vaultRoot: runtimeConfig.vaultRoot,
        allowedDirs: runtimeConfig.allowedDirs
      });
    }

    if (request.method === "GET" && url.pathname === "/v1/config") {
      requireAdminAuth(serverConfig, request);
      const runtimeConfig = await loadRuntimeConfig(serverConfig);
      return sendJson(response, 200, publicRuntimeConfig(runtimeConfig));
    }

    if (request.method === "PUT" && url.pathname === "/v1/config") {
      requireAdminAuth(serverConfig, request);
      const currentConfig = await loadRuntimeConfig(serverConfig);
      const body = await readJsonBody(request, currentConfig.maxJsonBodyBytes);
      const runtimeConfig = await saveRuntimeConfig(serverConfig, body);
      await ensureRuntimeDirs(runtimeConfig);
      return sendJson(response, 200, publicRuntimeConfig(runtimeConfig));
    }

    if (url.pathname.startsWith("/v1/api/")) {
      const action = decodeURIComponent(url.pathname.slice("/v1/api/".length));
      if (action.startsWith("index/")) {
        requireApiOrAdminAuth(serverConfig, request);
      } else {
        requireApiAuth(serverConfig, request);
      }
      const runtimeConfig = await loadRuntimeConfig(serverConfig);
      const body = ["GET", "DELETE"].includes(request.method)
        ? { json: {}, text: "" }
        : await readAnyBody(request, runtimeConfig.maxJsonBodyBytes);
      const input = {
        ...Object.fromEntries(url.searchParams.entries()),
        ...body.json
      };
      if (body.text && input.content === undefined && input.text === undefined) {
        input.content = body.text;
      }
      await ensureRuntimeDirs(runtimeConfig);
      const result = await executeApiAction(runtimeConfig, action, input);
      return sendJson(response, result.ok === false ? 400 : 200, result);
    }

    return sendJson(response, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const status = error.statusCode || 400;
    return sendJson(response, status, { ok: false, error: error.message }, error.headers);
  }
});

server.listen(serverConfig.port, "0.0.0.0", () => {
  console.log(`VaultEcho API listening on http://0.0.0.0:${serverConfig.port}`);
  console.log(`VaultEcho config UI available at http://localhost:${serverConfig.port}/`);
});

startEmbeddingAutoScan(() => loadRuntimeConfig(serverConfig));

async function ensureRuntimeDirs(config) {
  await fs.mkdir(config.vaultRoot, { recursive: true });
  await fs.mkdir(config.dataDir, { recursive: true });
}

function requireApiAuth(config, request) {
  if (!config.apiToken) {
    const error = new Error("API_TOKEN is not configured");
    error.statusCode = 500;
    throw error;
  }

  const expected = `Bearer ${config.apiToken}`;
  if (!constantTimeEqual(request.headers.authorization || "", expected)) {
    const error = new Error("Unauthorized");
    error.statusCode = 401;
    throw error;
  }
}

function requireAdminAuth(config, request) {
  if (!isAdminAuthorized(config, request)) {
    const error = new Error("Admin authentication required");
    error.statusCode = 401;
    error.headers = {
      "www-authenticate": 'Basic realm="VaultEcho Admin", charset="UTF-8"'
    };
    throw error;
  }
}

function requireApiOrAdminAuth(config, request) {
  try {
    requireApiAuth(config, request);
  } catch (apiError) {
    if (apiError.statusCode !== 401) throw apiError;
    requireAdminAuth(config, request);
  }
}

function isAdminAuthorized(config, request) {
  if (!config.adminUsername || !config.adminPassword) {
    const error = new Error("ADMIN_USERNAME and ADMIN_PASSWORD are not configured");
    error.statusCode = 500;
    throw error;
  }

  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Basic ")) return false;

  let decoded = "";
  try {
    decoded = Buffer.from(authorization.slice("Basic ".length), "base64").toString("utf8");
  } catch {
    return false;
  }

  const separator = decoded.indexOf(":");
  if (separator === -1) return false;
  const username = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  return (
    constantTimeEqual(username, config.adminUsername) &&
    constantTimeEqual(password, config.adminPassword)
  );
}

function constantTimeEqual(left, right) {
  const leftDigest = crypto.createHash("sha256").update(String(left)).digest();
  const rightDigest = crypto.createHash("sha256").update(String(right)).digest();
  return crypto.timingSafeEqual(leftDigest, rightDigest);
}

async function readAnyBody(request, maxBytes) {
  const raw = await readRawBody(request, maxBytes);
  if (!raw) return { json: {}, text: "" };

  const contentType = request.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    try {
      return { json: JSON.parse(raw), text: raw };
    } catch {
      const error = new Error("Invalid JSON body");
      error.statusCode = 400;
      throw error;
    }
  }

  return { json: {}, text: raw };
}

async function readJsonBody(request, maxBytes) {
  const raw = await readRawBody(request, maxBytes);
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

async function readRawBody(request, maxBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("JSON body is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, statusCode, payload, headers = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...headers
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "content-type": "text/html; charset=utf-8"
  });
  response.end(html);
}
