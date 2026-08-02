import { cookies } from "next/headers";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { getUserFromCookies } from "@/lib/auth";

export default async function HomePage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  const isAdmin = user?.role === "admin";

  return (
    <AppShell
      currentPath="/"
      user={user ? { email: user.email, role: user.role } : null}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {!user ? (
          <div className="mb-6 rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <Link href="/login" className="text-accent hover:underline">
              Sign in
            </Link>{" "}
            or{" "}
            <Link href="/register" className="text-accent hover:underline">
              register
            </Link>{" "}
            to manage your mappings.
          </div>
        ) : null}
        <section className="mb-8">
          <h2 className="mb-2 text-xl font-semibold">Dashboard</h2>
          <p className="mb-4 text-sm text-muted">
            Jira Cloud worklog webhooks sync into Bitmap timesheets. Spaces
            without a client mapping are skipped. Users can override project and
            budget via My mappings.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Webhook</p>
              <p className="mt-1 font-mono text-sm">POST /api/webhooks/jira</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Security</p>
              <p className="mt-1 text-sm">Header X-Webhook-Token</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Health</p>
              <p className="mt-1 font-mono text-sm">GET /api/health</p>
            </div>
          </div>
        </section>
        {isAdmin ? (
          <p className="text-sm text-muted">
            View webhook activity on{" "}
            <Link href="/syncs" className="text-accent hover:underline">
              Syncs
            </Link>
            .
          </p>
        ) : user ? (
          <p className="text-sm text-muted">
            Go to{" "}
            <Link href="/my-mappings" className="text-accent hover:underline">
              My mappings
            </Link>{" "}
            to set your project and budget preferences.
          </p>
        ) : null}
      </main>
    </AppShell>
  );
}
