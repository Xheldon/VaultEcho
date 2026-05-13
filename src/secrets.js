import crypto from "node:crypto";

const ENCRYPTION_VERSION = "v1";

export function encryptSecret(plainText, keyMaterial) {
  if (!plainText) return "";
  const key = deriveKey(keyMaterial);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptSecret(cipherText, keyMaterial) {
  if (!cipherText) return "";
  const [version, ivValue, tagValue, encryptedValue] = String(cipherText).split(".");
  if (version !== ENCRYPTION_VERSION || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Unsupported encrypted secret format");
  }

  const key = deriveKey(keyMaterial);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function deriveKey(keyMaterial) {
  if (!keyMaterial || typeof keyMaterial !== "string") {
    throw new Error("APP_ENCRYPTION_KEY is required to store encrypted secrets");
  }
  return crypto.createHash("sha256").update(keyMaterial).digest();
}
