import { PageHeader } from "@/components/shared/page-header";
import { getEventTypeOptions } from "../actions";
import { MetricBuilder } from "../metric-builder";

export const metadata = { title: "New metric" };

export default async function NewMetricPage() {
  const options = await getEventTypeOptions();
  return (
    <>
      <PageHeader
        title="New metric"
        description="Pick what to measure — the preview on the right uses your real data."
      />
      <MetricBuilder options={options.ok ? options.data : []} initial={null} />
    </>
  );
}
