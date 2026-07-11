import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordLogin } from "@/lib/actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) redirect("/dashboard");
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-6 p-10">
          <div className="flex flex-col items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              N
            </span>
            <h1 className="text-lg font-semibold tracking-tight">Sign in to Namzi</h1>
          </div>
          <form action={passwordLogin} className="w-full space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" autoFocus required />
              {error === "password" || error === "1" ? (
                <p className="text-sm text-destructive">Wrong password. Try again.</p>
              ) : null}
              {error === "server" ? (
                <p className="text-sm text-destructive">
                  Sign-in failed on the server — this is not your password. Usually the database
                  isn&apos;t reachable or migrations haven&apos;t run. Check{" "}
                  <a href="/api/health" className="underline">
                    /api/health
                  </a>{" "}
                  and the deployment logs.
                </p>
              ) : null}
            </div>
            <Button type="submit" className="w-full" size="lg">
              Enter
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
