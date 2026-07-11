import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { buildAuthUrl } from "@/connectors/google-oauth";

/**
 * Kicks off per-connection Google OAuth for the Sheets connector.
 * State = connectionId + nonce, with the nonce pinned in an httpOnly cookie
 * (CSRF protection for the callback).
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const cid = request.nextUrl.searchParams.get("cid");
  if (!cid) return NextResponse.json({ error: "Missing cid" }, { status: 400 });

  const [conn] = await db()
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.id, cid), eq(schema.connections.provider, "google_sheets")));
  if (!conn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Ownership check: the signed-in user must belong to the connection's workspace.
  const [membership] = await db()
    .select({ id: schema.workspaceMembers.id })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, conn.workspaceId),
        eq(schema.workspaceMembers.userId, session.user.id),
      ),
    );
  if (!membership) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const nonce = randomBytes(16).toString("hex");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const redirectUri = `${proto}://${host}/api/oauth/google/callback`;

  const res = NextResponse.redirect(buildAuthUrl(redirectUri, `${cid}.${nonce}`));
  res.cookies.set("google_oauth_nonce", nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/api/oauth/google",
  });
  return res;
}
