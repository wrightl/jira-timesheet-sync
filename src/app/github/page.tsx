import { AppShell } from "@/components/app-shell";
import { GithubDashboard } from "@/components/github-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function GithubPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/github"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <PageHeader
          title="GitHub"
          description="Cross-repository pull request metrics for your configured GitHub organization."
        />
        <GithubDashboard authed />
      </main>
    </AppShell>
  );
}
