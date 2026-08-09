import { AppShell } from "@/components/app-shell";
import { SettingsForm } from "@/components/settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function SettingsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/settings"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <PageHeader
          title="Settings"
          description="Configure Bitmap and Jira Cloud API credentials used by sync and the project progress dashboard."
        />
        <SettingsForm authed />
      </main>
    </AppShell>
  );
}
