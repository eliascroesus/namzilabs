import { describe, expect, it } from "vitest";
import { fingerprintRows, googleSheetsConnector } from "@/connectors/google-sheets";
import type { ConnectionCtx } from "@/connectors/types";

const conn = (config: Record<string, unknown>): ConnectionCtx => ({
  id: "c1",
  provider: "google_sheets",
  config,
  webhookToken: "tok",
});

describe("google sheets connector", () => {
  it("fingerprints identical rows distinctly via occurrence index", () => {
    const rows = fingerprintRows([
      ["a", "1"],
      ["b", "2"],
      ["a", "1"], // duplicate content
    ]);
    expect(rows[0].fingerprint).not.toBe(rows[2].fingerprint);
    expect(rows[0].fingerprint.split(":")[0]).toBe(rows[2].fingerprint.split(":")[0]);
    expect(new Set(rows.map((r) => r.fingerprint)).size).toBe(3);
  });

  it("keeps fingerprints stable across scans (same data → same IDs)", () => {
    const scan1 = fingerprintRows([["x", "y"], ["z", "w"]]);
    const scan2 = fingerprintRows([["x", "y"], ["z", "w"]]);
    expect(scan1.map((r) => r.fingerprint)).toEqual(scan2.map((r) => r.fingerprint));
  });

  it("normalizes a row with timestamp, email, and amount columns", () => {
    const cfg = {
      spreadsheetId: "s1",
      spreadsheetName: "Leads",
      sheetTitle: "Sheet1",
      headerRow: ["Date", "Email", "Deal Size", "Source"],
      timestampColumn: "Date",
      emailColumn: "Email",
      amountColumn: "Deal Size",
    };
    const [event] = googleSheetsConnector.normalize(
      {
        fingerprint: "fp-1:0",
        row: { Date: "2026-07-09T08:00:00Z", Email: "lea@corp.com", "Deal Size": "$1,250", Source: "ads" },
      },
      conn(cfg),
    );
    expect(event).toMatchObject({
      eventType: "row_added",
      externalId: "fp-1:0",
      contactEmail: "lea@corp.com",
      amount: "1250",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-07-09T08:00:00.000Z");
    expect(event.metadata).toMatchObject({ Source: "ads" });
  });

  it("autodetects an email-ish column when none is configured", () => {
    const [event] = googleSheetsConnector.normalize(
      {
        fingerprint: "fp-2:0",
        row: { Name: "Noah", "Work Email": "noah@biz.io" },
      },
      conn({ spreadsheetId: "s", spreadsheetName: "n", sheetTitle: "t", headerRow: [] }),
    );
    expect(event.contactEmail).toBe("noah@biz.io");
  });

  it("skips records without a fingerprint", () => {
    expect(
      googleSheetsConnector.normalize({ row: { A: "1" } }, conn({ spreadsheetId: "s", spreadsheetName: "n", sheetTitle: "t", headerRow: [] })),
    ).toEqual([]);
  });
});
