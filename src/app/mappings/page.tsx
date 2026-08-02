import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MappingsManager } from "@/components/mappings-manager";
import { UserMappingsManager } from "@/components/user-mappings-manager";
import { getUserFromCookies } from "@/lib/auth";

export default async function MappingsPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-mappings");

  return (
    <AppShell
      currentPath="/mappings"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-12 px-4 py-8">
        <section>
          <h2 className="mb-2 text-xl font-semibold">Space → client mappings</h2>
          <p className="mb-6 text-sm text-muted">
            Map each Jira space key to a client ID. The webhook receives events for
            all spaces; only mapped and enabled spaces sync.
          </p>
          <MappingsManager authed />
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">
            Jira → Bitmap user mappings
          </h2>
          <p className="mb-6 text-sm text-muted">
            Match Jira worklog <code className="text-xs">author.displayName</code>{" "}
            to Bitmap <code className="text-xs">full_name</code>. Missing mappings
            are created automatically on sync when names match exactly.
          </p>
          <UserMappingsManager authed />
        </section>
      </main>
    </AppShell>
  );
}
