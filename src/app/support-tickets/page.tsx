import { AppShell } from "@/components/app-shell";
import { SupportTicketsContent } from "@/components/support-tickets-content";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function SupportTicketsPage() {
  const user = await requirePageUser();

  return (
    <AppShell
      currentPath="/support-tickets"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Support Tickets"
          description="View support tickets from the support desk Jira space and key metrics."
        />
        <SupportTicketsContent />
      </PageMain>
    </AppShell>
  );
}
