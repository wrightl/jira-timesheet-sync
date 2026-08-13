import { AppShell } from "@/components/app-shell";
import { UtilizationDashboard } from "@/components/utilization-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function UtilizationPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/utilization"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <PageHeader
          title="Utilization"
          description="People load from worklog syncs versus weekly capacity, with optional team grouping."
        />
        <UtilizationDashboard authed />
      </main>
    </AppShell>
  );
}
