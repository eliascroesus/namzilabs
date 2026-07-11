import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "@/lib/env";

/**
 * AES-256-GCM encryption for integration credentials at rest.
 * Output format: base64(iv) . base64(authTag) . base64(ciphertext)
 * Plaintext secrets must never be written to the DB or logs.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // NIST-recommended IV size for GCM

function deriveKey(secret: string): Buffer {
  // Normalize whatever the operator provides (base64, hex, passphrase) to 32 bytes.
  return createHash("sha256").update(secret).digest();
}

export function encryptJson(value: unknown, secret: string = env().ENCRYPTION_KEY): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

export function decryptJson<T = unknown>(payload: string, secret: string = env().ENCRYPTION_KEY): T {
  const key = deriveKey(secret);
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }
  const [iv, tag, ciphertext] = parts.map((p) => Buffer.from(p, "base64"));
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
