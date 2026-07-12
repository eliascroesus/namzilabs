import { afterEach, describe, expect, it, vi } from "vitest";
import { instantlyConnector } from "@/connectors/instantly";
import type { ConnectionCtx } from "@/connectors/types";

const conn: ConnectionCtx = { id: "c1", provider: "instantly", config: {}, webhookToken: "tok" };

/** Shape per Instantly's webhook-events docs (base fields). */
const replyReceived = {
  timestamp: "2026-07-10T18:44:02.000Z",
  event_type: "reply_received",
  workspace: "ws-uuid-1",
  campaign_id: "cmp-uuid-9",
  campaign_name: "Q3 Outbound",
  lead_email: "kai@prospect.io",
  email_account: "sender@namzilabs.co",
  unibox_url: "https://app.instantly.ai/app/unibox?x=1",
};

describe("instantly connector", () => {
  it("normalizes tracked events with a deterministic provider-data ID", () => {
    const [event] = instantlyConnector.normalize(replyReceived, conn);
    expect(event).toMatchObject({
      eventType: "reply_received",
      contactEmail: "kai@prospect.io",
      externalId: "reply_received:cmp-uuid-9:kai@prospect.io:2026-07-10T18:44:02.000Z",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-07-10T18:44:02.000Z");
    expect(event.metadata).toMatchObject({ campaign_name: "Q3 Outbound" });
  });

  it("produces identical IDs for retried deliveries of the same payload", () => {
    const [a] = instantlyConnector.normalize(replyReceived, conn);
    const [b] = instantlyConnector.normalize({ ...replyReceived }, conn);
    expect(a.externalId).toBe(b.externalId);
  });

  it("tracks the full tracked set and skips everything else", () => {
    for (const t of ["email_sent", "email_opened", "reply_received", "lead_interested", "lead_meeting_booked"]) {
      expect(instantlyConnector.normalize({ ...replyReceived, event_type: t }, conn)[0].eventType).toBe(t);
    }
    for (const t of ["email_bounced", "lead_unsubscribed", "campaign_completed", "account_error"]) {
      expect(instantlyConnector.normalize({ ...replyReceived, event_type: t }, conn)).toEqual([]);
    }
  });
});

describe("instantly polling fallback (daily analytics)", () => {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const auth = { apiKey: "k" };

  afterEach(() => vi.unstubAllGlobals());

  it("snapshots the cursor on first poll without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await instantlyConnector.poll!(auth, {}, {});
    expect(res.records).toEqual([]);
    expect(res.nextCursor).toEqual({ lastFinalizedDate: yesterday });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns nothing when already up to date, without calling the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await instantlyConnector.poll!(auth, {}, { lastFinalizedDate: yesterday });
    expect(res.records).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("emits one record per finalized day and metric, skipping zero counts", async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10);
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            { date: twoDaysAgo, sent: 120, unique_opened: 40, unique_replies: 0, unique_clicks: 5 },
            { date: yesterday, sent: 80, unique_opened: 0, unique_replies: 7, unique_clicks: 0 },
          ]),
          { status: 200 },
        ),
      ),
    );
    const res = await instantlyConnector.poll!(auth, {}, { lastFinalizedDate: threeDaysAgo });
    expect(res.nextCursor).toEqual({ lastFinalizedDate: yesterday });
    const kinds = res.records.map((r) => `${r.date}:${r.metric}:${r.count}`);
    expect(kinds).toEqual([
      `${twoDaysAgo}:email_sent_daily:120`,
      `${twoDaysAgo}:email_opened_daily:40`,
      `${twoDaysAgo}:email_clicked_daily:5`,
      `${yesterday}:email_sent_daily:80`,
      `${yesterday}:reply_received_daily:7`,
    ]);
  });

  it("normalizes rollups with a stable day-keyed ID and count as amount", () => {
    const [event] = instantlyConnector.normalize(
      { kind: "daily_analytics", date: "2026-07-10", metric: "email_sent_daily", count: 120 },
      conn,
    );
    expect(event).toMatchObject({
      eventType: "email_sent_daily",
      externalId: "daily:2026-07-10:email_sent_daily",
      amount: "120",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-07-10T12:00:00.000Z");
    expect(event.metadata).toMatchObject({ daily_rollup: true });
  });
});
