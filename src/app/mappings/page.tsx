import { AppShell } from "@/components/app-shell";
import { MappingsManager } from "@/components/mappings-manager";
import { UserMappingsManager } from "@/components/user-mappings-manager";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function MappingsPage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/mappings"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain className="space-y-12">
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
      </PageMain>
    </AppShell>
  );
}
