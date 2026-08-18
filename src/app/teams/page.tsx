import { AppShell } from "@/components/app-shell";
import { TeamsManager } from "@/components/teams-manager";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function TeamsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/teams"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Teams"
          description="Group people for utilisation rollups without a full org chart."
        />
        <TeamsManager authed />
      </PageMain>
    </AppShell>
  );
}
