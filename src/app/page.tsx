import { cookies } from "next/headers";
import { AppNav } from "@/components/app-nav";
import { AdminLogin } from "@/components/admin-login";
import { RecentSyncs } from "@/components/recent-syncs";

export default async function HomePage() {
  const cookieStore = await cookies();
  const adminKey = cookieStore.get("admin_api_key")?.value;
  const authed = Boolean(
    adminKey && process.env.ADMIN_API_KEY && adminKey === process.env.ADMIN_API_KEY,
  );

  return (
    <>
      <AppNav currentPath="/" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <AdminLogin initiallyAuthed={authed} />
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Dashboard</h2>
          <p className="mb-4 text-sm text-muted">
            Jira Cloud worklog webhooks sync into the internal PM timesheet API.
            Spaces without a project mapping are skipped (integration listens to
            all spaces by default).
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Webhook</p>
              <p className="mt-1 font-mono text-sm">POST /api/webhooks/jira</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Security</p>
              <p className="mt-1 text-sm">HMAC SHA-256 (X-Hub-Signature)</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Health</p>
              <p className="mt-1 font-mono text-sm">GET /api/health</p>
            </div>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-base font-semibold">Recent syncs</h3>
          <RecentSyncs authed={authed} />
        </section>
      </main>
    </>
  );
}
