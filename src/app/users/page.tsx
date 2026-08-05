import { AppShell } from "@/components/app-shell";
import { UsersManager } from "@/components/users-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function UsersPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/users"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <PageHeader
          title="Users"
          description="Create and manage application accounts. Admins can change roles and reset passwords. You cannot demote or delete your own account, and the last admin cannot be removed."
        />
        <UsersManager authed currentUserId={user.id} />
      </main>
    </AppShell>
  );
}
