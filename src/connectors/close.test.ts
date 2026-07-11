import { describe, expect, it } from "vitest";
import { createHmac, randomBytes } from "crypto";
import { closeConnector } from "@/connectors/close";
import type { ConnectionCtx } from "@/connectors/types";

const sigKey = randomBytes(32).toString("hex"); // Close issues a hex signature_key
const conn: ConnectionCtx & { webhookSecret: string | null } = {
  id: "c1",
  provider: "close",
  config: {},
  webhookToken: "tok",
  webhookSecret: sigKey,
};

function sign(body: string, key: string, timestamp = String(Math.floor(Date.now() / 1000))) {
  const hash = createHmac("sha256", Buffer.from(key, "hex"))
    .update(timestamp + body, "utf8")
    .digest("hex");
  return new Headers({ "close-sig-hash": hash, "close-sig-timestamp": timestamp });
}

/** Shape per Close's event-log webhook docs. */
const opportunityCreated = {
  subscription_id: "whsub_123",
  event: {
    id: "ev_abc123",
    object_type: "opportunity",
    action: "created",
    date_created: "2026-07-10T09:30:00.123000", // Close: UTC, no suffix
    data: {
      id: "oppo_1",
      value: 250000, // cents
      value_period: "one_time",
      status_label: "Active",
      pipeline_name: "Sales",
      lead_name: "Acme Corp",
    },
    changed_fields: [],
  },
};

describe("close connector", () => {
  it("verifies a valid signature (hex-decoded key)", () => {
    const body = JSON.stringify(opportunityCreated);
    expect(closeConnector.verifyRequest!({ headers: sign(body, sigKey), rawBody: body }, conn)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify(opportunityCreated);
    const headers = sign(body, sigKey);
    expect(closeConnector.verifyRequest!({ headers, rawBody: body + " " }, conn)).toBe(false);
  });

  it("normalizes opportunity created with cents→currency amount and UTC pinning", () => {
    const [event] = closeConnector.normalize(opportunityCreated, conn);
    expect(event).toMatchObject({
      eventType: "opportunity_created",
      externalId: "ev_abc123",
      amount: "2500",
    });
    expect(event.occurredAt.toISOString()).toBe("2026-07-10T09:30:00.123Z");
    expect(event.metadata).toMatchObject({ status: "Active", pipeline: "Sales", lead_name: "Acme Corp" });
  });

  it("emits opportunity_status_changed only when status actually changed", () => {
    const statusChanged = {
      event: {
        ...opportunityCreated.event,
        id: "ev_status1",
        action: "updated",
        changed_fields: ["status_id", "status_label", "date_updated"],
      },
    };
    const [event] = closeConnector.normalize(statusChanged, conn);
    expect(event.eventType).toBe("opportunity_status_changed");

    const otherUpdate = {
      event: {
        ...opportunityCreated.event,
        id: "ev_other1",
        action: "updated",
        changed_fields: ["note", "date_updated"],
      },
    };
    expect(closeConnector.normalize(otherUpdate, conn)).toEqual([]);
  });

  it("normalizes lead created, calls, sms directionality, and emails", () => {
    const mk = (object_type: string, data: Record<string, unknown>) => ({
      event: {
        id: `ev_${object_type}`,
        object_type,
        action: "created",
        date_created: "2026-07-01T00:00:00.000000",
        data,
        changed_fields: [],
      },
    });

    expect(closeConnector.normalize(mk("lead", { display_name: "Acme" }), conn)[0].eventType).toBe("lead_created");
    expect(closeConnector.normalize(mk("activity.call", { direction: "outbound", duration: 60 }), conn)[0].eventType).toBe("call_logged");
    expect(closeConnector.normalize(mk("activity.sms", { direction: "outbound" }), conn)[0].eventType).toBe("sms_sent");
    expect(closeConnector.normalize(mk("activity.sms", { direction: "inbound" }), conn)[0].eventType).toBe("sms_received");
    const email = closeConnector.normalize(
      mk("activity.email", { direction: "outgoing", subject: "Hi", to: ["kai@acme.com"] }),
      conn,
    )[0];
    expect(email.eventType).toBe("email_sent");
    expect(email.contactEmail).toBe("kai@acme.com");
  });

  it("skips payloads without an event-log id", () => {
    expect(closeConnector.normalize({ event: { object_type: "lead" } }, conn)).toEqual([]);
  });
});
