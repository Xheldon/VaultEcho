import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { uploadAttachment, uploadAttachmentFromRequest } from "../src/attachments.js";

test("uploadAttachment stores arbitrary files and returns flat links", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-attachments-"));
  const config = testConfig(root);

  const result = await uploadAttachment(config, {
    data: Buffer.from("raw-bytes"),
    filename: "sensor.raw",
    mimeType: "application/octet-stream",
    type: "file"
  });

  assert.equal(result.path, "Attachments/Files/sensor.raw");
  assert.equal(result.wiki, "![[Attachments/Files/sensor.raw]]");
  assert.equal(result.markdown, "![sensor](<Attachments/Files/sensor.raw>)");
  assert.equal(await fs.readFile(path.join(root, "vault", result.path), "utf8"), "raw-bytes");
});

test("uploadAttachment infers media directories and appends suffixes on collisions", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-attachments-"));
  const config = testConfig(root);
  await fs.mkdir(path.join(root, "vault", "Attachments", "Images"), { recursive: true });
  await fs.writeFile(path.join(root, "vault", "Attachments", "Images", "photo.png"), "existing", "utf8");

  const result = await uploadAttachment(config, {
    data: Buffer.from("new-image"),
    filename: "photo.png",
    mimeType: "image/png"
  });

  assert.equal(result.type, "image");
  assert.equal(result.path, "Attachments/Images/photo 1.png");
  assert.equal(await fs.readFile(path.join(root, "vault", result.path), "utf8"), "new-image");
});

test("uploadAttachmentFromRequest accepts multipart form data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "vaultecho-attachments-"));
  const config = testConfig(root);
  const boundary = "----vaultecho-test-boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="type"\r\n\r\nvideo\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\n`),
    Buffer.from("video-bytes"),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);
  const request = Readable.from([body]);
  request.headers = {
    "content-type": `multipart/form-data; boundary=${boundary}`
  };

  const result = await uploadAttachmentFromRequest(config, request, new URLSearchParams());

  assert.equal(result.type, "video");
  assert.equal(result.path, "Attachments/Video/clip.mp4");
  assert.equal(await fs.readFile(path.join(root, "vault", result.path), "utf8"), "video-bytes");
});

function testConfig(root) {
  return {
    vaultRoot: path.join(root, "vault"),
    dataDir: path.join(root, "data"),
    allowedDirs: ["Attachments"],
    attachments: {
      imageDir: "Attachments/Images",
      audioDir: "Attachments/Audio",
      videoDir: "Attachments/Video",
      fileDir: "Attachments/Files",
      maxUploadBytes: 10 * 1024 * 1024
    }
  };
}
