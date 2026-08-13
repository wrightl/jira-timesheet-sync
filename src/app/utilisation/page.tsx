import { AppShell } from "@/components/app-shell";
import { UtilisationDashboard } from "@/components/utilisation-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function UtilisationPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/utilisation"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <PageHeader
          title="Utilisation"
          description="Billable hours from Bitmap timesheets versus each person's Bitmap billable_target_hours, with optional team grouping."
        />
        <UtilisationDashboard authed />
      </main>
    </AppShell>
  );
}
