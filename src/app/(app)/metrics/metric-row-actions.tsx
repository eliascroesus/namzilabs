"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteMetric, duplicateMetric, metricUsage } from "./actions";

export function MetricRowActions({ metricId, metricName }: { metricId: string; metricName: string }) {
  const router = useRouter();
  const [usage, setUsage] = React.useState<number | null>(null);

  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => router.push(`/metrics/${metricId}/edit`)}>
        <PencilIcon />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Duplicate"
        onClick={async () => {
          const res = await duplicateMetric(metricId);
          if (res.ok) {
            toast.success("Metric duplicated");
            router.refresh();
          } else toast.error(res.error);
        }}
      >
        <CopyIcon />
      </Button>
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete"
            onClick={() => metricUsage(metricId).then((r) => r.ok && setUsage(r.data))}
          >
            <Trash2Icon />
          </Button>
        }
        title={`Delete “${metricName}”?`}
        description={
          usage
            ? `This metric powers ${usage} dashboard widget${usage === 1 ? "" : "s"}, which will be removed too.`
            : "This can't be undone. Your events are untouched — only the metric definition is removed."
        }
        confirmLabel="Delete metric"
        destructive
        onConfirm={async () => {
          const res = await deleteMetric(metricId);
          if (res.ok) {
            toast.success("Metric deleted");
            router.refresh();
          } else toast.error(res.error);
        }}
      />
    </div>
  );
}
