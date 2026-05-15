import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeApiAction } from "./api.js";
import {
  loadRuntimeConfig,
  loadServerConfig,
  normalizeRuntimeConfig,
  publicRuntimeConfig,
  saveRuntimeConfig
} from "./config.js";
import { startEmbeddingAutoScan } from "./embedding-index.js";
import { startReviewTaskScheduler } from "./review-tasks.js";
import { startIdempotencyCleanup } from "./vault.js";

const ADMIN_INDEX_MUTATIONS = new Set(["index/errors/clear", "index/rebuild"]);
const ADMIN_REVIEW_MUTATIONS = new Set(["reviews/run"]);
const ADMIN_DIST_ROOT = path.resolve(fileURLToPath(new URL("../public/admin/", import.meta.url)));
const ADMIN_INDEX_FILE = path.join(ADMIN_DIST_ROOT, "index.html");
const STATIC_CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};
const serverConfig = loadServerConfig();
let runtimeConfigCache = await loadRuntimeConfig(serverConfig);
let reviewScheduler;
await ensureRuntimeDirs(runtimeConfigCache);

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");

    if (request.method === "GET" && ["/", "/admin", "/admin/"].includes(url.pathname)) {
      requireAdminAuth(serverConfig, request);
      return sendStaticAdminFile(response, ADMIN_INDEX_FILE);
    }

    if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
      requireAdminAuth(serverConfig, request);
      const assetPath = resolveAdminAssetPath(url.pathname);
      if (!assetPath) return sendJson(response, 404, { ok: false, error: "Not found" });
      return sendStaticAdminFile(response, assetPath);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      requireAdminAuth(serverConfig, request);
      return sendJson(response, 200, {
        ok: true,
        configPath: serverConfig.configPath,
        vaultRoot: runtimeConfigCache.vaultRoot,
        allowedDirs: runtimeConfigCache.allowedDirs
      });
    }

    if (request.method === "GET" && url.pathname === "/v1/config") {
      requireAdminAuth(serverConfig, request);
      return sendJson(response, 200, publicRuntimeConfig(runtimeConfigCache));
    }

    if (request.method === "GET" && url.pathname === "/v1/config/vault-dirs") {
      requireAdminAuth(serverConfig, request);
      await ensureRuntimeDirs(runtimeConfigCache);
      return sendJson(response, 200, {
        ok: true,
        dirs: await listVaultTopLevelDirs(runtimeConfigCache),
        allowedDirs: runtimeConfigCache.allowedDirs
      });
    }

    if (request.method === "PUT" && url.pathname === "/v1/config") {
      requireAdminAuth(serverConfig, request);
      requireAdminMutationProtection(request);
      const body = await readJsonBody(request, runtimeConfigCache.maxJsonBodyBytes);
      const runtimeConfig = normalizeRuntimeConfig(body, serverConfig, runtimeConfigCache);
      await ensureRuntimeDirs(runtimeConfig);
      await saveRuntimeConfig(serverConfig, runtimeConfig);
      runtimeConfigCache = runtimeConfig;
      reviewScheduler?.reschedule();
      return sendJson(response, 200, publicRuntimeConfig(runtimeConfig));
    }

    if (url.pathname.startsWith("/v1/api/")) {
      const action = decodeURIComponent(url.pathname.slice("/v1/api/".length));
      let authScheme;
      if (action.startsWith("index/") || action.startsWith("reviews/")) {
        authScheme = requireApiOrAdminAuth(serverConfig, request);
      } else {
        authScheme = requireApiAuth(serverConfig, request);
      }
      if (authScheme === "basic" && (ADMIN_INDEX_MUTATIONS.has(action) || ADMIN_REVIEW_MUTATIONS.has(action))) {
        requireAdminMutationProtection(request);
      }
      const body = ["GET", "DELETE"].includes(request.method)
        ? { json: {}, text: "" }
        : await readAnyBody(request, runtimeConfigCache.maxJsonBodyBytes);
      const input = {
        ...Object.fromEntries(url.searchParams.entries()),
        ...body.json
      };
      if (body.text && input.content === undefined && input.text === undefined) {
        input.content = body.text;
      }
      await ensureRuntimeDirs(runtimeConfigCache);
      const result = await executeApiAction(runtimeConfigCache, action, input);
      return sendJson(response, result.ok === false ? 400 : 200, result);
    }

    return sendJson(response, 404, { ok: false, error: "Not found" });
  } catch (error) {
    const status = error.statusCode || 400;
    return sendJson(response, status, { ok: false, error: error.message }, error.headers);
  }
});

server.listen(serverConfig.port, serverConfig.bindHost, () => {
  console.log(`VaultEcho API listening on http://${serverConfig.bindHost}:${serverConfig.port}`);
  console.log(`VaultEcho config UI available at http://${serverConfig.bindHost}:${serverConfig.port}/`);
});

startEmbeddingAutoScan(() => Promise.resolve(runtimeConfigCache));
startIdempotencyCleanup(() => Promise.resolve(runtimeConfigCache));
reviewScheduler = startReviewTaskScheduler(() => Promise.resolve(runtimeConfigCache));

async function ensureRuntimeDirs(config) {
  await fs.mkdir(config.vaultRoot, { recursive: true });
  await fs.mkdir(config.dataDir, { recursive: true });
}

async function listVaultTopLevelDirs(config) {
  const entries = await fs.readdir(config.vaultRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

function requireApiAuth(config, request) {
  if (!config.apiToken) {
    const error = new Error("API_TOKEN is not configured");
    error.statusCode = 500;
    throw error;
  }

  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) {
    const error = new Error("Bearer token required");
    error.statusCode = 401;
    error.headers = {
      "www-authenticate": 'Bearer realm="VaultEcho API"'
    };
    throw error;
  }

  const expected = `Bearer ${config.apiToken}`;
  if (!constantTimeEqual(authorization, expected)) {
    const error = new Error("Invalid bearer token");
    error.statusCode = 401;
    error.headers = {
      "www-authenticate": 'Bearer realm="VaultEcho API"'
    };
    throw error;
  }

  return "bearer";
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

  return "basic";
}

function requireApiOrAdminAuth(config, request) {
  const authorization = request.headers.authorization || "";
  if (authorization.startsWith("Basic ")) {
    return requireAdminAuth(config, request);
  }
  if (authorization.startsWith("Bearer ")) {
    return requireApiAuth(config, request);
  }
  return requireAdminAuth(config, request);
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

function requireAdminMutationProtection(request) {
  requireJsonContentType(request);
  requireTrustedBrowserOrigin(request);
}

function requireJsonContentType(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    const error = new Error("Admin write requests require application/json");
    error.statusCode = 415;
    throw error;
  }
}

function requireTrustedBrowserOrigin(request) {
  const origin = request.headers.origin;
  const referer = request.headers.referer;

  if (origin && !matchesRequestHost(request, origin)) {
    const error = new Error("Cross-origin admin request rejected");
    error.statusCode = 403;
    throw error;
  }

  if (!origin && referer && !matchesRequestHost(request, referer)) {
    const error = new Error("Cross-origin admin request rejected");
    error.statusCode = 403;
    throw error;
  }
}

function matchesRequestHost(request, value) {
  const host = requestHost(request);
  if (!host) return false;
  try {
    return new URL(value).host === host;
  } catch {
    return false;
  }
}

function requestHost(request) {
  const forwardedHost = request.headers["x-forwarded-host"];
  const host = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || request.headers.host || "";
  return String(host).split(",")[0].trim();
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

function resolveAdminAssetPath(urlPathname) {
  let relativePath = "";
  try {
    relativePath = decodeURIComponent(urlPathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
  const absolutePath = path.resolve(ADMIN_DIST_ROOT, relativePath);
  if (absolutePath !== ADMIN_DIST_ROOT && !absolutePath.startsWith(`${ADMIN_DIST_ROOT}${path.sep}`)) {
    return null;
  }
  return absolutePath;
}

async function sendStaticAdminFile(response, absolutePath) {
  let body;
  try {
    body = await fs.readFile(absolutePath);
  } catch (error) {
    const statusCode = error.code === "ENOENT" ? 404 : 500;
    return sendJson(response, statusCode, {
      ok: false,
      error: statusCode === 404 ? "Admin UI asset not found. Run `npm run admin:build`." : error.message
    });
  }

  response.writeHead(200, {
    "content-type": STATIC_CONTENT_TYPES[path.extname(absolutePath)] || "application/octet-stream",
    "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; frame-ancestors 'none'",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY"
  });
  response.end(body);
}
