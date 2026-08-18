import { AppShell } from "@/components/app-shell";
import { GithubDashboard } from "@/components/github-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function GithubPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/github"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="GitHub"
          description="Pull request metrics for the GitHub repositories selected in Settings, or the whole organisation if none are selected."
        />
        <GithubDashboard authed />
      </PageMain>
    </AppShell>
  );
}
