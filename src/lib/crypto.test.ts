import { describe, expect, it } from "vitest";
import { decryptJson, encryptJson } from "@/lib/crypto";

const SECRET = "test-secret-key-for-unit-tests-only";

describe("crypto helpers", () => {
  it("round-trips objects", () => {
    const value = { apiKey: "sk_live_abc123", nested: { refreshToken: "r1", n: 42 } };
    const encrypted = encryptJson(value, SECRET);
    expect(decryptJson(encrypted, SECRET)).toEqual(value);
  });

  it("round-trips primitives and arrays", () => {
    for (const value of ["a-string", 123, true, null, [1, "two", { three: 3 }]]) {
      expect(decryptJson(encryptJson(value, SECRET), SECRET)).toEqual(value);
    }
  });

  it("never contains the plaintext", () => {
    const encrypted = encryptJson({ apiKey: "super-secret-value" }, SECRET);
    expect(encrypted).not.toContain("super-secret-value");
  });

  it("produces a unique ciphertext per call (random IV)", () => {
    const value = { apiKey: "same-input" };
    expect(encryptJson(value, SECRET)).not.toEqual(encryptJson(value, SECRET));
  });

  it("rejects tampered ciphertext (GCM auth tag)", () => {
    const encrypted = encryptJson({ apiKey: "x" }, SECRET);
    const [iv, tag, data] = encrypted.split(".");
    const flipped = Buffer.from(data, "base64");
    flipped[0] = flipped[0] ^ 0xff;
    const tampered = [iv, tag, flipped.toString("base64")].join(".");
    expect(() => decryptJson(tampered, SECRET)).toThrow();
  });

  it("rejects the wrong key", () => {
    const encrypted = encryptJson({ apiKey: "x" }, SECRET);
    expect(() => decryptJson(encrypted, "a-different-secret")).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptJson("not-a-valid-payload", SECRET)).toThrow(/format/);
  });
});
