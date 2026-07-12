import { createHash } from "crypto";
import type { Connector, NormalizedEvent, RawRecord } from "@/connectors/types";
import { apiFetch, parseAmount, parseDate } from "@/connectors/util";
import { SHEETS_MAX_FINGERPRINTS } from "@/lib/config";

const SHEETS = "https://sheets.googleapis.com/v4";
const DRIVE = "https://www.googleapis.com/drive/v3";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bearer(auth: Record<string, unknown>) {
  return { authorization: `Bearer ${auth.accessToken as string}` };
}

export type SheetsConfig = {
  spreadsheetId: string;
  spreadsheetName: string;
  sheetTitle: string;
  /** Header captured at setup, used to label row values. */
  headerRow: string[];
  timestampColumn?: string;
  emailColumn?: string;
  amountColumn?: string;
};

/**
 * Row identity strategy (documented decision):
 * fingerprint = sha256(JSON(cell values)) + ":" + occurrence-index among
 * identical rows in the same scan. Content-based (survives sorting and
 * row-shifting inserts, which index-based IDs do not), with the occurrence
 * suffix so duplicate rows each count once. Known limitation: EDITING an
 * existing row changes its fingerprint and re-emits it as row_added — use
 * a timestamp column for accurate occurred_at, and treat the sheet as
 * append-only for best results.
 */
export function fingerprintRows(rows: string[][]): { fingerprint: string; row: string[] }[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const base = createHash("sha256").update(JSON.stringify(row)).digest("hex");
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { fingerprint: `${base}:${n}`, row };
  });
}

async function readAllRows(auth: Record<string, unknown>, cfg: SheetsConfig): Promise<string[][]> {
  const range = encodeURIComponent(`'${cfg.sheetTitle.replaceAll("'", "''")}'`);
  const res = await apiFetch<{ values?: string[][] }>(
    `${SHEETS}/spreadsheets/${cfg.spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    { headers: bearer(auth) },
  );
  return (res.values ?? []).map((row) => row.map((cell) => String(cell ?? "")));
}

function rowToObject(header: string[], row: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  header.forEach((h, i) => {
    if (h) out[h.slice(0, 60)] = (row[i] ?? "").slice(0, 300);
  });
  return out;
}

/**
 * Google Sheets — polling only. Sheets has no webhooks, and Drive push
 * channels expire and batch (~3 min); a 5-minute Inngest poll with row
 * fingerprinting is simpler and equally fresh. On connect, the current rows
 * are snapshotted into the cursor so history doesn't flood in as new events.
 */
export const googleSheetsConnector: Connector = {
  provider: "google_sheets",
  authMethod: "oauth",
  label: "Google Sheets",
  description: "Turn every new spreadsheet row into a trackable event.",
  producedEventTypes: ["row_added"],

  async testConnection(auth) {
    try {
      await apiFetch(`${DRIVE}/about?fields=user`, { headers: bearer(auth) });
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Google connection failed" };
    }
  },

  async fetchSample(auth, config) {
    const cfg = config as SheetsConfig;
    if (!cfg.spreadsheetId || !cfg.sheetTitle) return [];
    const rows = await readAllRows(auth, cfg);
    if (rows.length < 2) return [];
    const header = rows[0];
    return rows.slice(-3).map((row) => rowToObject(header, row));
  },

  async poll(auth, config, cursor) {
    const cfg = config as SheetsConfig;
    const known = new Set((cursor.fingerprints as string[] | undefined) ?? []);
    const rows = await readAllRows(auth, cfg);
    if (rows.length === 0) return { records: [], nextCursor: { fingerprints: [] } };

    const header = rows[0];
    const dataRows = fingerprintRows(rows.slice(1));

    const records: RawRecord[] = dataRows
      .filter(({ fingerprint }) => !known.has(fingerprint))
      .map(({ fingerprint, row }) => ({ fingerprint, row: rowToObject(header, row) }));

    // Keep the most recent fingerprints (end of sheet = newest rows).
    const all = dataRows.map((r) => r.fingerprint);
    const nextCursor = { fingerprints: all.slice(-SHEETS_MAX_FINGERPRINTS) };
    return { records, nextCursor };
  },

  normalize(raw: RawRecord, conn): NormalizedEvent[] {
    const cfg = conn.config as SheetsConfig;
    const fingerprint = raw.fingerprint as string | undefined;
    const row = (raw.row ?? {}) as Record<string, string>;
    if (!fingerprint) return [];

    const occurredAt =
      (cfg.timestampColumn ? parseDate(row[cfg.timestampColumn]) : null) ?? new Date();

    let email = cfg.emailColumn ? row[cfg.emailColumn] : undefined;
    if (!email) {
      const emailHeader = Object.keys(row).find((h) => h.toLowerCase().includes("email"));
      email = emailHeader ? row[emailHeader] : undefined;
    }

    return [
      {
        eventType: "row_added",
        externalId: fingerprint,
        occurredAt,
        contactEmail: email && EMAIL_RE.test(email) ? email : undefined,
        amount: cfg.amountColumn ? parseAmount(row[cfg.amountColumn]) : undefined,
        metadata: Object.fromEntries(Object.entries(row).slice(0, 15)),
      },
    ];
  },
};

// ---- Wizard helpers (not part of the Connector interface) ------------------

export async function listSpreadsheets(auth: Record<string, unknown>) {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
  const res = await apiFetch<{ files?: { id: string; name: string; modifiedTime: string }[] }>(
    `${DRIVE}/files?q=${q}&orderBy=modifiedTime desc&pageSize=25&fields=files(id,name,modifiedTime)`,
    { headers: bearer(auth) },
  );
  return res.files ?? [];
}

export async function listSheetTabs(auth: Record<string, unknown>, spreadsheetId: string) {
  const res = await apiFetch<{ sheets?: { properties: { title: string } }[] }>(
    `${SHEETS}/spreadsheets/${spreadsheetId}?fields=sheets.properties(title)`,
    { headers: bearer(auth) },
  );
  return (res.sheets ?? []).map((s) => s.properties.title);
}

export async function getHeaderRow(
  auth: Record<string, unknown>,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<string[]> {
  const range = encodeURIComponent(`'${sheetTitle.replaceAll("'", "''")}'!1:1`);
  const res = await apiFetch<{ values?: string[][] }>(
    `${SHEETS}/spreadsheets/${spreadsheetId}/values/${range}`,
    { headers: bearer(auth) },
  );
  return (res.values?.[0] ?? []).map((v) => String(v ?? ""));
}
