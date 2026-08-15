import { AppShell } from "@/components/app-shell";
import { AppSettingsForm } from "@/components/app-settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function AppSettingsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/app-settings"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="App Settings"
          description="Configure Bitmap and Jira Cloud API credentials used by sync and the project progress dashboard."
        />
        <AppSettingsForm authed />
      </PageMain>
    </AppShell>
  );
}
