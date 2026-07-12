"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncAllConnections } from "./actions";

export function SyncAllButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="outline"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const res = await syncAllConnections();
        setBusy(false);
        if (res.ok) {
          toast.success(`Sync queued for ${res.data.synced} connection${res.data.synced === 1 ? "" : "s"}`, {
            description: "Fresh data lands within a minute.",
          });
          setTimeout(() => router.refresh(), 4000);
        } else toast.error(res.error);
      }}
    >
      {busy ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
      Sync all
    </Button>
  );
}
