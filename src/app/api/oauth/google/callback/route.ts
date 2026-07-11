import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { exchangeCode } from "@/connectors/google-oauth";
import { encryptJson } from "@/lib/crypto";
import { safeEqual } from "@/connectors/util";

/** Completes per-connection Google OAuth and returns to the wizard. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") ?? "";
  const [cid, nonce] = state.split(".");

  const cookieNonce = request.cookies.get("google_oauth_nonce")?.value;
  const back = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    res.cookies.delete("google_oauth_nonce");
    return res;
  };

  if (!code || !cid || !nonce || !cookieNonce || !safeEqual(nonce, cookieNonce)) {
    return back("/integrations?oauth_error=state");
  }

  const [conn] = await db()
    .select()
    .from(schema.connections)
    .where(eq(schema.connections.id, cid));
  if (!conn || conn.provider !== "google_sheets") {
    return back("/integrations?oauth_error=connection");
  }

  try {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    const redirectUri = `${proto}://${host}/api/oauth/google/callback`;
    const tokens = await exchangeCode(code, redirectUri);
    await db()
      .update(schema.connections)
      .set({ authData: encryptJson(tokens) })
      .where(eq(schema.connections.id, conn.id));
    return back(`/integrations/new/google_sheets?cid=${conn.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "token exchange failed";
    return back(`/integrations/new/google_sheets?cid=${conn.id}&oauth_error=${encodeURIComponent(message.slice(0, 120))}`);
  }
}
