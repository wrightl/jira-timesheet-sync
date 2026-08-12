import { AppShell } from "@/components/app-shell";
import { TeamsManager } from "@/components/teams-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function TeamsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/teams"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <PageHeader
          title="Teams"
          description="Group people for utilization rollups without a full org chart."
        />
        <TeamsManager authed />
      </main>
    </AppShell>
  );
}
