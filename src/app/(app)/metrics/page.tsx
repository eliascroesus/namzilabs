import { SigmaIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Metrics" };

export default function MetricsPage() {
  return (
    <>
      <PageHeader
        title="Metrics"
        description="Build custom metrics from the events your tools send — counts, sums, rates, and goals."
      />
      <EmptyState
        icon={SigmaIcon}
        title="No metrics yet"
        description="The metric builder unlocks once your first integration is connected and events are flowing."
        action={<Button disabled>Create a metric</Button>}
      />
    </>
  );
}
