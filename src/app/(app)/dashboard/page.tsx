import Link from "next/link";
import { LayoutDashboardIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Live metrics from every tool you connect, in one place."
      />
      <EmptyState
        icon={LayoutDashboardIcon}
        title="Your dashboard is empty"
        description="Connect your first tool and your data will start flowing here. Metrics and widgets come next."
        action={
          <Button asChild>
            <Link href="/integrations">Go to integrations</Link>
          </Button>
        }
      />
    </>
  );
}
