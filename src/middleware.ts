import { NextResponse, type NextRequest } from "next/server";

/** Marketing and legal pages stay reachable without a session. */
const PUBLIC_PATHS = new Set(["/", "/login", "/terms", "/privacy"]);

/**
 * Lightweight gate: the real check happens server-side in the (app) layout
 * via auth(). Middleware only bounces clearly-unauthenticated visitors
 * (no session cookie at all) to /login without a DB hit.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  const hasSessionCookie =
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("authjs.session-token");
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
