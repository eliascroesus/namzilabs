import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ensurePersonalWorkspace, getWorkspaceForUser } from "@/lib/workspace";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

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

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="md:pl-56">
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
