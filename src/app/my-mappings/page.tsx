import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { MyMappingsManager } from "@/components/my-mappings-manager";
import { getUserFromCookies } from "@/lib/auth";

export default async function MyMappingsPage() {
  const cookieStore = await cookies();
  const user = await getUserFromCookies(cookieStore);
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell
      currentPath="/my-mappings"
      user={{ email: user.email, role: user.role }}
    >
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h2 className="mb-2 text-xl font-semibold">My project mappings</h2>
        <p className="mb-6 text-sm text-muted">
          Map each Jira space to a Bitmap project and budget for your timesheets.
          Your login email must match your Bitmap user email for sync to apply
          these overrides.
        </p>
        <MyMappingsManager authed />
      </main>
    </AppShell>
  );
}
