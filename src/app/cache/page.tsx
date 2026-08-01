import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { AdminLogin } from "@/components/admin-login";
import { CacheManager } from "@/components/cache-manager";

export default async function CachePage() {
  const cookieStore = await cookies();
  const adminKey = cookieStore.get("admin_api_key")?.value;
  const authed = Boolean(
    adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY,
  );

  return (
    <>
      <AppNav currentPath="/cache" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <AdminLogin initiallyAuthed={authed} />
        <h2 className="mb-2 text-xl font-semibold">Bitmap API cache</h2>
        <p className="mb-6 text-sm text-muted">
          Inspect cached project and project-budget responses. Invalidate an entry
          to force a fresh fetch on the next sync.
        </p>
        <CacheManager authed={authed} />
      </main>
    </>
  );
}
