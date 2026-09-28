import { AppShell } from "@/components/app-shell";
import { ProfitabilityDashboard } from "@/components/profitability-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function ProfitabilityPage() {
  const user = await requirePageUser({ role: "leadership" });

  return (
    <AppShell
      currentPath="/profitability"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Profitability"
          description="Closed Bitmap projects for a client and date range. Profitability is the amount charged to the client divided by delivery cost: billable days times the budget day rate, over logged days times each person’s role cost day rate."
        />
        <ProfitabilityDashboard authed />
      </PageMain>
    </AppShell>
  );
}
