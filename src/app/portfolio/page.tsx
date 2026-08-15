import { AppShell } from "@/components/app-shell";
import { PortfolioDashboard } from "@/components/portfolio-dashboard";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function PortfolioPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/portfolio"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Portfolio"
          description="Cross-client project health for engineering managers and heads of engineering."
        />
        <PortfolioDashboard authed />
      </PageMain>
    </AppShell>
  );
}
