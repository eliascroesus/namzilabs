import { PlugIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect Calendly, Brevo, Instantly, Close, Google Sheets, or any webhook."
      />
      <EmptyState
        icon={PlugIcon}
        title="Connect your first tool"
        description="Integrations arrive in the next build phase. Once live, connecting a tool takes under a minute and shows your real data immediately."
        action={<Button disabled>Connect a tool</Button>}
      />
    </>
  );
}
