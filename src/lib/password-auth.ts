import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensurePersonalWorkspace } from "@/lib/workspace";
import { safeEqual } from "@/connectors/util";

const OWNER_EMAIL = "owner@namzilabs.co";
const DEFAULT_PASSWORD = "Namzilabs123";

/**
 * The shared password, hardened against the common env-var foot-guns:
 * empty string falls back to the default, surrounding whitespace and
 * accidentally pasted quotes are stripped.
 */
export function expectedPassword(): string {
  const raw = process.env.APP_PASSWORD || DEFAULT_PASSWORD;
  return raw.trim().replace(/^["']+|["']+$/g, "") || DEFAULT_PASSWORD;
}

async function ensureOwnerUser() {
  let [user] = await db().select().from(schema.users).where(eq(schema.users.email, OWNER_EMAIL));
  if (!user) {
    [user] = await db()
      .insert(schema.users)
      .values({ email: OWNER_EMAIL, name: "Namzi" })
      .returning();
  }
  await ensurePersonalWorkspace(user.id, "Namzi");
  return user;
}

/**
 * Credentials check for the pre-launch password wall.
 * Returns the owner user on success, null on a wrong password.
 * DB failures (missing tables, bad DATABASE_URL) THROW — they must surface
 * as server errors, never be mistaken for a wrong password.
 */
export async function authorizePassword(
  password: unknown,
): Promise<{ id: string; email: string | null; name: string | null } | null> {
  const provided = typeof password === "string" ? password.trim() : "";
  if (!provided || !safeEqual(provided, expectedPassword())) return null;
  const user = await ensureOwnerUser();
  return { id: user.id, email: user.email, name: user.name };
}
