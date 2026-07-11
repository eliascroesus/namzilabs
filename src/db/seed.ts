import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

/**
 * Seeds a demo workspace with fake events for local development.
 * Idempotent: re-running replaces the demo workspace. Run: npm run db:seed
 */

const DEMO_EMAIL = "demo@namzilabs.co";
const DEMO_SLUG = "demo-workspace";

const EVENT_SHAPES: Array<{ type: string; withAmount?: boolean }> = [
  { type: "booking_created" },
  { type: "email_delivered" },
  { type: "email_opened" },
  { type: "reply_received" },
  { type: "call_logged" },
  { type: "opportunity_created", withAmount: true },
];

const FIRST_NAMES = ["ava", "liam", "noah", "mia", "zoe", "eli", "kai", "ivy", "max", "lea"];

async function main() {
  const conn = db();

  // Demo user (upsert by email)
  let [user] = await conn.select().from(schema.users).where(eq(schema.users.email, DEMO_EMAIL));
  if (!user) {
    [user] = await conn
      .insert(schema.users)
      .values({ name: "Demo User", email: DEMO_EMAIL })
      .returning();
  }

  // Replace any previous demo workspace (cascades to members/connections/events)
  const existing = await conn
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.slug, DEMO_SLUG));
  if (existing.length > 0) {
    await conn.delete(schema.workspaces).where(eq(schema.workspaces.slug, DEMO_SLUG));
  }

  const [workspace] = await conn
    .insert(schema.workspaces)
    .values({ name: "Demo Workspace", slug: DEMO_SLUG })
    .returning();
  await conn
    .insert(schema.workspaceMembers)
    .values({ workspaceId: workspace.id, userId: user.id, role: "owner" });

  const [connection] = await conn
    .insert(schema.connections)
    .values({
      workspaceId: workspace.id,
      provider: "webhook",
      name: "Demo webhook feed",
      status: "active",
      lastEventAt: new Date(),
    })
    .returning();

  // ~180 events spread over the last 30 days
  const now = Date.now();
  const rows = Array.from({ length: 180 }, (_, i) => {
    const shape = EVENT_SHAPES[i % EVENT_SHAPES.length];
    const daysAgo = Math.floor(Math.random() * 30);
    const occurredAt = new Date(now - daysAgo * 86_400_000 - Math.floor(Math.random() * 86_400_000));
    const person = FIRST_NAMES[i % FIRST_NAMES.length];
    return {
      workspaceId: workspace.id,
      connectionId: connection.id,
      provider: "webhook" as const,
      eventType: shape.type,
      externalId: `seed-${shape.type}-${i}`,
      occurredAt,
      contactEmail: `${person}${i}@example.com`,
      contactName: person[0].toUpperCase() + person.slice(1),
      amount: shape.withAmount ? String(500 + Math.floor(Math.random() * 4500)) : null,
      metadata: { campaign: i % 2 === 0 ? "spring-launch" : "evergreen", seeded: true },
    };
  });
  await conn.insert(schema.events).values(rows);

  console.log(`Seeded workspace "${workspace.name}" (${workspace.id}) with ${rows.length} events.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
