import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { setDbForTests } from "@/db";

/**
 * Real-Postgres test database: PGlite with the actual generated migrations
 * applied, injected behind db(). Tests exercise the same SQL (including the
 * idempotency unique index) that production runs.
 */
export async function createTestDb() {
  const client = new PGlite();
  const testDb = drizzle(client, { schema });

  const migrationsDir = path.resolve(__dirname, "../../drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }

  setDbForTests(testDb as never);
  return testDb;
}

/** Minimal workspace + connection scaffolding for pipeline tests. */
export async function seedConnection(
  testDb: Awaited<ReturnType<typeof createTestDb>>,
  overrides: Partial<typeof schema.connections.$inferInsert> = {},
) {
  const [workspace] = await testDb
    .insert(schema.workspaces)
    .values({ name: "Test WS", slug: `test-${crypto.randomUUID().slice(0, 8)}` })
    .returning();
  const [connection] = await testDb
    .insert(schema.connections)
    .values({
      workspaceId: workspace.id,
      provider: "webhook",
      name: "Test connection",
      status: "active",
      ...overrides,
    })
    .returning();
  return { workspace, connection };
}
