import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CacheManager } from "@/components/cache-manager";
import { getUserFromCookies } from "@/lib/auth";

export default async function CachePage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/my-mappings");

  return (
    <AppShell
      currentPath="/cache"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h2 className="mb-2 text-xl font-semibold">Bitmap API cache</h2>
        <p className="mb-6 text-sm text-muted">
          Inspect cached project and project-budget responses. Invalidate an entry
          to force a fresh fetch on the next sync.
        </p>
        <CacheManager authed />
      </main>
    </AppShell>
  );
}
