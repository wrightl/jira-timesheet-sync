import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { AdminLogin } from "@/components/admin-login";
import { MappingsManager } from "@/components/mappings-manager";
import { UserMappingsManager } from "@/components/user-mappings-manager";

export default async function MappingsPage() {
  const cookieStore = await cookies();
  const adminKey = cookieStore.get("admin_api_key")?.value;
  const authed = Boolean(
    adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY,
  );

  return (
    <>
      <AppNav currentPath="/mappings" />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-12 px-4 py-8">
        <AdminLogin initiallyAuthed={authed} />
        <section>
          <h2 className="mb-2 text-xl font-semibold">Space → client mappings</h2>
          <p className="mb-6 text-sm text-muted">
            Map each Jira space key to a client ID. The webhook receives events for
            all spaces; only mapped and enabled spaces sync.
          </p>
          <MappingsManager authed={authed} />
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
          <UserMappingsManager authed={authed} />
        </section>
      </main>
    </>
  );
}
