import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { RecentSyncs } from "@/components/recent-syncs";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";
import { createSettingsService } from "@/services/settings-service";

export default async function SyncsPage() {
  const user = await requirePageUser({ role: "admin" });
  let jiraBrowseBaseUrl: string | null = null;
  try {
    const settings = await createSettingsService().getStatus();
    jiraBrowseBaseUrl = settings.jiraBaseUrl;
  } catch {
    jiraBrowseBaseUrl = null;
  }

  return (
    <AppShell
      currentPath="/syncs"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Syncs"
          description="Recent Jira worklog webhook events and their Bitmap sync status. Retry failed or skipped events when a stored payload is available."
        />
        <Suspense
          fallback={
            <p className="text-sm text-muted">Loading syncs…</p>
          }
        >
          <RecentSyncs authed jiraBrowseBaseUrl={jiraBrowseBaseUrl} />
        </Suspense>
      </PageMain>
    </AppShell>
  );
}
