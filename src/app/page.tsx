import { cookies } from 'next/headers';
import Link from 'next/link';
import { AdminDashboard } from '@/components/admin-dashboard';
import { AppShell } from '@/components/app-shell';
import { UserDashboard } from '@/components/user-dashboard';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { getUserFromCookies } from '@/lib/auth';
import {
    emptyDashboardStats,
    getDashboardStats,
    parseDashboardRange,
} from '@/lib/dashboard-stats';

export default async function HomePage({
    searchParams,
}: {
    searchParams: Promise<{ range?: string }>;
}) {
    const cookieStore = await cookies();
    const user = await getUserFromCookies(cookieStore);
    const isAdmin = user?.role === 'admin';
    const params = await searchParams;
    const range = parseDashboardRange(params.range);

    let stats = null;
    let statsError: string | null = null;

    if (user) {
        try {
            stats = await getDashboardStats({
                range,
                scope: isAdmin
                    ? { type: 'all' }
                    : {
                          type: 'user',
                          userId: user.id,
                          userEmail: user.email,
                      },
            });
        } catch (err) {
            console.error('[dashboard] Failed to load stats', err);
            statsError =
                'Could not load dashboard metrics. Check the database connection and try refreshing.';
            stats = emptyDashboardStats(range, isAdmin ? 'all' : 'user');
        }
    }

    return (
        <AppShell
            currentPath="/"
            user={user ? { email: user.email, role: user.role } : null}
        >
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                {!user ? (
                    <Alert className="mb-6">
                        <Link
                            href="/login"
                            className="text-accent hover:underline"
                        >
                            Sign in
                        </Link>{' '}
                        or{' '}
                        <Link
                            href="/register"
                            className="text-accent hover:underline"
                        >
                            register
                        </Link>{' '}
                        to manage your mappings.
                    </Alert>
                ) : null}

                {statsError ? (
                    <Alert variant="error" className="mb-6">
                        {statsError}
                    </Alert>
                ) : null}

                {isAdmin && stats ? (
                    <>
                        {/* <PageHeader
              title="Dashboard"
              description="Ops overview for Jira → Bitmap worklog sync: volume, failures, skip reasons, and mapping health."
            /> */}
                        <AdminDashboard stats={stats} range={range} />
                    </>
                ) : user && stats ? (
                    <>
                        {/* <PageHeader
              title="Dashboard"
              description="Your Jira → Bitmap sync activity: volume, failures, skip reasons, and mapping coverage."
            /> */}
                        <UserDashboard stats={stats} range={range} />
                    </>
                ) : (
                    <>
                        {/* <PageHeader
              title="Dashboard"
              description="Jira Cloud worklog webhooks sync into Bitmap timesheets. Spaces without a client mapping are skipped. Users can override project and budget via My mappings."
            /> */}
                        <div className="grid gap-3 sm:grid-cols-3">
                            <Card>
                                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                                    Webhook
                                </p>
                                <p className="mt-1.5 font-mono text-sm text-foreground">
                                    POST /api/webhooks/jira
                                </p>
                            </Card>
                            <Card>
                                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                                    Security
                                </p>
                                <p className="mt-1.5 text-sm text-foreground">
                                    Header X-Webhook-Token
                                </p>
                            </Card>
                            <Card>
                                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
                                    Health
                                </p>
                                <p className="mt-1.5 font-mono text-sm text-foreground">
                                    GET /api/health
                                </p>
                            </Card>
                        </div>
                    </>
                )}
            </main>
        </AppShell>
    );
}
