import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { db, schema } from "@/db";

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${base || "workspace"}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Guarantees the user has at least one workspace. Idempotent: safe to call
 * on every sign-in/page load. Sequential inserts instead of a transaction
 * because the Neon HTTP driver has no interactive transactions — a partial
 * failure self-heals on the next call.
 */
export async function ensurePersonalWorkspace(userId: string, displayName: string | null) {
  const existing = await db()
    .select({ workspaceId: schema.workspaceMembers.workspaceId })
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, userId))
    .limit(1);
  if (existing.length > 0) return existing[0].workspaceId;

  const firstName = displayName?.split(/[\s@]/)[0] ?? null;
  const name = firstName ? `${firstName}'s workspace` : "My workspace";
  const [workspace] = await db()
    .insert(schema.workspaces)
    .values({ name, slug: slugify(name) })
    .returning({ id: schema.workspaces.id });
  await db()
    .insert(schema.workspaceMembers)
    .values({ workspaceId: workspace.id, userId, role: "owner" })
    .onConflictDoNothing();
  return workspace.id;
}

/** The signed-in user's default (first) workspace, or null. */
export async function getWorkspaceForUser(userId: string) {
  const rows = await db()
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      slug: schema.workspaces.slug,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(eq(schema.workspaceMembers.userId, userId))
    .orderBy(schema.workspaceMembers.createdAt)
    .limit(1);
  return rows[0] ?? null;
}

/**
 * THE tenancy boundary. Every server action and API route that touches
 * workspace data calls this first. Foreign/unknown workspaces 404 (never
 * 403 — don't reveal existence).
 */
export async function requireWorkspace(workspaceId: string) {
  const { auth } = await import("@/auth");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const rows = await db()
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      slug: schema.workspaces.slug,
      role: schema.workspaceMembers.role,
    })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(
      and(
        eq(schema.workspaceMembers.userId, userId),
        eq(schema.workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (rows.length === 0) notFound();
  return { workspace: rows[0], userId };
}
