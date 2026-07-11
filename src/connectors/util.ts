import { createHmac, timingSafeEqual } from "crypto";

/** Constant-time string comparison (secrets, signatures). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hmacSha256Hex(key: string, data: string): string {
  return createHmac("sha256", key).update(data, "utf8").digest("hex");
}

/**
 * Read a value from a nested object via dot path ("payload.email",
 * "data.items.0.id"). Returns undefined on any miss.
 */
export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split(".")) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** Parse anything date-ish into a valid Date, or null. */
export function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Heuristic: seconds vs milliseconds epochs
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Parse anything number-ish into a numeric string for the amount column. */
export function parseAmount(value: unknown): string | undefined {
  if (typeof value === "number" && isFinite(value)) return String(value);
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    if (cleaned !== "" && isFinite(Number(cleaned))) return cleaned;
  }
  return undefined;
}

export class ConnectorHttpError extends Error {
  constructor(
    public status: number,
    public body: string,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
  }
}

/**
 * Small fetch wrapper for provider APIs: JSON in/out, 15s timeout, errors
 * carry status + body (bodies of ERROR responses only — never log payloads).
 */
export async function apiFetch<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { "content-type": "application/json", ...rest.headers },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ConnectorHttpError(res.status, text.slice(0, 500));
  }
  return (text ? JSON.parse(text) : undefined) as T;
}
