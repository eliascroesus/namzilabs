import { and, desc, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db, schema } from "@/db";
import { ensurePersonalWorkspace, getWorkspaceForUser } from "@/lib/workspace";
import { Sidebar, type SidebarSource } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

const QUIET_AFTER_MS = 48 * 60 * 60 * 1000;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect("/login");

  // Self-healing: guarantees a workspace even if the createUser event was missed.
  let workspace = await getWorkspaceForUser(user.id);
  if (!workspace) {
    await ensurePersonalWorkspace(user.id, user.name ?? user.email ?? null);
    workspace = await getWorkspaceForUser(user.id);
  }
  if (!workspace) redirect("/login");

  const connections = await db()
    .select({
      id: schema.connections.id,
      name: schema.connections.name,
      provider: schema.connections.provider,
      status: schema.connections.status,
      lastEventAt: schema.connections.lastEventAt,
    })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.workspaceId, workspace.id),
        ne(schema.connections.status, "deleted"),
      ),
    )
    .orderBy(desc(schema.connections.createdAt));

  const sources: SidebarSource[] = connections.map((c) => ({
    id: c.id,
    name: c.name,
    provider: c.provider,
    status: c.status,
    quiet:
      c.status === "active" &&
      (!c.lastEventAt || Date.now() - c.lastEventAt.getTime() > QUIET_AFTER_MS),
  }));

  return (
    <div className="min-h-screen">
      <Sidebar sources={sources} />
      <div className="md:pl-60">
        <Topbar
          workspaceName={workspace.name}
          userName={user.name ?? null}
          userEmail={user.email ?? null}
          userImage={user.image ?? null}
        />
        <main className="mx-auto w-full max-w-[1200px] px-6 py-8">{children}</main>
      </div>
    </div>
  );
}
