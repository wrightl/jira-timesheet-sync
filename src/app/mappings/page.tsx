import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { AdminLogin } from "@/components/admin-login";
import { MappingsManager } from "@/components/mappings-manager";

export default async function MappingsPage() {
  const cookieStore = await cookies();
  const adminKey = cookieStore.get("admin_api_key")?.value;
  const authed = Boolean(
    adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY,
  );

  return (
    <>
      <AppNav currentPath="/mappings" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <AdminLogin initiallyAuthed={authed} />
        <h2 className="mb-2 text-xl font-semibold">Space → client mappings</h2>
        <p className="mb-6 text-sm text-muted">
          Map each Jira space key to a client ID. The webhook receives events for
          all spaces; only mapped and enabled spaces sync.
        </p>
        <MappingsManager authed={authed} />
      </main>
    </>
  );
}
