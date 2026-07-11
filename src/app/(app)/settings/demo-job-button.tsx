"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DemoJobButton() {
  const [busy, setBusy] = React.useState(false);

  async function fire() {
    setBusy(true);
    try {
      const res = await fetch("/api/demo/trigger", { method: "POST" });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      toast.success("Test job queued", {
        description: "It fails once by design, then succeeds on retry. Check the Inngest dashboard.",
      });
    } catch (err) {
      toast.error("Could not queue the test job", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={fire} disabled={busy} variant="secondary" size="sm">
      {busy ? "Queuing…" : "Run retry-proof test job"}
    </Button>
  );
}
