import { AppShell } from "@/components/app-shell";
import { MySettingsForm } from "@/components/my-settings-form";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function MySettingsPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/my-settings"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <PageHeader
          title="My settings"
          description="Configure your personal integrations, including GitHub access for the org dashboard."
        />
        <MySettingsForm authed />
      </main>
    </AppShell>
  );
}
