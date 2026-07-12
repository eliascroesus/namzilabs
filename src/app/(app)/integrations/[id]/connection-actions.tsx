"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteConnection, pauseConnection, reprocessConnection, syncConnection } from "../actions";

export function ConnectionActions({
  connectionId,
  status,
  hasFailures,
}: {
  connectionId: string;
  status: string;
  hasFailures: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(true);
    const res = await fn();
    setBusy(false);
    if (res.ok) {
      toast.success(success);
      router.refresh();
    } else {
      toast.error(res.error ?? "Something went wrong");
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => run(() => syncConnection(connectionId), "Sync queued — fresh data lands within a minute.")}
      >
        Sync now
      </Button>
      {hasFailures || status === "error" ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => run(() => reprocessConnection(connectionId), "Reprocessing queued — check back in a minute.")}
        >
          Reprocess failed
        </Button>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() =>
          run(
            () => pauseConnection(connectionId),
            status === "paused" ? "Connection resumed" : "Connection paused — incoming data is dropped while paused.",
          )
        }
      >
        {status === "paused" ? "Resume" : "Pause"}
      </Button>
      <ConfirmDialog
        trigger={
          <Button variant="destructive" size="sm" disabled={busy}>
            Delete
          </Button>
        }
        title="Delete this connection?"
        description="The remote webhook is removed and no new data arrives. Events already collected stay available for your metrics."
        confirmLabel="Delete connection"
        destructive
        onConfirm={async () => {
          const res = await deleteConnection(connectionId);
          if (res.ok) {
            toast.success("Connection deleted");
            router.push("/integrations");
          } else {
            toast.error(res.error ?? "Could not delete");
          }
        }}
      />
    </div>
  );
}
