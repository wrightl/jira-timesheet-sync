import { AppShell } from "@/components/app-shell";
import { UsersManager } from "@/components/users-manager";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function UsersPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/users"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Users"
          description="Create and manage application accounts. Admins can change roles and reset passwords. You cannot demote or delete your own account, and the last admin cannot be removed."
        />
        <UsersManager authed currentUserId={user.id} />
      </PageMain>
    </AppShell>
  );
}
