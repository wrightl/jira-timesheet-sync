import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { UsersManager } from "@/components/users-manager";
import { getUserFromCookies } from "@/lib/auth";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-mappings");

  return (
    <AppShell
      currentPath="/users"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h2 className="mb-2 text-xl font-semibold">Users</h2>
        <p className="mb-6 text-sm text-muted">
          Create and manage application accounts. Admins can change roles and
          reset passwords. You cannot demote or delete your own account, and the
          last admin cannot be removed.
        </p>
        <UsersManager authed currentUserId={user.id} />
      </main>
    </AppShell>
  );
}
