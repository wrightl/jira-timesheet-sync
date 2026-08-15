import { AppShell } from "@/components/app-shell";
import { MyMappingsManager } from "@/components/my-mappings-manager";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function MyMappingsPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/my-mappings"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="My project mappings"
          description="Map each Jira space to a Bitmap project and budget for your timesheets. Your login email must match your Bitmap user email for sync to apply these overrides."
        />
        <MyMappingsManager authed />
      </PageMain>
    </AppShell>
  );
}
