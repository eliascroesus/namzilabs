import { NextResponse, type NextRequest } from "next/server";

/**
 * Lightweight gate: with database sessions the real check happens
 * server-side in the (app) layout via auth(). Middleware only bounces
 * clearly-unauthenticated visitors (no session cookie at all) to /login
 * without a DB hit.
 */
export function middleware(request: NextRequest) {
  const hasSessionCookie =
    request.cookies.has("__Secure-authjs.session-token") ||
    request.cookies.has("authjs.session-token");
  if (!hasSessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|login|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
