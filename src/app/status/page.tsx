import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { StatusNarrativePanel } from "@/components/status-narrative-panel";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function StatusPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/status"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Status pack"
          description="One-click weekly client status narrative from live portfolio and project metrics."
        />
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <StatusNarrativePanel authed />
        </Suspense>
      </PageMain>
    </AppShell>
  );
}
