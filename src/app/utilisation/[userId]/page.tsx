import { AppShell } from "@/components/app-shell";
import { UtilisationPersonDashboard } from "@/components/utilisation-person-dashboard";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function UtilisationPersonPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ rangeDays?: string }>;
}) {
  const user = await requirePageUser();
  const { userId } = await params;
  const { rangeDays } = await searchParams;

  return (
    <AppShell
      currentPath="/utilisation"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <UtilisationPersonDashboard
          authed
          userId={userId}
          initialRangeDays={rangeDays ?? "7"}
        />
      </PageMain>
    </AppShell>
  );
}
