import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { signInWithGoogle } from "@/lib/actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

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
          <form action={signInWithGoogle} className="w-full">
            <Button type="submit" className="w-full" size="lg">
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
                <path
                  fill="currentColor"
                  d="M21.35 11.1H12v2.9h5.35c-.25 1.4-1.02 2.58-2.17 3.37v2.8h3.5c2.05-1.9 3.24-4.68 3.24-7.97 0-.66-.06-1.3-.17-1.9zM12 22c2.93 0 5.39-.97 7.18-2.63l-3.5-2.8c-.97.65-2.21 1.03-3.68 1.03-2.83 0-5.22-1.9-6.08-4.47H2.3v2.82C4.08 19.52 7.76 22 12 22zM5.92 13.13a5.99 5.99 0 0 1 0-3.86V6.45H2.3a10 10 0 0 0 0 8.98l3.62-2.3zM12 5.98c1.6 0 3.03.55 4.16 1.62l3.1-3.1C17.38 2.72 14.93 1.7 12 1.7 7.76 1.7 4.08 4.18 2.3 7.87l3.62 2.82C6.78 8.13 9.17 5.98 12 5.98z"
                />
              </svg>
              Continue with Google
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
