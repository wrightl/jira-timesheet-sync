import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/settings"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Settings"
          description="Manage your timesheet sync preference and personal integrations, including GitHub access for the org dashboard."
        />
        <SettingsForm authed />
      </PageMain>
    </AppShell>
  );
}
