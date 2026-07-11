import { env } from "@/lib/env";
import { apiFetch } from "@/connectors/util";

/**
 * Per-connection Google OAuth for the Sheets connector (separate from
 * login): read-only Sheets + Drive metadata scopes, offline access for a
 * refresh token. Uses the existing namzilabs.co Google client.
 */

export const GOOGLE_SHEETS_SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
].join(" ");

export type GoogleAuthData = {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms when accessToken expires. */
  expiresAt: number;
};

export function buildAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env().AUTH_GOOGLE_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SHEETS_SCOPES,
    access_type: "offline",
    prompt: "consent", // guarantees a refresh_token on every connect
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
};

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleAuthData> {
  const res = await apiFetch<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env().AUTH_GOOGLE_ID,
      client_secret: env().AUTH_GOOGLE_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!res.refresh_token) {
    throw new Error("Google did not return a refresh token. Remove the app's access at myaccount.google.com/permissions and connect again.");
  }
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: Date.now() + res.expires_in * 1000,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<Omit<GoogleAuthData, "refreshToken">> {
  const res = await apiFetch<TokenResponse>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env().AUTH_GOOGLE_ID,
      client_secret: env().AUTH_GOOGLE_SECRET,
      grant_type: "refresh_token",
    }).toString(),
  });
  return { accessToken: res.access_token, expiresAt: Date.now() + res.expires_in * 1000 };
}

export function isExpired(auth: GoogleAuthData): boolean {
  return auth.expiresAt < Date.now() + 60_000; // refresh 1 min early
}
