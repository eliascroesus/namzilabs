import { describe, expect, it } from "vitest";
import { webhookConnector } from "@/connectors/webhook";
import type { ConnectionCtx } from "@/connectors/types";

const conn = (config: Record<string, unknown> = {}): ConnectionCtx => ({
  id: "c1",
  provider: "webhook",
  config,
  webhookToken: "tok",
});

describe("generic webhook connector", () => {
  it("uses the sender's ID and autodetects email", () => {
    const [event] = webhookConnector.normalize(
      { id: "order-991", email: "ivy@shop.com", total: 49.5, status: "paid" },
      conn({ eventType: "order_paid" }),
    );
    expect(event).toMatchObject({
      eventType: "order_paid",
      externalId: "order-991",
      contactEmail: "ivy@shop.com",
    });
    expect(event.metadata).toMatchObject({ status: "paid", total: 49.5 });
  });

  it("maps configured JSON paths for id/time/email/amount", () => {
    const [event] = webhookConnector.normalize(
      {
        data: { ref: "abc-1", buyer: { mail: "max@x.io" }, paid_at: "2026-07-01T10:00:00Z", cents: "1999" },
      },
      conn({
        eventType: "purchase",
        idPath: "data.ref",
        emailPath: "data.buyer.mail",
        occurredAtPath: "data.paid_at",
        amountPath: "data.cents",
      }),
    );
    expect(event).toMatchObject({
      externalId: "abc-1",
      contactEmail: "max@x.io",
      amount: "1999",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });

  it("falls back to a stable content hash when no ID exists (dedupes retries)", () => {
    const payload = { email: "a@b.co", note: "no id here" };
    const [a] = webhookConnector.normalize(payload, conn());
    const [b] = webhookConnector.normalize({ ...payload }, conn());
    expect(a.externalId).toBe(b.externalId);
    const [c] = webhookConnector.normalize({ ...payload, note: "different" }, conn());
    expect(c.externalId).not.toBe(a.externalId);
  });

  it("enforces the optional shared secret via x-namzi-secret", () => {
    const secured = { ...conn(), webhookSecret: "s3cret" };
    const ok = new Headers({ "x-namzi-secret": "s3cret" });
    const bad = new Headers({ "x-namzi-secret": "nope" });
    expect(webhookConnector.verifyRequest!({ headers: ok, rawBody: "{}" }, secured)).toBe(true);
    expect(webhookConnector.verifyRequest!({ headers: bad, rawBody: "{}" }, secured)).toBe(false);
    expect(webhookConnector.verifyRequest!({ headers: new Headers(), rawBody: "{}" }, secured)).toBe(false);
    // No secret configured → open (token URL is the auth)
    expect(
      webhookConnector.verifyRequest!({ headers: new Headers(), rawBody: "{}" }, { ...conn(), webhookSecret: null }),
    ).toBe(true);
  });
});
