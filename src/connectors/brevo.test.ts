import { describe, expect, it } from "vitest";
import { brevoConnector } from "@/connectors/brevo";
import type { ConnectionCtx } from "@/connectors/types";

const conn: ConnectionCtx = { id: "c1", provider: "brevo", config: {}, webhookToken: "tok" };

/** Shape per Brevo's transactional webhook docs. */
const delivered = {
  event: "delivered",
  email: "zoe@example.com",
  id: 1042,
  "message-id": "<202607101201.12345678@smtp-relay.mailin.fr>",
  ts: 1783087260,
  ts_event: 1783087265,
  date: "2026-07-10 12:01:05",
  subject: "Your July report",
  tag: "reports",
};

describe("brevo connector", () => {
  it("normalizes delivered → email_delivered keyed by message-id", () => {
    const [event] = brevoConnector.normalize(delivered, conn);
    expect(event).toMatchObject({
      eventType: "email_delivered",
      externalId: "<202607101201.12345678@smtp-relay.mailin.fr>",
      contactEmail: "zoe@example.com",
    });
    expect(event.occurredAt.toISOString()).toBe(new Date(1783087265 * 1000).toISOString());
    expect(event.metadata).toMatchObject({ subject: "Your July report", tag: "reports" });
  });

  it("maps the full tracked event set", () => {
    const cases: Array<[string, string]> = [
      ["opened", "email_opened"],
      ["uniqueOpened", "email_opened"],
      ["click", "email_clicked"],
      ["hardBounce", "email_bounced"],
      ["unsubscribed", "email_unsubscribed"],
    ];
    for (const [brevoEvent, ours] of cases) {
      const [event] = brevoConnector.normalize({ ...delivered, event: brevoEvent }, conn);
      expect(event.eventType).toBe(ours);
    }
  });

  it("dedupes repeat opens of the same message (same external id + type)", () => {
    const [a] = brevoConnector.normalize({ ...delivered, event: "opened" }, conn);
    const [b] = brevoConnector.normalize({ ...delivered, event: "opened", ts_event: 1783090000 }, conn);
    expect(a.externalId).toBe(b.externalId);
    expect(a.eventType).toBe(b.eventType);
  });

  it("skips untracked events (request, deferred, softBounce…)", () => {
    for (const e of ["request", "deferred", "softBounce", "spam"]) {
      expect(brevoConnector.normalize({ ...delivered, event: e }, conn)).toEqual([]);
    }
  });
});
