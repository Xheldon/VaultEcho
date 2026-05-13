import { executeOperation } from "./vault.js";
import { renderTemplate } from "./time.js";

const MAX_SCRIPT_OPERATIONS = 20;

export async function executeVaultScript(config, script, context = {}) {
  if (!script) return [];

  const operations = normalizeScript(script);
  if (operations.length > MAX_SCRIPT_OPERATIONS) {
    throw new Error(`script can contain at most ${MAX_SCRIPT_OPERATIONS} operations`);
  }

  const results = [];
  let currentContext = { ...context };

  for (const rawOperation of operations) {
    const operation = renderOperation(rawOperation, currentContext);
    const result = await executeOperation(config, normalizeScriptOperation(operation));
    results.push(result);
    currentContext = {
      ...currentContext,
      lastPath: result.path || currentContext.lastPath,
      lastOperation: result.operation || operation.operation,
      lastResult: JSON.stringify(result)
    };
  }

  return results;
}

function normalizeScript(script) {
  let parsed;
  try {
    parsed = typeof script === "string" ? JSON.parse(script) : script;
  } catch {
    throw new Error("script must be URL-encoded JSON, not executable code");
  }

  const operations = Array.isArray(parsed) ? parsed : parsed.operations || parsed.ops || [parsed];
  if (!Array.isArray(operations)) {
    throw new Error("script must be a JSON object, an array, or { operations: [...] }");
  }

  return operations;
}

function normalizeScriptOperation(operation) {
  const op = operation.op || operation.operation;
  if (!op) {
    throw new Error("script operation requires op or operation");
  }

  return {
    ...operation,
    operation: normalizeOperationName(op)
  };
}

function normalizeOperationName(op) {
  switch (op) {
    case "create":
    case "new":
      return "create_markdown";
    case "delete":
      return "soft_delete";
    case "daily":
      return "append_daily_by_time";
    default:
      return op;
  }
}

function renderOperation(value, context) {
  if (typeof value === "string") return renderTemplate(value, context);
  if (Array.isArray(value)) return value.map((item) => renderOperation(item, context));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, renderOperation(nested, context)])
    );
  }
  return value;
}
