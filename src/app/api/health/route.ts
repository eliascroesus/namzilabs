import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Self-diagnosis endpoint (no secrets exposed):
 * - env: are the required env vars present?
 * - database: can we connect?
 * - migrations: does the schema exist (users table reachable)?
 */
export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
    ENCRYPTION_KEY: Boolean(process.env.ENCRYPTION_KEY),
  };

  let database: "ok" | "unreachable" = "unreachable";
  let migrations: "ok" | "missing" | "unknown" = "unknown";
  let detail: string | null = null;

  try {
    await db().execute(sql`select 1`);
    database = "ok";
    try {
      await db().select({ id: schema.users.id }).from(schema.users).limit(1);
      migrations = "ok";
    } catch {
      migrations = "missing";
      detail = "Database reachable but tables are missing — run `npm run db:migrate` against this DATABASE_URL.";
    }
  } catch (err) {
    detail =
      "Cannot reach the database. Check DATABASE_URL in the deployment environment (and redeploy after changing env vars).";
    if (err instanceof Error && /fetch failed|ENOTFOUND|ECONNREFUSED/i.test(err.message)) {
      detail += " The host did not respond.";
    }
  }

  const ok = database === "ok" && migrations === "ok" && env.DATABASE_URL && env.AUTH_SECRET;
  return NextResponse.json({ ok, env, database, migrations, detail }, { status: ok ? 200 : 503 });
}
