import { inngest } from "@/inngest/client";
import { db, schema } from "@/db";

/**
 * Milestone 1.4 proof #1: Vercel Hobby cron is capped at once/day, so all
 * scheduling runs through Inngest. This fires every 10 minutes and writes a
 * row — visible proof the spine schedules faster than the platform cap.
 */
export const demoHeartbeat = inngest.createFunction(
  { id: "demo-heartbeat", triggers: [{ cron: "*/10 * * * *" }] },
  async () => {
    const [row] = await db()
      .insert(schema.demoHeartbeats)
      .values({ note: "heartbeat" })
      .returning({ id: schema.demoHeartbeats.id, firedAt: schema.demoHeartbeats.firedAt });
    return { ok: true, firedAt: row.firedAt };
  },
);

/**
 * Milestone 1.4 proof #2: durable retries. The first attempt always throws;
 * Inngest retries with backoff and the second attempt succeeds. The Inngest
 * dashboard shows the failure + recovery — the exact behavior webhook
 * processing relies on in Plan 2.
 */
export const demoProcessEvent = inngest.createFunction(
  { id: "demo-process-event", retries: 3, triggers: [{ event: "demo/process.event" }] },
  async ({ event, step, attempt }) => {
    const result = await step.run("flaky-step", async () => {
      if (attempt === 0) {
        throw new Error("Simulated transient failure (attempt 1) — retry proves durability");
      }
      return `recovered on attempt ${attempt + 1}`;
    });

    await step.run("record-success", async () => {
      await db()
        .insert(schema.demoHeartbeats)
        .values({ note: `demo/process.event ${result} (requested by ${event.data?.requestedBy ?? "unknown"})` });
    });

    return { result };
  },
);

export const functions = [demoHeartbeat, demoProcessEvent];
