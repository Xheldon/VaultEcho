import fs from "node:fs/promises";
import path from "node:path";
import { resolveVaultPath } from "./vault.js";

const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set(["image", "audio", "video", "file"]);
const MIME_EXTENSIONS = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "application/pdf": ".pdf"
};

export async function uploadAttachmentFromRequest(config, request, queryParams = {}) {
  const contentType = request.headers["content-type"] || "";
  const boundary = multipartBoundary(contentType);
  if (!boundary) {
    const error = new Error("attachments/upload requires multipart/form-data");
    error.statusCode = 415;
    throw error;
  }

  const form = parseMultipartFormData(
    await readRawBuffer(request, config.attachments?.maxUploadBytes || DEFAULT_MAX_UPLOAD_BYTES),
    boundary
  );
  const fields = { ...Object.fromEntries(queryParams.entries()), ...form.fields };
  const file = form.files.find((item) => item.name === "file") || form.files[0];
  if (!file) {
    const error = new Error("multipart field `file` is required");
    error.statusCode = 400;
    throw error;
  }

  return uploadAttachment(config, {
    data: file.data,
    filename: fields.filename || fields.name || file.filename,
    mimeType: fields.mimeType || file.mimeType,
    type: fields.type,
    alt: fields.alt
  });
}

export async function uploadAttachment(config, input) {
  const data = Buffer.isBuffer(input.data) ? input.data : Buffer.from(input.data || "");
  if (data.length === 0) {
    throw new Error("attachment file is empty");
  }
  const mimeType = normalizeMimeType(input.mimeType);
  const type = normalizeAttachmentType(input.type, mimeType);
  const directory = attachmentDirectory(config, type);
  const filename = sanitizeAttachmentFilename(input.filename, mimeType);
  const saved = await writeUniqueAttachment(config, directory, filename, data);
  const alt = sanitizeAltText(input.alt || path.basename(saved.filename, path.extname(saved.filename)));

  return {
    ok: true,
    operation: "attachments/upload",
    type,
    path: saved.relativePath,
    filename: saved.filename,
    mimeType,
    size: data.length,
    wiki: `![[${saved.relativePath}]]`,
    markdown: `![${alt}](<${escapeMarkdownDestination(saved.relativePath)}>)`
  };
}

async function writeUniqueAttachment(config, directory, filename, data) {
  for (let index = 0; index < 10000; index += 1) {
    const candidate = appendFilenameSuffix(filename, index);
    const target = resolveVaultPath(config, path.posix.join(directory, candidate));
    await fs.mkdir(path.dirname(target.absolutePath), { recursive: true });
    try {
      await fs.writeFile(target.absolutePath, data, { flag: "wx" });
      return { relativePath: target.relativePath, filename: candidate };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Could not find an available attachment filename for ${filename}`);
}

function attachmentDirectory(config, type) {
  const attachments = config.attachments || {};
  if (type === "image") return attachments.imageDir;
  if (type === "audio") return attachments.audioDir;
  if (type === "video") return attachments.videoDir;
  return attachments.fileDir;
}

function normalizeAttachmentType(inputType, mimeType) {
  const requested = String(inputType || "").trim().toLowerCase();
  if (ALLOWED_ATTACHMENT_TYPES.has(requested)) return requested;
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

function sanitizeAttachmentFilename(inputFilename, mimeType) {
  const basename = path.posix.basename(String(inputFilename || "").replaceAll("\\", "/"));
  const sanitized = basename
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = `attachment-${new Date().toISOString().replace(/[:.]/g, "-")}${extensionForMime(mimeType)}`;
  const filename = sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : fallback;
  if (path.extname(filename)) return filename;
  return `${filename}${extensionForMime(mimeType)}`;
}

function appendFilenameSuffix(filename, index) {
  if (index === 0) return filename;
  const extension = path.extname(filename);
  const stem = extension ? filename.slice(0, -extension.length) : filename;
  return `${stem} ${index}${extension}`;
}

function normalizeMimeType(mimeType) {
  return String(mimeType || "application/octet-stream").split(";")[0].trim().toLowerCase() || "application/octet-stream";
}

function extensionForMime(mimeType) {
  return MIME_EXTENSIONS[normalizeMimeType(mimeType)] || "";
}

function sanitizeAltText(value) {
  return String(value || "attachment").replaceAll("]", "\\]").replace(/\s+/g, " ").trim() || "attachment";
}

function escapeMarkdownDestination(value) {
  return String(value).replaceAll(">", "%3E");
}

function multipartBoundary(contentType) {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return match ? match[1] || match[2] : "";
}

async function readRawBuffer(request, maxBytes) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) {
      const error = new Error("Attachment upload is too large");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

function parseMultipartFormData(buffer, boundary) {
  const fields = {};
  const files = [];
  const parts = splitBuffer(buffer, Buffer.from(`--${boundary}`));

  for (let index = 1; index < parts.length; index += 1) {
    let part = parts[index];
    if (part.subarray(0, 2).toString() === "--") break;
    if (part.subarray(0, 2).toString() === "\r\n") part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === "\r\n") part = part.subarray(0, part.length - 2);
    if (part.length === 0) continue;

    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headers = parsePartHeaders(part.subarray(0, headerEnd).toString("utf8"));
    const disposition = parseContentDisposition(headers["content-disposition"] || "");
    const name = disposition.name || "";
    if (!name) continue;
    const data = part.subarray(headerEnd + 4);
    if (disposition.filename) {
      files.push({
        name,
        filename: disposition.filename,
        mimeType: headers["content-type"] || "application/octet-stream",
        data
      });
    } else {
      fields[name] = data.toString("utf8");
    }
  }

  return { fields, files };
}

function splitBuffer(buffer, separator) {
  const parts = [];
  let start = 0;
  let index = buffer.indexOf(separator, start);
  while (index !== -1) {
    parts.push(buffer.subarray(start, index));
    start = index + separator.length;
    index = buffer.indexOf(separator, start);
  }
  parts.push(buffer.subarray(start));
  return parts;
}

function parsePartHeaders(rawHeaders) {
  const headers = {};
  for (const line of rawHeaders.split("\r\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    headers[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
  }
  return headers;
}

function parseContentDisposition(value) {
  const result = {};
  for (const part of value.split(";").slice(1)) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim().toLowerCase();
    let raw = part.slice(separator + 1).trim();
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1).replace(/\\"/g, '"');
    result[key] = raw;
  }
  if (result["filename*"]) {
    result.filename = decodeRfc5987Value(result["filename*"]) || result.filename;
  }
  return result;
}

function decodeRfc5987Value(value) {
  const match = /^utf-8''(.+)$/i.exec(value);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
}
