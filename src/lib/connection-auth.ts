import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { decryptJson, encryptJson } from "@/lib/crypto";
import { isExpired, refreshAccessToken, type GoogleAuthData } from "@/connectors/google-oauth";
import type { AuthData } from "@/connectors/types";

type ConnectionRow = typeof schema.connections.$inferSelect;

/**
 * Decrypt a connection's credentials, transparently refreshing Google OAuth
 * access tokens (and persisting the refreshed token) when needed.
 */
export async function getFreshAuth(conn: ConnectionRow): Promise<AuthData> {
  if (!conn.authData) return {};
  const auth = decryptJson<AuthData>(conn.authData);

  if (conn.provider === "google_sheets") {
    const g = auth as unknown as GoogleAuthData;
    if (g.refreshToken && isExpired(g)) {
      const refreshed = await refreshAccessToken(g.refreshToken);
      const updated = { ...auth, ...refreshed };
      await db()
        .update(schema.connections)
        .set({ authData: encryptJson(updated) })
        .where(eq(schema.connections.id, conn.id));
      return updated;
    }
  }
  return auth;
}
