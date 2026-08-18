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
          description="Billable hours from Bitmap timesheets versus each person's contracted working hours, with optional person and team filters."
        />
        <UtilisationDashboard authed />
      </PageMain>
    </AppShell>
  );
}
