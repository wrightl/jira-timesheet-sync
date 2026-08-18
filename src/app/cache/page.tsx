import { AppShell } from "@/components/app-shell";
import { CacheManager } from "@/components/cache-manager";
import { PageHeader } from "@/components/ui/page-header";
import { PageMain } from "@/components/ui/page-main";
import { requirePageUser } from "@/lib/auth";

export default async function CachePage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/cache"
      user={{ email: user.email, role: user.role }}
    >
      <PageMain>
        <PageHeader
          title="Bitmap API cache"
          description="Inspect cached project and project-budget responses. Invalidate an entry to force a fresh fetch on the next sync."
        />
        <CacheManager authed />
      </PageMain>
    </AppShell>
  );
}
