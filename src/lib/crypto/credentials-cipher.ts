import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = 1;
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function parseMasterKey(raw: string): Buffer {
  const t = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) {
    return Buffer.from(t, "hex");
  }
  const b = Buffer.from(t, "base64");
  if (b.length !== KEY_LEN) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be 32 bytes (base64) or 64 hex chars."
    );
  }
  return b;
}

function getMasterKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is not set. Generate with: openssl rand -base64 32"
    );
  }
  return parseMasterKey(raw);
}

/**
 * Encrypt a UTF-8 string for storage in Postgres. Output is opaque ASCII (JSON base64).
 * Decrypt only on the server when connecting to external systems.
 */
export function encryptCredentialSecret(plainText: string): string {
  const key = getMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = {
    v: VERSION,
    iv: iv.toString("base64"),
    ct: enc.toString("base64"),
    tag: tag.toString("base64"),
  };
  return JSON.stringify(payload);
}

export function decryptCredentialSecret(stored: string): string {
  const key = getMasterKey();
  let parsed: { v?: number; iv?: string; ct?: string; tag?: string };
  try {
    parsed = JSON.parse(stored) as typeof parsed;
  } catch {
    throw new Error("Invalid credential ciphertext envelope");
  }
  if (parsed.v !== VERSION || !parsed.iv || !parsed.ct || !parsed.tag) {
    throw new Error("Unsupported or corrupt credential ciphertext");
  }
  const iv = Buffer.from(parsed.iv, "base64");
  const ciphertext = Buffer.from(parsed.ct, "base64");
  const tag = Buffer.from(parsed.tag, "base64");
  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: TAG_LEN });
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return out.toString("utf8");
}
