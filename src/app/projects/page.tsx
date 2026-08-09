import { AppShell } from '@/components/app-shell';
import { ProjectProgressDashboard } from '@/components/project-progress-dashboard';
import { PageHeader } from '@/components/ui/page-header';
import { requirePageUser } from '@/lib/auth';

export default async function ProjectsPage() {
    const user = await requirePageUser();

    return (
        <AppShell
            currentPath="/projects"
            user={{ email: user.email, role: user.role }}
        >
            <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
                {/* <PageHeader
          title="Projects"
          description="Budget burn, estimate fidelity, and quality signals for a Bitmap project. Choose a client, then a project. Live Jira Cloud API v3 data is used when configured."
        /> */}
                <ProjectProgressDashboard authed />
            </main>
        </AppShell>
    );
}
