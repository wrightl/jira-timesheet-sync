import { AppShell } from "@/components/app-shell";
import { CacheManager } from "@/components/cache-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requirePageUser } from "@/lib/auth";

export default async function CachePage() {
  const user = await requirePageUser({ role: "admin" });

  return (
    <AppShell
      currentPath="/cache"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <PageHeader
          title="Bitmap API cache"
          description="Inspect cached project and project-budget responses. Invalidate an entry to force a fresh fetch on the next sync."
        />
        <CacheManager authed />
      </main>
    </AppShell>
  );
}
