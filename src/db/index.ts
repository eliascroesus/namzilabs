import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { env } from "@/lib/env";
import * as schema from "@/db/schema";

let cached: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Neon over HTTP: one stateless fetch per query — no connection pools to
 * exhaust on serverless. Lazy so importing this module never crashes a
 * build that has no DATABASE_URL.
 */
export function db(): NeonHttpDatabase<typeof schema> {
  if (!cached) {
    cached = drizzle(neon(env().DATABASE_URL), { schema });
  }
  return cached;
}

export { schema };
