import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { API_HANDLER_ROUTES } from "../src/api.js";
import { API_ALIASES, apiRouteNames, renderApiDocs } from "../src/api-spec.js";

test("api spec covers every implemented route and only implemented routes", () => {
  assert.deepEqual([...apiRouteNames()].sort(), [...API_HANDLER_ROUTES].sort());
});

test("api aliases point to documented routes", () => {
  const routes = new Set(apiRouteNames());
  for (const [alias, route] of Object.entries(API_ALIASES)) {
    assert.ok(routes.has(route), `${alias} points to undocumented route ${route}`);
  }
});

test("generated api markdown is up to date", async () => {
  const docs = await fs.readFile("docs/api.md", "utf8");
  assert.equal(docs, renderApiDocs());
});
