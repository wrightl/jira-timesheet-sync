import { AppShell } from "@/components/app-shell";
import { PortfolioDashboard } from "@/components/portfolio-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function PortfolioPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/portfolio"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        <PageHeader
          title="Portfolio"
          description="Cross-client project health for engineering managers and heads of engineering."
        />
        <PortfolioDashboard authed />
      </main>
    </AppShell>
  );
}
