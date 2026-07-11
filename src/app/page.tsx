import Link from "next/link";
import { ArrowRightIcon, GaugeIcon, PlugIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Namzi — All your business data, one live dashboard",
  description:
    "Namzi pulls live data from Calendly, Brevo, Instantly, Close CRM, Google Sheets, and any webhook into one dashboard with custom metrics and goals.",
};

const FEATURES = [
  {
    icon: PlugIcon,
    title: "Connect in under a minute",
    body: "Calendly, Brevo, Instantly, Close CRM, Google Sheets, or any tool that can send a webhook — no engineering required.",
  },
  {
    icon: GaugeIcon,
    title: "One live dashboard",
    body: "Bookings, replies, calls, and revenue from every tool, unified into metrics you define — with goals and pace tracking.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Built to never lose data",
    body: "Signed webhooks, idempotent ingestion, automatic retries, and per-connection health status. Failures are visible, never silent.",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            N
          </span>
          <span className="font-semibold tracking-tight">Namzi</span>
        </div>
        <Button asChild variant="outline">
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pb-20 pt-16 text-center sm:pt-24">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            All your business data, one live dashboard.
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Stop tab-hopping between Calendly, your CRM, and your email tools. Namzi unifies every
            booking, reply, call, and deal into metrics you can act on.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <Link href="/login">
                Open the dashboard
                <ArrowRightIcon />
              </Link>
            </Button>
          </div>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-6 px-6 pb-24 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-card p-6 text-left">
              <div className="flex size-10 items-center justify-center rounded-lg bg-accent">
                <Icon className="size-5 text-accent-foreground" />
              </div>
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Namzi · namzilabs.co</span>
          <nav className="flex gap-6">
            <Link href="/terms" className="hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy Policy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
