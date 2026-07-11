import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createTestDb } from "@/test/pglite";
import { authorizePassword, expectedPassword } from "@/lib/password-auth";

let testDb: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => {
  testDb = await createTestDb();
});

afterEach(() => {
  delete process.env.APP_PASSWORD;
});

describe("password wall (against a real database)", () => {
  it("accepts the default password and creates the owner user + workspace", async () => {
    const user = await authorizePassword("Namzilabs123");
    expect(user).not.toBeNull();
    expect(user!.email).toBe("owner@namzilabs.co");

    const memberships = await testDb
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, user!.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0].role).toBe("owner");
  });

  it("is idempotent — repeat logins reuse the same user and workspace", async () => {
    const a = await authorizePassword("Namzilabs123");
    const b = await authorizePassword("Namzilabs123");
    expect(a!.id).toBe(b!.id);
    const users = await testDb
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "owner@namzilabs.co"));
    expect(users).toHaveLength(1);
  });

  it("rejects wrong and empty passwords with null (not a throw)", async () => {
    expect(await authorizePassword("nope")).toBeNull();
    expect(await authorizePassword("")).toBeNull();
    expect(await authorizePassword(undefined)).toBeNull();
    expect(await authorizePassword("namzilabs123")).toBeNull(); // case-sensitive
  });

  it("tolerates surrounding whitespace in the typed password", async () => {
    expect(await authorizePassword("  Namzilabs123  ")).not.toBeNull();
  });

  it("respects APP_PASSWORD when set", async () => {
    process.env.APP_PASSWORD = "MyOwnSecret9";
    expect(await authorizePassword("MyOwnSecret9")).not.toBeNull();
    expect(await authorizePassword("Namzilabs123")).toBeNull();
  });

  it("survives the classic env foot-guns: empty value and pasted quotes", () => {
    process.env.APP_PASSWORD = "";
    expect(expectedPassword()).toBe("Namzilabs123");
    process.env.APP_PASSWORD = '"Namzilabs123"';
    expect(expectedPassword()).toBe("Namzilabs123");
    process.env.APP_PASSWORD = " Namzilabs123 ";
    expect(expectedPassword()).toBe("Namzilabs123");
  });
});
