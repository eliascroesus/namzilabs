"use client";

import { useRouter } from "next/navigation";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RefreshButton() {
  const router = useRouter();
  return (
    <Button variant="outline" onClick={() => router.refresh()}>
      <RefreshCwIcon />
      Refresh
    </Button>
  );
}
