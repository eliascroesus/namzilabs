import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getWorkspaceForUser } from "@/lib/workspace";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { signOutAction } from "@/lib/actions";
import { DemoJobButton } from "./demo-job-button";
import { TimezoneSelect } from "./timezone-select";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) redirect("/login");
  const workspace = await getWorkspaceForUser(user.id);
  const [wsRow] = workspace
    ? await db()
        .select({ timezone: schema.workspaces.timezone })
        .from(schema.workspaces)
        .where(eq(schema.workspaces.id, workspace.id))
    : [];

  return (
    <>
      <PageHeader title="Settings" description="Your workspace and account." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription>Where all your connections, events, and metrics live.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{workspace?.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Your role</span>
              <Badge variant="secondary">{workspace?.role}</Badge>
            </div>
            <div className="space-y-1.5 pt-1">
              <span className="text-muted-foreground">Timezone (metric bucketing)</span>
              <TimezoneSelect current={wsRow?.timezone ?? "UTC"} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Signed in with Google.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{user.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{user.email}</span>
            </div>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Background jobs</CardTitle>
            <CardDescription>
              Fire a test job that intentionally fails once, then recovers on retry — watch it in
              the Inngest dashboard. Proves the durable-processing spine integrations rely on.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DemoJobButton />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
