import { AppShell } from "@/components/app-shell";
import { RecentSyncs } from "@/components/recent-syncs";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function SyncsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/syncs"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <PageHeader
          title="Syncs"
          description="Recent Jira worklog webhook events and their Bitmap sync status. Retry failed or skipped events when a stored payload is available."
        />
        <RecentSyncs authed />
      </main>
    </AppShell>
  );
}
