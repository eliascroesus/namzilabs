"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, GaugeIcon, LogOutIcon, PlugIcon, PlusIcon, SettingsIcon, SigmaIcon } from "lucide-react";
import type { Provider } from "@/db/schema";
import { ProviderTile } from "@/components/shared/provider-tile";
import { signOutAction } from "@/lib/actions";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Summary", icon: GaugeIcon },
  { href: "/integrations", label: "Integrations", icon: PlugIcon },
  { href: "/metrics", label: "Metrics Builder", icon: SigmaIcon },
  { href: "/activity", label: "Activity Feed", icon: ActivityIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
];

export type SidebarSource = {
  id: string;
  name: string;
  provider: Provider;
  status: string;
  quiet: boolean;
};

function statusDot(source: SidebarSource): string {
  if (source.status === "active" && !source.quiet) return "bg-emerald-400";
  if (source.status === "error" || source.quiet) return "bg-amber-400";
  return "bg-zinc-600"; // paused / pending
}

export function Sidebar({ sources }: { sources: SidebarSource[] }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-zinc-900 bg-black text-zinc-300 md:flex">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 pb-5 pt-6">
        <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-base font-bold text-white shadow-lg shadow-primary/30">
          N
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-semibold tracking-tight text-white">Namzi</span>
          <span className="block text-[11px] text-zinc-500">Data Platform</span>
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-800/90 text-white shadow-sm ring-1 ring-inset ring-zinc-700"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <Icon className={cn("size-4", active ? "text-primary-foreground" : "")} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Sources */}
      <div className="mt-6 flex-1 overflow-y-auto px-3">
        <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
          Sources
        </p>
        {sources.length === 0 ? (
          <p className="px-3 text-xs text-zinc-600">No tools connected yet.</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {sources.slice(0, 10).map((s) => (
              <Link
                key={s.id}
                href={`/integrations/${s.id}`}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  pathname === `/integrations/${s.id}`
                    ? "bg-zinc-800/90 text-white"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                )}
              >
                <ProviderTile provider={s.provider} size="sm" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className={cn("size-2 shrink-0 rounded-full", statusDot(s))} />
              </Link>
            ))}
            {sources.length > 10 ? (
              <Link href="/integrations" className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-300">
                +{sources.length - 10} more
              </Link>
            ) : null}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="space-y-2 px-4 pb-5 pt-3">
        <Link
          href="/integrations"
          className="flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200"
        >
          <PlusIcon className="size-4" />
          Add integration
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-full border border-zinc-800 px-4 py-2 text-sm text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-100"
          >
            <LogOutIcon className="size-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
