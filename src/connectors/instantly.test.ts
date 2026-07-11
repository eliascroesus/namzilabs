import { describe, expect, it } from "vitest";
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
