import type { Provider } from "@/db/schema";
import { cn } from "@/lib/utils";

/** Brand-colored monogram tiles — no external logo fetches. */
const TILES: Record<Provider, { initials: string; className: string }> = {
  webhook: { initials: "{ }", className: "bg-zinc-700" },
  calendly: { initials: "C", className: "bg-[#006bff]" },
  brevo: { initials: "B", className: "bg-[#0b996e]" },
  close: { initials: "Cl", className: "bg-[#4364f7]" },
  google_sheets: { initials: "GS", className: "bg-[#188038]" },
  instantly: { initials: "In", className: "bg-[#6d5df6]" },
};

export function ProviderTile({ provider, size = "md" }: { provider: Provider; size?: "sm" | "md" }) {
  const tile = TILES[provider];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-lg font-semibold text-white",
        size === "md" ? "size-10 text-sm" : "size-7 text-[10px]",
        tile.className,
      )}
    >
      {tile.initials}
    </span>
  );
}
