import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RecentSyncs } from "@/components/recent-syncs";
import { getUserFromCookies } from "@/lib/auth";

export default async function SyncsPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-mappings");

  return (
    <AppShell
      currentPath="/syncs"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h2 className="mb-2 text-xl font-semibold">Syncs</h2>
        <p className="mb-6 text-sm text-muted">
          Recent Jira worklog webhook events and their Bitmap sync status.
          Retry failed or skipped events when a stored payload is available.
        </p>
        <RecentSyncs authed />
      </main>
    </AppShell>
  );
}
