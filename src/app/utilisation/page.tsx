import { AppShell } from "@/components/app-shell";
import { UtilisationDashboard } from "@/components/utilisation-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function UtilisationPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/utilisation"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Utilisation"
          description="Billable hours from Bitmap timesheets versus each person's contracted working hours, with a chart of the 80% target and per-person drill-down."
        />
        <UtilisationDashboard authed />
      </PageMain>
    </AppShell>
  );
}
