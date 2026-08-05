import { AppShell } from "@/components/app-shell";
import { MappingsManager } from "@/components/mappings-manager";
import { UserMappingsManager } from "@/components/user-mappings-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function MappingsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/mappings"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-12 px-6 py-8">
        <section>
          <PageHeader
            title="Space → client mappings"
            description="Map each Jira space key to a client ID. The webhook receives events for all spaces; only mapped and enabled spaces sync."
          />
          <MappingsManager authed />
        </section>
        <section>
          <PageHeader
            title="Jira → Bitmap user mappings"
            description={
              <>
                Match Jira worklog{" "}
                <code className="font-mono text-xs">author.displayName</code> to
                Bitmap <code className="font-mono text-xs">full_name</code>.
                Missing mappings are created automatically on sync when names
                match exactly.
              </>
            }
          />
          <UserMappingsManager authed />
        </section>
      </main>
    </AppShell>
  );
}
