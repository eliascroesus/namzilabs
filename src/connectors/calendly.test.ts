import { describe, expect, it } from "vitest";
import { createHmac } from "crypto";
import { calendlyConnector } from "@/connectors/calendly";
import type { ConnectionCtx } from "@/connectors/types";

const conn: ConnectionCtx & { webhookSecret: string | null } = {
  id: "c1",
  provider: "calendly",
  config: {},
  webhookToken: "tok",
  webhookSecret: "shh-signing-key",
};

function sign(body: string, secret: string, t = Math.floor(Date.now() / 1000)) {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`, "utf8").digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Shape per Calendly's webhook payload docs (invitee.created). */
const inviteeCreated = {
  created_at: "2026-07-10T14:02:00.000000Z",
  created_by: "https://api.calendly.com/users/AAAA",
  event: "invitee.created",
  payload: {
    uri: "https://api.calendly.com/scheduled_events/EV123/invitees/INV456",
    email: "mia@example.com",
    name: "Mia Chen",
    status: "active",
    rescheduled: false,
    scheduled_event: {
      uri: "https://api.calendly.com/scheduled_events/EV123",
      name: "30 Minute Intro Call",
      start_time: "2026-07-12T16:00:00.000000Z",
      end_time: "2026-07-12T16:30:00.000000Z",
    },
    tracking: { utm_source: "newsletter", utm_medium: null, utm_campaign: "q3" },
  },
};

describe("calendly connector", () => {
  it("verifies a valid signature", () => {
    const body = JSON.stringify(inviteeCreated);
    const headers = new Headers({ "Calendly-Webhook-Signature": sign(body, "shh-signing-key") });
    expect(calendlyConnector.verifyRequest!({ headers, rawBody: body }, conn)).toBe(true);
  });

  it("rejects a wrong-key signature", () => {
    const body = JSON.stringify(inviteeCreated);
    const headers = new Headers({ "Calendly-Webhook-Signature": sign(body, "wrong-key") });
    expect(calendlyConnector.verifyRequest!({ headers, rawBody: body }, conn)).toBe(false);
  });

  it("rejects a stale timestamp (replay)", () => {
    const body = JSON.stringify(inviteeCreated);
    const stale = Math.floor(Date.now() / 1000) - 2 * 60 * 60;
    const headers = new Headers({ "Calendly-Webhook-Signature": sign(body, "shh-signing-key", stale) });
    expect(calendlyConnector.verifyRequest!({ headers, rawBody: body }, conn)).toBe(false);
  });

  it("rejects when no signature header is present", () => {
    expect(calendlyConnector.verifyRequest!({ headers: new Headers(), rawBody: "{}" }, conn)).toBe(false);
  });

  it("normalizes invitee.created → booking_created with the invitee URI as ID", () => {
    const [event] = calendlyConnector.normalize(inviteeCreated, conn);
    expect(event).toMatchObject({
      eventType: "booking_created",
      externalId: "https://api.calendly.com/scheduled_events/EV123/invitees/INV456",
      contactEmail: "mia@example.com",
      contactName: "Mia Chen",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-07-10T14:02:00.000Z");
    expect(event.metadata).toMatchObject({
      event_name: "30 Minute Intro Call",
      utm_source: "newsletter",
      utm_campaign: "q3",
    });
  });

  it("normalizes invitee.canceled → booking_canceled", () => {
    const canceled = { ...inviteeCreated, event: "invitee.canceled" };
    const [event] = calendlyConnector.normalize(canceled, conn);
    expect(event.eventType).toBe("booking_canceled");
  });

  it("skips unknown event names", () => {
    expect(calendlyConnector.normalize({ event: "routing_form.submitted" }, conn)).toEqual([]);
  });
});
