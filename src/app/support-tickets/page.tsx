import { AppShell } from "@/components/app-shell";
import { SupportTicketsContent } from "@/components/support-tickets-content";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function SupportTicketsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/support-tickets"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        <PageHeader
          title="Support Tickets"
          description="View support tickets from the support desk Jira space and key metrics."
        />
        <SupportTicketsContent />
      </main>
    </AppShell>
  );
}
