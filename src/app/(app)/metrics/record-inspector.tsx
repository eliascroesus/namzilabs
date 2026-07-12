"use client";

import * as React from "react";
import { toast } from "sonner";
import { DatabaseIcon, Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { fetchSampleAction, syncConnection } from "../integrations/actions";

/** Flatten one level of nesting into Zapier-style field rows. */
function fieldRows(record: Record<string, unknown>, prefix = ""): { key: string; value: string }[] {
  const rows: { key: string; value: string }[] = [];
  for (const [k, v] of Object.entries(record)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v) && prefix === "") {
      rows.push(...fieldRows(v as Record<string, unknown>, k));
    } else {
      const value =
        v === null || v === undefined
          ? "—"
          : typeof v === "object"
            ? JSON.stringify(v).slice(0, 120)
            : String(v).slice(0, 160);
      rows.push({ key, value });
    }
  }
  return rows.slice(0, 40);
}

/**
 * "Pull the latest records and look at the real fields" — the Zapier moment,
 * available anywhere a connection is referenced.
 */
export function RecordInspector({ connectionId, connectionName }: { connectionId: string; connectionName: string }) {
  const [open, setOpen] = React.useState(false);
  const [records, setRecords] = React.useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchSampleAction(connectionId);
    setLoading(false);
    if (res.ok) setRecords(res.data);
    else setError(res.error);
  }, [connectionId]);

  React.useEffect(() => {
    if (open && records === null) load();
  }, [open, records, load]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-muted-foreground">
          <DatabaseIcon className="size-3" /> Latest data
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Latest records · {connectionName}</DialogTitle>
          <DialogDescription>
            Pulled live from the source right now — these are the fields you can filter on.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              const res = await syncConnection(connectionId);
              if (res.ok) toast.success("Sync queued", { description: "New data lands within a minute." });
              else toast.error(res.error);
            }}
          >
            Sync now
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {records && records.length === 0 && !loading ? (
          <p className="text-sm text-muted-foreground">
            Nothing to show yet — trigger an action in the source tool (or send a test webhook), then refresh.
          </p>
        ) : null}
        <div className="space-y-3">
          {(records ?? []).map((record, i) => (
            <details key={i} open={i === 0} className="rounded-lg border bg-card">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                Record {i + 1}
              </summary>
              <div className="divide-y border-t">
                {fieldRows(record).map(({ key, value }) => (
                  <div key={key} className="flex items-start gap-3 px-3 py-1.5 text-xs">
                    <span className="w-40 shrink-0 truncate font-medium text-muted-foreground">{key}</span>
                    <span className="break-all">{value}</span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
